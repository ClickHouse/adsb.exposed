let queries = {
"Speed & Velocity": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Boeing vs. Airbus": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    sum(desc LIKE 'BOEING%') AS boeing,
    sum(desc LIKE 'AIRBUS%') AS airbus,
    sum(NOT (desc LIKE 'BOEING%' OR desc LIKE 'AIRBUS%')) AS other,

    greatest(1000000 DIV zoom_factor, total) AS max_total,
    greatest(1000000 DIV zoom_factor, boeing) AS max_boeing,
    greatest(1000000 DIV zoom_factor, airbus) AS max_airbus,
    greatest(1000000 DIV zoom_factor, other) AS max_other,

    pow(total / max_total, 1/5) AS transparency,

    255 * (1 + transparency) / 2 AS a,
    pow(boeing, 1/5) * 256 DIV (1 + pow(max_boeing, 1/5)) AS r,
    pow(airbus, 1/5) * 256 DIV (1 + pow(max_airbus, 1/5)) AS g,
    pow(other, 1/5) * 256 DIV (1 + pow(max_other, 1/5)) AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Helicopters": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 500)) / 500 AS color1,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color3,
    greatest(0, least(avg(ground_speed), 200)) / 200 AS color2,

    255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'A7' AND ground_speed < 200
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Hi-Performance": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, total) AS max_total,

    pow(total / max_total, 1/5) AS transparency,

    0 AS r,
    255 AS g,
    255 AS b,

    255 * transparency AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'A6'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Supersonic": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    (greatest(0, least(avg(ground_speed), 1000)) - 666) / 334 AS color2,

    255 AS a,
    color2 * 255 AS r,
    color1 * 255 AS g,
    least(1, count() / 10) * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND ground_speed > 666
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Light": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, total) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 * transparency AS r,
    255 * color2 AS g,
    255 * color1 AS b,
    255 * (1/4 + 3/4 * transparency) AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'A1'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Vertical Speed": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    least(255, 2 * greatest(r, g)) AS a,
    255 * least(1, avg(greatest(0, vertical_rate)) / 5000) AS g,
    255 * least(1, avg(least(0, vertical_rate)) / -5000) AS r,
    0 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Roll Angle": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    255 * least(1, avg(abs(roll_angle)) / 10) AS a,
    255 * avg(max2(0, roll_angle)) / 21 AS r,
    255 * avg(min2(0, roll_angle)) / -21 AS g,
    (1 - a) AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Year": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, total) AS max_total,

    pow(total / max_total, 1/5) AS transparency,

    255 * transparency AS a,
    255 * avg(year < 2000) AS r,
    255 * avg(year >= 2010) AS g,
    a AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND year != 0
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"A380": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(100000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND t = 'A388'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"IL-76": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS a,
    255 AS r,
    color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND t = 'IL76'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"F-16": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    transparency * 255 AS a,
    255 AS r,
    color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND t = 'F16'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"KLM": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(100000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND aircraft_flight LIKE 'KLM%'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"N2163J": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    max(total) OVER () AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 AS a,
    transparency * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND t.r = 'N2163J'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Gliders": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(100000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS b,
    255 * transparency * (color1 + color2) / 2 AS g,
    255 * (1 - color1) AS r,
    255 * (1 + transparency) / 2 AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'B1'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Ultralight": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(100000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS b,
    255 * transparency * (color1 + color2) / 2 AS g,
    255 * (1 - color1) AS r,
    255 * (1 + transparency) / 2 AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'B4'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Event Time": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    avg(time::Float64) AS offset,
    min(offset) OVER () AS min_offset,
    max(offset) OVER () AS max_offset,

    (1 + offset - min_offset) / (1 + max_offset - min_offset) AS rel_time,

    255 AS a,
    255 * rel_time AS g,
    255 * (1 - rel_time) AS r,
    0 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Weekends": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    toDayOfWeek(date + INTERVAL lon / 15 HOUR) > 5 AS weekend,
    avg(weekend) AS c_weekend,
    avg(NOT weekend) AS c_weekday,

    c_weekend * 2.5 > c_weekday AS mostly_weekends,

    255 * transparency AS a,
    255 * c_weekend * mostly_weekends AS r,
    r / 2 AS g,
    255 * c_weekday * (NOT mostly_weekends) AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Elon Musk": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    transform(t.r, ['N628TS', 'N272BG', 'N502SX', 'N140FJ'], [0xFF8888, 0x88FF88, 0xAAAAFF, 0xFFFF00], 0) AS color,

    255 AS a,
    avg(color DIV 0x10000) AS r,
    avg(color DIV 0x100 MOD 0x100) AS g,
    avg(color MOD 0x100) AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND t.r IN ('N628TS', 'N272BG', 'N502SX', 'N140FJ')
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Military": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND dbFlags = 1
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Steep": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(100000 DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 20000)) / 20000 AS color3,
    least(avg(abs(vertical_rate)), 10000) / 10000 AS color2,

    (1 + transparency) / 2 * 255 AS a,
    (1 + transparency) / 2 * (1 - color3) * 255 AS r,
    transparency * color1 * 255 AS g,
    color2 * 255 AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND ground_speed > 0 AND ground_speed < 50 AND abs(vertical_rate) > 5000
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Emergency": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    transform(aircraft_emergency,
              ['general', 'nordo', 'downed', 'lifeguard', 'reserved', 'unlawful', 'minfuel'],
              [0x0000FF, 0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0xFF00FF, 0xFFFFFF], 0) AS color,

    255 AS a,
    avg(color DIV 0x10000) AS r,
    avg(color DIV 0x100 MOD 0x100) AS g,
    avg(color MOD 0x100) AS b

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND aircraft_emergency NOT IN ('', 'none')
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Balloons": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 10000)) / 10000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS b,
    255 * color1 AS r,
    255 * (1 - color1) AS g,
    255 * transparency AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'B2'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Ground Vehicles": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt16} AS tile_x_begin,
    tile_size * ({x:UInt16} + 1) AS tile_x_end,

    tile_size * {y:UInt16} AS tile_y_begin,
    tile_size * ({y:UInt16} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000 DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(ground_speed), 50)) / 50 AS color,

    255 * transparency * color AS g,
    255 * (1 - color) AS r,
    255 * color AS b,
    255 AS a

SELECT round(r)::UInt8, round(g)::UInt8, round(b)::UInt8, round(a)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category IN ('C1', 'C2')
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
};