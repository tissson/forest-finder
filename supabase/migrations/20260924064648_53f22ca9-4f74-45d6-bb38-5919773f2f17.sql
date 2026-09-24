-- =====================================================================
-- FIX: Slumpmässig "jord"-term borttagen ur get_prediction_tile, samt
-- infrastruktur för att fylla weather_zones.forest_cover med riktig
-- SLU Skogskarta-data (som just nu ligger på DEFAULT 0 för ALLA zoner).
-- =====================================================================
-- Bakgrund (se konversationen där detta hittades): 15% av varje
-- prognospoäng kom från hashtext(zone_id||soil_seed) -- ren
-- pseudoslump utan koppling till verklig jordart. Samtidigt är
-- forest_cover hårdkodad till 0 för VARJE zon (bekräftat genom att
-- söka igenom samtliga tidigare migrationer -- ingen UPDATE sätter
-- den någonsin), vilket gör skogstermen till en konstant snarare än
-- en rumslig signal. Tillsammans förklarar det den "väggvägg-till-
-- vägg gröna" ytan med spridda, meningslösa gula prickar.
--
-- DENNA MIGRATION:
--   1. Tar bort slumptermen helt, omfördelar dess vikt till fukt/skog.
--   2. Bygger en staging-tabell + populeringsfunktion för
--      forest_cover, redo att köras när SLU-rasterdata finns
--      nedladdad -- INTE fylld med riktiga värden än, se
--      populate_forest_cover()-kommentaren.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_prediction_tile: slumptermen borttagen, vikterna omfördelade.
-- 0.45/0.85 ≈ 0.53 (fukt), 0.40/0.85 ≈ 0.47 (skog) -- behåller samma
-- INBÖRDES förhållande mellan de två komponenterna som fanns innan,
-- så att relativ vikt mellan fukt och skog inte ändras, bara att
-- slumpens 15% försvinner ur summan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_prediction_tile(z integer, x integer, y integer, p_species_id bigint, p_obs_date date DEFAULT NULL::date)
RETURNS bytea
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_start date;
  v_end date;
  v_premium boolean;
  v_date date;
  v_season double precision;
  v_moisture_optimum double precision;
  v_moisture_tolerance double precision;
  v_forest_optimum double precision;
  v_forest_tolerance double precision;
  v_env geometry;
  v_env4326 geometry;
  v_step integer;
  v_tile bytea;
BEGIN
  SELECT s.tier, s.season_start, s.season_end,
         hp.moisture_optimum, hp.moisture_tolerance,
         hp.forest_optimum, hp.forest_tolerance
    INTO v_tier, v_start, v_end,
         v_moisture_optimum, v_moisture_tolerance,
         v_forest_optimum, v_forest_tolerance
  FROM public.species s
  JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
  WHERE s.id = p_species_id;

  IF v_tier IS NULL THEN RAISE EXCEPTION 'Okänd art'; END IF;

  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium
    FROM public.user_profiles up WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.';
    END IF;
  END IF;

  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;

  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from v_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.65 END
    ELSE
      CASE WHEN extract(doy from v_date) >= extract(doy from v_start)
             OR extract(doy from v_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.65 END
  END;

  v_step := CASE WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3 WHEN z = 7 THEN 2 ELSE 1 END;

  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
  FROM (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(
          ST_Translate(
            ST_Centroid(sc.geom),
            (((hashtext(sc.zone_id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(sc.geom) - ST_XMin(sc.geom)) * 0.9,
            (((hashtext(sc.zone_id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(sc.geom) - ST_YMin(sc.geom)) * 0.9
          ),
          3857
        ),
        v_env, 4096, 64, true
      ) AS geom,
      sc.zone_id,
      sc.score,
      sc.moisture,
      v_date AS obs_date
    FROM (
      SELECT
        wz.id AS zone_id,
        wz.geom,
        coalesce(w.moisture_score, 0)::double precision AS moisture,
        greatest(0, least(1,
          (
            0.53 * exp(-power((coalesce(w.moisture_score, 0) - v_moisture_optimum) / v_moisture_tolerance, 2))
            + 0.47 * exp(-power((wz.forest_cover - v_forest_optimum) / v_forest_tolerance, 2))
          ) * v_season
        ))::double precision AS score
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id
       AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
        AND (v_step = 1 OR (wz.grid_x % v_step = 0 AND wz.grid_y % v_step = 0))
    ) sc
    WHERE sc.score >= 0.20
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_prediction_tile(integer,integer,integer,bigint,date) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_prediction_tile IS
    'Slumptermen (tidigare 15% "jord" via hashtext) borttagen -- se migrationens header. forest_cover-komponenten är fortfarande en KONSTANT tills populate_forest_cover() faktiskt körts med riktig data (se nedan) -- score kommer alltså fortfarande sakna rumslig variation från skog tills dess, men slår inte längre in falsk, slumpmässig signal.';

-- ---------------------------------------------------------------------
-- 2. Infrastruktur för riktig forest_cover-population.
-- postgis_raster krävs för raster2pgsql-laddade staging-tabeller --
-- INTE tidigare aktiverat i detta projekt (kontrollerat: bara
-- kärn-postgis fanns aktiverat), så vi lägger till det här.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis_raster;

CREATE TABLE IF NOT EXISTS public.forest_cover_staging (
    rid SERIAL PRIMARY KEY,
    rast RASTER
);

COMMENT ON TABLE public.forest_cover_staging IS
    'Staging för SLU Skogskarta-volymraster (m3sk/ha, totalt eller per trädslag summerat). Laddas via raster2pgsql, se ingest_biotopes.py-mönstret från det tidigare (Python/FastAPI-baserade) backend-spåret i projektet -- samma raster2pgsql-kommando fungerar, bara måltabellen ändras till denna.';

-- ---------------------------------------------------------------------
-- 3. populate_forest_cover: zonal medelvärde från staging-rastret,
-- normaliserat till 0-1 (species_habitat_profiles.forest_optimum
-- ligger på den skalan, bekräftat via faktiska värden: 0.72/0.82/0.68
-- -- INTE rå m3sk/ha).
--
-- INTE KÖRD ÄN -- forest_cover_staging är TOM tills SLU-rasterfiler
-- faktiskt laddats med raster2pgsql. Att anropa denna funktion nu
-- skulle bara sätta forest_cover till 0 för alla zoner (samma som
-- idag, fast via en annan mekanism) eftersom ST_SummaryStatsAgg mot
-- en tom källtabell returnerar NULL, vilket COALESCE:as till 0 nedan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_forest_cover(
    p_region geometry DEFAULT NULL,
    p_saturation_volume double precision DEFAULT 300.0
)
RETURNS TABLE(zones_updated integer) AS $$
DECLARE
    v_updated integer;
BEGIN
    WITH zone_stats AS (
        SELECT
            wz.id,
            (ST_SummaryStatsAgg(
                ST_Clip(fcs.rast, ST_Transform(wz.geom, 3006), true),
                1, true
            )).mean AS mean_volume
        FROM public.weather_zones wz
        LEFT JOIN public.forest_cover_staging fcs
            ON ST_Intersects(fcs.rast, ST_Transform(wz.geom, 3006))
        WHERE wz.is_active
          AND (p_region IS NULL OR ST_Intersects(wz.geom, p_region))
        GROUP BY wz.id
    )
    UPDATE public.weather_zones wz
    SET forest_cover = LEAST(1.0, GREATEST(0.0, COALESCE(zs.mean_volume, 0) / p_saturation_volume))
    FROM zone_stats zs
    WHERE wz.id = zs.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN QUERY SELECT v_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.populate_forest_cover IS
    'Kör EFTER att forest_cover_staging fyllts via raster2pgsql (se den tabellens kommentar). p_saturation_volume (default 300 m3sk/ha) är en STARTGISSNING för vad som räknas som "helt tät, mogen skog" (score 1.0) -- kalibrera mot den faktiska volymfördelningen i er data efter första laddningen, samma princip som DTW-brytpunkterna i det andra backend-spårets load_biotopes.sql.';

GRANT EXECUTE ON FUNCTION public.populate_forest_cover(geometry, double precision) TO service_role;