/* =====================================================================
 * police.js —— 抓人投掷 + 五级通缉升级
 *   ★1 保安步行   ★2 骑骆驼   ★3 喷气背包   ★4 轰炸机   ★5 核弹
 * 依赖全局：G, W, CFG, K, Snd, renderer, M4, Human, Vehicle, VEH, startRag, hitHuman, ejectRider,
 *           groundAt, pushOut, BOUNDS, clampv, popup, chaos, addHeat, shake, narrate, challengeDone, hurt, die, newGuard, launchProp
 * ===================================================================== */

const NUKE_R = 62, NUKE_T = 9;
const COP_LOOK = { shirt: '#24324f', pants: '#1b1f2e', hat: 'cap', hatCol: '#fdf6e3', gag: '', scale: 1.08 };

function policeInit() {
  Object.assign(G, { held: null, gReq: false, bombs: [], fx: [], scorch: [], plane: null, planeAt: null, nuke: null, nukeAt: null, tierMsg: {}, mushroom: null });
}
function policeReset() {            // 复活 / 通缉清零
  if (G.held) { G.held.state = 'walk'; G.held = null; }
  if ((typeof FX !== 'undefined')) FX.reset(); G.bombs = []; G.fx = []; G.plane = null; G.planeAt = null; G.nuke = null; G.nukeAt = null; G.mushroom = null;
  const b = document.getElementById('nukeBanner'); if (b) b.classList.add('hidden');
}

/* ---------------- 抓起 / 投掷 ---------------- */
function nearestGrab() {
  const P = G.player; if (P.state !== 'walk' || G.held) return null;
  let best = null, bd = 2.8;
  for (const h of G.humans) {
    if (h.state !== 'walk' || Math.abs(h.y - P.y) > 2.2) continue;
    const d = Math.hypot(h.x - P.x, h.z - P.z); if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function grabOrThrow() {
  if (G.overlay) return;
  if (G.held) return throwHeld();
  const P = G.player; if (P.state !== 'walk') return;
  const h = nearestGrab(); if (!h) { popup('附近没有能抓的人（贴近一点）'); return; }
  h.state = 'held'; h.jet = false; h.target = null; h.selfie = false; h.wave = false; h.fleeT = 0; h.air = true; h.vx = h.vz = h.vy = 0; h.moveAmt = 0; h.runAmt = 0;
  G.held = h; chaos(25, h.kind === 'guard' ? '把保安举过头顶' : '一把薅起'); Snd.boing();
  addHeat(h.kind === 'guard' ? 0.35 : h.kind === 'merchant' ? 0.5 : 0.12);
}
function dropHeld() { const h = G.held; G.held = null; if (!h) return; h.state = 'walk'; h.air = false; startRag(h, [0, 2, 0]); }
/** 投掷初速度：方向取镜头朝向，俯仰决定抛射角 */
function throwVel() {
  const C = G.cam, f = [-Math.sin(C.yaw), 0, -Math.cos(C.yaw)], up = clampv(C.pitch, -0.3, 0.6), hs = 27, vy = 12 + up * 12;
  return [f[0] * hs, vy, f[2] * hs];
}
function throwHeld() {
  const h = G.held, P = G.player; if (!h) return;
  const H = holdPoint(P), v = throwVel();
  G.held = null; h.state = 'walk'; h.air = false;
  h.x = H[0]; h.z = H[2]; h.y = H[1] - 1.25;
  startRag(h, v);
  h.thrown = { x: h.x, z: h.z, t: G.time };
  P.yaw = Math.atan2(-v[0], -v[2]);
  chaos(60, '投掷：人形铅球'); shake(0.25); Snd.boing(); Snd.crash();
}
function updateHeld(dt) {
  const h = G.held, P = G.player; if (!h) return;
  if (P.state !== 'walk' || G.overlay || h.state !== 'held') { dropHeld(); return; }
  const H = holdPoint(P);
  h.x = H[0]; h.z = H[2]; h.y = H[1] - 1.55 * (h.look.scale || 1); h.yaw = P.yaw + 1.57; h.air = true; h.moveAmt = 0;
}
/** 投掷预览：弹道点列（与布娃娃同一套重力/阻力），落点 */
function throwPreview() {
  const P = G.player, H = holdPoint(P), v = throwVel(), pts = [];
  let x = H[0], y = H[1] - 0.3, z = H[2], vx = v[0] / 60, vy = v[1] / 60, vz = v[2] / 60, land = null;
  for (let i = 0; i < 360; i++) {
    vx *= 0.995; vy *= 0.995; vz *= 0.995; x += vx; y += vy; z += vz; vy -= CFG.gravity / 3600;
    if (i % 5 === 4) pts.push([x, y, z]);
    const gy = groundAt(x, z, y + 0.5) + 0.14;
    if (y < gy || x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) { land = [x, Math.max(gy, 0) , z]; break; }
  }
  if (!land) land = [x, groundAt(x, z, 99), z];
  return { pts, land, dir: [vx, vz] };
}

/** 被投出去的人：飞行中撞倒路人（保龄球），落地后按距离结算 */
function updateThrown(dt) {
  const P = G.player;
  for (const h of G.humans) {
    if (!h.thrown || h.state !== 'rag') { if (h.thrown && h.state !== 'rag') h.thrown = null; continue; }
    const rag = h.rag, pel = rag.p.pelvis, spd = Math.hypot(pel[0] - rag.q.pelvis[0], pel[1] - rag.q.pelvis[1], pel[2] - rag.q.pelvis[2]) / dt;
    if (rag.t < 2.6 && spd > 7) for (const o of G.humans) {
      if (o === h || o.state !== 'walk' || Math.abs(o.y - pel[1]) > 2.6) continue;
      if ((o.x - pel[0]) ** 2 + (o.z - pel[2]) ** 2 < 1.5) { const dx = o.x - pel[0], dz = o.z - pel[2], d = Math.hypot(dx, dz) || 1; hitHuman(o, [dx / d * 8 + (pel[0] - rag.q.pelvis[0]) * 20, 6, dz / d * 8 + (pel[2] - rag.q.pelvis[2]) * 20], true); }
    }
    if ((rag.rest > 0.35 && rag.t > 0.8) || rag.t > 6) {
      const d = Math.hypot(h.x - h.thrown.x, h.z - h.thrown.z); h.thrown = null;
      if (d > 6) chaos(Math.round(d * 4), `投掷 ${d.toFixed(0)} 米`);
      if (d >= 25) challengeDone('throwFar');
    }
  }
}

/* ---------------- ★2 骑警（骆驼） ---------------- */
function spawnCopCamel() {
  const P = G.player, a = Math.random() * 6.28, d = 55 + Math.random() * 15;
  const x = clampv(P.x + Math.cos(a) * d, BOUNDS.minX + 5, BOUNDS.maxX - 5), z = clampv(P.z + Math.sin(a) * d, BOUNDS.minZ + 5, BOUNDS.maxZ - 5);
  if (pushOut(x, z, 0, 2.5).hit) return;
  const c = new Vehicle('camel', x, z, Math.atan2(-(P.x - x), -(P.z - z))); c.ai = 'cop'; c.temp = true; c.y = groundAt(x, z, 99);
  const r = new Human({ kind: 'guard', x, z, look: COP_LOOK }); r.reinf = true; r.state = 'ride'; r.copCamel = c; c.copRider = r;
  G.vehicles.push(c); G.humans.push(r);
}
function ejectCop(v, vel) {
  const r = v.copRider; v.copRider = null; v.ai = null; if (!r) return;
  r.state = 'walk'; r.x = v.x; r.z = v.z; r.y = v.y + 2.5; r.copCamel = null; startRag(r, vel);
}
function dismountCop(v) {
  const r = v.copRider; v.copRider = null; if (!r) return;
  r.state = 'walk'; r.sit = null; r.copCamel = null; r.x = v.x + 2.2; r.z = v.z; r.y = groundAt(r.x, r.z, v.y + 1); r.vx = r.vz = 0; r.air = false;
}
function updateCopCamels(dt, stars) {
  const P = G.player, cops = G.vehicles.filter(v => v.ai === 'cop'), want = stars >= 2 ? Math.min(4, stars) : 0;
  G.camelT = (G.camelT || 0) - dt;
  if (cops.length < want && G.camelT <= 0) { G.camelT = 1.6; spawnCopCamel(); }
  for (const v of G.vehicles) if (v.copRider && v.ai !== 'cop') dismountCop(v);                // 解散的骆驼：骑手下来当步行保安
  for (const v of cops) {
    const r = v.copRider;
    if (!r || r.state !== 'ride') { v.ai = null; v.copRider = null; continue; }                 // 骑手没了：骆驼解散
    r.sit = v.seatPos(); r.x = r.sit.x; r.y = r.sit.y; r.z = r.sit.z; r.yaw = v.h;
    if (Math.abs(v.sp) < 1.5) { v.stuckT = (v.stuckT || 0) + dt; if (v.stuckT > 1.1) { v.h += (Math.random() < 0.5 ? -1 : 1) * 1.7; v.stuckT = 0; } } else v.stuckT = 0;
  }
  if (cops.length > want) {                                                    // 星级降了：远处的撤走
    for (const v of cops.slice(want)) if (Math.hypot(v.x - P.x, v.z - P.z) > 50) { if (v.copRider) G.humans = G.humans.filter(h => h !== v.copRider); G.vehicles = G.vehicles.filter(x => x !== v); }
  }
  G.vehicles = G.vehicles.filter(v => !(v.temp && !v.rider && !v.ai && !v.copRider && Math.hypot(v.x - P.x, v.z - P.z) > 60));
  // 碰撞：玩家高速撞飞骑警 / 否则被抓
  if (!G.overlay) for (const v of cops) {
    if (!v.copRider) continue;
    const d = Math.hypot(v.x - P.x, v.z - P.z), rv = P.state === 'ride' ? P.vehicle : null;
    if (rv && rv !== v && Math.hypot(v.x - rv.x, v.z - rv.z) < VEH[rv.kind].r + VEH.camel.r && Math.abs(rv.sp) > 9) {
      const f = [-Math.sin(rv.h), 0, -Math.cos(rv.h)];
      ejectCop(v, [f[0] * rv.sp * 1.3, 8, f[2] * rv.sp * 1.3]); v.sp = rv.sp * 0.5;
      chaos(150, '撞飞骑警'); challengeDone('ramCop'); addHeat(0.25); shake(0.6); Snd.crash(); continue;
    }
    if ((P.state === 'walk' && d < VEH.camel.r + 0.9) || (rv && rv !== v && d < VEH.camel.r + 1.6 && Math.abs(rv.sp) < 9)) { busted(); break; }
  }
}

/* ---------------- ★3 喷气背包保安 ---------------- */
function spawnJetCop() {
  const P = G.player, a = Math.random() * 6.28, d = 50 + Math.random() * 15;
  const x = clampv(P.x + Math.cos(a) * d, BOUNDS.minX + 3, BOUNDS.maxX - 3), z = clampv(P.z + Math.sin(a) * d, BOUNDS.minZ + 3, BOUNDS.maxZ - 3);
  const h = new Human({ kind: 'guard', x, z, look: COP_LOOK }); h.reinf = true; h.jet = true; h.y = groundAt(x, z, 99); h.air = true;
  G.humans.push(h);
}
function updateJetCop(h, dt) {
  const P = G.player, stars = Math.floor(G.heat), dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz) || 1, sp = 9.5 + stars * 0.7;
  const ty = d > 11 ? P.y + 7 : P.y + 0.3, k = Math.min(1, dt * 3);
  h.vx += (dx / d * sp - h.vx) * k; h.vz += (dz / d * sp - h.vz) * k;
  h.vy += (clampv((ty - h.y) * 2.2, -10, 10) - h.vy) * Math.min(1, dt * 4);
  h.x = clampv(h.x + h.vx * dt, BOUNDS.minX - 20, BOUNDS.maxX + 20); h.z = clampv(h.z + h.vz * dt, BOUNDS.minZ - 20, BOUNDS.maxZ + 20);
  h.y = Math.max(h.y + h.vy * dt, groundAt(h.x, h.z, h.y + 2)); h.air = true; h.moveAmt = 0; h.runAmt = 0;
  h.yaw += angDiff(Math.atan2(-dx, -dz), h.yaw) * Math.min(1, dt * 6);
}
function updateJetCops(dt, stars) {
  const jets = G.humans.filter(h => h.jet), want = stars >= 3 ? stars - 1 : 0;
  G.jetT = (G.jetT || 0) - dt;
  if (jets.length < want && G.jetT <= 0) { G.jetT = 1.4; spawnJetCop(); }
  if (jets.length > want) for (const h of jets.slice(want)) { h.jet = false; h.air = true; }   // 降级：关喷气落地当步行保安
}

/* ---------------- ★4 轰炸机 ---------------- */
function planePass() {
  const P = G.player, pl = G.plane, a = Math.random() * 6.28, off = (Math.random() - 0.5) * 24;
  pl.x = P.x + Math.sin(a) * 170; pl.z = P.z + Math.cos(a) * 170;
  const tx = P.x + Math.cos(a) * off, tz = P.z - Math.sin(a) * off, dx = tx - pl.x, dz = tz - pl.z, d = Math.hypot(dx, dz);
  pl.f = [dx / d, dz / d]; pl.h = Math.atan2(-pl.f[0], -pl.f[1]); pl.state = 'pass'; pl.bombT = 0.3;
}
function dropBomb(pl, aimed) {
  const g = 24, hv = pl.sp * 0.32, y0 = pl.y - 1, vx = pl.f[0] * hv, vz = pl.f[1] * hv;
  let tf = Math.sqrt(2 * y0 / g), lx = pl.x + vx * tf, lz = pl.z + vz * tf;
  tf = Math.sqrt(2 * Math.max(1, y0 - groundAt(lx, lz, 5)) / g); lx = pl.x + vx * tf; lz = pl.z + vz * tf;
  G.bombs.push({ x: pl.x, y: y0, z: pl.z, vx, vy: 0, vz, lx, lz, R: 7.5 });
  Snd.tone(900, 0.5, 'sine', 0.04, -700);
}
function updatePlane(dt, stars) {
  const P = G.player;
  if (stars >= 4 && !G.plane) {
    if (G.planeAt === null) { G.planeAt = G.time + 2.5; narrate('planeCome', '空军到了。没人知道景区什么时候买的飞机。'); }
    if (G.time >= G.planeAt) { G.plane = { x: 0, y: 46, z: 0, h: 0, f: [0, -1], sp: 42, state: 'pass', bombT: 0, leave: false, wait: 0 }; planePass(); }
  } else if (stars < 4) { G.planeAt = null; if (G.plane) G.plane.leave = true; }
  const pl = G.plane; if (!pl) return;
  if (pl.state === 'wait') { pl.wait -= dt; if (pl.wait <= 0) { if (pl.leave) { G.plane = null; return; } planePass(); } return; }
  pl.x += pl.f[0] * pl.sp * dt; pl.z += pl.f[1] * pl.sp * dt; pl.y = 46 + Math.sin(G.time * 1.3) * 1.5;
  pl.bombT -= dt;
  const dxp = P.x - pl.x, dzp = P.z - pl.z, d = Math.hypot(dxp, dzp), ahead = dxp * pl.f[0] + dzp * pl.f[1];
  if (!G.overlay && !pl.leave && pl.bombT <= 0 && d < 70) {
    // 预测落点是否砸向玩家（含玩家当前速度）
    const hv = pl.sp * 0.32, tf = Math.sqrt(2 * (pl.y - 1) / 24), lx = pl.x + pl.f[0] * hv * tf, lz = pl.z + pl.f[1] * hv * tf;
    const px = P.x + (P.state === 'ride' ? Math.sin(P.vehicle.h) * -P.vehicle.sp : P.vx) * tf, pz = P.z + (P.state === 'ride' ? Math.cos(P.vehicle.h) * -P.vehicle.sp : P.vz) * tf;
    if (Math.hypot(lx - px, lz - pz) < 9) { dropBomb(pl, true); pl.bombT = 0.28; }
    else if (d < 55) { dropBomb(pl, false); pl.bombT = Math.floor(G.heat) >= 5 ? 0.45 : 0.7; }
  }
  if (ahead < -30 && d > 150) { pl.state = 'wait'; pl.wait = pl.leave ? 0 : 2.5; }
  if (G.time % 1.2 < dt) Snd.tone(95 + Math.random() * 10, 0.5, 'sawtooth', 0.03);
}
function updateBombs(dt) {
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i]; b.vy -= 24 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y <= groundAt(b.x, b.z, b.y + 1) + 0.2) { explode(b.x, groundAt(b.x, b.z, b.y + 1), b.z, b.R); G.bombs.splice(i, 1); }
  }
}
function explode(x, y, z, R) {
  G.fx.push({ x, y: y + 1, z, t: 0, dur: 0.9, r: R * 1.1 }); if ((typeof FX !== 'undefined')) FX.boom(x, y, z, R);
  G.scorch.push({ x, y, z, r: R * 0.7, t: 25 }); if (G.scorch.length > 14) G.scorch.shift();
  Snd.noise(0.6, 0.6, 500); Snd.tone(70, 0.7, 'sawtooth', 0.09, -40);
  const P = G.player, dP = Math.hypot(P.x - x, P.z - z); shake(clampv(1.3 - dP / 55, 0, 1.1));
  const away = (ox, oz, s) => { const dx = ox - x, dz = oz - z, d = Math.hypot(dx, dz) || 1; return [dx / d * s, 9 + s * 0.35, dz / d * s]; };
  if (!G.overlay && dP < R + 0.5 && Math.abs(P.y - y) < 6) {
    const v = away(P.x, P.z, 14 * (1.2 - dP / (R + 1)) + 6);
    if (P.state === 'ride') ejectRider(P.vehicle, v); else startRag(P, v);
    hurt(10 + 28 * (1 - dP / (R + 1))); popup('💥 被轰炸了！', 'bad');
  }
  for (const h of G.humans) { if (h.state === 'held' || h.state === 'ride') continue; const d = Math.hypot(h.x - x, h.z - z); if (d < R * 1.25 && Math.abs(h.y - y) < 7) hitHuman(h, away(h.x, h.z, 14 * (1.3 - d / (R * 1.25))), false); }
  for (const p of G.props) if (Math.hypot(p.x - x, p.z - z) < R * 1.5) launchProp(p, away(p.x, p.z, 14), false);
  for (const v of G.vehicles) if (v.rider !== P && Math.hypot(v.x - x, v.z - z) < R) { v.air = true; v.vy = 9; v.sp *= 0.4; if (v.copRider) ejectCop(v, away(v.x, v.z, 12)); }
}

/* ---------------- ★5 核弹 ---------------- */
function launchNuke() {
  const P = G.player; G.nuke = { state: 'warn', t: 0, x: P.x, z: P.z, y: groundAt(P.x, P.z, P.y + 1) };
  popup('☢ 核弹已发射 · 逃出红圈！', 'bad'); Snd.siren();
}
function updateNuke(dt, stars) {
  if (stars >= 5) { if (G.nukeAt === null && !G.nuke) { G.nukeAt = G.time + 3; narrate('nukeCome', '管理方决定一次性解决问题。问题指的是你。'); } if (!G.nuke && G.nukeAt !== null && G.time >= G.nukeAt && !G.overlay) launchNuke(); }
  else if (!G.nuke) G.nukeAt = null;
  const n = G.nuke, ban = document.getElementById('nukeBanner'); if (!n) { ban && ban.classList.add('hidden'); return; }
  n.t += dt;
  if (n.state === 'warn') {
    const P = G.player, dist = Math.hypot(P.x - n.x, P.z - n.z), left = Math.max(0, NUKE_T - n.t);
    if (ban) { ban.classList.remove('hidden'); ban.classList.toggle('safe', dist > NUKE_R + 3); ban.textContent = `☢ 核弹倒计时 ${Math.ceil(left)}　·　你离爆心 ${Math.round(dist)} 米（安全 > ${NUKE_R}）`; }
    if (Math.floor(n.t * 1.4) !== Math.floor((n.t - dt) * 1.4)) Snd.siren();
    if (n.t >= NUKE_T) detonate(n);
  } else if (n.state === 'boom') {
    if (ban) ban.classList.add('hidden');
    if (n.t > 14) { G.nuke = null; G.nukeAt = G.time + 40; }
  }
}
function detonate(n) {
  n.state = 'boom'; n.t = 0; const P = G.player; if ((typeof FX !== 'undefined')) FX.nuke(n.x, n.y, n.z);
  const fl = document.getElementById('flash'); if (fl) { fl.style.transition = 'none'; fl.style.opacity = 1; void fl.offsetWidth; fl.style.transition = 'opacity 2.6s ease-out'; fl.style.opacity = 0; }
  shake(1.8); Snd.noise(1.6, 0.9, 300); Snd.tone(45, 1.8, 'sawtooth', 0.14, -20); Snd.tone(110, 1.2, 'square', 0.06, -80);
  G.scorch.push({ x: n.x, y: n.y, z: n.z, r: NUKE_R * 0.55, t: 40 });
  const away = (ox, oz, s) => { const dx = ox - n.x, dz = oz - n.z, d = Math.hypot(dx, dz) || 1; return [dx / d * s, 14 + s * 0.4, dz / d * s]; };
  for (const h of G.humans) { if (h.state === 'held') continue; const d = Math.hypot(h.x - n.x, h.z - n.z); if (d < NUKE_R * 1.4) { if (h.state === 'ride') { const v = h.copCamel; if (v) ejectCop(v, away(h.x, h.z, 30)); else continue; } else hitHuman(h, away(h.x, h.z, 34 * (1.5 - d / (NUKE_R * 1.4))), false); } }
  for (const p of G.props) if (Math.hypot(p.x - n.x, p.z - n.z) < NUKE_R * 1.6) launchProp(p, away(p.x, p.z, 28), false);
  for (const v of G.vehicles) { if (v.rider === P) continue; const d = Math.hypot(v.x - n.x, v.z - n.z); if (d < NUKE_R * 1.2) { v.air = true; v.vy = 14; v.sp = 0; } }
  const dP = Math.hypot(P.x - n.x, P.z - n.z);
  if (!G.overlay) {
    if (dP < NUKE_R) die('被核弹平均分配到了每一个原子');
    else { challengeDone('nukeSurvive'); popup('你在核爆里幸存了。运气也是一种技术。', 'good'); if (dP < NUKE_R * 1.5) { if (P.state === 'ride') ejectRider(P.vehicle, away(P.x, P.z, 18)); else startRag(P, away(P.x, P.z, 18)); } }
  }
}

/* ---------------- 总入口 ---------------- */
function updateCops(dt) {
  const stars = Math.floor(G.heat);
  for (let s = 2; s <= 5; s++) if (stars >= s && !G.tierMsg[s]) { G.tierMsg[s] = 1; popup(['', '', '★★ 骑警出动：保安换了骆驼，理由是预算批下来了', '★★★ 喷气背包保安上线：报销单已提交', '★★★★ 轰炸机来了：景区没有防空预案', '★★★★★ 核弹：管理方的最终解决方案'][s], 'bad'); }
  updateHeld(dt); updateThrown(dt);
  if (!G.overlay) { updateCopCamels(dt, stars); updateJetCops(dt, stars); }
  updatePlane(dt, stars); updateBombs(dt); updateNuke(dt, stars);
  for (let i = G.fx.length - 1; i >= 0; i--) { G.fx[i].t += dt; if (G.fx[i].t > G.fx[i].dur) G.fx.splice(i, 1); }
  for (let i = G.scorch.length - 1; i >= 0; i--) { G.scorch[i].t -= dt; if (G.scorch[i].t <= 0) G.scorch.splice(i, 1); }
  if (stars === 0) {
    G.vehicles.forEach(v => { if (v.ai === 'cop') v.ai = null; });
    G.humans.forEach(h => { if (h.jet) { h.jet = false; h.air = true; } });
  }
}

/* ---------------- 绘制 ---------------- */
function drawPolice(dyn, cam) {
  const R = renderer.m, t = G.time, P = G.player;
  const add = (mesh, m, col, unlit) => dyn.push({ mesh, m, col, unlit: !!unlit, rad: 6 });
  // 烧焦的地面
  for (const s of G.scorch) { const k = Math.min(1, s.t / 6); add(R.cyl, M4.compose(s.x, s.y + 0.09, s.z, 0, 0, 0, s.r * 2 * (0.6 + 0.4 * k), 0.03, s.r * 2 * (0.6 + 0.4 * k)), [0.2, 0.15, 0.11], true); }
  // 喷气保安：背包 + 火焰
  for (const h of G.humans) {
    if (!h.jet || h.state !== 'walk') continue;
    if ((h.x - cam.x) ** 2 + (h.z - cam.z) ** 2 > 160 * 160) continue;
    const f = [-Math.sin(h.yaw), 0, -Math.cos(h.yaw)], pose = standPose(h), b = [pose.chest[0] - f[0] * 0.38, pose.chest[1], pose.chest[2] - f[2] * 0.38];
    add(renderer.rbox(0.55, 0.75, 0.32, 0.12), M4.compose(b[0], b[1], b[2], 0, h.yaw, 0, 1, 1, 1), [0.7, 0.72, 0.78]);
    [-0.15, 0.15].forEach(o => { const fp = [b[0] + Math.cos(h.yaw) * o, b[1] - 0.5, b[2] - Math.sin(h.yaw) * o]; add(R.cone, M4.seg(fp, [fp[0], fp[1] - 1.5 - Math.random() * 0.9, fp[2]], 0.3, 0.3, true), [1, 0.62, 0.1], true); });
    add(R.cyl, M4.compose(h.x, groundAt(h.x, h.z, h.y) + 0.07, h.z, 0, 0, 0, 1.4, 0.04, 1.4), [0.55, 0.45, 0.3], true);
  }
  // 投掷预览：弹道点 + 落点圈 + 方向箭头
  if (G.held && !G.overlay) {
    const pv = throwPreview(), n = pv.pts.length, pulse = 0.85 + 0.15 * Math.sin(t * 8);
    pv.pts.forEach((p, i) => { const k = 1 - i / Math.max(1, n), dd = Math.hypot(p[0] - P.x, p[2] - P.z), r = (0.16 + 0.12 * k) * (1 + dd * 0.035); add(R.sph, M4.compose(p[0], p[1], p[2], 0, 0, 0, r, r, r), [1, 0.85 - 0.5 * (1 - k), 0.2], true); });
    const L = pv.land, dl = Math.hypot(pv.dir[0], pv.dir[1]) || 1, dx = pv.dir[0] / dl, dz = pv.dir[1] / dl, ang = Math.atan2(-dx, -dz);
    const dh = Math.hypot(L[0] - P.x, L[2] - P.z), sc = 1 + dh * 0.03;                                      // 越远越大，保证看得见
    add(R.cyl, M4.compose(L[0], L[1] + 0.06, L[2], 0, 0, 0, 3.4 * pulse * sc, 0.05, 3.4 * pulse * sc), [1, 0.25, 0.15], true);
    add(R.cyl, M4.compose(L[0], L[1] + 0.09, L[2], 0, 0, 0, 2.2 * pulse * sc, 0.05, 2.2 * pulse * sc), [1, 0.9, 0.3], true);
    add(R.cyl, M4.compose(L[0], L[1] + 3.5 * sc, L[2], 0, 0, 0, 0.3 * sc, 7 * sc, 0.3 * sc), [1, 0.35, 0.15], true);                // 落点光柱
    add(R.cone, M4.compose(L[0], L[1] + 8.6 * sc + 0.4 * Math.sin(t * 6), L[2], Math.PI, 0, 0, 1.6 * sc, 2.2 * sc, 1.6 * sc), [1, 0.85, 0.2], true);   // 光柱顶端的向下箭头
    add(R.cone, M4.compose(L[0] + dx * 2.6 * sc, L[1] + 0.6, L[2] + dz * 2.6 * sc, Math.PI / 2, ang, 0, 1.1 * sc, 1.8 * sc, 1.1 * sc), [1, 0.35, 0.15], true);       // 落点前方：投掷方向箭头
  }
  // 轰炸机
  const pl = G.plane;
  if (pl && pl.state === 'pass') {
    const G0 = M4.compose(pl.x, pl.y, pl.z, 0, pl.h, Math.sin(t * 1.3) * 0.08, 1, 1, 1), part = (lx, ly, lz, sx, sy, sz, col, mesh = R.cube) => add(mesh, M4.mul(G0, M4.compose(lx, ly, lz, 0, 0, 0, sx, sy, sz)), col);
    part(0, 0, 0, 1.9, 1.7, 10.5, [0.46, 0.52, 0.44], R.sph); part(0, 0, -4.9, 1.7, 1.55, 1.9, [0.85, 0.2, 0.15], R.sph); part(0, 0.05, 4.2, 1.1, 1.0, 4.4, [0.44, 0.5, 0.42], R.sph);
    part(0, -0.05, 0.6, 15, 0.3, 2.6, [0.38, 0.43, 0.36], R.sph); part(0, 0.1, 4.6, 5, 0.22, 1.4, [0.38, 0.43, 0.36], R.sph); part(0, 1.2, 4.5, 0.24, 2.0, 1.6, [0.85, 0.2, 0.15], R.sph);
    part(0, 1.0, -1.8, 1.3, 0.9, 2.2, [0.55, 0.8, 0.95], R.sph); part(0, 0, -6.1, 0.4, 0.4, 0.5, [0.2, 0.2, 0.2], R.sph);
    // 螺旋桨：每帧转一下
    add(R.sph, M4.mul(G0, M4.compose(0, 0, -6.2, 0, 0, t * 40, 0.28, 3.6, 0.08)), [0.1, 0.1, 0.1]);
    add(R.cyl, M4.compose(pl.x, groundAt(pl.x, pl.z, 5) + 0.1, pl.z, 0, 0, 0, 6, 0.03, 6), [0.5, 0.42, 0.28], true);       // 地面影子
  }
  // 炸弹 + 落点标记
  for (const b of G.bombs) {
    add(R.sph, M4.compose(b.x, b.y, b.z, 0, 0, 0, 0.9, 1.5, 0.9), [0.12, 0.12, 0.15]); add(R.cube, M4.compose(b.x, b.y + 0.9, b.z, 0, 0, 0, 1.2, 0.1, 0.1), [0.8, 0.15, 0.1]);
    const pulse = 0.8 + 0.2 * Math.sin(t * 14), gy = groundAt(b.lx, b.lz, 8) + 0.12;
    add(R.cyl, M4.compose(b.lx, gy, b.lz, 0, 0, 0, b.R * 2 * pulse, 0.03, b.R * 2 * pulse), [1, 0.15, 0.1], true);
    add(R.cyl, M4.compose(b.lx, gy + 0.03, b.lz, 0, 0, 0, b.R * 1.3 * pulse, 0.03, b.R * 1.3 * pulse), [1, 0.85, 0.2], true);
  }
  // 火球
  for (const f of G.fx) { const k = f.t / f.dur; if (k > 0.5) continue; const r = f.r * (0.35 + 0.8 * Math.sqrt(k)) * 1.1; add(R.sph, M4.compose(f.x, f.y + r * 0.15, f.z, 0, 0, 0, r, r * 0.9, r), k < 0.2 ? [1, 0.95, 0.7] : [1, 0.55 - 0.35 * k, 0.1 * (1 - k)], true); }
  // 核弹：预警圈 + 导弹 / 爆炸
  const n = G.nuke;
  if (n && n.state === 'warn') {
    const k = n.t / NUKE_T, y = 230 * (1 - k * k), blink = Math.floor(t * 4) % 2;
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, x = n.x + Math.cos(a) * NUKE_R, z = n.z + Math.sin(a) * NUKE_R; add(R.cube, M4.compose(x, groundAt(x, z, 80) + 0.5, z, 0, -a, 0, 3.2, 0.5, 0.8), (i + blink) % 2 ? [1, 0.1, 0.1] : [1, 0.9, 0.2], true); }
    add(R.cyl, M4.compose(n.x, n.y + 20, n.z, 0, 0, 0, 1.2, 40, 1.2), [1, 0.2, 0.15], true);
    add(R.cyl, M4.compose(n.x, y + 8, n.z, 0, 0, 0, 4.2, 10, 4.2), [0.82, 0.84, 0.88]); add(R.cone, M4.compose(n.x, y + 3, n.z, Math.PI, 0, 0, 4.2, 4.5, 4.2), [0.9, 0.2, 0.15]);
    add(R.cone, M4.compose(n.x, y + 13, n.z, 0, 0, 0, 3.4, 9 * (0.7 + Math.random() * 0.4), 3.4), [1, 0.65, 0.1], true);
  } else if (n && n.state === 'boom') {
    const k = Math.min(1, n.t / 0.9), r = NUKE_R * (0.3 + 0.9 * Math.sqrt(k)) * 2;
    if (n.t < 1.3) add(R.sph, M4.compose(n.x, n.y + r * 0.12, n.z, 0, 0, 0, r, r * 0.8, r), n.t < 0.3 ? [1, 1, 0.95] : [1, 0.6 - 0.2 * n.t, 0.2], true);   // 初始闪光球；之后由粒子系统接管烟柱/蘑菇云
  }
}
