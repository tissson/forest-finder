import rasterio,numpy as np,json,pathlib,subprocess
from rasterio.windows import from_bounds
w=pathlib.Path('/tmp/soil-land');result=[]
for c,d,bounds in [('10','12',(460000,6190000,480000,6270000)),('01','03',(660000,6620000,680000,6650000))]:
 paths=[next((w/'raw'/n).glob('*.tif')) for n in (c,d)]
 a=[]
 for f in paths:
  with rasterio.open(f) as s:a.append(s.read(1,window=from_bounds(*bounds,s.transform),boundless=True,fill_value=255))
 shared=(a[0]>=1)&(a[0]<=4)&(a[1]>=1)&(a[1]<=4)
 merged=np.full(a[0].shape,255,dtype=np.uint8)
 for f in sorted((w/'raw').glob('*/*.tif')):
  with rasterio.open(f) as src:
   if src.bounds.right<=bounds[0] or src.bounds.left>=bounds[2] or src.bounds.top<=bounds[1] or src.bounds.bottom>=bounds[3]:continue
   part=src.read(1,window=from_bounds(*bounds,src.transform),boundless=True,fill_value=255)
   merged=np.where(part!=255,part,merged)
 ny,nx=merged.shape[0]//1000,merged.shape[1]//1000
 means=np.full((ny,nx),np.nan)
 for y in range(ny):
  for x in range(nx):
   p=merged[y*1000:(y+1)*1000,x*1000:(x+1)*1000];land=(p>=1)&(p<=3);lut=np.array([0,.15,.45,.7,0,0,0,0]);means[y,x]=lut[p[land]].mean() if land.any() else np.nan
 with rasterio.open('docs/map-audit/soil-land-checkpoints/soil_wetness_land_2km.tif') as s: national=s.read(1,window=from_bounds(*bounds,s.transform))
 both=np.isfinite(means)&np.isfinite(national);delta=np.abs(means[both]-national[both])
 result.append({'counties':c+'-'+d,'bounds':bounds,'shared_valid_pixels':int(shared.sum()),'shared_conflicts':int(np.count_nonzero(a[0][shared]!=a[1][shared])),'cells':ny*nx,'comparable_land_cells':int(both.sum()),'null_mismatch':int(np.count_nonzero(np.isnan(means)!=np.isnan(national))),'max_abs_difference':float(delta.max()) if delta.size else None,'mean_abs_difference':float(delta.mean()) if delta.size else None,'cells_over_1e-12':int(np.count_nonzero(delta>1e-12))})
print(json.dumps(result,indent=2));pathlib.Path('docs/map-audit/soil-land-boundaries-2026-10-27.json').write_text(json.dumps(result,indent=2))
# Compare every imported value to raster output, without relying solely on counts.
active={r['id']:r for r in json.load(open('/tmp/soil-land/active.json'))['rows']}; actual=json.load(open('/tmp/soil-land/readback.json'))['rows'];bad=0
ras=[]
for n in ['soil_wetness_land','soil_water_fraction','soil_valid_fraction']:
 with rasterio.open('docs/map-audit/soil-land-checkpoints/'+n+'_2km.tif') as s:ras.append(s.read(1));tr=s.transform
for r in actual:
 p=active[r['id']];y,x=rasterio.transform.rowcol(tr,p['x'],p['y'])
 for k,a in zip(['soil_wetness_land','soil_water_fraction','soil_valid_fraction'],ras):
  v=a[y,x];z=r[k]
  if not ((np.isnan(v) and z is None) or (z is not None and abs(v-z)<1e-12)):bad+=1
print('readback mismatches',bad);assert bad==0
