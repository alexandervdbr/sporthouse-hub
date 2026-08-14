"""
Zet de geïmporteerde reservaties om naar het nieuwe model.

    python3 scripts/reshape-materiaal-reservaties.py            # dry run
    python3 scripts/reshape-materiaal-reservaties.py --apply

  KAPOT   -> geen reservatie meer, maar equipment.is_broken = true
  FoS     -> reserved_by 'Arne Smets',      project 'FoS'
  De Spor -> reserved_by 'Daan Van Sichem', project 'De Spor'

Vereist migratie 0010 (is_broken + equipment_projects).
"""
import sys, os, json, datetime, urllib.request, urllib.parse
from collections import Counter

APPLY = '--apply' in sys.argv
BACKUP_DIR = '/private/tmp/claude-501/-Users-alexandervandenbranden/5b1b69b1-b664-41d8-b5bb-3fcdf585a3ae/scratchpad'

ASSIGN = {
    'FoS':     'Arne Smets',
    'De Spor': 'Daan Van Sichem',
}
BROKEN_LABEL = 'KAPOT'


def load_env():
    env = {}
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for line in open(os.path.join(root, '.env.local')):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
URL, KEY = ENV['NEXT_PUBLIC_SUPABASE_URL'], ENV['SUPABASE_SERVICE_ROLE_KEY']


def api(path, method='GET', body=None, headers=None):
    req = urllib.request.Request(f'{URL}{path}', method=method)
    req.add_header('apikey', KEY)
    req.add_header('Authorization', f'Bearer {KEY}')
    req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, json.dumps(body).encode() if body is not None else None) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def all_rows(path):
    out, off = [], 0
    while True:
        chunk = api(f'{path}&offset={off}&limit=1000')
        out += chunk
        if len(chunk) < 1000:
            return out
        off += 1000


rows = all_rows('/rest/v1/equipment_reservations?select=id,equipment_id,reserved_by,date,project')
equipment = {e['id']: e for e in api('/rest/v1/equipment?select=id,name')}

broken_rows = [r for r in rows if r['reserved_by'] == BROKEN_LABEL]
broken_items = sorted({r['equipment_id'] for r in broken_rows})
reassign = {label: [r for r in rows if r['reserved_by'] == label] for label in ASSIGN}

print(f"\n{'UITVOEREN' if APPLY else 'DRY RUN'}\n")
print(f'  reservaties totaal            {len(rows)}')
print(f'\n  KAPOT -> defect materiaal:')
print(f'    rijen te verwijderen        {len(broken_rows)}')
for eid in broken_items:
    print(f'      {equipment.get(eid, {}).get("name", eid)}')
for label, rs in reassign.items():
    print(f'\n  {label} -> {ASSIGN[label]} (project "{label}"): {len(rs)} rijen')

if not APPLY:
    print('\nNiets gewijzigd. Voeg --apply toe.\n')
    sys.exit(0)

stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = os.path.join(BACKUP_DIR, f'reshape-backup-{stamp}.json')
with open(backup, 'w') as f:
    json.dump(rows, f, indent=2)
print(f'\nback-up van {len(rows)} rijen -> {backup}')

# 1. Defecte items markeren, hun reservaties weg.
for eid in broken_items:
    api(f'/rest/v1/equipment?id=eq.{eid}', 'PATCH',
        {'is_broken': True, 'broken_note': 'Overgenomen uit de Excel-planning (stond als KAPOT)'},
        {'Prefer': 'return=minimal'})
if broken_rows:
    api(f'/rest/v1/equipment_reservations?reserved_by=eq.{urllib.parse.quote(BROKEN_LABEL)}',
        'DELETE', headers={'Prefer': 'return=minimal'})
print(f'{len(broken_items)} items op defect gezet, {len(broken_rows)} rijen verwijderd')

# 2. Projectreservaties op naam zetten.
for label, person in ASSIGN.items():
    if not reassign[label]:
        continue
    api(f'/rest/v1/equipment_reservations?reserved_by=eq.{urllib.parse.quote(label)}',
        'PATCH', {'reserved_by': person, 'project': label}, {'Prefer': 'return=minimal'})
    print(f'{len(reassign[label])} rijen: {label} -> {person} (project {label})')

print('\nKlaar.\n')
