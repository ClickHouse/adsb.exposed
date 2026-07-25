#!/usr/bin/bash

# Loads GBIF species occurrences (CC0 + CC-BY only) from the monthly AWS Open Data
# Parquet snapshot (https://registry.opendata.aws/gbif/) into gbif_mercator.
# The tables must exist already: clickhouse-client < gbif-setup.sql
# The read happens entirely server-side; nothing is stored locally.
#
# Update SNAPSHOT to the newest occurrence/<date>/ prefix in the bucket.

SNAPSHOT="${SNAPSHOT:-2026-07-01}"

clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure \
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}" \
    --progress --time \
    --query "
INSERT INTO gbif_mercator
    (lat, lon, eventdate, year, kingdom, phylum, class, \"order\", family, genus, species,
     scientificname, taxonrank, basisofrecord, countrycode, individualcount, recordedby, license)
SELECT
    decimallatitude AS lat,
    decimallongitude AS lon,
    if(eventdate > toDateTime64('1900-01-01', 3) AND eventdate <= now(), toDate(eventdate), toDate('1970-01-01')) AS eventdate,
    toUInt16(greatest(0, ifNull(year, 0))) AS year,
    kingdom, phylum, class, \"order\", family, genus, species,
    scientificname, taxonrank, basisofrecord, countrycode,
    toUInt32(greatest(0, ifNull(individualcount, 0))) AS individualcount,
    arrayStringConcat(arraySlice(recordedby, 1, 1)) AS recordedby,
    license
FROM s3('https://gbif-open-data-us-east-1.s3.amazonaws.com/occurrence/${SNAPSHOT}/occurrence.parquet/*', 'Parquet')
WHERE decimallatitude IS NOT NULL AND decimallongitude IS NOT NULL
    AND decimallatitude > -85.0511 AND decimallatitude < 85.0511
    AND decimallongitude >= -180 AND decimallongitude <= 180
    AND occurrencestatus = 'PRESENT'
    AND license IN ('CC0_1_0', 'CC_BY_4_0')
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1
