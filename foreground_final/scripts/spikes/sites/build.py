"""Build all food-suitable site records from the CoStar kit.
Usage: python -I build.py <kit_dir> <out_dir>   -> writes <out_dir>/all_eligible.json
Standard library only; the kit is read-only input."""
import json, csv, sys, re, collections
from datetime import date

KIT, OUT = sys.argv[1], sys.argv[2]
E = json.load(open(KIT + '/schemas/enums.json', encoding='utf-8'))


def dec(en, v):
    return E[en].get(str(v), str(v)) if v is not None else None


TODAY = date(2026, 11, 9)  # kit as-of date (index.md: sold window ends 2026-11-09)
MARKET = {14: 'Houston', 20: 'Los Angeles'}
SVC_SHORT = {'TripleNet': 'NNN', 'FullService': 'FSG', 'ModifiedGross': 'MG', 'DoubleNet': 'NN', 'Net': 'N',
             'PlusElectric': '+E', 'PlusUtilities': '+U', 'Negotiable': 'Negotiable (none quoted)',
             'ToBeDetermined': 'TBD (none quoted)', 'Unknown': 'Unknown', 'IndustrialGross': 'IG',
             'PlusCleaning': '+C', 'PlusElectricAndCleaning': '+E+C', 'TenantElectric': 'TE',
             'FullServiceGrossNoPass': 'FSG-NoPass'}
MP_TYPES = (36, 234)  # MatterportScan, MatterportStreamingKey

FOOD_WORDS = r"""restaurant restaurante cafe café coffee espresso grill grille kitchen pizza pizzeria taco tacos
taqueria burger burgers sushi bistro bakery bakehouse deli delicatessen bbq barbecue barbeque cantina ramen pho thai
boba juice smoothie donut donuts doughnut creamery gelato yogurt froyo wings wingstop steakhouse tavern pub brewery
brewing brewpub taproom cocktail eatery diner noodle noodles dumpling poke sandwich sandwiches subs bagel bagels crepe
creperie teahouse cuisine catering trattoria osteria ristorante chophouse oyster seafood crawfish cajun burrito kebab
shawarma falafel hibachi teriyaki chicken smokehouse cupcake cupcakes patisserie chocolatier starbucks subway chipotle
mcdonalds panera jamba dunkin dominos whataburger sweetgreen cava quiznos potbelly philz salata freebirds pappadeaux
pappasitos pappas landrys yoshinoya pinkberry yogurtland nekter sharetea crumbl urth schlotzskys pieology fuddruckers
chilis applebees ihop dennys benihana nobu trimana lemonade tea donburi curry bao gyro gyros tapas grillhouse wok
pastry sweets dessert desserts tortas pupuseria mariscos pollo carnitas birria cocina comida kolache kolaches bodega
market grocery liquor wine beer spirits cellar lounge bar saloon nightclub"""
FOOD_PHRASES = [r"ice cream", r"steak house", r"wine bar", r"sports bar", r"bar & grill", r"bar and grill",
                r"food hall", r"tea house", r"tex-mex", r"fried chicken", r"bar-b-q", r"mcdonald'?s", r"domino'?s",
                r"papa john'?s", r"pizza hut", r"taco bell", r"wendy'?s", r"chick-fil-a", r"shake shack",
                r"jersey mike'?s", r"jimmy john'?s", r"einstein bros", r"peet'?s", r"coffee bean", r"blue bottle",
                r"torchy'?s", r"landry'?s", r"el pollo loco", r"in-n-out", r"panda express", r"baskin.robbins",
                r"cold stone", r"tropical smoothie", r"smoothie king", r"kung fu tea", r"tiff'?s treats",
                r"insomnia cookies", r"mendocino farms", r"tender greens", r"veggie grill", r"le pain quotidien",
                r"corner bakery", r"la madeleine", r"mod pizza", r"blaze pizza", r"buffalo wild wings",
                r"waffle house", r"olive garden", r"cheesecake factory", r"p\.?f\.? chang'?s", r"fogo de chao",
                r"ruth'?s chris", r"morton'?s", r"capital grille", r"mastro'?s", r"five guys", r"dairy queen",
                r"carl'?s jr", r"jack in the box", r"del taco", r"raising cane'?s", r"popeyes", r"kfc"]
# strong = unambiguous food-service words; weak words (market, bar, tea, lounge, cellar, wine, liquor, ...) are
# reported with basis 'name-regex-weak' so a prep script can drop them.
WEAK = set("market grocery liquor wine beer spirits cellar lounge bar saloon nightclub tea lemonade subs wings chicken sweets kitchen catering juice bodega curry thai".split())
words = FOOD_WORDS.split()
STRONG_RE = re.compile(r"\b(" + "|".join([w for w in words if w not in WEAK] + FOOD_PHRASES) + r")\b", re.I)
WEAK_RE = re.compile(r"\b(" + "|".join(sorted(WEAK)) + r")\b", re.I)
HOTEL_RE = re.compile(r"\b(hotel|motel|inn|suites|resort|lodging|hostel|marriott|hilton|hyatt|best western|sheraton|westin|residence inn|courtyard by)\b", re.I)
NOT_FOOD_RE = re.compile(r"\b(kitchens? (design|cabinet\w*|bath)|kitchens? & bath|bar association|law|attorneys?|dental|llp|"
                         r"capital partners|insurance|realty|publish\w*|public\w*|management|consult\w*|software|staffing|"
                         r"studios?|productions?|records|media|architects?|marketing|market research|capital markets|"
                         r"markets group|financial|bank|mortgage|salon|barber\w*|spa|fitness|yoga|pilates|cleaners|"
                         r"pharmacy|medical|clinic|church|school|academy|foundation|association|engineering|energy|"
                         r"technolog\w*|design|interiors|gallery|boutique|apparel|jewel\w*|nails?|investments?|housing|"
                         r"entertainment|development|hospitality|computer|business|fitness|group|holdings|massage|"
                         r"beauty|tax|exam|course|tube|grooming|wax\w*)\b", re.I)
BIO_RE = re.compile(r"\b(restaurant|menu|cuisine|dining|food|coffee|bakery|bar|eatery|catering|sandwich\w*|pizza)\b", re.I)
READY_RE = re.compile(r"(restaurant|kitchen|hood|grease|vented|venting|caf[eé]|coffee|food|\bbar\b|patio|second.gen|2nd.gen|dining|drive.thru)", re.I)
MP_RETAIL_CAP_RE = re.compile(r"retail|restaurant|tenant|suite|ste\b|space|cafe|store|shop|commercial|kitchen|\bbar\b|dining|ground|unit [a-z]?\d", re.I)


def d(s):
    return s[:10] if s else None


def years(a, b):
    if not a:
        return None
    b = b or TODAY.isoformat()
    y1, m1, d1 = map(int, a.split('-'))
    y2, m2, d2 = map(int, b[:10].split('-'))
    return round(((date(y2, m2, d2) - date(y1, m1, d1)).days) / 365.25, 1)


def addr(a):
    rng = a.get('streetNumber') or ''
    if a.get('streetNumberEndRange'):
        rng += '-' + a['streetNumberEndRange']
    sn = a.get('streetName') or ''
    if sn.islower():
        sn = sn.title()
    parts = [rng, a.get('streetDirection'), sn, a.get('streetType'), a.get('streetSuffix')]
    return ' '.join(p for p in parts if p)


def norm_name(n):
    return re.sub(r'[^a-z0-9]', '', (n or '').lower())


def norm_suite(x):
    x = re.sub(r'^(suite|ste|unit|#)\s*', '', (x or '').strip(), flags=re.I)
    return re.sub(r'[^A-Z0-9]', '', x.upper()) or None


def gap_days(a, b):
    y1, m1, d1 = map(int, a.split('-'))
    y2, m2, d2 = map(int, b.split('-'))
    return (date(y2, m2, d2) - date(y1, m1, d1)).days


def suite_in_caption(sp, cap):
    """True when a Matterport caption names this available suite (by suite id or by its exact SF)."""
    raw = (sp['suite'] or '').strip()
    if raw and len(raw) <= 10 and re.search(r'(suite|ste|unit|#)\s*' + re.escape(raw) + r'(?![A-Za-z0-9])', cap, re.I):
        return True
    first = raw.split(' ')[0] if raw else ''
    if first != raw and re.search(r'\d', first) and re.search(r'(suite|ste|unit|#)\s*' + re.escape(first) + r'(?![A-Za-z0-9])', cap, re.I):
        return True  # e.g. suite "101 - 701 W 7th St" vs caption "Suite 101"
    tok = norm_suite(raw)
    if tok and len(tok) <= 8 and re.search(r'(SUITE|STE|UNIT)' + re.escape(tok) + r'(?![A-Z0-9])', re.sub(r'[^A-Z0-9]', '', cap.upper())):
        return True
    if sp['sfMax'] and sp['sfMax'] >= 500:
        n = int(sp['sfMax'])
        if re.search(r'(?<![\d,])(%d|%s)\s*-?\s*(sf|sq)' % (n, format(n, ',')), cap, re.I):
            return True
    return False


# 1. properties ------------------------------------------------------------
props = {}
for l in open(KIT + '/data/commercial-property.jsonl', encoding='utf-8'):
    r = json.loads(l)
    props[r['id']] = r

# 2. Matterport ids (authoritative list = CSV) + captions from attachments ----
mp = collections.defaultdict(dict)  # pid -> {modelId: {'captions':set,'sources':set}}
for row in csv.DictReader(open(KIT + '/commercial-properties.csv', encoding='utf-8-sig')):
    if row['MatterportModelId']:
        mp[int(row['PropertyId'])][row['MatterportModelId']] = {'captions': set(), 'sources': set()}


def note_mp(pid, a, src):
    if a.get('videoKey') and a.get('videoExternalReferenceType') in MP_TYPES and a['videoKey'] in mp.get(pid, {}):
        m = mp[pid][a['videoKey']]
        m['sources'].add(src)
        if a.get('caption'):
            m['captions'].add(a['caption'].strip())


for pid, p in props.items():
    for a in p.get('attachments') or []:
        note_mp(pid, a, 'property')
    ap = p.get('propertyApartment') or {}
    for m in ap.get('models') or []:
        for a in m.get('attachments') or []:
            note_mp(pid, a, 'apartment-floorplan')
        for u in m.get('units') or []:
            for a in u.get('attachments') or []:
                note_mp(pid, a, 'apartment-unit')

# 3. listings -> food-suitable spaces per property ---------------------------
spaces = collections.defaultdict(list)
sale_listings = collections.defaultdict(list)
for l in open(KIT + '/data/commercial-listing-summary.jsonl', encoding='utf-8'):
    r = json.loads(l)
    for a in r.get('attachments') or []:
        if r.get('propertyId'):
            note_mp(r['propertyId'], a, 'listing %d' % r['id'])
    fs = r.get('forSaleSummary')
    if fs and r['listingStatus'] == 1 and r.get('propertyId'):
        sale_listings[r['propertyId']].append({'listingId': r['id'], 'listingType': dec('ListingType', r['listingType']),
                                               'forSaleSummaryKeys': {k: v for k, v in fs.items() if not isinstance(v, (list, dict)) and v not in (None, 0, '')}})
    fl = r.get('forLeaseSummary')
    if not fl or r['listingStatus'] != 1:
        continue
    lnotes = ' '.join((n.get('value') or '') for n in r.get('notes') or [])
    for s in fl['spaces']:
        pid = s.get('propertyId') or r.get('propertyId')
        if pid not in props or s.get('dateOffMarket'):
            continue
        ptype = props[pid]['propertyType']
        snotes = ' '.join((n.get('value') or '') for n in s.get('notes') or [])
        retailish = s['spaceUse'] in (5, 3) or (ptype == 6 and s['spaceUse'] == 0)
        if not retailish:
            continue
        mult = 12 if s['rateBasis'] == 1 else 1
        lo, hi = s.get('rateLow') or 0, s.get('rateHigh') or 0
        has = lo > 0 and s['rateBasis'] in (1, 2)
        svc = dec('ServiceType', s['serviceType'])
        spaces[pid].append({
            'spaceId': s['id'], 'listingId': r['id'], 'listingType': dec('ListingType', r['listingType']),
            'suite': (s.get('suite') or '').strip() or None, 'floor': dec('FloorName', s['floorName']),
            'spaceUse': dec('SpaceUse', s['spaceUse']), 'spaceType': dec('SpaceType', s['spaceType']),
            'sfMin': s.get('squareFeetMin'), 'sfMax': s.get('squareFeetMax'), 'sfMaxContiguous': s.get('squareFeetMaxContiguous'),
            'rentPerSfYrLow': round(lo * mult, 2) if has else None,
            'rentPerSfYrHigh': round((hi or lo) * mult, 2) if has else None,
            'rentAsQuoted': {'rateLow': lo, 'rateHigh': hi, 'rateBasis': dec('RateBasis', s['rateBasis'])} if has else None,
            'serviceType': svc, 'serviceTypeShort': SVC_SHORT.get(svc, svc),
            'monetaryUnit': dec('MonetaryUnit', s.get('monetaryUnit')),
            'isLeasePending': s.get('isLeasePending'), 'dateOnMarket': d(s.get('dateOnMarket')),
            'availableOnDate': d(s.get('availableOnDate')), 'leaseTermType': dec('LeaseTermType', s.get('leaseTermType')),
            'floorPlanUri': (s.get('floorPlan') or {}).get('attachmentUri'),
            'spaceNotes': snotes[:800] or None,
            'restaurantKeywordsInSpaceNotes': sorted(set(m.lower() for m in READY_RE.findall(snotes))),
            'restaurantKeywordsInListingNotes': sorted(set(m.lower() for m in READY_RE.findall(lnotes)))})

cand = set(p for p in spaces if mp.get(p)) | set(pid for pid, p in props.items() if p['propertyType'] == 6 and mp.get(pid))

# 4. occupancies + companies --------------------------------------------------
occ = collections.defaultdict(list)
need = set()
for l in open(KIT + '/data/location-occupancy.jsonl', encoding='utf-8'):
    r = json.loads(l)
    if r['propertyId'] in cand:
        occ[r['propertyId']].append(r)
        if r.get('tenantLocationId'):
            need.add(r['tenantLocationId'])
comp = {}
for l in open(KIT + '/data/company-detail.jsonl', encoding='utf-8'):
    r = json.loads(l)
    if r['id'] in need:
        comp[r['id']] = r


def classify(o):
    """-> (name, [match basis], company). Empty basis = not food."""
    c = comp.get(o.get('tenantLocationId')) if o.get('tenantLocationId') else None
    if c is None:
        if o.get('industryType') == 17:
            return 'Unknown tenant (Accommodation/Food industry)', ['occupancy.industryType=17'], None
        return None, [], None
    p = c.get('profile') or {}
    names = ' | '.join(x for x in [c.get('name'), p.get('companyName')] + [b.get('locationName') for b in c.get('brandProfiles') or []] if x)
    if p.get('businessType') == 27 or p.get('businessSubtype') == 82 or HOTEL_RE.search(names):
        return c.get('name'), [], c
    basis = []
    notfood = bool(NOT_FOOD_RE.search(names))
    if p.get('industryType') == 17 and not notfood:
        basis.append('profile.industryType=17')
    if STRONG_RE.search(names):
        basis.append('name-regex')
    if basis and BIO_RE.search(p.get('locationBio') or ''):
        basis.append('bio-regex')
    if not basis and WEAK_RE.search(names) and not notfood:
        basis = ['name-regex-weak']
    if basis == ['name-regex'] and notfood:
        basis = ['name-regex-weak']
    return c.get('name'), basis, c


# 5. sale comps ---------------------------------------------------------------
sales = collections.defaultdict(list)
for l in open(KIT + '/data/commercial-sale-comp.jsonl', encoding='utf-8'):
    r = json.loads(l)
    for e in r.get('entities') or []:
        if e.get('propertyId') in cand:
            sales[e['propertyId']].append({
                'compId': r['id'], 'soldDate': d(r.get('soldDate')), 'soldForPrice': r.get('soldForPrice'),
                'salePriceStatus': dec('SalePriceStatus', r.get('salePriceStatus')),
                'entityCount': len(r['entities']), 'isPortfolio': len(r['entities']) > 1,
                'allocatedPrice': e.get('allocatedPrice'),
                'allocatedPriceStatus': dec('SalePriceStatus', e.get('allocatedPriceStatus')),
                'monetaryUnit': dec('MonetaryUnit', r.get('monetaryUnit'))})

# 6. assemble -----------------------------------------------------------------
out = []
for pid in sorted(cand):
    p = props[pid]
    a = p.get('primaryAddress') or {}
    yb = [e.get('year') for e in p.get('constructionEvents') or [] if e.get('eventType') == 2]
    yr = [e.get('year') for e in p.get('constructionEvents') or [] if e.get('eventType') == 4]
    sps = sorted(spaces.get(pid, []), key=lambda s: (s['sfMax'] or 0))
    rated = [s for s in sps if s['rentPerSfYrLow']]
    food = []
    cur = 0
    for o in occ.get(pid, []):
        if not o.get('toDate'):
            cur += 1
        name, basis, c = classify(o)
        if not basis:
            continue
        mi = d(o.get('moveInDate')) or d(o.get('fromDate'))
        mo = d(o.get('toDate'))
        ld = o.get('leaseDeal') or {}
        food.append({
            'occupancyId': o['id'], 'tenantLocationId': o.get('tenantLocationId'), 'name': name,
            'companyName': ((c or {}).get('profile') or {}).get('companyName'),
            'moveIn': mi, 'moveInSource': 'moveInDate' if o.get('moveInDate') else 'fromDate',
            'moveOut': mo, 'isCurrent': mo is None, 'durationYears': years(mi, mo),
            'expirationReason': dec('LocationOccupancyExpirationReason', o.get('expirationReason')) if mo else None,
            'suites': sorted(set((s.get('suite') or '').strip() for s in o.get('spaces') or [] if (s.get('suite') or '').strip())),
            'sfOccupied': sum((s.get('squareFeetOccupied') or 0) for s in o.get('spaces') or []) or None,
            'leaseType': dec('LeaseType', o.get('leaseType')), 'matchBasis': basis,
            'leaseSignDate': d(ld.get('signDate')), 'leaseExpirationDate': d(ld.get('expirationDate'))})
    food.sort(key=lambda f: f['moveIn'] or '')
    # merge consecutive/overlapping records of one tenant name into stints (renewals/suite changes create new records)
    stints = []
    for f in food:
        if f['matchBasis'] == ['name-regex-weak']:
            continue
        key = norm_name(f['name'])
        prev = None
        if not key.startswith('unknowntenant'):
            prev = next((t for t in reversed(stints) if t['_k'] == key), None)
        if prev and (prev['moveOut'] is None or gap_days(prev['moveOut'], f['moveIn']) <= 120):
            if prev['moveOut'] is not None and (f['moveOut'] is None or f['moveOut'] > prev['moveOut']):
                prev['moveOut'] = f['moveOut']
                prev['expirationReason'] = f['expirationReason']
            prev['occupancyIds'].append(f['occupancyId'])
            prev['suites'] = sorted(set(prev['suites']) | set(f['suites']))
            prev['sfOccupied'] = max(prev['sfOccupied'] or 0, f['sfOccupied'] or 0) or None
        else:
            stints.append({'_k': key, 'name': f['name'], 'moveIn': f['moveIn'], 'moveOut': f['moveOut'],
                           'suites': f['suites'], 'sfOccupied': f['sfOccupied'], 'expirationReason': f['expirationReason'],
                           'matchBasis': f['matchBasis'], 'occupancyIds': [f['occupancyId']]})
    for t in stints:
        del t['_k']
        t['isCurrent'] = t['moveOut'] is None
        t['durationYears'] = years(t['moveIn'], t['moveOut'])
    # prior tenants (any industry) of each available suite: the exact-space graveyard
    for s_ in sps:
        tok = norm_suite(s_['suite'])
        hist = []
        if tok:
            for o in occ.get(pid, []):
                if any(norm_suite(x.get('suite')) == tok for x in o.get('spaces') or []):
                    c = comp.get(o.get('tenantLocationId')) or {}
                    mi = d(o.get('moveInDate')) or d(o.get('fromDate'))
                    b = classify(o)[1]
                    hist.append({'occupancyId': o['id'], 'name': c.get('name') or 'Unknown tenant',
                                 'industry': dec('IndustryType', (c.get('profile') or {}).get('industryType') if c else o.get('industryType')),
                                 'moveIn': mi, 'moveOut': d(o.get('toDate')), 'durationYears': years(mi, d(o.get('toDate'))),
                                 'isFood': bool(b) and b != ['name-regex-weak']})
        s_['suiteTenantHistory'] = sorted(hist, key=lambda h: h['moveIn'] or '')
        s_['matterportModelIdsForSuite'] = [k for k, v in mp[pid].items() if any(suite_in_caption(s_, c) for c in v['captions'])]
    strong = [f for f in food if f['matchBasis'] != ['name-regex-weak']]
    sl = sorted(sales.get(pid, []), key=lambda s: s['soldDate'] or '')
    models = [{'modelId': k, 'captions': sorted(v['captions']), 'sources': sorted(v['sources'])} for k, v in mp[pid].items()]
    retail_caps = [m for m in models if any(MP_RETAIL_CAP_RE.search(c) for c in m['captions'])]
    sfs = [s['sfMax'] for s in sps if s['sfMax']]
    out.append({
        'propertyId': pid, 'buildingName': p.get('buildingName'), 'address': addr(a), 'city': a.get('city'),
        'state': a.get('state'), 'postcode': (a.get('postcode') or '')[:5],
        'market': MARKET.get(a.get('researchMarketId')), 'lat': a.get('latitude'), 'lng': a.get('longitude'),
        'propertyType': dec('PropertyType', p['propertyType']), 'propertySubtype': dec('PropertySubtype', p.get('propertySubtype')),
        'buildingSF': p.get('rentableBuildingAreaSquareFeet') or p.get('grossBuildingAreaSquareFeet'),
        'buildingSFBasis': 'RBA' if p.get('rentableBuildingAreaSquareFeet') else 'GBA',
        'stories': p.get('numStoriesAboveGrade'), 'yearBuilt': yb[0] if yb else None, 'yearRenovated': yr[-1] if yr else None,
        'parkingRatio': p.get('parkingRatio'), 'zoning': p.get('zoningDescription'), 'primarySubmarketId': p.get('primarySubmarketId'),
        'primaryPhotoUri': (p.get('primaryPhoto') or {}).get('attachmentUri'),
        'availableSpaceCount': len(sps), 'availableSFSmallest': min(sfs) if sfs else None, 'availableSFLargest': max(sfs) if sfs else None,
        'minDivisibleSF': min([s['sfMin'] for s in sps if s['sfMin']], default=None),
        'askingRentPerSfYrLow': min([s['rentPerSfYrLow'] for s in rated], default=None),
        'askingRentPerSfYrHigh': max([s['rentPerSfYrHigh'] for s in rated], default=None),
        'askingRentServiceTypes': sorted(set(s['serviceTypeShort'] for s in rated)), 'spacesWithRent': len(rated),
        'listingIds': sorted(set(s['listingId'] for s in sps)), 'spaces': sps,
        'matterportModelIds': [m['modelId'] for m in models], 'matterportModels': models,
        'matterportRetailCaptionModelIds': [m['modelId'] for m in retail_caps],
        'currentTenantCount': cur, 'totalOccupancyRecords': len(occ.get(pid, [])),
        'matterportModelIdsMatchingAvailableSuite': sorted(set(m for s_ in sps for m in s_['matterportModelIdsForSuite'])),
        'foodHistory': stints, 'foodHistoryRecords': food, 'foodHistoryCount': len(stints),
        'foodPastCount': sum(1 for f in stints if not f['isCurrent']),
        'foodCurrentCount': sum(1 for f in stints if f['isCurrent']), 'foodWeakMatchCount': len(food) - len(strong),
        'saleCompCount': len(sl), 'lastSale': sl[-1] if sl else None, 'activeSaleListings': sale_listings.get(pid, [])})
json.dump(out, open(OUT + '/all_eligible.json', 'w', encoding='utf-8'), indent=1)
print(len(out), 'eligible; with spaces', sum(1 for o in out if o['spaces']), 'with rent', sum(1 for o in out if o['spacesWithRent']))
