WITH
    toUInt32(4294967295 * ((-128 + 180) / 360)) AS x0,
    toUInt32(4294967295 * ((-64 + 180) / 360)) AS x1,
    toUInt32(4294967295 * (1 / 2 - log(tan((51 + 90) / 360 * pi())) / 2 / pi())) AS y0,
    toUInt32(4294967295 * (1 / 2 - log(tan((22 + 90) / 360 * pi())) / 2 / pi())) AS y1,
    toDateTime('2026-11-13 05:00:00', 'UTC') AS t0,
    t0 + {h:UInt32} * 3600 AS hour_begin
SELECT
    toUInt16(intDiv(toUnixTimestamp(time) - toUnixTimestamp(t0), 300)) AS frame,
    toUInt16(bitShiftRight(mercator_x - x0, 19)) AS px,
    toUInt16(bitShiftRight(mercator_y - y0, 19)) AS py,
    toUInt32(count()) AS c,
    toFloat32(avg(altitude)) AS alt,
    toFloat32(avg(ground_speed)) AS speed
FROM planes_mercator
WHERE time >= hour_begin AND time < hour_begin + 3600
    AND mercator_x >= x0 AND mercator_x < x1
    AND mercator_y >= y0 AND mercator_y < y1
GROUP BY frame, px, py
