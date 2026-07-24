#!/usr/bin/bash

# Loads all OpenStreetMap nodes from the AWS Open Data ORC export of the planet
# (https://registry.opendata.aws/osm/, updated weekly) into the `osm_mercator` table.
# The tables must exist already: clickhouse-client < osm-setup.sql
#
# The download happens entirely on the server side: ClickHouse reads the ORC file
# from S3 with parallel range requests, so nothing is stored locally.
# Nodes with latitudes outside the Web Mercator displayable range (±85.0511°)
# are skipped — they cannot be shown on the map anyway.
#
# To reload from scratch:
#   TRUNCATE TABLE osm_mercator; TRUNCATE TABLE osm_mercator_sample10; TRUNCATE TABLE osm_mercator_sample100;

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO osm_mercator (id, lat, lon, timestamp, changeset, uid, user, version, tags)
SELECT
    toUInt64(id),
    toFloat64(lat),
    toFloat64(lon),
    toDateTime(timestamp),
    toUInt64(greatest(changeset, 0)),
    toUInt32(greatest(uid, 0)),
    user,
    toUInt32(greatest(version, 0)),
    tags
FROM s3('https://osm-pds.s3.amazonaws.com/planet/planet-latest.orc', 'ORC', '
    id Int64,
    type LowCardinality(String),
    tags Map(String, String),
    lat Nullable(Decimal(9,7)),
    lon Nullable(Decimal(10,7)),
    changeset Int64,
    timestamp DateTime64(9),
    uid Int64,
    user String,
    version Int64')
WHERE type = 'node'
    AND lat IS NOT NULL AND lon IS NOT NULL
    AND lat > -85.0511 AND lat < 85.0511
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912,
    input_format_orc_filter_push_down = 1
" || exit 1
