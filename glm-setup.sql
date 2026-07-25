-- GOES GLM (Geostationary Lightning Mapper) flashes over the Americas.
-- Source: NOAA GOES-16 on AWS Open Data, https://registry.opendata.aws/noaa-goes/
-- (s3://noaa-goes16/GLM-L2-LCFA/, NetCDF granules every 20 s). Public domain.
-- Each row is one lightning flash: location, radiant energy, and footprint area.
-- Granules are decoded locally (NetCDF) and streamed in; see prepare-glm.sh.

CREATE TABLE glm_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime,
    lat Float64,
    lon Float64,
    energy Float32,   -- radiant energy, Joules
    area Float32      -- flash footprint, m^2
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

CREATE TABLE glm_mercator_sample10 AS glm_mercator;
CREATE TABLE glm_mercator_sample100 AS glm_mercator;

CREATE MATERIALIZED VIEW glm_view_sample10 TO glm_mercator_sample10 AS SELECT * FROM glm_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW glm_view_sample100 TO glm_mercator_sample100 AS SELECT * FROM glm_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.glm_mercator TO website;
GRANT SELECT ON default.glm_mercator_sample10 TO website;
GRANT SELECT ON default.glm_mercator_sample100 TO website;
