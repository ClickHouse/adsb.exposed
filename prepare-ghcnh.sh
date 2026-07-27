#!/usr/bin/bash
# Loads GHCNh (current replacement for retired ISD) into ghcnh_mercator.
# GHCNh has no S3/glob/combined file, so we enumerate the ~38,870 stations from the
# station list and fetch by-year PSV files in brace-list batches (url() skips 404
# members, i.e. stations not active that year). Recent-window only (history lives in
# the isd_mercator archive). Internally parallel across batches.
source ~/.clickhouse-planes.env 2>/dev/null
BYYEAR="https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/access/by-year"
IDS_FILE=/tmp/ghcnh_ids.txt
FROM_YEAR="${FROM_YEAR:-2020}"
TO_YEAR="${TO_YEAR:-2026}"
BATCH=400
POOL=8
STRUCT='STATION String, Station_name String, DATE DateTime64(0), LATITUDE Float64, LONGITUDE Float64, ELEVATION Nullable(Float64), temperature Nullable(Float64), dew_point_temperature Nullable(Float64), station_level_pressure Nullable(Float64), sea_level_pressure Nullable(Float64), wind_direction Nullable(Float64), wind_speed Nullable(Float64), wind_gust Nullable(Float64), precipitation Nullable(Float64), relative_humidity Nullable(Float64), wet_bulb_temperature Nullable(Float64), snow_depth Nullable(Float64), visibility Nullable(Float64), ceiling_height Nullable(Float64), pressure_3hr_change Nullable(Float64), sky_cover_summation_1 String, sky_cover_summation_2 String, sky_cover_summation_3 String, sky_cover_summation_4 String, pres_wx_MW1 String'

insert_batch() {  # $1=year  $2=comma-ids
  clickhouse-client --host "$CLICKHOUSE_PLANES_HOST" --secure --user "$CLICKHOUSE_PLANES_USER" --password "$CLICKHOUSE_PLANES_PASSWORD" --query "
INSERT INTO ghcnh_mercator
SELECT DATE, LATITUDE, LONGITUDE, STATION, Station_name, ELEVATION,
  temperature, dew_point_temperature, sea_level_pressure, station_level_pressure,
  CAST(wind_direction AS Nullable(Int16)), wind_speed, wind_gust,
  visibility, CAST(ceiling_height AS Nullable(Int32)),
  if(sky_cover_summation_1='' AND sky_cover_summation_2='' AND sky_cover_summation_3='' AND sky_cover_summation_4='', NULL,
     greatest(toUInt8OrZero(extract(sky_cover_summation_1,':(\\d+)')), toUInt8OrZero(extract(sky_cover_summation_2,':(\\d+)')),
              toUInt8OrZero(extract(sky_cover_summation_3,':(\\d+)')), toUInt8OrZero(extract(sky_cover_summation_4,':(\\d+)'))) / 8.0 * 100),
  precipitation, snow_depth, relative_humidity, wet_bulb_temperature, pressure_3hr_change, pres_wx_MW1
FROM url('$BYYEAR/$1/psv/GHCNh_{$2}_$1.psv', 'CSVWithNames', '$STRUCT')
WHERE LATITUDE BETWEEN -90 AND 90 AND LONGITUDE BETWEEN -180 AND 180
SETTINGS format_csv_delimiter='|', input_format_skip_unknown_fields=1, input_format_allow_errors_ratio=0.05,
  max_download_threads=8, max_insert_threads=4, max_http_get_redirects=3"
}

process() {  # $1=year $2=ids ; retry
  for a in 1 2 3; do insert_batch "$1" "$2" && return 0; sleep 5; done
  echo "BATCH_FAILED year=$1" >&2
}

# Refresh the station list (~38,870 stations) if missing.
if [ ! -s "$IDS_FILE" ]; then
  clickhouse-client --host "$CLICKHOUSE_PLANES_HOST" --secure --user "$CLICKHOUSE_PLANES_USER" --password "$CLICKHOUSE_PLANES_PASSWORD" \
    --query "SELECT GHCN_ID FROM url('https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.csv','CSVWithNames') WHERE GHCN_ID != '' ORDER BY GHCN_ID FORMAT TSV" > "$IDS_FILE"
fi

mapfile -t ALL < "$IDS_FILE"
n=${#ALL[@]}
running=0
for ((y=FROM_YEAR; y<=TO_YEAR; y++)); do
  echo "=== year $y ==="
  for ((i=0; i<n; i+=BATCH)); do
    ids=$(printf "%s," "${ALL[@]:i:BATCH}"); ids=${ids%,}
    process "$y" "$ids" &
    running=$((running+1))
    if (( running >= POOL )); then wait -n 2>/dev/null || wait; running=$((running-1)); fi
  done
  wait; running=0
  echo "year $y done"
done
echo "ALL YEARS DONE ($FROM_YEAR..$TO_YEAR)"
