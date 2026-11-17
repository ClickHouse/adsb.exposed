WITH
    toUInt32(4294967295 * ((-128 + 180) / 360)) AS x0,
    toUInt32(4294967295 * ((-64 + 180) / 360)) AS x1,
    toUInt32(4294967295 * (1 / 2 - log(tan((51 + 90) / 360 * pi())) / 2 / pi())) AS y0,
    toUInt32(4294967295 * (1 / 2 - log(tan((22 + 90) / 360 * pi())) / 2 / pi())) AS y1,
    -- Two panels of 1024 x 512, one above the other; keep the aspect ratio of the map.
    512 / (y1 - y0) AS scale,
    (1024 - (x1 - x0) * scale) / 2 AS left_margin,
    time >= '2026-11-13 21:00:00' AS after,  -- 14:00 ET goes to the top panel, 20:00 ET to the bottom one
    toInt32(left_margin + (mercator_x - x0) * scale) AS x,
    toInt32((mercator_y - y0) * scale) + after * 512 AS y,
    pow(least(count() / 20, 1), 1 / 5) AS transparency
SELECT x, y,
    toUInt8((1 + transparency) / 2 * (1 - least(avg(altitude), 50000) / 50000) * 255) AS r,
    toUInt8(transparency * greatest(0, least(avg(altitude), 5000)) / 5000 * 255) AS g,
    toUInt8(greatest(0, least(avg(ground_speed), 700)) / 700 * 255) AS b
FROM planes_mercator
WHERE ((time >= '2026-11-13 19:00:00' AND time < '2026-11-13 19:10:00')
    OR (time >= '2026-11-14 01:00:00' AND time < '2026-11-14 01:10:00'))
    AND mercator_x >= x0 AND mercator_x < x1
    AND mercator_y >= y0 AND mercator_y < y1
GROUP BY x, y
FORMAT PNG
