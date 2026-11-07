"""Standalone read-only archive export; never imports application/database code."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import random
import time
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/map-audit/gbif-expanded-selected-2026-10-20.csv'
OUT = ROOT / 'docs/map-audit'
STATE = OUT / 'gbif-date-weather-checkpoints'
START, END = date(2020, 7, 1), date(2025, 12, 15)
SEED = 20261107
SPECIES = {'Craterellus tubaeformis', 'Rubus chamaemorus'}
DAYS = (END - START).days + 1
# Conservative fractional accounting: length / 14, rounded UP per request.
COST = math.ceil(DAYS / 14)
FIELDS = ['species', 'latitude', 'longitude', 'is_presence', 'date',
          'precip_7d', 'precip_10d', 'temp_mean', 'day_of_year']


def location(row):
    return tuple(str(Decimal(row[k]).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
                 for k in ('latitude', 'longitude'))


def checkpoint(loc):
    return STATE / ('era5_' + '_'.join(loc) + '.json.gz')


def atomic_json(path, payload):
    tmp = path.with_suffix(path.suffix + '.tmp')
    if path.suffix == '.gz':
        with gzip.open(tmp, 'wt') as f:
            json.dump(payload, f, separators=(',', ':'))
    else:
        tmp.write_text(json.dumps(payload, indent=2) + '\n')
    tmp.replace(path)


def calendar_distance(a, b):
    # Leap-year calendar preserves Feb 29 and compares month/day across years.
    x = date(2000, a.month, a.day).timetuple().tm_yday
    y = date(2000, b.month, b.day).timetuple().tm_yday
    delta = abs(x-y)
    return min(delta, 366-delta)


def daily_terms(daily):
    terms = {}
    precipitation = daily['precipitation_sum']
    for i, day in enumerate(daily['time']):
        temp = daily['temperature_2m_mean'][i]
        window = precipitation[max(0, i-9):i+1]
        if i < 9 or temp is None or len(window) != 10 or any(v is None for v in window):
            continue
        if not all(math.isfinite(v) for v in [temp] + window):
            continue
        terms[date.fromisoformat(day)] = (sum(window[-7:]), sum(window), temp)
    return terms


def control_dates(event, available, key):
    candidates = sorted(d for d in available if d != event and
                        2020 <= d.year <= 2025 and calendar_distance(d, event) <= 30)
    if len(candidates) < 20:
        return []
    seed = hashlib.sha256(f'{SEED}:{key}'.encode()).digest()
    return sorted(random.Random(int.from_bytes(seed, 'big')).sample(candidates, 20))


def fetch(rows, max_locations):
    import requests
    STATE.mkdir(parents=True, exist_ok=True)
    ledger_path = STATE / 'requests.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    # One earlier smoke request is accounted for when initialising this run.
    if not ledger:
        ledger.append({'timestamp': time.time(), 'cost': COST, 'status': 200,
                       'location': ['59.3', '18.0'], 'note': 'initial full-range smoke'})
        smoke = Path('/tmp/gbif-date-smoke.json')
        if smoke.exists():
            atomic_json(checkpoint(('59.3', '18.0')), json.loads(smoke.read_text()))
        atomic_json(ledger_path, ledger)
    locations = sorted({location(r) for r in rows if 2020 <= date.fromisoformat(r['event_date'][:10]).year <= 2025})
    attempted = 0
    stop = 'requested_batch_completed'
    for loc in locations:
        if checkpoint(loc).exists():
            continue
        if attempted >= max_locations:
            break
        now = time.time()
        if sum(x['cost'] for x in ledger if now-x['timestamp'] < 3600) + COST > 4000:
            stop = 'conservative_hourly_budget'; break
        if sum(x['cost'] for x in ledger if now-x['timestamp'] < 86400) + COST > 8000:
            stop = 'conservative_daily_budget'; break
        recent = [x for x in ledger if now-x['timestamp'] < 60]
        if sum(x['cost'] for x in recent) + COST > 450:
            time.sleep(max(0, 61-(now-min(x['timestamp'] for x in recent))))
        entry = {'timestamp': time.time(), 'cost': COST, 'location': list(loc), 'status': 'started'}
        ledger.append(entry)
        atomic_json(ledger_path, ledger)
        attempted += 1
        params = dict(latitude=loc[0], longitude=loc[1], start_date=START.isoformat(),
                      end_date=END.isoformat(), daily='precipitation_sum,temperature_2m_mean',
                      timezone='Europe/Stockholm', models='era5')
        try:
            response = requests.get('https://archive-api.open-meteo.com/v1/archive', params=params, timeout=50)
            entry['status'] = response.status_code
            entry['url'] = response.url
            if response.status_code != 200:
                entry['error'] = response.text[:1000]
                entry['retry_after'] = response.headers.get('Retry-After')
                stop = f'HTTP_{response.status_code}'
                atomic_json(ledger_path, ledger)
                break  # No retry storm; rerun only after the provider's cooldown.
            payload = response.json()
            daily = payload['daily']
            expected = [(START+timedelta(days=i)).isoformat() for i in range(DAYS)]
            if daily['time'] != expected or any(len(daily[k]) != DAYS for k in ('precipitation_sum', 'temperature_2m_mean')):
                raise ValueError('Unexpected archive dates or array lengths')
            atomic_json(checkpoint(loc), payload)
            entry['sha256'] = hashlib.sha256(checkpoint(loc).read_bytes()).hexdigest()
        except (requests.RequestException, ValueError, KeyError) as exc:
            entry['error'] = str(exc)
            stop = 'request_or_payload_error'
            atomic_json(ledger_path, ledger)
            break
        atomic_json(ledger_path, ledger)
        print(f'checkpoint {loc}: {DAYS} days; batch {attempted}', flush=True)
    return stop


def export(rows, stamp, stop):
    counts = {s: Counter(input=0, complete=0, outside_years=0, missing_presence_data=0,
                         insufficient_controls=0, pending_archive=0) for s in SPECIES}
    output = OUT / f'gbif-date-test-{stamp}.csv'
    tmp = output.with_suffix('.csv.tmp')
    term_cache = {}
    exclusions = []
    with tmp.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in rows:
            c = counts[r['species']]; c['input'] += 1
            event = date.fromisoformat(r['event_date'][:10])
            reason = None
            loc = location(r)
            if not 2020 <= event.year <= 2025:
                reason = 'outside_years'
            elif not START <= event <= END:
                reason = 'missing_presence_data'
            elif not checkpoint(loc).exists():
                reason = 'pending_archive'
            else:
                if loc not in term_cache:
                    with gzip.open(checkpoint(loc), 'rt') as g:
                        term_cache[loc] = daily_terms(json.load(g)['daily'])
                terms = term_cache[loc]
                if event not in terms:
                    reason = 'missing_presence_data'
                else:
                    controls = control_dates(event, terms, r['gbif_key'])
                    if len(controls) != 20:
                        reason = 'insufficient_controls'
                    else:
                        for d, presence in [(event, 1)] + [(d, 0) for d in controls]:
                            p7, p10, t = terms[d]
                            writer.writerow(dict(species=r['species'], latitude=r['latitude'],
                                longitude=r['longitude'], is_presence=presence, date=d.isoformat(),
                                precip_7d=f'{p7:.6f}', precip_10d=f'{p10:.6f}', temp_mean=f'{t:.6f}',
                                day_of_year=d.timetuple().tm_yday))
                        c['complete'] += 1
            if reason:
                c[reason] += 1
                exclusions.append(dict(gbif_key=r['gbif_key'], species=r['species'],
                                       event_date=event.isoformat(), reason=reason))
    tmp.replace(output)
    metadata = dict(source=str(SOURCE.relative_to(ROOT)), source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        output=str(output.relative_to(ROOT)), output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
        seed=SEED, start_date=str(START), end_date=str(END), model='era5', timezone='Europe/Stockholm',
        rounding='0.1 degrees, decimal ROUND_HALF_UP; original coordinates retained in export',
        precipitation='Trailing 7/10 daily totals including the target day; all days required, no zero filling',
        temperature='Daily temperature_2m_mean on the target day',
        controls='20 unique uniform dates among complete archive days, cyclic month/day ±30, years 2020–2025; excludes own date; deterministic per GBIF key',
        stop_reason=stop, counts=counts, exclusions=exclusions,
        complete=all(c['pending_archive'] == 0 for c in counts.values()),
        attribution='Weather: Open-Meteo Historical Weather API / ERA5 (CC BY 4.0), https://open-meteo.com/; GBIF sources/licenses retained in input CSV',
        limits='Conservative weighted budgets 450/minute, 4000/hour, 8000/rolling day; requests logged before sending')
    atomic_json(OUT / f'gbif-date-test-{stamp}-metadata.json', metadata)
    print(json.dumps({k: metadata[k] for k in ('output', 'complete', 'stop_reason', 'counts')}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-locations', type=int, default=25)
    parser.add_argument('--stamp', default='2026-11-07')
    args = parser.parse_args()
    with SOURCE.open() as f:
        rows = [r for r in csv.DictReader(f) if r['species'] in SPECIES]
    stop = fetch(rows, args.max_locations) if args.max_locations > 0 else 'export_only'
    export(rows, args.stamp, stop)