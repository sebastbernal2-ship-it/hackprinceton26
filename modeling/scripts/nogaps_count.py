import sys,glob,numpy as np
from PIL import Image
from scipy import ndimage as ndi
d=sys.argv[1]; thr=int(sys.argv[2]) if len(sys.argv)>2 else 12
tot=0; blobs=0; per=[]
for f in sorted(glob.glob(d+'/s*_h*.png')):
    a=np.asarray(Image.open(f).convert('RGB')).astype(float)
    l=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
    lab,n=ndi.label(l<thr)
    if n==0: per.append(0); continue
    sz=ndi.sum(np.ones_like(l),lab,range(1,n+1)); big=sz[sz>200]
    blobs+=len(big); tot+=big.sum(); per.append(int(big.sum()))
print(d.split('/')[-1],'thr',thr,'blobs',blobs,'blackpx',int(tot),'frac %.4f'%(tot/(len(per)*800*450)),'worst',max(per))
