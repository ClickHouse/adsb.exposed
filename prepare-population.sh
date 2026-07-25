#!/usr/bin/bash

# Loads the Kontur population hexagon centroids into population_mercator.
# Requires the GeoPackage downloaded + gunzipped to $GPKG (default /tmp/kontur.gpkg):
#   curl -sfS "https://geodata-eu-central-1-kontur-public.s3.eu-central-1.amazonaws.com/kontur_datasets/kontur_population_20231101.gpkg.gz" | gunzip > /tmp/kontur.gpkg
# The table must exist already: clickhouse-client < population-setup.sql
# The GeoPackage is parsed locally (population_convert.py) and streamed in one INSERT.

GPKG="${GPKG:-/tmp/kontur.gpkg}"

python3 /home/ubuntu/adsb.exposed/population_convert.py "$GPKG" \
| clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --query "INSERT INTO population_mercator (lat, lon, population, h3) FORMAT TSV" \
&& echo "population load done" || exit 1
