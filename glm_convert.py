#!/usr/bin/env python3
# Decode one GOES GLM-L2-LCFA NetCDF granule to TSV rows of flashes:
#   timestamp <tab> lat <tab> lon <tab> energy <tab> area
# The timestamp is derived from the granule's start-time token in its filename
# (…_sYYYYDDDHHMMSSt…), which is accurate to the 20-second granule.
import sys, datetime, netCDF4, re

path = sys.argv[1]
m = re.search(r'_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})', path)
if not m:
    sys.exit(0)
year, doy, hh, mm, ss = (int(x) for x in m.groups())
base = datetime.datetime(year, 1, 1) + datetime.timedelta(days=doy - 1, hours=hh, minutes=mm, seconds=ss)
ts = base.strftime('%Y-%m-%d %H:%M:%S')

try:
    ds = netCDF4.Dataset(path)
    lat = ds.variables['flash_lat'][:]
    lon = ds.variables['flash_lon'][:]
    energy = ds.variables['flash_energy'][:]
    area = ds.variables['flash_area'][:]
except Exception:
    sys.exit(0)

out = []
for i in range(len(lat)):
    la, lo = float(lat[i]), float(lon[i])
    if not (-85.0511 < la < 85.0511 and -180 <= lo <= 180):
        continue
    out.append(f"{ts}\t{la:.5f}\t{lo:.5f}\t{float(energy[i]):.6e}\t{float(area[i]):.1f}")
if out:
    sys.stdout.write("\n".join(out) + "\n")
