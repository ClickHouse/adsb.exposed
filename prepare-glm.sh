#!/usr/bin/bash

# Loads GOES-16 GLM lightning flashes into glm_mercator. NetCDF granules are decoded on this
# machine (glm_convert.py) and streamed in one INSERT per hour. Bounded local disk use:
# granules for an hour are fetched to a temp dir, converted, inserted, then deleted.
# The tables must exist already: clickhouse-client < glm-setup.sql
#
# Default window is a few active-storm summer days; widen with START/END (YYYY-MM-DD).

START="${START:-2024-07-01}"
END="${END:-2024-07-03}"
SAT="${SAT:-noaa-goes16}"
PAR="${PAR:-24}"
WORK="${WORK:-/tmp/glm_work}"
mkdir -p "$WORK"

convert_one() {
    local key="$1"
    local f="$WORK/$(basename "$key")"
    curl -sfS "https://${SAT}.s3.amazonaws.com/${key}" -o "$f" || return 0
    python3 /home/ubuntu/adsb.exposed/glm_convert.py "$f"
    rm -f "$f"
}
export -f convert_one
export WORK SAT

insert_hour() {
    local y="$1" doy="$2" hh="$3"
    local prefix="GLM-L2-LCFA/${y}/${doy}/${hh}/"
    # list keys for this hour (paginated)
    local token="" keys=""
    keys=$(curl -s "https://${SAT}.s3.amazonaws.com/?list-type=2&prefix=${prefix}&max-keys=1000" \
        | grep -oE '<Key>[^<]*</Key>' | sed -E 's/<\/?Key>//g')
    [ -z "$keys" ] && { echo "EMPTY ${y}/${doy}/${hh}"; return 0; }
    echo "$keys" | xargs -P"$PAR" -I{} bash -c 'convert_one "$@"' _ {} \
    | clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
        --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
        --query "INSERT INTO glm_mercator (timestamp, lat, lon, energy, area) FORMAT TSV" \
      && echo "OK ${y}/${doy}/${hh}" || echo "FAIL ${y}/${doy}/${hh}"
}

d="$START"
while [[ "$d" < "$END" || "$d" == "$END" ]]; do
    y=$(date -d "$d" +%Y)
    doy=$(date -d "$d" +%j)
    for hh in $(seq -w 0 23); do
        insert_hour "$y" "$doy" "$hh"
    done
    d=$(date -d "$d + 1 day" +%Y-%m-%d)
done
echo "glm load finished ${START}..${END}"
