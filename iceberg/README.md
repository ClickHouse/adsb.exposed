# Experimental: Iceberg on Amazon S3 Tables

**This is an experiment, and it is not how the service works.** The website reads the MergeTree tables described in the [main README](../README.md). Nothing here is used in production.

**Status:** with ClickHouse Cloud 26.10, the table bucket, the IAM role, the database and the tables were set up as described below, but the writes into S3 Tables fail: ClickHouse 26.10 adds the `x-amz-meta-clickhouse-idempotency-id` header to the uploaded data files, and S3 Tables rejects it ([ClickHouse#126410](https://github.com/ClickHouse/ClickHouse/issues/126410)). The rest was tested only locally, see [Testing](#testing).

The Planes dataset can also be stored as [Apache Iceberg](https://iceberg.apache.org/) tables in [Amazon S3 Tables](https://aws.amazon.com/s3/features/tables/), next to the MergeTree tables. ClickHouse writes into them by itself: the history is copied with `INSERT SELECT`, and the new data is appended by refreshable materialized views with `REFRESH ... APPEND INCREMENTAL`, which read only the rows committed since the previous refresh. The cursor of the refresh is committed into the Iceberg snapshot together with the data, so every row is appended exactly once, even if the server restarts in between. S3 Tables does the maintenance: compaction of small files, expiration of snapshots, removal of unreferenced files.

The table definitions, the views and the copy of the history are in [setup.sql](setup.sql), which also explains the layout of the tables. Here is how to prepare S3 Tables for it. The examples use the region `eu-west-1`, the account `111122223333`, and AWS CLI v2.

1. Create a table bucket and a namespace.

```
aws s3tables create-table-bucket --region eu-west-1 --name adsb-exposed
# returns the ARN: arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed

aws s3tables create-namespace --region eu-west-1 \
    --table-bucket-arn arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed \
    --namespace adsb
```

2. Give the ClickHouse Cloud service access to the table bucket with an IAM role. The service has its own IAM role, managed by ClickHouse Cloud; you create a role in your AWS account that the service is allowed to assume, and give this role the permissions on the table bucket. ClickHouse assumes it with AWS STS and signs all requests with it: the requests to the S3 Tables Iceberg REST endpoint, `https://s3tables.eu-west-1.amazonaws.com/iceberg`, as well as the reads and writes of the data files, which need the `GetTableData` and `PutTableData` permissions. No permissions on general purpose buckets are needed.

First, find the IAM role of the service: in the ClickHouse Cloud console, open the service, go to **Settings**, scroll down to **Network security information**, and copy **Service role ID (IAM)**. It looks like `arn:aws:iam::<ClickHouse Cloud account>:role/CH-S3-...-Role`.

Then create the role, using credentials of your AWS account with the permissions to manage IAM:

```
REGION=eu-west-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
TABLE_BUCKET_ARN=arn:aws:s3tables:$REGION:$ACCOUNT_ID:bucket/adsb-exposed
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
    --role-name adsb-exposed-s3tables \
    --description "ClickHouse Cloud access to the adsb-exposed S3 table bucket" \
    --assume-role-policy-document file://trust-policy.json

# The permissions of the role: the Iceberg REST operations and the data of the tables, in this table bucket only.
cat > s3tables-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": [
            "s3tables:GetTableBucket",
            "s3tables:ListNamespaces", "s3tables:GetNamespace", "s3tables:CreateNamespace",
            "s3tables:ListTables", "s3tables:GetTable", "s3tables:CreateTable", "s3tables:DeleteTable",
            "s3tables:GetTableMetadataLocation", "s3tables:UpdateTableMetadataLocation",
            "s3tables:GetTableData", "s3tables:PutTableData"
        ],
        "Resource": [
            "$TABLE_BUCKET_ARN",
            "$TABLE_BUCKET_ARN/table/*"
        ]
    }]
}
EOF

aws iam put-role-policy \
    --role-name adsb-exposed-s3tables \
    --policy-name s3tables-adsb-exposed \
    --policy-document file://s3tables-policy.json

# The ARN of the role, for the `aws_role_arn` setting of the database.
aws iam get-role --role-name adsb-exposed-s3tables --query Role.Arn --output text
```

The policy is attached inline, so it is deleted together with the role. If the table bucket uses encryption with your own KMS key (`--encryption-configuration` of `create-table-bucket`), the role also needs `kms:Decrypt` and `kms:GenerateDataKey` on this key; with the default encryption (SSE-S3) nothing else is needed.

The role is used in the settings of the `DataLakeCatalog` database (see step 1 of `setup.sql`), without any keys:

```
CREATE DATABASE iceberg
ENGINE = DataLakeCatalog('https://s3tables.eu-west-1.amazonaws.com/iceberg')
SETTINGS
    catalog_type = 's3tables',
    warehouse = 'arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed',
    region = 'eu-west-1',
    aws_role_arn = 'arn:aws:iam::111122223333:role/adsb-exposed-s3tables';

SHOW TABLES FROM iceberg; -- Empty at first, but it fails if the role cannot be assumed or has no access.
```

The role can't be tested from your own account with `aws sts assume-role`: only the ClickHouse Cloud service is allowed to assume it, so test it from ClickHouse. IAM changes may take a few seconds to propagate. Note that the external ID condition (`sts:ExternalId`) in the trust policy is not supported: ClickHouse does not send the `aws_external_id` setting for S3 Tables.

Outside of ClickHouse Cloud, you can use the same role, with a trust policy for the identity of your server, or attach the permission policy to an IAM user and use its keys in the `aws_access_key_id` and `aws_secret_access_key` settings instead of `aws_role_arn`.

3. Create the tables. Their definition, [table-metadata.json](table-metadata.json), is the Iceberg schema and sort order that ClickHouse produces for the `CREATE TABLE` statements in `setup.sql` (it was generated from them, see the comments there), so the three tables have the same structure:

```
for table in planes_mercator planes_mercator_sample10 planes_mercator_sample100
do
    aws s3tables create-table --region eu-west-1 \
        --table-bucket-arn arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed \
        --namespace adsb --name $table \
        --format ICEBERG \
        --metadata file://table-metadata.json
done
```

The tables could also be created by ClickHouse itself, with `CREATE TABLE` in the `DataLakeCatalog` database, but only by versions that take the location of a new table from the catalog: `ENGINE = IcebergS3` without arguments. ClickHouse Cloud 26.10 does not support it yet and fails with "Storage S3 requires 1 to 9 arguments".

4. Run the steps of `setup.sql`: create the `DataLakeCatalog` database, check the tables, enable block numbers on the MergeTree tables, create the materialized views, copy the history, and create the views for the website.

5. Configure the maintenance of every table. The compaction is enabled by default, but its default strategy, `auto`, has to be checked: the `sort` strategy keeps the data sorted by the sort order of the table, the Morton curve, and the tile queries rely on that to skip files by their min/max (see the comments in `setup.sql`). Every refresh of a materialized view creates a snapshot (96 a day for a refresh every 15 minutes), and snapshot management expires the old ones, which keeps `metadata.json` well below the 50 MB limit of S3 Tables.

```
for table in planes_mercator planes_mercator_sample10 planes_mercator_sample100
do
    aws s3tables put-table-maintenance-configuration --region eu-west-1 \
        --table-bucket-arn arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed \
        --namespace adsb --name $table \
        --type icebergCompaction \
        --value '{"status":"enabled","settings":{"icebergCompaction":{"targetFileSizeMB":512,"strategy":"sort"}}}'

    aws s3tables put-table-maintenance-configuration --region eu-west-1 \
        --table-bucket-arn arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed \
        --namespace adsb --name $table \
        --type icebergSnapshotManagement \
        --value '{"status":"enabled","settings":{"icebergSnapshotManagement":{"minSnapshotsToKeep":10,"maxSnapshotAgeHours":48}}}'
done

# Files that are no longer referenced by any snapshot are deleted after unreferencedDays + nonCurrentDays.
aws s3tables put-table-bucket-maintenance-configuration --region eu-west-1 \
    --table-bucket-arn arn:aws:s3tables:eu-west-1:111122223333:bucket/adsb-exposed \
    --type icebergUnreferencedFileRemoval \
    --value '{"status":"enabled","settings":{"icebergUnreferencedFileRemoval":{"unreferencedDays":3,"nonCurrentDays":7}}}'
```

S3 Tables runs the compaction on its own schedule, which is neither documented nor configurable; a [third-party benchmark](https://www.onehouse.ai/blog/s3-managed-tables-unmanaged-costs-the-20x-surprise-with-aws-s3-tables) in 2025 observed it about every 3 hours. Until then, the files of every refresh stay as they are: each of them covers the whole map, so every tile query has to open all of them, and the frequency of refreshes is a trade-off between the freshness of the data and the number of these files. The number of data files in the current snapshot shows whether the compaction keeps up: `SELECT made_current_at, summary['total-data-files'] FROM system.iceberg_history WHERE database = 'iceberg' AND table = 'adsb.planes_mercator' ORDER BY made_current_at DESC`.

The `sort` strategy needs the `s3tables:GetTableData` permission for whoever configures it. Don't expire snapshots from ClickHouse (`EXECUTE expire_snapshots`), and don't set the Iceberg properties `history.expire.*` on the tables: S3 Tables does it, and its snapshot management stops working if these properties are present. You can check the state of the maintenance with `aws s3tables get-table-maintenance-job-status --table-bucket-arn ... --namespace adsb --name planes_mercator`.

6. The website reads the Iceberg tables through the views `planes_mercator_iceberg`, `planes_mercator_iceberg_sample10`, and `planes_mercator_iceberg_sample100`, which can replace the table names in the `levels` of the Planes dataset in `config.js`. These views have to be `SQL SECURITY INVOKER`: a view with `SQL SECURITY DEFINER` disables skipping the Iceberg data files by min/max, and every tile query would read the whole table.

## Testing

The whole `setup.sql` was run on a local ClickHouse 26.10 server, with `IcebergLocal` tables in place of the S3 Tables catalog (created both by ClickHouse and, as another writer would do, from `table-metadata.json`), and 1.15 million synthetic rows in the MergeTree tables. The rows were split between the copy of the history and the incremental refreshes, including a server restart between refreshes. The Iceberg tables contained exactly the rows of the MergeTree tables, and the tiles rendered from them were byte-identical to the ones rendered from MergeTree. With the history copied in the Morton order, a tile query read only a few of the 578 data files:

| Zoom | Files read | Files skipped by min/max | Rows read |
|---|---|---|---|
| 0 | 578 | 0 | 1150000 |
| 5 | 4 | 574 | 1455 |
| 8 | 3 | 574 | 26 |
| 10 | 1 | 574 | 2 |

Partitioning by month made it worse: a tile at zoom 8 read 18 files, because every month had its own files for the same area.
