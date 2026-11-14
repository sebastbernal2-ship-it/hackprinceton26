#!/usr/bin/env python3
"""Create a parametric, non-code equipment block plan for concept discussion.

Coordinates are room-local, feet, axis-aligned placeholders. No Matterport room
orientation, door/window locations, wall geometry, or verified equipment specs are
available, so no placements are presented as fitted or buildable.
"""
import json,pathlib,datetime,os
ROOT=pathlib.Path(__file__).resolve().parent.parent
PILOT_ID=os.environ.get('PILOT_PROPERTY_ID','').strip()
IN=ROOT/'data/normalized/costar'/f'pilot-{PILOT_ID}-italian-gelato-zoning.json'
OUT=ROOT/'data/normalized/costar'/f'pilot-{PILOT_ID}-equipment-block-plan.json'
def main():
 if not PILOT_ID: raise SystemExit('Set PILOT_PROPERTY_ID to select the local pilot; do not commit the value.')
 src=json.loads(IN.read_text()); rooms=src['rooms']; salon=next((r for r in rooms if r['source_room_label'].casefold()=='salon'),None); prep=next((r for r in rooms if r['source_room_label'].casefold()=='shampoo station'),None)
 if not salon or not prep: raise SystemExit('Expected pilot room labels changed; review source before planning')
 plan={'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'concept block plan only; placements are not verified against Matterport geometry','concept':src['concept'],'site_property_id':src['site_property_id'],'units':'feet','source_measurements':'Matterport room dimension estimates, local-only pilot packet','rooms':[],'assumptions':['Room width/depth are treated as rectangular envelopes solely to derive approximate room areas; actual polygons and obstructions are unknown.','No doors, windows, columns, drains, utilities, fire exits, clearances, or circulation paths are mapped.','Equipment footprints are generic planning placeholders, not vendor specifications.','No code, health, accessibility, fire, hood, or structural compliance claim.']}
 def add(room,items,note):
  plan['rooms'].append({'source_room_label':room['source_room_label'],'room_width_ft':room['source_width'],'room_depth_ft':room['source_depth'],'source_area_sqft':room['source_area_floor'],'items':items,'workflow_note':note})
 add(salon,[
 {'id':'gelato-display','label':'Gelato display/service case','width_ft':6,'depth_ft':3,'production_model':'sourced-gelato scenario only; operator decision unknown','placement':'placeholder; front/customer edge TBD'},
 {'id':'pos-queue','label':'POS and queue zone','width_ft':8,'depth_ft':5,'placement':'placeholder; entry/egress not mapped'},
 {'id':'dining-tables','label':'Dining/seating zone','width_ft':18,'depth_ft':16,'placement':'aggregate zone; seat count not asserted'},
 {'id':'customer-circulation','label':'Customer/staff circulation reserve','width_ft':10,'depth_ft':20,'placement':'reserve only; verify clear widths with architect'}
 ],'Front-of-house hypothesis. Need identify entrance, exits, service path, accessible route, queue conflicts, and gelato case heat/power requirements.')
 add(prep,[
 {'id':'cold-prep','label':'Refrigerated prep/worktop','width_ft':6,'depth_ft':3,'placement':'placeholder; verify plumbing/power'},
 {'id':'reach-in','label':'Reach-in refrigerator/freezer','width_ft':3,'depth_ft':3,'placement':'placeholder; verify heat rejection and circuit'},
 {'id':'dish','label':'Dishwashing/handwash support zone','width_ft':5,'depth_ft':4,'placement':'placeholder; existing drains/plumbing unknown'},
 {'id':'production-line','label':'Compact cookline placeholder','width_ft':8,'depth_ft':3,'placement':'DO NOT assume feasible: hood/exhaust/fire suppression/gas/electrical unknown'}
 ],'Room label suggests former shampoo station; food-grade surfaces, plumbing, ventilation and sanitation conversion are unknown. Compact area may not accommodate a compliant cookline.')
 plan['gelato_on_site_production']={'included':False,'reason':'production method is unknown; on-site production is shown as an alternative scenario, not excluded by operator decision','if_selected_requires':['batch freezer','pasteurizer or approved mix sourcing process','dedicated cold storage','sanitation and production workflow','additional utility/heat-load verification']}
 OUT.write_text(json.dumps(plan,indent=2));OUT.chmod(0o600);print('Wrote concept block plan for',len(plan['rooms']),'rooms with',sum(len(r['items']) for r in plan['rooms']),'placeholder blocks; no fit validation asserted.')
if __name__=='__main__':main()
