"""Rectify real trim pieces out of the Matterport still photo of the Bedroom (photo 020, the bedroom the main
addition connects to): a double-hung window with its craftsman casing + curtains, and the doorway casing.
Homographies from hand-picked corner points (documented below, full-res pixel coords)."""
import os
import numpy as np, cv2
from scanlib import ROOT, OUT, WORK

PH = os.path.join(ROOT, 'assets_zvKHR9DHNjJ', 'matterport', 'photos', '020_image_Bedroom.jpg')
img = cv2.imread(PH)
PPM = 400


def rectify(src_quad, w, h, ml, mr, mt, mb):
    """src_quad TL,TR,BR,BL of a w x h metre rectangle on the wall; margins in metres."""
    W = int((w + ml + mr) * PPM); H = int((h + mt + mb) * PPM)
    dst = np.float32([[ml, mt], [ml + w, mt], [ml + w, mt + h], [ml, mt + h]]) * PPM
    M = cv2.getPerspectiveTransform(np.float32(src_quad), dst)
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


# ---------------- window ----------------
c = lambda x, y: (1152 + x * 1.92, 960 + y * 1.92)          # p20_win.jpg crop -> full res
win_q = [c(333, 180), c(652, 202), c(640, 790), c(357, 810)]
WW, WH, ML, MT, MB = 0.80, 1.50, 0.42, 0.36, 0.42
win = rectify(win_q, WW, WH, ML, ML, MT, MB)
cv2.imwrite(os.path.join(WORK, 'win_rect.jpg'), win)
# mirror the clean right half onto the left (left half has a lamp + bed in front of it)
mid = int((ML + WW / 2) * PPM)
right = win[:, mid:]
win2 = np.concatenate([right[:, ::-1], right], 1)
cv2.imwrite(os.path.join(WORK, 'win_mirror.jpg'), win2)

# alpha: everything that is not plain beige wall
hsv = cv2.cvtColor(win2, cv2.COLOR_BGR2LAB).astype(np.float32)
# wall reference: top-right corner region of the right half (pure wall)
wall = hsv[int(0.02 * PPM):int(0.12 * PPM), -int(0.12 * PPM):].reshape(-1, 3).mean(0)
dist = np.linalg.norm((hsv - wall) * np.float32([0.6, 1.3, 1.3]), axis=2)
mask = (dist > 14).astype(np.uint8)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
mask = (lab == keep).astype(np.uint8)
# fill holes
inv = 1 - mask; n2, lab2 = cv2.connectedComponents(inv)
border = set(np.unique(np.r_[lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
for k in range(1, n2):
    if k not in border: mask[lab2 == k] = 1
# never extend below the curtain bottoms (bed in the photo): cut at sill+0.35m
mask[int((MT + WH + 0.36) * PPM):] = 0
a = cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)
rgba = np.dstack([win2, (a * 255).astype(np.uint8)])
cv2.imwrite(os.path.join(OUT, 'window_int.png'), rgba)
print('window', rgba.shape, 'size m', rgba.shape[1] / PPM, rgba.shape[0] / PPM,
      'opening', WW, WH, 'margins', ML, MT, MB)

# ---------------- door casing ----------------
d = lambda x, y: (5184 + x / 0.3, 864 + y / 0.3)
door_q = [d(130, 128), d(432, 92), d(432, 845), d(130, 881)]
DW, DH, DML, DMT = 0.76, 2.03, 0.26, 0.30
door = rectify(door_q, DW, DH, DML, DML, DMT, 0.0)
cv2.imwrite(os.path.join(WORK, 'door_rect.jpg'), door)
print('door rect', door.shape)
