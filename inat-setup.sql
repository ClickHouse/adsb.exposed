-- iNaturalist research-grade+ observations: georeferenced wildlife sightings with photos.
-- Source: iNaturalist Open Data on AWS, https://registry.opendata.aws/inaturalist-open-data/
-- (s3://inaturalist-open-data/observations.csv.gz, taxa.csv.gz). CC0/CC-BY/CC-BY-NC per record.
-- taxon_id is resolved to a species name via a dictionary built from taxa.csv.gz.

CREATE TABLE inat_taxa (taxon_id UInt64, name String, rank LowCardinality(String)) ENGINE = MergeTree ORDER BY taxon_id;

CREATE TABLE inat_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    lat Float64,
    lon Float64,
    observed_on Date,
    taxon_id UInt32,
    name String,
    rank LowCardinality(String),
    quality_grade LowCardinality(String),
    observer_id UInt32
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), observed_on);

GRANT SELECT ON default.inat_mercator TO website;
