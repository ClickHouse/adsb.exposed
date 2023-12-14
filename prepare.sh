#!/bin/bash

for zoom in {0..6}
do
    num_tiles=$((2**zoom))

    for tile_x in $(seq 0 $(($num_tiles - 1)))
    do
        for tile_y in $(seq 0 $(($num_tiles - 1)))
        do
            filename="tiles/${zoom}-${tile_x}-${tile_y}.png"
            echo $filename

            [ -s "$filename" ] ||
            (
                echo 'P3 1024 1024 255';
                clickhouse client --host kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com --secure --password 'Mol_18sk0SDDI' --query "
                    WITH 1024 AS w, 1024 AS h, w * h AS pixels,

                        ((lon + 180) / 360) AS rel_x,
                        1/2 - log(tan((lat + 90) / 360 * pi())) / 2 / pi() AS rel_y,

                        pow(2, ${zoom}) AS zoom_factor,
                        (rel_x * zoom_factor)::UInt16 AS tile_x,
                        (rel_y * zoom_factor)::UInt16 AS tile_y,

                        (1024 * (rel_x * zoom_factor - tile_x))::UInt16 AS x,
                        (1024 * (rel_y * zoom_factor - tile_y))::UInt16 AS y,

                        y * w + x AS pos,

                        count() AS total,
                        sum(desc LIKE 'BOEING%') AS boeing,
                        sum(desc LIKE 'AIRBUS%') AS airbus,
                        sum(desc LIKE 'EMBRAER%') AS embraer,

                        max(total) OVER () AS max_total,
                        max(boeing) OVER () AS max_boeing,
                        max(airbus) OVER () AS max_airbus,
                        max(embraer) OVER () AS max_embraer,

                        pow(total / max_total, 1/5) AS transparency,
                        greatest(0, least(avg(altitude), 50000)) / 50000 AS color1,
                        greatest(0, least(avg(ground_speed), 700)) / 700 AS color2,

                        transparency * 255 AS r,
                        transparency * color1 * 255 AS g,
                        transparency * color2 * 255 AS b

                        SELECT round(r), round(g), round(b)

                        FROM planes
                        WHERE tile_x = ${tile_x} AND tile_y = ${tile_y}
                        GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024
                " --progress
            ) | pnmtopng > $filename

        done
    done
done
