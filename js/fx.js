/* 粒子特效：沙尘、爆炸烟团、核爆蘑菇云、喷射尾焰。由 Renderer 以广告牌方式绘制。 */
const FX = {
  list: [], acc: 0, nukeT: -1, nukeAt: null,
  reset() { this.list.length = 0; this.nukeT = -1; this.nukeAt = null; },
  emit(o) { if (this.list.length > 1800) this.list.splice(0, 200); this.list.push(Object.assign({ vx: 0, vy: 0, vz: 0, size: 1, grow: 1, rot: Math.random() * 6.28, vr: 0, r: 1, g: 1, b: 1, a: 0.5, life: 1, t: 0, add: false, drag: 1, buoy: 0, seed: Math.random() }, o)); },
  dust(x, y, z, n, k = 1, c = [0.86, 0.72, 0.48]) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = (0.6 + Math.random() * 1.6) * k;
      this.emit({ x: x + (Math.random() - .5) * .4, y: y + 0.1, z: z + (Math.random() - .5) * .4, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 0.5 + Math.random() * 1.2 * k, size: 0.35 * k, grow: 2.4, a: 0.30, life: 0.9 + Math.random() * 0.7, r: c[0], g: c[1], b: c[2], drag: 2.2, buoy: 0.25, vr: (Math.random() - .5) * 1.5 }); }
  },
  boom(x, y, z, R) {
    for (let i = 0; i < 10; i++) this.emit({ x, y: y + 1, z, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, vz: (Math.random() - .5) * 3, size: R * 0.32, grow: 1.8, a: 0.95, life: 0.5 + Math.random() * 0.25, r: 1.6, g: 0.75, b: 0.25, add: true, drag: 3 });
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.283, s = 2 + Math.random() * R * 1.3;
      this.emit({ x, y: y + 0.6, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 1 + Math.random() * 5, size: R * 0.3, grow: 2.2, a: 0.55, life: 2.2 + Math.random() * 1.8, r: 0.13, g: 0.12, b: 0.12, drag: 1.4, buoy: 1.8 }); }
    this.dust(x, y, z, 14, 3);
  },
  nuke(x, y, z) { this.nukeT = 0; this.nukeAt = { x, y, z }; this.boom(x, y, z, 14); },
  update(dt) {
    const G = window.G; if (!G || G.phase !== 'play') return;
    // 核爆持续喷发：地面冲击环 → 烟柱 → 蘑菇云
    if (this.nukeT >= 0) {
      const n = this.nukeAt, T = this.nukeT; this.nukeT += dt;
      if (T < 9) {
        const rate = 28 * dt, cnt = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
        for (let i = 0; i < cnt; i++) {
          const k = Math.min(1, T / 7), h = 6 + k * 52, a = Math.random() * 6.283;
          if (T < 5) { const rr = Math.random() * 7 * (1 + k); this.emit({ x: n.x + Math.cos(a) * rr, y: n.y + Math.random() * h, z: n.z + Math.sin(a) * rr, vy: 5 + Math.random() * 6, size: 7 + Math.random() * 4, grow: 1.4, a: 0.7, life: 5 + Math.random() * 2, r: 0.35, g: 0.28, b: 0.24, drag: .5, buoy: 0.5 }); }
          const cr = 6 + 26 * k * Math.random(); this.emit({ x: n.x + Math.cos(a) * cr, y: n.y + h + Math.random() * 6, z: n.z + Math.sin(a) * cr, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 2 + Math.random() * 3, size: 10 + Math.random() * 6, grow: 1.3, a: 0.65, life: 6 + Math.random() * 2, r: 0.55 - 0.2 * Math.random(), g: 0.32, b: 0.2, drag: .6, buoy: 0.3 });
          this.emit({ x: n.x + Math.cos(a) * cr * 0.7, y: n.y + h * (0.85 + 0.15 * Math.random()), z: n.z + Math.sin(a) * cr * 0.7, size: 9 + Math.random() * 5, grow: 1.0, a: 0.6 * (1 - k * 0.7), life: 1.4, r: 2.2, g: 1.0, b: 0.3, add: true, drag: 1 });
        }
        if (T < 4) { const rn = Math.floor(40 * dt) + 1; for (let i = 0; i < rn; i++) { const a = Math.random() * 6.283, s = 22 + Math.random() * 22; this.emit({ x: n.x, y: n.y + 1, z: n.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 1, size: 5, grow: 2.6, a: 0.45, life: 3.5, r: 0.82, g: 0.68, b: 0.46, drag: 1.1, buoy: 0.3 }); } }
      } else this.nukeT = -1;
    }
    // 角色/载具的日常沙尘
    this.acc += dt; if (this.acc < 0.09) { this.step(dt); return; } this.acc = 0;
    const P = G.player;
    if (P.state === 'walk' && !P.air && (P.runAmt || 0) > 0.6 && (P.moveAmt || 0) > 0.5) this.dust(P.x, P.y, P.z, 1, 0.55);
    for (const v of G.vehicles) { if (!v.air && Math.abs(v.sp || 0) > 5 && (v.rider || v.copRider)) { const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < 70) this.dust(v.x - Math.sin(v.heading || 0) * 0, v.y || 0, v.z, 1, 0.9 + Math.min(1, Math.abs(v.sp) / 18)); } }
    this.step(dt);
  },
  step(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.buoy * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
    }
  },
  /** 生成渲染用粒子（随生命周期变大/淡出） */
  collect(cam) {
    const out = [], L = this.list, R2 = 260 * 260;
    for (const p of L) {
      const dx = p.x - cam.x, dz = p.z - cam.z; if (dx * dx + dz * dz > R2) continue;
      const k = p.t / p.life, fade = Math.min(1, p.t / 0.08) * Math.pow(1 - k, p.add ? 1.6 : 1.1);
      out.push({ x: p.x, y: p.y, z: p.z, size: p.size * (1 + p.grow * Math.sqrt(k)), rot: p.rot, r: p.r, g: p.g, b: p.b, a: p.a * fade, add: p.add, seed: p.seed });
    }
    return out;
  },
};
