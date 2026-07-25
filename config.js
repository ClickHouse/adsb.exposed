/// AIS navigational status codes.
const SHIPS_NAV_STATUS = {
    0: 'under way (engine)', 1: 'at anchor', 2: 'not under command',
    3: 'restricted maneuverability', 4: 'constrained by draught',
    5: 'moored', 6: 'aground', 7: 'fishing', 8: 'under way (sailing)',
    9: 'code 9 (hsc)', 10: 'code 10 (wig)', 11: 'code 11',
    12: 'code 12', 13: 'code 13', 14: 'AIS-SART', 15: 'not defined'
};

const datasets = {
    "Planes": {
        notice: "© adsb.lol (ODbL v1.0), © airplanes.live, © adsbexchange.com",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'planes_mercator_sample100', sample: 100, priority: 1 },
            { table: 'planes_mercator_sample10',  sample: 10,  priority: 2 },
            { table: 'planes_mercator',           sample: 1,   priority: 3 },
        ],
        time: { column: 'time' },
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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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
        time: { column: 'date_created', exclude: 'date_created IS NOT NULL' },
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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

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
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'birds_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'date', exclude: "date != '1970-01-01'" },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS traces, minIf(date, date != '1970-01-01') AS first, maxIf(date, date != '1970-01-01') AS last
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.traces).toLocaleString()} traces.`;

                if (json.statistics.rows_read > 1) {
                    text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                }

                if (row.traces > 0) {
                    text += ` Time: ${row.first} — ${row.last}.`;
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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

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

            "Time": `WITH
bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

mercator_x >= tile_x_begin AND mercator_x < tile_x_end
AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

y * 1024 + x AS pos,

count() AS total,

pow(greatest(0, avg(dateDiff('day', '1970-01-01'::Date, date) / dateDiff('day', '1970-01-01'::Date, '2024-01-01'::Date))), 3) AS days1,
pow(greatest(0, avg(dateDiff('day', '2000-01-01'::Date, date) / dateDiff('day', '2000-01-01'::Date, '2024-01-01'::Date))), 3) AS days2,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,

color2 * 255 AS alpha,
color1 * 255 AS red,
days1 * 255 AS green,
days2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND date != '1970-01-01'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
        },
    },

    "Photos": {
        notice: "ODC-By v1.0, https://huggingface.co/datasets/bigdata-pw/Flickr",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'flickr_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'datetaken', exclude: "datetaken >= '2000-01-01' AND datetaken < '2026-01-01'" },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS photos
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.photos).toLocaleString()} photos.`;

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
                        SELECT url_sq, url_k AS url
                        FROM {table:Identifier}
                        WHERE ${condition} AND has(sizes, 'k')
                        ORDER BY count_faves DESC, count_views DESC
                        LIMIT 15`),
                id: 'report_thumbs',
                title: '',
                separator: '',
                html: (row => `<a target="_blank" href="${row.url}"><img src="${row.url_sq}"></img></a>`)
            },
            {
                query: (condition => `
                        WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                            AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                        SELECT arrayJoin(tags) AS tag, count() AS c
                        FROM {table:Identifier}
                        WHERE ${condition}
                        GROUP BY tag
                        ORDER BY c DESC
                        LIMIT 25`),
                field: 'tag',
                filter_expr: (value => `has(tags, ${value})`),
                id: 'report_tags',
                title: 'Tags: ',
                separator: ', ',
                content: (row => `${row.tag}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
        ],
        queries: {
            "Density": `WITH
bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

mercator_x >= tile_x_begin AND mercator_x < tile_x_end
AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

y * 1024 + x AS pos,

count() AS total,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
least(max(count_views), 1000) / 1000 AS color2,
least(max(count_faves), 100) / 100 AS color3,

255 AS alpha,
color1 * 255 AS red,
color2 * 255 AS green,
color3 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

            "Tags": `WITH
bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

mercator_x >= tile_x_begin AND mercator_x < tile_x_end
AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

y * 1024 + x AS pos,

count() AS total,
cityHash64(tags[1]) AS hash,

avg(hash MOD 256) AS color1,
avg(hash DIV 256 MOD 256) AS color2,
avg(hash DIV 65536 MOD 256) AS color3,

255 AS alpha,
color1 AS red,
color2 AS green,
color3 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
        },
    },

    "Ships": {
        notice: "© Konstantin Bogdanov, ClickHouse, Inc., data: © aishub.net",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'ais_mercator_sample100', sample: 100, priority: 1 },
            { table: 'ais_mercator_sample10',  sample: 10,  priority: 2 },
            { table: 'ais_mercator',           sample: 1,   priority: 3 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS traces,
                    uniq(mmsi) AS vessels,
                    round(avgIf(sog, sog < 60), 1) AS avg_sog,
                    min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.traces).toLocaleString()} traces from ${Number(row.vessels).toLocaleString()} vessels.`;

                if (row.traces > 0) {
                    text += ` Avg speed: ${row.avg_sog} kn. Time: ${row.first} — ${row.last}.`;
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
                    SELECT toString(mmsi) AS mmsi_str, count() AS c, round(avgIf(sog, sog < 60), 1) AS avg_sog
                    FROM {table:Identifier}
                    WHERE ${condition}
                    GROUP BY mmsi
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'mmsi_str',
                id: 'report_mmsi',
                title: 'MMSIs: ',
                separator: ', ',
                filter_expr: (value => `mmsi = ${value.replaceAll("'", "")}`),
                content: (row => `${row.mmsi_str} (${Number(row.c).toLocaleString()} pts, ${row.avg_sog} kn)`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT toString(nav_status) AS nav_status_str, count() AS c
                    FROM {table:Identifier}
                    WHERE ${condition}
                    GROUP BY nav_status
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'nav_status_str',
                id: 'report_navstatus',
                title: 'Nav status:\n',
                separator: ',\n',
                filter_expr: (value => `nav_status = ${value.replaceAll("'", "")}`),
                content: (row => `${SHIPS_NAV_STATUS[row.nav_status_str] || `code ${row.nav_status_str}`} (${Number(row.c).toLocaleString()})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT data_source, count() AS c
                    FROM {table:Identifier}
                    WHERE ${condition}
                    GROUP BY data_source
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'data_source',
                id: 'report_datasource',
                title: 'Source: ',
                separator: ', ',
                content: (row => `${row.data_source} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Speed": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 105)) / 105 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) NOT IN (111, 970, 972, 974, 979)
    AND mmsi >= 100000000
    AND sog < 60
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Fishing": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 15)) / 15 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) NOT IN (111, 970, 972, 974, 979)
    AND mmsi >= 100000000
    AND sog < 60
    AND nav_status = 7
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Anchored": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 5)) / 5 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) NOT IN (111, 970, 972, 974, 979)
    AND mmsi >= 100000000
    AND nav_status IN (1, 5)
    AND sog < 1
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Stopped": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 1)) AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) NOT IN (111, 970, 972, 974, 979)
    AND mmsi >= 100000000
    AND sog < 0.5
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"High-speed": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog) - 25, 25)) / 25 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) NOT IN (111, 970, 972, 974, 979)
    AND mmsi >= 100000000
    AND sog > 25 AND sog < 60
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Emergency": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 200)) / 200 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND (nav_status IN (2, 6, 14)
        OR intDiv(mmsi, 1000000) IN (111, 970, 972, 974, 979))
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Aircraft": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 500)) / 500 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
    AND intDiv(mmsi, 1000000) = 111
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"MarineCadastre": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() AS total,
    greatest(1000000 DIV {sampling:UInt32} DIV zoom_factor, count()) AS max_total,

    pow(total / max_total, 1/5) AS transparency,
    greatest(0, least(avg(sog), 30)) / 30 AS color2,

    255 AS alpha,
    (1 + transparency) / 2 * 0.9 * 255 AS red,
    transparency * 255 AS green,
    color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND data_source = 'marinecadastre'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "OSM": {
        notice: "© OpenStreetMap contributors, ODbL v1.0",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'osm_mercator_sample100', sample: 100, priority: 1 },
            { table: 'osm_mercator_sample10',  sample: 10,  priority: 2 },
            { table: 'osm_mercator',           sample: 1,   priority: 3 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS nodes,
                    uniq(uid) AS mappers,
                    min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.nodes).toLocaleString()} nodes by ${Number(row.mappers).toLocaleString()} mappers.`;

                if (row.nodes > 0) {
                    text += ` Edited: ${row.first} — ${row.last}.`;
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
                    SELECT name, count() AS c
                    FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'name',
                id: 'report_names',
                title: 'Names: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? ` (${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT amenity, count() AS c
                    FROM {table:Identifier}
                    WHERE amenity != '' AND ${condition}
                    GROUP BY amenity
                    ORDER BY c DESC
                    LIMIT 50`),
                field: 'amenity',
                id: 'report_amenities',
                title: 'Amenities: ',
                separator: ', ',
                content: (row => `${row.amenity} (${Number(row.c).toLocaleString()})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT arrayJoin(mapKeys(tags)) AS tag_key, count() AS c
                    FROM {table:Identifier}
                    WHERE ${condition}
                    GROUP BY tag_key
                    ORDER BY c DESC
                    LIMIT 50`),
                field: 'tag_key',
                filter_expr: (value => `mapContains(tags, ${value})`),
                id: 'report_tagkeys',
                title: 'Tags: ',
                separator: ', ',
                content: (row => `${row.tag_key} (${Number(row.c).toLocaleString()})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT user, count() AS c
                    FROM {table:Identifier}
                    WHERE user != '' AND ${condition}
                    GROUP BY user
                    ORDER BY c DESC
                    LIMIT 100`),
                field: 'user',
                id: 'report_users',
                title: 'Mappers: ',
                separator: ', ',
                content: (row => `${row.user} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Mappers": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,

    cityHash64(user) AS hash,
    hash MOD 256 AS h1,
    hash DIV 256 MOD 256 AS h2,

    (0.5 + 0.5 * transparency) * 255 AS alpha,
    avg(h1) AS red,
    avg(h2) AS green,
    avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,

    pow(least(1, total / 20000 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 20000000 * zoom_factor), 1/5) AS color3,

    255 AS alpha,
    color3 * 255 AS red,
    color2 * 255 AS green,
    color1 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Freshness": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,

    greatest(0, avg(timestamp::Int64 - '2007-01-01'::DateTime::Int64)
        / (now()::Int64 - '2007-01-01'::DateTime::Int64)) AS rel_time,

    255 * transparency AS alpha,
    255 * (1 - rel_time) AS red,
    255 * rel_time AS green,
    0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Trees": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,

    255 * transparency AS alpha,
    64 * transparency AS red,
    255 * (0.3 + 0.7 * transparency) AS green,
    32 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND "natural" = 'tree'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Street Lamps": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS transparency,

    255 * transparency AS alpha,
    255 AS red,
    200 * (0.5 + 0.5 * transparency) AS green,
    64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND highway = 'street_lamp'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Power Grid": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS transparency,

    transform(power,
              ['tower', 'pole', 'substation', 'generator', 'transformer'],
              [0x00FFFF, 0x00CC66, 0xFF00FF, 0xFFFF00, 0xFF8800], 0x8888FF) AS color,

    255 * (0.25 + 0.75 * transparency) AS alpha,
    avg(color DIV 0x10000) AS red,
    avg(color DIV 0x100 MOD 0x100) AS green,
    avg(color MOD 0x100) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND power != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Amenities": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 200 * zoom_factor), 1/5) AS transparency,

    cityHash64(amenity) AS hash,

    (0.25 + 0.75 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND amenity != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Shops": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 200 * zoom_factor), 1/5) AS transparency,

    cityHash64(shop) AS hash,

    (0.25 + 0.75 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND shop != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Railways": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS transparency,

    255 * (0.25 + 0.75 * transparency) AS alpha,
    255 * transparency AS red,
    64 * transparency AS green,
    16 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND railway != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,

"Versions": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,

    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,

    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,

    least(1, (avg(version) - 1) / 3) AS hot,

    255 * transparency AS alpha,
    255 * hot AS red,
    64 * hot AS green,
    255 * (1 - hot) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "GBIF": {
        notice: "© GBIF.org, occurrence data (CC0 & CC-BY), https://www.gbif.org/",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'gbif_mercator_sample10', sample: 10, priority: 1 },
            { table: 'gbif_mercator', sample: 1, priority: 2 },
        ],
        time: { column: 'eventdate', exclude: "eventdate > '1970-01-01'" },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS occurrences, uniq(species) AS species,
                    minIf(eventdate, eventdate > '1900-01-01') AS first, max(eventdate) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.occurrences).toLocaleString()} occurrences of ${Number(row.species).toLocaleString()} species.`;
                if (row.occurrences > 0) text += ` Dates: ${row.first} — ${row.last}.`;
                if (json.statistics.rows_read > 1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                return text;
            }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT scientificname, species, count() AS c
                    FROM {table:Identifier}
                    WHERE species != '' AND ${condition}
                    GROUP BY scientificname, species ORDER BY c DESC LIMIT 100`),
                field: 'species',
                wiki_field: 'species',
                id: 'report_species',
                title: 'Species: ',
                separator: ', ',
                content: (row => `${row.species}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT class, count() AS c FROM {table:Identifier}
                    WHERE class != '' AND ${condition}
                    GROUP BY class ORDER BY c DESC LIMIT 50`),
                field: 'class',
                wiki_field: 'class',
                id: 'report_classes',
                title: 'Class: ',
                separator: ', ',
                content: (row => `${row.class} (${Number(row.c).toLocaleString()})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT kingdom, count() AS c FROM {table:Identifier}
                    WHERE kingdom != '' AND ${condition}
                    GROUP BY kingdom ORDER BY c DESC LIMIT 20`),
                field: 'kingdom',
                wiki_field: 'kingdom',
                id: 'report_kingdoms',
                title: 'Kingdom: ',
                separator: ', ',
                content: (row => `${row.kingdom} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
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
"Kingdoms": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(kingdom) AS hash,
    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Classes": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(class) AS hash,
    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND class != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Birds": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(family) AS hash,
    pow(least(1, total / 300 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND class = 'Aves'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Mammals": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(family) AS hash,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND class = 'Mammalia'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Insects": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(family) AS hash,
    pow(least(1, total / 300 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND class = 'Insecta'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Plants": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(family) AS hash,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND kingdom = 'Plantae'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Fungi": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(family) AS hash,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS transparency,
    (0.35 + 0.65 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red,
    avg(hash DIV 256 MOD 256) AS green,
    avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND kingdom = 'Fungi'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Time": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS transparency,
    greatest(0, avg(toYear(eventdate) - 1950) / (2025 - 1950)) AS rel,
    255 * (0.35 + 0.65 * transparency) AS alpha,
    255 * (1 - rel) AS red,
    255 * rel AS green,
    64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND eventdate > '1950-01-01'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },


    "OSM History": {
        notice: "© OpenStreetMap contributors, ODbL v1.0 (full history)",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'osm_history_mercator_sample10', sample: 10, priority: 1 },
            { table: 'osm_history_mercator', sample: 1, priority: 2 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS versions, uniq(uid) AS mappers, min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.versions).toLocaleString()} node versions by ${Number(row.mappers).toLocaleString()} mappers.`; if (row.versions>0) text += ` Edited: ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT name, count() AS c FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name ORDER BY c DESC LIMIT 100`),
                field: 'name',
                id: 'report_name',
                title: 'Names: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT user, count() AS c FROM {table:Identifier}
                    WHERE user != '' AND ${condition}
                    GROUP BY user ORDER BY c DESC LIMIT 100`),
                field: 'user',
                id: 'report_user',
                title: 'Mappers: ',
                separator: ', ',
                content: (row => `${row.user}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 20000000 * zoom_factor), 1/5) AS color3,
    255 AS alpha,
    color3 * 255 AS red, color2 * 255 AS green, color1 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Freshness": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,
    greatest(0, avg(timestamp::Int64 - '2005-01-01'::DateTime::Int64) / (now()::Int64 - '2005-01-01'::DateTime::Int64)) AS rel,
    255 * (0.35 + 0.65 * transparency) AS alpha,
    255 * (1 - rel) AS red, 255 * rel AS green, 0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Mappers": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,
    cityHash64(user) AS hash, hash MOD 256 AS h1, hash DIV 256 MOD 256 AS h2,
    (0.5 + 0.5 * transparency) * 255 AS alpha,
    avg(h1) AS red, avg(h2) AS green, avg(least(255, greatest(0, 255 - (h1 + h2) / 2))) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Versions": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,
    least(1, (avg(version) - 1) / 5) AS hot,
    255 * (0.35 + 0.65 * transparency) AS alpha,
    255 * hot AS red, 64 * hot AS green, 255 * (1 - hot) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Edits per node": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 20000 * zoom_factor), 1/5) AS transparency,
    least(1, uniq(id) > 0 ? count() / uniq(id) / 6 : 0) AS churn,
    255 * (0.35 + 0.65 * transparency) AS alpha,
    255 * churn AS red, 128 * (0.35 + 0.65 * transparency) AS green, 255 * (1 - churn) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Buildings": {
        notice: "© Overture Maps Foundation, https://overturemaps.org/",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'overture_mercator_sample10', sample: 10, priority: 1 },
            { table: 'overture_mercator', sample: 1, priority: 2 },
        ],
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS buildings, uniqIf(name, name != '') AS named
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.buildings).toLocaleString()} buildings, ${Number(row.named).toLocaleString()} named.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT name, count() AS c FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name ORDER BY c DESC LIMIT 100`),
                field: 'name',
                id: 'report_name',
                title: 'Names: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT class, count() AS c FROM {table:Identifier}
                    WHERE class != '' AND ${condition}
                    GROUP BY class ORDER BY c DESC LIMIT 100`),
                field: 'class',
                id: 'report_class',
                title: 'Class: ',
                separator: ', ',
                content: (row => `${row.class}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT subtype, count() AS c FROM {table:Identifier}
                    WHERE subtype != '' AND ${condition}
                    GROUP BY subtype ORDER BY c DESC LIMIT 100`),
                field: 'subtype',
                id: 'report_subtype',
                title: 'Subtype: ',
                separator: ', ',
                content: (row => `${row.subtype}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 50000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 5000000 * zoom_factor), 1/5) AS color3,
    255 AS alpha,
    color1 * 255 AS red, color2 * 255 AS green, color3 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Height": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,
    least(1, avgIf(height, height > 0) / 50) AS tall,
    255 * (0.3 + 0.7 * transparency) AS alpha,
    255 * tall AS red, 255 * (1 - tall) * transparency AS green, 255 * (1 - tall) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Floors": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,
    least(1, avgIf(num_floors, num_floors > 0) / 20) AS tall,
    255 * (0.3 + 0.7 * transparency) AS alpha,
    255 * tall AS red, 128 * transparency AS green, 255 * (1 - tall) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Roof Shape": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(roof_shape) AS hash,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,
    (0.3 + 0.7 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red, avg(hash DIV 256 MOD 256) AS green, avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND roof_shape != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Named": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS transparency,
    avg(name != '') AS named,
    255 * transparency AS alpha,
    255 * (1 - named) AS red, 255 * named AS green, 64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Weather": {
        notice: "NOAA Integrated Surface Database (ISD), public domain",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'isd_mercator_sample10', sample: 10, priority: 1 },
            { table: 'isd_mercator', sample: 1, priority: 2 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS obs, uniq(station) AS stations, round(avgIf(temperature, isNotNull(temperature)),1) AS t, min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.obs).toLocaleString()} observations from ${Number(row.stations).toLocaleString()} stations.`; if (row.obs>0) text += ` Avg temp: ${row.t}°C. Time: ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT name, count() AS c FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name ORDER BY c DESC LIMIT 100`),
                field: 'name',
                id: 'report_name',
                title: 'Station: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? ` (${Number(row.c).toLocaleString()})` : ''}`)
            },
        ],
        queries: {
"Temperature": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() AS total,
    greatest(0, least(1, (avgIf(temperature, isNotNull(temperature)) + 30) / 70)) AS t,
    pow(least(1, total * {sampling:UInt32} / 50 * zoom_factor), 1/5) AS transparency,
    255 * (0.4 + 0.6 * transparency) AS alpha,
    255 * t AS red, 255 * (1 - abs(t - 0.5) * 2) AS green, 255 * (1 - t) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND isNotNull(temperature)
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Wind": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() AS total,
    least(1, avgIf(wind_speed, isNotNull(wind_speed)) / 20) AS w,
    pow(least(1, total * {sampling:UInt32} / 50 * zoom_factor), 1/5) AS transparency,
    255 * (0.4 + 0.6 * transparency) AS alpha,
    255 * w AS red, 255 * w AS green, 255 * (1 - w) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND isNotNull(wind_speed)
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Pressure": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() AS total,
    greatest(0, least(1, (avgIf(pressure, isNotNull(pressure)) - 980) / 60)) AS p,
    pow(least(1, total * {sampling:UInt32} / 50 * zoom_factor), 1/5) AS transparency,
    255 * (0.4 + 0.6 * transparency) AS alpha,
    255 * (1 - p) AS red, 128 AS green, 255 * p AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND isNotNull(pressure)
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Stations": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 5 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 50000 * zoom_factor), 1/5) AS color3,
    255 AS alpha,
    color1 * 255 AS red, color2 * 255 AS green, color3 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "iNaturalist": {
        notice: "© iNaturalist contributors, iNaturalist Open Data, https://inaturalist.org/",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'inat_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'observed_on', exclude: "observed_on > '2008-01-01'" },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS obs, uniq(name) AS species, uniq(observer_id) AS observers,
                    minIf(observed_on, observed_on > '2008-01-01') AS first, max(observed_on) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.obs).toLocaleString()} observations of ${Number(row.species).toLocaleString()} taxa by ${Number(row.observers).toLocaleString()} observers.`;
                if (row.obs > 0) text += ` Dates: ${row.first} — ${row.last}.`;
                if (json.statistics.rows_read > 1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                return text;
            }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT name, count() AS c FROM {table:Identifier}
                    WHERE name != '' AND ${condition}
                    GROUP BY name ORDER BY c DESC LIMIT 100`),
                field: 'name',
                wiki_field: 'name',
                id: 'report_name',
                title: 'Taxa: ',
                separator: ', ',
                content: (row => `${row.name}${row.c > 1 ? `\u00a0(${row.c})` : ''}`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT rank, count() AS c FROM {table:Identifier}
                    WHERE rank != '' AND ${condition}
                    GROUP BY rank ORDER BY c DESC LIMIT 30`),
                field: 'rank',
                id: 'report_rank',
                title: 'Rank: ',
                separator: ', ',
                content: (row => `${row.rank} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 10000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 1000000 * zoom_factor), 1/5) AS color3,
    255 AS alpha, color1 * 255 AS red, color3 * 255 AS green, color2 * 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Species": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(name) AS hash,
    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,
    (0.4 + 0.6 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red, avg(hash DIV 256 MOD 256) AS green, avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND name != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Research grade": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,
    avg(quality_grade = 'research') AS rg,
    255 * transparency AS alpha,
    255 * (1 - rg) AS red, 255 * rg AS green, 64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Observers": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(observer_id) AS hash,
    pow(least(1, total / 1000 * zoom_factor), 1/5) AS transparency,
    (0.4 + 0.6 * transparency) * 255 AS alpha,
    avg(hash MOD 256) AS red, avg(hash DIV 256 MOD 256) AS green, avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Time": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 100 * zoom_factor), 1/5) AS transparency,
    greatest(0, avg(toYear(observed_on) - 2008) / (2025 - 2008)) AS rel,
    255 * transparency AS alpha,
    255 * (1 - rel) AS red, 255 * rel AS green, 64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND observed_on > '2008-01-01'
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Taxi": {
        notice: "NYC TLC trip records (coordinate-bearing archive), public domain",
        bounds: [[40.55, -74.10], [40.90, -73.70]],
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'taxi_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'pickup_datetime' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS trips, round(avg(trip_distance),2) AS dist, round(avgIf(fare_amount, fare_amount>0),2) AS fare, min(pickup_datetime) AS first, max(pickup_datetime) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.trips).toLocaleString()} trips. Avg ${row.dist} mi, $${row.fare}.`; if (row.trips>0) text += ` ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 500 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 50000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 5000000 * zoom_factor), 1/5) AS color3,
    255 AS alpha, 255 * color3 AS red, 255 * color2 AS green, 255 * color1 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Tips": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    least(1, total / greatest(1, 60000000 DIV zoom_factor)) AS conf,
    least(1, greatest(0, avgIf(tip_amount / fare_amount, fare_amount > 0) / 0.3)) AS m,

    255 * conf AS alpha,
    255 * (1 - m) AS red,
    255 * m AS green,
    40 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND fare_amount > 0
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Trip distance": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    least(1, total / greatest(1, 60000000 DIV zoom_factor)) AS conf,
    least(1, avg(trip_distance) / 10) AS m,

    255 * conf AS alpha,
    255 * m AS red,
    255 * m AS green,
    255 * (1 - m) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND trip_distance > 0
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Fare": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    least(1, total / greatest(1, 60000000 DIV zoom_factor)) AS conf,
    least(1, avgIf(fare_amount, fare_amount > 0) / 60) AS m,

    255 * conf AS alpha,
    255 * m AS red,
    255 * (1 - m) AS green,
    40 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND fare_amount > 0
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Night rides": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    least(1, total / greatest(1, 60000000 DIV zoom_factor)) AS conf,
    avg(toHour(pickup_datetime) < 6 OR toHour(pickup_datetime) >= 22) AS m,

    255 * conf AS alpha,
    255 * (1 - m) AS red,
    180 * (1 - m) AS green,
    255 * m AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Fires": {
        notice: "NASA FIRMS (VIIRS S-NPP active fire), attribution required",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'firms_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'acq_date' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS fires, round(avg(frp),1) AS frp, min(acq_date) AS first, max(acq_date) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.fires).toLocaleString()} fire detections, avg FRP ${row.frp} MW.`; if (row.fires>0) text += ` ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT country, count() AS c FROM {table:Identifier}
                    WHERE country != '' AND ${condition}
                    GROUP BY country ORDER BY c DESC LIMIT 100`),
                field: 'country',
                id: 'report_country',
                title: 'Country: ',
                separator: ', ',
                content: (row => `${row.country} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 3000 * zoom_factor), 1/5) AS t,
    255 * (0.2 + 0.8 * t) AS alpha, 255 AS red, 200 * t AS green, 0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Intensity": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 3000 * zoom_factor), 1/5) AS t,
    least(1, avg(frp) / 100) AS frp,
    255 * (0.2 + 0.8 * t) AS alpha, 255 AS red, 255 * (1 - frp) AS green, 0 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Day / Night": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 3000 * zoom_factor), 1/5) AS t,
    avg(daynight = 'N') AS night,
    255 * (0.2 + 0.8 * t) AS alpha, 255 * (1 - night) AS red, 128 * t AS green, 255 * night AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Time": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 3000 * zoom_factor), 1/5) AS t,
    avg(toDayOfYear(acq_date)) / 366 AS doy,
    255 * (0.2 + 0.8 * t) AS alpha, 255 * doy AS red, 255 * (1 - doy) AS green, 128 * t AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Lightning": {
        notice: "NOAA GOES-16 GLM lightning, public domain",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'glm_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS flashes, min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.flashes).toLocaleString()} lightning flashes.`; if (row.flashes>0) text += ` ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    255 * (0.2 + 0.8 * t) AS alpha, 200 * t AS red, 200 * t AS green, 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Energy": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    least(1, avg(energy) / 2e-14) AS e,
    255 * (0.2 + 0.8 * t) AS alpha, 255 * e AS red, 255 * e AS green, 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Flash area": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    least(1, avg(area) / 3e8) AS a,
    255 * (0.2 + 0.8 * t) AS alpha, 255 * a AS red, 128 AS green, 255 * (1 - a) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Time": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    avg(toHour(timestamp)) / 24 AS h,
    255 * (0.2 + 0.8 * t) AS alpha, 255 * h AS red, 128 AS green, 255 * (1 - h) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Population": {
        notice: "Kontur Population 2023 (H3), CC BY 4.0",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'population_mercator', sample: 1, priority: 1 },
        ],
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT round(sum(population)) AS pop, count() AS cells
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total population ${Number(row.pop).toLocaleString()} in ${Number(row.cells).toLocaleString()} cells.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    sum(population) AS total,
    pow(least(1, total / 5000 * zoom_factor), 1/5) AS color1,
    pow(least(1, total / 500000 * zoom_factor), 1/5) AS color2,
    pow(least(1, total / 50000000 * zoom_factor), 1/5) AS color3,
    255 AS alpha, 255 * color3 AS red, 255 * color2 AS green, 255 * color1 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Log density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    sum(population) AS total,
    least(1, log10(1 + total) / 7) AS l,
    255 AS alpha, 255 * l AS red, 255 * (1 - abs(l - 0.5) * 2) AS green, 255 * (1 - l) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "Transit": {
        notice: "Live GTFS-Realtime vehicle positions © transit agencies",
        bounds: [[42.20, -71.30], [42.55, -70.95]],
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'gtfs_mercator', sample: 1, priority: 1 },
        ],
        time: { column: 'timestamp' },
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT count() AS positions, uniq(vehicle_id) AS vehicles, uniq(feed) AS feeds, min(timestamp) AS first, max(timestamp) AS last
                FROM {table:Identifier} WHERE ${condition}`),
            content: (json => { let row = json.data[0]; let text = `Total ${Number(row.positions).toLocaleString()} positions from ${Number(row.vehicles).toLocaleString()} vehicles (${row.feeds} feeds).`; if (row.positions>0) text += ` ${row.first} — ${row.last}.`; if (json.statistics.rows_read>1) text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`; return text; }),
        },
        reports: [
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT feed, count() AS c FROM {table:Identifier}
                    WHERE feed != '' AND ${condition}
                    GROUP BY feed ORDER BY c DESC LIMIT 100`),
                field: 'feed',
                id: 'report_feed',
                title: 'Feed: ',
                separator: ', ',
                content: (row => `${row.feed} (${Number(row.c).toLocaleString()})`)
            },
            {
                query: (condition => `
                    WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                        AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                    SELECT route_id, count() AS c FROM {table:Identifier}
                    WHERE route_id != '' AND ${condition}
                    GROUP BY route_id ORDER BY c DESC LIMIT 100`),
                field: 'route_id',
                id: 'report_route_id',
                title: 'Route: ',
                separator: ', ',
                content: (row => `${row.route_id} (${Number(row.c).toLocaleString()})`)
            },
        ],
        queries: {
"Density": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    255 * (0.3 + 0.7 * t) AS alpha, 64 AS red, 255 * t AS green, 255 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Routes": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    cityHash64(route_id) AS hash,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    255 * (0.3 + 0.7 * t) AS alpha,
    avg(hash MOD 256) AS red, avg(hash DIV 256 MOD 256) AS green, avg(hash DIV 65536 MOD 256) AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile AND route_id != ''
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
"Speed": `WITH
    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
    tile_size * {x:UInt32} AS tile_x_begin,
    tile_size * ({x:UInt32} + 1) AS tile_x_end,
    tile_size * {y:UInt32} AS tile_y_begin,
    tile_size * ({y:UInt32} + 1) AS tile_y_end,
    mercator_x >= tile_x_begin AND mercator_x < tile_x_end
    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
    y * 1024 + x AS pos,

    count() * {sampling:UInt32} AS total,
    pow(least(1, total / 50 * zoom_factor), 1/5) AS t,
    least(1, avg(speed) / 30) AS s,
    255 * (0.3 + 0.7 * t) AS alpha, 255 * s AS red, 255 * (1 - s) AS green, 64 AS blue

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`
        }
    },

    "You": {
        notice: "this website",
        endpoints: [
            {
                name: "Cloud (Real-Time)",
                urls: [
                    {
                        url: "https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                        sticky: "https://{hash}.sticky.kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com",
                    }
                ]
            },
        ],
        levels: [
            { table: 'stats', sample: 1, priority: 1 },
        ],
        time: { column: 'time' },
        disable_cache: true,
        report_total: {
            query: (condition => `
                WITH mercator_x >= {left:UInt32} AND mercator_x < {right:UInt32}
                    AND mercator_y >= {top:UInt32} AND mercator_y < {bottom:UInt32} AS in_tile
                SELECT
                    count() AS traces
                FROM {table:Identifier}
                WHERE ${condition}`),
            content: (json => {
                let row = json.data[0];
                let text = `Total ${Number(row.traces).toLocaleString()} traces.`;

                if (json.statistics.rows_read > 1) {
                    text += ` Processed ${Number(json.statistics.rows_read).toLocaleString()} rows.`;
                }

                return text;
            }),
        },
        reports: [],
        queries: {
            "Density": `WITH
bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,

tile_size * {x:UInt32} AS tile_x_begin,
tile_size * ({x:UInt32} + 1) AS tile_x_end,

tile_size * {y:UInt32} AS tile_y_begin,
tile_size * ({y:UInt32} + 1) AS tile_y_end,

mercator_x >= tile_x_begin AND mercator_x < tile_x_end
AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,

bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,

y * 1024 + x AS pos,

count() AS total,

pow(least(1, total / 100 * zoom_factor), 1/5) AS color1,
avg(least(greatest(0, zoom - 3), 6) / 6) AS color2,
avg(least(1, greatest(0, zoom - 6) / 6)) AS color3,

255 AS alpha,
(1 - greatest(color2, color3)) * 255 AS blue,
least(1, color2 + color3) * 255 AS red,
(color3) * 255 AS green

SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8
FROM {table:Identifier}
WHERE in_tile
GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024`,
        },
    },
};
