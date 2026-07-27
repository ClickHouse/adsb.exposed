#!/usr/bin/bash

# Loads NASA FIRMS active-fire detections (VIIRS S-NPP) into firms_mercator, server-side:
# ClickHouse fetches each per-country CSV directly from the FIRMS archive via url().
# The tables must exist already: clickhouse-client < firms-setup.sql
#
# Country coverage is a curated list of the highest-fire-activity countries (below), for the
# years in YEARS. FIRMS has no machine-readable country index, so a country/year with no file
# simply 404s and is skipped + logged. Extend COUNTRIES / YEARS to widen coverage.

YEARS="${YEARS:-2023 2024}"

COUNTRIES=(
Brazil United_States Australia Russia Canada China India Indonesia
Democratic_Republic_of_the_Congo Angola Zambia Mozambique Tanzania Argentina
Bolivia Paraguay Mexico Colombia Venezuela Peru South_Africa Sudan South_Sudan
Central_African_Republic Chad Nigeria Cameroon Ethiopia Kenya Madagascar Myanmar
Thailand Laos Cambodia Vietnam Kazakhstan Mongolia Ukraine Spain Portugal France
Italy Greece Turkey Algeria Morocco Iran Afghanistan Pakistan Chile Guinea Mali
Burkina_Faso Ghana Zimbabwe Botswana Namibia Malawi Uganda Somalia Nepal
Philippines Malaysia Papua_New_Guinea New_Zealand Uruguay Ecuador Guatemala
Honduras Nicaragua Cuba Japan Germany Poland Sweden Finland Romania Serbia
Syria Iraq Saudi_Arabia Yemen Egypt Libya Tunisia Senegal Benin Togo Niger
Gabon Republic_of_the_Congo Sri_Lanka Bangladesh Uzbekistan Azerbaijan
)

STRUCT='latitude Float64, longitude Float64, bright_ti4 Float32, scan Float32, track Float32, acq_date Date, acq_time String, satellite String, instrument String, confidence String, version String, bright_ti5 Float32, frp Float32, daynight String, type String'

for year in $YEARS; do
  for country in "${COUNTRIES[@]}"; do
    url="https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/${year}/viirs-snpp_${year}_${country}.csv"
    clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
        --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
        --query "
    INSERT INTO firms_mercator (timestamp, acq_date, lat, lon, brightness, frp, confidence, daynight, satellite, country)
    SELECT
        parseDateTimeBestEffortOrZero(toString(acq_date) || ' ' || leftPad(acq_time, 4, '0')) AS timestamp,
        acq_date, latitude, longitude, bright_ti4, frp, confidence, daynight, satellite, '${country}'
    FROM url('${url}', 'CSVWithNames', '${STRUCT}')
    WHERE latitude BETWEEN -85.0511 AND 85.0511 AND longitude BETWEEN -180 AND 180
    SETTINGS max_threads = 8, max_http_get_redirects = 5
    " 2>/dev/null && echo "OK ${year} ${country}" || echo "MISS ${year} ${country}"
  done
done
echo "firms load finished"
