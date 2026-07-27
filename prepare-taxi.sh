#!/usr/bin/bash

# Loads NYC taxi trips (with coordinates) into taxi_mercator from the coordinate-bearing
# archive in ClickHouse's public datasets bucket. Server-side read of a single ~65 GB
# xz-compressed TSV, so it is single-stream and slower than the parquet loads — expect a
# long run. The tables must exist already: clickhouse-client < taxi-setup.sql
#
# TSV columns are positional (no header); the coordinate/datetime columns are cN below.

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO taxi_mercator
    (lat, lon, pickup_datetime, dropoff_datetime, dropoff_lat, dropoff_lon,
     passenger_count, trip_distance, fare_amount, tip_amount)
SELECT
    toFloat64(c10) AS lat,
    toFloat64(c9) AS lon,
    parseDateTimeBestEffortOrZero(c4, 'America/New_York') AS pickup_datetime,
    parseDateTimeBestEffortOrZero(c6, 'America/New_York') AS dropoff_datetime,
    toFloat64(c12) AS dropoff_lat,
    toFloat64(c11) AS dropoff_lon,
    toUInt8OrZero(c13) AS passenger_count,
    toFloat32OrZero(c14) AS trip_distance,
    toFloat32OrZero(c15) AS fare_amount,
    toFloat32OrZero(c18) AS tip_amount
FROM url('https://clickhouse-public-datasets.s3.amazonaws.com/trips_mergetree/tsv/trips_mergetree.tsv.xz', 'TSV',
            'c1 String, c2 String, c3 String, c4 String, c5 String, c6 String, c7 String, c8 String, c9 String, c10 String, c11 String, c12 String, c13 String, c14 String, c15 String, c16 String, c17 String, c18 String, c19 String, c20 String, c21 String, c22 String, c23 String, c24 String, c25 String, c26 String, c27 String, c28 String, c29 String, c30 String, c31 String, c32 String, c33 String, c34 String, c35 String, c36 String, c37 String, c38 String, c39 String, c40 String, c41 String, c42 String, c43 String, c44 String, c45 String, c46 String, c47 String')
WHERE toFloat64(c9) > -75 AND toFloat64(c9) < -71
    AND toFloat64(c10) > 40 AND toFloat64(c10) < 42
SETTINGS
    max_threads = 32,
    max_insert_threads = 16,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1
