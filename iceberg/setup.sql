-- An alternative storage for the Planes dataset: Apache Iceberg tables in Amazon S3 Tables.
--
-- The MergeTree tables from ../setup.sql stay the primary storage. ClickHouse writes their data into Iceberg:
-- - the history is copied once with INSERT SELECT, in batches by area on the map;
-- - new data is appended by refreshable materialized views with REFRESH ... APPEND INCREMENTAL,
--   which read only the rows committed to the source since the previous refresh.
--   The refresh cursor is committed into the Iceberg snapshot summary together with the data, so the appends are exactly-once.
--
-- This is an experiment, and it is not how the service works. See README.md in this directory
-- for creating and configuring the table bucket.
-- Requires ClickHouse 26.9 or newer.


-- 1. The catalog. The S3 Tables Iceberg REST endpoint is https://s3tables.<region>.amazonaws.com/iceberg,
-- and the warehouse is the ARN of the table bucket. Requests are signed with SigV4.
-- Every namespace of the table bucket is visible as a table name prefix: iceberg.`adsb.planes_mercator`.

SET allow_database_iceberg = 1;
SET allow_insert_into_iceberg = 1; -- For the INSERTs and the CREATE TABLE statements below.

CREATE DATABASE iceberg
ENGINE = DataLakeCatalog('https://s3tables.eu-west-1.amazonaws.com/iceberg')
SETTINGS
    catalog_type = 's3tables',
    warehouse = 'arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed',
    region = 'eu-west-1',
    -- The IAM role that the ClickHouse Cloud service assumes (see step 2 of README.md in this directory)...
    aws_role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-s3tables';
    -- ...or, outside of ClickHouse Cloud, the keys of an IAM user instead:
    -- aws_access_key_id = '...',
    -- aws_secret_access_key = '...';


-- 2. The tables.
--
-- The schema follows planes_mercator, adapted to the Iceberg type system:
-- - Iceberg has no 8 and 16-bit integers, no booleans written by ClickHouse, no enums and no dictionary-encoded types,
--   so Bool, UInt16, Enum8 and LowCardinality(String) become Int32 and String.
--   Parquet applies dictionary encoding to repeated strings by itself.
-- - UInt32 is stored as Iceberg long and is read back as Int64.
-- - Iceberg timestamp has microsecond precision, so the time is DateTime64(6).
-- - Iceberg has no MATERIALIZED columns, so the Web Mercator coordinates are stored as ordinary columns,
--   calculated on insert.
--
-- The layout:
-- - No partitioning. The files are sorted by the location on the map, and a partition would split the data of every location
--   between the partitions: with partitions by month, a tile query would read at least one file for every month,
--   even for the smallest tile. Without partitions, a tile query reads only the few files that cover its area.
--   The price: a filter by time range (the time slider on the website) does not skip any files.
-- - ORDER BY the Morton curve of the Web Mercator coordinates, the same as in MergeTree.
--   Iceberg can sort only by columns, not by expressions, so the Morton code is stored as a column.
--   mortonEncode of two UInt32 is UInt64, which Iceberg cannot store, so two lowest bits are dropped.
--
-- A tile query filters by ranges of mercator_x and mercator_y, and it is fast only if it skips the data outside of the tile
-- by the min/max statistics, which exist on two levels:
-- - the manifests store min/max of every column for every data file, and ClickHouse skips the files by them;
-- - the Parquet files store min/max for every row group and page, and ClickHouse skips the row groups and pages by them.
-- The statistics are selective only if every file, row group and page covers a small area on the map,
-- in other words, if the rows are written in the Morton order, and a file contains a contiguous range of it.
-- ClickHouse sorts every block it writes by the sort order of the table, but a file contains many blocks,
-- each spanning the whole world, so the data has to be written already sorted:
-- - the history is copied with ORDER BY the sorting key of MergeTree, which is read in order without sorting,
--   so the whole table becomes a sequence of files of consecutive ranges of the Morton curve;
-- - every incremental refresh writes its rows with ORDER BY, so the row groups and pages inside the new files are selective;
--   the files themselves cover the whole world, until the S3 Tables compaction ("sort" strategy, which uses the sort order
--   of the table) merges them into sorted files of consecutive ranges.
--
-- The tables are created with AWS CLI from table-metadata.json (step 3 of README.md in this directory).
-- It is generated from the CREATE TABLE statements below by make-table-metadata.sh: regenerate it after changing them.
-- Check that ClickHouse sees the tables, with the types from the statements below (UInt32 is shown as Int64):

DESCRIBE iceberg.`adsb.planes_mercator`;

-- The CREATE TABLE statements can create the same tables from ClickHouse, instead of AWS CLI, but only in versions
-- that take the location of a new table from the catalog, so that IcebergS3 does not need arguments.
-- ClickHouse Cloud 26.10 does not support it yet: "Storage S3 requires 1 to 9 arguments". Skip them in this case.

CREATE TABLE iceberg.`adsb.planes_mercator`
(
    mercator_x UInt32,
    mercator_y UInt32,
    mercator_morton Int64,

    time DateTime64(6),
    date Date,
    icao String,
    r String,
    t String,
    dbFlags Int32,
    noRegData Int32,
    ownOp String,
    year Int32,
    desc String,
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
    aircraft_type String,
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
    source String,
    geometric_altitude Int32,
    geometric_vertical_rate Int32,
    indicated_airspeed Int32,
    roll_angle Float32,

    data_source String
)
ENGINE = IcebergS3 -- Without arguments: the location and the credentials come from the catalog.
ORDER BY (mercator_morton, time);

-- The level-of-detail tables have the same structure.
-- Note: CREATE TABLE ... AS cannot be used here, as it would copy the location of the table.

CREATE TABLE iceberg.`adsb.planes_mercator_sample10`
(
    mercator_x UInt32, mercator_y UInt32, mercator_morton Int64,
    time DateTime64(6), date Date, icao String, r String, t String, dbFlags Int32, noRegData Int32, ownOp String, year Int32, desc String,
    lat Float64, lon Float64, altitude Int32, ground_speed Float32, track_degrees Float32, flags UInt32, vertical_rate Int32,
    aircraft_alert Int64, aircraft_alt_geom Int64, aircraft_gva Int64, aircraft_nac_p Int64, aircraft_nac_v Int64, aircraft_nic Int64,
    aircraft_nic_baro Int64, aircraft_rc Int64, aircraft_sda Int64, aircraft_sil Int64, aircraft_sil_type String, aircraft_spi Int64,
    aircraft_track Float64, aircraft_type String, aircraft_version Int64, aircraft_category String, aircraft_emergency String,
    aircraft_flight String, aircraft_squawk String, aircraft_baro_rate Int64, aircraft_nav_altitude_fms Int64, aircraft_nav_altitude_mcp Int64,
    aircraft_nav_modes Array(String), aircraft_nav_qnh Float64, aircraft_geom_rate Int64, aircraft_ias Int64, aircraft_mach Float64,
    aircraft_mag_heading Float64, aircraft_oat Int64, aircraft_roll Float64, aircraft_tas Int64, aircraft_tat Int64, aircraft_true_heading Float64,
    aircraft_wd Int64, aircraft_ws Int64, aircraft_track_rate Float64, aircraft_nav_heading Float64, source String,
    geometric_altitude Int32, geometric_vertical_rate Int32, indicated_airspeed Int32, roll_angle Float32,
    data_source String
)
ENGINE = IcebergS3 -- Without arguments: the location and the credentials come from the catalog.
ORDER BY (mercator_morton, time);

CREATE TABLE iceberg.`adsb.planes_mercator_sample100`
(
    mercator_x UInt32, mercator_y UInt32, mercator_morton Int64,
    time DateTime64(6), date Date, icao String, r String, t String, dbFlags Int32, noRegData Int32, ownOp String, year Int32, desc String,
    lat Float64, lon Float64, altitude Int32, ground_speed Float32, track_degrees Float32, flags UInt32, vertical_rate Int32,
    aircraft_alert Int64, aircraft_alt_geom Int64, aircraft_gva Int64, aircraft_nac_p Int64, aircraft_nac_v Int64, aircraft_nic Int64,
    aircraft_nic_baro Int64, aircraft_rc Int64, aircraft_sda Int64, aircraft_sil Int64, aircraft_sil_type String, aircraft_spi Int64,
    aircraft_track Float64, aircraft_type String, aircraft_version Int64, aircraft_category String, aircraft_emergency String,
    aircraft_flight String, aircraft_squawk String, aircraft_baro_rate Int64, aircraft_nav_altitude_fms Int64, aircraft_nav_altitude_mcp Int64,
    aircraft_nav_modes Array(String), aircraft_nav_qnh Float64, aircraft_geom_rate Int64, aircraft_ias Int64, aircraft_mach Float64,
    aircraft_mag_heading Float64, aircraft_oat Int64, aircraft_roll Float64, aircraft_tas Int64, aircraft_tat Int64, aircraft_true_heading Float64,
    aircraft_wd Int64, aircraft_ws Int64, aircraft_track_rate Float64, aircraft_nav_heading Float64, source String,
    geometric_altitude Int32, geometric_vertical_rate Int32, indicated_airspeed Int32, roll_angle Float32,
    data_source String
)
ENGINE = IcebergS3 -- Without arguments: the location and the credentials come from the catalog.
ORDER BY (mercator_morton, time);


-- 3. The source tables must persist the block number and the offset of every row:
-- this is the position that the cursor of an incremental refresh points to.
-- The setting applies to new parts and to the parts produced by merges.

ALTER TABLE planes_mercator MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE planes_mercator_sample10 MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE planes_mercator_sample100 MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;

-- The existing data is split from the new data by block number. Remember the last block number of every table,
-- and substitute it below instead of the placeholders {N}, {N10}, {N100}:

SELECT table, max(max_block_number)
FROM system.parts
WHERE database = currentDatabase() AND table IN ('planes_mercator', 'planes_mercator_sample10', 'planes_mercator_sample100') AND active
GROUP BY table;


-- 4. New data: incremental refreshable materialized views.
--
-- Every refresh reads the rows committed to the source since the previous refresh and appends them as one Iceberg snapshot.
-- The columns are converted to the types of the Iceberg table. The SELECT lists them in the order of the Iceberg table
-- (the computed columns, then all the columns of the source), so the same SELECT also works for the INSERTs below,
-- which match the columns by position.
-- The source of an incremental refresh has to be a single plain table (no JOINs, subqueries or UNIONs).
-- The Enum columns are converted to String by their numbers, not by CAST: the source contains values that are not in the Enum
-- (inserts in binary formats don't check them), and CAST throws "Unexpected value 0 in enum" for them.
-- The names are the elements of the Enums in ../setup.sql, numbered from 1; the values that are not in the Enum become ''.
-- Check that they match the actual table: SHOW CREATE TABLE planes_mercator.
-- ORDER BY makes the statistics inside the new Parquet files selective (see above).

CREATE MATERIALIZED VIEW iceberg_planes_mercator
REFRESH EVERY 15 MINUTE APPEND INCREMENTAL
TO iceberg.`adsb.planes_mercator`
AS SELECT mercator_x, mercator_y, bitShiftRight(mortonEncode(mercator_x, mercator_y), 2) AS mercator_morton, * REPLACE (
    ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
     'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', ''][CAST(aircraft_category, 'Int8')] AS aircraft_category,
    ['', 'none', 'general', 'downed', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'reserved'][CAST(aircraft_emergency, 'Int8')] AS aircraft_emergency,
    arrayFilter(x -> x != '', arrayMap(x -> ['althold', 'approach', 'autopilot', 'lnav', 'tcas', 'vnav'][CAST(x, 'Int8')], aircraft_nav_modes)) AS aircraft_nav_modes,
    ['', 'adsb.lol', 'adsbexchange', 'airplanes.live'][CAST(data_source, 'Int8')] AS data_source)
FROM planes_mercator
WHERE _block_number > {N}
ORDER BY mortonEncode(mercator_x, mercator_y), time;

CREATE MATERIALIZED VIEW iceberg_planes_mercator_sample10
REFRESH EVERY 15 MINUTE APPEND INCREMENTAL
TO iceberg.`adsb.planes_mercator_sample10`
AS SELECT mercator_x, mercator_y, bitShiftRight(mortonEncode(mercator_x, mercator_y), 2) AS mercator_morton, * REPLACE (
    ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
     'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', ''][CAST(aircraft_category, 'Int8')] AS aircraft_category,
    ['', 'none', 'general', 'downed', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'reserved'][CAST(aircraft_emergency, 'Int8')] AS aircraft_emergency,
    arrayFilter(x -> x != '', arrayMap(x -> ['althold', 'approach', 'autopilot', 'lnav', 'tcas', 'vnav'][CAST(x, 'Int8')], aircraft_nav_modes)) AS aircraft_nav_modes,
    ['', 'adsb.lol', 'adsbexchange', 'airplanes.live'][CAST(data_source, 'Int8')] AS data_source)
FROM planes_mercator_sample10
WHERE _block_number > {N10}
ORDER BY mortonEncode(mercator_x, mercator_y), time;

CREATE MATERIALIZED VIEW iceberg_planes_mercator_sample100
REFRESH EVERY 15 MINUTE APPEND INCREMENTAL
TO iceberg.`adsb.planes_mercator_sample100`
AS SELECT mercator_x, mercator_y, bitShiftRight(mortonEncode(mercator_x, mercator_y), 2) AS mercator_morton, * REPLACE (
    ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
     'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', ''][CAST(aircraft_category, 'Int8')] AS aircraft_category,
    ['', 'none', 'general', 'downed', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'reserved'][CAST(aircraft_emergency, 'Int8')] AS aircraft_emergency,
    arrayFilter(x -> x != '', arrayMap(x -> ['althold', 'approach', 'autopilot', 'lnav', 'tcas', 'vnav'][CAST(x, 'Int8')], aircraft_nav_modes)) AS aircraft_nav_modes,
    ['', 'adsb.lol', 'adsbexchange', 'airplanes.live'][CAST(data_source, 'Int8')] AS data_source)
FROM planes_mercator_sample100
WHERE _block_number > {N100}
ORDER BY mortonEncode(mercator_x, mercator_y), time;

-- Monitoring:
-- SELECT view, status, last_success_time, last_refresh_time, written_rows, exception FROM system.view_refreshes WHERE view LIKE 'iceberg_%';
-- SELECT made_current_at, snapshot_id, summary['added-records'] FROM system.iceberg_history WHERE database = 'iceberg' ORDER BY made_current_at DESC;


-- 5. The history: copy the rows up to the remembered block numbers, in 256 batches by the Morton code.
-- A batch is a contiguous range of the Morton curve, which is a tile of zoom level 4: {chunk} goes from 0 to 255.
-- It is read by the primary key, and the batches together write the whole table in the Morton order.
-- Every INSERT is a single Iceberg commit; if one fails, only this batch has to be repeated.
-- The batches are of uneven size: the tiles over Europe and North America contain most of the data.
-- Commits are optimistic, so pause the views for the time of the copy to avoid conflicts with them;
-- a paused view does not lose anything, it catches up from its cursor after start.

SYSTEM STOP VIEW iceberg_planes_mercator;
SYSTEM STOP VIEW iceberg_planes_mercator_sample10;
SYSTEM STOP VIEW iceberg_planes_mercator_sample100;

-- Run for every {chunk} from 0 to 255, e.g. with clickhouse-client --param_chunk=...
-- The same for planes_mercator_sample10 with {N10} and planes_mercator_sample100 with {N100}.

INSERT INTO iceberg.`adsb.planes_mercator`
SELECT mercator_x, mercator_y, bitShiftRight(mortonEncode(mercator_x, mercator_y), 2) AS mercator_morton, * REPLACE (
    ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
     'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', ''][CAST(aircraft_category, 'Int8')] AS aircraft_category,
    ['', 'none', 'general', 'downed', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'reserved'][CAST(aircraft_emergency, 'Int8')] AS aircraft_emergency,
    arrayFilter(x -> x != '', arrayMap(x -> ['althold', 'approach', 'autopilot', 'lnav', 'tcas', 'vnav'][CAST(x, 'Int8')], aircraft_nav_modes)) AS aircraft_nav_modes,
    ['', 'adsb.lol', 'adsbexchange', 'airplanes.live'][CAST(data_source, 'Int8')] AS data_source)
FROM planes_mercator
WHERE _block_number <= {N}
    AND mortonEncode(mercator_x, mercator_y) BETWEEN bitShiftLeft({chunk:UInt64}, 56) AND bitShiftLeft({chunk:UInt64}, 56) + 0x00FFFFFFFFFFFFFF
ORDER BY mortonEncode(mercator_x, mercator_y), time -- The sorting key of the source: it is read in order, without sorting.
SETTINGS
    iceberg_insert_max_rows_in_data_file = 100000000,
    iceberg_insert_max_bytes_in_data_file = '4Gi'; -- Uncompressed, gives the data files of a few hundred MB.

SYSTEM START VIEW iceberg_planes_mercator;
SYSTEM START VIEW iceberg_planes_mercator_sample10;
SYSTEM START VIEW iceberg_planes_mercator_sample100;


-- 6. Read access for the website.
-- The website can use these views by replacing the table names in the "levels" of the "Planes" dataset in config.js.
--
-- Note: the views must be SQL SECURITY INVOKER (or NONE). A view with SQL SECURITY DEFINER disables the pruning
-- of Iceberg data files by min/max (checked in 26.10: a tile query reads every file), so the tile queries would be slow.
-- Consequently, the website user needs the privilege on the Iceberg tables as well.
-- It does not get access to the credentials of the catalog: they are kept in the settings of the database.

CREATE VIEW planes_mercator_iceberg SQL SECURITY INVOKER AS SELECT * FROM iceberg.`adsb.planes_mercator`;
CREATE VIEW planes_mercator_iceberg_sample10 SQL SECURITY INVOKER AS SELECT * FROM iceberg.`adsb.planes_mercator_sample10`;
CREATE VIEW planes_mercator_iceberg_sample100 SQL SECURITY INVOKER AS SELECT * FROM iceberg.`adsb.planes_mercator_sample100`;

GRANT SELECT ON default.planes_mercator_iceberg TO website;
GRANT SELECT ON default.planes_mercator_iceberg_sample10 TO website;
GRANT SELECT ON default.planes_mercator_iceberg_sample100 TO website;

GRANT SELECT ON iceberg.`adsb.planes_mercator` TO website;
GRANT SELECT ON iceberg.`adsb.planes_mercator_sample10` TO website;
GRANT SELECT ON iceberg.`adsb.planes_mercator_sample100` TO website;
