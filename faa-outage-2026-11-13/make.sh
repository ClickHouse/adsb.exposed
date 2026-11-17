#!/bin/bash
# Renders the animation of the FAA outage on Nov 13, 2026: downloads the aggregates, renders them with FORMAT PNG,
# and converts the result to a compact APNG, a GIF and an MP4.
set -e
cd "$(dirname "$0")"

HOST=https://kvzqttvc2n.eu-west-1.aws.clickhouse-staging.com

# 1. Aggregate on the server, one query per hour: {0..23} is expanded by the `url` table function into 24 URLs,
#    and every one of them gets its own value of the query parameter `h`.
URL="$HOST/?user=website&default_format=RowBinary&param_h={0..23}&query=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))' < pixels.sql)"

clickhouse local --query "
    SELECT * FROM url('$URL', RowBinary, 'frame UInt16, px UInt16, py UInt16, c UInt32, alt Float32, speed Float32')
    INTO OUTFILE 'pixels.native' TRUNCATE FORMAT Native
    SETTINGS max_threads = 6"

# 2. Render all 288 frames into a truecolor APNG with FORMAT PNG.
clickhouse local --queries-file render.sql

# 3. Convert: FORMAT PNG writes truecolor frames (~150 MB); a single 256-color palette fits this picture well.
S=faa-outage-2026-11-13
PALETTE="split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none"
ffmpeg -v error -y -i $S.png -vf "$PALETTE" -loop 0 $S.gif
ffmpeg -v error -y -i $S.png -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart $S.mp4
# Pillow, not ffmpeg, for the APNG: ffmpeg blends the frames over each other, which some decoders get wrong.
python3 palettize.py $S.png $S.small.png && mv $S.small.png $S.png

# A still image straight from the server, with the default 1024x1024 size.
curl -sS "$HOST/?user=website" --data-binary @before-after.sql -o before-after.png
