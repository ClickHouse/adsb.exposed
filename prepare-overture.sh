#!/usr/bin/bash

# Loads Overture Maps building centroids from the monthly AWS Open Data release
# (https://docs.overturemaps.org/) into overture_mercator. Read is entirely server-side.
# The tables must exist already: clickhouse-client < overture-setup.sql
#
# Update RELEASE to the newest release/<date>.N/ prefix in the bucket.

RELEASE="${RELEASE:-2026-07-22.0}"

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO overture_mercator (lat, lon, name, class, subtype, height, num_floors, roof_shape)
SELECT
    (bbox.ymin + bbox.ymax) / 2 AS lat,
    (bbox.xmin + bbox.xmax) / 2 AS lon,
    ifNull(names.primary, '') AS name,
    ifNull(class, '') AS class,
    ifNull(subtype, '') AS subtype,
    toFloat32(ifNull(height, 0)) AS height,
    toInt16(ifNull(num_floors, 0)) AS num_floors,
    ifNull(roof_shape, '') AS roof_shape
FROM s3('https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${RELEASE}/theme=buildings/type=building/*.parquet', 'Parquet')
WHERE (bbox.ymin + bbox.ymax) / 2 > -85.0511 AND (bbox.ymin + bbox.ymax) / 2 < 85.0511
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1
