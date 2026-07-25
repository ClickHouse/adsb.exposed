#!/usr/bin/bash

# Loads NOAA ISD hourly surface weather from AWS Open Data
# (https://registry.opendata.aws/noaa-global-hourly/) into isd_mercator. Server-side read.
# The tables must exist already: clickhouse-client < isd-setup.sql
#
# Default range is 2000..2024 (the era of dense global coverage, ~3B rows). Extend it with
#   FROM_YEAR=1973 TO_YEAR=2024 ./prepare-isd.sh
# The packed fields are decoded here: TMP/WND/SLP carry a value and a quality flag,
# with 9999-style sentinels for "missing" that we turn into NULL.

FROM_YEAR="${FROM_YEAR:-2000}"
TO_YEAR="${TO_YEAR:-2024}"

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO isd_mercator (timestamp, lat, lon, station, name, elevation, temperature, wind_speed, pressure)
SELECT
    toDateTime(DATE) AS timestamp,
    LATITUDE AS lat,
    LONGITUDE AS lon,
    STATION AS station,
    NAME AS name,
    toFloat32(ELEVATION) AS elevation,
    nullIf(toInt32OrNull(splitByChar(',', TMP)[1]), 9999) / 10.0 AS temperature,
    nullIf(toInt32OrNull(splitByChar(',', WND)[4]), 9999) / 10.0 AS wind_speed,
    nullIf(toInt32OrNull(splitByChar(',', SLP)[1]), 99999) / 10.0 AS pressure
FROM s3('https://noaa-global-hourly-pds.s3.amazonaws.com/{${FROM_YEAR}..${TO_YEAR}}/*.csv', 'CSVWithNames',
        'STATION String, DATE DateTime, SOURCE String, LATITUDE Float64, LONGITUDE Float64, ELEVATION Float32, NAME String, REPORT_TYPE String, CALL_SIGN String, QUALITY_CONTROL String, WND String, CIG String, VIS String, TMP String, DEW String, SLP String')
WHERE LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
    AND LATITUDE > -85.0511 AND LATITUDE < 85.0511
    AND LONGITUDE >= -180 AND LONGITUDE <= 180
    AND abs(LATITUDE) > 0.01
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    input_format_allow_errors_ratio = 0.05,
    schema_inference_make_columns_nullable = 0,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1
