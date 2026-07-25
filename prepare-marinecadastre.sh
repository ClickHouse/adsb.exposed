#!/usr/bin/bash

# Backfills the Ships dataset with historical US-coastal AIS from NOAA MarineCadastre
# (https://marinecadastre.gov/ais/, public domain), labelled data_source = 'marinecadastre'
# so it can be told apart from the live aishub feed (data_source = 'aishub').
#
# Data comes as one zipped CSV per day from coast.noaa.gov. Each day is downloaded,
# unzipped, inserted server-side via remoteSecure(), and deleted — so local disk use
# stays bounded regardless of the date range. Runs several days concurrently.
#
# Range is configurable:  START=2024-01-01 END=2024-12-31 ./prepare-marinecadastre.sh
# Days that fail to download or parse are logged and skipped, not fatal.

START="${START:-2024-01-01}"
END="${END:-2024-12-31}"
PAR="${PAR:-6}"
WORK="${WORK:-/tmp/mc_work}"
mkdir -p "$WORK"

export CLICKHOUSE_PLANES_HOST CLICKHOUSE_PLANES_USER CLICKHOUSE_PLANES_PASSWORD WORK

load_day() {
    local d="$1"
    local y="${d:0:4}"
    local f="AIS_${d//-/_}"
    local url="https://coast.noaa.gov/htdata/CMSP/AISDataHandler/${y}/${f}.zip"
    local zip="${WORK}/${f}.zip"
    local csv="${WORK}/${f}.csv"

    curl -sfS "$url" -o "$zip" || { echo "MISS download $d"; rm -f "$zip"; return 0; }
    unzip -o -q "$zip" -d "$WORK" || { echo "MISS unzip $d"; rm -f "$zip" "$csv"; return 0; }
    rm -f "$zip"

    clickhouse-local --query "
    INSERT INTO FUNCTION remoteSecure('${CLICKHOUSE_PLANES_HOST}', 'default.ais_mercator', '${CLICKHOUSE_PLANES_USER}', '${CLICKHOUSE_PLANES_PASSWORD}')
        (timestamp, lat, lon, mmsi, sog, cog, heading, nav_status, msg_type, data_source)
    SELECT
        toDateTime(parseDateTimeBestEffort(BaseDateTime)) AS timestamp,
        LAT AS lat, LON AS lon, MMSI AS mmsi, SOG AS sog, COG AS cog,
        toUInt16(round(Heading)) AS heading,
        toUInt8(ifNull(toUInt8OrNull(Status), 15)) AS nav_status,
        0 AS msg_type,
        'marinecadastre' AS data_source
    FROM file('${csv}', CSVWithNames, '
        MMSI Int64, BaseDateTime String, LAT Float64, LON Float64, SOG Float64, COG Float32,
        Heading Float64, VesselName String, IMO String, CallSign String, VesselType String,
        Status String, Length String, Width String, Draft String, Cargo String, TransceiverClass String')
    WHERE LAT BETWEEN -85.0511 AND 85.0511 AND LON BETWEEN -180 AND 180
    SETTINGS max_threads = 8
    " && echo "OK $d" || echo "MISS insert $d"
    rm -f "$csv"
}
export -f load_day

# enumerate dates START..END
python3 - "$START" "$END" <<'EOF' | xargs -P"$PAR" -I{} bash -c 'load_day "$@"' _ {}
import sys, datetime
a = datetime.date.fromisoformat(sys.argv[1]); b = datetime.date.fromisoformat(sys.argv[2])
d = a
while d <= b:
    print(d.isoformat()); d += datetime.timedelta(days=1)
EOF

echo "marinecadastre load finished for ${START}..${END}"
