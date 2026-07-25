-- Grants for the public `website` user on the new datasets.
-- MUST be run by a service admin: the osm_prepare user has SELECT but not WITH GRANT OPTION,
-- so it cannot grant access itself. Until these run, the new tabs return permission errors.

-- OSM current snapshot (already needed from the first OSM PR)
GRANT SELECT ON default.osm_mercator TO website;
GRANT SELECT ON default.osm_mercator_sample10 TO website;
GRANT SELECT ON default.osm_mercator_sample100 TO website;

-- OSM full history
GRANT SELECT ON default.osm_history_mercator TO website;
GRANT SELECT ON default.osm_history_mercator_sample10 TO website;
GRANT SELECT ON default.osm_history_mercator_sample100 TO website;

-- GBIF species occurrences
GRANT SELECT ON default.gbif_mercator TO website;
GRANT SELECT ON default.gbif_mercator_sample10 TO website;
GRANT SELECT ON default.gbif_mercator_sample100 TO website;

-- iNaturalist observations
GRANT SELECT ON default.inat_mercator TO website;
GRANT SELECT ON default.inat_mercator_sample10 TO website;
GRANT SELECT ON default.inat_mercator_sample100 TO website;

-- Overture buildings
GRANT SELECT ON default.overture_mercator TO website;
GRANT SELECT ON default.overture_mercator_sample10 TO website;
GRANT SELECT ON default.overture_mercator_sample100 TO website;

-- NOAA ISD hourly weather
GRANT SELECT ON default.isd_mercator TO website;
GRANT SELECT ON default.isd_mercator_sample10 TO website;
GRANT SELECT ON default.isd_mercator_sample100 TO website;

-- iNaturalist observations
GRANT SELECT ON default.inat_mercator TO website;
GRANT SELECT ON default.inat_mercator_sample10 TO website;
GRANT SELECT ON default.inat_mercator_sample100 TO website;

-- NYC taxi trips
GRANT SELECT ON default.taxi_mercator TO website;
GRANT SELECT ON default.taxi_mercator_sample10 TO website;
GRANT SELECT ON default.taxi_mercator_sample100 TO website;

-- NASA FIRMS fires
GRANT SELECT ON default.firms_mercator TO website;
GRANT SELECT ON default.firms_mercator_sample10 TO website;
GRANT SELECT ON default.firms_mercator_sample100 TO website;

-- GOES GLM lightning
GRANT SELECT ON default.glm_mercator TO website;
GRANT SELECT ON default.glm_mercator_sample10 TO website;
GRANT SELECT ON default.glm_mercator_sample100 TO website;

-- Kontur population (single level)
GRANT SELECT ON default.population_mercator TO website;

-- GTFS-Realtime transit
GRANT SELECT ON default.gtfs_mercator TO website;
GRANT SELECT ON default.gtfs_mercator_sample10 TO website;
GRANT SELECT ON default.gtfs_mercator_sample100 TO website;

-- Ships already granted; the new data_source column is covered by the existing table grant.
