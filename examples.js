let queries = {
"Density": `WITH
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

    pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

    255 AS alpha,
    color1 * 255 AS red,
    color2 * 255 AS green,
    color3 * 255 AS blue

    SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
    FROM {table:Identifier}
    WHERE in_tile
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Old vs New": `WITH
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

    greatest(0, avg(date_created::Int32 - '2009-01-01'::Date::Int32) / (today()::Int32 - '2009-01-01'::Date::Int32)) AS color1,
    pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,

    255 AS alpha,
    color1 * 255 AS red,
    color2 * 255 AS green,
    color2 * 255 AS blue

    SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
    FROM {table:Identifier}
    WHERE in_tile AND date_created IS NOT NULL
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Countries": `WITH
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

    cityHash64(country) MOD 256 AS color1,
    cityHash64(country) DIV 256 MOD 256 AS color2,
    cityHash64(country) DIV 65536 MOD 256 AS color3,

    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,

    transparency * 255 AS alpha,
    avg(color1) AS red,
    avg(color2) AS green,
    avg(color3) AS blue

    SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
    FROM {table:Identifier}
    WHERE in_tile
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
};
