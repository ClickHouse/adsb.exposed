-- Live public-transit vehicle positions (GTFS-Realtime).
-- Populated continuously by prepare-gtfs-rt.py polling agency VehiclePositions feeds.
-- Data © the respective transit agencies. This is a real-time feed, like Planes/Ships:
-- rows accumulate over time and the time slider replays vehicle movement.

CREATE TABLE gtfs_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    timestamp DateTime,
    lat Float64,
    lon Float64,
    feed LowCardinality(String),
    vehicle_id String,
    route_id LowCardinality(String),
    trip_id String,
    bearing Float32,
    speed Float32
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), timestamp);

GRANT SELECT ON default.gtfs_mercator TO website;
