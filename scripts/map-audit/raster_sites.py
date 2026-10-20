"""Read local raster windows only; no production connection or loader calls.
Usage: python raster_sites.py NMD_TIF SOIL10_TIF SOIL24_TIF CONTINUOUS10_TIF OUTPUT
NMD source/version: NMD2018 ungeneralised v1.1, 10m, CC0.
Soil scores .15/.45/.70 below are sensitivity assumptions, not SLU estimates.
"""
import json
import sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import from_bounds

SITES = [('Blekinge',(530000,6238000,532000,6240000)),('Vilhelmina',(578000,7166000,580000,7168000)),('Lycksele',(674000,7168000,676000,7170000)),('Arvidsjaur',(692000,7280000,694000,7282000)),('Gallivare',(744000,7456000,746000,7458000)),('Boundary',(466000,6234000,468000,6236000))]


def counts(a):
    return {str(int(v)):int(n) for v,n in zip(*np.unique(a,return_counts=True))}


def read(d,b):
    return d.read(1,window=from_bounds(*b,d.transform))


def run(nmd,soil10,soil24,continuous10,output):
    result=[]
    with rasterio.open(nmd) as d:
        for name,bounds in SITES:
            a=read(d,bounds);hist=counts(a)
            # Code 0 is unclassified even when TIFF has no declared NoData.
            valid=np.count_nonzero(a!=0);water=np.count_nonzero(np.isin(a,[61,62]));land=valid-water
            forest=np.count_nonzero(np.isin(a,list(range(111,118))+list(range(121,128))))
            temp=np.count_nonzero(np.isin(a,[118,128]));wet=np.count_nonzero(np.isin(a,[2]+list(range(121,129))))
            result.append({'site':name,'bounds_3006':bounds,'total_pixels':a.size,'classified_pixels':int(valid),'unclassified_pixels':int(np.count_nonzero(a==0)),'water_pixels':int(water),'land_pixels':int(land),'standing_forest_pixels':int(forest),'temporary_forest_pixels':int(temp),'wetland_pixels':int(wet),'standing_forest_land_fraction':forest/land if land else None,'forest_with_temporary_land_fraction':(forest+temp)/land if land else None,'wetland_land_fraction':wet/land if land else None,'histogram':hist})
    for row in result:
        source=soil10 if row['site'] in ['Blekinge','Boundary'] else soil24 if row['site'] in ['Vilhelmina','Lycksele'] else None
        if source is None:continue
        with rasterio.open(source) as d:
            a=read(d,row['bounds_3006']);hist=counts(a);land=np.isin(a,[1,2,3]);water=a==4;valid=land|water
            lut=np.array([0,.15,.45,.70,.95]);su=float(lut[a[land]].sum());old=(su+.95*water.sum())/valid.sum() if valid.sum() else None;new=su/land.sum() if land.sum() else None
            row['soil']={'histogram':hist,'old_class_lut_mean':old,'water_excluded_class_lut_mean':new,'water_fraction_valid':float(water.sum()/valid.sum()) if valid.sum() else None,'valid_ground_fraction_all_pixels':float(land.mean())}
        if row['site'] in ['Blekinge','Boundary']:
            with rasterio.open(continuous10) as d:
                c=read(d,row['bounds_3006']);ground=(c>=0)&(c<=100)
                row['continuous']={'header_nodata':d.nodata,'histogram':counts(c),'valid_ground_pixels':int(ground.sum()),'water101_pixels':int(np.count_nonzero(c==101)),'padding255_pixels':int(np.count_nonzero(c==255)),'mean_ground_index_0_1':float(c[ground].mean()/100) if ground.any() else None,'class4_matches_continuous101':bool(np.array_equal(a==4,c==101))}
    out={'product':'NMD2018 ungeneralised v1.1','license':'CC0','nmd_source':'https://geodata.naturvardsverket.se/nedladdning/marktacke/NMD2018/NMD2018_basskikt_ogeneraliserad_Sverige_v1_1.zip','note':'Wetland includes wooded wetland, not proven peat mire; no country area estimate. Soil LUT weights are unvalidated sensitivity only. Continuous code101 water verified against classified4 at these sites; padding255 excluded.','sites':result}
    Path(output).write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))

if __name__=='__main__':run(*sys.argv[1:])
