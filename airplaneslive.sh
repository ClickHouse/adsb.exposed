#!/bin/bash

source config

mkdir -p airplaneslive
pushd airplaneslive

mkdir lock || exit
trap 'rmdir lock' EXIT

TABLE='default.planes_mercator'

while true
do
    clickhouse-local --time --query "
INSERT INTO FUNCTION remoteSecure('${CLICKHOUSE_PLANES_HOST}', '${TABLE}', '${CLICKHOUSE_PLANES_USER}', '${CLICKHOUSE_PLANES_PASSWORD}')
WITH arrayJoin(aircraft) AS a
SELECT now::DateTime64(3) AS time, time::Date AS date,
    a.hex AS icao, a.r, a.t, a.dbFlags, empty(a.r), a.ownOp, a.year, a.desc,
    a.lat, a.lon,
    toInt32OrZero(a.alt_baro),
    a.gs,
    a.track,
    a.dbFlags,
    a.baro_rate,
    a.alert,
    a.alt_geom,
    a.gva,
    a.nac_p,
    a.nac_v,
    a.nic,
    a.nic_baro,
    a.rc,
    a.sda,
    a.sil,
    a.sil_type,
    a.spi,
    a.track,
    a.type,
    a.version,
    a.category,
    a.emergency,
    trimRight(a.flight),
    a.squawk,
    a.baro_rate,
    a.nav_altitude_fms,
    a.nav_altitude_mcp,
    a.nav_modes,
    a.nav_qnh,
    a.geom_rate,
    a.ias,
    a.mach,
    a.mag_heading,
    a.oat,
    a.roll,
    a.tas,
    a.tat,
    a.true_heading,
    a.wd,
    a.ws,
    a.track_rate,
    a.nav_heading,
    '',
    a.alt_geom,
    a.geom_rate,
    a.ias,
    a.roll,
    'airplanes.live'
FROM url('https://airplanes.live/api/v2/?all', JSONLines, headers('auth' = '${AIRPLANESLIVE_API_KEY}'))"
done
