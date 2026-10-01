#!/usr/bin/env bash
# =============================================================================
# Återkörbar laddning av SLU/Skogsstyrelsens raster till weather_zones.
#
#   dataset          kolumn(er)                         DB-funktion (endast service_role)
#   -------          ----------                         ---------------------------------
#   volume           forest_cover  (= volym/200, 0-1)   load_forest_cover + finalize_forest_cover
#   soil             soil_wetness  (klass -> 0-1)       load_soil_wetness
#   spruce|pine|birch vol_spruce / vol_pine / vol_birch load_tree_volume
#
# Källa: Skogsstyrelsens öppna Atom-flöden. INGEN inloggning krävs.
#   https://geodpags.skogsstyrelsen.se/geodataport/feeds/<FEED>.xml
#
# Metod per län: ladda ner zip -> VRT av alla GeoTIFF -> (markfukt: LUT) ->
#   gdalwarp -tr 2000 2000 -tap -r average (EPSG:3006, samma 2x2 km-rutnät
#   som weather_zones) -> XYZ -> skicka [[x,y,v],...] i bitar à 5000 celler.
#
# Krav: gdal (t.ex. `nix run nixpkgs#gdal`), curl, python3, unzip.
#
# Två lägen:
#   A) Direkt via API:   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./load-slu-rasters.sh volume
#   B) Generera SQL:     SQL_OUT=/tmp/sql ./load-slu-rasters.sh volume
#      (skriver .sql-filer med SELECT load_...('<json>'); att köra med en
#       privilegierad databasanslutning)
#
# Valfritt: COUNTIES="01 03" för att bara köra vissa län. WORK=/tmp/slu (default).
# Idempotent: varje körning skriver över kolumnvärdena för de celler som finns
# i rastret. För "volume" körs finalize_forest_cover() sist (golv 0.03 för
# aktiva rutor utan skog) -- nollställ först med
#   UPDATE weather_zones SET forest_cover = 0 WHERE is_active;
# om du vill göra en helt ren omladdning.
# =============================================================================
set -euo pipefail

DATASET="${1:?Ange dataset: volume | soil | spruce | pine | birch}"
WORK="${WORK:-/tmp/slu}"
BASE="https://geodpags.skogsstyrelsen.se/geodataport"
mkdir -p "$WORK"

case "$DATASET" in
  volume) FEED=SLUSkogskartaVolym;        RPC=load_forest_cover ;;
  soil)   FEED=SLUMarkfuktighetKlassad;   RPC=load_soil_wetness ;;
  spruce) FEED=SLUSkogskartaGranVolym;    RPC=load_tree_volume ;;
  pine)   FEED=SLUSkogskartaTallVolym;    RPC=load_tree_volume ;;
  birch)  FEED=SLUSkogskartaBj%C3%B6rkVolym;  RPC=load_tree_volume ;;
  *) echo "Okänt dataset: $DATASET" >&2; exit 1 ;;
esac

if [[ -z "${SQL_OUT:-}" ]]; then
  : "${SUPABASE_URL:?Sätt SUPABASE_URL (eller SQL_OUT för SQL-läge)}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?Sätt SUPABASE_SERVICE_ROLE_KEY (eller SQL_OUT för SQL-läge)}"
else
  mkdir -p "$SQL_OUT"
fi

# Län-zip-filer (två siffror sist i namnet) hämtas från flödet.
mapfile -t ZIPS < <(curl -fsSL "$BASE/feeds/$FEED.xml" \
  | grep -o 'href="[^"]*[0-9][0-9]\.zip"' | sed 's/href="//;s/"$//' | sort -u)
[[ ${#ZIPS[@]} -gt 0 ]] || { echo "Hittade inga län-filer i $FEED" >&2; exit 1; }

# Markfuktklasser -> 0-100 (värdet /100 i load_soil_wetness). 255 = nodata.
# 0 okänd/ej skog, 1 torr, 2 frisk, 3 frisk-fuktig, 4 fuktig, 5 blöt (enligt SLU).
SOIL_LUT="0:255,1:15,2:45,3:70,4:95,5:255,255:255"

send_chunk() { # $1 = json-fil, $2 = län, $3 = bit-nr
  local json="$1"
  if [[ -n "${SQL_OUT:-}" ]]; then
    python3 - "$json" "$RPC" "$DATASET" > "$SQL_OUT/${DATASET}_$2_$3.sql" <<'PY'
import sys, json
rows = open(sys.argv[1]).read(); rpc, ds = sys.argv[2], sys.argv[3]
lit = "'" + rows.replace("'", "''") + "'::jsonb"
if rpc == "load_tree_volume":
    print(f"SELECT public.load_tree_volume('{ds}', {lit});")
else:
    print(f"SELECT public.{rpc}({lit});")
PY
  else
    local body
    if [[ "$RPC" == load_tree_volume ]]; then
      body=$(python3 -c 'import sys,json;print(json.dumps({"p_kind":sys.argv[1],"p_rows":json.load(open(sys.argv[2]))}))' "$DATASET" "$json")
    else
      body=$(python3 -c 'import sys,json;print(json.dumps({"p_rows":json.load(open(sys.argv[1]))}))' "$json")
    fi
    for attempt in 1 2 3 4; do
      if curl -fsS -X POST "$SUPABASE_URL/rest/v1/rpc/$RPC" \
          -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
          -H "Content-Type: application/json" --data-binary "$body" >/dev/null; then
        return 0
      fi
      sleep $((attempt * 5))
    done
    echo "Misslyckades att skicka $json" >&2; return 1
  fi
}

for url in "${ZIPS[@]}"; do
  lan=$(basename "$url" .zip | grep -o '[0-9][0-9]$')
  [[ -n "${COUNTIES:-}" && " $COUNTIES " != *" $lan "* ]] && continue
  done_flag="$WORK/done_${DATASET}_$lan"
  [[ -f "$done_flag" ]] && { echo "Län $lan redan klart (ta bort $done_flag för att köra om)"; continue; }

  d="$WORK/${DATASET}_$lan"; rm -rf "$d"; mkdir -p "$d"
  echo "== $DATASET län $lan: laddar ner $url"
  curl -fsSL --retry 3 -o "$d/in.zip" "$url"
  unzip -q -o "$d/in.zip" -d "$d/raw"; rm -f "$d/in.zip"
  mapfile -t tifs < <(find "$d/raw" -iname '*.tif')
  gdalbuildvrt -q "$d/src.vrt" "${tifs[@]}"

  if [[ "$DATASET" == soil ]]; then
    # Klass -> fuktvärde via LUT; nodata 255 ignoreras vid medelvärdet.
    python3 - "$d/src.vrt" "$d/lut.vrt" "$SOIL_LUT" <<'PY'
import sys, re
src, dst, lut = sys.argv[1:]
x = open(src).read()
x = x.replace("<ComplexSource>", "<ComplexSource><LUT>%s</LUT>" % lut, ) if "<ComplexSource>" in x else \
    re.sub(r"<SimpleSource>(.*?)</SimpleSource>", lambda m: "<ComplexSource><LUT>%s</LUT>%s</ComplexSource>" % (lut, m.group(1)), x, flags=re.S)
x = re.sub(r"<NoDataValue>.*?</NoDataValue>", "", x)
x = x.replace("<VRTRasterBand ", "<VRTRasterBand ", 1).replace("</ColorInterp>", "</ColorInterp><NoDataValue>255</NoDataValue>", 1)
open(dst, "w").write(x)
PY
    in_vrt="$d/lut.vrt"; warp_nodata=(-srcnodata 255 -dstnodata -1)
  else
    # Volym: källans nodata räknas som 0 m3sk/ha (öppen mark drar ned medelvärdet).
    in_vrt="$d/src.vrt"; warp_nodata=(-srcnodata None -dstnodata -1)
  fi

  gdalwarp -q -overwrite -t_srs EPSG:3006 -tr 2000 2000 -tap -r average \
    -ot Float32 "${warp_nodata[@]}" "$in_vrt" "$d/grid.tif"
  gdal_translate -q -of XYZ "$d/grid.tif" "$d/grid.xyz"

  # XYZ ger cellcentrum. Filtrera bort nodata (-1) och dela upp i bitar.
  python3 - "$d/grid.xyz" "$d" <<'PY'
import sys, json
xyz, out = sys.argv[1:]
rows = []
for line in open(xyz):
    x, y, v = line.split()
    v = float(v)
    if v < 0: continue
    rows.append([round(float(x)), round(float(y)), round(v, 2)])
for i in range(0, len(rows), 5000):
    json.dump(rows[i:i+5000], open(f"{out}/chunk_{i//5000:04d}.json", "w"))
print(f"{len(rows)} celler")
PY
  n=0
  for c in "$d"/chunk_*.json; do send_chunk "$c" "$lan" "$n"; n=$((n+1)); done
  rm -rf "$d/raw"
  touch "$done_flag"
  echo "== län $lan klart ($n bitar)"
done

if [[ "$DATASET" == volume ]]; then
  if [[ -n "${SQL_OUT:-}" ]]; then
    echo "SELECT public.finalize_forest_cover();" > "$SQL_OUT/volume_zz_finalize.sql"
  else
    curl -fsS -X POST "$SUPABASE_URL/rest/v1/rpc/finalize_forest_cover" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" -d '{}'
    echo
  fi
fi
echo "Klart: $DATASET"
