import rasterio,numpy as np,json,glob
from rasterio.windows import Window
p=glob.glob('/tmp/map-audit/soil10/*.tif')[0]
with rasterio.open(p) as d:
 hist=np.zeros(256,dtype=np.int64); counts=np.zeros((40,60,4),dtype=np.int64)
 for j in range(40):
  a=d.read(1,window=Window(0,j*1000,60000,1000)); hist+=np.bincount(a.ravel(),minlength=256)
  for k in range(1,5):counts[j,:,k-1]=(a==k).reshape(1000,60,1000).sum(axis=(0,2))
 np.save('/tmp/map-audit/blekinge-counts.npy',counts)
n=counts.sum(axis=2); land=counts[:,:,:3].sum(axis=2); water=counts[:,:,3]; sums=counts[:,:,:3]@np.array([.15,.45,.70]); old=np.divide(sums+.95*water,n,out=np.full(n.shape,np.nan),where=n>0); new=np.divide(sums,land,out=np.full(n.shape,np.nan),where=land>0); delta=old-new; both=(land>0)&(water>0)
r={'histogram':{str(i):int(v) for i,v in enumerate(hist) if v},'total_pixels':int(hist.sum()),'valid_cells':int((n>0).sum()),'land_cells':int((land>0).sum()),'class4_cells':int((water>0).sum()),'mixed_water_land_cells':int(both.sum()),'water_only_cells':int(((water>0)&(land==0)).sum()),'pixel_weighted_old':float((sums.sum()+.95*water.sum())/n.sum()),'pixel_weighted_corrected':float(sums.sum()/land.sum()),'same_land_cells_old_mean':float(old[land>0].mean()),'same_land_cells_new_mean':float(new[land>0].mean()),'mixed_delta_mean':float(delta[both].mean()),'mixed_delta_median':float(np.median(delta[both])),'mixed_delta_max':float(delta[both].max()),'delta_gt_005':int((delta>.05).sum()),'delta_gt_010':int((delta>.1).sum())}
ij=np.unravel_index(np.nanargmax(delta),delta.shape);r['max_cell']={'center_e':int(461000+2000*ij[1]),'center_n':int(6269000-2000*ij[0]),'old':float(old[ij]),'new':float(new[ij]),'counts':counts[ij].tolist()}
print(json.dumps(r,indent=2),flush=True);json.dump(r,open('/tmp/map-audit/blekinge-results.json','w'),indent=2)
# Exact overlap clip, grid-aligned: E460000..480000 N6190000..6270000.
with rasterio.open(p) as b,rasterio.open(glob.glob('/tmp/map-audit/soil12/*.tif')[0]) as s:
 cs=np.zeros((40,10,4),dtype=np.int64); cm=cs.copy(); overlap=diff=added=overwritten=0
 for j in range(40):
  ba=b.read(1,window=Window(0,j*1000,10000,1000));sa=s.read(1,window=Window(60000,5000+j*1000,10000,1000)); bv=(ba>=1)&(ba<=4);sv=(sa>=1)&(sa<=4)
  overlap+=int((bv&sv).sum());diff+=int(((ba!=sa)&bv&sv).sum());added+=int((~bv&sv).sum());overwritten+=int((bv&(sa==255)).sum());ma=np.where(sv,sa,ba)
  for k in range(1,5):
   cs[j,:,k-1]=(sa==k).reshape(1000,10,1000).sum(axis=(0,2));cm[j,:,k-1]=(ma==k).reshape(1000,10,1000).sum(axis=(0,2))
 cb=counts[:,:10,:]
 def means(c,water):
  den=c.sum(axis=2) if water else c[:,:,:3].sum(axis=2);su=c[:,:,:3]@np.array([.15,.45,.7]);su=su+.95*c[:,:,3] if water else su
  return np.divide(su,den,out=np.full(den.shape,np.nan),where=den>0)
 rr={'clip':[460000,6190000,480000,6270000],'shared_valid_pixels':overlap,'conflicting_shared_pixels':diff,'skane_added_valid_pixels':added,'blekinge_valid_pixels_under_skane255':overwritten}
 for mode in [True,False]:
  mb,ms,mm=means(cb,mode),means(cs,mode),means(cm,mode);common=np.isfinite(mb)&np.isfinite(ms);changed=np.isfinite(mb)&np.isfinite(mm)&(np.abs(mm-mb)>1e-12)
  rr['old' if mode else 'corrected']={'both_counties_cells':int(common.sum()),'blekinge_vs_merged_changed_cells':int(changed.sum()),'max_abs_blekinge_vs_merged':float(np.nanmax(np.abs(mb-mm))),'max_abs_county_vs_county':float(np.max(np.abs(mb[common]-ms[common]))),'mean_abs_county_vs_county':float(np.mean(np.abs(mb[common]-ms[common])))}
 print(json.dumps(rr,indent=2));json.dump(rr,open('/tmp/map-audit/boundary-results.json','w'),indent=2)
