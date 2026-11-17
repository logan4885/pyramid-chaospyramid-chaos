'use strict';
/* ============================================================
 * game.js — 第三人称搞笑沙盒：状态、输入、玩家、相机、通缉、挑战、HUD
 * ============================================================ */
const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

let renderer, W = null, G = null;
const K = {};                                   // 按键状态
const mouse = { dx: 0, dy: 0, idle: 0 };

/* ---------------- 音频（WebAudio 合成） ---------------- */
const Snd = {
  ctx: null, mute: false, wind: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = last * 3; }
      this.noiseBuf = buf;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      this.wind = this.ctx.createGain(); this.wind.gain.value = 0.18; src.connect(f); f.connect(this.wind); this.wind.connect(this.ctx.destination); src.start();
      this.musicStart();
    } catch (e) { this.ctx = null; }
  },
  /* ---- 魔性 BGM：埃及味(弗里几亚属音阶)洗脑旋律 + 放克贝斯 + 鼓点，程序合成，循环不停 ---- */
  musicStart() {
    const c = this.ctx; if (this.mg) return;
    this.mg = c.createGain(); this.mg.gain.value = this.mute ? 0 : 0.5;
    const comp = c.createDynamicsCompressor(); this.mg.connect(comp); comp.connect(c.destination);
    this.mstep = 0; this.nextT = c.currentTime + 0.1;
    const HA = [12, null, 13, 12, null, 16, null, 13, 12, null, 10, null, 8, null, 7, null];
    const HB = [12, 13, 16, 17, 16, 13, 12, null, 8, null, 10, 12, null, null, 13, null];
    const BASS = { 0: 0, 3: 0, 6: 7, 8: 0, 11: 3, 14: 5 };
    const ROOT = [0, 0, 1, 0];
    const f = n => 440 * Math.pow(2, n / 12);
    const osc = (fr, t, d, type, v, fc, slide) => {
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = type; o.frequency.setValueAtTime(fr, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, fr * slide), t + d);
      fl.type = 'lowpass'; fl.frequency.value = fc; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(fl); fl.connect(g); g.connect(this.mg); o.start(t); o.stop(t + d + 0.03);
    };
    const nz = (t, d, v, fc, hp) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; s.playbackRate.value = 3;
      fl.type = hp ? 'highpass' : 'bandpass'; fl.frequency.value = fc; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(this.mg); s.start(t); s.stop(t + d + 0.02);
    };
    const play = (st, t, sd) => {
      const i = st & 15, bar = (st >> 4) & 3, st5 = Math.floor(G && G.heat || 0), hook = (bar === 2 ? HB : HA)[i], rt = ROOT[bar];
      if (i % 4 === 0) { osc(150, t, 0.16, 'sine', 0.9, 400, 0.3); }                       // kick
      if (i === 4 || i === 12) { nz(t, 0.14, 0.5, 1800); osc(220, t, 0.08, 'triangle', 0.25, 1500, 0.6); } // snare
      if (i % 2 === 0) nz(t, i === 14 ? 0.18 : 0.04, i % 4 === 2 ? 0.28 : 0.16, 7000, true);   // hat
      if (i in BASS) osc(f(-24 + rt + BASS[i]), t, sd * 2.2, 'sawtooth', 0.34, 520, 0.97);      // 放克贝斯
      if (hook != null) {
        const n = hook + rt, bend = (st & 31) === 5 ? 1.12 : 0;                                  // 偶尔来个滑音
        osc(f(n), t, sd * 1.7, 'square', 0.17, 2600, bend ? 1 / bend : 0);
        osc(f(n) * 1.006, t, sd * 1.7, 'sawtooth', 0.08, 2000);
        if (st5 >= 2) osc(f(n + 12), t + sd * 0.5, sd * 0.8, 'triangle', 0.11, 3500);          // 通缉越高越热闹
      }
      if (st5 >= 3 && i % 2 === 1) osc(f(24 + [0, 1, 4, 5][(i >> 1) & 3] + rt), t, sd * 0.7, 'square', 0.05, 4000); // 琶音
    };
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const sd = 60 / (126 + Math.min(5, Math.floor(G && G.heat || 0)) * 6) / 4, now = c.currentTime;
      if (this.nextT < now - 0.5) this.nextT = now + 0.05;
      const want = this.mute ? 0 : (G && G.paused ? 0.15 : 0.5); this.mg.gain.setTargetAtTime(want, now, 0.1);
      while (this.nextT < now + 0.3) { if (!this.mute) play(this.mstep, this.nextT, sd); this.mstep = (this.mstep + 1) & 63; this.nextT += sd; }
    }, 60);
  },
  setMute(m) { this.mute = m; if (this.wind) this.wind.gain.value = m ? 0 : 0.18; if (this.mg) this.mg.gain.value = m ? 0 : 0.5; $('btnMute').textContent = m ? '🔇' : '🔊'; },
  tone(f, d, type = 'sine', v = 0.07, slide = 0, delay = 0) {
    if (!this.ctx || this.mute) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, v, fc) {
    if (!this.ctx || this.mute || !this.noiseBuf) return;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.value = fc;
    g.gain.setValueAtTime(v, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + d); s.connect(f); f.connect(g); g.connect(this.ctx.destination); s.start(); s.stop(this.ctx.currentTime + d);
  },
  click() { this.tone(560, 0.06, 'square', 0.04); },
  good() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.07, 0, i * 0.07)); },
  bad() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.2, 'sawtooth', 0.05, 0, i * 0.1)); },
  coin() { this.tone(988, 0.08, 'square', 0.05); this.tone(1318, 0.18, 'square', 0.05, 0, 0.07); },
  boing() { this.tone(220, 0.28, 'sine', 0.1, 520); },
  crash() { this.noise(0.25, 0.5, 900); this.tone(90, 0.2, 'square', 0.06, -50); },
  pop() { this.tone(700, 0.08, 'triangle', 0.08, -400); },
  horn() { this.tone(180, 0.5, 'sawtooth', 0.1); this.tone(228, 0.5, 'sawtooth', 0.08); },
  shutter() { this.noise(0.08, 0.4, 3000); this.tone(1800, 0.05, 'square', 0.04); },
  step() { this.tone(70 + Math.random() * 20, 0.06, 'triangle', 0.04); },
  siren() { this.tone(660, 0.25, 'square', 0.04, 220); this.tone(880, 0.25, 'square', 0.04, -220, 0.25); },
};

/* ---------------- 状态 ---------------- */
function newGame() {
  W = buildWorld(renderer);
  renderer.setStatic(W.objs);
  G = {
    phase: 'play', paused: false, time: 0, humans: [], vehicles: [], props: [], pickups: [], bananas: [], bowl: [],
    heat: 0, unseenT: 0, reached3: false, score: 0, combo: 0, lastChaos: -99, money: CFG.startMoney, hp: CFG.hpMax, lastHurt: -99,
    item: null, fuel: 100, jet: false, done: {}, best: +(localStorage.getItem('pc_best') || 0), rentUntil: 0, selfieCd: 0, eReq: false, fReq: false, jumpReq: false,
    cam: { yaw: 0, pitch: -0.28, dist: CFG.camDist, shake: 0, x: 0, y: 2, z: 100 }, overlay: null, spawnT: 0, stepT: 0, snapReq: null, mountCd: 0, bumpT: 0, narr: {},
  };
  const sp = W.spawn;
  policeInit();
  G.player = new Human({ kind: 'player', x: sp.player.x, z: sp.player.z, yaw: 0, look: Cust.spec() });
  sp.vehicles.forEach(v => G.vehicles.push(new Vehicle(v[0], v[1], v[2], v[3])));
  sp.pickups.forEach(p => G.pickups.push({ kind: p[0], x: p[1], z: p[2], active: true, t: 0 }));
  sp.vendors.forEach(v => G.humans.push(Object.assign(new Human({ kind: 'merchant', x: v.x, z: v.z, look: v.look, wave: true }), { vendor: v.kind })));
  sp.guards.forEach(g => G.humans.push(newGuard(g[0], g[1])));
  for (let i = 0; i < CFG.tourists; i++) { const p = randomWalkPoint(); G.humans.push(new Human({ kind: 'tourist', x: p[0], z: p[1], yaw: Math.random() * 6.28 })); }
  for (let i = 0; i < CFG.props; i++) { const p = randomWalkPoint(); G.props.push(new Prop(pickOne(['crate', 'pot', 'melon']), p[0], p[1])); }
  G.cam.yaw = 0; hudCache = {}; renderChallenges();
  $('popups').innerHTML = ''; $('polaroid').classList.add('hidden');
}
const newGuard = (x, z, reinf) => Object.assign(new Human({ kind: 'guard', x, z, look: { shirt: '#2f3a52', pants: '#22262f', hat: 'cap', hatCol: '#e6dfcc', gag: '', scale: 1.08 } }), { reinf: !!reinf });

/* ---------------- 混乱 / 通缉 / 挑战 / 提示 ---------------- */
function popup(txt, kind = '') {
  const d = document.createElement('div'); d.className = 'pop ' + kind; d.textContent = txt;
  const box = $('popups'); box.appendChild(d); while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => d.remove(), 4200);
}
function chaos(pts, label) {
  if (!G) return;
  G.combo = (G.time - G.lastChaos < CFG.comboWindow) ? Math.min(CFG.comboMax, G.combo + 1) : 1;
  G.lastChaos = G.time;
  const add = Math.round(pts * G.combo); G.score += add; G.money += Math.floor(add / 25);
  popup(`${label}  +${add}${G.combo > 1 ? '  ×' + G.combo : ''}`, G.combo > 3 ? 'hot' : '');
  if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('pc_best', G.best); } catch (e) {} }
}
function addHeat(v) {
  const before = Math.floor(G.heat); G.heat = Math.min(5, G.heat + v); G.unseenT = 0;
  if (Math.floor(G.heat) > before) { popup('通缉等级 ' + '★'.repeat(Math.floor(G.heat)), 'bad'); Snd.siren(); }
}
function shake(a) { if (G) G.cam.shake = Math.max(G.cam.shake, a); }
function narrate(key, txt) { if (G.narr[key]) return; G.narr[key] = 1; popup('旁白：' + txt, 'narr'); }
function challengeDone(id) {
  if (G.done[id]) return; const c = CHALLENGES.find(x => x.id === id); G.done[id] = true;
  G.score += c.score; G.money += c.cash; popup(`🏆 挑战完成：${c.t}  +$${c.cash}`, 'good'); Snd.good(); renderChallenges();
  if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('pc_best', G.best); } catch (e) {} }
}
function renderChallenges() {
  $('chal').innerHTML = '<h4>挑战</h4>' + CHALLENGES.map(c => `<div class="${G.done[c.id] ? 'done' : ''}" title="${c.d}">${G.done[c.id] ? '✅' : '⬜'} ${c.t}</div>`).join('');
}

/* ---------------- 玩家 ---------------- */
function nearestInteract() {
  const P = G.player; let best = null, bd = 1e9;
  if (P.state !== 'walk') return null;
  for (const v of G.vehicles) { if (v.rider || v.ai) continue; const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < VEH[v.kind].r + 2.2 && d < bd && Math.abs(v.y - P.y) < 3) { best = { type: 'veh', o: v }; bd = d; } }
  for (const h of G.humans) { if (h.kind !== 'merchant') continue; const d = Math.hypot(h.x - P.x, h.z - P.z); if (d < 3.2 && d < bd) { best = { type: 'shop', o: h }; bd = d; } }
  return best;
}
function interact() {
  const P = G.player;
  if (P.state === 'ride') return dismount();
  if (P.state !== 'walk') return;
  const t = nearestInteract(); if (!t) return;
  if (t.type === 'veh') mount(t.o);
  else if (t.o.vendor === 'souvenir') {
    if (G.money < CFG.shopPrice) { popup(pickOne(HUMOR.shopFail), 'bad'); Snd.bad(); return; }
    G.money -= CFG.shopPrice; const k = pickOne(['horn', 'jetpack', 'banana', 'jetpack']); giveItem(k); popup(pickOne(HUMOR.shopOk) + `（-$${CFG.shopPrice}）`); Snd.coin();
  } else {
    if (G.time < G.rentUntil) { popup('“你已经租了！骆驼记得你。”'); return; }
    if (G.money < CFG.rentPrice) { popup('“$15！骆驼不接受情怀。”', 'bad'); Snd.bad(); return; }
    G.money -= CFG.rentPrice; G.rentUntil = G.time + CFG.rentTime; popup('“租骆驼 $15，两分钟内偷骆驼不算偷！”', 'good'); Snd.coin();
  }
}
function giveItem(k) { G.item = { type: k, ammo: ITEMS[k].ammo }; if (k === 'jetpack') G.fuel = 100; popup(`${ITEMS[k].icon} 获得：${ITEMS[k].name}（${ITEMS[k].hint}）`, 'good'); Snd.pop(); }
function mount(v) {
  const P = G.player; if (G.mountCd > 0) return;
  v.rider = P; P.vehicle = v; P.state = 'ride'; P.selfie = false; G.mountCd = 0.4; Snd.click();
  if (v.kind === 'camel' && G.time > G.rentUntil) {
    const witness = G.humans.some(h => (h.kind === 'merchant' || h.kind === 'guard') && h.state === 'walk' && Math.hypot(h.x - P.x, h.z - P.z) < 45);
    if (witness) { popup(pickOne(HUMOR.stealCamel), 'bad'); addHeat(1.05); chaos(40, '偷骆驼'); }
  }
}
function dismount() {
  const P = G.player, v = P.vehicle; if (!v || G.mountCd > 0) return;
  G.mountCd = 0.4;
  if (v.air) { const f = [-Math.sin(v.h), 0, -Math.cos(v.h)]; ejectRider(v, [f[0] * v.sp, 4, f[2] * v.sp]); return; }
  const r = [Math.cos(v.h), 0, -Math.sin(v.h)], T = VEH[v.kind];
  v.rider = null; P.vehicle = null; P.sit = null; P.state = 'walk'; P.x = v.x + r[0] * (T.r + 1.2); P.z = v.z + r[2] * (T.r + 1.2); P.y = groundAt(P.x, P.z, v.y + 1); P.vx = P.vz = P.vy = 0;
}
function useItem() {
  const P = G.player; if (P.state === 'rag') return;
  const it = G.item;
  if (P.state === 'ride' && (!it || it.type !== 'selfie')) { vehicleHonk(); return; }
  if (!it) { popup('手里没东西。去捡个道具（亮闪闪的方块）。'); return; }
  if (it.type === 'selfie') takeSelfie();
  else if (it.type === 'horn') {
    if (P.state !== 'walk') return;
    Snd.horn(); shake(0.5); popup(pickOne(HUMOR.hornScare)); let n = 0;
    for (const h of G.humans) {
      if (h.state === 'rag') continue; const dx = h.x - P.x, dz = h.z - P.z, d = Math.hypot(dx, dz); if (d > 14) continue;
      if (d < 7) { hitHuman(h, [dx / (d || 1) * 10, 7, dz / (d || 1) * 10], true); n++; } else { h.fleeT = 4; h.fx = P.x; h.fz = P.z; }
    }
    Social.hitNear(P.x, P.z, 7, (dx, dz, d) => [dx / (d || 1) * 10, 7, dz / (d || 1) * 10]);
    for (const p of G.props) if (Math.hypot(p.x - P.x, p.z - P.z) < 8) launchProp(p, [(p.x - P.x) * 1.2, 8, (p.z - P.z) * 1.2], true);
    addHeat(0.3); if (--it.ammo <= 0) { G.item = null; popup('喇叭用完了（耳鸣还在）'); }
  } else if (it.type === 'banana') {
    if (P.state !== 'walk') return;
    const f = [-Math.sin(P.yaw), 0, -Math.cos(P.yaw)]; G.bananas.push({ x: P.x + f[0] * 1.2, z: P.z + f[2] * 1.2, y: P.y, life: 60 }); popup(pickOne(HUMOR.banana)); Snd.pop();
    if (--it.ammo <= 0) G.item = null;
  }
}
function vehicleHonk() {
  const v = G.player.vehicle; if (!v) return; Snd.horn(); shake(0.15);
  for (const h of G.humans) { if (h.state === 'rag') continue; const d = Math.hypot(h.x - v.x, h.z - v.z); if (d < 16) { h.fleeT = 3.5; h.fx = v.x; h.fz = v.z; } }
}
function takeSelfie() {
  const P = G.player; if (G.selfieCd > 0) return; G.selfieCd = 1.4;
  const riding = P.state === 'ride' ? P.vehicle : null, ent = riding || P;
  const tags = [], T = SELFIE_TAGS; let mult = 1;
  const add = k => { tags.push(T[k][0]); mult *= T[k][1]; };
  const alt = ent.y - groundAt(ent.x, ent.z, ent.y - 0.5);
  if (alt > 6) { add('air'); challengeDone('selfieAir'); }
  if (Math.hypot(P.x - PYR.x, P.z - PYR.z) < 105) { add('pyramid'); challengeDone('pyrSelfie'); }
  if (G.humans.some(h => h.kind === 'guard' && G.heat >= 1 && Math.hypot(h.x - P.x, h.z - P.z) < 40)) add('chased');
  if (riding && riding.kind === 'camel') add('camel'); else if (riding) add('vehicle');
  if (G.humans.filter(h => h.state === 'rag' && Math.hypot(h.x - P.x, h.z - P.z) < 18).length >= 3) add('pile');
  if (G.heat >= 3) add('wanted');
  if (P.y > 50 && Math.hypot(P.x - PYR.x, P.z - PYR.z) < 14) add('summit');
  Snd.shutter(); G.snapReq = { tags };
  chaos(Math.round(100 * mult), '自拍 ' + (tags.length ? '[' + tags.join(' · ') + ']' : '[普通游客照]'));
}
function flop() {
  const P = G.player; if (P.state !== 'walk') return;
  startRag(P, [P.vx * 1.2, 5, P.vz * 1.2]); popup(pickOne(HUMOR.flop)); Snd.boing();
}

function hurt(n) { G.hp -= n; G.lastHurt = G.time; shake(Math.min(1, n / 30)); if (G.hp <= 0 && !G.overlay) die(); }
function die(sub) { G.overlay = { text: 'WASTED', sub: sub || pickOne(HUMOR.dead), kind: 'dead', t: 2.8 }; G.money = Math.floor(G.money * 0.75); Snd.bad(); }
function busted() {
  if (G.overlay || G.noBust) return;
  G.overlay = { text: 'BUSTED', sub: pickOne(HUMOR.busted), kind: 'busted', t: 2.4 }; G.money = Math.floor(G.money * 0.5); Snd.siren();
  const P = G.player; if (P.state === 'walk') startRag(P, [0, 9, 0]);
}
function snapCam() { const C = G.cam, P = G.player; C.x = P.x; C.y = P.y + 1.5; C.z = P.z; C.free = C.dist; C.lift = C.pitch; }
function respawn() {
  const P = G.player, sp = W.spawn.player;
  if (P.vehicle) { P.vehicle.rider = null; P.vehicle = null; }
  P.sit = null; P.rag = null; P.state = 'walk'; P.x = sp.x; P.z = sp.z; P.y = 0; P.vx = P.vz = P.vy = 0; P.air = false; P.impact = 0;
  G.hp = CFG.hpMax; G.heat = 0; G.reached3 = false; G.overlay = null; G.cam.yaw = 0; snapCam();
  G.humans = G.humans.filter(h => !h.reinf); G.vehicles = G.vehicles.filter(v => v.ai !== 'stampede' && v.ai !== 'cop' && !v.temp); policeReset();
  G.humans.forEach(h => { if (h.kind === 'guard') { h.fleeT = 0; } });
}

function updatePlayer(dt) {
  const P = G.player;
  if (G.overlay) { G.overlay.t -= dt; if (G.overlay.t <= 0) respawn(); if (P.state === 'rag') stepRag(P, dt); return; }
  if (P.state === 'held') {
    const c = P.carrier;
    if (!c || !Social.remotes.has(P.carrierId)) { P.state = 'walk'; P.carrier = null; P.air = true; startRag(P, [0, 2, 0]); return; }
    const H = holdPoint(c); P.x = H[0]; P.z = H[2]; P.y = H[1] - 1.55 * (P.look.scale || 1); P.yaw = c.yaw + 1.57; P.moveAmt = 0; P.runAmt = 0; P.vx = P.vz = P.vy = 0; P.air = true;
    if (G.jumpReq) { G.jumpReq = false; P.struggle = (P.struggle || 0) + 1; shake(0.15); if (P.struggle >= 4) { P.struggle = 0; Net.sendEv(P.carrierId, 'free'); P.state = 'walk'; P.carrier = null; P.y = groundAt(P.x, P.z, P.y + 1); popup('你挣脱了！'); } }
    return;
  }
  if (P.state === 'rag') {
    stepRag(P, dt);
    const move = K.KeyW || K.KeyA || K.KeyS || K.KeyD || K.Space;
    if (canGetUp(P) || (P.rag.t > 1.0 && move && P.rag.rest > 0.2)) { recoverHuman(P); popup('你站了起来，假装什么都没发生'); }
    if (P.impact > 13) { hurt(Math.min(35, (P.impact - 11) * 1.4)); popup('💥 疼！', 'bad'); P.impact = 0; Snd.crash(); } else P.impact = Math.max(0, P.impact - 1);
    return;
  }
  if (P.state === 'ride' || P.state === 'rag') G.jumpReq = false;
  if (P.state === 'ride') return;
  const cy = G.cam.yaw, fw = [-Math.sin(cy), -Math.cos(cy)], rt = [Math.cos(cy), -Math.sin(cy)];
  const ix = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), iz = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0);
  let wx = rt[0] * ix + fw[0] * iz, wz = rt[1] * ix + fw[1] * iz; const l = Math.hypot(wx, wz); if (l > 0) { wx /= l; wz /= l; }
  const spd = ((K.ShiftLeft || K.ShiftRight) ? CFG.sprint : CFG.walk) * (G.held ? 0.8 : 1);
  moveHuman(P, dt, wx * spd, wz * spd, P.air ? 10 : 22);
  if (G.jumpReq) { G.jumpReq = false; if (!P.air) { P.vy = CFG.jump; P.air = true; } }
  const jp = G.item && G.item.type === 'jetpack';
  G.jet = false;
  if (jp && K.Space && P.air && G.fuel > 0) { P.vy = Math.min(P.vy + 52 * dt, 12); G.fuel -= 32 * dt; G.jet = true; }
  else if (!P.air && G.fuel < 100) G.fuel = Math.min(100, G.fuel + 16 * dt);
  P.selfie = false;
  G.stepT += dt * Math.hypot(P.vx, P.vz); if (G.stepT > 2.2 && !P.air) { G.stepT = 0; Snd.step(); }
  // 冲刺撞人
  if (Math.hypot(P.vx, P.vz) > 6.5) for (const h of G.humans) {
    if (h.state === 'rag' || h.kind === 'merchant') continue;
    const dx = h.x - P.x, dz = h.z - P.z; if (dx * dx + dz * dz < 0.85) hitHuman(h, [P.vx * 1.2, 5, P.vz * 1.2], true);
  }
  if (Math.hypot(P.vx, P.vz) > 6.5) Social.hitNear(P.x, P.z, 0.92, () => [P.vx * 1.2, 5, P.vz * 1.2]);
  // 自动拾取
  for (const p of G.pickups) if (p.active && Math.hypot(p.x - P.x, p.z - P.z) < 1.8 && Math.abs(P.y - 0) < 6) { p.active = false; p.t = 40; giveItem(p.kind); }
  if (P.y >= PYR.top - 6 && Math.hypot(P.x - PYR.x, P.z - PYR.z) < 14) { challengeDone('summit'); }
  if (P.y > 8 && !G.narr.air) narrate('air', '这位游客正在尝试不属于人类的高度。');
}

/* ---------------- 通缉 / 刷怪 ---------------- */
function updateWanted(dt) {
  const P = G.player, stars = Math.floor(G.heat);
  if (G.heat > 0) {
    const seen = G.humans.some(h => h.kind === 'guard' && (h.state === 'walk' || h.state === 'ride') && Math.hypot(h.x - P.x, h.z - P.z) < CFG.guardSight) || !!G.plane || (G.nuke && G.nuke.state === 'warn');
    G.unseenT = seen ? 0 : G.unseenT + dt;
    if (G.unseenT > CFG.heatDecayDelay) G.heat = Math.max(0, G.heat - CFG.heatDecay * dt);
  }
  if (stars >= 3) G.reached3 = true;
  if (G.heat <= 0.001 && G.reached3) { G.reached3 = false; challengeDone('escape'); popup('通缉解除：你消失在了人群里', 'good'); }
  G.spawnT -= dt;
  const guards = G.humans.filter(h => h.kind === 'guard'), want = stars > 0 ? Math.min(9, 4 + stars * 2) : 0;
  if (G.spawnT <= 0 && guards.length < want && !G.overlay) {
    G.spawnT = 1.2; const a = Math.random() * 6.28, d = 45 + Math.random() * 25;
    const x = clampv(P.x + Math.cos(a) * d, BOUNDS.minX + 3, BOUNDS.maxX - 3), z = clampv(P.z + Math.sin(a) * d, BOUNDS.minZ + 3, BOUNDS.maxZ - 3);
    if (!pushOut(x, z, 0, 1.2).hit) G.humans.push(newGuard(x, z, true));
  }
  if (stars === 0) {
    G.vehicles = G.vehicles.filter(v => !(v.temp && !v.rider && !v.copRider && Math.hypot(v.x - P.x, v.z - P.z) > 40));
    G.vehicles.forEach(v => { if (v.ai === 'stampede' || v.ai === 'cop') v.ai = null; });
    G.humans = G.humans.filter(h => !(h.reinf && Math.hypot(h.x - P.x, h.z - P.z) > 55));
  }
  // 抓捕
  if (G.heat >= 1 && !G.overlay) for (const h of G.humans) {
    if (h.kind !== 'guard' || h.state !== 'walk') continue;
    const d = Math.hypot(h.x - P.x, h.z - P.z);
    if ((P.state === 'walk' && d < 1.3 && Math.abs(h.y - P.y) < 2.4) || (P.state === 'ride' && d < 2.6 && Math.abs(P.vehicle.sp) < 3)) { busted(); break; }
  }
  // 出口
  if (P.state === 'ride' && P.vehicle.kind === 'camel' && Math.hypot(P.x - EXIT.x, P.z - EXIT.z) < EXIT.r) challengeDone('camelExit');
}

function updateBananas(dt) {
  for (let i = G.bananas.length - 1; i >= 0; i--) {
    const b = G.bananas[i]; b.life -= dt; if (b.life <= 0) { G.bananas.splice(i, 1); continue; }
    let used = false;
    const ents = G.humans.concat([G.player]);
    for (const h of ents) {
      if (h.state !== 'walk' || Math.hypot(h.x - b.x, h.z - b.z) > 0.85 || Math.abs(h.y - b.y) > 1) continue;
      startRag(h, [h.vx * 1.6 + (Math.random() - 0.5) * 3, 5.5, h.vz * 1.6 + (Math.random() - 0.5) * 3]); used = true;
      if (h === G.player) popup('你踩到了自己的香蕉皮。逻辑自洽。'); else { chaos(60, '香蕉皮：经典永不过时'); if (h.kind === 'guard') addHeat(0.2); }
      G.bowl.push(G.time); Snd.boing(); break;
    }
    if (!used) for (const v of G.vehicles) if (Math.hypot(v.x - b.x, v.z - b.z) < VEH[v.kind].r + 0.6 && !v.air) {
      used = true; v.sp *= 0.4; shake(0.3); if (v.rider === G.player) { chaos(40, '载具打滑'); if (Math.abs(v.sp) > 3) ejectRider(v, [-Math.sin(v.h) * v.sp * 2, 6, -Math.cos(v.h) * v.sp * 2]); } Snd.boing(); break;
    }
    if (used) G.bananas.splice(i, 1);
  }
}

/* ---------------- 相机 ---------------- */
function updateCamera(dt) {
  const C = G.cam, P = G.player, veh = P.state === 'ride' ? P.vehicle : null;
  C.yaw -= mouse.dx * 0.0025; C.pitch = clampv(C.pitch - mouse.dy * 0.0025, -1.25, 0.5);
  if (mouse.dx || mouse.dy) mouse.idle = 0; else mouse.idle += dt;
  mouse.dx = mouse.dy = 0;
  if (veh && mouse.idle > 1.0 && Math.abs(veh.sp) > 3) C.yaw += angDiff(veh.h, C.yaw) * Math.min(1, dt * 1.6);
  const tx = P.x, ty = P.y + (veh ? (veh.kind === 'camel' ? 2.2 : 1.8) : (P.state === 'rag' ? 0.6 : 1.5)), tz = P.z;
  C.x = lerp(C.x, tx, Math.min(1, dt * 14)); C.y = lerp(C.y, ty, Math.min(1, dt * 10)); C.z = lerp(C.z, tz, Math.min(1, dt * 14));
  const want = veh ? CFG.camDistVeh : (P.state === 'rag' ? 8 : CFG.camDist);
  C.dist = lerp(C.dist, want, Math.min(1, dt * 3));
  // 沿视线反方向细步检测；身后没空间时把相机往上抬（俯视），而不是硬塞进墙里
  const cast = pitch => {
    const cp = Math.cos(pitch), f = [-Math.sin(C.yaw) * cp, Math.sin(pitch), -Math.cos(C.yaw) * cp];
    let free = C.dist;
    for (let d = 0.25; d <= C.dist; d += 0.25) if (camBlocked(C.x - f[0] * d, C.y - f[1] * d, C.z - f[2] * d, d < 1.5 ? 0.15 : 0.3)) { free = d - 0.3; break; }
    return { f, free };
  };
  let r = cast(C.pitch), lift = C.pitch;
  for (const pp of [-0.7, -1.0, -1.3, -1.565]) { if (r.free >= Math.min(2.8, C.dist)) break; if (pp >= lift) continue; const r2 = cast(pp); if (r2.free > r.free + 0.5) { r = r2; lift = pp; } }
  C.lift = lerp(C.lift || C.pitch, lift, Math.min(1, dt * 8)); C.free = lerp(C.free || r.free, r.free, r.free < (C.free || 0) ? 1 : Math.min(1, dt * 4));
  const cl = Math.cos(C.lift), f = [-Math.sin(C.yaw) * cl, Math.sin(C.lift), -Math.cos(C.yaw) * cl], free = Math.max(0.6, Math.min(C.free, cast(C.lift).free));
  let x = C.x - f[0] * free, y = C.y - f[1] * free, z = C.z - f[2] * free;
  y = Math.max(y, groundAt(x, z, y) + 0.5);
  C.rpitch = Math.atan2(C.y - y, Math.hypot(C.x - x, C.z - z));
  C.shake = Math.max(0, C.shake - dt * 1.8);
  if (C.shake > 0) { x += (Math.random() - 0.5) * C.shake * 0.5; y += (Math.random() - 0.5) * C.shake * 0.5; z += (Math.random() - 0.5) * C.shake * 0.5; }
  C.px = x; C.py = y; C.pz = z;
}

/* ---------------- 主更新 ---------------- */
function update(dt) {
  G.time += dt; G.mountCd -= dt; G.selfieCd -= dt;
  if (G.eReq) { G.eReq = false; if (!G.overlay) interact(); }
  if (G.fReq) { G.fReq = false; if (!G.overlay) useItem(); }
  if (G.gReq) { G.gReq = false; grabOrThrow(); }
  if (G.flopReq) { G.flopReq = false; if (!G.overlay) flop(); }
  updatePlayer(dt);
  { const P0 = G.player; sanitizeHuman(P0, 'state=' + P0.state + ' veh=' + (P0.vehicle ? P0.vehicle.kind : '-') + ' air=' + P0.air);
    if (P0.state === 'walk' && !P0.air && G.time - (P0.safeT || 0) > 0.4) { P0.safeT = G.time; P0.lastSafe = { x: P0.x, y: P0.y, z: P0.z }; } }
  for (const v of G.vehicles) updateVehicle(v, dt);
  for (const h of G.humans) { updateNpc(h, dt); if (!Number.isFinite(h.x + h.z + h.yaw + h.moveAmt)) sanitizeHuman(h, "npc"); }
  for (const p of G.props) updateProp(p, dt);
  updateBananas(dt); updateWanted(dt); updateCops(dt); FX.update(dt); Social.update(dt);
  for (const p of G.pickups) if (!p.active) { p.t -= dt; if (p.t <= 0) p.active = true; }
  if (G.time - G.lastHurt > 6 && G.hp < CFG.hpMax && !G.overlay) G.hp = Math.min(CFG.hpMax, G.hp + 3 * dt);
  if (G.time - G.lastChaos > CFG.comboWindow) G.combo = 0;
  if (G.time > 4 && !G.narr.start) narrate('start', '欢迎来到不太严肃的旅游景区。规则：没有规则（保安除外）。');
  const rag = G.humans.filter(h => h.state === 'rag').length; if (rag >= 4) narrate('pile', '景区里躺平的人越来越多，这被称为“集体旅行疲劳”。');
  updateCamera(dt);
  renderHud(dt);
}

/* ---------------- 渲染 ---------------- */
const KEYF = [
  { t: 0, top: [.20, .40, .80], hor: [.80, .84, .88], sun: [1, .95, .83], amb: [.46, .54, .66], el: 62 },
  { t: .7, top: [.26, .40, .72], hor: [.95, .78, .58], sun: [1, .78, .5], amb: [.46, .45, .52], el: 24 },
  { t: 1, top: [.22, .20, .42], hor: [.95, .50, .30], sun: [1, .5, .22], amb: [.40, .34, .42], el: 5 },
];
function envAt(p) {
  const a = p < KEYF[1].t ? KEYF[0] : KEYF[1], b = p < KEYF[1].t ? KEYF[1] : KEYF[2], k = clampv((p - a.t) / (b.t - a.t), 0, 1);
  const el = lerp(a.el, b.el, k) * Math.PI / 180, hor = lerpV(a.hor, b.hor, k);
  return { top: lerpV(a.top, b.top, k), hor, sunCol: lerpV(a.sun, b.sun, k).map(v => v * 0.86), amb: lerpV(a.amb, b.amb, k).map(v => v * 0.72), sunDir: [-0.5 * Math.cos(el), Math.sin(el), 0.866 * Math.cos(el)], fog: hor, fogN: 110, fogF: 360 };
}
const tagPool = [];
function getTag(i) { if (!tagPool[i]) { const d = document.createElement('div'); d.className = 'tag'; $('tags').appendChild(d); tagPool[i] = d; } return tagPool[i]; }

function render() {
  const C = G.cam, P = G.player, t = G.time;
  const p = 0.08 + 0.62 * (0.5 - 0.5 * Math.cos(t / 110)), env = envAt(p);
  const cam = { x: C.px, y: C.py, z: C.pz, yaw: C.yaw, pitch: C.rpitch !== undefined ? C.rpitch : C.pitch, fov: (innerWidth < innerHeight ? 80 : 68) * Math.PI / 180, t };
  const dyn = [], R = renderer.m, d2 = (x, z) => (x - P.x) * (x - P.x) + (z - P.z) * (z - P.z);
  const shadow = (x, y, z, r) => renderer.shadowOn || dyn.push({ mesh: R.cyl, m: M4.compose(x, y + 0.07, z, 0, 0, 0, r, 0.04, r), col: [0.55, 0.45, 0.3], unlit: true, rad: 3 });
  drawPolice(dyn, cam);
  drawHuman(P, dyn); if (P.state !== 'rag') shadow(P.x, P.state === 'ride' ? P.vehicle.y : P.y, P.z, 1.1);
  const cfx = -Math.sin(cam.yaw), cfz = -Math.cos(cam.yaw), behind = (x, z) => (x - cam.x) * cfx + (z - cam.z) * cfz < -8;
  for (const h of G.humans) { const d = d2(h.x, h.z); if (d > 150 * 150 || (h.state !== 'rag' && behind(h.x, h.z))) continue; drawHuman(h, dyn, d > 55 * 55); if (h.state !== 'rag' && !h.jet && d < 45 * 45) shadow(h.x, h.state === 'held' ? groundAt(h.x, h.z, h.y) : h.y, h.z, 1.0); }
  for (const v of G.vehicles) { if (d2(v.x, v.z) > 170 * 170 || (v !== P.vehicle && behind(v.x, v.z))) continue; drawVehicle(v, dyn); shadow(v.x, groundAt(v.x, v.z, v.y), v.z, VEH[v.kind].r * 1.3); }
  Social.draw(dyn, shadow);
  for (const pr of G.props) if (d2(pr.x, pr.z) < 130 * 130 && !behind(pr.x, pr.z)) drawProp(pr, dyn);
  for (const b of G.bananas) { dyn.push({ mesh: R.sph, m: M4.compose(b.x, b.y + 0.12, b.z, 0, 0, 0, 0.6, 0.18, 0.3), col: [1, 0.9, 0.2], rad: 2 }); }
  for (const pk of G.pickups) if (pk.active) { const hy = 1.1 + Math.sin(t * 3 + pk.x) * 0.2, c = { selfie: [1, 0.3, 0.6], horn: [1, 0.6, 0.1], jetpack: [0.3, 0.8, 1], banana: [1, 0.9, 0.2] }[pk.kind]; dyn.push({ mesh: R.sph, m: M4.compose(pk.x, hy, pk.z, 0, t * 2, 0, 0.85, 0.85, 0.85), col: c, unlit: true, rad: 2 }); dyn.push({ mesh: R.sph, m: M4.compose(pk.x, hy, pk.z, 0, t * 2, 0, 1.25 + Math.sin(t * 4) * 0.08, 1.25, 1.25), col: [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], unlit: true, rad: 2 }); shadow(pk.x, 0, pk.z, 0.8); }
  // 手持道具 / 喷射背包
  if (P.state !== 'rag') {
    const pose = standPose(P), f = [-Math.sin(P.yaw), 0, -Math.cos(P.yaw)], it = G.item;
    if (it && it.type === 'jetpack') {
      const b = addk(pose.chest, f, -0.38); dyn.push({ mesh: renderer.rbox(0.5, 0.7, 0.3, 0.12), m: M4.compose(b[0], b[1], b[2], 0, P.yaw, 0, 1, 1, 1), col: [0.6, 0.62, 0.68], rad: 2 });
      if (G.jet) [-0.15, 0.15].forEach(o => { const rr = [Math.cos(P.yaw) * o, 0, -Math.sin(P.yaw) * o]; const fp = [b[0] + rr[0], b[1] - 0.5, b[2] + rr[2]]; dyn.push({ mesh: R.cone, m: M4.seg(fp, [fp[0], fp[1] - 1.4 - Math.random() * 0.8, fp[2]], 0.28, 0.28, true), col: [1, 0.65, 0.1], unlit: true, rad: 2 }); });
    } else if (it && it.type === 'selfie') {
      const hp = pose.handR; dyn.push({ mesh: R.cyl, m: M4.seg(hp, [hp[0] + f[0] * 0.5, hp[1] + 0.9, hp[2] + f[2] * 0.5], 0.06, 0.06), col: [0.15, 0.15, 0.15], rad: 2 });
      dyn.push({ mesh: R.cube, m: M4.compose(hp[0] + f[0] * 0.5, hp[1] + 0.95, hp[2] + f[2] * 0.5, 0, P.yaw, 0, 0.22, 0.4, 0.05), col: [0.2, 0.7, 1], unlit: true, rad: 2 });
    } else if (it && it.type === 'horn') { const hp = pose.handR; dyn.push({ mesh: R.cone, m: M4.seg(hp, [hp[0] + f[0] * 0.7, hp[1] + 0.1, hp[2] + f[2] * 0.7], 0.45, 0.45, true), col: [1, 0.55, 0.1], rad: 2 }); }
    else if (it && it.type === 'banana') { const hp = pose.handR; dyn.push({ mesh: R.sph, m: M4.compose(hp[0], hp[1] + 0.1, hp[2], 0, 0, 0, 0.5, 0.15, 0.2), col: [1, 0.9, 0.2], rad: 2 }); }
  }
  if (G.dbg) { const C2 = G.cam, f1 = v => Number.isFinite(v) ? v.toFixed(2) : String(v); $('dbg').textContent = `state=${P.state} sit=${!!P.sit} veh=${P.vehicle ? P.vehicle.kind : '-'} rag=${!!P.rag} air=${P.air}\npos=${f1(P.x)},${f1(P.y)},${f1(P.z)} yaw=${f1(P.yaw)}\nanim=${f1(P.anim)} mv=${f1(P.moveAmt)} run=${f1(P.runAmt)} diz=${f1(P.dizzy)}\ncam d=${f1(Math.hypot(C2.px - P.x, C2.py - P.y - 1.2, C2.pz - P.z))} free=${f1(C2.free)} lift=${f1(C2.lift)}\ndraw=${renderer.lastDrawn} heals=${(window.__heals || []).length}`; }
  document.body.classList.toggle('nocursor', G.phase === 'play' && !G.paused && !G.overlay && !G.chatOpen);         // 游玩时隐藏鼠标指针
  renderer.frame(cam, env, dyn, FX.collect(cam));
  if (G.snapReq) { try { $('polImg').src = renderer.canvas.toDataURL('image/jpeg', 0.55); $('polCap').textContent = G.snapReq.tags.join(' · ') || '普通游客照'; $('polaroid').classList.remove('hidden'); clearTimeout(G.polT); G.polT = setTimeout(() => $('polaroid').classList.add('hidden'), 4500); } catch (e) {} G.snapReq = null; }
  // 标签
  const proj = M4.persp(cam.fov, innerWidth / innerHeight, 0.1, 700), vp = M4.mul(proj, M4.mul(M4.mul(M4.RX(-cam.pitch), M4.RY(-cam.yaw)), M4.T(-cam.x, -cam.y, -cam.z)));
  const labels = [];
  G.pickups.forEach(pk => { if (pk.active) labels.push([pk.x, 2.2, pk.z, ITEMS[pk.kind].icon + ' ' + ITEMS[pk.kind].name, 30]); });
  G.humans.forEach(h => { if (h.kind === 'merchant') labels.push([h.x, 3.2, h.z, h.vendor === 'souvenir' ? '🛍️ 纪念品（E · $10 随机道具）' : '🐪 租骆驼（E · $15）', 25]); });
  G.vehicles.forEach(v => { if (!v.rider && !v.ai) labels.push([v.x, v.y + (v.kind === 'camel' ? 5.2 : 3.4), v.z, '🚗 ' + VEH[v.kind].name + '（E 骑乘）', 16]); });
  let n = 0;
  for (const l of labels) {
    const d = Math.hypot(l[0] - P.x, l[2] - P.z); if (d > l[4]) continue;
    const cw = vp[3] * l[0] + vp[7] * l[1] + vp[11] * l[2] + vp[15]; if (cw < 0.1) continue;
    const cx = (vp[0] * l[0] + vp[4] * l[1] + vp[8] * l[2] + vp[12]) / cw, cy = (vp[1] * l[0] + vp[5] * l[1] + vp[9] * l[2] + vp[13]) / cw;
    if (Math.abs(cx) > 1.1 || Math.abs(cy) > 1.1 || n > 13) continue;
    const el = getTag(n++); el.style.display = 'block'; el.textContent = l[3]; el.style.left = ((cx * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((1 - (cy * 0.5 + 0.5)) * innerHeight) + 'px';
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
  Social.overlay(vp);
}

/* ---------------- HUD ---------------- */
let hudCache = {};
const mini = { ctx: null };
function renderHud(dt) {
  const c = hudCache, set = (k, v, fn) => { if (c[k] !== v) { c[k] = v; fn(v); } }, P = G.player;
  set('m', G.money, v => $('vMoney').textContent = '$' + v);
  set('h', Math.round(G.hp), v => { $('vHp').textContent = v; $('bHp').style.width = v + '%'; });
  set('s', G.score, v => $('vScore').textContent = v.toLocaleString());
  set('b', G.best, v => $('vBest').textContent = '最高 ' + v.toLocaleString());
  set('cb', G.combo, v => { $('vCombo').textContent = v > 1 ? '×' + v + ' 连击' : ''; });
  set('st', Math.floor(G.heat), v => { $('vStars').textContent = '★'.repeat(v) + '☆'.repeat(5 - v); $('vStars').classList.toggle('on', v > 0); });
  set('hf', Math.round(G.heat * 20), () => $('bHeat').style.width = Math.min(100, (G.heat % 1) * 100 + (Math.floor(G.heat) >= 5 ? 100 : 0)) + '%');
  const it = G.item, itxt = it ? `${ITEMS[it.type].icon} ${ITEMS[it.type].name}${it.type === 'jetpack' ? ' ' + Math.round(G.fuel) + '%' : it.ammo !== Infinity ? ' ×' + it.ammo : ''}` : '— 空手 —';
  set('it', itxt, v => $('vItem').textContent = v); set('ih', it ? ITEMS[it.type].hint : '去捡发光的方块', v => $('vItemHint').textContent = v);
  const veh = P.state === 'ride' ? P.vehicle : null;
  const sp = veh ? Math.round(Math.abs(veh.sp) * 3.6) + ' km/h' + (veh.kind === 'sled' ? '  ⛽' + Math.round(veh.fuel) + '%' : '') : '';
  set('sp', sp, v => $('vSpeed').textContent = v);
  const near = nearestInteract(), pr = $('prompt');
  let ptxt = '';
  if (veh) ptxt = 'E 下车' + (veh.kind === 'camel' ? ' · 空格 跳' : ' · 空格 刹车') + ' · Shift 加速 · F 喇叭/自拍';
  else if (G.held) ptxt = 'G / 鼠标左键：把TA扔出去！';
  else if (near) ptxt = near.type === 'veh' ? `E 骑乘 ${VEH[near.o.kind].name}` : near.o.vendor === 'souvenir' ? `E 买随机道具 $${CFG.shopPrice}` : `E 租骆驼 $${CFG.rentPrice}`;
  else if (nearestGrab()) ptxt = 'G 抓起 TA';
  set('pr', ptxt, v => { pr.textContent = v; pr.classList.toggle('hidden', !v); });
  const ov = G.overlay; set('ov', ov ? ov.text + ov.sub : '', () => { const el = $('overlay'); el.classList.toggle('hidden', !ov); if (ov) { $('ovText').textContent = ov.text; $('ovText').className = ov.kind; $('ovSub').textContent = ov.sub; } });
  drawMinimap();
}
function drawMinimap() {
  const cv = $('mini'), cx = mini.ctx || (mini.ctx = cv.getContext('2d')), P = G.player, k = 150 / 285, X = x => (x + 130) * k, Z = z => (z + 155) * k;
  cx.fillStyle = '#e8d29a'; cx.fillRect(0, 0, 150, 150);
  W.mini.forEach(m => { cx.fillStyle = m[4]; cx.fillRect(X(m[0] - m[2] / 2), Z(m[1] - m[3] / 2), Math.max(1, m[2] * k), Math.max(1, m[3] * k)); });
  cx.fillStyle = '#5be37d'; cx.fillRect(X(EXIT.x - 4), Z(EXIT.z - 8), 8 * k, 16 * k);
  cx.fillStyle = '#ffe34a'; G.pickups.forEach(p => { if (p.active) cx.fillRect(X(p.x) - 1.5, Z(p.z) - 1.5, 3, 3); });
  G.vehicles.forEach(v => { cx.fillStyle = v.ai === 'stampede' || v.ai === 'cop' ? '#ff6b00' : '#1e90ff'; cx.fillRect(X(v.x) - 2, Z(v.z) - 2, 4, 4); });
  G.humans.forEach(h => { if (h.kind === 'guard' && G.heat >= 1) { cx.fillStyle = '#ff2d2d'; cx.fillRect(X(h.x) - 1.5, Z(h.z) - 1.5, 3, 3); } });
  G.humans.forEach(h => { if (h.jet) { cx.fillStyle = '#35e0ff'; cx.fillRect(X(h.x) - 2, Z(h.z) - 2, 4, 4); } });
  if (G.plane && G.plane.state === 'pass') { cx.fillStyle = '#fff'; cx.strokeStyle = '#d00'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(X(G.plane.x), Z(G.plane.z), 3.5, 0, 6.3); cx.fill(); cx.stroke(); }
  if (G.nuke && G.nuke.state === 'warn') { cx.strokeStyle = (Math.floor(G.time * 4) % 2) ? '#ff2020' : '#ffe020'; cx.lineWidth = 2; cx.beginPath(); cx.arc(X(G.nuke.x), Z(G.nuke.z), NUKE_R * k, 0, 6.3); cx.stroke(); }
  cx.save(); cx.translate(X(P.x), Z(P.z)); cx.rotate(-G.cam.yaw); cx.fillStyle = '#fff'; cx.strokeStyle = '#000'; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(0, -6); cx.lineTo(4, 4); cx.lineTo(-4, 4); cx.closePath(); cx.fill(); cx.stroke(); cx.restore();
}

/* ---------------- 流程 / 输入 ---------------- */
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (!G) return;
  if (G.phase === 'play' && !G.paused && !Cust.open) update(dt);
  if (Cust.open) Cust.camUpdate(dt);
  render();
}
function lockPointer() { if (G && G.noLock) return; if (typeof Touch !== 'undefined' && Touch.on) return; try { const r = $('gl').requestPointerLock(); if (r && r.catch) r.catch(() => { if (G) G.noLock = true; }); } catch (e) { if (G) G.noLock = true; } }
function setPaused(p) { if (!G || G.phase !== 'play' || G.paused === p) return; G.paused = p; $('screenPause').classList.toggle('hidden', !p); if (p) { Object.keys(K).forEach(k => K[k] = false); G.jumpReq = G.eReq = G.fReq = G.flopReq = false; mouse.dx = mouse.dy = 0; } }
function startGame() {
  Snd.init(); Snd.setMute(Snd.mute); newGame(); Social.join();
  $('screenMenu').classList.add('hidden'); $('screenPause').classList.add('hidden'); $('hud').classList.remove('hidden');
  popup(Touch.on ? '左边摇杆移动 · 右边拖动转视角 · 右下角按钮：跳/互动/道具/抓人' : 'WASD 移动 · 鼠标看 · Shift 冲刺 · 空格 跳 · E 交互/上下车 · F 用道具 · R 摔倒 · G 抓人/扔人', 'narr');
  popup('先去捡前面那个发光的方块（自拍杆）。', 'narr');
}
function bindInput() {
  addEventListener('keydown', e => {
    if (!G) return;
    if (e.target && e.target.tagName === 'INPUT') return;                                 // 在输入框里打字时不触发游戏按键
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (G.phase === 'play' && !G.paused && !G.overlay) { e.preventDefault(); Social.openChat(); } return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') { Snd.setMute(!Snd.mute); return; }
    if (e.code === 'KeyQ' && !e.repeat) { const o = ['high', 'med', 'low'], q = o[(o.indexOf(renderer.q) + 1) % 3]; renderer.setQuality(q); popup('画质：' + { high: '高（阴影+光效）', med: '中', low: '低（无阴影/后期）' }[q]); return; }
    if (e.code === 'F3') { e.preventDefault(); G.dbg = !G.dbg; $('dbg').style.display = G.dbg ? 'block' : 'none'; return; }
    if (e.code === 'KeyT' && G.phase === 'play' && !G.paused) { const P = G.player; if (P.vehicle && P.vehicle.rider === P) P.vehicle.rider = null; P.vehicle = null; P.sit = null; P.rag = null; P.state = 'walk'; P.air = false; P.vx = P.vz = P.vy = 0; P.y = groundAt(P.x, P.z, P.y + 1); sanitizeHuman(P, 'manualT'); snapCam(); popup('已把角色找回来（T）'); return; }
    if (e.code === 'Escape') { if (G.paused) { lockPointer(); Snd.init(); } setPaused(!G.paused); return; }
    if (G.paused) return;
    if (!e.repeat) {
      if (e.code === 'KeyE') G.eReq = true; else if (e.code === 'KeyF') G.fReq = true; else if (e.code === 'KeyR') G.flopReq = true; else if (e.code === 'KeyG') G.gReq = true; else if (e.code === 'Space') G.jumpReq = true;
    }
    K[e.code] = true;
  });
  addEventListener('keyup', e => { K[e.code] = false; });
  addEventListener('blur', () => { if (G && G.phase === 'play') setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) setPaused(true); });
  document.addEventListener('pointerlockchange', () => { if (!G) return; if (document.pointerLockElement) G.hadLock = true; else if (G.hadLock && G.phase === 'play' && !G.paused && !G.chatOpen && performance.now() - (G.chatT || -9999) > 900) setPaused(true); });
  document.addEventListener('pointerlockerror', () => { if (G) G.noLock = true; });
  let drag = false; const cv = $('gl');
  cv.addEventListener('mousedown', e => { if (G && G.chatOpen) Social.close(false); drag = true; if (G && G.phase === 'play' && !G.paused && !document.pointerLockElement) lockPointer(); if (e.button === 0 && G && G.held && document.pointerLockElement) G.gReq = true; }); addEventListener('mouseup', () => { drag = false; });
  addEventListener('mousemove', e => { if (!G || G.paused) return; if (document.pointerLockElement || drag) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
  $('btnCust').onclick = () => Cust.show(); $('btnCust2').onclick = () => Cust.show();
  $('btnStart').onclick = () => { startGame(); lockPointer(); };
  $('btnResume').onclick = () => { lockPointer(); Snd.init(); setPaused(false); };
  $('btnRestart').onclick = () => { startGame(); lockPointer(); };
  $('btnMute').onclick = () => Snd.setMute(!Snd.mute);
  $('btnPause').onclick = () => setPaused(true);
}
function boot() {
  try { renderer = new Renderer($('gl')); } catch (e) { $('err').textContent = '无法初始化 WebGL：' + e.message; $('err').classList.remove('hidden'); return; }
  bindInput(); newGame(); G.phase = 'menu'; Social.init(); Touch.init();          // 菜单背景
  G.cam.px = 0; G.cam.py = 8; G.cam.pz = 112; G.cam.pitch = -0.1;
  requestAnimationFrame(loop);
  window.__pc = { step: dt => update(dt), get G() { return G; }, get W() { return W; }, startGame, K, startRag, hitHuman, chaos, addHeat, challengeDone, busted, die, giveItem, interact, useItem, mount, takeSelfie, Net, Social };
}
addEventListener('error', e => { const el = $('err'); if (el) { el.textContent = '脚本错误：' + e.message; el.classList.remove('hidden'); } });
boot();
