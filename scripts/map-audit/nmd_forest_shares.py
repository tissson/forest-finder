"""Aggregate NMD2018 v1.1 (10 m, EPSG:3006, CC0) to the app's 2x2 km grid.
Read-only on the raster; writes a CSV of per-cell pixel counts. Cell = 2000 m aligned
(EPSG:3006 multiples of 2000), output x/y = cell centre, matching load_* functions.
Usage: python nmd_forest_shares.py NMD_TIF OUT_CSV
"""
import sys, numpy as np, rasterio
from rasterio.windows import Window
src, out = sys.argv[1:]
G = {'water':[61,62],'forest':list(range(111,118))+list(range(121,128)),'clearcut':[118,128],
     'pine':[111,121],'spruce':[112,122],'mixcon':[113,123],'mixdec':[114,124],'decid':[115,116,117,125,126,127]}
with rasterio.open(src) as d:
    t=d.transform; x0=208000; y0=7672000
    c_off=int(round((x0-t.c)/10)); r_off=int(round((t.f-y0)/10))  # negative => padding
    nx=-(-(d.width-c_off)//200); ny=-(-(d.height-r_off)//200)
    luts={k:np.isin(np.arange(256),v) for k,v in G.items()}
    with open(out,'w') as f:
        f.write('x,y,total,classified,'+','.join(G)+'\n')
        for j in range(ny):
            r=r_off+200*j; a=np.zeros((200,nx*200),np.uint8)
            rr0=max(r,0); rr1=min(r+200,d.height)
            if rr1<=rr0: continue
            cc0=max(c_off,0); cc1=min(c_off+nx*200,d.width)
            a[rr0-r:rr1-r, cc0-c_off:cc1-c_off]=d.read(1,window=Window(cc0,rr0,cc1-cc0,rr1-rr0))
            b=a.reshape(200,nx,200).transpose(1,0,2).reshape(nx,-1)
            cls=(b!=0).sum(1)
            cnt={k:lut[b].sum(1) for k,lut in luts.items()}
            for i in np.nonzero(cls)[0]:
                f.write(f"{x0+2000*i+1000},{y0-2000*j-1000},40000,{cls[i]},"+','.join(str(cnt[k][i]) for k in G)+'\n')
            if j%50==0: print(j,ny,flush=True)
print('done')
