-- OpenStreetMap dataset: all nodes of the planet, © OpenStreetMap contributors, ODbL v1.0.
-- Source: the weekly-updated ORC export of the planet from the AWS Open Data program,
-- https://registry.opendata.aws/osm/ (s3://osm-pds/planet/planet-latest.orc, ~130 GB).
-- Only nodes are loaded (ways and relations have no coordinates of their own).
-- Untagged nodes are kept on purpose: they trace the geometry of ways,
-- so the density visualization draws roads, buildings and coastlines by itself.

CREATE TABLE osm_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    id UInt64,
    lat Float64,
    lon Float64,
    timestamp DateTime,
    changeset UInt64,
    uid UInt32,
    user String,
    version UInt32,
    tags Map(LowCardinality(String), String),

    -- The most common tag keys of nodes, extracted into columns for fast filtering.
    -- The `tags` map still has everything.
    name String MATERIALIZED tags['name'],
    amenity LowCardinality(String) MATERIALIZED tags['amenity'],
    shop LowCardinality(String) MATERIALIZED tags['shop'],
    highway LowCardinality(String) MATERIALIZED tags['highway'],
    "natural" LowCardinality(String) MATERIALIZED tags['natural'],
    tourism LowCardinality(String) MATERIALIZED tags['tourism'],
    leisure LowCardinality(String) MATERIALIZED tags['leisure'],
    historic LowCardinality(String) MATERIALIZED tags['historic'],
    railway LowCardinality(String) MATERIALIZED tags['railway'],
    power LowCardinality(String) MATERIALIZED tags['power'],
    barrier LowCardinality(String) MATERIALIZED tags['barrier'],
    man_made LowCardinality(String) MATERIALIZED tags['man_made'],
    place LowCardinality(String) MATERIALIZED tags['place'],
    public_transport LowCardinality(String) MATERIALIZED tags['public_transport'],
    emergency LowCardinality(String) MATERIALIZED tags['emergency'],
    entrance LowCardinality(String) MATERIALIZED tags['entrance'],
    crossing LowCardinality(String) MATERIALIZED tags['crossing'],
    religion LowCardinality(String) MATERIALIZED tags['religion'],
    sport LowCardinality(String) MATERIALIZED tags['sport'],
    office LowCardinality(String) MATERIALIZED tags['office']
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

CREATE TABLE osm_mercator_sample10 AS osm_mercator;
CREATE TABLE osm_mercator_sample100 AS osm_mercator;

CREATE MATERIALIZED VIEW osm_view_sample10 TO osm_mercator_sample10 AS SELECT * FROM osm_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW osm_view_sample100 TO osm_mercator_sample100 AS SELECT * FROM osm_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.osm_mercator TO website;
GRANT SELECT ON default.osm_mercator_sample10 TO website;
GRANT SELECT ON default.osm_mercator_sample100 TO website;
