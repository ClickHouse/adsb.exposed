-- NOAA ISD (Integrated Surface Database): global hourly surface weather observations.
-- Source: AWS Open Data, https://registry.opendata.aws/noaa-global-hourly/
-- (s3://noaa-global-hourly-pds/<year>/<station>.csv). Coordinates are embedded per row.
-- Public domain (US Government work). The packed fields TMP/WND/SLP are decoded on load;
-- missing values (9999 sentinels) become NULL so avg() ignores them.

CREATE TABLE isd_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime,
    lat Float64,
    lon Float64,
    station String,
    name String,
    elevation Float32,
    temperature Nullable(Float32),   -- °C
    wind_speed Nullable(Float32),    -- m/s
    pressure Nullable(Float32)       -- hPa (sea level)
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

-- Per-station climatology: one row per station with its mean temperature/wind/pressure.
-- This tiny table (tens of thousands of rows) is what the Weather map interpolates from —
-- the tile query gathers a sparse spatial sample of stations and fills every pixel by a
-- Gaussian-kernel weighted average (see config.js). Populated from isd_mercator.
CREATE TABLE isd_stations
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    station String,
    lat Float64,
    lon Float64,
    name String,
    temperature Float32,   -- mean °C
    wind_speed Float32,    -- mean m/s
    pressure Float32,      -- mean hPa
    obs UInt64
) ENGINE = MergeTree ORDER BY mortonEncode(mercator_x, mercator_y);

GRANT SELECT ON default.isd_mercator TO website;
GRANT SELECT ON default.isd_stations TO website;
