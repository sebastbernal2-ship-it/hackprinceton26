import sys,json,math,numpy as np
sys.path.insert(0,'Code'); import texture_bake_v2 as tb
from PIL import Image
pd='pano_zvKHR9DHNjJ'; md=pd+'/mesh_diff'
poses=json.load(open(pd+'/poses_refined.json')); panos={p['id']:p for p in json.load(open(pd+'/panos.json'))}
V,F=tb.load_obj(md+'/empty_room.obj'); E=tb.all_edges(V,F); Vd,_=tb.subdivide(V,F,0.09)
rows=[]
for lab in sys.argv[1:]:
    pid=[k for k,v in poses.items() if v['label']==lab][0]; cam=np.array(panos[pid]['position'])
    eq=tb.equirect([f'{pd}/cache/defurnished/{pid}_{k}.jpg' for k in range(6)],768)
    P=E[tb.visible(E,cam,Vd,None)&(np.linalg.norm(E-cam,axis=1)<9)]
    H,W=384,768; d=P-cam; th=np.arctan2(d[:,1],d[:,0]); lat=np.arctan2(d[:,2],np.hypot(d[:,0],d[:,1]))
    r=((np.pi/2-lat)/np.pi*H).astype(int).clip(0,H-1)
    pair=[]
    for y in (poses[pid]['old_yaw_deg'],poses[pid]['yaw_deg']):
        lon=((th-math.radians(y))*-1+np.pi)%(2*np.pi)-np.pi; c=((lon+np.pi)/(2*np.pi)*W).astype(int).clip(0,W-1)
        im=eq.copy(); im[r,c]=[255,0,0]; pair.append(im)
    rows.append(np.hstack(pair))
Image.fromarray(np.vstack(rows)).save(pd+'/_pose_check.jpg',quality=80)
