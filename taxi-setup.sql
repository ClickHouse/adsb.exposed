-- NYC taxi trips with real pickup/dropoff coordinates (2009–2016).
-- Source: the coordinate-bearing archive kept in ClickHouse's public datasets bucket
-- (s3://clickhouse-public-datasets/trips_mergetree/tsv/trips_mergetree.tsv.xz, ~1.3B trips).
-- The official TLC files replaced coordinates with taxi-zone IDs in 2016, so this archived
-- copy is the source of true point locations. Each trip is placed at its PICKUP point.

CREATE TABLE taxi_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    lat Float64,               -- pickup latitude (the plotted point)
    lon Float64,               -- pickup longitude
    -- The TLC records wall-clock local time, so the column carries the NYC timezone
    -- explicitly and the loader parses the source strings as America/New_York.
    pickup_datetime DateTime('America/New_York'),
    dropoff_datetime DateTime('America/New_York'),
    dropoff_lat Float64,
    dropoff_lon Float64,
    passenger_count UInt8,
    trip_distance Float32,
    fare_amount Float32,
    tip_amount Float32
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), pickup_datetime);

GRANT SELECT ON default.taxi_mercator TO website;
