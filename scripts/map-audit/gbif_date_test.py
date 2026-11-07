"""Standalone read-only archive export; never imports application/database code."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import random
import shutil
import time
from collections import Counter
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/map-audit/gbif-expanded-selected-2026-10-20.csv'
OUT = ROOT / 'docs/map-audit'
STATE = OUT / 'gbif-date-weather-checkpoints'
SEED = 20261107
ORDER = ('Craterellus tubaeformis', 'Rubus chamaemorus')
SPECIES = set(ORDER)
FIELDS = ['species', 'latitude', 'longitude', 'is_presence', 'date',
          'precip_7d', 'precip_10d', 'temp_mean', 'day_of_year']


def location(row):
    return tuple(str(Decimal(row[k]).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
                 for k in ('latitude', 'longitude'))


def checkpoint(loc):
    return STATE / ('era5_' + '_'.join(loc) + '.json.gz')


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    if path.suffix == '.gz':
        with gzip.open(tmp, 'wt') as f:
            json.dump(payload, f, separators=(',', ':'))
    else:
        tmp.write_text(json.dumps(payload, indent=2) + '\n')
    tmp.replace(path)


def calendar_distance(a, b):
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
    candidates = sorted(d for d in available if d.year == event.year and
                        3 < abs((d-event).days) <= 30)
    if len(candidates) < 20:
        return []
    seed = hashlib.sha256(f'{SEED}:{key}'.encode()).digest()
    return sorted(random.Random(int.from_bytes(seed, 'big')).sample(candidates, 20))


def groups_for(rows):
    groups = {}
    for r in rows:
        event = date.fromisoformat(r['event_date'][:10])
        if not 2020 <= event.year <= 2025:
            continue
        loc = location(r)
        key = (*loc, event.year)
        start, end = event-timedelta(days=40), event+timedelta(days=30)
        if key not in groups:
            groups[key] = dict(loc=loc, year=event.year, start=start, end=end, rows=[])
        g = groups[key]
        g['start'], g['end'] = min(start, g['start']), max(end, g['end'])
        g['rows'].append(r)
    return sorted(groups.values(), key=lambda g: (
        min(ORDER.index(r['species']) for r in g['rows']), g['loc'], g['year']))


def interval_checkpoint(g):
    return STATE / f"era5_{'_'.join(g['loc'])}_{g['year']}_{g['start']}_{g['end']}.json.gz"


def read_daily(path):
    with gzip.open(path, 'rt') as f:
        return json.load(f)['daily']


def cached_daily(g):
    path = interval_checkpoint(g)
    if path.exists():
        return read_daily(path)
    legacy = checkpoint(g['loc'])
    if legacy.exists():
        daily = read_daily(legacy)
        if daily['time'][0] <= str(g['start']) and daily['time'][-1] >= str(g['end']):
            indices = [i for i, d in enumerate(daily['time']) if str(g['start']) <= d <= str(g['end'])]
            return {k: [daily[k][i] for i in indices] for k in
                    ('time', 'precipitation_sum', 'temperature_2m_mean')}
    return None


def request_cost(start, end):
    return math.ceil(((end-start).days+1)/14)


def budget_wait(ledger, cost, now):
    wait = 0.0
    for seconds, limit in ((60, 450), (3600, 4000), (86400, 8000)):
        recent = sorted((x for x in ledger if now-x['timestamp'] < seconds), key=lambda x: x['timestamp'])
        total = sum(x['cost'] for x in recent)
        for x in recent:
            if total+cost <= limit:
                break
            total -= x['cost']
            wait = max(wait, x['timestamp']+seconds+1-now)
    return max(0.0, wait)


def retry_seconds(value, now):
    if value:
        try:
            return max(1, float(value))
        except ValueError:
            return max(1, parsedate_to_datetime(value).timestamp()-now)
    return 3600  # Without a header, conservatively cool down one hour.


def preserve_original(stamp):
    for suffix in ('.csv', '-metadata.json', '-status.md'):
        source = OUT / f'gbif-date-test-{stamp}{suffix}'
        target = OUT / f'gbif-date-test-{stamp}-legacy{suffix}'
        if source.exists() and not target.exists():
            shutil.copyfile(source, target)


def fetch(rows, max_locations, run_seconds=540):
    import requests
    STATE.mkdir(parents=True, exist_ok=True)
    ledger_path, cooldown_path = STATE/'requests.json', STATE/'cooldown.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    deadline, attempted = time.monotonic()+run_seconds, 0
    session = requests.Session()
    for g in groups_for(rows):
        if cached_daily(g) is not None:
            continue
        if attempted >= max_locations:
            return 'requested_batch_completed'
        cost = request_cost(g['start'], g['end'])
        while cached_daily(g) is None:
            now = time.time()
            cooldown = json.loads(cooldown_path.read_text()) if cooldown_path.exists() else {}
            wait = max(budget_wait(ledger, cost, now), cooldown.get('until', 0)-now, 0)
            if time.monotonic()+wait+55 >= deadline:
                atomic_json(STATE/'next-run.json', dict(not_before_utc=datetime.fromtimestamp(now+wait, timezone.utc).isoformat(), reason='budget_or_runtime_pause', next_location=g['loc'], cost=cost))
                return 'budget_or_runtime_pause'
            if wait:
                print(f'Waiting {wait:.1f}s for quota/cooldown', flush=True)
                time.sleep(wait)
            entry = dict(timestamp=time.time(), cost=cost, location=list(g['loc']),
                         start_date=str(g['start']), end_date=str(g['end']), status='started', method='short_location_year')
            ledger.append(entry)
            atomic_json(ledger_path, ledger)
            attempted += 1
            params = dict(latitude=g['loc'][0], longitude=g['loc'][1], start_date=str(g['start']),
                          end_date=str(g['end']), daily='precipitation_sum,temperature_2m_mean',
                          timezone='Europe/Stockholm', models='era5')
            try:
                response = session.get('https://archive-api.open-meteo.com/v1/archive', params=params, timeout=50)
                entry.update(status=response.status_code, elapsed_seconds=response.elapsed.total_seconds(), url=response.url)
                if response.status_code != 200:
                    entry.update(error=response.text[:1000], retry_after=response.headers.get('Retry-After'))
                    atomic_json(ledger_path, ledger)
                    if response.status_code == 429:
                        seconds = retry_seconds(entry['retry_after'], time.time())
                        atomic_json(cooldown_path, dict(until=time.time()+seconds, retry_after=entry['retry_after'], error=entry['error']))
                        print(f'HTTP 429; cooldown {seconds:.0f}s', flush=True)
                        continue
                    return f'HTTP_{response.status_code}'
                payload = response.json()
                daily = payload['daily']
                count = (g['end']-g['start']).days+1
                expected = [str(g['start']+timedelta(days=i)) for i in range(count)]
                if daily['time'] != expected or any(len(daily[k]) != count for k in ('precipitation_sum', 'temperature_2m_mean')):
                    raise ValueError('Unexpected dates/array lengths')
                path = interval_checkpoint(g)
                atomic_json(path, payload)
                entry['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
            except (requests.RequestException, ValueError, KeyError) as exc:
                entry['error'] = str(exc)
                atomic_json(ledger_path, ledger)
                return 'request_or_payload_error'
            atomic_json(ledger_path, ledger)
            print(f"checkpoint {g['loc']} {g['year']}: {count} days, weight {cost}, request {attempted}", flush=True)
    return 'all_archives_complete'


def export(rows, stamp, stop):
    counts = {s: Counter(input=0, complete=0, outside_years=0, missing_presence_data=0,
                         insufficient_controls=0, pending_archive=0) for s in ORDER}
    terms_by_key = {}
    for g in groups_for(rows):
        daily = cached_daily(g)
        if daily is not None:
            terms_by_key[(*g['loc'], g['year'])] = daily_terms(daily)
    exclusions, outputs = [], []
    for species, suffix in zip(ORDER, ('', '-hjortron')):
        output = OUT / f'gbif-date-test-{stamp}{suffix}.csv'
        tmp = output.with_suffix('.csv.tmp')
        with tmp.open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            for r in rows:
                if r['species'] != species:
                    continue
                c = counts[species]; c['input'] += 1
                event = date.fromisoformat(r['event_date'][:10])
                terms = terms_by_key.get((*location(r), event.year))
                reason = None
                if not 2020 <= event.year <= 2025:
                    reason = 'outside_years'
                elif terms is None:
                    reason = 'pending_archive'
                elif event not in terms:
                    reason = 'missing_presence_data'
                else:
                    controls = control_dates(event, terms, r['gbif_key'])
                    if len(controls) != 20:
                        reason = 'insufficient_controls'
                    else:
                        for d, presence in [(event, 1)] + [(d, 0) for d in controls]:
                            p7, p10, t = terms[d]
                            writer.writerow(dict(species=species, latitude=r['latitude'], longitude=r['longitude'],
                                is_presence=presence, date=str(d), precip_7d=f'{p7:.6f}', precip_10d=f'{p10:.6f}',
                                temp_mean=f'{t:.6f}', day_of_year=d.timetuple().tm_yday))
                        c['complete'] += 1
                if reason:
                    c[reason] += 1
                    exclusions.append(dict(gbif_key=r['gbif_key'], species=species, event_date=str(event), reason=reason))
        tmp.replace(output)
        outputs.append(dict(path=str(output.relative_to(ROOT)), sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
    ledger = json.loads((STATE/'requests.json').read_text())
    groups = groups_for(rows)
    pending = [g for g in groups if cached_daily(g) is None]
    short = [x for x in ledger if x.get('method') == 'short_location_year']
    metadata = dict(source=str(SOURCE.relative_to(ROOT)), source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        outputs=outputs, seed=SEED, model='era5', timezone='Europe/Stockholm',
        intervals='union per rounded location/year of event -40 through +30 days inclusive',
        controls='20 fixed-seed same-year days at same place, abs(date-event) 4..30, complete ten-day history',
        rounding='0.1 decimal ROUND_HALF_UP; original coordinates in CSV',
        stop_reason=stop, counts=counts, exclusions=exclusions,
        requests=dict(total=len(ledger), total_weight=sum(x['cost'] for x in ledger), short=len(short),
                      short_weight=sum(x['cost'] for x in short), errors=sum(x['status'] != 200 for x in short),
                      pending=len(pending), pending_weight=sum(request_cost(g['start'], g['end']) for g in pending)),
        complete=not pending, attribution='Open-Meteo / ERA5 CC BY 4.0; GBIF sources in input CSV',
        limits='Conservative ceiling days/14; 450/minute,4000/hour,8000/rolling day; durable Retry-After')
    atomic_json(OUT/f'gbif-date-test-{stamp}-metadata.json', metadata)
    print(json.dumps({k: metadata[k] for k in ('outputs', 'counts', 'requests', 'stop_reason')}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-locations', type=int, default=2000)
    parser.add_argument('--run-seconds', type=int, default=540)
    parser.add_argument('--stamp', default='2026-11-07')
    args = parser.parse_args()
    preserve_original(args.stamp)
    with SOURCE.open() as f:
        rows = [r for r in csv.DictReader(f) if r['species'] in SPECIES]
    stop = fetch(rows, args.max_locations, args.run_seconds) if args.max_locations else 'export_only'
    export(rows, args.stamp, stop)
