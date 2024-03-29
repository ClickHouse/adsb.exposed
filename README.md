# ADS-B Massive Visualizer

This website allows you to aggregate and visualize massive amounts of air traffic data. The data is hosted in a ClickHouse database and queried on the fly. You can tune the visualizations with custom SQL queries and drill-down from 40 billion records down to individual data records.

## Examples

The visualization is insanely beautiful.

### [Helicopters over Manhattan:](https://adsb.exposed/?zoom=12&lat=40.7168&lng=285.9893&query=e18e8c8d6a1db73c63953798ad8919a9)
[![Helicopters over Manhattan](pictures/manhattan.png)](https://adsb.exposed/?zoom=12&lat=40.7168&lng=285.9893&query=e18e8c8d6a1db73c63953798ad8919a9)

### [Denver airport:](https://adsb.exposed/?zoom=11&lat=39.8665&lng=255.3566&query=dd3c1af70baafa35055b06fa3556d96e)
[![Denver airport](pictures/denver.png)](https://adsb.exposed/?zoom=12&lat=40.7168&lng=285.9893&query=e18e8c8d6a1db73c63953798ad8919a9)


If we zoom to a single airport, we can see where the planes are parked, and even color them by a manifacturer or an airline:

### [Denver airport:](https://adsb.exposed/?zoom=15&lat=39.8592&lng=255.3276&query=b4659aba93f0e495ef2aa837ee793874)
[![Denver airport](pictures/parking_denver.png)](https://adsb.exposed/?zoom=12&lat=40.7168&lng=285.9893&query=e18e8c8d6a1db73c63953798ad8919a9)

### [Amsterdam Schiphol](https://adsb.exposed/?zoom=14&lat=52.3103&lng=364.7577&query=b4659aba93f0e495ef2aa837ee793874)

### [Denver by airlines](https://adsb.exposed/?zoom=14&lat=39.8629&lng=255.3427&query=685c788488edb2e156049a356f0f5cf1)
### [Schiphol by airlines](https://adsb.exposed/?zoom=14&lat=52.3103&lng=364.7577&query=685c788488edb2e156049a356f0f5cf1)


You can select only military airplanes and find military bases and air fields.

### [Military training in Texas:](https://adsb.exposed/?zoom=7&lat=32.1944&lng=261.9682&query=64acf6eb47ad04237460ef46873f3bc3)
[![Military training in Texas](pictures/military_texas.png)](https://adsb.exposed/?zoom=7&lat=32.1944&lng=261.9682&query=64acf6eb47ad04237460ef46873f3bc3)

### [Military training in Langley:](https://adsb.exposed/?zoom=8&lat=37.7408&lng=285.7004&query=64acf6eb47ad04237460ef46873f3bc3)
[![Langley](pictures/langley.png)](https://adsb.exposed/?zoom=8&lat=37.7408&lng=285.7004&query=64acf6eb47ad04237460ef46873f3bc3)


You can select only Helicopters and find hospitals and police stations.

### [VUMC in Amsterdam:](https://adsb.exposed/?zoom=12&lat=52.3446&lng=364.8814&query=e18e8c8d6a1db73c63953798ad8919a9)
[![VUMC](pictures/vumc.png)](https://adsb.exposed/?zoom=12&lat=52.3446&lng=364.8814&query=e18e8c8d6a1db73c63953798ad8919a9)

### [In London, helicopters fly over the river:](https://adsb.exposed/?zoom=12&lat=51.5079&lng=359.8960&query=e18e8c8d6a1db73c63953798ad8919a9)
[![London helicopters](pictures/london_heli.png)](https://adsb.exposed/?zoom=12&lat=51.5079&lng=359.8960&query=e18e8c8d6a1db73c63953798ad8919a9)

### [In Las Vegas there is no river:](https://adsb.exposed/?zoom=10&lat=36.1374&lng=244.8811&query=e18e8c8d6a1db73c63953798ad8919a9)
[![Las Vegas helicopters](pictures/las_vegas_heli.png)](https://adsb.exposed/?zoom=10&lat=36.1374&lng=244.8811&query=e18e8c8d6a1db73c63953798ad8919a9)


Gliders are also interesting.

### [Gliders in Netherlands near Utrecht:](https://adsb.exposed/?zoom=11&lat=52.1407&lng=365.3043&query=d0df937d8c601cb73c7e4721bea5b7f9)
[![Gliders in Netherlands near Utrecht](pictures/gliders_utrecht.png)](https://adsb.exposed/?zoom=11&lat=52.1407&lng=365.3043&query=d0df937d8c601cb73c7e4721bea5b7f9)

### [Gliders near Denver:](https://adsb.exposed/?zoom=9&lat=39.6691&lng=255.2838&query=d0df937d8c601cb73c7e4721bea5b7f9)
[![Gliders in Netherlands near Utrecht](pictures/gliders_denver.png)](https://adsb.exposed/?zoom=9&lat=39.6691&lng=255.2838&query=d0df937d8c601cb73c7e4721bea5b7f9)


Small airports are beautiful.

### [Bay Area small airports:](https://adsb.exposed/?zoom=9&lat=37.8100&lng=238.0987&query=045cd07e7640e0b6b0d10cf0fd80282c)
[![Bay Area small airports](pictures/small_bay_area.png)](https://adsb.exposed/?zoom=9&lat=37.8100&lng=238.0987&query=045cd07e7640e0b6b0d10cf0fd80282c)

### [Dallas small airports:](https://adsb.exposed/?zoom=9&lat=32.9119&lng=262.9988&query=045cd07e7640e0b6b0d10cf0fd80282c)
[![Dallas small airports](pictures/small_dallas.png)](https://adsb.exposed/?zoom=9&lat=32.9119&lng=262.9988&query=045cd07e7640e0b6b0d10cf0fd80282c)


F-16 military training:

### [F-16 air bases in the US:](https://adsb.exposed/?zoom=5&lat=37.0900&lng=267.1385&query=b8af6c7320f23c451d629cea6ae21826)
[![F-16 air bases in the US](pictures/f16_us.png)](https://adsb.exposed/?zoom=5&lat=37.0900&lng=267.1385&query=b8af6c7320f23c451d629cea6ae21826)

### [F-16 training in Langley:](https://adsb.exposed/?zoom=8&lat=37.4530&lng=284.7047&query=b8af6c7320f23c451d629cea6ae21826)
[![F-16 training in Langley](pictures/f16_langley.png)](https://adsb.exposed/?zoom=8&lat=37.4530&lng=284.7047&query=b8af6c7320f23c451d629cea6ae21826)

### [F-16 training in Belgium:](https://adsb.exposed/?zoom=9&lat=51.3529&lng=365.6607&query=b8af6c7320f23c451d629cea6ae21826)
[![F-16 training in Belgium](pictures/f16_belgium.png)](https://adsb.exposed/?zoom=9&lat=51.3529&lng=365.6607&query=b8af6c7320f23c451d629cea6ae21826)


It is interesting to explore strange gaps in the map.

### [Guess what it is?](https://adsb.exposed/?zoom=7&lat=55.5040&lng=380.2597&query=dd3c1af70baafa35055b06fa3556d96e)
[![Kaliningrad](pictures/kaliningrad.png)](https://adsb.exposed/?zoom=7&lat=55.5040&lng=380.2597&query=dd3c1af70baafa35055b06fa3556d96e)

### [Polish air base](https://adsb.exposed/?zoom=11&lat=54.4764&lng=377.1181&query=dd3c1af70baafa35055b06fa3556d96e)

### [Maroc air base](https://adsb.exposed/?zoom=8&lat=32.7553&lng=352.4367&query=dd3c1af70baafa35055b06fa3556d96e)

### [A strange hole near Mexico City:](https://adsb.exposed/?zoom=9&lat=19.1139&lng=261.3813&query=dd3c1af70baafa35055b06fa3556d96e)
[![Popocatepetl](pictures/popocatepetl.png)](https://adsb.exposed/?zoom=9&lat=19.1139&lng=261.3813&query=dd3c1af70baafa35055b06fa3556d96e)

### [A volcano:](https://adsb.exposed/?zoom=8&lat=28.2122&lng=343.5701&query=dd3c1af70baafa35055b06fa3556d96e)
[![Canary](pictures/canary.png)](https://adsb.exposed/?zoom=8&lat=28.2122&lng=343.5701&query=dd3c1af70baafa35055b06fa3556d96e)


Balloons and Dirigibles are nice.

### [Indianapolis Balloons:](https://adsb.exposed/?zoom=9&lat=39.6839&lng=274.1898&query=55edbfc4030fa2a5d11e18381f45714a)
[![Indianapolis Balloons](pictures/indianapolis_balloons.png)](https://adsb.exposed/?zoom=9&lat=39.6839&lng=274.1898&query=55edbfc4030fa2a5d11e18381f45714a)

### [Project Loon:](https://adsb.exposed/?zoom=8&lat=42.9855&lng=-97.7970&query=070d5c852982451a4a591adf1e843fc1)
[![Project Loon](pictures/loon.png)](https://adsb.exposed/?zoom=8&lat=42.9855&lng=-97.7970&query=070d5c852982451a4a591adf1e843fc1)

### [Balloons over Alps:](https://adsb.exposed/?zoom=7&lat=46.3773&lng=370.1954&query=957e06792b3f21de990ea5e7d3b41555)
[![Balloons over Alps](pictures/alps.png)](https://adsb.exposed/?zoom=7&lat=46.3773&lng=370.1954&query=957e06792b3f21de990ea5e7d3b41555)

### [Zeppelin:](https://adsb.exposed/?zoom=10&lat=40.9685&lng=278.6968&query=d802a21e0db720c55aabe9d5f7503f06&box=41.0931,278.4670,41.0569,278.5219)
[![Zeppelin](pictures/zeppelin.png)](https://adsb.exposed/?zoom=10&lat=40.9685&lng=278.6968&query=d802a21e0db720c55aabe9d5f7503f06&box=41.0931,278.4670,41.0569,278.5219)

### [Zeppelin in LA:](https://adsb.exposed/?zoom=9&lat=33.7335&lng=242.2996&query=d802a21e0db720c55aabe9d5f7503f06)
[![Zeppelin in LA](pictures/zeppelin_la.png)](https://adsb.exposed/?zoom=9&lat=33.7335&lng=242.2996&query=d802a21e0db720c55aabe9d5f7503f06)


### [Emirates Engineering:](https://adsb.exposed/?zoom=15&lat=25.2518&lng=415.3630&query=b4659aba93f0e495ef2aa837ee793874)

In Dubai Airport, the green direct will be a hangar of Emirates Engineering where Airbuses are maintained:
[![Emirates Engineering](pictures/emirates.png)](https://adsb.exposed/?zoom=15&lat=25.2518&lng=415.3630&query=b4659aba93f0e495ef2aa837ee793874)

### [Patroling in Israel:](https://adsb.exposed/?zoom=9&lat=31.1092&lng=394.8488&query=685c788488edb2e156049a356f0f5cf1)

In Israel there are strange patterns made by patroling drones:
[![Patroling in Israel](pictures/israel.png)](https://adsb.exposed/?zoom=9&lat=31.1092&lng=394.8488&query=685c788488edb2e156049a356f0f5cf1)

### [Namibia air club:](https://adsb.exposed/?zoom=9&lat=-24.1889&lng=377.9942&query=dd3c1af70baafa35055b06fa3556d96e)

In Namibia there is a nice air club:
[![Namibia air club](pictures/namibia.png)](https://adsb.exposed/?zoom=9&lat=-24.1889&lng=377.9942&query=dd3c1af70baafa35055b06fa3556d96e)

Near Touluse, France, Airbus A-380 does its test flights:

### [A-380 in Touluse:](https://adsb.exposed/?zoom=8&lat=44.4260&lng=359.5055&query=86f1300b002f59fdabd60da7ffb116b3)
[![A-380 in Touluse](pictures/a380.png)](https://adsb.exposed/?zoom=8&lat=44.4260&lng=359.5055&query=86f1300b002f59fdabd60da7ffb116b3)

### [Cognac Air Base:](https://adsb.exposed/?zoom=8&lat=45.7907&lng=359.7197&query=64acf6eb47ad04237460ef46873f3bc3)
[![Cognac Air Base](pictures/cognac.png)](https://adsb.exposed/?zoom=8&lat=45.7907&lng=359.7197&query=64acf6eb47ad04237460ef46873f3bc3)

### [Area 51:](https://adsb.exposed/?zoom=8&lat=37.2784&lng=243.9184&query=dd3c1af70baafa35055b06fa3556d96e)
[![Area 51](pictures/area51.png)](https://adsb.exposed/?zoom=8&lat=37.2784&lng=243.9184&query=dd3c1af70baafa35055b06fa3556d96e)

### [CFB Suffield:](https://adsb.exposed/?zoom=8&lat=50.4262&lng=249.4501&query=dd3c1af70baafa35055b06fa3556d96e)


By editing the SQL query you can color every airline with its own color.

### [Airlines all over Europe:](https://adsb.exposed/?zoom=5&lat=51.0966&lng=10.3271&query=e9f7cdd454ff0473b47d750316976179)
[![Airlines all over Europe](pictures/eu_airlines.png)](https://adsb.exposed/?zoom=5&lat=51.0966&lng=10.3271&query=e9f7cdd454ff0473b47d750316976179)

### [Airlines in Denver airport:](https://adsb.exposed/?zoom=16&lat=39.8583&lng=255.3277&query=e9f7cdd454ff0473b47d750316976179)
[![Airlines in Denver airport](pictures/denver_airlines.png)](https://adsb.exposed/?zoom=16&lat=39.8583&lng=255.3277&query=e9f7cdd454ff0473b47d750316976179)


### [War:](https://adsb.exposed/?zoom=5&lat=53.5142&lng=18.8965&query=a3ad1397b4d525a5a6b329253635cda6)

Analyzing a single airline we can see how the war affected the air traffic.
[![War](pictures/war.png)](https://adsb.exposed/?zoom=5&lat=53.5142&lng=18.8965&query=a3ad1397b4d525a5a6b329253635cda6)


### [Police:](https://adsb.exposed/?zoom=10&lat=45.4408&lng=237.4369&query=250e73f7f543ab8c92bd158ea65d666a)

There are interesting examples of single aircrafts:
[![Police](pictures/police.png)](https://adsb.exposed/?zoom=10&lat=45.4408&lng=237.4369&query=250e73f7f543ab8c92bd158ea65d666a)


### [An-124:](https://adsb.exposed/?zoom=5&lat=49.7263&lng=372.8327&query=34a85d5a6486168faa995976917d18f9)

An-124 is a beautiful cargo plane, and you can find many of them in Leipzig:
[![An-124](pictures/an124.png)](https://adsb.exposed/?zoom=5&lat=49.7263&lng=372.8327&query=34a85d5a6486168faa995976917d18f9)

But DC-3 is unanimously the best:

### [DC-3:](https://adsb.exposed/?zoom=9&lat=52.2244&lng=4.6732&query=0cb467701aab3ea9d81e9d45f9053a56&box=52.4999,5.4030,52.3978,5.5899)
[![DC-3](pictures/dc3.png)](https://adsb.exposed/?zoom=9&lat=52.2244&lng=4.6732&query=0cb467701aab3ea9d81e9d45f9053a56&box=52.4999,5.4030,52.3978,5.5899)



## Data Source

ADS-B is a radio protocol
