-- GHCNh (Global Historical Climatology Network - hourly): NOAA/NCEI's current hourly
-- surface-weather product, the official replacement for the retired ISD Global Hourly
-- (ISD ended at 2025-08-28; GHCNh is updated daily). Source: NCEI web-accessible folders
-- https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/access/
-- Public domain (US Government work).
--
-- GHCNh values are already decoded floats (no comma-packed fields like ISD) with per-row
-- coordinates and a clean DATE, so prepare-ghcnh.sh maps them almost directly. There is no
-- S3/glob or combined file, so the loader enumerates the ~38,870 stations from the station
-- list and fetches per-year PSV files in url() brace-list batches (404-skipped).
--
-- Columns are named to match isd_mercator so the same config.js pyramid queries render on
-- either table. Extras GHCNh carries that ISD did not: relative_humidity, wet_bulb.
-- timestamp is DateTime64(0) to keep pre-1970 records (DateTime cannot represent them).

CREATE TABLE ghcnh_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((least(greatest(lat, -85.0511), 85.0511) + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime64(0),
    lat Float64,
    lon Float64,
    station String,
    name String,
    elevation Nullable(Float32),

    temperature       Nullable(Float32),  -- degC
    dew_point         Nullable(Float32),  -- degC
    pressure          Nullable(Float32),  -- hPa, sea level
    station_pressure  Nullable(Float32),  -- hPa
    wind_direction    Nullable(Int16),    -- degrees
    wind_speed        Nullable(Float32),  -- m/s
    wind_gust         Nullable(Float32),  -- m/s
    visibility        Nullable(Float32),  -- km
    ceiling           Nullable(Int32),    -- m
    cloud_cover       Nullable(Float32),  -- % (from sky_cover_summation oktas)
    precipitation     Nullable(Float32),  -- mm
    snow_depth        Nullable(Float32),  -- mm
    relative_humidity Nullable(Float32),  -- %
    wet_bulb          Nullable(Float32),  -- degC
    pressure_tendency Nullable(Float32),  -- hPa / 3h
    present_weather   String              -- ww code (MW1)
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

GRANT SELECT ON default.ghcnh_mercator TO website;
