#!/usr/bin/env python3
# Stream Kontur population hexagons from the GeoPackage as TSV: lat, lon, population, h3.
# Each GeoPackage geometry blob carries an envelope (EPSG:3857 meters); we take its centre
# and convert to lon/lat. Usage: population_convert.py /tmp/kontur.gpkg
import sqlite3, struct, math, sys

R = 6378137.0
path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/kontur.gpkg'
db = sqlite3.connect(path)
c = db.cursor()
c.execute('SELECT geom, population, h3 FROM population')
w = sys.stdout
for geom, pop, h3 in c:
    if geom is None or len(geom) < 40:
        continue
    flags = geom[3]
    if ((flags >> 1) & 0x07) != 1:   # need an [minx,maxx,miny,maxy] envelope
        continue
    le = '<' if (flags & 1) else '>'
    minx, maxx, miny, maxy = struct.unpack_from(le + '4d', geom, 8)
    x = (minx + maxx) / 2.0
    y = (miny + maxy) / 2.0
    lon = x / R * 180.0 / math.pi
    lat = (2.0 * math.atan(math.exp(y / R)) - math.pi / 2.0) * 180.0 / math.pi
    if not (-85.0511 < lat < 85.0511 and -180 <= lon <= 180):
        continue
    w.write(f"{lat:.6f}\t{lon:.6f}\t{pop:.2f}\t{h3}\n")
