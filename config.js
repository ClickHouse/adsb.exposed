const datasets = {
    "Planes": {
        notice: "© adsb.lol (ODbL v1.0), © airplanes.live, © adsbexchange.com",
        endpoints: [
            {
                name: "Any",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    },
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
            {
                name: "Self-hosted (Snapshot)",
                urls: [
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'planes_mercator_sample100', sample: 100, priority: 1 },
            { table: 'planes_mercator_sample10',  sample: 10,  priority: 2 },
            { table: 'planes_mercator',           sample: 1,   priority: 3 },
        ],
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS traces,
                    uniq(r) AS aircrafts,
                    uniq(t) AS types,
                    uniqIf(aircraft_flight,
                    aircraft_flight != '') AS flights,
                    min(time) AS first, max(time) AS last
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.traces).toLocaleString()} traces, ${Number(row.aircrafts).toLocaleString()} aircrafts of ${Number(row.types).toLocaleString()} types, ${Number(row.aircrafts).toLocaleString()} flight nums.`;

                if (row.traces > 0) {
                    text += ` Time: ${row.first} — ${row.last}.`;
                }

                if (json.statistics.rows_read > 1) {
                    text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                }

                return text;
            }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT aircraft_flight, count() AS c
                    FROM {table:Identifier}
                    WHERE aircraft_flight != '' AND NOT startsWith(aircraft_flight, '@@@') AND ${condition}
                    GROUP BY aircraft_flight
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'aircraft_flight',
                id: 'report_flights',
                title: 'Flights: ',
                separator: ', ',
                content: (row => row.aircraft_flight)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT t, anyIf(desc, desc != '') AS desc, count() AS c
                    FROM {table:Identifier}
                    WHERE t != '' AND ${condition}
                    GROUP BY t
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 't',
                wiki_field: 'desc',
                id: 'report_types',
                title: 'Types:\n',
                separator: ',\n',
                content: (row => `${row.t} (${row.desc})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT r, count() AS c
                    FROM {table:Identifier}
                    WHERE r != '' AND ${condition}
                    GROUP BY r
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'r',
                id: 'report_regs',
                title: 'Registration: ',
                separator: ', ',
                content: (row => row.r)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT ownOp, count() AS c
                    FROM {table:Identifier}
                    WHERE ownOp != '' AND ${condition}
                    GROUP BY ownOp
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'ownOp',
                id: 'report_owners',
                title: 'Owner:\n',
                separator: ',\n',
                content: (row => row.ownOp)
            },
        ],
        queries: {
"Altitude & Velocity": `WITH
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, total) AS max_total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, boeing) AS max_boeing,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, airbus) AS max_airbus,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, other) AS max_other,

    pow(total / max_total, 1/5) AS transparency,

    255 * (1 + transparency) / 2 AS alpha,
    pow(boeing, 1/5) * 256 DIV (1 + pow(max_boeing, 1/5)) AS red,
    pow(airbus, 1/5) * 256 DIV (1 + pow(max_airbus, 1/5)) AS green,
    pow(other, 1/5) * 256 DIV (1 + pow(max_other, 1/5)) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 500)) / 500 AS color1,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color3,
    greatest(0, least(avg(ground_speed), 200)) / 200 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, total) AS max_total,

    pow(total / max_total, 1/5) AS transparency,

    0 AS red,
    255 AS green,
    255 AS blue,

    255 * transparency AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category = 'A6'
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, total) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 * transparency AS red,
    255 * color2 AS green,
    255 * color1 AS blue,
    255 * (1/4 + 3/4 * transparency) AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    least(255, 2 * greatest(red, green)) AS alpha,
    255 * least(1, avg(greatest(0, vertical_rate)) / 5000) AS green,
    255 * least(1, avg(least(0, vertical_rate)) / -5000) AS red,
    0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    255 * least(1, avg(abs(roll_angle)) / 10) AS alpha,
    255 * avg(max2(0, roll_angle)) / 21 AS red,
    255 * avg(min2(0, roll_angle)) / -21 AS green,
    (1 - alpha) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, total) AS max_total,

    pow(total / max_total, 1/5) AS transparency,

    255 * transparency AS alpha,
    255 * avg(year < 2000) AS red,
    255 * avg(year >= 2010) AS green,
    alpha AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    255 AS alpha,
    255 AS red,
    color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    transparency * 255 AS alpha,
    255 AS red,
    color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    255 AS alpha,
    transparency * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND r = 'N2163J'
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS blue,
    255 * transparency * (color1 + color2) / 2 AS green,
    255 * (1 - color1) AS red,
    255 * (1 + transparency) / 2 AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS blue,
    255 * transparency * (color1 + color2) / 2 AS green,
    255 * (1 - color1) AS red,
    255 * (1 + transparency) / 2 AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    255 AS alpha,
    255 * rel_time AS green,
    255 * (1 - rel_time) AS red,
    0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    toDayOfWeek(date + INTERVAL lon / 15 HOUR) > 5 AS weekend,
    avg(weekend) AS c_weekend,
    avg(NOT weekend) AS c_weekday,

    c_weekend * 2.5 > c_weekday AS mostly_weekends,

    255 * transparency AS alpha,
    255 * c_weekend * mostly_weekends AS red,
    red / 2 AS green,
    255 * c_weekday * (NOT mostly_weekends) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    transform(r, ['N628TS', 'N272BG', 'N502SX', 'N140FJ'], [0xFF8888, 0x88FF88, 0xAAAAFF, 0xFFFF00], 0) AS color,

    255 AS alpha,
    avg(color DIV 0x10000) AS red,
    avg(color DIV 0x100 MOD 0x100) AS green,
    avg(color MOD 0x100) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier} AS t
WHERE in_tile AND r IN ('N628TS', 'N272BG', 'N502SX', 'N140FJ')
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
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 50000)) / 50000 AS color3,
    greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(altitude), 5000)) / 5000 AS color1,
    greatest(0, least(avg(altitude), 20000)) / 20000 AS color3,
    least(avg(abs(vertical_rate)), 10000) / 10000 AS color2,

    (1 + transparency) / 2 * 255 AS alpha,
    (1 + transparency) / 2 * (1 - color3) * 255 AS red,
    transparency * color1 * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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

    255 AS alpha,
    avg(color DIV 0x10000) AS red,
    avg(color DIV 0x100 MOD 0x100) AS green,
    avg(color MOD 0x100) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(altitude), 10000)) / 10000 AS color1,
    greatest(0, least(avg(ground_speed), 100)) / 100 AS color2,

    255 * color2 AS blue,
    255 * color1 AS red,
    255 * (1 - color1) AS green,
    255 * transparency AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
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
    greatest(1000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    greatest(0, least(avg(ground_speed), 50)) / 50 AS color,

    255 * transparency * color AS green,
    255 * (1 - color) AS red,
    255 * color AS blue,
    255 AS alpha

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_category IN ('C1', 'C2')
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"All Airlines": `WITH
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
    greatest(100000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,
    pow(total / max_total, 1/5) AS transparency,

    cityHash64(substring(aircraft_flight, 1, 3)) AS hash,

    transparency * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND aircraft_flight != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Places": {
        notice: "© Foursquare Labs, Inc., Apache 2.0",
        endpoints: [
            {
                name: "Any",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    },
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
            {
                name: "Self-hosted (Snapshot)",
                urls: [
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'foursquare_mercator', sample: 1, priority: 1 },
        ],
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS places
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.places).toLocaleString()} places.`;

                if (json.statistics.rows_read > 1) {
                    text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                }

                return text;
            }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT name, count() AS c
                    FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'name',
                id: 'report_names',
                title: 'Places: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? ` (${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT category, count() AS c
                    FROM {table:Identifier}
                    WHERE category != '' AND ${condition}
                    GROUP BY category
                    ORDER BY c DESC
                    LIMIT 25`),
                field: 'category',
                id: 'report_categories',
                title: 'Categories: ',
                separator: '\n',
                content: (row => `${row.category} (${row.c})`)
            },
        ],
        queries: {
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
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Coffeeshops": `WITH
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
    WHERE in_tile AND category = 'Retail > Marijuana Dispensary'
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Casinos": `WITH
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
    WHERE in_tile AND date_created IS NOT NULL AND category LIKE '%Casino%'
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Boats": `WITH
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
    WHERE in_tile AND date_created IS NOT NULL AND category = 'Travel and Transportation > Boat or Ferry'
    GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        },
    },

    "Birds": {
        notice: "© Cornell Lab of Ornithology. eBird Observation Dataset. CC BY 4.0",
        endpoints: [
            {
                name: "Any",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    },
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
            {
                name: "Self-hosted (Snapshot)",
                urls: [
                    {
                        url: "https://fly-selfhosted-backend-3.clickhouse.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'birds_mercator', sample: 1, priority: 1 },
        ],
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS places
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.places).toLocaleString()} traces.`;

                if (json.statistics.rows_read > 1) {
                    text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                }

                return text;
            }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT vernacularname, count() AS c
                    FROM {table:Identifier}
                    WHERE vernacularname != '' AND ${condition}
                    GROUP BY vernacularname
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'vernacularname',
                wiki_field: 'vernacularname',
                id: 'report_names',
                title: 'Name: ',
                separator: ', ',
                content: (row => `${row.vernacularname}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT order, count() AS c
                    FROM {table:Identifier}
                    WHERE order != '' AND ${condition}
                    GROUP BY order
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'order',
                wiki_field: 'order',
                id: 'report_orders',
                title: 'Order: ',
                separator: ', ',
                content: (row => `${row.order}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT family, count() AS c
                    FROM {table:Identifier}
                    WHERE family != '' AND ${condition}
                    GROUP BY family
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'family',
                wiki_field: 'family',
                id: 'report_families',
                title: 'Family: ',
                separator: ', ',
                content: (row => `${row.family}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
        ],
        queries: {
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
color3 * 255 AS red,
color2 * 255 AS green,
color1 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Order": `WITH
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

cityHash64(order) AS hash,
hash MOD 256 AS h1,
hash DIV 256 MOD 256 AS h2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

(0.5 + 0.5 * color2) * 255 AS alpha,
avg(h1) AS red,
avg(h2) AS green,
avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Family": `WITH
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

cityHash64(family) AS hash,
hash MOD 256 AS h1,
hash DIV 256 MOD 256 AS h2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

(0.5 + 0.5 * color2) * 255 AS alpha,
avg(h1) AS red,
avg(h2) AS green,
avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Genus": `WITH
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

cityHash64(genus) AS hash,
hash MOD 256 AS h1,
hash DIV 256 MOD 256 AS h2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

(0.5 + 0.5 * color2) * 255 AS alpha,
avg(h1) AS red,
avg(h2) AS green,
avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Epithet": `WITH
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

cityHash64(specificepithet) AS hash,
hash MOD 256 AS h1,
hash DIV 256 MOD 256 AS h2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

(0.5 + 0.5 * color2) * 255 AS alpha,
avg(h1) AS red,
avg(h2) AS green,
avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Name": `WITH
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

cityHash64(vernacularname) AS hash,
hash MOD 256 AS h1,
hash DIV 256 MOD 256 AS h2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

(0.5 + 0.5 * color2) * 255 AS alpha,
avg(h1) AS red,
avg(h2) AS green,
avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Flocks": `WITH
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

255 AS alpha,
max(least(255, individualcount)) AS blue,
max(least(255, individualcount / 256)) AS green,
max(least(255, individualcount / 65536)) AS red

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
        },
    },
};
