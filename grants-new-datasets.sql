-- Grants for the public `website` user on the new datasets.
-- MUST be run by a service admin: the osm_prepare user has SELECT but not WITH GRANT OPTION,
-- so it cannot grant access itself. Until these run, the new tabs return permission errors.
-- Sampling policy: small (<=2B) no samples; medium (2-10B) one 10% sample (sample10);
-- large (>=10B, OSM current) both sample10 + sample100.

GRANT SELECT ON default.firms_mercator TO website;
GRANT SELECT ON default.gbif_mercator TO website;
GRANT SELECT ON default.gbif_mercator_sample10 TO website;
GRANT SELECT ON default.glm_mercator TO website;
GRANT SELECT ON default.gtfs_mercator TO website;
GRANT SELECT ON default.inat_mercator TO website;
GRANT SELECT ON default.isd_mercator TO website;
GRANT SELECT ON default.isd_mercator_sample10 TO website;
GRANT SELECT ON default.osm_history_mercator TO website;
GRANT SELECT ON default.osm_history_mercator_sample10 TO website;
GRANT SELECT ON default.osm_mercator TO website;
GRANT SELECT ON default.osm_mercator_sample10 TO website;
GRANT SELECT ON default.osm_mercator_sample100 TO website;
GRANT SELECT ON default.overture_mercator TO website;
GRANT SELECT ON default.overture_mercator_sample10 TO website;
GRANT SELECT ON default.population_mercator TO website;
GRANT SELECT ON default.taxi_mercator TO website;

-- Ships already granted; the new data_source column is covered by the existing table grant.
