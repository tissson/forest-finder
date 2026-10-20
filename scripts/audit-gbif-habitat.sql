-- READ ONLY. Exploratory static forest/tree component only; excludes weather and season.
-- Not daily prediction AUC, not fitted cross-validation; same-block sensitivity check.
-- Input pilot provenance: docs/map-audit/gbif-pilot-2026-10-20-metadata.json.
WITH occurrences(species_id,lon,lat) AS (VALUES
(2554536,13.21204,55.55440),
(2554536,15.66256,56.37499),
(2554536,13.63666,56.78298),
(2554536,16.99941,57.25495),
(2554536,11.95476,57.67295),
(2554536,14.97628,58.11422),
(2554536,16.84619,58.27365),
(2554536,13.40817,58.62938),
(2554536,15.71265,58.95141),
(2554536,18.12383,58.98700),
(2554536,15.01366,59.02411),
(2554536,11.27467,59.09013),
(2554536,17.07572,59.57901),
(2554536,13.33169,60.14603),
(2554536,15.30780,60.49711),
(2554536,18.37959,60.51872),
(2554536,16.77034,61.39652),
(2554536,14.30709,61.57209),
(2554536,15.91005,62.64706),
(2554536,18.05073,62.70001),
(2554536,16.16521,63.07467),
(2554536,17.74337,63.28378),
(2554536,13.95263,63.32435),
(2554536,16.74859,63.48493),
(2554536,20.17622,63.79360),
(2554536,19.09107,63.98386),
(2554536,21.19096,64.50382),
(2554536,15.69972,64.93187),
(2554536,21.55069,65.90612),
(2554536,22.82839,66.45531),
(2882833,14.64637,56.00835),
(2882833,12.64560,56.09263),
(2882833,13.58889,56.15296),
(2882833,15.89847,56.77743),
(2882833,12.83683,56.83162),
(2882833,14.00591,56.95776),
(2882833,15.05139,57.41313),
(2882833,12.39467,57.48077),
(2882833,16.67340,57.69758),
(2882833,15.73507,57.94763),
(2882833,14.59477,58.19522),
(2882833,11.26256,58.51985),
(2882833,13.13573,58.63452),
(2882833,17.08860,58.97261),
(2882833,15.95663,59.04340),
(2882833,17.34096,59.05202),
(2882833,18.27861,59.34611),
(2882833,14.82211,59.44729),
(2882833,17.55722,59.85302),
(2882833,18.80473,59.92970),
(2882833,16.01349,59.97467),
(2882833,13.96278,60.00321),
(2882833,17.44661,60.60572),
(2882833,15.64589,61.03459),
(2882833,14.57632,63.17902),
(2882833,13.04151,63.21170),
(2882833,20.88869,63.67938),
(2882833,20.30207,63.70589),
(2882833,20.34804,63.80969),
(2882833,23.62038,65.95907),
(2882835,13.26345,56.01918),
(2882835,15.90496,56.50353),
(2882835,14.00591,56.95776),
(2882835,17.00927,57.24246),
(2882835,12.20577,57.43517),
(2882835,15.59976,57.75746),
(2882835,13.98968,57.77471),
(2882835,11.96151,58.42464),
(2882835,13.97888,58.61775),
(2882835,17.30379,58.76678),
(2882835,16.55037,59.05428),
(2882835,18.27778,59.34695),
(2882835,14.93587,59.48720),
(2882835,16.44927,59.86201),
(2882835,13.96278,60.00321),
(2882835,18.66078,60.11571),
(2882835,15.71029,60.59577),
(2882835,17.44661,60.60572),
(2882835,13.07087,61.19248),
(2882835,18.35555,62.93555),
(2882835,13.04151,63.21170),
(2882835,14.62369,63.23827),
(2882835,20.88867,63.67941),
(2882835,20.34804,63.80969),
(2882835,20.10463,64.27945),
(2882835,21.72571,65.77376),
(2882835,22.96048,65.89417),
(2882835,23.62038,65.95907),
(2882835,21.58665,65.99641),
(2882835,21.22639,66.03644),
(2998290,13.89267,55.82871),
(2998290,15.33013,56.99137),
(2998290,12.56210,57.11002),
(2998290,14.37978,57.46339),
(2998290,12.93472,57.85333),
(2998290,15.73487,57.91222),
(2998290,11.83022,58.38446),
(2998290,13.77261,58.42248),
(2998290,15.95410,58.73561),
(2998290,17.85878,58.77224),
(2998290,14.50845,59.00168),
(2998290,19.30595,59.73770),
(2998290,16.05032,59.77112),
(2998290,12.18270,59.83442),
(2998290,14.17739,60.24878),
(2998290,16.98391,61.10513),
(2998290,14.78976,61.38415),
(2998290,12.69770,61.63663),
(2998290,17.88640,62.65521),
(2998290,12.72799,62.81203),
(2998290,12.96351,63.16596),
(2998290,16.82300,63.34532),
(2998290,20.62613,63.96170),
(2998290,15.13740,65.08624),
(2998290,21.18373,65.53067),
(2998290,23.56507,66.43073),
(2998290,18.81859,66.66146),
(2998290,16.00785,66.74330),
(2998290,21.67733,67.61445),
(2998290,18.43983,68.49164)
)

, mapping AS (SELECT * FROM (VALUES(2554536,2),(2882833,3),(2882835,4),(2998290,6)) m(taxon,species_id)),
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
 WHERE h.species_id IN (2,3,4,6)
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
