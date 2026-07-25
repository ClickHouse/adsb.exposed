#!/usr/bin/bash

# Loads iNaturalist observations from AWS Open Data
# (https://registry.opendata.aws/inaturalist-open-data/) into inat_mercator. Server-side read.
# The tables + dictionary must exist already: clickhouse-client < inat-setup.sql
# Run step 1 (taxa) before step 2 (observations); the observations join relies on the dictionary.

CH=(clickhouse-client --host "${CLICKHOUSE_PLANES_HOST}" --secure
    --user "${CLICKHOUSE_PLANES_USER}" --password "${CLICKHOUSE_PLANES_PASSWORD}")

# Step 1: taxa lookup table (small).
"${CH[@]}" --query "
INSERT INTO inat_taxa (taxon_id, name, rank)
SELECT taxon_id, name, rank
FROM s3('https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz', 'TSVWithNames',
        'taxon_id UInt64, ancestry String, rank_level Int32, rank String, name String, active String', 'gzip')
" || exit 1

# Step 2: observations (~200M rows), resolving the species name by joining the taxa table.
"${CH[@]}" --progress --time --query "
INSERT INTO inat_mercator (lat, lon, observed_on, taxon_id, name, rank, quality_grade, observer_id)
SELECT
    o.latitude AS lat,
    o.longitude AS lon,
    toDate(ifNull(toDateOrNull(o.observed_on), toDate('1970-01-01'))) AS observed_on,
    o.taxon_id AS taxon_id,
    ifNull(t.name, '') AS name,
    ifNull(t.rank, '') AS rank,
    o.quality_grade AS quality_grade,
    o.observer_id AS observer_id
FROM s3('https://inaturalist-open-data.s3.amazonaws.com/observations.csv.gz', 'TSVWithNames',
        'observation_uuid String, observer_id UInt32, latitude Float64, longitude Float64, positional_accuracy String, taxon_id UInt32, quality_grade String, observed_on String, anomaly_score String', 'gzip') AS o
LEFT JOIN inat_taxa AS t ON toUInt64(o.taxon_id) = t.taxon_id
WHERE o.latitude != 0 AND o.longitude != 0
    AND o.latitude > -85.0511 AND o.latitude < 85.0511
    AND o.longitude >= -180 AND o.longitude <= 180
SETTINGS
    max_threads = 59,
    max_insert_threads = 16,
    max_insert_block_size = 4194304,
    min_insert_block_size_rows = 4194304,
    min_insert_block_size_bytes = 536870912
" || exit 1
