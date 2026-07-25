-- Overture Maps buildings: centroid of every building footprint on Earth (~2.5 billion).
-- Source: the Overture monthly release on AWS Open Data,
-- https://docs.overturemaps.org/ (s3://overturemaps-us-west-2/release/<date>/theme=buildings/).
-- Each building is placed at the centre of its bounding box (the `bbox` column), so no
-- geometry parsing is needed. Licenses are per-source (ODbL/other); see Overture docs.

CREATE TABLE overture_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    lat Float64,
    lon Float64,
    name String,
    class LowCardinality(String),
    subtype LowCardinality(String),
    height Float32,
    num_floors Int16,
    roof_shape LowCardinality(String)
) ENGINE = MergeTree ORDER BY mortonEncode(mercator_x, mercator_y);

CREATE TABLE overture_mercator_sample10 AS overture_mercator;
CREATE TABLE overture_mercator_sample100 AS overture_mercator;

CREATE MATERIALIZED VIEW overture_view_sample10 TO overture_mercator_sample10 AS SELECT * FROM overture_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW overture_view_sample100 TO overture_mercator_sample100 AS SELECT * FROM overture_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.overture_mercator TO website;
GRANT SELECT ON default.overture_mercator_sample10 TO website;
GRANT SELECT ON default.overture_mercator_sample100 TO website;
