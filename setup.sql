CREATE TABLE planes_mercator
(
    mercator_x UInt32 MATERIALIZED 0xFFFFFFFF * ((lon + 180) / 360),
    mercator_y UInt32 MATERIALIZED 0xFFFFFFFF * (1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi()),

    INDEX idx_x (mercator_x) TYPE minmax,
    INDEX idx_y (mercator_y) TYPE minmax,

    time DateTime64(3),
    date Date,
    icao String,
    r String,
    t LowCardinality(String),
    dbFlags Int32,
    noRegData Bool,
    ownOp String,
    year UInt16,
    desc LowCardinality(String),
    lat Float64,
    lon Float64,
    altitude Int32,
    ground_speed Float32,
    track_degrees Float32,
    flags UInt32,
    vertical_rate Int32,
    aircraft_alert Int64,
    aircraft_alt_geom Int64,
    aircraft_gva Int64,
    aircraft_nac_p Int64,
    aircraft_nac_v Int64,
    aircraft_nic Int64,
    aircraft_nic_baro Int64,
    aircraft_rc Int64,
    aircraft_sda Int64,
    aircraft_sil Int64,
    aircraft_sil_type String,
    aircraft_spi Int64,
    aircraft_track Float64,
    aircraft_type LowCardinality(String),
    aircraft_version Int64,
    aircraft_category String,
    aircraft_emergency String,
    aircraft_flight String,
    aircraft_squawk String,
    aircraft_baro_rate Int64,
    aircraft_nav_altitude_fms Int64,
    aircraft_nav_altitude_mcp Int64,
    aircraft_nav_modes Array(String),
    aircraft_nav_qnh Float64,
    aircraft_geom_rate Int64,
    aircraft_ias Int64,
    aircraft_mach Float64,
    aircraft_mag_heading Float64,
    aircraft_oat Int64,
    aircraft_roll Float64,
    aircraft_tas Int64,
    aircraft_tat Int64,
    aircraft_true_heading Float64,
    aircraft_wd Int64,
    aircraft_ws Int64,
    aircraft_track_rate Float64,
    aircraft_nav_heading Float64,
    source LowCardinality(String),
    geometric_altitude Int32,
    geometric_vertical_rate Int32,
    indicated_airspeed Int32,
    roll_angle Float32
) ENGINE = MergeTree ORDER BY (mortonEncode(mercator_x, mercator_y), time);

CREATE TABLE planes_mercator_sample10 AS planes_mercator;
CREATE TABLE planes_mercator_sample100 AS planes_mercator;

CREATE MATERIALIZED VIEW view_sample10 TO planes_mercator_sample10 AS SELECT * FROM planes_mercator WHERE rand() % 10 = 0;
CREATE MATERIALIZED VIEW view_sample100 TO planes_mercator_sample100 AS SELECT * FROM planes_mercator WHERE rand() % 100 = 0;


CREATE USER website IDENTIFIED WITH sha256_hash BY 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
SETTINGS 
    add_http_cors_header = 1,
    max_result_rows = 1048576,
    network_compression_method = 'zstd',
    network_zstd_compression_level = 6,
    replace_running_query = 1,
    skip_unavailable_shards = 1,
    max_parallel_replicas = 100,
    use_query_cache = 1,
    query_cache_ttl = 8640000,
    query_cache_share_between_users = 1,
    readonly = 1;

GRANT SELECT ON default.planes_mercator TO website;
GRANT SELECT ON default.planes_mercator_sample10 TO website;
GRANT SELECT ON default.planes_mercator_sample100 TO website;

CREATE QUOTA website
KEYED BY ip_address
FOR RANDOMIZED INTERVAL 1 MINUTE MAX query_selects = 1000, read_rows = 100000000000,
FOR RANDOMIZED INTERVAL 1 HOUR MAX query_selects = 10000, read_rows = 1000000000000,
FOR RANDOMIZED INTERVAL 1 DAY MAX query_selects = 50000, read_rows = 5000000000000
TO website;


CREATE USER website_progress IDENTIFIED WITH sha256_hash BY 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
SETTINGS 
    add_http_cors_header = 1,
    max_result_rows = 1024,
    skip_unavailable_shards = 1,
    readonly = 1;

GRANT SELECT ON system.processes TO website_progress;
GRANT REMOTE ON *.* TO website_progress;

CREATE QUOTA website_progress
KEYED BY ip_address
FOR RANDOMIZED INTERVAL 1 MINUTE MAX query_selects = 1000, read_rows = 100000,
FOR RANDOMIZED INTERVAL 1 HOUR MAX query_selects = 30000, read_rows = 3000000,
FOR RANDOMIZED INTERVAL 1 DAY MAX query_selects = 500000, read_rows = 50000000
TO website_progress;


CREATE TABLE saved_queries
(
    time MATERIALIZED now(),
    hash MATERIALIZED sipHash128(text),
    text String
) ENGINE = ReplacingMergeTree ORDER BY hash;

CREATE USER website_saved_queries IDENTIFIED WITH sha256_hash BY 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
SETTINGS
    add_http_cors_header = 1 READONLY,
    max_result_rows = 1 READONLY,
    limit = 1 READONLY,
    offset = 0 READONLY,
    force_primary_key = 1 READONLY,
    max_parallel_replicas = 1 READONLY,
    max_threads = 1 READONLY,
    max_query_size = '10K' READONLY;

CREATE QUOTA website_saved_queries
KEYED BY ip_address
FOR RANDOMIZED INTERVAL 1 MINUTE MAX query_selects = 100, query_inserts = 1000, written_bytes = '10M',
FOR RANDOMIZED INTERVAL 1 HOUR MAX query_selects = 1000, query_inserts = 10000, written_bytes = '50M',
FOR RANDOMIZED INTERVAL 1 DAY MAX query_selects = 5000, query_inserts = 50000, written_bytes = '200M'
TO website_saved_queries;

GRANT SELECT, INSERT ON default.saved_queries TO website_saved_queries;
