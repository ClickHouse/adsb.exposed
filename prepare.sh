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
                clickhouse client --host driel7jwie.eu-west-1.aws.clickhouse-staging.com --secure --password "$PASSWORD" --query "
                    WITH 1024 AS w, 1024 AS h, w * h AS pixels,
                        cutToFirstSignificantSubdomain(domain) AS tld,
                        sipHash64(tld) AS hash, 
                        hash MOD 256 AS r, hash DIV 256 MOD 256 AS g, hash DIV 65536 MOD 256 AS b,
                        toUInt32(ip) AS num,

                        mortonDecode(2, num) AS src_coord,

                        bitShiftRight(65536, ${zoom}) AS crop_size,
                        ${tile_x} * crop_size AS left,
                        ${tile_y} * crop_size AS top,
                        left + crop_size AS right,
                        top + crop_size AS bottom,

                        (src_coord.1 >= left AND src_coord.1 < right) AND (src_coord.2 >= top AND src_coord.2 < bottom) AS in_tile,

                        (src_coord.1 - left) DIV (crop_size DIV w) AS x,
                        (src_coord.2 - top)  DIV (crop_size DIV h) AS y

                    SELECT avg(r)::UInt8, avg(g)::UInt8, avg(b)::UInt8
                    FROM dns_parsed
                    WHERE in_tile
                    GROUP BY x, y
                    ORDER BY y * w + x WITH FILL FROM 0 TO 1024*1024
                " --progress
            ) | pnmtopng > $filename

        done
    done
done
