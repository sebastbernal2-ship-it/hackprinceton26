"""Score eligible sites and print a review table. Usage: python -I score.py [N per market] [detail]"""
import json, sys

FIT_MIN, FIT_MAX = 800, 6000      # restaurant-sized space (target 1,000-5,000 with tolerance)
RENT_MIN, RENT_MAX = 5, 150       # sanity band for $/SF/yr
QUOTED_SVC = ('NNN', 'MG', 'FSG', 'NN', 'N', '+E', '+U')


def fit_spaces(x):
    return [s for s in x['spaces'] if s['rentPerSfYrLow'] and s['sfMax'] and FIT_MIN <= s['sfMax'] <= FIT_MAX
            and RENT_MIN <= s['rentPerSfYrLow'] <= RENT_MAX and not s['isLeasePending']]


def score(x):
    sc = 0
    why = []
    fs = fit_spaces(x)
    if fs:
        sc += 5; why.append('fit-space+rent')
    elif x['spacesWithRent']:
        sc += 2; why.append('rent(no fit-size space)')
    elif x['spaces']:
        sc += 1; why.append('space(no rent)')
    if x['foodPastCount']:
        sc += 2 + min(x['foodPastCount'], 3); why.append('food-past=%d' % x['foodPastCount'])
    if x['foodCurrentCount']:
        sc += 1; why.append('food-current=%d' % x['foodCurrentCount'])
    if x['matterportModelIdsMatchingAvailableSuite']:
        sc += 4; why.append('mp-of-available-suite')
    elif x['matterportRetailCaptionModelIds']:
        sc += 1; why.append('mp-suite/retail-caption')
    if len(x['matterportModelIds']) >= 2:
        sc += 1
    if any(s['restaurantKeywordsInSpaceNotes'] for s in x['spaces']):
        sc += 2; why.append('restaurant-keywords')
    if x['propertyType'] == 'GeneralRetail':
        sc += 2; why.append('retail-building')
    if x['propertyType'] == 'Multifamily' and not x['matterportModelIdsMatchingAvailableSuite']:
        sc -= 2; why.append('MF: scans are apartments/amenities')
    if any(s['serviceTypeShort'] in QUOTED_SVC for s in fs):
        sc += 1
    return sc, why


if __name__ == '__main__':
    o = json.load(open('all_eligible.json', encoding='utf-8'))
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    detail = len(sys.argv) > 2
    for mk in ('Houston', 'Los Angeles'):
        rows = sorted([x for x in o if x['market'] == mk], key=lambda x: -score(x)[0])[:N]
        print('=====', mk)
        for x in rows:
            sc, why = score(x)
            fs = fit_spaces(x)
            print('%d [%d] %s %s|%s bSF %s yr %s|fit %s $%s-%s %s|mp %d suiteMP %d|ten %d food %d/%d|kw %s|suiteFood %d' % (
                x['propertyId'], sc, x['propertyType'][:5], (x['buildingName'] or '')[:18], x['address'][:26],
                int(x['buildingSF'] or 0), x['yearBuilt'], [int(s['sfMax']) for s in fs][:5],
                x['askingRentPerSfYrLow'], x['askingRentPerSfYrHigh'], ','.join(x['askingRentServiceTypes'])[:10],
                len(x['matterportModelIds']), len(x['matterportModelIdsMatchingAvailableSuite']),
                x['currentTenantCount'], x['foodPastCount'], x['foodCurrentCount'],
                sorted(set(k for s in x['spaces'] for k in s['restaurantKeywordsInSpaceNotes']))[:5],
                sum(1 for s in x['spaces'] for h in s['suiteTenantHistory'] if h['isFood'])))
            if detail:
                for s in fs[:5]:
                    print('   fit: ste %s %s %s %dSF $%s %s L%s mp=%s hist=%s | %s' % (
                        s['suite'], s['floor'], s['spaceUse'], s['sfMax'], s['rentPerSfYrLow'], s['serviceTypeShort'], s['listingId'],
                        s['matterportModelIdsForSuite'],
                        [h['name'][:22] + ('(F)' if h['isFood'] else '') + ' ' + (h['moveIn'] or '')[:4] + '-' + (h['moveOut'] or 'now')[:4] for h in s['suiteTenantHistory']][-4:],
                        (s['spaceNotes'] or '')[:90].replace('\n', ' ')))
                print('   mp:', '; '.join('%s%s' % (m['modelId'], m['captions'][:1]) for m in x['matterportModels'][:6]))
                print('   food:', '; '.join('%s%s %s->%s' % (f['name'][:26], '*' if f['matchBasis'] == ['profile.industryType=17'] else '',
                                                              (f['moveIn'] or '?')[:7], (f['moveOut'] or 'now')[:7]) for f in x['foodHistory'][:14]))
