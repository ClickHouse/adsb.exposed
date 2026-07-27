-- Global population density (Kontur Population, H3 hexagons, ~33M cells).
-- Source: https://data.humdata.org/dataset/kontur-population-dataset (CC BY 4.0),
-- a GeoPackage of H3 r8 hexagons each carrying a population count. Each hexagon is
-- reduced to its centroid (converted from EPSG:3857 to lat/lon); see prepare-population.sh.

CREATE TABLE population_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    lat Float64,
    lon Float64,
    population Float32,
    h3 String
) ENGINE = MergeTree ORDER BY mortonEncode(mercator_x, mercator_y);

-- 33M rows is small; no sample tables needed (a single level renders fast).

GRANT SELECT ON default.population_mercator TO website;
