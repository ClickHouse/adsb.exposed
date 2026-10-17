#!/bin/bash

# Generates table-metadata.json, the definition of the tables for `aws s3tables create-table --metadata`,
# from the CREATE TABLE statement of planes_mercator in setup.sql:
# clickhouse-local creates the table as a local Iceberg table, and its schema and sort order are converted
# to the format of the S3 Tables API. Requires clickhouse and jq.

set -e

DIR=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sed -n '/^CREATE TABLE iceberg\.`adsb\.planes_mercator`$/,/^ORDER BY (mercator_morton, time);$/p' "$DIR/setup.sql" \
    | sed -e 's/^CREATE TABLE iceberg\.`adsb\.planes_mercator`$/CREATE TABLE planes_mercator/' \
          -e "s|^ENGINE = IcebergS3.*|ENGINE = IcebergLocal('planes_mercator/')|" \
    > "$TMP/create.sql"

# clickhouse-local allows only the paths inside the current directory.
(cd "$TMP" && clickhouse local --allow_insert_into_iceberg 1 --queries-file create.sql)

jq '{
    iceberg: {
        schemaV2: {
            type: "struct",
            schemaId: .schemas[0]."schema-id",
            fields: [.schemas[0].fields[] | {
                id, name,
                # ClickHouse adds a non-standard "required" key to the list type.
                type: (if (.type | type) == "object" then .type | del(.required) else .type end),
                required
            }]
        },
        writeOrder: (.["sort-orders"][] | select(."order-id" != 0) | {
            orderId: ."order-id",
            fields: [.fields[] | {sourceId: ."source-id", transform, direction, nullOrder: ."null-order"}]
        })
    }
}' "$TMP/planes_mercator/metadata/v1.metadata.json" > "$DIR/table-metadata.json"

echo "Written $DIR/table-metadata.json"
