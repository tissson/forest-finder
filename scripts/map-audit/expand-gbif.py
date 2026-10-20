import sys,requests,json,time,concurrent.futures,pathlib,hashlib,csv,collections,math,datetime
sys.path.insert(0,'/tmp/gbif-python')
from pyproj import Transformer
P=pathlib.Path('/tmp/gbif-expanded'); start=time.monotonic(); deadline=start+175
keys=[5249504,2554536,2882833,2882835,5954958,2998290]; alt='6ac3f774-d9fb-4796-b3e9-92bf6c81c084'
base=dict(country='SE',year='2018,2025',hasCoordinate='true',hasGeospatialIssue='false',occurrenceStatus='PRESENT',coordinateUncertaintyInMeters='0,1000',license=['CC0_1_0','CC_BY_4_0'])
def fetch(k):
 rows=[]; logs=[]
 plans=[('general',o,min(300,(900 if k in [5249504,5954958] else 1000)-o)) for o in range(0,900 if k in [5249504,5954958] else 1000,300)]
 if k in [5249504,5954958]: plans.append(('naturgucker',0,100))
 for source,offset,limit in plans:
  if time.monotonic()>deadline-2: break
  params=dict(base,taxonKey=k,offset=offset,limit=limit)
  if source=='naturgucker': params['datasetKey']=alt
  try:
   r=requests.get('https://api.gbif.org/v1/occurrence/search',params=params,timeout=min(30,max(1,deadline-time.monotonic())));r.raise_for_status();j=r.json();f=f'{k}-{source}-{offset}.json';(P/f).write_text(json.dumps(j)); logs.append(dict(file=f,url=r.url,count=j.get('count'),returned=len(j['results']),sha256=hashlib.sha256((P/f).read_bytes()).hexdigest())); rows.extend(j['results'])
  except Exception as e: logs.append(dict(source=source,offset=offset,error=str(e)))
 return k,rows,logs
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex: data=list(ex.map(fetch,keys))
(P/'requests.json').write_text(json.dumps({'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsed_seconds':time.monotonic()-start,'requests':{str(k):l for k,r,l in data}},indent=2))
tr=Transformer.from_crs(4326,3006,always_xy=True); selected=[]; rejected=[]; summaries=[]
major={'TAXON_MATCH_HIGHERRANK','TAXON_ID_NOT_FOUND','TAXON_MATCH_NONE','TAXON_MATCH_FUZZY','COORDINATE_INVALID','COORDINATE_OUT_OF_RANGE','ZERO_COORDINATE','COUNTRY_COORDINATE_MISMATCH','CONTINENT_COORDINATE_MISMATCH','PRESUMED_SWAPPED_COORDINATE','COORDINATE_REPROJECTION_FAILED'}
for k,rows,logs in data:
 counts=collections.Counter(); good=[];seen=set()
 for r in rows:
  reason=[];i=set(r.get('issues',[]))
  for c in r.get('classifications',{}).values(): i.update(c.get('issues',[]))
  if r['key'] in seen: counts['duplicate_id']+=1;continue
  seen.add(r['key'])
  if i&major:reason.append('major_issue:'+','.join(sorted(i&major)))
  if not(r.get('taxonKey')==r.get('acceptedTaxonKey')==r.get('speciesKey')==k and r.get('taxonRank')=='SPECIES' and r.get('taxonomicStatus')=='ACCEPTED'):reason.append('not_accepted_exact_species')
  if r.get('countryCode')!='SE' or r.get('occurrenceStatus')!='PRESENT' or not 2018<=r.get('year',0)<=2025:reason.append('scope')
  if not any(x in r.get('license','') for x in ['/publicdomain/zero/1.0','/licenses/by/4.0']):reason.append('license')
  u=r.get('coordinateUncertaintyInMeters');lat=r.get('decimalLatitude');lon=r.get('decimalLongitude')
  if u is None or not 0<=u<=1000 or lat is None or lon is None or not(-90<=lat<=90 and -180<=lon<=180) or (lat==0 and lon==0): reason.append('coordinates')
  if not r.get('month') or not r.get('day'):reason.append('not_day_resolved')
  date=r.get('eventDate','');ends=date.split('/')
  if len(ends)==2 and ends[0][:10]!=ends[1][:10]:reason.append('multi_day_interval')
  if reason:
   counts['rejected']+=1
   for s in reason:counts[s]+=1
   rejected.append(dict(taxon_key=k,gbif_key=r['key'],reasons=';'.join(reason)));continue
  x,y=tr.transform(lon,lat);band='55–59' if lat<59 else '59–63' if lat<63 else '63–70'
  good.append(dict(taxon_key=k,species=r['species'],gbif_key=r['key'],latitude=lat,longitude=lon,uncertainty_m=u,event_date=date,year=r['year'],region=band,admin_region=r.get('gadm',{}).get('level1',{}).get('name',r.get('stateProvince','unknown')),grid_x=math.floor(x/2000),grid_y=math.floor(y/2000),easting=x,northing=y,dataset_key=r['datasetKey'],license=r['license'],issues=';'.join(sorted(i)),occurrence_id=r.get('occurrenceID','')))
 # deterministic distance-based thinning: one per grid bin then >=2000 m between all retained records (all years)
 bins=set();keep=[]
 for r in sorted(good,key=lambda r:r['gbif_key']):
  b=(r['grid_x'],r['grid_y'])
  if b in bins:counts['duplicate_2km_bin']+=1;continue
  bins.add(b)
  if any((r['easting']-s['easting'])**2+(r['northing']-s['northing'])**2<2000**2 for s in keep):counts['within_2km_other_bin']+=1;continue
  keep.append(r)
 selected.extend(keep)
 summaries.append(dict(taxon_key=k,fetched=len(rows),unique_ids=len(seen),quality_pass=len(good),selected=len(keep),counts=dict(counts),regions=dict(collections.Counter(r['region'] for r in keep)),years=dict(sorted(collections.Counter(r['year'] for r in keep).items()))))
def write(name,rows,fields=None):
 with (P/name).open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields or list(rows[0]));w.writeheader();w.writerows(rows)
write('selected.csv',selected);write('rejected.csv',rejected)
for fields,name in [(['taxon_key','region','year'],'region-year.csv'),(['taxon_key','admin_region','year'],'admin-region-year.csv')]:
 c=collections.Counter(tuple(r[f] for f in fields) for r in selected);write(name,[dict(zip(fields,t),count=n) for t,n in sorted(c.items())])
(P/'summary.json').write_text(json.dumps(summaries,indent=2,ensure_ascii=False));print(json.dumps(summaries,indent=2,ensure_ascii=False))
