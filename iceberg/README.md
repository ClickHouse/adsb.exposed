# Experimental: Iceberg in S3

**This is an experiment, and it is not how the service works.** The website reads the MergeTree tables described in the [main README](../README.md). Nothing here is used in production.

**Status:** tested only locally, see [Testing](#testing). The background compaction exists only in ClickHouse Cloud and was not tested yet.

The Planes dataset can also be stored as [Apache Iceberg](https://iceberg.apache.org/) tables in an S3 bucket, next to the MergeTree tables. ClickHouse does everything by itself:
- it creates the tables in the bucket, without a catalog: an Iceberg table is a directory with data and metadata files, and a commit is a conditional write (`If-None-Match`) of the next metadata file;
- it copies the history with `INSERT SELECT`;
- it appends the new data with refreshable materialized views with `REFRESH ... APPEND INCREMENTAL`, which read only the rows committed since the previous refresh. The cursor of the refresh is committed into the Iceberg snapshot together with the data, so every row is appended exactly once, even if the server restarts in between;
- the background compaction of ClickHouse Cloud merges the small files written by the refreshes, and deletes the merged files.

The table definitions, the views, the copy of the history and the settings of the compaction are in [setup.sql](setup.sql), which also explains the layout of the tables. Here is how to prepare the bucket for it. The examples use the region `eu-west-1`, the account `111122223333`, the bucket `adsb-exposed-iceberg`, and AWS CLI v2.

1. Create the bucket. New buckets block public access and are encrypted (SSE-S3) by default. Leave versioning disabled: the compaction deletes the merged files, and with versioning S3 would keep them, and charge for them. The lifecycle rule removes the parts of multipart uploads that were never completed, e.g. by a failed write.

```
REGION=eu-west-1
BUCKET=adsb-exposed-iceberg

aws s3api create-bucket --region $REGION --bucket $BUCKET \
    --create-bucket-configuration LocationConstraint=$REGION

aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration '{
    "Rules": [{
        "ID": "abort-incomplete-multipart-uploads",
        "Status": "Enabled",
        "Filter": {},
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }]
}'
```

2. Give the ClickHouse Cloud service access to the bucket with an IAM role. The service has its own IAM role, managed by ClickHouse Cloud; you create a role in your AWS account that the service is allowed to assume, and give this role the permissions on the bucket. ClickHouse assumes it with AWS STS for every table that has `extra_credentials(role_arn = ...)` in its definition.

First, find the IAM role of the service: in the ClickHouse Cloud console, open the service, go to **Settings**, scroll down to **Network security information**, and copy **Service role ID (IAM)**. It looks like `arn:aws:iam::<ClickHouse Cloud account>:role/CH-S3-...-Role`.

Then create the role, using credentials of your AWS account with the permissions to manage IAM:

```
CLICKHOUSE_SERVICE_ROLE_ARN='arn:aws:iam::...:role/CH-S3-...-Role' # Service role ID (IAM) from the console.

# The trust policy: who can assume the role. Only the IAM role of the ClickHouse Cloud service.
cat > trust-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": { "AWS": "$CLICKHOUSE_SERVICE_ROLE_ARN" },
        "Action": "sts:AssumeRole"
    }]
}
EOF

aws iam create-role \
    --role-name adsb-exposed-iceberg \
    --description "ClickHouse Cloud access to the adsb-exposed-iceberg bucket" \
    --assume-role-policy-document file://trust-policy.json

# The permissions of the role: reading, writing and deleting the objects in this bucket only.
cat > s3-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
            "Resource": "arn:aws:s3:::$BUCKET/*"
        },
        {
            "Effect": "Allow",
            "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
            "Resource": "arn:aws:s3:::$BUCKET"
        }
    ]
}
EOF

aws iam put-role-policy \
    --role-name adsb-exposed-iceberg \
    --policy-name s3-adsb-exposed-iceberg \
    --policy-document file://s3-policy.json

# The ARN of the role, for `extra_credentials(role_arn = ...)` in the definitions of the tables.
aws iam get-role --role-name adsb-exposed-iceberg --query Role.Arn --output text
```

The policy is attached inline, so it is deleted together with the role. Only the ClickHouse Cloud service can assume the role, so it can't be tested from your own account with `aws sts assume-role`: test it from ClickHouse, e.g. by creating the first table. IAM changes may take a few seconds to propagate. The role can't be assumed by the service for other roles of your account: a role is assumable from another account only if its own trust policy allows it.

Outside of ClickHouse Cloud, the role can be used with a trust policy for the identity of your server, or the policy can be attached to an IAM user, whose keys go into the engine arguments instead of `extra_credentials`. But the background compaction exists only in ClickHouse Cloud.

3. Run the steps of `setup.sql`, after replacing the bucket, the account and the role in the definitions of the tables: create the tables, enable block numbers on the MergeTree tables, create the materialized views, copy the history, and grant the access to the website.

4. Look after the tables. The compaction runs in the background once a day (see the comments in `setup.sql` for its settings), but some of the maintenance is not automatic:
   - The compaction expires only the snapshots that referenced the files it merged. Expire the other snapshots and remove the files of the failed writes from time to time, with the `ALTER TABLE ... EXECUTE` commands at the end of `setup.sql`.
   - The compaction merges only the small files, so the files of the new data stay as they were merged: a few files a day, each covering a part of the map, sorted inside. A tile query skips most of them by min/max, but has to look at them, so the queries slow down over the months. Then rebuild the tables: create new tables in new directories of the bucket, and run the steps of `setup.sql` for them, with the new block numbers. The history is copied in the Morton order again, and the old tables can be dropped after the website switches to the new ones. `DROP TABLE` doesn't delete the files; delete the directory with `aws s3 rm --recursive s3://adsb-exposed-iceberg/<directory>/`.
   - `DROP TABLE` doesn't delete the files of the table (unless `iceberg_delete_data_on_drop = 1`), and `CREATE TABLE` with the columns refuses to overwrite them: "Iceberg table with path ... already exists". To recreate the definition of a table and keep its data, e.g. to change its settings, drop the view and the table, create the table without the columns, which attaches the existing data (the columns and the sort order come from its metadata), then create the view again with the same block number: the cursor of the refreshes is stored in the Iceberg table, so the view continues where it stopped.

     ```
     CREATE TABLE planes_mercator_iceberg_sample100
     ENGINE = IcebergS3('https://adsb-exposed-iceberg.s3.eu-west-1.amazonaws.com/planes_mercator_sample100/',
         extra_credentials(role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-iceberg'))
     SETTINGS allow_experimental_iceberg_compaction = 1, ... -- The same settings as in setup.sql.
     ```

     To start the table from scratch, delete its directory, `aws s3 rm --recursive s3://adsb-exposed-iceberg/planes_mercator_sample100/`, or use a new one, and run all the steps of `setup.sql` for this table, with a new block number of its source.
   - The number of data files shows how the compaction keeps up: `SELECT table, made_current_at, summary['total-data-files'] FROM system.iceberg_history WHERE table LIKE 'planes_mercator_iceberg%' ORDER BY made_current_at DESC`.

5. The website reads the Iceberg tables `planes_mercator_iceberg`, `planes_mercator_iceberg_sample10`, and `planes_mercator_iceberg_sample100` in a hidden mode: type `iddqd` on the page (outside of the input fields), and choose "Iceberg" in the selector that appears on the map. The choice is remembered in the browser. The tables are the `iceberg` fields of the `levels` of the Planes dataset in `config.js`. In this mode, the queries also go through `iceberg_query` of the dataset: it casts `mercator_x` and `mercator_y` to `UInt32`, because the tables of the service were created by a version that stored them as the signed Iceberg `int` (see the comments in `setup.sql`); the cast doesn't prevent skipping the files by min/max, and doesn't change anything for the tables with `long` columns. If they are read through views, the views have to be `SQL SECURITY INVOKER`: a view with `SQL SECURITY DEFINER` disables skipping the Iceberg data files by min/max, and every tile query would read the whole table.

## Why not S3 Tables

The first version of this experiment used [Amazon S3 Tables](https://aws.amazon.com/s3/features/tables/), with a `DataLakeCatalog` database, the maintenance by S3 Tables, and the tables created with AWS CLI. It does not work with ClickHouse Cloud 26.10 yet: the writes fail because S3 Tables rejects a header that ClickHouse adds to the uploaded files ([ClickHouse#126410](https://github.com/ClickHouse/ClickHouse/issues/126410)), and ClickHouse can't create the tables there ([ClickHouse#126411](https://github.com/ClickHouse/ClickHouse/issues/126411)). The compaction of S3 Tables also runs on its own schedule, which is neither documented nor configurable.

## Testing

The whole `setup.sql` was run on a local ClickHouse 26.10 server, with `IcebergLocal` tables in place of the S3 locations (with the same settings), and 1.15 million synthetic rows in the MergeTree tables, including rows with values that are not in the `Enum`s. The rows were split between the copy of the history and the incremental refreshes, including a server restart between refreshes. The Iceberg tables contained exactly the rows of the MergeTree tables, and the tiles rendered from them were byte-identical to the ones rendered from MergeTree. With the history copied in the Morton order, a tile query read only a few of the 581 data files:

| Zoom | Files read | Files skipped by min/max | Rows read |
|---|---|---|---|
| 0 | 581 | 0 | 1152000 |
| 5 | 4 | 577 | 1459 |
| 8 | 3 | 577 | 26 |
| 10 | 1 | 577 | 2 |

The copy of the history doesn't need the views to be stopped. In another run, it ran in 4 parallel workers while the views refreshed every second and new rows kept arriving: 231 commits conflicted and were retried, 72 refreshes committed in between the batches, every snapshot after the first refresh kept the cursor, and the Iceberg tables again contained exactly the rows of the MergeTree tables.

Partitioning by month made it worse: a tile at zoom 8 read 18 files, because every month had its own files for the same area.

Not tested: the S3 bucket and the IAM role, and the background compaction, which exists only in ClickHouse Cloud. Its behavior described in `setup.sql` is from reading its code: it merges with `MergingSortedTransform` by the sort order of the table, selects the files by their compressed size and splits the result by the uncompressed one, and carries the cursor of the refreshes forward in its snapshots, also when it rebases on a concurrent refresh.
