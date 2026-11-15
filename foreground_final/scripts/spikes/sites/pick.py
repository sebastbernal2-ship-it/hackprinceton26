"""Pick the 25 candidates and the top 12 from all_eligible.json.
Usage: python -I pick.py   (run in the folder that holds all_eligible.json; writes candidates.json, top12.json)
The pick list is a human decision made after reviewing score.py / detail.py output; everything else is derived."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from score import score, fit_spaces

# pid: (top12 rank or None, primary suite (exact `suite` string or None for an unnamed space), primary Matterport model,
#       how the scan relates to the space, rationale, caveat)
PICKS = {
    # ---------------- Houston ----------------
    1018657: (1, '104', '4H2JSnQ3wSj', 'exact-suite',
              'Hero site. Suite 104 is a 2nd-generation restaurant on a Midtown hard corner with its own Matterport scan; the same suite lost two food tenants in five years (Gage Lounge 1.0 yr, Mezcal Houston 1.7 yr, closed/bankrupt).',
              'Highest Houston rent in the set ($45 NNN). Suite 100 (9,889 SF, second scan) is too big for an independent. No sale price (Texas non-disclosure).'),
    5697296: (2, 'D', 'zKgykpJUQ69', 'same-center-other-suite',
              'Fully built 2nd-gen restaurant (hood, grease trap, bar, dining room) at $20.22 NNN with 3 months free rent offered. Suite D held Gayatri Bhavan for 13 years while three other restaurants in the plaza lasted 0.6-4.8 yrs: a survivor-vs-graveyard story.',
              'The Matterport scan is Suite B1 in the same plaza, not Suite D.'),
    680379: (3, '110', 'x1r8ZfTQEyb', 'same-center-shell',
             '1,750 SF 2nd-gen pizzeria at $24 NNN in a grocery-anchored center being redeveloped; long chain history to contrast (Pizza Hut 18.9 yr, Starbucks 15 yr, Quiznos 9.6 yr, Subway closed).',
             'Scan is captioned "Shell Space" (suite not named). Center is losing its Randalls anchor box (being demised), which is itself a risk talking point.'),
    862130: (4, '107', 'vmyKDCoq9Za', 'same-center-other-suite',
             'Deepest graveyard in Houston: 8 past food tenants, 4 of them recorded as closed/bankrupt (House of Gumbo, Division 1 Sports Bar, International Catering, "Restaurant"). Cheap ($18 NNN), restaurant-sized suites.',
             'Scan is Suite 124 (1,550 SF), not an available suite. Available suites are not described as restaurant-ready (expect full build-out cost).'),
    838391: (5, '11-12', 'ZNwAFka5Dab', 'exact-suite',
             'Exact-suite scan of a 3,700 SF space at $18 NNN, four suites from 1,100 to 3,700 SF to compare. First-generation (non-restaurant) space, so it shows the full hidden build-out cost.',
             'Thin food history: one real past food tenant (O Donut 1.0 yr) plus Rico Sabor Cubano (0.2 yr, closed); one more record is a 1-day data artifact.'),
    800827: (6, 'MM', 'LxesjX9RDHT', 'exact-suite',
             'Property subtype is Restaurant; cheapest rent in the set ($13.66 NNN for Suite MM, 1,569 SF, with its own scan); 5 suites of 985-1,569 SF; mixed food record (2 gone, 2 operating 5-11 yrs).',
             'Suite MM is currently a barber shop (available while occupied); small suites, none described as having a kitchen.'),
    13913828: (None, None, 'vte2JuhRvq8', 'exact-suite',
               'Alternate: 2024 building in the Heights, 4,593 SF 3rd-floor space pitched as a rooftop restaurant with its own scan. Clean-slate contrast to the graveyard sites.',
               'No food graveyard (one current coffee tenant). $49 NNN.'),
    7875651: (None, 'A', 'skKNvMqD4w1', 'exact-suite',
              'Alternate: freestanding 3,600 SF former bank then bar/lounge with exact scan, $25 NNN.',
              'No food tenants in the occupancy data (the bar is only mentioned in the listing note).'),
    11165863: (None, '130', 'bVb6qQH36YE', 'exact-suite',
               '2019 strip center, Suite 130 (2,000 SF, $20 NNN) with exact scan; has a confirmed sale price ($3.75M, 2024).',
               'Only one food tenant (current).'),
    814216: (None, 'Q', 'nYvgTdxFHsT', 'same-center-other-suite', 'West Oaks Plaza: 2,000 SF at $20 NNN, sister center to West Oaks Shops.', 'Scan is Suite N; thin food history.'),
    9670795: (None, None, '3TV9kHFRrhr', 'unlabelled', '2012 strip center, 1,200 SF 2nd-gen retail/office at $28 NNN, three food tenants (one gone after 0.8 yr).', 'Scan has no caption.'),
    234088: (None, '100', 'AEaxTxjZrPo', 'building-interior', 'Office tower ground floor: 4,761 SF 2nd-gen bank space with drive-thru at $20 NNN; four past delis.', 'Scans are office suites/interior.'),
    233953: (None, '150', 'Wtxv2Mp8uQE', 'building-lobby', 'Downtown Esperson building: 1,408 SF street-level space at $18 NNN; 14 food tenants over 30 years (tunnel food court).', 'Scans are lobby/tunnel/office suite; many food tenants are in the tunnel level.'),
    # ---------------- Los Angeles ----------------
    20219730: (7, '116BC', 'C7dRdWv7Pmf', 'exact-suite',
               'Best LA site. Suite 116BC is a 2nd-gen restaurant (Type 1 hood, grease interceptor, walk-in) at $30 NNN with its own scan; Suite 110B (restaurant sublease, $75k key money) also has a scan. Past food: Wolfgang Puck Express closed after 1.8 yr, Mitaki 9.6 yr.',
               'Property is typed Multifamily (retail podium). Suite-level tenant names are mostly Unknown in the occupancy data.'),
    6819921: (8, '101 - 701 W 7th St', 'MHAy54smDJN', 'exact-suite',
              'Two-level 4,265 SF restaurant shell with patio at 7th & Hope, $36 NNN, scanned (Suite 101). QDOBA held the building for 16 years then left in 2025.',
              'Top of the size range; delivered as shell (plumbing/electrical/HVAC only). Last sale $960k (FullValue, 2026) looks like a partial interest, do not show as building value.'),
    6038733: (9, '112', None, 'no-retail-scan',
              'Former Starbucks (1,879 SF, $48 NNN, grease interceptor mentioned) at Wilshire & Vermont; strong graveyard: Fatburger 10.7 yr, Pizza Rev 3.9, Jimmy John\'s 3.4, Starbucks 5.0, Kickin\' Crab 1.1 (closed).',
              'All 7 Matterport scans are apartments/amenities, none of the retail space.'),
    4205077: (10, None, 'WevFANR2s1h', 'center-tour',
              'Only LA retail-typed building with rent, fit size and a plaza scan: 1,500 SF at $30.60 NNN in a Koreatown-adjacent strip; El Sonsonateco operating 16 yrs, Deli World closed after 4.9 yrs.',
              'Available space has no suite number or notes; food matches are by name only.'),
    431465: (11, '106', 'thJzkkH8aqk', 'building-office-suite',
             'Hollywood Blvd tourist corridor: 3,185 SF two-level retail at $51 NNN. Graveyard includes Hooters (15.4 yr, the other available suite 109), Baja Fresh (10.2 yr, closed), Wetzel\'s, Polka Dot Cupcakes.',
             'Scans are office floors, not the retail. Highest rent in the top 12.'),
    256760: (12, '100', 'R3Nj53ps6f9', 'adjacent-suite',
             'Only full-service-gross rent in the top 12 ($21 FSG, 1,071 SF lobby retail near LAX): shows the NNN-vs-gross comparison. Trimana cafe left next-door Suite 101 after 7.3 yrs; Suite 102 scan is on the same lobby level.',
             'Lobby/kiosk retail in an office tower, limited venting; scan is Suite 102 not Suite 100.'),
    5927602: (None, '186', None, 'no-retail-scan', 'Alternate: transit-station retail, four spaces 1,171-4,059 SF at $51-54 NNN, 14 food tenants (7 gone).', 'Scans are apartments/amenities. Suite 186 is still occupied (Roll Call).'),
    6593556: (None, '216', 'gTz5qRzBVKH', 'building-lobby', 'Alternate: historic DTLA, former restaurant/speakeasy with full kitchen and bar (3,840 SF, $24 MG) and a 1,841 SF space with hood ($36 MG).', 'Scans are a studio apartment and the lobby; only two (current) food tenants recorded.'),
    18233733: (None, None, None, 'no-retail-scan', '3,965 SF 2nd-gen restaurant shell in Koreatown (vent shaft, grease interceptor), $47.40 NNN; subtype Restaurant.', 'Both scans are captioned "Studio - 250SF"; no tenants on record.'),
    9316906: (None, 'Retail', None, 'no-retail-scan', '1,800 SF 2nd-gen restaurant (former Tokyo Fried Chicken) at $48 NNN; Starbucks closed here in 2026 after 8.2 yrs.', 'Scans are apartments/amenities.'),
    27212: (None, '1636 on La Brea', 'ZZW4Y9d65PX', 'building-office-suite', '1,894 SF La Brea retail at $39 MG with TI allowance; Tiago Espresso operating since 1998.', 'Scans are office suites.'),
    249810: (None, '225', 'FrsMPZwTsng', 'building-office-suite', 'Fashion District, 1,254 SF first-floor retail at $28.20 MG; Kelly\'s Coffee & Fudge closed 2026 after 5.8 yrs.', 'Scan is 3rd-floor Suite 307.'),
}

ARTIFACT_YEARS = 0.05  # stints of <= ~18 days that are closed are data artifacts, not tenancies


def rent_label(s):
    if not s['rentPerSfYrLow']:
        return None
    lo, hi = s['rentPerSfYrLow'], s['rentPerSfYrHigh']
    amt = '$%.2f' % lo if lo == hi else '$%.2f-%.2f' % (lo, hi)
    return '%s/SF/yr %s (quoted %s)' % (amt, s['serviceTypeShort'], s['rentAsQuoted']['rateBasis'].lower())


o = {x['propertyId']: x for x in json.load(open('all_eligible.json', encoding='utf-8'))}
cands = []
for pid, (rank, suite, model, scan_rel, why, caveat) in PICKS.items():
    x = o[pid]
    real = [f for f in x['foodHistory'] if f['isCurrent'] or (f['durationYears'] or 0) > ARTIFACT_YEARS]
    x['foodHistoryArtifacts'] = [f for f in x['foodHistory'] if f not in real]
    x['foodHistory'] = real
    for f in real:
        f['confidence'] = 'high' if any(b in ('name-regex', 'bio-regex') for b in f['matchBasis']) else 'medium'
    x['foodHistoryCount'] = len(real)
    x['foodPastCount'] = sum(1 for f in real if not f['isCurrent'])
    x['foodCurrentCount'] = sum(1 for f in real if f['isCurrent'])
    x['foodClosedOrBankruptCount'] = sum(1 for f in real if f['expirationReason'] == 'ClosedLocationOrBankrupt')
    fs = fit_spaces(x)
    prim = next((s for s in x['spaces'] if s['suite'] == suite and s['rentPerSfYrLow']), None) or (fs[0] if fs else x['spaces'][0])
    assert prim['rentPerSfYrLow'], pid
    assert model is None or model in x['matterportModelIds'], (pid, model)
    sc, reasons = score(x)
    x['selection'] = {
        'top12Rank': rank, 'score': sc, 'scoreReasons': reasons, 'rationale': why, 'caveat': caveat,
        'primarySpace': {k: prim[k] for k in ('spaceId', 'listingId', 'suite', 'floor', 'spaceUse', 'spaceType', 'sfMin', 'sfMax',
                                              'rentPerSfYrLow', 'rentPerSfYrHigh', 'serviceType', 'serviceTypeShort', 'isLeasePending')},
        'primarySpaceRentLabel': rent_label(prim),
        'primarySpaceAnnualRent': round(prim['rentPerSfYrLow'] * prim['sfMax']),
        'primarySpaceMonthlyRent': round(prim['rentPerSfYrLow'] * prim['sfMax'] / 12),
        'primaryMatterportModelId': model, 'matterportScanRelation': scan_rel,
        'fitSpaceCount': len(fs)}
    cands.append(x)

cands.sort(key=lambda x: (x['selection']['top12Rank'] is None, x['selection']['top12Rank'] or 0, x['market'], -x['selection']['score']))
json.dump(cands, open('candidates.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
top = [x for x in cands if x['selection']['top12Rank']]
json.dump(top, open('top12.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(cands), 'candidates;', len(top), 'top;', sum(1 for x in cands if x['market'] == 'Houston'), 'Houston')
print('| # | propertyId | City | Address | Space (SF) | Asking rent $/SF/yr | Food history (past/current) | Scan |')
print('|---|---|---|---|---|---|---|---|')
for x in cands:
    s = x['selection']
    p = s['primarySpace']
    print('| %s | %d | %s | %s%s | Ste %s: %d (%d fit spaces, %d-%d) | %s | %d (%d/%d, %d closed) | %s %s | bldg %d SF, %s, %s, tenants %d, lastSale %s %s' % (
        s['top12Rank'] or '-', x['propertyId'], x['market'], x['address'], ' (%s)' % x['buildingName'] if x['buildingName'] else '',
        p['suite'] or 'n/a', p['sfMax'], s['fitSpaceCount'], x['availableSFSmallest'], x['availableSFLargest'],
        s['primarySpaceRentLabel'], x['foodHistoryCount'], x['foodPastCount'], x['foodCurrentCount'], x['foodClosedOrBankruptCount'],
        s['primaryMatterportModelId'], s['matterportScanRelation'], int(x['buildingSF'] or 0), x['yearBuilt'], x['propertyType'],
        x['currentTenantCount'], (x['lastSale'] or {}).get('soldDate'), (x['lastSale'] or {}).get('soldForPrice')))
