-- NASA FIRMS active fire detections (VIIRS S-NPP, 375 m).
-- Source: FIRMS country archive, https://firms.modaps.eosdis.nasa.gov/ (attribution required).
-- Each row is a satellite fire/thermal-anomaly detection with fire radiative power (FRP).
-- Loaded per-country for a curated list of high-fire-activity countries; extensible.

CREATE TABLE firms_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime,
    acq_date Date,
    lat Float64,
    lon Float64,
    brightness Float32,   -- bright_ti4, Kelvin
    frp Float32,          -- fire radiative power, MW
    confidence LowCardinality(String),  -- l / n / h
    daynight LowCardinality(String),
    satellite LowCardinality(String),
    country LowCardinality(String)
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), acq_date);

CREATE TABLE firms_mercator_sample10 AS firms_mercator;
CREATE TABLE firms_mercator_sample100 AS firms_mercator;

CREATE MATERIALIZED VIEW firms_view_sample10 TO firms_mercator_sample10 AS SELECT * FROM firms_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW firms_view_sample100 TO firms_mercator_sample100 AS SELECT * FROM firms_mercator WHERE rand() % 100 = 0;

GRANT SELECT ON default.firms_mercator TO website;
GRANT SELECT ON default.firms_mercator_sample10 TO website;
GRANT SELECT ON default.firms_mercator_sample100 TO website;
