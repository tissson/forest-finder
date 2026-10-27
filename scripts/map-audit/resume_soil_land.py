"""Audit-only, restartable aligned national mosaic reduction; never writes DB.

Inputs: /tmp/soil-land/source.vrt (all 21 counties, source nodata=255).
Each 2 km row is committed atomically as a small NPZ checkpoint containing
all three metrics. Completed rows survive workspace resets in docs/. The
final three GeoTIFFs are created only after every row checkpoint is valid.
Integer-aligned 2 m pixels are averaged exactly once per 2 km target cell.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

import numpy as np
import rasterio
from rasterio.windows import Window


def reduce_row(a):
    """Whole-cell fractions, land-only weighted mean, aligned 1000px cells."""
    blocks = a.reshape(1000, a.shape[1] // 1000, 1000)
    counts = [np.count_nonzero(blocks == c, axis=(0, 2)) for c in (1, 2, 3, 4)]
    n = counts[0] + counts[1] + counts[2]
    land = np.full(n.shape, np.nan, dtype=np.float64)
    np.divide(15 * counts[0] + 45 * counts[1] + 70 * counts[2],
              100 * n, out=land, where=n > 0)
    return land, counts[3] / 1000000, (n + counts[3]) / 1000000


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='/tmp/soil-land/source.vrt')
    p.add_argument('--out', default='docs/map-audit/soil-land-checkpoints')
    p.add_argument('--rows', type=int, default=25, help='maximum unfinished rows this run')
    args = p.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    start = time.time()
    with rasterio.open(args.source) as src:
        assert src.crs.to_epsg() == 3006 and src.res == (2, 2)
        assert src.width % 1000 == src.height % 1000 == 0
        assert src.transform.c == 260000 and src.transform.f == 7680000
        width, height = src.width // 1000, src.height // 1000
        manifest = {'source': str(Path(args.source).resolve()), 'grid': [width,height],
                    'bounds': list(src.bounds), 'rules': '1:15,2:45,3:70;4 water;0/5/255 excluded',
                    'denominator': 1000000, 'source_order': sorted(str(f) for f in Path('/tmp/soil-land/raw').glob('*/*.tif'))}
        (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        done = 0
        for row in range(height):
            target = out / f'row_{row:04d}.npz'
            if target.exists():
                with np.load(target) as d:
                    assert all(d[k].shape == (width,) for k in ['land','water','valid'])
                continue
            if done >= args.rows: break
            a = src.read(1, window=Window(0, row * 1000, src.width, 1000))
            land, water, valid = reduce_row(a)
            assert np.all(water <= valid) and np.all(valid <= 1)
            tmp = target.with_suffix('.partial')
            with open(tmp, 'wb') as f: np.savez_compressed(f, land=land, water=water, valid=valid)
            os.replace(tmp, target)
            done += 1
            print(f'row {row+1}/{height}, completed {len(list(out.glob("row_*.npz")))}, elapsed {time.time()-start:.1f}s', flush=True)
        files = sorted(out.glob('row_*.npz'))
        if len(files) == height:
            transform = src.transform * rasterio.Affine.scale(1000)
            for key, name in [('land','soil_wetness_land'),('water','soil_water_fraction'),('valid','soil_valid_fraction')]:
                target = out / f'{name}_2km.tif'; tmp = target.with_suffix('.partial.tif')
                data = np.stack([np.load(f)[key] for f in files])
                with rasterio.open(tmp, 'w', driver='GTiff', height=height, width=width,
                    count=1, dtype='float64', crs=src.crs, transform=transform,
                    nodata=float('nan'), compress='deflate') as dst: dst.write(data,1)
                with rasterio.open(tmp) as check: np.testing.assert_equal(check.read(1),data)
                os.replace(tmp,target)
            hashes = {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in out.glob('*_2km.tif')}
            (out/'COMPLETE.json').write_text(json.dumps(hashes,indent=2))
            print('ALL THREE COMPLETE AND READBACK VERIFIED',flush=True)


if __name__ == '__main__': main()