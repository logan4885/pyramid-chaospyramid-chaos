'use strict';
/* ============================================================
 * entities.js — 人偶（程序姿态 + Verlet 布娃娃）、NPC、载具、道具
 * 依赖全局：W, G, CFG, K(按键), groundAt, pushOut, BOUNDS, M4, Builder
 * 以及 game.js 里的 chaos / addHeat / popup / shake / Snd
 * ============================================================ */
const clampv = (v, a, b) => v < a ? a : v > b ? b : v;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const addk = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const angDiff = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const pickOne = a => a[Math.random() * a.length | 0];

const RAG_NAMES = ['head', 'chest', 'pelvis', 'shL', 'shR', 'hipL', 'hipR', 'handL', 'handR', 'footL', 'footR'];
const RAG_PAIRS = [['head', 'chest'], ['chest', 'pelvis'], ['chest', 'shL'], ['chest', 'shR'], ['shL', 'shR'], ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'hipR'],
  ['shL', 'handL'], ['shR', 'handR'], ['hipL', 'footL'], ['hipR', 'footR'], ['shL', 'pelvis'], ['shR', 'pelvis'], ['hipL', 'chest'], ['hipR', 'chest'],
  ['shL', 'hipR'], ['shR', 'hipL'], ['shL', 'hipL'], ['shR', 'hipR'], ['head', 'shL'], ['head', 'shR'], ['head', 'pelvis']];
let RAG_REST = null;

const SKINS = ['#e8b98f', '#c68a5e', '#8d5a3b', '#d9a577', '#f0c8a5', '#6b4429'];
const SHIRTS = ['#b04a3a', '#d8c07a', '#5f8a5a', '#4a6f9c', '#c98a3a', '#b55a7a', '#3f8a86', '#e8e0c8', '#7a7a80', '#a3b8c9'];
const PANTS = ['#3b4f6b', '#8a7552', '#2e3347', '#5f4636', '#3a3a3d', '#b8a78a'];
function makeLook(l) {
  return { scale: l.scale || 1, skin: hexToRgb(l.skin || pickOne(SKINS)), shirt: hexToRgb(l.shirt || pickOne(SHIRTS)), pants: hexToRgb(l.pants || pickOne(PANTS)),
    hat: l.hat !== undefined ? l.hat : pickOne(['none', 'cap', 'straw', 'none', 'turban']), hatC: hexToRgb(l.hatCol || pickOne(['#ffd23f', '#e8553d', '#fdf6e3', '#4d96ff'])),
    gag: l.gag !== undefined ? l.gag : (Math.random() < 0.08 ? pickOne(['cone', 'duck', 'ring']) : ''), shoe: hexToRgb('#3b2f2a') };
}

class Human {
  constructor(o) {
    this.kind = o.kind; this.x = o.x; this.y = o.y || 0; this.z = o.z; this.yaw = o.yaw || 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.air = false; this.state = 'walk';
    this.anim = Math.random() * 6; this.moveAmt = 0; this.runAmt = 0; this.rag = null; this.vehicle = null; this.sit = null;
    this.look = makeLook(o.look || {}); this.seed = Math.random() * 10;
    this.target = null; this.waitT = Math.random() * 3; this.fleeT = 0; this.fx = 0; this.fz = 0; this.dizzy = 0; this.wave = !!o.wave;
    this.selfie = false; this.impact = 0; this.sideT = 0; this.sideDir = 1; this.id = Human.n = (Human.n || 0) + 1;
  }
}

/* ---------- 程序姿态 ---------- */
function standPose0(h) {
  const s = h.look.scale, f = [-Math.sin(h.yaw), 0, -Math.cos(h.yaw)], r = [Math.cos(h.yaw), 0, -Math.sin(h.yaw)];
  const t = (typeof G !== 'undefined' ? G.time : 0) + (h.seed || 0);
  const P = {};
  if (h.sit && h.state === 'ride') {
    const q = h.sit, ff = [-Math.sin(q.yaw), 0, -Math.cos(q.yaw)], rr = [Math.cos(q.yaw), 0, -Math.sin(q.yaw)];
    const pel = [q.x, q.y, q.z], chest = [pel[0] + ff[0] * 0.05, pel[1] + 0.65 * s, pel[2] + ff[2] * 0.05];
    P.pelvis = pel; P.chest = chest; P.head = [chest[0], chest[1] + 0.5 * s, chest[2]];
    P.shL = addk(chest, rr, -0.32 * s); P.shR = addk(chest, rr, 0.32 * s); P.hipL = addk(pel, rr, -0.16 * s); P.hipR = addk(pel, rr, 0.16 * s);
    P.footL = addk(addk(P.hipL, ff, 0.55), [0, -0.5, 0], 1); P.footR = addk(addk(P.hipR, ff, 0.55), [0, -0.5, 0], 1);
    const lean = Math.sin(t * 3) * 0.1;
    P.handL = addk(addk(P.shL, ff, 0.55), [0, -0.2 + lean, 0], 1); P.handR = addk(addk(P.shR, ff, 0.55), [0, -0.2 - lean, 0], 1);
    return P;
  }
  const mv = h.moveAmt, ph = h.anim, sw = Math.sin(ph) * mv, c = Math.cos(ph), air = h.air;
  const bounce = air ? 0 : Math.abs(c) * 0.07 * mv * s;
  const pel = [h.x, h.y + 0.95 * s + bounce, h.z];
  const lean = (0.12 + 0.18 * h.runAmt) * mv;
  const wob = h.dizzy > 0 ? Math.sin(t * 12) * 0.12 : 0;
  const chest = [pel[0] + f[0] * lean * s + r[0] * wob, pel[1] + 0.65 * s, pel[2] + f[2] * lean * s + r[2] * wob];
  const head = [chest[0] + f[0] * lean * 0.6 * s + r[0] * wob, chest[1] + 0.5 * s, chest[2] + f[2] * lean * 0.6 * s + r[2] * wob];
  P.pelvis = pel; P.chest = chest; P.head = head;
  P.shL = addk(chest, r, -0.32 * s); P.shR = addk(chest, r, 0.32 * s); P.hipL = addk(pel, r, -0.16 * s); P.hipR = addk(pel, r, 0.16 * s);
  const stride = 0.55 * s * (0.5 + 0.5 * h.runAmt);
  [['L', -1, 1], ['R', 1, -1]].forEach(([n, side, sg]) => {
    const hip = P['hip' + n], sh = P['sh' + n], swing = sw * sg;
    if (air) { P['foot' + n] = [hip[0] + f[0] * side * 0.25, hip[1] - 0.72 * s, hip[2] + f[2] * side * 0.25]; }
    else { const lift = Math.max(0, c * sg) * 0.25 * mv * s; P['foot' + n] = [hip[0] + f[0] * swing * stride, hip[1] - 0.95 * s + lift, hip[2] + f[2] * swing * stride]; }
    if (air) P['hand' + n] = [sh[0] + r[0] * side * 0.45, sh[1] + 0.45 * s + Math.sin(t * 14 + side) * 0.2, sh[2] + r[2] * side * 0.45];
    else P['hand' + n] = [sh[0] - f[0] * swing * stride * 0.9, sh[1] - 0.68 * s, sh[2] - f[2] * swing * stride * 0.9];
  });
  if (h.wave) { const sh = P.shR; P.handR = [sh[0] + r[0] * 0.3, sh[1] + 0.62 * s, sh[2] + r[2] * 0.3]; P.handR[0] += r[0] * Math.sin(t * 8) * 0.22; P.handR[2] += r[2] * Math.sin(t * 8) * 0.22; }
  if (h.selfie) { const sh = P.shR; P.handR = [sh[0] + f[0] * 0.55 + r[0] * 0.15, sh[1] + 0.42 * s, sh[2] + f[2] * 0.55 + r[2] * 0.15]; }
  return P;
}

/** 玩家抓人时，右手所在位置（身体右前方） */
function holdPoint(p) {
  const s = p.look.scale, f = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)], r = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
  return [p.x + f[0] * 0.78 * s + r[0] * 0.5 * s, p.y + 1.5 * s, p.z + f[2] * 0.78 * s + r[2] * 0.5 * s];
}
/** 被抓住的人：被玩家单手提着后领，身体自然下垂、随步伐轻轻摆动 */
function heldPose(h) {
  const Pl = G.player, H = holdPoint(Pl), s = h.look.scale, t = G.time * 5 + (h.seed || 0);
  const yaw = Pl.yaw + 1.57, f = [-Math.sin(yaw), 0, -Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const pf = [-Math.sin(Pl.yaw), 0, -Math.cos(Pl.yaw)], mv = Pl.moveAmt || 0;
  const swing = Math.sin(Pl.anim * 2 + 1) * 0.12 * mv + Math.sin(t) * 0.04;
  const chest = [H[0], H[1] - 0.22 * s, H[2]];
  const pelvis = [chest[0] - pf[0] * swing * 1.4, chest[1] - 0.64 * s, chest[2] - pf[2] * swing * 1.4];
  const head = [chest[0] + pf[0] * swing * 0.5, chest[1] + 0.46 * s, chest[2] + pf[2] * swing * 0.5];
  const P = { pelvis, chest, head };
  P.shL = addk(chest, r, -0.32 * s); P.shR = addk(chest, r, 0.32 * s); P.hipL = addk(pelvis, r, -0.16 * s); P.hipR = addk(pelvis, r, 0.16 * s);
  [['L', -1], ['R', 1]].forEach(([n, sd]) => {
    const hip = P['hip' + n], sh = P['sh' + n], w = Math.sin(t + sd) * 0.1 + swing * sd * 0.6;
    P['foot' + n] = [hip[0] + pf[0] * (w - swing * 2) + r[0] * sd * 0.05, hip[1] - 0.8 * s, hip[2] + pf[2] * (w - swing * 2) + r[2] * sd * 0.05];
    P['hand' + n] = [sh[0] + r[0] * sd * 0.08 - pf[0] * swing, sh[1] - 0.62 * s, sh[2] + r[2] * sd * 0.08 - pf[2] * swing];
    const gy = (typeof W !== 'undefined' && W && W.pyrs) ? groundAt(P['foot' + n][0], P['foot' + n][2], P['foot' + n][1] + 1.5) + 0.08 : -9;
    if (P['foot' + n][1] < gy) P['foot' + n][1] = gy;
  });
  return P;
}
function standPose(h) {
  if (h.state === 'held' && typeof G !== 'undefined' && G.held === h && G.player) return heldPose(h);
  const P = standPose0(h);
  if (!(typeof W !== 'undefined' && W && W.pyrs) || h.state === 'rag') return P;
  if (typeof G !== 'undefined' && G.held && h === G.player) {                       // 抓人姿势：右臂前伸提着，左手自然前摆
    const f = [-Math.sin(h.yaw), 0, -Math.cos(h.yaw)];
    P.handR = holdPoint(h); P.handL = [P.shL[0] + f[0] * 0.32, P.shL[1] - 0.55 * h.look.scale, P.shL[2] + f[2] * 0.32];
  }
  if (!(h.sit && h.state === 'ride')) ['footL', 'footR'].forEach(n => { const g = groundAt(P[n][0], P[n][2], P[n][1] + 1.2) + 0.05; if (P[n][1] < g && g - P[n][1] < 1.6) P[n][1] = g; });   // 斜坡/台阶上脚不陷进地里
  return P;
}

function ensureRest() {
  if (RAG_REST) return;
  const P = standPose({ x: 0, y: 0, z: 0, yaw: 0, look: { scale: 1 }, moveAmt: 0, runAmt: 0, anim: 0, air: false, seed: 0 });
  RAG_REST = RAG_PAIRS.map(p => Math.hypot(P[p[0]][0] - P[p[1]][0], P[p[0]][1] - P[p[1]][1], P[p[0]][2] - P[p[1]][2]));
}

/* ---------- 布娃娃 ---------- */
function startRag(h, vel) {
  ensureRest();
  const d = 1 / 60;
  if (h.state === 'rag') { RAG_NAMES.forEach(n => { for (let i = 0; i < 3; i++) h.rag.q[n][i] -= vel[i] * d; }); return; }
  const P = standPose(h), rag = { p: {}, q: {}, t: 0, rest: 0 };
  RAG_NAMES.forEach(n => {
    const p = P[n].slice(), k = (n === 'head' || n.startsWith('hand')) ? 1.15 : n.startsWith('foot') ? 0.8 : 1;
    rag.p[n] = p; rag.q[n] = [p[0] - vel[0] * d * k, p[1] - vel[1] * d * k, p[2] - vel[2] * d * k];
  });
  rag.q.head[0] += (Math.random() - 0.5) * 0.08; rag.q.head[2] += (Math.random() - 0.5) * 0.08;
  h.rag = rag; h.state = 'rag'; h.selfie = false; h.sit = null; h.vehicle = null; h.impact = 0;
}
function stepRag(h, dt) {
  ensureRest();
  const rag = h.rag, s = h.look.scale, sub = clampv(Math.round(dt * 60), 1, 4), d = dt / sub, g = CFG.gravity;
  for (let k = 0; k < sub; k++) {
    for (let a = 0; a < RAG_NAMES.length; a++) {
      const p = rag.p[RAG_NAMES[a]], q = rag.q[RAG_NAMES[a]];
      for (let i = 0; i < 3; i++) { const v = (p[i] - q[i]) * 0.995; q[i] = p[i]; p[i] += v; }
      p[1] -= g * d * d;
    }
    for (let it = 0; it < 6; it++) {
      for (let c = 0; c < RAG_PAIRS.length; c++) {
        const A = rag.p[RAG_PAIRS[c][0]], B = rag.p[RAG_PAIRS[c][1]];
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) continue;
        const diff = (dist - RAG_REST[c] * s) / dist * 0.5;
        A[0] += dx * diff; A[1] += dy * diff; A[2] += dz * diff; B[0] -= dx * diff; B[1] -= dy * diff; B[2] -= dz * diff;
      }
      for (let a = 0; a < RAG_NAMES.length; a++) {
        const n = RAG_NAMES[a], p = rag.p[n], q = rag.q[n];
        const gy = groundAt(p[0], p[2], p[1]) + 0.14;
        if (p[1] < gy) {
          const vy = p[1] - q[1]; p[1] = gy; q[1] = gy + vy * 0.3;
          q[0] += (p[0] - q[0]) * 0.35; q[2] += (p[2] - q[2]) * 0.35;
          if ((n === 'pelvis' || n === 'chest') && -vy / d > h.impact) h.impact = -vy / d;
        }
        const ox = p[0], oz = p[2], o = pushOut(ox, oz, p[1], 0.2);
        if (o.hit) { const vx = ox - q[0], vz = oz - q[2]; p[0] = o.x; p[2] = o.z; q[0] = o.x - vx * 0.3; q[2] = o.z - vz * 0.3; }
        if (p[0] < BOUNDS.minX) p[0] = BOUNDS.minX; else if (p[0] > BOUNDS.maxX) p[0] = BOUNDS.maxX;
        if (p[2] < BOUNDS.minZ) p[2] = BOUNDS.minZ; else if (p[2] > BOUNDS.maxZ) p[2] = BOUNDS.maxZ;
      }
    }
  }
  const pel = rag.p.pelvis, pq = rag.q.pelvis;
  h.x = pel[0]; h.y = pel[1]; h.z = pel[2]; rag.t += dt;
  const sp = Math.hypot(pel[0] - pq[0], pel[1] - pq[1], pel[2] - pq[2]) / d;
  rag.rest = sp < 1.0 ? rag.rest + dt : 0;
}
const canGetUp = h => h.rag.t > 1.3 && h.rag.rest > 0.6 || h.rag.t > 7;
function recoverHuman(h) {
  h.y = groundAt(h.x, h.z, h.y + 0.8); h.state = 'walk'; h.rag = null; h.sit = null; h.vehicle = null; h.vx = h.vz = h.vy = 0; h.air = false; h.dizzy = 1.6; h.yaw = Math.random() * 6.28; h.impact = 0;
}

/* ---------- 自愈：任何数值变成 NaN/Infinity 都会让角色“只剩影子” ---------- */
const HUMAN_NUM = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'anim', 'moveAmt', 'runAmt', 'dizzy'];
function sanitizeHuman(h, why) {
  let bad = null;
  for (const k of HUMAN_NUM) if (!Number.isFinite(h[k])) { bad = bad || []; bad.push(k); }
  if (h.rag) { for (const n in h.rag.p) { const a = h.rag.p[n], b = h.rag.q[n]; for (let i = 0; i < 3; i++) if (!Number.isFinite(a[i]) || !Number.isFinite(b[i]) || Math.abs(a[i]) > 600) { bad = bad || []; bad.push('rag.' + n); break; } } }
  if (!bad) return false;
  const sp = (typeof W !== 'undefined' && W && W.spawn && W.spawn.player) || { x: 0, z: 100 };
  const safe = h.lastSafe || { x: sp.x, y: 0, z: sp.z };
  for (const k of ['x', 'y', 'z']) if (!Number.isFinite(h[k]) || Math.abs(h[k]) > 600) h[k] = safe[k];
  for (const k of ['vx', 'vy', 'vz', 'moveAmt', 'runAmt', 'dizzy', 'anim']) if (!Number.isFinite(h[k])) h[k] = 0;
  if (!Number.isFinite(h.yaw)) h.yaw = 0;
  h.y = Math.max(h.y, groundAt(h.x, h.z, h.y + 1)); h.rag = null; h.sit = null; h.state = 'walk'; h.air = false;
  if (h.vehicle && h.vehicle.rider === h) h.vehicle.rider = null; h.vehicle = null;
  (window.__heals = window.__heals || []).push({ who: h.kind, bad: bad.join(','), why: why || '', t: typeof G !== 'undefined' && G ? +G.time.toFixed(1) : 0 });
  console.warn('[自愈] 角色数值异常已修复:', bad.join(','), why || '');
  return bad;
}

/* ---------- 步行运动学 ---------- */
function moveHuman(h, dt, wx, wz, accel = 14) {
  const ax = accel * dt;
  h.vx += clampv(wx - h.vx, -ax, ax); h.vz += clampv(wz - h.vz, -ax, ax);
  const o = pushOut(h.x + h.vx * dt, h.z + h.vz * dt, h.y, 0.42);
  if (o.hit) { h.vx *= 0.3; h.vz *= 0.3; }
  h.x = clampv(o.x, BOUNDS.minX, BOUNDS.maxX); h.z = clampv(o.z, BOUNDS.minZ, BOUNDS.maxZ);
  const g = groundAt(h.x, h.z, h.y);
  if (h.air || h.vy > 0 || h.y > g + 0.25) {
    h.air = true; h.vy -= CFG.gravity * dt; h.y += h.vy * dt;
    if (h.y <= g && h.vy <= 0) { h.y = g; h.vy = 0; h.air = false; }
  } else { h.y = g; h.vy = 0; h.air = false; }
  const sp = Math.hypot(h.vx, h.vz);
  if (sp > 0.3) { h.yaw += angDiff(Math.atan2(-h.vx, -h.vz), h.yaw) * Math.min(1, dt * 12); h.anim += dt * (4 + sp * 1.1); }
  h.moveAmt = clampv(sp / 2.5, 0, 1); h.runAmt = clampv((sp - 3) / 4, 0, 1);
  return o.hit;
}

/* ---------- NPC ---------- */
function randomWalkPoint() {
  for (let i = 0; i < 20; i++) {
    const x = BOUNDS.minX + 10 + Math.random() * (BOUNDS.maxX - BOUNDS.minX - 20), z = BOUNDS.minZ + 60 + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ - 70);
    if (inDune(x, z)) continue;
    if (!pushOut(x, z, 0, 1.2).hit) return [x, z];
  }
  return [0, 60];
}
function wander(h, dt, spd) {
  if (h.waitT > 0) { h.waitT -= dt; return [0, 0]; }
  if (!h.target) h.target = randomWalkPoint();
  const dx = h.target[0] - h.x, dz = h.target[1] - h.z, d = Math.hypot(dx, dz);
  if (d < 1.3) { h.target = null; h.waitT = 1 + Math.random() * 5; h.selfie = Math.random() < 0.3; return [0, 0]; }
  h.selfie = false;
  return [dx / d * spd, dz / d * spd];
}
function updateNpc(h, dt) {
  if (h.state === 'rag') { stepRag(h, dt); if (canGetUp(h)) recoverHuman(h); return; }
  if (h.state === 'held' || h.state === 'ride') return;            // 被抓着 / 骑警：由 police.js 驱动
  h.dizzy = Math.max(0, h.dizzy - dt);
  if (h.jet && h.state === 'walk') { updateJetCop(h, dt); return; }
  const P = G.player; let wx = 0, wz = 0, acc = 14;
  if (h.kind === 'merchant') {
    const dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz);
    h.wave = d < 18; if (d < 18) h.yaw += angDiff(Math.atan2(-dx, -dz), h.yaw) * Math.min(1, dt * 5);
    moveHuman(h, dt, 0, 0); h.moveAmt = 0; return;
  }
  if (h.fleeT > 0) {
    h.fleeT -= dt; const dx = h.x - h.fx, dz = h.z - h.fz, d = Math.hypot(dx, dz) || 1; wx = dx / d * 5.6; wz = dz / d * 5.6; h.selfie = false; acc = 22;
  } else if (h.kind === 'guard' && G.heat >= 1 && P.state !== 'dead') {
    const dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz) || 1, sp = 4.6 + 0.35 * Math.floor(G.heat);
    let ax = dx / d, az = dz / d;
    if (h.sideT > 0) { h.sideT -= dt; const t = ax; ax = -az * h.sideDir * 0.9 + ax * 0.3; az = t * h.sideDir * 0.9 + az * 0.3; }
    wx = ax * sp; wz = az * sp; acc = 20; h.selfie = false;
  } else { const w = wander(h, dt, h.kind === 'guard' ? 1.4 : 1.7); wx = w[0]; wz = w[1]; }
  // 人与人互相挤开，避免重叠成一坨
  for (const o of G.humans) { if (o === h || o.state !== 'walk' || o.jet) continue; const sx = h.x - o.x, sz = h.z - o.z, sd = Math.hypot(sx, sz); if (sd < 0.9 && sd > 0.001) { wx += sx / sd * 2.2; wz += sz / sd * 2.2; } }
  const hit = moveHuman(h, dt, wx, wz, acc);
  // 卡住检测：想走却 1.5s 没动 → 换目标
  h.stkT = (h.stkT || 0); h.stkX = h.stkX === undefined ? h.x : h.stkX; h.stkZ = h.stkZ === undefined ? h.z : h.stkZ;
  if ((wx || wz) && h.fleeT <= 0) { h.stkT += dt; if (Math.hypot(h.x - h.stkX, h.z - h.stkZ) > 0.6) { h.stkT = 0; h.stkX = h.x; h.stkZ = h.z; } else if (h.stkT > 1.5) { h.target = null; h.waitT = 0; h.stkT = 0; if (h.kind === 'guard') { h.sideT = 1; h.sideDir = -(h.sideDir || 1); } } } else { h.stkT = 0; h.stkX = h.x; h.stkZ = h.z; }
  if (hit && h.kind === 'guard' && G.heat >= 1 && h.sideT <= 0) { h.sideT = 0.7; h.sideDir = Math.random() < 0.5 ? 1 : -1; }
}

/* ---------- 绘制 ---------- */
function drawHuman(h, out, far) {
  if (h.state === 'rag' && !h.rag) sanitizeHuman(h, 'ragNull');
  let P = h.state === 'rag' ? h.rag.p : standPose(h);
  if (!Number.isFinite(P.pelvis[0] + P.pelvis[1] + P.pelvis[2] + P.chest[0] + P.chest[1] + P.chest[2] + P.head[1] + P.footL[1] + P.footR[1] + P.handL[1] + P.handR[1])) {
    sanitizeHuman(h, 'pose'); if (!Number.isFinite(h.yaw)) h.yaw = 0;
    P = h.state === 'rag' ? h.rag.p : standPose(h);
  }
  const L = h.look, s = L.scale;
  const up = nrm3(sub3(P.head, P.chest)), right = nrm3(sub3(P.shR, P.shL)), fwd = cross3(up, right);
  const push = (mesh, m, col) => out.push({ mesh, m, col, rad: 3 });
  const R = renderer.m, hd = P.head;
  const bas = (p, sx, sy, sz) => new Float32Array([right[0]*sx, right[1]*sx, right[2]*sx, 0, up[0]*sy, up[1]*sy, up[2]*sy, 0, -fwd[0]*sz, -fwd[1]*sz, -fwd[2]*sz, 0, p[0], p[1], p[2], 1]);   // 随身体朝向的椭球
  const ball = (p, d, col) => push(R.sph, M4.compose(p[0], p[1], p[2], 0, 0, 0, d, d, d), col);
  const tube = (a, b, d, col) => { push(R.cyl, M4.seg(a, b, d, d), col); ball(a, d, col); ball(b, d, col); };       // 两端带圆头的胶囊
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const skin2 = [L.skin[0] * 0.9, L.skin[1] * 0.84, L.skin[2] * 0.8];
  // 躯干：骨盆 + 腰 + 胸腔（椭球）+ 颈
  push(R.sph, bas(P.pelvis, 0.50 * s, 0.38 * s, 0.34 * s), L.pants);
  push(R.cyl, M4.seg(P.pelvis, P.chest, 0.50 * s, 0.34 * s), L.shirt);
  push(R.sph, bas(lerp3(P.pelvis, P.chest, 0.78), 0.60 * s, 0.56 * s, 0.38 * s), L.shirt);
  if (far) { push(R.sph, bas(hd, 0.48 * s, 0.56 * s, 0.51 * s), L.skin); tube(P.hipL, P.footL, 0.3 * s, L.pants); tube(P.hipR, P.footR, 0.3 * s, L.pants); return; }
  const k = 0.8;                                                                    // 头部整体缩小，比例更接近真人
  push(R.cyl, M4.seg(lerp3(P.chest, hd, 0.15), lerp3(P.chest, hd, 0.7), 0.2 * s * k, 0.2 * s * k), skin2);
  push(R.sph, bas(hd, 0.6 * s * k, 0.7 * s * k, 0.64 * s * k), L.skin);
  push(R.sph, bas(addk(addk(hd, up, -0.2 * s * k), fwd, 0.04 * s * k), 0.46 * s * k, 0.34 * s * k, 0.5 * s * k), L.skin);               // 下颌
  const hairC = L.hairC || (L.hairC = [[0.1, 0.07, 0.05], [0.25, 0.15, 0.08], [0.05, 0.05, 0.06], [0.45, 0.3, 0.14], [0.35, 0.35, 0.37]][Math.floor(((L.skin[0] * 97 + L.shirt[1] * 53 + L.pants[2] * 31) % 1) * 5) % 5]);
  if (!L.hat) { push(R.sph, bas(addk(addk(hd, up, 0.13 * s * k), fwd, -0.07 * s * k), 0.64 * s * k, 0.58 * s * k, 0.66 * s * k), hairC); }
  push(R.sph, bas(addk(hd, fwd, 0.31 * s * k), 0.11 * s * k, 0.14 * s * k, 0.14 * s * k), skin2);                                    // 鼻子
  [-1, 1].forEach(sd => {
    const e = addk(addk(addk(hd, fwd, 0.26 * s * k), right, 0.15 * s * k * sd), up, 0.07 * s * k);
    push(R.sph, bas(e, 0.15 * s * k, 0.11 * s * k, 0.07 * s * k), [0.95, 0.94, 0.9]);
    push(R.sph, bas(addk(e, fwd, 0.03 * s * k), 0.075 * s * k, 0.085 * s * k, 0.05 * s * k), [0.06, 0.04, 0.03]);
    push(R.sph, bas(addk(addk(hd, right, 0.3 * s * k * sd), up, -0.02 * s * k), 0.07 * s * k, 0.14 * s * k, 0.1 * s * k), skin2);         // 耳朵
    push(R.sph, bas(addk(addk(addk(hd, fwd, 0.27 * s * k), right, 0.14 * s * k * sd), up, 0.17 * s * k), 0.17 * s * k, 0.04 * s * k, 0.07 * s * k), hairC);   // 眉毛
  });
  push(R.sph, bas(addk(addk(hd, fwd, 0.29 * s * k), up, -0.15 * s * k), 0.17 * s * k, 0.045 * s * k, 0.05 * s * k), [0.55, 0.25, 0.2]);   // 嘴
  if (L.hat === 'cap') { push(R.sph, bas(addk(hd, up, 0.12 * s * k), 0.7 * s * k, 0.56 * s * k, 0.72 * s * k), L.hatC); push(R.sph, bas(addk(addk(hd, up, 0.14 * s * k), fwd, 0.34 * s * k), 0.5 * s * k, 0.07 * s * k, 0.4 * s * k), L.hatC); }
  else if (L.hat === 'straw') { push(R.sph, bas(addk(hd, up, 0.3 * s * k), 1.3 * s * k, 0.1 * s * k, 1.3 * s * k), [0.9, 0.76, 0.42]); push(R.sph, bas(addk(hd, up, 0.42 * s * k), 0.62 * s * k, 0.46 * s * k, 0.62 * s * k), [0.88, 0.72, 0.38]); push(R.cyl, M4.seg(addk(hd, up, 0.32 * s * k), addk(hd, up, 0.4 * s * k), 0.64 * s * k, 0.64 * s * k), [0.78, 0.2, 0.18]); }
  else if (L.hat === 'turban') { push(R.sph, bas(addk(hd, up, 0.2 * s * k), 0.8 * s * k, 0.56 * s * k, 0.82 * s * k), L.hatC); push(R.sph, bas(addk(hd, up, 0.42 * s * k), 0.55 * s * k, 0.4 * s * k, 0.55 * s * k), L.hatC); }
  if (L.gag === 'cone') { push(R.cone, M4.seg(addk(hd, up, 0.3 * s), addk(hd, up, 1.0 * s), 0.5 * s, 0.5 * s, true), [1, 0.45, 0.1]); }
  else if (L.gag === 'duck') { const c = addk(hd, up, 0.55 * s); push(R.sph, M4.compose(c[0], c[1], c[2], 0, 0, 0, 0.45 * s, 0.4 * s, 0.45 * s), [1, 0.9, 0.2]); const b = addk(c, fwd, 0.25 * s); push(R.cube, M4.compose(b[0], b[1] - 0.03, b[2], 0, h.yaw, 0, 0.14 * s, 0.07 * s, 0.2 * s), [1, 0.5, 0.1]); }
  else if (L.gag === 'ring') push(R.cyl, M4.seg(addk(P.pelvis, up, 0.15 * s), addk(P.pelvis, up, 0.3 * s), 1.15 * s, 1.15 * s), [1, 0.4, 0.7]);
  ['L', 'R'].forEach(n => {
    const sh = P['sh' + n], hp = P['hand' + n], mid = lerp3(sh, hp, 0.5);
    ball(sh, 0.3 * s, L.shirt); tube(sh, mid, 0.22 * s, L.shirt); tube(mid, lerp3(mid, hp, 0.8), 0.19 * s, L.skin);
    push(R.sph, bas(hp, 0.17 * s, 0.22 * s, 0.14 * s), L.skin);
    const hi = P['hip' + n], fp = P['foot' + n], kn = lerp3(hi, fp, 0.5);
    ball(hi, 0.3 * s, L.pants); tube(hi, kn, 0.28 * s, L.pants); tube(kn, lerp3(kn, fp, 0.86), 0.23 * s, L.pants);
    push(R.sph, M4.compose(fp[0], fp[1] - 0.02, fp[2], 0, h.state === 'rag' ? 0 : h.yaw, 0, 0.3 * s, 0.2 * s, 0.44 * s), L.shoe);
  });
}

/* ---------- 载具 ---------- */
const VEH = {
  camel: { accel: 15, max: 12, turn: 2.1, r: 1.7, seat: [-0.1, 3.35, 0], boost: 1.35, name: '骆驼' },
  cart:  { accel: 20, max: 21, turn: 1.9, r: 1.9, seat: [-0.4, 1.35, 0], boost: 1.3, name: '观光车' },
  sled:  { accel: 26, max: 26, turn: 1.6, r: 1.5, seat: [0.2, 1.4, 0], boost: 1.6, name: '火箭行李车' },
};
function buildVehicleModel(kind) {
  const b = new Builder(renderer, true), part = (mesh, f, col) => b.arr.push({ mesh: renderer.m[mesh], m: M4.I(), f, col: hexToRgb(col), rad: 6 });
  if (kind === 'camel') {
    const c = '#b8895a', c2 = '#a3764a', c3 = '#cfa878';
    b.sph(0, 2.3, 0, 4.1, 1.9, 1.7, c); b.sph(-1.5, 2.25, 0, 1.8, 1.9, 1.65, c); b.sph(1.3, 2.35, 0, 1.7, 1.95, 1.5, c);       // 躯干/臀/胸
    b.sph(-0.35, 3.4, 0, 1.15, 1.25, 1.0, c2); b.sph(0.85, 3.2, 0, 0.9, 0.95, 0.9, c2);                                       // 双驼峰
    b.tube([1.55, 2.9, 0], [2.3, 3.75, 0], 0.7, c); b.sph(1.55, 2.9, 0, 0.7, 0.7, 0.7, c); b.sph(2.3, 3.75, 0, 0.7, 0.7, 0.7, c);
    b.tube([2.3, 3.75, 0], [2.85, 4.35, 0], 0.52, c); b.sph(2.85, 4.35, 0, 0.52, 0.52, 0.52, c);
    b.sph(3.15, 4.45, 0, 1.15, 0.78, 0.72, c); b.sph(3.75, 4.27, 0, 0.82, 0.52, 0.56, c3); b.sph(4.12, 4.3, 0.12, 0.12, 0.1, 0.1, '#5a3d20'); b.sph(4.12, 4.3, -0.12, 0.12, 0.1, 0.1, '#5a3d20');
    [0.3, -0.3].forEach(z => { b.sph(3.25, 4.62, z * 1.05, 0.2, 0.2, 0.15, '#f4efe6'); b.sph(3.3, 4.62, z * 1.1, 0.1, 0.12, 0.08, '#151010'); b.add('cone', 2.85, 4.75, z * 0.95, 0.22, 0.42, 0.22, c2, 0, 0, z > 0 ? -0.4 : 0.4); });
    b.tube([-2.2, 2.8, 0], [-2.5, 1.9, 0], 0.16, c2); b.sph(-2.5, 1.75, 0, 0.32, 0.42, 0.32, '#4a3220');
    b.add('cube', 0.1, 2.98, 0, 2.2, 0.16, 1.9, '#8f3a2c'); b.add('cube', 0.1, 2.9, 0, 2.3, 0.1, 1.9, '#c9a24a');         // 鞍毯
    const leg = l => {
      const sw = v => M4.mul(M4.T(l[0], 1.75, l[1]), M4.RZ(Math.sin(v.ph + l[2]) * 0.55 * Math.min(1, Math.abs(v.sp) / 6)));
      part('sph', v => M4.mul(sw(v), M4.compose(0, 0, 0, 0, 0, 0, 0.78, 0.9, 0.7)), c);
      part('cyl', v => M4.mul(sw(v), M4.mul(M4.T(0, -0.85, 0), M4.S(0.38, 1.7, 0.38))), c2);
      part('sph', v => M4.mul(sw(v), M4.compose(0, -0.95, 0, 0, 0, 0, 0.5, 0.5, 0.5)), c2);
      part('sph', v => M4.mul(sw(v), M4.compose(0.05, -1.72, 0, 0, 0, 0, 0.62, 0.34, 0.5)), '#4a3220');
    };
    [[-1.4, 0.55, 0], [-1.4, -0.55, 3.1], [1.4, 0.55, 3.1], [1.4, -0.55, 0]].forEach(leg);
  } else if (kind === 'cart') {
    b.box(0, 0.35, 0, 4.2, 0.8, 2.1, '#e6e0d2'); b.box(1.5, 0.35, 0, 1.4, 1.0, 2.0, '#8f3a2c'); b.box(-1.1, 1.15, 0, 0.3, 1.2, 1.9, '#35607f');
    [[-1.6, -1.2], [-1.6, 1.2], [1.6, -1.2], [1.6, 1.2]].forEach(p => { b.cyl(p[0], 0.1, p[1] * 0.85, 0.14, 3.0, '#444'); b.add('cyl', p[0], 0.5, p[1] * 1.0, 1.1, 0.35, 1.1, '#222', 0, Math.PI / 2, 0); });
    for (let i = 0; i < 6; i++) b.sph(-1.9 + i * 0.76 + 0.38, 3.18 - Math.abs(i - 2.5) * 0.07, 0, 0.86, 0.3, 2.7, i % 2 ? '#ece4d0' : '#c9b07c');
    b.sph(2.15, 0.7, -0.6, 0.35, 0.35, 0.35, '#fff7a0'); b.sph(2.15, 0.7, 0.6, 0.35, 0.35, 0.35, '#fff7a0');
    b.sph(-0.2, 3.5, 0, 0.9, 0.8, 0.9, '#d8b23a'); b.box(0.3, 3.45, 0, 0.35, 0.15, 0.3, '#c98a2a');       // 屋顶橡皮鸭
  } else {
    b.box(0, 0.5, 0, 3.4, 1.4, 1.8, '#9d3328'); b.box(0, 0.5, 0, 3.5, 0.2, 1.9, '#ece4d0'); b.box(0, 1.9, 0, 1.2, 0.2, 0.2, '#555');
    [[-1.2, 0.95], [-1.2, -0.95], [1.2, 0.95], [1.2, -0.95]].forEach(p => b.add('cyl', p[0], 0.28, p[1], 0.56, 0.3, 0.56, '#222', 0, Math.PI / 2, 0));
    [-0.5, 0.5].forEach(z => { b.add('cyl', -2.1, 1.0, z, 0.55, 1.5, 0.55, '#bbb', 0, 0, Math.PI / 2); b.add('cone', -2.9, 1.0, z, 0.5, 0.55, 0.5, '#8f3a2c', 0, 0, Math.PI / 2); });
    [-0.5, 0.5].forEach(z => b.arr.push({ mesh: renderer.m.cone, m: M4.I(), f: v => v.flame ? M4.compose(-3.2, 1.0, z, 0, 0, Math.PI / 2, 0.5, 2.2 + Math.random() * 1.2, 0.5) : M4.S(0, 0, 0), col: [1, 0.65, 0.1], unlit: true, rad: 6 }));
  }
  return b.arr;
}
class Vehicle {
  constructor(kind, x, z, h) {
    this.kind = kind; this.x = x; this.z = z; this.h = h; this.y = 0; this.sp = 0; this.vy = 0; this.air = false; this.airT = 0; this.lastVy = 0;
    this.rider = null; this.ph = 0; this.fuel = 100; this.flame = false; this.ai = null; this.hopCd = 0; this.parts = buildVehicleModel(kind); this.id = Vehicle.n = (Vehicle.n || 0) + 1; this.rented = false;
  }
  seatPos() {
    const T = VEH[this.kind], f = [-Math.sin(this.h), 0, -Math.cos(this.h)], r = [Math.cos(this.h), 0, -Math.sin(this.h)];
    return { x: this.x + f[0] * T.seat[0] + r[0] * T.seat[2], y: this.y + T.seat[1], z: this.z + f[2] * T.seat[0] + r[2] * T.seat[2], yaw: this.h };
  }
}
function ejectRider(v, vel) {
  const p = v.rider; if (!p) return;
  v.rider = null; p.vehicle = null; p.sit = null;
  p.x = v.x; p.z = v.z; p.y = v.y + 1.5; startRag(p, vel);
}
function updateVehicle(v, dt) {
  const T = VEH[v.kind], P = G.player, ridden = v.rider === P && P.state === 'ride';
  let thr = 0, steer = 0, boost = false, brake = false, jump = false;
  if (ridden) { thr = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0); steer = (K.KeyA ? 1 : 0) - (K.KeyD ? 1 : 0); boost = !!(K.ShiftLeft || K.ShiftRight); brake = !!K.Space; jump = !!K.Space; }
  else if (v.ai === 'stampede' || v.ai === 'cop') {
    const dx = P.x - v.x, dz = P.z - v.z, want = Math.atan2(-dx, -dz), diff = angDiff(want, v.h);
    thr = 1; steer = clampv(diff * 3, -1, 1); boost = Math.hypot(dx, dz) > 30;
  }
  let boosting = false;
  if (v.kind === 'sled') { if (boost && v.fuel > 0 && thr >= 0) { boosting = true; v.fuel -= 38 * dt; } else v.fuel = Math.min(100, v.fuel + 14 * dt); }
  else boosting = boost && thr > 0;
  v.flame = v.kind === 'sled' && boosting;
  const maxSp = T.max * (boosting ? T.boost : 1) * (v.ai === 'stampede' || v.ai === 'cop' ? 0.95 : 1);
  v.hopCd -= dt;
  if (!v.air) {
    if (thr) v.sp += thr * T.accel * (boosting ? 1.6 : 1) * dt * (thr * v.sp < 0 ? 2.5 : 1);
    else v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), (ridden ? 4 : 7) * dt);
    if (brake && v.kind !== 'camel') v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), 24 * dt);
    if (v.kind === 'camel' && jump && v.hopCd <= 0) { v.vy = 9.5; v.air = true; v.hopCd = 0.8; Snd.boing(); }
    if (v.sp > maxSp) v.sp -= Math.min(v.sp - maxSp, 20 * dt);
    v.sp = clampv(v.sp, -maxSp * 0.4, maxSp * 1.05);
    v.h += steer * T.turn * dt * clampv(v.sp / 5, -1, 1);
  } else v.h += steer * T.turn * 0.35 * dt;
  v.ph += v.sp * dt * 1.6;
  if (v.kind === 'sled' && boosting && v.air) v.vy += 10 * dt;
  const f = [-Math.sin(v.h), 0, -Math.cos(v.h)];
  const o = pushOut(v.x + f[0] * v.sp * dt, v.z + f[2] * v.sp * dt, v.y, T.r);
  if (o.hit) {
    const imp = Math.abs(v.sp);
    if (imp > 6) { shake(Math.min(1, imp / 25)); Snd.crash(); if (ridden) chaos(10 + imp, '撞墙'); }
    if (imp > 13 && v.rider) ejectRider(v, [f[0] * imp * 0.9, 6 + imp * 0.2, f[2] * imp * 0.9]);
    v.sp = -v.sp * 0.25;
  }
  v.x = clampv(o.x, BOUNDS.minX, BOUNDS.maxX); v.z = clampv(o.z, BOUNDS.minZ, BOUNDS.maxZ);
  const g = groundAt(v.x, v.z, v.y);
  if (v.air || v.vy > 0) {
    v.vy -= CFG.gravity * dt; v.y += v.vy * dt; v.airT += dt;
    if (v.y <= g && v.vy <= 0) {
      const hard = -v.vy; v.y = g; v.vy = 0; v.air = false;
      if (v.airT > 0.6) { shake(Math.min(1, hard / 25)); Snd.crash(); }
      if (ridden && v.airT >= 2.5) challengeDone('airtime');
      if (ridden && v.airT > 1.2) chaos(Math.round(v.airT * 40), '腾空 ' + v.airT.toFixed(1) + 's');
      if (hard > 21 && v.rider) ejectRider(v, [f[0] * v.sp, 5, f[2] * v.sp]);
      v.airT = 0;
    }
  } else if (g < v.y - 0.3) { v.air = true; v.vy = Math.max(v.lastVy, 0); v.airT = 0; }
  else { v.lastVy = (g - v.y) / Math.max(dt, 1e-4); v.y = g; }
  // 撞人 / 撞道具
  if (Math.abs(v.sp) > 3.2) {
    for (const h of G.humans) {
      if (h.state !== 'walk') continue;
      const dx = h.x - v.x, dz = h.z - v.z; if (dx * dx + dz * dz > (T.r + 0.5) * (T.r + 0.5) || Math.abs(h.y - v.y) > 3) continue;
      const side = Math.random() - 0.5, sg = Math.sign(v.sp);
      hitHuman(h, [f[0] * v.sp * 1.15 + side * 4, 4 + Math.abs(v.sp) * 0.25, f[2] * v.sp * 1.15 + side * 4], ridden, v.ai === 'stampede');
      if (!ridden) v.sp *= 0.85;
    }
    if (v.ai === 'stampede' && P.state === 'walk' && Math.hypot(P.x - v.x, P.z - v.z) < T.r + 0.6) { startRag(P, [f[0] * v.sp * 1.2, 7, f[2] * v.sp * 1.2]); popup('骆驼大军路过，游客成为地毯', 'bad'); Snd.boing(); }
    for (const p of G.props) if (p.state !== 'fly' && Math.hypot(p.x - v.x, p.z - v.z) < T.r + 0.7) launchProp(p, [f[0] * v.sp * 1.1 + (Math.random() - 0.5) * 4, 5 + Math.random() * 4, f[2] * v.sp * 1.1 + (Math.random() - 0.5) * 4], ridden);
  }
  if (v.rider === P && P.state === 'ride') { const sp = v.seatPos(); P.sit = sp; P.x = sp.x; P.y = sp.y; P.z = sp.z; P.yaw = v.h; }
}
function hitHuman(h, vel, byPlayer, stampede) {
  startRag(h, vel);
  if (byPlayer) {
    chaos(50, pickOne(HUMOR.hit)); G.bowl.push(G.time);
    G.bowl = G.bowl.filter(t => G.time - t < 4); if (G.bowl.length >= 5) challengeDone('bowling');
    if (h.kind === 'guard') addHeat(0.5); else if (h.kind === 'merchant') addHeat(0.7); else addHeat(0.22);
  } else if (stampede) chaos(15, '骆驼无差别路过');
  Snd.boing();
}

function drawVehicle(v, out) {
  let py = v.y, pitch = 0;
  if (!v.air) {                                                                    // 车身随坡度俯仰，轮子贴地不穿模
    const L = VEH[v.kind].r * 0.9, fx = -Math.sin(v.h) * L, fz = -Math.cos(v.h) * L;
    const ya = groundAt(v.x + fx, v.z + fz, v.y + 1.2), yb = groundAt(v.x - fx, v.z - fz, v.y + 1.2);
    pitch = clampv(Math.atan2(ya - yb, 2 * L), -0.8, 0.8); py = Math.max(v.y, (ya + yb) / 2);
  }
  const G0 = M4.compose(v.x, py, v.z, 0, v.h + Math.PI / 2, pitch, 1, 1, 1);
  for (const p of v.parts) out.push({ mesh: p.mesh, m: M4.mul(G0, p.f ? p.f(v) : p.m), col: p.col, unlit: p.unlit, rad: 6 });
}

/* ---------- 道具实体 ---------- */
class Prop {
  constructor(type, x, z) { this.type = type; this.x = x; this.y = 0; this.z = z; this.vx = this.vy = this.vz = 0; this.rot = Math.random() * 6; this.spin = 0; this.state = 'rest'; this.bounces = 0; }
}
function launchProp(p, vel, byPlayer) {
  p.state = 'fly'; p.vx = vel[0]; p.vy = vel[1]; p.vz = vel[2]; p.spin = (Math.random() - 0.5) * 14; p.bounces = 0;
  if (byPlayer) { chaos(15, p.type === 'pot' ? '花瓶：我的一生' : p.type === 'melon' ? '西瓜 vs 物理' : '木箱升空'); addHeat(0.05); Snd.pop(); }
}
function updateProp(p, dt) {
  if (p.state !== 'fly') return;
  p.vy -= CFG.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
  const o = pushOut(p.x, p.z, p.y, 0.5); if (o.hit) { p.x = o.x; p.z = o.z; p.vx *= -0.3; p.vz *= -0.3; }
  const g = groundAt(p.x, p.z, p.y);
  if (p.y <= g) { p.y = g; p.bounces++; p.vy = -p.vy * 0.45; p.vx *= 0.7; p.vz *= 0.7; p.spin *= 0.6; if (p.bounces > 2 || Math.abs(p.vy) < 1.2) { p.state = 'rest'; p.vx = p.vy = p.vz = 0; p.spin = 0; } }
}
function drawProp(p, out) {
  const R = renderer.m;
  if (p.type === 'crate') out.push({ mesh: renderer.rbox(0.9, 0.9, 0.9, 0.1), m: M4.compose(p.x, p.y + 0.45, p.z, p.rot * 0.3, p.rot, 0, 1, 1, 1), col: [0.62, 0.42, 0.22], mat: 4, rad: 2 });
  else if (p.type === 'pot') { out.push({ mesh: R.sph, m: M4.compose(p.x, p.y + 0.5, p.z, 0, p.rot, 0, 0.8, 1.0, 0.8), col: [0.85, 0.42, 0.25], rad: 2 }); out.push({ mesh: R.cyl, m: M4.compose(p.x, p.y + 1.0, p.z, 0, p.rot, 0, 0.45, 0.2, 0.45), col: [0.75, 0.35, 0.2], rad: 2 }); }
  else out.push({ mesh: R.sph, m: M4.compose(p.x, p.y + 0.45, p.z, p.rot, 0, 0, 0.9, 0.85, 0.9), col: [0.25, 0.65, 0.3], rad: 2 });
}
