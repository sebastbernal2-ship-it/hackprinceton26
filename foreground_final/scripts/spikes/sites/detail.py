import json, sys
o = {x['propertyId']: x for x in json.load(open('all_eligible.json', encoding='utf-8'))}
for pid in map(int, sys.argv[1:]):
    x = o[pid]
    print('\n##', pid, x['buildingName'], '|', x['address'], x['city'], x['postcode'], '|', x['propertyType'], x['propertySubtype'], int(x['buildingSF'] or 0), x['yearBuilt'], '| lastSale', x['lastSale'] and (x['lastSale']['soldDate'], x['lastSale']['soldForPrice'], x['lastSale']['salePriceStatus'], x['lastSale']['isPortfolio']))
    for s in x['spaces']:
        print('  sp ste=%s %s %s %s SF=%s(min %s) $%s %s L%s pend=%s mp=%s kw=%s' % (s['suite'], s['floor'], s['spaceUse'], s['spaceType'], s['sfMax'], s['sfMin'], s['rentPerSfYrLow'], s['serviceTypeShort'], s['listingId'], s['isLeasePending'], s['matterportModelIdsForSuite'], s['restaurantKeywordsInSpaceNotes']))
        if s['spaceNotes']:
            print('     note:', s['spaceNotes'][:260].replace('\n', ' '))
        for h in s['suiteTenantHistory']:
            print('     hist:', h['name'], h['industry'], h['moveIn'], h['moveOut'], 'FOOD' if h['isFood'] else '')
    for m in x['matterportModels']:
        print('  mp', m['modelId'], m['captions'], m['sources'])
    for f in x['foodHistory']:
        print('  food', f['name'], '|', f['moveIn'], '->', f['moveOut'], f['durationYears'], f['suites'], f['matchBasis'], f['expirationReason'])
