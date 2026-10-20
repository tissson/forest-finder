"""Offline sensitivity study. No app imports, database connections, or fitted biology.
Run with Python scipy/numpy/pyproj; input is a frozen read-only database snapshot.
"""
import argparse
import csv
import json
import math
from pathlib import Path
from time import perf_counter
import numpy as np
from scipy.spatial import cKDTree
from scipy.stats import spearmanr
from pyproj import Transformer


def penalty(temp, smooth=False):
    if temp is None:
        return 0.0
    if not smooth:
        return .45 if temp < 2 or temp > 24 else 0 if 8 <= temp <= 17 else .15
    anchors = [(2, .45), (5, .15), (8, 0), (17, 0), (20.5, .15), (24, .45)]
    if temp <= 2 or temp >= 24:
        return .45
    for (left, a), (right, b) in zip(anchors, anchors[1:]):
        if left <= temp <= right:
            u = (temp-left)/(right-left)
            return a+(b-a)*(3*u*u-2*u*u*u)
    raise ValueError('Unreachable temperature interval')


def moisture(temp, r7, r10, smooth=False, exponential=False):
    r7, r10 = 0 if r7 is None else r7, 0 if r10 is None else r10
    if r7 < 0 or r10 < r7:
        raise ValueError('Rainfall must be nonnegative and 10-day total >= 7-day total')
    rain = (.6*-math.expm1(-r7/40)+.4*-math.expm1(-r10/70)) if exponential else (.6*min(1, r7/40)+.4*min(1, r10/70))
    return max(0, min(1, rain-penalty(temp, smooth)))


def idw(neighbors, distances):
    distances = np.asarray(distances, dtype=float)
    values = np.asarray(neighbors, dtype=float)
    if np.any(distances == 0):
        return values[np.flatnonzero(distances == 0)[0]]
    weights = 1/distances**2
    return np.sum(values*weights[:, None], axis=0)/weights.sum()


def score(cell, profile, m, season):
    blend = m if cell['soil_wetness'] is None else .6*m+.4*cell['soil_wetness']
    tree = np.array([cell[k] or 0 for k in ['vol_spruce', 'vol_pine', 'vol_birch']])
    fit = .5 if tree.sum() < 5 else np.dot(tree, [profile[k] for k in ['aff_spruce', 'aff_pine', 'aff_birch']])/tree.sum()
    return max(0, min(1, season*(.45*math.exp(-((blend-profile['moisture_optimum'])/profile['moisture_tolerance'])**2)+.30*math.exp(-((cell['forest_cover']-profile['forest_optimum'])/profile['forest_tolerance'])**2)+.25*fit)))


def season_multiplier(species, date):
    if not species['season_start'] or not species['season_end']:
        return 1
    md = date[5:]; start = species['season_start'][5:]; end = species['season_end'][5:]
    within = start <= md <= end if start <= end else md >= start or md <= end
    return 1 if within else .65


def run(input_path, output):
    data = json.loads(Path(input_path).read_text())
    weather, cells = data['weather'], data['cells']
    assert len({w['id'] for w in weather}) == len(weather)
    tr = Transformer.from_crs(4326, 3006, always_xy=True)
    wx, wy = tr.transform([w['lon'] for w in weather], [w['lat'] for w in weather])
    cx, cy = tr.transform([c['lon'] for c in cells], [c['lat'] for c in cells])
    start = perf_counter(); tree = cKDTree(np.column_stack([wx, wy])); dist, idx = tree.query(np.column_stack([cx, cy]), k=4)
    raw = np.array([[w['temp'], w['r7'], w['r10']] for w in weather])
    estimates = np.array([idw(raw[i], d) for i, d in zip(idx, dist)])
    seconds = perf_counter()-start
    lookup = {w['id']: w for w in weather}
    variants = ['baseline', 'idw4', 'smooth_temperature', 'exponential_rain', 'combined_curves']
    records, summary = [], []
    for species, profile in zip(data['species'], data['profiles']):
        assert species['id'] == profile['species_id']
        season = season_multiplier(species, data['date']); scores = {v: [] for v in variants}
        for cell, estimated in zip(cells, estimates):
            w = lookup[cell['weather_sample_id']]
            # Baseline stored moisture must agree with the live database formula.
            m = moisture(w['temp'], w['r7'], w['r10'])
            assert abs(m-w['moisture']) < 1e-12
            for v in variants:
                if v == 'baseline': value = m
                elif v == 'idw4': value = moisture(*estimated)
                else: value = moisture(w['temp'], w['r7'], w['r10'], smooth=v in ['smooth_temperature', 'combined_curves'], exponential=v in ['exponential_rain', 'combined_curves'])
                s = score(cell, profile, value, season); scores[v].append(s)
                records.append({'species': species['name_sv'], 'cell_id': cell['id'], 'variant': v, 'score': s, 'weather_moisture': value})
        base = np.array(scores['baseline']); n_top = max(1, math.ceil(len(base)*.1)); top = set(np.argsort(base, kind='stable')[-n_top:])
        for v in variants:
            values = np.array(scores[v]); change = values-base
            summary.append({'species': species['name_sv'], 'variant': v, 'cells': len(cells), 'mean_score': float(values.mean()), 'mean_delta': float(change.mean()), 'mean_abs_delta': float(abs(change).mean()), 'max_abs_delta': float(abs(change).max()), 'spearman_vs_baseline': float(spearmanr(base, values).statistic), 'top10pct_overlap': len(top & set(np.argsort(values, kind='stable')[-n_top:]))/n_top, 'above_020_fraction': float((values>.2).mean()), 'above_050_fraction': float((values>.5).mean()), 'above_070_fraction': float((values>.7).mean())})
    out = Path(output); out.mkdir(parents=True, exist_ok=True)
    for name, rows in [('weather-score-sensitivity.csv', summary), ('weather-cell-scores.csv', records)]:
        with (out/name).open('w') as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    (out/'weather-experiment-metadata.json').write_text(json.dumps({'date': data['date'], 'weather_points': len(weather), 'cells': len(cells), 'interpolation_local_cpu_seconds': seconds, 'note': 'Local Python CPU, not server tile performance. Curves are unfitted species-independent sensitivity experiments. No best ecological variant chosen.'}, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('input'); parser.add_argument('output'); args = parser.parse_args(); run(args.input, args.output)
