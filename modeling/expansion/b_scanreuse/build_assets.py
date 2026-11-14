"""b_scanreuse asset builder.
Everything the viewer shows is cut out of REAL captured data of this house:
  * scan mesh  -> assets/scan.bin/.json   (MatterPak mesh, clipped to the footprint, grouped by texture atlas)
  * scan bakes -> floor_oak.jpg (dining-room hardwood, re-toned to the bedroom floor), wall_field.jpg (bedroom wall),
                  ceiling.jpg (bedroom ceiling), floor_vent.png (the bedroom's floor register)
  * photo 020 (Matterport still of the Bedroom) -> window_int.png (double-hung window + casing + curtains),
                  door_casing.png (craftsman door casing), baseboard.jpg / crown.jpg (from the casing paint)
  * drone photos -> shingles.jpg (roof of this house, DJI ..0830), siding colour (DJI ..0001 front wall),
                  concrete.jpg / gravel.jpg (driveway + side strip, DJI ..0830)
plus assets/house.json with the inferred footprint, heights, roof pieces and window layout."""
import os, json
import numpy as np, cv2
from PIL import Image
import scanlib as s
from scanlib import OUT, WORK, ROOT

rng = np.random.default_rng(1)
DRONE = os.path.join(ROOT, 'assets_zvKHR9DHNjJ', 'hackathon_site', 'drone')
PHOTO = os.path.join(ROOT, 'assets_zvKHR9DHNjJ', 'matterport', 'photos', '020_image_Bedroom.jpg')
info = {}


# ------------------------------------------------------------------ helpers
def flatten(img, sigma_px, strength=1.0):
    """remove low-frequency lighting (keeps the material detail), keep mean colour"""
    f = img.astype(np.float32) + 1
    lum = f.mean(2, keepdims=True)
    low = cv2.GaussianBlur(lum, (0, 0), sigma_px)[..., None] if lum.ndim == 3 else None
    low = cv2.GaussianBlur(lum[..., 0], (0, 0), sigma_px)[..., None]
    out = f / (low / low.mean()) ** strength
    return np.clip(out - 1, 0, 255).astype(np.uint8)


def synth(patch, size=512, seed=0):
    """tileable texture with the patch's exact amplitude spectrum and random phase (removes objects/repeats,
    keeps the real material grain and colour)"""
    p = patch.astype(np.float32)
    while p.shape[0] < size or p.shape[1] < size:
        p = np.concatenate([p, p[:, ::-1]], 1); p = np.concatenate([p, p[::-1]], 0)
    p = p[:size, :size]
    mean = p.reshape(-1, 3).mean(0)
    noise = np.random.default_rng(seed).normal(size=(size, size))
    ph = np.exp(1j * np.angle(np.fft.fft2(noise)))
    out = np.zeros_like(p)
    for ch in range(3):
        F = np.fft.fft2(p[..., ch] - mean[ch])
        out[..., ch] = np.real(np.fft.ifft2(np.abs(F) * ph)) + mean[ch]
    return np.clip(out, 0, 255).astype(np.uint8)


def despeckle(img, thr=10):
    """replace scan smears / marks that deviate from the local median by the median"""
    med = cv2.medianBlur(img, 21)
    dev = np.abs(img.astype(np.int16) - med.astype(np.int16)).max(2)
    bad = cv2.dilate((dev > thr).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    out = img.copy(); out[bad] = med[bad]
    return cv2.GaussianBlur(out, (3, 3), 0)


def tileable(img, bx, by):
    """cross-fade wrap so the image tiles seamlessly; output shrinks by (bx,by)"""
    img = img.astype(np.float32)
    H, W = img.shape[:2]
    if bx:
        w = np.linspace(0, 1, bx)[None, :, None]
        out = img[:, :W - bx].copy()
        out[:, :bx] = img[:, :bx] * w + img[:, W - bx:] * (1 - w)
        img = out; W -= bx
    if by:
        w = np.linspace(0, 1, by)[:, None, None]
        out = img[:H - by].copy()
        out[:by] = img[:by] * w + img[H - by:] * (1 - w)
        img = out
    return np.clip(img, 0, 255).astype(np.uint8)


def color_transfer(src, ref_mean, ref_std=None, src_stats_from=None):
    """Reinhard transfer in Lab"""
    a = cv2.cvtColor(src, cv2.COLOR_RGB2LAB).astype(np.float32)
    b = cv2.cvtColor(src_stats_from if src_stats_from is not None else src, cv2.COLOR_RGB2LAB).astype(np.float32)
    m, sd = b.reshape(-1, 3).mean(0), b.reshape(-1, 3).std(0) + 1e-3
    if ref_std is None:
        ref_std = sd
    a = (a - m) / sd * ref_std + ref_mean
    return cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)


def lab_stats(img):
    a = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32).reshape(-1, 3)
    return a.mean(0), a.std(0)


def save(img, name, q=90):
    s.save(img, name, q)
    print('  wrote', name, img.shape)


# ------------------------------------------------------------------ 1. scan mesh export
def export_scan():
    m = s.mesh()
    V, F, UV, T = m['V'], m['F'], m['UV'], m['T']
    # keep everything inside the footprint (+0.2 m so the walls survive); drop the exterior splatter
    FP = np.array(HOUSE['footprint'])
    res = 0.02; x0, y0 = FP[:, 0].min() - 1, FP[:, 1].min() - 1
    Wd = int((FP[:, 0].max() + 1 - x0) / res); Hd = int((FP[:, 1].max() + 1 - y0) / res)
    mask = np.zeros((Hd, Wd), np.uint8)
    cv2.fillPoly(mask, [np.round((FP - [x0, y0]) / res).astype(np.int32)], 1)
    mask = cv2.dilate(mask, np.ones((11, 11), np.uint8))   # +0.10 m: keeps the scanned walls, drops outside splatter
    c = V[F].mean(1)
    ix = np.clip(((c[:, 0] - x0) / res).astype(int), 0, Wd - 1); iy = np.clip(((c[:, 1] - y0) / res).astype(int), 0, Hd - 1)
    keep = (mask[iy, ix] > 0) & (c[:, 2] < 2.9) & (c[:, 2] > -0.1)
    print('scan tris kept', keep.sum(), 'of', len(F))
    groups = []; blobs = []; off = 0
    for t in np.unique(T[keep]):
        f = F[keep & (T == t)]
        uv_, inv = np.unique(f.ravel(), return_inverse=True)
        pos = V[uv_].astype(np.float32); uv = UV[uv_].astype(np.float32)
        idx = inv.astype(np.uint32)
        for arr in (pos, uv, idx):
            blobs.append(arr.tobytes())
        g = dict(tex='../../../assets_zvKHR9DHNjJ/tiles/furnished_tex/' + m['tex'][t],
                 nv=len(uv_), ni=len(idx), pos=off, uv=off + pos.nbytes, idx=off + pos.nbytes + uv.nbytes)
        off += pos.nbytes + uv.nbytes + idx.nbytes
        groups.append(g)
    with open(os.path.join(OUT, 'scan.bin'), 'wb') as fh:
        for b in blobs: fh.write(b)
    json.dump(dict(groups=groups, bytes=off), open(os.path.join(OUT, 'scan.json'), 'w'))
    print('  scan.bin', off / 1e6, 'MB', len(groups), 'groups')


# ------------------------------------------------------------------ 2. interior textures baked from the scan
def interior_from_scan():
    # hardwood: cleanest stretch of the dining room floor (boards run east-west like everywhere in the house)
    rgb, a, _ = s.bake([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], (-6.84, -3.84), (-1.25, 0.25), (-0.2, 0.1), 256,
                       normal_min=0.8, oversample=6)
    rgb = s.fill_holes(rgb, a)
    rgb = despeckle(rgb, 45)
    rgb = flatten(rgb, 60, 0.85)
    # re-tone to the bedroom floor next to the new room (warmer / darker oak)
    ref, _, _ = s.bake([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], (-3.61, -2.48), (1.17, 2.37), (-0.2, 0.1), 128,
                    normal_min=0.8, oversample=6)
    rm, rs = lab_stats(ref[ref.sum(2) > 0].reshape(-1, 1, 3))
    sm, ss = lab_stats(rgb)
    rgb = color_transfer(rgb, rm, np.array([ss[0] * 1.0, rs[1], rs[2]]))
    rgb = tileable(rgb, 40, 30)
    save(rgb, 'floor_oak.jpg')
    info['floor_tile_m'] = [rgb.shape[1] / 256, rgb.shape[0] / 256]
    info['floor_mean'] = rgb.reshape(-1, 3).mean(0).round().tolist()

    # bedroom wall: clean patch of the bedroom's south wall (beside the sepia print)
    a0 = np.array([-2.31, 0.83]); u = np.array([-1.0, 0.0]); n = np.array([0.0, 1.0])
    rgb, al, _ = s.bake([a0[0], a0[1], 0], [u[0], u[1], 0], [0, 0, 1], [n[0], n[1], 0], (1.62, 2.42), (0.72, 1.92),
                        (-0.2, 0.3), 256, oversample=6)
    rgb = s.fill_holes(rgb, al)
    rgb = despeckle(rgb)
    rgb = flatten(rgb, 40, 1.0).astype(np.float32)
    for ax in (0, 1):
        prof = cv2.GaussianBlur(rgb.mean(ax)[None].astype(np.float32), (0, 0), 6)[0]   # (len, 3)
        prof = prof / prof.mean(0, keepdims=True)
        rgb = rgb / (prof[None, :, :] if ax == 0 else prof[:, None, :])
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    rgb = tileable(rgb, 40, 40)
    save(rgb, 'wall_field.jpg')
    info['wall_tile_m'] = [rgb.shape[1] / 256, rgb.shape[0] / 256]
    info['wall_mean'] = rgb.reshape(-1, 3).mean(0).round().tolist()

    # ceiling: bedroom ceiling seen from below, clear of the fan / light
    rgb, al, _ = s.bake([0, 0, 0], [1, 0, 0], [0, -1, 0], [0, 0, -1], (-5.5, -4.6), (-4.7, -3.8), (-2.8, -2.6), 200,
                        oversample=6)
    rgb = s.fill_holes(rgb, al)
    rgb = flatten(despeckle(rgb, 8), 30, 1.0)
    rgb = tileable(rgb, 30, 30)
    save(rgb, 'ceiling.jpg')
    info['ceiling_tile_m'] = [rgb.shape[1] / 200, rgb.shape[0] / 200]
    info['ceiling_mean'] = rgb.reshape(-1, 3).mean(0).round().tolist()

    # floor register (heating vent) of the bedroom: real decal
    rgb, al, _ = s.bake([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], (-4.62, -3.84), (2.18, 2.52), (-0.2, 0.1), 256,
                        normal_min=0.8, oversample=8)
    rgb = s.fill_holes(rgb, al)
    save(rgb, 'floor_vent.jpg')
    info['vent_m'] = [rgb.shape[1] / 256, rgb.shape[0] / 256]


# ------------------------------------------------------------------ 3. trim pieces rectified from photo 020
def from_photo():
    img = cv2.cvtColor(cv2.imread(PHOTO), cv2.COLOR_BGR2RGB)
    PPM = 400

    def rectify(q, w, h, ml, mr, mt, mb):
        Wp = int((w + ml + mr) * PPM); Hp = int((h + mt + mb) * PPM)
        dst = np.float32([[ml, mt], [ml + w, mt], [ml + w, mt + h], [ml, mt + h]]) * PPM
        M = cv2.getPerspectiveTransform(np.float32(q), dst)
        return cv2.warpPerspective(img, M, (Wp, Hp), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    wall_scan = np.array(info['wall_mean'], np.float32)

    # ---- window (corner picks: inner casing opening = head-casing bottom / stool top / inner casing edges)
    c = lambda x, y: (1152 + x * 1.92, 960 + y * 1.92)
    WW, WH, ML, MT, MB = 0.80, 1.50, 0.42, 0.36, 0.42
    win = rectify([c(333, 180), c(652, 202), c(640, 790), c(357, 810)], WW, WH, ML, ML, MT, MB)
    mid = int((ML + WW / 2) * PPM)
    right = win[:, mid:]
    win = np.concatenate([right[:, ::-1], right], 1)       # left half hidden by lamp+bed -> mirror right half
    H, W = win.shape[:2]
    # gain so the photo's beige wall matches the scan's beige wall (photos are HDR-toned brighter)
    # photo beige wall: patch left of the window (p20_win crop coords 60..120 x 300..500)
    x0_, y0_ = map(int, c(60, 300)); x1_, y1_ = map(int, c(120, 500))
    wall_ph = img[y0_:y1_, x0_:x1_].reshape(-1, 3).mean(0)
    info['photo_wall_mean'] = wall_ph.round().tolist()
    ls = cv2.cvtColor(wall_scan.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
    lp = cv2.cvtColor(wall_ph.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]

    def tone(x):
        """move the photo's beige to the scan's beige in Lab; whites/highlights keep their neutrality"""
        L = cv2.cvtColor(x, cv2.COLOR_RGB2LAB).astype(np.float32)
        w = np.clip((235 - L[..., :1]) / 90, 0, 1)
        L[..., 0] = np.where(L[..., 0] < lp[0], L[..., 0] * ls[0] / lp[0],
                             ls[0] + (L[..., 0] - lp[0]) * (255 - ls[0]) / max(255 - lp[0], 1))
        L[..., 1:] += (ls[1:] - lp[1:]) * w
        return cv2.cvtColor(np.clip(L, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    win = tone(win)
    # geometric matte (metres in the rectified frame): rod + curtains + casing; wall below the stool is cut out
    m = np.zeros((H, W), np.float32)
    y = lambda v: int(v * PPM)
    x = lambda v: int(v * PPM)
    m[y(0.19):y(2.20), :] = 1
    m[y(1.99):, x(0.44):x(1.20)] = 0
    m[:, :x(0.015)] = 0; m[:, -x(0.015):] = 0
    m = cv2.GaussianBlur(m, (0, 0), 3)
    save(np.dstack([win, (m * 255).astype(np.uint8)]), 'window_int.png')
    info['window'] = dict(size_m=[W / PPM, H / PPM], opening=[WW, WH], margin_l=ML, margin_t=MT, margin_b=MB,
                          sill=0.80, head=0.80 + WH)
    # glass-only crop for the exterior side (seen from outside: dark glass + sash)
    sash = win[y(MT):y(MT + WH), x(ML):x(ML + WW)]
    save(sash, 'window_sash.jpg')

    # ---- door casing (craftsman flat casing with cap). Corners of the opening in photo 020.
    d = lambda X, Y: (5184 + X / 0.3, 864 + Y / 0.3)
    DW, DH, DML, DMT = 0.76, 2.03, 0.26, 0.30
    door = rectify([d(130, 128), d(432, 92), d(432, 845), d(130, 881)], DW, DH, DML, DML, DMT, 0.0)
    door = tone(door)
    cx = int((DML + DW / 2) * PPM)
    # level the head casing: find the white cap's top edge per column in the right half and shear it flat
    gray = door.mean(2)
    cols = np.arange(cx, int((DML + DW + 0.15) * PPM))
    tops = np.array([np.argmax(gray[:int(0.25 * PPM), c] > gray[:int(0.25 * PPM), c].min() + 0.6 * np.ptp(gray[:int(0.25 * PPM), c])) for c in cols])
    k, b0 = np.polyfit(cols, tops, 1)
    info['door_cap_slope'] = float(k)
    sheared = door.copy()
    for c in range(cx, door.shape[1]):
        dy = -(c - cx) * k
        M_ = np.float32([[1, 0, 0], [0, 1, dy]])
        sheared[:, c:c + 1] = cv2.warpAffine(door[:, c:c + 1], M_, (1, door.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    door = sheared
    rh = door[:, cx:]
    door = np.concatenate([rh[:, ::-1], rh], 1)            # left casing hidden by the open leaf -> mirror
    H, W = door.shape[:2]
    m = np.zeros((H, W), np.float32)
    cas_out = DW / 2 + 0.165                                # measured casing width 0.165 m
    cap_out = cas_out + 0.035
    cxm = W / 2 / PPM
    m[y(DMT):, x(cxm - cas_out):x(cxm + cas_out)] = 1       # side casings
    captop = (b0 + k * cx) / PPM + 0.004
    m[int(captop * PPM) + 12:y(DMT), x(cxm - cas_out):x(cxm + cas_out)] = 1   # head casing
    m[int(captop * PPM):int(captop * PPM) + 20, x(cxm - cap_out):x(cxm + cap_out)] = 1  # cap
    m[y(DMT):, x(cxm - DW / 2):x(cxm + DW / 2)] = 0         # opening
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    save(np.dstack([door, (m * 255).astype(np.uint8)]), 'door_casing.png')
    info['door'] = dict(size_m=[W / PPM, H / PPM], opening=[DW, DH], top_margin=DMT)
    # casing paint -> baseboard + crown strips, jamb colour
    strip = door[y(0.5):y(2.2), x(cxm + DW / 2 + 0.02):x(cxm + cas_out - 0.02)]   # vertical casing board
    info['casing_mean'] = strip.reshape(-1, 3).mean(0).round().tolist()
    board = np.rot90(strip).copy()                         # -> horizontal, length along x
    bh = int(0.15 * PPM)
    board = cv2.resize(board, (board.shape[1], bh))
    shade = np.ones((bh, 1, 1), np.float32)
    shade[:6] = np.linspace(0.70, 1.0, 6)[:, None, None]   # top bevel
    shade[6:12] = np.linspace(1.0, 0.92, 6)[:, None, None]
    shade[-4:] = 0.55                                      # contact shadow on the floor line
    board = np.clip(board.astype(np.float32) * shade, 0, 255).astype(np.uint8)
    board = tileable(board, 60, 0)
    save(board, 'baseboard.jpg')
    info['baseboard_m'] = [board.shape[1] / PPM, 0.15]
    ch = int(0.11 * PPM)
    crown = cv2.resize(np.rot90(strip).copy(), (board.shape[1] + 60, ch)).astype(np.float32)
    prof = np.ones(ch, np.float32)
    t = np.linspace(0, 1, ch)
    prof = 0.78 + 0.22 * np.sin(t * np.pi) ** 0.6           # cove profile shading
    prof[:3] = 0.8; prof[-3:] = 0.62
    crown = np.clip(crown * prof[:, None, None], 0, 255).astype(np.uint8)
    crown = tileable(crown, 60, 0)
    save(crown, 'crown.jpg')
    info['crown_m'] = [crown.shape[1] / PPM, 0.11]


# ------------------------------------------------------------------ 4. exterior from the drone photos
def exterior_from_drone():
    im = cv2.cvtColor(cv2.imread(os.path.join(DRONE, 'DJI_20260915140710_0830_D.JPG')), cv2.COLOR_BGR2RGB)
    # --- shingles: a clean plane of this house's roof
    x0, y0 = 2000 + 330 * 3, 1200 + 150 * 3
    p = im[y0:y0 + 810, x0:x0 + 690]
    g = cv2.cvtColor(p, cv2.COLOR_RGB2GRAY).astype(np.float32); g -= cv2.GaussianBlur(g, (0, 0), 15)
    win2 = np.hanning(g.shape[0])[:, None] * np.hanning(g.shape[1])[None]
    Fq = np.abs(np.fft.fftshift(np.fft.fft2(g * win2))); h, w = Fq.shape
    Fq[h // 2 - 3:h // 2 + 4, w // 2 - 3:w // 2 + 4] = 0
    iy, ix = np.unravel_index(np.argmax(Fq), Fq.shape)
    fy, fx = (iy - h // 2) / h, (ix - w // 2) / w
    period = 1 / np.hypot(fy, fx)
    ang = np.degrees(np.arctan2(fy, fx))
    best = None
    for rot in (ang - 90, ang + 90, -(ang - 90), -(ang + 90)):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), rot, 1.0)
        r = cv2.warpAffine(p, M, (w, h), flags=cv2.INTER_CUBIC)
        cc = r[h // 2 - 190:h // 2 + 190, w // 2 - 190:w // 2 + 190]
        prof = cc.mean(2).mean(1); score = np.abs(np.fft.rfft(prof - prof.mean()))[1:].max()
        if best is None or score > best[0]: best = (score, cc, rot)
    cc = best[1]
    # orient so the exposed tab edge (dark shadow line) is at the bottom of each course -> check gradient sign
    prof = cc.mean(2).mean(1)
    if np.mean(np.diff(prof)[np.diff(prof) > 0]) < np.mean(-np.diff(prof)[np.diff(prof) < 0]):
        cc = cc[::-1]
    cc = flatten(cc, 40, 1.0)
    cc = tileable(cc, 40, 0)
    # make the vertical repeat a whole number of courses
    nC = int(cc.shape[0] // period) - 1
    Hn = int(round(nC * period)); cc = tileable(cc[:Hn + 24], 0, 24)
    ppm = period / 0.143                                   # architectural shingle exposure ~143 mm
    save(cc, 'shingles.jpg')
    info['shingle_tile_m'] = [cc.shape[1] / ppm, cc.shape[0] / ppm]
    info['shingle_mean'] = cc.reshape(-1, 3).mean(0).round().tolist()
    print('  shingle period px', period, 'rot', best[2])

    # --- ground: driveway concrete + gravel strip (top-down parts of the same photo)
    def patch(x, y, w, h):
        return im[y:y + h, x:x + w]
    conc = patch(3760 + 3 * 300, 1520 + 3 * 15, 3 * 110, 3 * 70)
    conc = flatten(conc, 6, 1.0)
    conc = synth(conc, 512, 5)
    save(conc, 'concrete.jpg')
    grav = patch(3760 + 3 * 405, 1520 + 3 * 160, 3 * 55, 3 * 230)
    grav = synth(flatten(grav, 25, 1.0), 256, 6)
    save(grav, 'gravel.jpg')
    info['concrete_mean'] = conc.reshape(-1, 3).mean(0).round().tolist()
    # dry LA lawn + street asphalt across the street (DJI ..0070, oblique -> stretch vertically x2.2)
    im70 = cv2.cvtColor(cv2.imread(os.path.join(DRONE, 'DJI_20260915134623_0070_D.JPG')), cv2.COLOR_BGR2RGB)
    lawn = im70[842:908, 2242:2388]
    lawn = cv2.resize(lawn, (lawn.shape[1] * 2, int(lawn.shape[0] * 2 * 2.2)), interpolation=cv2.INTER_CUBIC)
    lawn = flatten(lawn, 25, 1.0)
    lawn = synth(lawn, 512, 3)
    save(lawn, 'lawn.jpg')
    asph = im70[1110:1190, 1650:2250]
    asph = cv2.resize(asph, (asph.shape[1], int(asph.shape[0] * 2.5)), interpolation=cv2.INTER_CUBIC)
    asph = synth(flatten(asph, 40, 1.0), 512, 4)
    save(asph, 'asphalt.jpg')

    # --- siding colour from the sunlit front wall (DJI ..0001, beside the porch "5836")
    im1 = cv2.cvtColor(cv2.imread(os.path.join(DRONE, 'DJI_20260915134518_0001_D.JPG')), cv2.COLOR_BGR2RGB)
    fw = im1[2480:2600, 2860:2920]
    info['siding_rgb'] = fw.reshape(-1, 3).mean(0).round().tolist()
    bw = im[3120 + 735:3120 + 855, 1200 + 990:1200 + 1260]
    info['siding_rgb_back'] = bw.reshape(-1, 3).mean(0).round().tolist()
    cv2.imwrite(os.path.join(WORK, 'siding_sample_front.png'), cv2.cvtColor(cv2.resize(fw, (140, 100), interpolation=cv2.INTER_NEAREST), cv2.COLOR_RGB2BGR))
    cv2.imwrite(os.path.join(WORK, 'siding_sample_back.png'), cv2.cvtColor(cv2.resize(bw, (140, 100), interpolation=cv2.INTER_NEAREST), cv2.COLOR_RGB2BGR))
    # lap siding: 0.115 m exposure courses, shading profile, grain noise taken from the drone wall pixels' high-pass
    # front (porch, shaded) reads sage green, back (sunlit) light grey-blue: same lap siding; we take the sunlit
    # back luminance / 1.25 (sun) with the front's green hue
    back = np.array(info['siding_rgb_back'], np.float32) / 1.25
    front = np.array(info['siding_rgb'], np.float32)
    col = front / front.mean() * back.mean()
    col = 0.6 * col + 0.4 * back
    col = col.mean() + (col - col.mean()) * 0.6           # the drone JPEGs are saturated; tone down
    col = col * 1.12
    info['siding_albedo'] = col.round().tolist()
    PP = 512; tile = np.zeros((PP, PP, 3), np.float32)
    exp_px = PP / 8                                        # 8 courses per metre-ish tile (0.125 m exposure)
    yy = np.arange(PP) % exp_px / exp_px
    prof = 0.9 + 0.1 * yy                                  # board darker at top (under the lap), lighter at bottom
    prof[(yy > 0.94)] = 1.06
    prof[(yy < 0.06)] = 0.62                               # shadow line under each lap
    noise = cv2.GaussianBlur(rng.normal(0, 1, (PP, PP)).astype(np.float32), (0, 0), 1.2) * 0.03
    streak = cv2.GaussianBlur(rng.normal(0, 1, (PP, PP)).astype(np.float32), (0, 0), sigmaX=40, sigmaY=1.5) * 0.04
    tile = col[None, None] * (prof[:, None, None] + noise[..., None] + streak[..., None])
    tile = np.clip(tile, 0, 255).astype(np.uint8)
    save(tile, 'siding.jpg')
    g = tile.astype(np.float32).mean(2, keepdims=True) / col.mean() * 225
    save(np.clip(np.repeat(g, 3, 2), 0, 255).astype(np.uint8), 'siding_gray.jpg')   # neighbours (tinted)
    info['siding_tile_m'] = [1.0, 1.0]


# ------------------------------------------------------------------ 5. house model (inferred, documented)
FP = [[-13.0, -5.77], [-6.94, -5.77], [-6.94, -4.2], [-2.3, -4.2], [-2.3, -4.76], [2.82, -4.76], [2.82, 4.91],
      [-13.0, 4.91]]
HOUSE = dict(
    footprint=FP,                       # wall centre-lines, from plan.json room union (west notch filled)
    floor_z=0.03, ceiling_z=2.72,       # measured in the scan (area-weighted medians)
    plate_z=2.98,                       # ceiling + ~0.26 m joists/top plate
    ground_z=-0.47,                     # scanned front walk / porch slab
    wall_half=0.08, ext_offset=0.13,    # interior faces at +-0.08, exterior siding at +0.13 from centre-line
    pitch=5 / 12, overhang=0.45,
    # roof pieces: rect on wall centre-lines; ridge axis; per-end 'hip' or 'gable'
    roof=[
        dict(id='main', rect=[-13.0, -4.2, 2.82, 4.91], axis='x', ends=['hip', 'hip']),
        dict(id='westwing', rect=[-13.0, -5.77, -6.94, 2.0], axis='y', ends=['gable', 'hip']),
        dict(id='crossgable', rect=[-9.2, -4.2, -2.3, 1.5], axis='y', ends=['gable', 'hip']),
        dict(id='eastbay', rect=[-2.3, -4.76, 2.82, 1.0], axis='y', ends=['hip', 'hip']),
    ],
    # windows on the existing house (sill, head from the photo-measured window); rule-based layout per room
    windows=[],
    front_door=dict(wall=[[-2.3, -4.76], [2.82, -4.76]], center=1.2, width=0.9, height=2.1),
    porch=dict(rect=[-6.94, -5.77, -2.3, -4.2]),
)


def layout_windows():
    """one or two windows per room on each exterior wall, centred (rule: 1 per <=3.4 m, else 2)"""
    p = s.plan(); FPn = np.array(FP)
    edges = [(FPn[i], FPn[(i + 1) % len(FPn)]) for i in range(len(FPn))]
    wins = []
    for r in p['rooms']:
        P = np.array(r['polygon'])
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            L = np.linalg.norm(b - a)
            if L < 1.3: continue
            for ea, eb in edges:   # is this room edge on an exterior edge?
                d = eb - ea; Le = np.linalg.norm(d); ud = d / Le; nn = np.array([-ud[1], ud[0]])
                if abs(np.dot(a - ea, nn)) < 0.12 and abs(np.dot(b - ea, nn)) < 0.12:
                    ta, tb = sorted([np.dot(a - ea, ud), np.dot(b - ea, ud)])
                    ta, tb = max(ta, 0), min(tb, Le)
                    if tb - ta < 1.3: continue
                    small = r['label'] in ('Bathroom', 'Closet', 'Hallway')
                    if r['label'] in ('Closet', 'Hallway'): continue
                    k = 1 if (tb - ta) <= 3.4 else 2
                    for j in range(k):
                        t = ta + (tb - ta) * (j + 0.5) / k
                        wins.append(dict(a=ea.tolist(), b=eb.tolist(), t=float(t), room=r['label'],
                                         w=0.6 if small else 0.80, sill=1.25 if small else 0.80,
                                         h=0.75 if small else 1.50))
    HOUSE['windows'] = wins
    print('  windows', len(wins))


if __name__ == '__main__':
    layout_windows()
    print('scan export'); export_scan()
    print('interior'); interior_from_scan()
    print('photo'); from_photo()
    print('drone'); exterior_from_drone()
    HOUSE['tex'] = info
    json.dump(HOUSE, open(os.path.join(OUT, 'house.json'), 'w'), indent=1)
    print(json.dumps(info, indent=1))
