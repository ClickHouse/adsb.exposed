-- NOAA ISD (Integrated Surface Database): global hourly surface weather observations.
-- Source: AWS Open Data, https://registry.opendata.aws/noaa-global-hourly/
-- (s3://noaa-global-hourly-pds/<year>/<station>.csv). Coordinates are embedded per row.
-- Public domain (US Government work).
--
-- The source packs its measurements into comma-delimited code fields (WND, TMP, DEW, SLP,
-- VIS, CIG, AA1, AJ1, GA1, MA1, MD1, MW1, OC1, SA1, ...). prepare-isd.sh decodes every field
-- it can into a proper typed column below; 9999-style sentinels become NULL so avg() ignores
-- them. Rows are kept unless their coordinates are unparseable (poles and (0,0) are retained;
-- the web-mercator UInt32 cast saturates at the poles rather than throwing).

CREATE TABLE isd_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((least(greatest(lat, -85.0511), 85.0511) + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime,
    lat Float64,
    lon Float64,
    station String,
    name String,
    elevation Nullable(Float32),         -- m
    report_type LowCardinality(String),  -- e.g. FM-12 (synop), FM-15 (metar)
    call_sign String,
    quality_control LowCardinality(String),

    wind_direction    Nullable(Int16),    -- degrees (WND)
    wind_speed        Nullable(Float32),  -- m/s (WND)
    wind_gust         Nullable(Float32),  -- m/s (OC1)
    temperature       Nullable(Float32),  -- degC (TMP)
    dew_point         Nullable(Float32),  -- degC (DEW)
    pressure          Nullable(Float32),  -- hPa, sea level (SLP)
    station_pressure  Nullable(Float32),  -- hPa (MA1)
    visibility        Nullable(Float32),  -- km (VIS)
    ceiling           Nullable(Int32),    -- m (CIG)
    cloud_cover       Nullable(Float32),  -- % (GA1 oktas)
    cloud_base        Nullable(Int32),    -- m (GA1 layer base)
    precipitation     Nullable(Float32),  -- mm/h (AA1 depth / period)
    snow_depth        Nullable(Float32),  -- cm (AJ1)
    sea_surface_temp  Nullable(Float32),  -- degC (SA1)
    present_weather   Nullable(Int16),    -- ww code (MW1)
    pressure_tendency Nullable(Float32)   -- hPa / 3h, signed (MD1)
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

CREATE TABLE isd_mercator_sample10 AS isd_mercator;
CREATE MATERIALIZED VIEW isd_view_sample10 TO isd_mercator_sample10 AS SELECT * FROM isd_mercator WHERE rand() % 10 = 0;

-- Per-station climatology (kept for convenience; not required by the current maps).
CREATE TABLE isd_stations
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((least(greatest(lat, -85.0511), 85.0511) + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    station String,
    lat Float64,
    lon Float64,
    name String,
    temperature Float32,   -- mean degC
    wind_speed Float32,    -- mean m/s
    pressure Float32,      -- mean hPa
    obs UInt64
) ENGINE = MergeTree ORDER BY mortonEncode(mercator_x, mercator_y);

GRANT SELECT ON default.isd_mercator TO website;
GRANT SELECT ON default.isd_mercator_sample10 TO website;
GRANT SELECT ON default.isd_stations TO website;
