-- OpenStreetMap full history: every version of every node ever recorded.
-- Source: the weekly full-history ORC export on AWS Open Data,
-- https://registry.opendata.aws/osm/ (s3://osm-pds/planet-history/history-latest.orc, ~218 GB).
-- This is a SEPARATE dataset from `osm_mercator` (which holds only the current snapshot);
-- here each row is one historical version of a node, so the time slider replays the
-- growth of the map over ~20 years. Deleted versions carry no coordinates and are skipped.

CREATE TABLE osm_history_mercator
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
    visible Bool,
    tags Map(LowCardinality(String), String),

    name String MATERIALIZED tags['name'],
    amenity LowCardinality(String) MATERIALIZED tags['amenity'],
    highway LowCardinality(String) MATERIALIZED tags['highway'],
    "natural" LowCardinality(String) MATERIALIZED tags['natural'],
    power LowCardinality(String) MATERIALIZED tags['power']
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

CREATE TABLE osm_history_mercator_sample10 AS osm_history_mercator;
CREATE TABLE osm_history_mercator_sample100 AS osm_history_mercator;

CREATE MATERIALIZED VIEW osm_history_view_sample10 TO osm_history_mercator_sample10 AS SELECT * FROM osm_history_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW osm_history_view_sample100 TO osm_history_mercator_sample100 AS SELECT * FROM osm_history_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.osm_history_mercator TO website;
GRANT SELECT ON default.osm_history_mercator_sample10 TO website;
GRANT SELECT ON default.osm_history_mercator_sample100 TO website;
