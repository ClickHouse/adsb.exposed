-- Renders the animation from the per-frame, per-pixel aggregates in `pixels.native`.
-- Every row of the result is one pixel of one frame: (t, x, y, r, g, b).
-- Rows are painted in the order they arrive, so the layers are sorted: background first, text last.

WITH
    1456 AS width,          -- map width in pixels
    840 AS map_height,      -- the timeline goes below the map
    288 AS frames,          -- one frame per 5 minutes

    pixels AS
    (
        SELECT * FROM file('pixels.native')
        WHERE px < width AND py < map_height AND frame < frames
    ),

    -- The faint trace of the whole day, repeated in every frame, so that the outline of the US
    -- is still there when the sky is empty.
    ghost AS
    (
        SELECT px, py, toUInt8(pow(log1p(total) / log1p(max(total) OVER ()), 1.5) * 55) AS v
        FROM (SELECT px, py, sum(c) AS total FROM pixels GROUP BY px, py)
        QUALIFY v >= 4
    ),

    -- The number of positions in every frame, for the timeline.
    activity AS
    (
        SELECT frame, sum(c) / max(sum(c)) OVER () AS share
        FROM pixels
        GROUP BY frame
    ),

    -- A 3x5 bitmap font: five rows of three bits each.
    map(
        '0', '111101101101111', '1', '010110010010111', '2', '111001111100111', '3', '111001111001111',
        '4', '101101111001001', '5', '111100111001111', '6', '111100111101111', '7', '111001001001001',
        '8', '111101111101111', '9', '111101111001111', ':', '000010000010000', '.', '000000000000010',
        '-', '000000111000000', ' ', '000000000000000',
        'A', '010101111101101', 'B', '110101110101110', 'C', '111100100100111', 'D', '110101101101110',
        'E', '111100110100111', 'F', '111100110100100', 'G', '111100101101111', 'I', '111010010010111',
        'N', '110101101101101', 'O', '010101101101010', 'P', '111101111100100', 'R', '110101110101101',
        'S', '111100111001111', 'T', '111010010010010', 'U', '101101101101111', 'V', '101101101101010',
        'X', '101101010101101', 'Y', '101101010010010') AS font,

    -- All the text, one row per string: the frame, the position of the top-left corner, the scale, the color.
    texts AS
    (
        SELECT number AS frame, 20 AS x0, 16 AS y0, 4 AS scale,
            'FAA OUTAGE - FRIDAY NOV 13 2026' AS text, 255 AS r, 255 AS g, 255 AS b
        FROM numbers(frames)
        UNION ALL
        SELECT number, 20, 44, 4,
            formatDateTime(toDateTime('2026-11-13 05:00:00', 'UTC') + number * 300, '%H:%i ET', 'America/New_York')
            || '   ' || formatDateTime(toDateTime('2026-11-13 05:00:00', 'UTC') + number * 300, '%H:%i UTC', 'UTC'),
            255, 210, 110
        FROM numbers(frames)
        UNION ALL
        SELECT number, width - 20 - 12 * 8, map_height - 22, 2, 'ADSB.EXPOSED', 150, 150, 150
        FROM numbers(frames)
        UNION ALL
        -- The hour labels under the timeline: 00:00, 03:00, ..., 24:00.
        SELECT frame, toInt32(30 + (width - 60) * hour / 24 - 2.5 * 8), map_height + 72, 2,
            leftPad(toString(hour), 2, '0') || ':00', 150, 150, 150
        FROM (SELECT number * 3 AS hour FROM numbers(9)) ARRAY JOIN range(frames) AS frame
    ),

    text_pixels AS
    (
        SELECT frame,
            x0 + ((char_num - 1) * 4 + bit % 3) * scale + dx AS x,  -- glyphs are 3 pixels wide, plus 1 of spacing
            y0 + intDiv(bit, 3) * scale + dy AS y,
            r, g, b
        FROM texts
        ARRAY JOIN arrayEnumerate(splitByString('', text)) AS char_num
        ARRAY JOIN range(15) AS bit
        ARRAY JOIN range(scale) AS dx
        ARRAY JOIN range(scale) AS dy
        WHERE substring(font[substring(text, char_num, 1)], bit + 1, 1) = '1'
    ),

    -- The timeline: a bar for every frame, highlighted for the current one.
    timeline AS
    (
        SELECT
            current AS frame,
            toInt32(floor(30 + (width - 60) * bar / frames)) AS xa,
            toInt32(floor(30 + (width - 60) * (bar + 1) / frames)) - 1 AS xb,
            toInt32(48 * share) AS h,
            multiIf(bar = current, (255, 200, 80), bar < current, (110, 110, 110), (55, 55, 55)) AS color
        FROM (SELECT frame AS bar, share FROM activity) ARRAY JOIN range(frames) AS current
    )

SELECT t, toInt32(x) AS x, toInt32(y) AS y, toUInt8(round(r)) AS r, toUInt8(round(g)) AS g, toUInt8(round(b)) AS b
FROM
(
    -- Layer 0: the ghost of the whole day.
    SELECT 0 AS layer, frame AS t, px AS x, py AS y, v AS r, v AS g, v AS b
    FROM ghost ARRAY JOIN range(frames) AS frame

    UNION ALL

    -- Layer 1: the aircraft, colored with the same formula as on adsb.exposed: red fades with the altitude,
    -- green grows over the first 5000 feet (so the climbs and descents near airports are yellow), blue is the speed.
    SELECT 1, frame, px, py,
        (1 + transparency) / 2 * (1 - least(alt, 50000) / 50000) * 255,
        transparency * greatest(0, least(alt, 5000)) / 5000 * 255,
        greatest(0, least(speed, 700)) / 700 * 255
    FROM (SELECT *, pow(least(c / 30, 1), 1 / 5) AS transparency FROM pixels)

    UNION ALL

    -- Layer 2: the timeline.
    SELECT 2, frame, xa + dx, map_height + 66 - dy, color.1, color.2, color.3
    FROM timeline
    ARRAY JOIN range(xb - xa + 1) AS dx
    ARRAY JOIN range(h + 1) AS dy

    UNION ALL

    -- Layer 3: the text.
    SELECT 3, frame, x, y, r, g, b
    FROM text_pixels
)
ORDER BY layer

INTO OUTFILE 'faa-outage-2026-11-13.png' TRUNCATE
FORMAT PNG
SETTINGS
    output_format_image_width = 1456,
    output_format_image_height = 930,
    -- One unit of `t` is 2/25 of a second: 80 ms per frame, the whole day in 23 seconds.
    output_format_image_time_multiplier_seconds = 2,
    output_format_image_time_divisor_seconds = 25
