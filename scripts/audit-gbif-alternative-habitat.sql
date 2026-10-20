-- READ ONLY. Exploratory static forest/tree component only; excludes weather and season.
-- Not daily prediction AUC, not fitted cross-validation; same-block sensitivity check.
-- Input pilot provenance: docs/map-audit/gbif-alternative-metadata-2026-10-20.json.
WITH occurrences(species_id,lon,lat) AS (VALUES
(5249504,13.522929,58.662289),
(5249504,12.472057,58.324997),
(5249504,13.845605,57.747074),
(5249504,14.492644,61.05032),
(5249504,13.484132,58.632969),
(5249504,14.259477,59.580814),
(5249504,12.156949,59.170494),
(5249504,12.202023,58.804138),
(5249504,16.559843,59.081253),
(5249504,16.488165,59.154594),
(5954958,14.492644,61.05032),
(5954958,13.948854,58.820354),
(5954958,14.481947,61.080456),
(5954958,13.845605,57.747074),
(5954958,14.648163,61.197063),
(5954958,14.259477,59.580814),
(5954958,14.198314,59.95966),
(5954958,12.472057,58.324997),
(5954958,13.884323,57.253464),
(5954958,12.472057,58.324997)
)
, mapping AS (SELECT * FROM (VALUES(5249504,1),(5954958,5)) m(taxon,species_id)),
positives AS (
 SELECT DISTINCT m.species_id,z.id FROM occurrences o
 JOIN mapping m ON m.taxon=o.species_id
 JOIN public.weather_zones z ON z.is_active
 AND z.geom && ST_SetSRID(ST_MakePoint(o.lon,o.lat),4326)
 AND ST_Covers(z.geom,ST_SetSRID(ST_MakePoint(o.lon,o.lat),4326))
), cells AS (
 SELECT z.*,floor(grid_x/50.0) AS bx,floor(grid_y/50.0) AS by,
 coalesce(vol_spruce,0)+coalesce(vol_pine,0)+coalesce(vol_birch,0) AS trees
 FROM public.weather_zones z WHERE is_active
), scores AS (
 SELECT z.id,z.bx,z.by,z.forest_cover,h.species_id,
 (.30*exp(-power((z.forest_cover-h.forest_optimum)/h.forest_tolerance,2))+
 .25*CASE WHEN z.trees<5 THEN .5 ELSE
 (h.aff_spruce*coalesce(z.vol_spruce,0)+h.aff_pine*coalesce(z.vol_pine,0)+h.aff_birch*coalesce(z.vol_birch,0))/z.trees END)/.55 AS habitat_score
 FROM cells z CROSS JOIN public.species_habitat_profiles h
 WHERE h.species_id IN (1,5)
), background AS (
 SELECT s.* FROM scores s
 WHERE mod(hashtext(s.id::text)::bigint+2147483648,10)=0
 AND NOT EXISTS(SELECT 1 FROM positives p WHERE p.species_id=s.species_id AND p.id=s.id)
), per_positive AS (
 SELECT p.species_id,p.id,s.bx,s.by,s.forest_cover,s.habitat_score,
 avg(CASE WHEN s.habitat_score>b.habitat_score THEN 1.0 WHEN s.habitat_score=b.habitat_score THEN .5 ELSE 0 END) AS national_auc,
 avg(CASE WHEN s.habitat_score>b.habitat_score THEN 1.0 WHEN s.habitat_score=b.habitat_score THEN .5 ELSE 0 END)
 FILTER(WHERE b.bx=s.bx AND b.by=s.by) AS same_block_auc,
 count(*) FILTER(WHERE b.bx=s.bx AND b.by=s.by) AS block_background
 FROM positives p JOIN scores s ON s.id=p.id AND s.species_id=p.species_id
 JOIN background b ON b.species_id=p.species_id
 GROUP BY p.species_id,p.id,s.bx,s.by,s.forest_cover,s.habitat_score
)
SELECT s.name_sv,count(*) AS mapped_occurrences,count(DISTINCT(p.bx,p.by)) AS spatial_blocks,
 avg(p.habitat_score) AS mean_presence_habitat_score,
 avg(p.national_auc) AS uniform_national_background_auc,
 avg(p.same_block_auc) FILTER(WHERE p.block_background>=20) AS within_100km_block_auc,
 count(*) FILTER(WHERE p.block_background>=20) AS supported_block_occurrences,
 count(*) FILTER(WHERE p.forest_cover=.03) AS floor_occurrences
FROM per_positive p JOIN public.species s ON s.id=p.species_id
GROUP BY s.id,s.name_sv ORDER BY s.id;
