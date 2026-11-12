"""Mockup-only contour generator: a numpy port of scene/terrain.ts terrainHeight (origin/main),
traced with marching squares into an SVG. Task A ports this to TypeScript (see landing-v3-spec.md 7.A).
Usage: python contours.py <out.svg> [x0 x1 z0 z1 step]"""
import sys, math
import numpy as np
from skimage import measure

M32 = 0xFFFFFFFF
def hash_(ix, iz):
    h = ((ix * 374761393) + (iz * 668265263)) & M32
    h = ((h ^ (h >> 13)) * 1274126177) & M32
    return ((h ^ (h >> 16)) & M32) / 4294967295.0

def vnoise(x, z):
    ix = np.floor(x).astype(np.int64); iz = np.floor(z).astype(np.int64)
    fx = x - ix; fz = z - iz
    u = fx * fx * (3 - 2 * fx); v = fz * fz * (3 - 2 * fz)
    a = hash_(ix, iz); b = hash_(ix + 1, iz); c = hash_(ix, iz + 1); d = hash_(ix + 1, iz + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

def fbm(x, z):
    amp, f, s = 0.5, 1.0, 0.0
    for _ in range(4):
        s = s + amp * vnoise(x * f, z * f); f *= 2; amp *= 0.5
    return s / 0.9375

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
lerp = lambda a, b, t: a + (b - a) * t
SX, FACE_W = 0.8, 6
ROAD_HALF, ROAD_BLEND = 4.6, 11
TH_TOP, TH_BOT = 0.08 * math.pi, math.pi + 0.1505
R_TOP, R_BOT, Y_TOP, FLOOR_ROAD_Z = 104, 36, 24, -5.4

def wobble(th, x, z):
    return 3.5 * np.sin(2 * th + 0.7) + 2.5 * np.sin(5 * th + 2) + 3 * (fbm(x * 0.02 + 7, z * 0.02 + 1) - 0.5)

def road(x, z, r, th):
    t = np.where(th < -0.55 * math.pi, th + 2 * math.pi, th)
    k = (t - TH_TOP) / (TH_BOT - TH_TOP)
    inside = (k > -0.04) & (k < 1.03) & (r > 30)
    kc = np.clip(k, 0, 1); rr = lerp(R_TOP, R_BOT, kc); off = r - rr; a = np.abs(off)
    edge = smooth(-0.04, 0.02, k) * (1 - smooth(0.99, 1.03, k))
    wh = np.where(inside, (1 - smooth(ROAD_HALF, ROAD_HALF + ROAD_BLEND, a)) * edge, 0)
    y = np.where(inside, Y_TOP * (1 - np.clip(kc / 0.94, 0, 1)), 0)
    fo = z - FLOOR_ROAD_Z; fa = np.abs(fo)
    fe = smooth(-50, -44, x) * (1 - smooth(-6, -1, x))
    fwh = (1 - smooth(ROAD_HALF, ROAD_HALF + 7, fa)) * fe
    y = np.where(fwh > wh, 0, y); wh = np.maximum(wh, fwh)
    return wh, y

def height(x, z):
    xs = x * SX; r = np.hypot(xs, z); th = np.arctan2(z, xs)
    rr = r + wobble(th, x, z) * smooth(30, 60, r)
    y = 8 * (smooth(38, 38 + FACE_W, rr) + smooth(66, 66 + FACE_W, rr) + smooth(92, 92 + FACE_W, rr))
    y = y + (fbm(x * 0.09 + 11, z * 0.09 - 5) - 0.5) * 0.6 * smooth(36, 70, r)
    y = y - 0.45 * smooth(0, 1, 1 - np.clip((rr - 44) / 22, 0, 1)) * smooth(40, 46, rr) * smooth(70, 60, rr)
    q = smooth(112, 205, rr); aw = 0.5 + 0.5 * np.cos(th - 2.4)
    ridge = 1 - np.abs(2 * fbm(x * 0.017 + 3, z * 0.017 + 8) - 1)
    y = y + 70 * q * (0.28 + 0.95 * aw) * (0.55 + 0.7 * ridge ** 1.4)
    y = y + smooth(190, 330, rr) * 60 * fbm(x * 0.01 - 2, z * 0.01 + 6)
    d = smooth(34, 60, r)
    y = y + (fbm(x * 0.06, z * 0.06) - 0.5) * 0.5 * (0.25 + d)
    y = y + (fbm(x * 0.35 + 3, z * 0.35) - 0.5) * 0.28 * (0.2 + d)
    wh, ry = road(x, z, r, th)
    return np.where(wh > 0, lerp(y, ry + (fbm(x * 0.5, z * 0.5) - 0.5) * 0.06, wh), y)

def catmull(pts, n=24):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = map(np.array, P[i - 1:i + 3])
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(np.array(pts[-1])); return out

if __name__ == "__main__":
    out = sys.argv[1]
    x0, x1, z0, z1, step = (float(v) for v in (sys.argv[2:7] if len(sys.argv) > 6 else (-190, 190, -110, 110, 0.5)))
    xs = np.arange(x0, x1 + step, step); zs = np.arange(z0, z1 + step, step)
    X, Z = np.meshgrid(xs, zs); H = height(X, Z)
    W, Hh = x1 - x0, z1 - z0
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {Hh:.0f}" preserveAspectRatio="xMidYMid slice">']
    for lvl in np.arange(0.8, 140, 1.6):
        major = abs((lvl - 0.8) % 8.0) < 1e-6
        for c in measure.find_contours(H, lvl):
            c = measure.approximate_polygon(c, 0.35)
            if len(c) < 4: continue
            d = "M" + " ".join(f"{(p[1]*step):.1f},{(p[0]*step):.1f}" for p in c)
            k = "M" if major else "m"
            svg.append(f'<path class="c{k}" style="fill:none;stroke:var(--c{k},none);stroke-width:var(--w{k},0)" d="{d}"/>')
    # Fine floor contours (0.12 m) for the flat working floor, so letters over the floor are not empty.
    for lvl in np.arange(-0.36, 1.2, 0.12):
        for c in measure.find_contours(H, lvl):
            c = measure.approximate_polygon(c, 0.4)
            if len(c) < 6: continue
            d = "M" + " ".join(f"{(p[1]*step):.1f},{(p[0]*step):.1f}" for p in c)
            svg.append(f'<path class="cf" style="fill:none;stroke:var(--cf,none);stroke-width:var(--wf,0)" d="{d}"/>')
    trail = [(0, 0), (10, -3), (22, -12), (28, -2), (21, 12), (7, 20), (-11, 22), (-25, 12), (-25, -8), (-11, -15), (-3, -6), (0, 0)]
    tp = catmull([list(p) for p in trail])
    svg.append('<path class="trail" style="fill:none;stroke:var(--tr,none);stroke-width:var(--tw,0);stroke-linecap:round;stroke-linejoin:round" d="M' + " ".join(f"{p[0]-x0:.1f},{p[1]-z0:.1f}" for p in tp) + '"/>')
    rd = []
    for i in range(61):
        u = i / 60; th = lerp(TH_TOP, TH_BOT, u); r = lerp(R_TOP, R_BOT, u)
        rd.append((r * math.cos(th) / SX - x0, r * math.sin(th) - z0))
    rd += [(x - x0, -5.4 - z0) for x in (-44, -30, -14, -2)]
    svg.append('<path class="road" style="fill:none;stroke:var(--rd,none);stroke-width:0.5;stroke-dasharray:2 1.6" d="M' + " ".join(f"{a:.1f},{b:.1f}" for a, b in rd) + '"/>')
    for rr in (26, 18, 12, 6):
        svg.append(f'<circle class="ring" style="fill:none;stroke:var(--rg,none);stroke-width:0.3" cx="{-x0:.1f}" cy="{-z0:.1f}" r="{rr}"/>')
    svg.append("</svg>")
    open(out, "w", encoding="utf-8").write("\n".join(svg))
    print(out, len(svg), "elements", f"{H.min():.1f}..{H.max():.1f} m")
