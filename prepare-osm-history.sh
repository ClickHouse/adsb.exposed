#!/usr/bin/bash

# Loads all historical OpenStreetMap node versions from the AWS Open Data full-history
# ORC export (https://registry.opendata.aws/osm/) into osm_history_mercator.
# The tables must exist already: clickhouse-client < osm-history-setup.sql
# The read happens entirely server-side; nothing is stored locally.
# ~2x the size of the current-snapshot load.

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO osm_history_mercator (id, lat, lon, timestamp, changeset, uid, user, version, visible, tags)
SELECT
    toUInt64(id),
    toFloat64(lat),
    toFloat64(lon),
    toDateTime(timestamp),
    toUInt64(greatest(changeset, 0)),
    toUInt32(greatest(uid, 0)),
    user,
    toUInt32(greatest(version, 0)),
    visible,
    tags
FROM s3('https://osm-pds.s3.amazonaws.com/planet-history/history-latest.orc', 'ORC', '
    id Int64,
    type LowCardinality(String),
    tags Map(String, String),
    lat Nullable(Decimal(9,7)),
    lon Nullable(Decimal(10,7)),
    changeset Int64,
    timestamp DateTime64(9),
    uid Int64,
    user String,
    version Int64,
    visible Bool')
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
