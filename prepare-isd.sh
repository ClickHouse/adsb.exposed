#!/usr/bin/bash

# Loads NOAA ISD hourly surface weather from AWS Open Data
# (https://registry.opendata.aws/noaa-global-hourly/) into isd_mercator. Server-side read.
# The tables must exist already: clickhouse-client < isd-setup.sql
#
# Default range is 2000..current (the era of dense global coverage, ~3B rows). Override with
#   FROM_YEAR=1973 TO_YEAR=2026 ./prepare-isd.sh
#
# Everything is read as String (so no row fails to parse) and each ISD code field is decoded
# into its typed column; missing-value sentinels (9999/99999/999999) become NULL. Only rows
# whose coordinates cannot be parsed are dropped, to keep as much of the source as possible.

FROM_YEAR="${FROM_YEAR:-2000}"
TO_YEAR="${TO_YEAR:-2026}"

SCHEMA='STATION String, DATE String, SOURCE String, LATITUDE String, LONGITUDE String, ELEVATION String, NAME String, REPORT_TYPE String, CALL_SIGN String, QUALITY_CONTROL String, WND String, CIG String, VIS String, TMP String, DEW String, SLP String, AA1 String, AA2 String, AA3 String, AJ1 String, AY1 String, AY2 String, GA1 String, GA2 String, GA3 String, GE1 String, GF1 String, IA1 String, KA1 String, KA2 String, MA1 String, MD1 String, MW1 String, OC1 String, OD1 String, SA1 String, UA1 String, REM String, EQD String'

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO isd_mercator
(timestamp, lat, lon, station, name, elevation, report_type, call_sign, quality_control,
 wind_direction, wind_speed, wind_gust, temperature, dew_point, pressure, station_pressure,
 visibility, ceiling, cloud_cover, cloud_base, precipitation, snow_depth, sea_surface_temp,
 present_weather, pressure_tendency)
SELECT
    parseDateTimeBestEffortOrZero(DATE) AS timestamp,
    toFloat64OrZero(LATITUDE) AS lat,
    toFloat64OrZero(LONGITUDE) AS lon,
    STATION AS station,
    NAME AS name,
    nullIf(toFloat32OrNull(ELEVATION), 9999) AS elevation,
    REPORT_TYPE AS report_type, CALL_SIGN AS call_sign, QUALITY_CONTROL AS quality_control,
    nullIf(toInt16OrNull(splitByChar(',', WND)[1]), 999) AS wind_direction,
    nullIf(toInt32OrNull(splitByChar(',', WND)[4]), 9999) / 10.0 AS wind_speed,
    if(OC1 = '', NULL, nullIf(toInt32OrNull(splitByChar(',', OC1)[1]), 9999) / 10.0) AS wind_gust,
    nullIf(toInt32OrNull(splitByChar(',', TMP)[1]), 9999) / 10.0 AS temperature,
    nullIf(toInt32OrNull(splitByChar(',', DEW)[1]), 9999) / 10.0 AS dew_point,
    nullIf(toInt32OrNull(splitByChar(',', SLP)[1]), 99999) / 10.0 AS pressure,
    if(MA1 = '', NULL, nullIf(toInt32OrNull(splitByChar(',', MA1)[3]), 99999) / 10.0) AS station_pressure,
    nullIf(toInt32OrNull(splitByChar(',', VIS)[1]), 999999) / 1000.0 AS visibility,
    nullIf(toInt32OrNull(splitByChar(',', CIG)[1]), 99999) AS ceiling,
    multiIf(GA1 = '', NULL, splitByChar(',', GA1)[1] = '99', NULL, least(toInt32OrZero(splitByChar(',', GA1)[1]), 8) / 8.0 * 100) AS cloud_cover,
    if(GA1 = '', NULL, nullIf(toInt32OrNull(splitByChar(',', GA1)[3]), 99999)) AS cloud_base,
    multiIf(AA1 = '', NULL, splitByChar(',', AA1)[2] = '9999', NULL,
        toFloat32(toInt32OrZero(splitByChar(',', AA1)[2])) / 10.0 / greatest(toInt32OrZero(splitByChar(',', AA1)[1]), 1)) AS precipitation,
    if(AJ1 = '', NULL, nullIf(toInt32OrNull(splitByChar(',', AJ1)[1]), 9999)) AS snow_depth,
    if(SA1 = '', NULL, nullIf(toInt32OrNull(splitByChar(',', SA1)[1]), 9999) / 10.0) AS sea_surface_temp,
    if(MW1 = '', NULL, toInt16OrNull(splitByChar(',', MW1)[1])) AS present_weather,
    multiIf(MD1 = '', NULL, splitByChar(',', MD1)[3] IN ('999', ''), NULL,
        toFloat32(toInt32OrZero(splitByChar(',', MD1)[3])) / 10.0 * if(toInt32OrZero(splitByChar(',', MD1)[1]) >= 5, -1, 1)) AS pressure_tendency
FROM s3('https://noaa-global-hourly-pds.s3.amazonaws.com/{${FROM_YEAR}..${TO_YEAR}}/*.csv', 'CSVWithNames', '${SCHEMA}')
WHERE toFloat64OrNull(LATITUDE) IS NOT NULL AND toFloat64OrNull(LONGITUDE) IS NOT NULL
    AND toFloat64OrNull(LATITUDE) BETWEEN -90 AND 90
    AND toFloat64OrNull(LONGITUDE) BETWEEN -180 AND 180
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    input_format_allow_errors_ratio = 0.1,
    schema_inference_make_columns_nullable = 0,
    input_format_skip_unknown_fields = 1,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1

# Build the per-station climatology (mean temperature/wind/pressure per station).
clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --query "
TRUNCATE TABLE isd_stations;
INSERT INTO isd_stations (station, lat, lon, name, temperature, wind_speed, pressure, obs)
SELECT station, lat, lon, name, t, ifNull(w, 0), ifNull(p, 0), obs
FROM (
    SELECT station, avg(lat) AS lat, avg(lon) AS lon, any(name) AS name,
        avgIf(temperature, isNotNull(temperature)) AS t,
        avgIf(wind_speed, isNotNull(wind_speed)) AS w,
        avgIf(pressure, isNotNull(pressure)) AS p,
        count() AS obs
    FROM isd_mercator GROUP BY station
)
WHERE isNotNull(t) AND abs(lat) > 0.01 AND abs(lon) > 0.01
SETTINGS max_threads = 48
" || exit 1
