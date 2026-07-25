-- GBIF species occurrences: global biodiversity records with coordinates.
-- Source: the monthly Parquet snapshot on AWS Open Data,
-- https://registry.opendata.aws/gbif/ (s3://gbif-open-data-us-east-1/occurrence/<date>/occurrence.parquet/).
-- Only CC0 and CC-BY licensed records are loaded (the CC-BY-NC subset is excluded).
-- Each record is a georeferenced observation/specimen of a taxon.

CREATE TABLE gbif_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    lat Float64,
    lon Float64,
    eventdate Date,
    year UInt16,
    kingdom LowCardinality(String),
    phylum LowCardinality(String),
    class LowCardinality(String),
    "order" LowCardinality(String),
    family LowCardinality(String),
    genus String,
    species String,
    scientificname String,
    taxonrank LowCardinality(String),
    basisofrecord LowCardinality(String),
    countrycode LowCardinality(String),
    individualcount UInt32,
    recordedby String,
    license LowCardinality(String)
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), eventdate);

CREATE TABLE gbif_mercator_sample100 AS gbif_mercator;

CREATE MATERIALIZED VIEW gbif_view_sample100 TO gbif_mercator_sample100 AS SELECT * FROM gbif_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.gbif_mercator TO website;
GRANT SELECT ON default.gbif_mercator_sample100 TO website;
