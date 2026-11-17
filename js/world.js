'use strict';
/* ============================================================
 * world.js — 沙盒地图（沿用 MVP01 的吉萨景区布局，改为开放可碰撞/可攀爬）
 * 碰撞体带 top 高度：脚在 top 以上则可站在上面（金字塔每层都能站）。
 * ============================================================ */
const BOUNDS = { minX: -120, maxX: 120, minZ: -144, maxZ: 114 };
const DUNE_RECT = { minX: -124, maxX: -82, minZ: 18, maxZ: 116 };
const EXIT = { x: 108, z: -30, r: 9 };
const PYR = { x: 0, z: -100, top: 56 };

const COL = {
  sand: '#d8b983', sand2: '#cdac76', sand3: '#dfc58f', path: '#b9a07a', plaza: '#cbbb9c',
  st1: '#d4b27a', st2: '#c8a56b', gold: '#d9a82c', dark: '#3b2f2a',
  white: '#e9e0cc', red: '#a9402c', blue: '#38658f', teal: '#2f857b', green: '#55804a', yellow: '#d2a038', wood: '#7a5230',
};

function matOf(color, mesh) {
  const c = (color || '').toLowerCase();
  if (c === COL.sand || c === COL.sand2 || c === COL.sand3) return 1;
  if (c === COL.st1 || c === COL.st2) return 2;
  if (c === COL.path || c === COL.plaza) return 3;
  if (c === COL.wood || c === '#8a5a33') return 4;
  if (c === '#d2b27c') return 5;                         // 金字塔：大块石灰岩
  return 0;
}
const _meshCache = new Map();
class Builder {
  constructor(R, dyn) { this.R = R; this.arr = []; this.dyn = !!dyn; }
  add(mesh, x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, unlit = false) {
    let mh = this.R.m[mesh];
    if (mesh === 'cube' && !unlit) {                       // 方块一律做圆角倒角：边缘吃光，不再像积木
      const md = Math.min(sx, sy, sz), mx = Math.max(sx, sy, sz), bv = Math.min(0.16, md * 0.3);
      if (bv >= 0.02 && mx <= 40) {
        const key = [sx, sy, sz].map(v => v.toFixed(3)).join('|') + (this.dyn ? 'd' : 's');
        mh = _meshCache.get(key);
        if (!mh) { const data = geoRBox(sx, sy, sz, bv); mh = this.dyn ? this.R._mesh(data) : { data: new Float32Array(data), count: data.length / 6 }; _meshCache.set(key, mh); }
        sx = sy = sz = 1;
      }
    }
    const o = { mesh: mh, m: M4.compose(x, y, z, rx, ry, rz, sx, sy, sz), col: hexToRgb(color), mat: matOf(color, mesh), unlit, rad: Math.max(sx, sy, sz) * 0.9 + 1 };
    if (mh.data && sx === 1 && sy === 1 && sz === 1) { let r = 0; for (let i = 0; i < mh.data.length; i += 6) r = Math.max(r, Math.hypot(mh.data[i], mh.data[i + 1], mh.data[i + 2])); o.rad = r + 1; }
    this.arr.push(o); return o;
  }
  box(cx, by, cz, w, h, d, color, ry = 0) { return this.add('cube', cx, by + h / 2, cz, w, h, d, color, ry); }
  cyl(cx, by, cz, dia, h, color) { return this.add('cyl', cx, by + h / 2, cz, dia, h, dia, color); }
  cone(cx, by, cz, dia, h, color) { return this.add('cone', cx, by, cz, dia, h, dia, color); }
  sph(cx, cy, cz, sx, sy, sz, color) { return this.add('sph', cx, cy, cz, sx, sy, sz, color); }
  pyr(cx, by, cz, w, h, color) { return this.add('pyr', cx, by, cz, w, h, w, color); }
  /** 两点之间的圆柱/锥（锥形树干、肢体等） */
  tube(a, b, dia, color, dia2) { const o = { mesh: this.R.m.cyl, m: M4.seg(a, b, dia, dia), col: hexToRgb(color), mat: matOf(color), unlit: false, rad: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + dia }; this.arr.push(o); return o; }
}

/* ---------- 地面高度 / 水平推出（全局函数，依赖全局 W） ---------- */
function groundAt(x, z, y) {
  let g = 0;
  const rs = W.ramps;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const t = r.axis === 'z' ? (z - r.z0) / (r.z1 - r.z0) : (x - r.x0) / (r.x1 - r.x0);
    const h = r.h0 + (r.h1 - r.h0) * t; if (h > g) g = h;
  }
  const hs = W.hills;
  for (let i = 0; i < hs.length; i++) {
    const d = hs[i], u = (x - d.x) / d.rx, v = (z - d.z) / d.rz, q = 1 - u * u - v * v;
    if (q > 0) { const h = d.h * Math.sqrt(q); if (h > g) g = h; }
  }
  const ps = W.pyrs;
  for (let i = 0; i < ps.length; i++) {
    const d = ps[i], m = Math.max(Math.abs(x - d.x), Math.abs(z - d.z));
    if (m < d.half) { const h = d.h * (1 - m / d.half); if (h > g) g = h; }
  }
  const cs = W.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.top <= g || c.top > y + 0.6) continue;
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) g = c.top;
  }
  return g;
}
/** 相机专用：点 (x,y,z) 半径 r 内是否有地形/墙体（比 pushOut 更严格，不留台阶容差） */
function camBlocked(x, y, z, r) {
  if (y < groundAt(x, z, y) + 0.35) return true;
  const cs = W.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.maxX - c.minX < 1.6 && c.maxZ - c.minZ < 1.6) continue; // 树干/仙人掌这类细物体相机直接穿过
    if (y > c.top + 0.3 || x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) continue;
    return true;
  }
  return false;
}
function pushOut(x, z, y, r) {
  let hit = false; const cs = W.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (y >= c.top - 0.4) continue;
    const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x, cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
    else {
      const l = x - c.minX, rr = c.maxX - x, t = z - c.minZ, b = c.maxZ - z, m = Math.min(l, rr, t, b);
      if (m === l) x = c.minX - r; else if (m === rr) x = c.maxX + r; else if (m === t) z = c.minZ - r; else z = c.maxZ + r;
    }
    hit = true;
  }
  return { x, z, hit };
}
function inDune(x, z) { return x > DUNE_RECT.minX && x < DUNE_RECT.maxX && z > DUNE_RECT.minZ && z < DUNE_RECT.maxZ; }

function buildWorld(R) {
  const B = new Builder(R);
  const W = { objs: B.arr, colliders: [], ramps: [], hills: [], pyrs: [], mini: [], spawn: {} };
  const col = (minX, maxX, minZ, maxZ, top) => W.colliders.push({ minX, maxX, minZ, maxZ, top });
  const rect = (cx, cz, w, d, top = 4) => col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, top);
  const paved = [];
  const road = (cx, cz, w, d, c = COL.path, m = true) => { paved.push([cx, cz, w, d]); B.add('cube', cx, 0.004 * paved.length, cz, w, 0.2, d, c); if (m) W.mini.push([cx, cz, w, d, c]); };

  /* ---- 地面与道路 ---- */
  B.add('cube', 0, -0.5, -20, 900, 1, 900, COL.sand);
  road(0, 34, 7, 160); road(0, 98, 40, 24, COL.plaza); road(-26, 58, 52, 6); road(28, 50, 56, 6);
  road(0, -46, 44, 16, COL.plaza); road(24, -30, 168, 6); road(0, 72, 14, 14, COL.plaza);
  road(-52, 58, 24, 18, COL.plaza); road(56, 50, 22, 20, COL.plaza); road(-60, -30, 22, 16, COL.plaza); road(108, -30, 14, 16, COL.plaza);

  /* ---- 金字塔：光滑斜面（地形高度场，可直接走/开上去），表面程序化大石块纹理 ---- */
  const stepPyr = (cx, cz, base, height) => {
    B.pyr(cx, 0, cz, base, height, '#d2b27c');
    W.pyrs.push({ x: cx, z: cz, half: base / 2, h: height });
    B.pyr(cx, height - base * 0.02, cz, base * 0.07, height * 0.07, COL.gold);
    W.mini.push([cx, cz, base, base, '#c89a55']);
  };
  stepPyr(0, -100, 80, 56); stepPyr(-75, -135, 56, 38); stepPyr(80, -120, 44, 30);

  /* ---- 狮身人面像（椭球拼成，不再是方块） ---- */
  const sx = -93, sz = -30, SK = '#d9aa5e', SK2 = '#cf9d52';
  col(sx - 17, sx + 17, sz - 6, sz + 6, 7); col(sx + 12.5, sx + 21.5, sz - 4.5, sz + 4.5, 17);
  B.sph(sx - 1, 3.2, sz, 34, 8.2, 11.6, SK); B.sph(sx - 9, 3.8, sz, 15, 9.4, 11.8, SK2); B.sph(sx + 9, 4.2, sz, 13, 8.4, 9.6, SK);
  [-1, 1].forEach(sd => { B.sph(sx + 14.5, 1.5, sz + sd * 5.2, 16, 3.4, 3.8, SK); [-1, 0, 1].forEach(t => B.sph(sx + 22.2, 0.7, sz + sd * 5.2 + t * 1.1, 1.8, 1.3, 1.1, SK2)); });
  B.sph(sx + 15.2, 9.6, sz, 8, 10, 7.2, SK); B.sph(sx + 17.6, 12.4, sz, 7.4, 8.8, 7.0, SK);
  B.sph(sx + 17.2, 16.2, sz, 9.0, 4.2, 9.2, COL.gold); B.sph(sx + 17.3, 14.6, sz, 8.6, 3.4, 8.8, COL.blue);
  [-1, 1].forEach(sd => { for (let i = 0; i < 5; i++) B.sph(sx + 16.4 - i * 0.25, 12.6 - i * 1.7, sz + sd * 4.4, 4.6 - i * 0.2, 2.1, 2.7, i % 2 ? COL.blue : COL.gold); });
  B.sph(sx + 21.2, 11.4, sz, 1.8, 2.6, 1.7, SK); B.sph(sx + 20.7, 12.8, sz - 1.8, 1.1, 1.3, 0.9, COL.dark); B.sph(sx + 20.7, 12.8, sz + 1.8, 1.1, 1.3, 0.9, COL.dark);
  B.sph(sx + 21.0, 9.9, sz, 1.3, 0.8, 3.0, '#b8864a'); B.sph(sx + 19.8, 7.6, sz, 2.4, 4.6, 2.2, '#c28f50');
  W.mini.push([sx, sz, 34, 12, '#c89a55']);

  /* ---- 大门：圆柱 + 莲花柱头 + 圆梁 ---- */
  const column = (x, z) => { B.cyl(x, 0, z, 3.9, 0.7, COL.st2); B.cyl(x, 0.7, z, 3.0, 8.6, COL.st1); B.sph(x, 9.6, z, 4.4, 2.6, 4.4, COL.st1); B.cyl(x, 9.9, z, 3.4, 0.7, COL.st2); };
  column(-8, 112); column(8, 112);
  B.add('cyl', 0, 11.6, 112, 2.8, 19.4, 2.8, COL.gold, 0, 0, Math.PI / 2); B.sph(0, 13.7, 112, 8.5, 2.6, 2.6, COL.red);
  rect(-8, 112, 3.2, 3.2, 10); rect(8, 112, 3.2, 3.2, 10);
  column(118, -37); column(118, -23);
  B.add('cyl', 118, 11.6, -30, 2.8, 19.4, 2.8, '#55804a', 0, Math.PI / 2, 0); B.sph(118, 13.7, -30, 2.6, 2.6, 8.5, COL.white);
  rect(118, -37, 3.2, 3.2, 10); rect(118, -23, 3.2, 3.2, 10);

  /* ---- 外围沙丘 ---- */
  const dune = (x, z, a, h, c) => { B.add('sph', x, 0, z, a, h, a * 0.8, c); W.hills.push({ x, z, rx: a / 2, rz: a * 0.4, h: h / 2 }); }; // 沙丘是真地形：可以走上去/冲坡
  for (let i = 0; i < 26; i++) { const ang = i / 26 * Math.PI * 2, rr = 190 + (i % 3) * 22; dune(Math.cos(ang) * rr, -10 + Math.sin(ang) * rr * 0.95, 70 + (i % 4) * 14, 22 + (i % 5) * 4, i % 2 ? COL.sand2 : COL.sand3); }
  [[-110, 40, 30], [-100, 80, 34], [-112, 105, 28], [-95, 25, 22]].forEach(p => dune(p[0], p[1], p[2], 9, COL.sand3));

  /* ---- 棕榈 / 仙人掌 / 石头 ---- */
  const palm = (x, z, h) => {
    const g = new Builder(R), seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, la = seed * 6.283, lean = 0.5 + seed * 1.6;
    const P = [], N = 9;
    for (let i = 0; i <= N; i++) { const t = i / N, o = lean * t * t * h * 0.16; P.push([Math.cos(la) * o, t * h, Math.sin(la) * o]); }
    for (let i = 0; i < N; i++) {
      const r = 0.66 - 0.30 * (i / N);
      g.tube(P[i], P[i + 1], r * 2 * 0.98, i % 2 ? '#8a5a33' : '#7d512e');
      g.sph(P[i + 1][0], P[i + 1][1], P[i + 1][2], r * 2.08, 0.34, r * 2.08, '#6f4727');       // 树干环节
    }
    const top = P[N]; g.sph(top[0], top[1] + 0.1, top[2], 1.3, 1.0, 1.3, '#6b4a2a');
    const nF = 12;
    for (let i = 0; i < nF; i++) {
      const a = i / nF * Math.PI * 2 + seed * 3, up = i % 2 ? 0.42 : 0.12, L = (4.3 + 1.2 * ((i * 7) % 5) / 4) * (0.9 + seed * 0.2), dry = i === 3 || i === 8;
      g.add('leaf', top[0], top[1] + 0.25, top[2], L, L * (0.9 + 0.2 * up), L * (0.9 + ((i * 3) % 4) * 0.05), dry ? '#8a8a45' : (i % 3 === 0 ? '#44663a' : i % 3 === 1 ? '#52723c' : '#5d7d40'), a, 0, up + (dry ? -0.5 : 0));
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + seed; g.sph(top[0] + Math.cos(a) * 0.55, top[1] - 0.35, top[2] + Math.sin(a) * 0.55, 0.52, 0.58, 0.52, '#5a3d20'); }
    const M = M4.T(x, 0, z); g.arr.forEach(o => { o.m = M4.mul(M, o.m); o.rad = Math.max(o.rad, 6); B.arr.push(o); });
    rect(x, z, 1.5, 1.5, h + 1);
  };
  [[-6, 88], [7, 86], [-9, 68], [9, 77], [-8, 80], [11, 66], [-14, 100], [14, 100], [-5, -30], [6, -34], [-30, 64], [-38, 50], [44, 56], [66, 60], [-20, 20], [20, 40], [100, -22], [100, -38], [48, 18], [-46, 12]].forEach(p => palm(p[0], p[1], 6 + (Math.abs(p[0] + p[1]) % 3)));
  [[-30, 5], [30, 22], [70, 10], [88, -50], [-70, 60], [-26, -56]].forEach((p, k) => {
    const G2 = '#4f9d4a', G3 = '#5aa855'; B.cyl(p[0], 0, p[1], 0.8, 2.9, G2); B.sph(p[0], 2.9, p[1], 0.8, 0.7, 0.8, G3);
    const sd = k % 2 ? 1 : -1; B.add('cyl', p[0] + sd * 0.7, 1.3, p[1], 0.42, 1.0, 0.42, G2, 0, 0, Math.PI / 2); B.sph(p[0] + sd * 1.15, 1.3, p[1], 0.42, 0.42, 0.42, G2);
    B.cyl(p[0] + sd * 1.15, 1.3, p[1], 0.42, 1.2, G2); B.sph(p[0] + sd * 1.15, 2.5, p[1], 0.42, 0.4, 0.42, G3);
    rect(p[0], p[1], 1.2, 1.2, 4);
  });
  for (let i = 0; i < 24; i++) { const rx = -108 + (i * 53) % 216, rz = -128 + (i * 97) % 230; if (Math.abs(rx) < 8 || Math.abs(rz + 30) < 6 || Math.abs(rz - 50) < 5) continue; B.sph(rx, 0.3, rz, 1.8 + (i % 3), 1.2, 1.5 + (i % 2), '#c9a574'); }

  /* ---- 地表细节：干草丛、碎石堆、灌木（避开道路与建筑，不参与碰撞） ---- */
  {
    let sd = 20261117; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    const onRoad = (x, z, m) => paved.some(r => Math.abs(x - r[0]) < r[2] / 2 + m && Math.abs(z - r[1]) < r[3] / 2 + m);
    const blocked = (x, z) => W.pyrs.some(p => Math.abs(x - p.x) < p.half + 4 && Math.abs(z - p.z) < p.half + 4) || (Math.abs(x + 93) < 26 && Math.abs(z + 30) < 12);
    const hillY = (x, z) => { let g = 0; for (const d of W.hills) { const u = (x - d.x) / d.rx, v = (z - d.z) / d.rz, q = 1 - u * u - v * v; if (q > 0) g = Math.max(g, d.h * Math.sqrt(q)); } return g; };
    const ok = (x, z, m) => !onRoad(x, z, m) && !blocked(x, z) && hillY(x, z) < 0.05;
    const G1 = ['#8a8a4a', '#a39a5a', '#6f7a3c', '#9a8f55'], RK = ['#b59a74', '#9c8465', '#a58d6a', '#8e7a5d'];
    for (let i = 0, n = 0; i < 900 && n < 300; i++) {
      const x = -150 + rnd() * 300, z = -190 + rnd() * 300; if (!ok(x, z, 1.5)) continue; n++;
      const k = 4 + Math.floor(rnd() * 4), c = G1[Math.floor(rnd() * 4)];
      for (let j = 0; j < k; j++) { const L = 0.45 + rnd() * 0.65; B.add('leaf', x + (rnd() - .5) * 0.3, 0, z + (rnd() - .5) * 0.3, L, L * 1.1, L * 0.7, c, rnd() * 6.283, 0, 0.95 + rnd() * 0.45); }
    }
    for (let i = 0, n = 0; i < 700 && n < 140; i++) {
      const x = -160 + rnd() * 320, z = -200 + rnd() * 320; if (!ok(x, z, 1)) continue; n++;
      const k = 2 + Math.floor(rnd() * 4);
      for (let j = 0; j < k; j++) { const r = 0.14 + rnd() * 0.34; B.sph(x + (rnd() - .5) * 1.2, r * 0.25, z + (rnd() - .5) * 1.2, r * 2, r * 1.3, r * 1.7, RK[Math.floor(rnd() * 4)]); }
    }
    for (let i = 0, n = 0; i < 400 && n < 34; i++) {
      const x = -150 + rnd() * 300, z = -190 + rnd() * 300; if (!ok(x, z, 2.5)) continue; n++;
      const k = 6 + Math.floor(rnd() * 4);
      for (let j = 0; j < k; j++) { const r = 0.35 + rnd() * 0.5; B.sph(x + (rnd() - .5) * 1.8, r * 0.5, z + (rnd() - .5) * 1.8, r * 1.8, r * 1.2, r * 1.8, ['#6a6f3a', '#7d7a45', '#5c6535'][j % 3]); }
    }
  }

  /* ---- 摊位 / 水塔 / 导游亭 ---- */
  const stall = (x, z, color, ry) => {
    const g = new Builder(R);
    g.box(0, 0, 0, 5, 1.5, 2.2, COL.wood); g.cyl(-2.3, 1.5, -0.9, 0.22, 2.2, COL.wood); g.cyl(2.3, 1.5, -0.9, 0.22, 2.2, COL.wood);
    for (let i = 0; i < 6; i++) g.sph(-2.1 + i * 0.84 + 0.42, 3.62 - Math.abs(i - 2.5) * 0.06, -0.2, 0.95, 0.34, 3.2, i % 2 ? COL.white : color);
    [[-1.6, '#ffd24a'], [-0.6, '#a8402c'], [0.4, '#2bb3a3'], [1.4, '#ffd24a']].forEach(p => g.cone(p[0], 1.5, 0, 0.7, 0.62, p[1]));
    const M = M4.compose(x, 0, z, 0, ry, 0, 1, 1, 1); g.arr.forEach(o => { o.m = M4.mul(M, o.m); o.rad = 6; B.arr.push(o); });
    rect(x, z, 5.2, 2.6, 4.2);
  };
  stall(-58, 54, COL.teal, 0); stall(-46, 62, COL.red, Math.PI); stall(-58, 66, COL.yellow, 0.5);
  B.cyl(6, 0, 72, 3.2, 5, COL.blue); B.cone(6, 5, 72, 3.8, 1.8, '#2b4f78'); rect(6, 72, 3.4, 3.4, 6.8);
  B.box(16, 0, -42, 5, 2.4, 3, COL.white); B.box(16, 2.4, -42, 6, 0.3, 4, COL.blue); rect(16, -42, 5, 3, 2.7);
  B.box(-38, 0, 50, 0.3, 3, 0.3, COL.wood); B.box(-38, 3, 50, 4.2, 2.4, 0.3, COL.red);

  /* ---- 跳台（斜坡）：axis 决定沿哪个轴升高；h0/h1 为两端高度 ---- */
  const ramp = (axis, a0, a1, c0, c1, h0, h1) => {
    const r = axis === 'z' ? { axis, x0: c0, x1: c1, z0: a0, z1: a1, h0, h1 } : { axis, x0: a0, x1: a1, z0: c0, z1: c1, h0, h1 };
    W.ramps.push(r);
    const L = a1 - a0, dy = h1 - h0, T = Math.abs(dy) + 0.6, ang = Math.atan2(dy, L), cc = Math.cos(ang);
    const mid = (h0 + h1) / 2 - (T / 2) * cc, am = (a0 + a1) / 2, cm = (c0 + c1) / 2, len = Math.hypot(L, dy), wid = c1 - c0;
    if (axis === 'z') B.add('cube', cm, mid, am, wid, T, len, '#a8402c', 0, -ang, 0);
    else B.add('cube', am, mid, cm, len, T, wid, '#a8402c', 0, 0, ang);
    // 条纹
    for (let i = 1; i < 6; i += 2) {
      const t0 = i / 6, tt = a0 + L * t0, hh = h0 + dy * t0 + 0.02;
      if (axis === 'z') B.add('cube', cm, hh - 0.0, tt, wid * 0.98, 0.08, L / 12 / cc, '#e6dcc4', 0, -ang, 0);
      else B.add('cube', tt, hh, cm, L / 12 / cc, 0.08, wid * 0.98, '#e6dcc4', 0, 0, ang);
    }
    W.mini.push([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, '#a8402c']);
  };
  ramp('z', -6, 16, 28, 40, 4.5, 0);          // R1：向北起飞
  ramp('z', -56, -38, -20, -8, 5, 0);         // R2：金字塔前，向北飞上第一层台阶
  ramp('x', 60, 72, -36, -24, 0, 4.5);        // R3：出口大路，向东起飞
  ramp('z', 28, 44, -46, -34, 4, 0);          // R4：中央广场外侧，向北

  /* ---- 出生点数据 ---- */
  const sp = W.spawn;
  sp.player = { x: 0, z: 100, yaw: 0 };
  sp.vehicles = [
    ['cart', -9, 94, 0], ['cart', 9, 94, 0], ['cart', 96, -40, Math.PI / 2],
    ['sled', 4, -42, 0], ['sled', 34, 30, 0],
    ['camel', 58, 46, 1], ['camel', 52, 56, 2], ['camel', 62, 56, 3], ['camel', 18, 24, 0],
  ];
  sp.pickups = [
    ['selfie', 0, 90], ['horn', -54, 58], ['jetpack', -14, -32], ['banana', 4, 66],
    ['jetpack', 84, -28], ['horn', 56, 40], ['banana', -30, 30], ['selfie', 12, -50],
  ];
  sp.vendors = [{ kind: 'souvenir', x: -52, z: 58, look: { skin: '#c68642', shirt: '#2bb3a3', pants: '#35557a', hat: 'cap', hatCol: '#ffd23f' } },
                { kind: 'camel', x: 48, z: 47, look: { skin: '#8d5524', shirt: '#f0a35a', pants: '#8a5a33', hat: 'turban', hatCol: '#a8402c' } }];
  sp.guards = [[0, 88], [-10, 60], [0, -40], [60, 52], [-50, -28]];
  return W;
}
