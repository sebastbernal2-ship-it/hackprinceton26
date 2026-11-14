#!/usr/bin/env python3
"""Translate measured Matterport rooms into a clearly hypothetical concept zoning draft."""
import datetime as dt
import json
import os
import pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
PILOT_ID=os.environ.get('PILOT_PROPERTY_ID','').strip()
PACKET=ROOT/'data/normalized/costar'/f'pilot-{PILOT_ID}-validation.json'
DIMENSIONS=ROOT/'data/normalized/matterport/pilot-dimensions.json'
OUT=ROOT/'data/normalized/costar'/f'pilot-{PILOT_ID}-italian-gelato-zoning.json'

def main():
    if not PILOT_ID:
        raise SystemExit('Set PILOT_PROPERTY_ID to select the local pilot; do not commit the value.')
    packet=json.loads(PACKET.read_text()); model=json.loads(DIMENSIONS.read_text())
    rooms=[]
    for floor in model.get('floors') or []:
        for room in floor.get('rooms') or []:
            dims=room.get('dimensions') or {}
            label=room.get('label') or 'Unlabeled room'
            if label.casefold()=='salon':
                proposed='front-of-house dining / customer circulation / gelato service counter'
            elif label.casefold()=='shampoo station':
                proposed='back-of-house support / prep candidate; food-grade plumbing and hygiene feasibility unverified'
            else:
                proposed='unassigned; operator review required'
            rooms.append({'source_room_label':label,'floor_label':floor.get('label'),'source_area_floor':dims.get('areaFloor'),'source_width':dims.get('width'),'source_depth':dims.get('depth'),'units':dims.get('units'),'proposed_use_hypothesis':proposed,'status':'hypothesis_only'})
    output={'status':'concept zoning hypothesis; not an architectural/code plan','concept':'Italian restaurant with gelato','site_property_id':packet['property_id'],'matterport_model_id':packet['matterport_model'].get('id'),'human_match_confirmation':packet.get('human_match_confirmation'),'source':'Matterport Model API room/floor dimensions; see local validation packet','model_area_floor':model.get('dimensions',{}).get('areaFloor'),'model_estimated_indoor_area':model.get('dimensionEstimates',{}).get('areaIndoor'),'units':model.get('dimensions',{}).get('units'),'rooms':rooms,'unresolved':['menu and cooking process (pizza/oven, pasta, fryer/grill) not specified','gelato sourced vs made on-site not specified','seating and service model not specified','equipment dimensions and circulation clearances not provided','hood/exhaust, fire suppression, grease, power, plumbing, refrigeration and code suitability unverified','operator or architect must review actual scan and dimensions']}
    OUT.write_text(json.dumps(output,indent=2));OUT.chmod(0o600)
    print('Wrote local concept zoning hypothesis for',len(rooms),'Matterport rooms; no equipment-fit or code claims made.')
if __name__=='__main__':main()
