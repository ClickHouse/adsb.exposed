#!/usr/bin/env python3
"""
Prototype GTFS-Realtime vehicle-position updater for the "Transit" dataset.

This is meant to run continuously on a host OTHER than the ingestion box — it polls a set of
public GTFS-RT VehiclePositions feeds, decodes the protobuf, and appends rows to gtfs_mercator
via a remote INSERT. It is the live analogue of the Planes/Ships feeds.

Deploy elsewhere, e.g. as a systemd service, with these env vars set:
    CLICKHOUSE_PLANES_HOST, CLICKHOUSE_PLANES_USER, CLICKHOUSE_PLANES_PASSWORD
    GTFS_FEEDS   optional, "name=url,name=url,…"  (defaults to the keyless feeds below)
    GTFS_INTERVAL  optional, seconds between polls (default 15)

Dependencies:  pip install gtfs-realtime-bindings protobuf clickhouse-connect
(This prototype shells out to `clickhouse-client` if present; otherwise use clickhouse-connect.)

Add more feeds by extending DEFAULT_FEEDS. Many agencies require a free API key appended to
the URL; the defaults here are keyless so the prototype runs out of the box.
"""
import os, sys, time, subprocess, urllib.request
from google.transit import gtfs_realtime_pb2

DEFAULT_FEEDS = {
    "MBTA": "https://cdn.mbta.com/realtime/VehiclePositions.pb",
    # Add more agency VehiclePositions feeds here, e.g.:
    # "BART": "https://api.bart.gov/gtfsrt/vehicles.aspx",
    # "CTA":  "https://…",   (many need ?key=YOUR_KEY)
}

HOST = os.environ["CLICKHOUSE_PLANES_HOST"]
USER = os.environ["CLICKHOUSE_PLANES_USER"]
PASSWORD = os.environ["CLICKHOUSE_PLANES_PASSWORD"]
INTERVAL = int(os.environ.get("GTFS_INTERVAL", "15"))

def feeds():
    raw = os.environ.get("GTFS_FEEDS")
    if not raw:
        return DEFAULT_FEEDS
    out = {}
    for pair in raw.split(","):
        name, _, url = pair.partition("=")
        if url:
            out[name.strip()] = url.strip()
    return out

def poll_feed(name, url):
    rows = []
    try:
        data = urllib.request.urlopen(url, timeout=30).read()
    except Exception as e:
        print(f"[{name}] fetch error: {e}", file=sys.stderr)
        return rows
    feed = gtfs_realtime_pb2.FeedMessage()
    try:
        feed.ParseFromString(data)
    except Exception as e:
        print(f"[{name}] parse error: {e}", file=sys.stderr)
        return rows
    for e in feed.entity:
        if not (e.HasField("vehicle") and e.vehicle.HasField("position")):
            continue
        v = e.vehicle
        p = v.position
        la, lo = p.latitude, p.longitude
        if not (-85.0511 < la < 85.0511 and -180 <= lo <= 180):
            continue
        ts = v.timestamp or int(time.time())
        rows.append((ts, la, lo, name, v.vehicle.id or "", v.trip.route_id or "",
                     v.trip.trip_id or "", getattr(p, "bearing", 0.0) or 0.0,
                     getattr(p, "speed", 0.0) or 0.0))
    return rows

def insert(rows):
    if not rows:
        return
    def esc(s):
        return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"
    tsv = "\n".join(
        "\t".join([
            time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(r[0])),
            f"{r[1]:.6f}", f"{r[2]:.6f}", r[3], r[4], r[5], r[6], f"{r[7]:.1f}", f"{r[8]:.2f}"
        ]) for r in rows
    )
    subprocess.run(
        ["clickhouse-client", "--host", HOST, "--secure", "--user", USER, "--password", PASSWORD,
         "--query", "INSERT INTO gtfs_mercator (timestamp, lat, lon, feed, vehicle_id, route_id, trip_id, bearing, speed) FORMAT TSV"],
        input=tsv.encode(), check=True)

def main():
    once = "--once" in sys.argv
    while True:
        total = 0
        for name, url in feeds().items():
            rows = poll_feed(name, url)
            insert(rows)
            total += len(rows)
        print(f"inserted {total} vehicle positions", flush=True)
        if once:
            break
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
