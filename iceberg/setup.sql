-- An alternative storage for the Planes dataset: Apache Iceberg tables in an S3 bucket, without a catalog.
--
-- The MergeTree tables from ../setup.sql stay the primary storage. ClickHouse writes their data into Iceberg:
-- - the history is copied once with INSERT SELECT, in batches by area on the map;
-- - new data is appended by refreshable materialized views with REFRESH ... APPEND INCREMENTAL,
--   which read only the rows committed to the source since the previous refresh.
--   The refresh cursor is committed into the Iceberg snapshot summary together with the data, so the appends are exactly-once:
--   without a catalog, a commit is a conditional write (If-None-Match) of the next metadata file.
-- - the background compaction of ClickHouse Cloud merges the small files written by the refreshes.
--
-- This is an experiment, and it is not how the service works. See README.md in this directory
-- for creating and configuring the bucket and the IAM role.
-- Requires ClickHouse Cloud 26.10 or newer: the background compaction of Iceberg tables exists only in ClickHouse Cloud.


SET allow_insert_into_iceberg = 1; -- For CREATE TABLE and INSERT.


-- 1. The tables.
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
--   the files themselves cover the whole world.
--
-- The compaction (the SETTINGS of the tables). Every refresh adds a small file, which every tile query has to open.
-- The background compaction of ClickHouse Cloud merges them: it selects the files smaller than
-- iceberg_data_file_size_lower_threshold_compaction (compressed size), in the order of commits, groups them by up to
-- iceberg_compaction_max_bytes_in_data_file, merge-sorts every group by the sort order of the table, and splits the result
-- into files of iceberg_compaction_max_bytes_in_data_file each - but measured on uncompressed data.
-- The defaults (384 MiB and 512 MiB) don't fit together: the result files are smaller than 384 MiB after compression,
-- so they are selected again by every next compaction, and so are the files of the history smaller than 384 MiB.
-- Here, the threshold is 128 MiB, and the result files are up to 4 GiB uncompressed, a few hundred MB compressed.
-- The compaction runs once a day (iceberg_compaction_delay_bias): the files of a day (96 refreshes, a few GB for planes_mercator)
-- are merged into a few files, each covering a contiguous range of the Morton curve, so the tile queries skip most of them.
-- A day's batch for the sample tables is smaller than the threshold and is merged again with the next days, until it is large enough.
-- The compaction never merges the files that are already large enough, so the number of the files of the new data grows
-- by a few files a day; to restore the layout of the history, the tables can be rebuilt (see README.md).
-- allow_experimental_cleanup_old_data_files_compaction deletes the merged files, together with the snapshots
-- that referenced them, iceberg_compaction_data_cleanup (3 hours) after the compaction.
--
-- The location of every table is a directory in the bucket. ClickHouse creates the table there: it writes the first metadata file.
-- In ClickHouse Cloud, the bucket is accessed with the IAM role of README.md: extra_credentials(role_arn = ...).
-- DROP TABLE does not delete the files; see README.md for recreating a table.

CREATE TABLE planes_mercator_iceberg
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
ENGINE = IcebergS3('https://adsb-exposed-iceberg.s3.eu-west-1.amazonaws.com/planes_mercator/',
    extra_credentials(role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-iceberg'))
ORDER BY (mercator_morton, time)
SETTINGS
    allow_experimental_iceberg_compaction = 1,
    allow_experimental_cleanup_old_data_files_compaction = 1,
    iceberg_compaction_delay_bias = 86400,
    iceberg_data_file_size_lower_threshold_compaction = '128Mi',
    iceberg_compaction_max_bytes_in_data_file = '4Gi';

-- The level-of-detail tables have the same structure.
-- Note: CREATE TABLE ... AS cannot be used here, as it would copy the location of the table.

CREATE TABLE planes_mercator_iceberg_sample10
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
ENGINE = IcebergS3('https://adsb-exposed-iceberg.s3.eu-west-1.amazonaws.com/planes_mercator_sample10/',
    extra_credentials(role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-iceberg'))
ORDER BY (mercator_morton, time)
SETTINGS
    allow_experimental_iceberg_compaction = 1,
    allow_experimental_cleanup_old_data_files_compaction = 1,
    iceberg_compaction_delay_bias = 86400,
    iceberg_data_file_size_lower_threshold_compaction = '128Mi',
    iceberg_compaction_max_bytes_in_data_file = '4Gi';

CREATE TABLE planes_mercator_iceberg_sample100
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
ENGINE = IcebergS3('https://adsb-exposed-iceberg.s3.eu-west-1.amazonaws.com/planes_mercator_sample100/',
    extra_credentials(role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-iceberg'))
ORDER BY (mercator_morton, time)
SETTINGS
    allow_experimental_iceberg_compaction = 1,
    allow_experimental_cleanup_old_data_files_compaction = 1,
    iceberg_compaction_delay_bias = 86400,
    iceberg_data_file_size_lower_threshold_compaction = '128Mi',
    iceberg_compaction_max_bytes_in_data_file = '4Gi';


-- 2. The source tables must persist the block number and the offset of every row:
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


-- 3. New data: incremental refreshable materialized views.
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
TO planes_mercator_iceberg
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
TO planes_mercator_iceberg_sample10
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
TO planes_mercator_iceberg_sample100
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
-- SELECT table, made_current_at, summary['operation'], summary['added-records'], summary['total-data-files'] FROM system.iceberg_history
--     WHERE database = currentDatabase() AND table LIKE 'planes_mercator_iceberg%' ORDER BY made_current_at DESC;


-- 4. The history: copy the rows up to the remembered block numbers, in 256 batches by the Morton code.
-- A batch is a contiguous range of the Morton curve, which is a tile of zoom level 4: {chunk} goes from 0 to 255.
-- It is read by the primary key, and the batches together write the whole table in the Morton order.
-- Every INSERT is a single Iceberg commit; if one fails, only this batch has to be repeated.
-- The batches are of uneven size: the tiles over Europe and North America contain most of the data.
-- The batches can run while the views keep refreshing, and in parallel with each other: the rows don't overlap
-- (split by the block number), and a commit that conflicts with a concurrent one is retried (up to 100 times)
-- on top of the latest snapshot, carrying the cursor of the latest refresh forward.

-- Run for every {chunk} from 0 to 255, e.g. with clickhouse-client --param_chunk=..., possibly a few at a time.
-- The same for planes_mercator_sample10 with {N10} and planes_mercator_sample100 with {N100}.

INSERT INTO planes_mercator_iceberg
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
    allow_insert_into_iceberg = 1, -- Here as well, as the batches may run in separate sessions.
    iceberg_insert_max_rows_in_data_file = 100000000,
    iceberg_insert_max_bytes_in_data_file = '4Gi'; -- Uncompressed, gives the data files of a few hundred MB.


-- 5. Read access for the website.
-- The website can use the tables by replacing the table names in the "levels" of the "Planes" dataset in config.js.
-- Note: if they are read through views, the views must be SQL SECURITY INVOKER (or NONE): a view with SQL SECURITY DEFINER
-- disables the pruning of Iceberg data files by min/max (checked in 26.10: a tile query reads every file).

GRANT SELECT ON default.planes_mercator_iceberg TO website;
GRANT SELECT ON default.planes_mercator_iceberg_sample10 TO website;
GRANT SELECT ON default.planes_mercator_iceberg_sample100 TO website;


-- 6. Maintenance, from time to time. The compaction expires only the snapshots of the files it merged.
-- The other snapshots, and the files of the failed writes (orphan files), have to be removed explicitly:
--
-- ALTER TABLE planes_mercator_iceberg EXECUTE expire_snapshots(retention_period = '2d', retain_last = 10)
--     SETTINGS allow_experimental_expire_snapshots = 1;
-- ALTER TABLE planes_mercator_iceberg EXECUTE remove_orphan_files()
--     SETTINGS allow_iceberg_remove_orphan_files = 1;
