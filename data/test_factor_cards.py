"""Focused checks for non-ranking factor-card missingness and coverage."""
import csv, pathlib, subprocess, sys
from build_factor_cards import crime_time_window, evidence_as_of
ROOT=pathlib.Path(__file__).resolve().parent.parent
subprocess.run([sys.executable,str(ROOT/'data/build_factor_cards.py')],check=True,cwd=ROOT)
with (ROOT/'data/normalized/costar/factor-cards.csv').open(newline='',encoding='utf-8') as f: rows=list(csv.DictReader(f))
assert len(rows)==18*15
assert evidence_as_of({'evidence_as_of':'2026-05-01','source_as_of_date':'2026-06-01'})=='2026-05-01'
assert evidence_as_of({'source_as_of_date':'2026-06-01'})==''
assert crime_time_window({'crime_source_date_start':'2026-01-01','crime_source_date_end':'2026-06-30'})=='2026-01-01 to 2026-06-30'
assert crime_time_window({'crime_source_date_start':'2026-01-01'})==''
assert all(r['site_id'] and r['factor_id'] and r['status'] in {'observed','derived','estimated','unknown'} for r in rows)
assert all(not r['value'] for r in rows if r['status']=='unknown')
assert len({(r['site_id'],r['factor_id']) for r in rows})==len(rows)
crime=[r for r in rows if r['factor_id']=='crime_safety']
assert any(r['city']=='Los Angeles' and r['status']=='unknown' and not r['value'] for r in crime)
assert any(r['factor_id']=='spatial_interior' and 'suite identity unresolved' in r['geography'].lower() and 'does not verify marketed suite identity' in r['uncertainty'].lower() for r in rows)
print(f'PASS: {len(rows)} unique site-factor cards; unknowns are null and LA crime is not zero.')
