/* 聊天气泡 + 房间在线玩家列表 + 远程玩家渲染（依赖 net.js / entities.js / game.js 的全局） */
const Social = {
  bubbles: new Map(), remotes: new Map(), open: false, els: new Map(),
  rgb(a) { return a ? `rgb(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)})` : '#ccc'; },
  init() {
    const sv = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    $('nameIn').value = sv('pc_name') || L('游客') + Math.floor(100 + Math.random() * 900);
    $('srvIn').value = sv('pc_srv'); if (/^https?:$/.test(location.protocol)) $('srvLabel').style.display = 'none';   // 网页版：所有人固定进同一房间，自动连本服务器
    Net.getState = () => {
      const P = G.player, v = P.state === 'ride' && P.vehicle ? P.vehicle : null, r = x => Math.round(x * 100) / 100;
      return { x: r(P.x), y: r(P.y), z: r(P.z), yaw: r(P.yaw), anim: r(P.anim), mv: r(P.moveAmt), run: r(P.runAmt), air: !!P.air, look: P.look, cj: Cust.json,
        st: P.state === 'held' ? 'held' : '', by: P.state === 'held' ? P.carrierId : '', rg: P.state === 'rag' && P.rag ? RAG_NAMES.flatMap(n => P.rag.p[n].map(r)) : null,
        veh: v ? { k: v.kind, x: r(v.x), y: r(v.y), z: r(v.z), h: r(v.h), sp: r(v.sp), ph: r(v.ph) } : null };
    };
    Net.onChat = e => this.addBubble(e.id, e.text);
    Net.onEv = m => this.onEv(m);
    Net.onChange = () => this.renderRoom();
    setInterval(() => this.renderRoom(), 1000);
    $('chatIn').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.close(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(false); }
    });
  },
  join() {
    const v = id => $(id).value.trim();
    try { localStorage.setItem('pc_name', v('nameIn')); localStorage.setItem('pc_srv', v('srvIn')); } catch (e) {}
    Net.join('lobby', v('nameIn'), v('srvIn')); this.bubbles.clear(); this.renderRoom();
  },
  openChat() {
    if (!G || G.phase !== 'play' || G.paused || this.open) return;
    this.open = true; G.chatOpen = true; G.chatT = performance.now(); Object.keys(K).forEach(k => K[k] = false); mouse.dx = mouse.dy = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    $('chatBox').classList.remove('hidden'); $('chatIn').value = ''; $('chatIn').focus();
  },
  close(send) {
    if (!this.open) return;
    const t = $('chatIn').value.trim(); this.open = false; G.chatOpen = false; G.chatT = performance.now(); $('chatBox').classList.add('hidden'); $('chatIn').blur();
    if (send && t) this.submit(t);
    lockPointer();
  },
  submit(t) {
    let m;
    if ((m = /^\/name\s+(.+)/.exec(t))) { Net.rename(m[1]); $('nameIn').value = Net.name; try { localStorage.setItem('pc_name', Net.name); } catch (e) {} popup(L('昵称已改为：') + Net.name); }
    else Net.chat(t);
  },
  addBubble(id, text) { this.bubbles.set(id, { text, t0: performance.now(), dur: Math.min(13000, 5500 + text.length * 160) }); },
  renderRoom() {
    if (typeof G === 'undefined' || !G || !Net.joined) { $('roomPanel').classList.add('hidden'); return; }
    $('roomPanel').classList.remove('hidden');
    $('rRoom').textContent = L('房间 ') + Net.room; $('rMode').textContent = Net.mode === 'ws' ? L('🌐 联机') : L('🖥 本机标签页');
    const peers = [...Net.peers.values()].filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name));
    $('rCount').textContent = L('在线 ') + (peers.length + 1);
    const li = (name, look, me) => `<li><i style="background:${this.rgb(look && look.shirt)}"></i><span>${esc(name)}</span>${me ? L('<em>你</em>') : ''}</li>`;
    $('rList').innerHTML = li(Net.name, G.player.look, true) + peers.map(p => li(p.name, p.look, false)).join('');
    const now = performance.now();
    $('chatLog').innerHTML = Net.log.slice(-6).map(e => `<div class="${now - e.t > 14000 ? 'old' : ''}"><b>${esc(e.name)}</b>${esc(e.text)}</div>`).join('');
  },
  /* ---- 玩家当 NPC：抓 / 扔 / 撞（受害者本地结算，事件经 Net 发送） ---- */
  grabbable() { const o = []; for (const r of this.remotes.values()) if (!r.held && r.h.state === 'walk' && !r.veh) o.push(r.h); return o; },
  grab(h) { const r = this.remotes.get(h.remoteId); if (r) { r.held = true; Net.sendEv(h.remoteId, 'grab'); } },
  release(h, k, d) { const r = this.remotes.get(h.remoteId); if (r) { r.held = false; h.state = 'walk'; Net.sendEv(h.remoteId, k, d); } },
  hitNear(x, z, rad, velFn) {
    for (const r of this.remotes.values()) {
      const h = r.h; if (r.held || h.state === 'rag' || h.state === 'held' || (r.cd || 0) > G.time) continue;
      const dx = h.x - x, dz = h.z - z, d = Math.hypot(dx, dz); if (d > rad || Math.abs(h.y - G.player.y) > 3) continue;
      r.cd = G.time + 1; Net.sendEv(r.id, 'hit', { v: velFn(dx, dz, d) }); chaos(50, L('撞飞玩家 ') + ((Net.peers.get(r.id) || {}).name || '')); Snd.boing();
    }
  },
  onEv(m) {
    const P = G.player, nm = m.name || L('有人'); if (!G || G.phase !== 'play' || G.overlay || Cust.open) return;
    const leave = () => { if (P.state === 'ride') { if (P.vehicle && P.vehicle.rider === P) P.vehicle.rider = null; P.vehicle = null; P.sit = null; P.state = 'walk'; } if (G.held) dropHeld(); };
    if (m.k === 'grab') {
      if (P.state === 'rag' || P.state === 'held') return; const c = (this.remotes.get(m.id) || {}).h; if (!c) return;
      leave(); P.state = 'held'; P.carrier = c; P.carrierId = m.id; P.struggle = 0; P.air = true; G.jet = false; popup(L('{0} 把你提起来了！连按空格挣脱', nm), 'bad'); Snd.boing();
    } else if (m.k === 'hit') {
      if (P.state === 'held') { P.state = 'walk'; P.carrier = null; } leave(); startRag(P, m.d.v); shake(0.4); Snd.boing(); popup(L('{0} 把你撞飞了！', nm), 'bad');
    } else if (m.k === 'throw') {
      if (P.state !== 'held') return; P.state = 'walk'; P.carrier = null; if (m.d.p) { P.x = m.d.p[0]; P.y = m.d.p[1]; P.z = m.d.p[2]; } startRag(P, m.d.v); shake(0.4); Snd.crash(); popup(L('{0} 把你扔出去了！', nm), 'bad');
    } else if (m.k === 'drop') {
      if (P.state !== 'held') return; P.state = 'walk'; P.carrier = null; startRag(P, [0, 2, 0]);
    } else if (m.k === 'free') {
      if (G.held && G.held.remoteId === m.id) { const h = G.held; G.held = null; const r = this.remotes.get(m.id); if (r) r.held = false; h.state = 'walk'; popup(L('{0} 挣脱了', nm)); }
    }
  },
  /** 每帧：同步远程玩家（插值）、必要时创建/清理 */
  update(dt) {
    const live = new Set(), k = Math.min(1, dt * 10);
    for (const p of Net.peers.values()) {
      if (p.x === undefined) continue; live.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) { const h = new Human({ kind: 'remote', x: p.x, z: p.z, look: {} }); h.y = p.y; h.remoteId = p.id; r = { h, veh: null, id: p.id }; this.remotes.set(p.id, r); }
      const h = r.h; if (p.cj && p.cj !== r.cj) { try { h.look = makeLook(JSON.parse(p.cj)); r.cj = p.cj; } catch (e) {} } else if (!p.cj && p.look && p.look.skin) h.look = p.look;
      if (r.held) { h.look = h.look; continue; }                                   // 被我抓在手里：位置/姿势由抓人逻辑控制
      if (p.rg) {                                                                   // 被打飞：同步布娃娃姿势
        if (h.state !== 'rag' || !h.rag) { h.rag = { p: {}, q: {}, t: 0, rest: 0 }; RAG_NAMES.forEach((n, i) => h.rag.p[n] = [p.rg[i * 3], p.rg[i * 3 + 1], p.rg[i * 3 + 2]]); }
        RAG_NAMES.forEach((n, i) => { const q = h.rag.p[n]; q[0] += (p.rg[i * 3] - q[0]) * k; q[1] += (p.rg[i * 3 + 1] - q[1]) * k; q[2] += (p.rg[i * 3 + 2] - q[2]) * k; });
        h.state = 'rag'; h.carrier = null; h.x = p.x; h.y = p.y; h.z = p.z; r.veh = null; continue;
      }
      if (h.state === 'rag') { h.rag = null; h.state = 'walk'; h.x = p.x; h.y = p.y; h.z = p.z; }
      if (p.st === 'held') { const c = p.by === Net.id ? G.player : (this.remotes.get(p.by) || {}).h; h.carrier = c || null; h.state = c ? 'held' : 'walk'; h.x = p.x; h.y = p.y; h.z = p.z; h.moveAmt = 0; r.veh = null; if (c) continue; } else h.carrier = null;
      h.x += (p.x - h.x) * k; h.y += (p.y - h.y) * k; h.z += (p.z - h.z) * k; h.yaw += angDiff(p.yaw, h.yaw) * k;
      h.anim = p.anim; h.moveAmt = p.mv; h.runAmt = p.run; h.air = p.air;
      if (p.veh) {
        if (!r.veh || r.veh.kind !== p.veh.k) r.veh = new Vehicle(p.veh.k, p.veh.x, p.veh.z, p.veh.h);
        const v = r.veh; v.x += (p.veh.x - v.x) * k; v.y += (p.veh.y - v.y) * k; v.z += (p.veh.z - v.z) * k; v.h += angDiff(p.veh.h, v.h) * k; v.sp = p.veh.sp; v.ph = p.veh.ph; v.air = p.veh.y > groundAt(v.x, v.z, v.y + 1) + 0.6;
        h.state = 'ride'; h.sit = v.seatPos(); h.x = h.sit.x; h.y = h.sit.y; h.z = h.sit.z; h.yaw = v.h;
      } else { r.veh = null; h.state = 'walk'; h.sit = null; }
    }
    for (const id of [...this.remotes.keys()]) if (!live.has(id)) this.remotes.delete(id);
  },
  draw(dyn, shadow) {
    for (const r of this.remotes.values()) { drawHuman(r.h, dyn); if (r.veh) { drawVehicle(r.veh, dyn); shadow(r.veh.x, groundAt(r.veh.x, r.veh.z, r.veh.y), r.veh.z, VEH[r.veh.kind].r * 1.3); } else shadow(r.h.x, r.h.y, r.h.z, 1.1); }
  },
  headPos(h) { const p = h.state === 'rag' && h.rag ? h.rag.p.head : standPose(h).head; return p; },
  /** 屏幕投影：返回 [x,y] 像素或 null */
  scr(vp, x, y, z) {
    const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]; if (w < 0.1) return null;
    const cx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, cy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
    if (Math.abs(cx) > 1.15 || Math.abs(cy) > 1.15) return null;
    return [(cx * 0.5 + 0.5) * innerWidth, (1 - (cy * 0.5 + 0.5)) * innerHeight];
  },
  /** 每帧：气泡 + 远程玩家昵称（DOM 叠加层） */
  overlay(vp) {
    const now = performance.now(), used = new Set(), box = $('bubbles');
    const el = (key, cls) => { let e = this.els.get(key); if (!e) { e = document.createElement('div'); e.className = cls; box.appendChild(e); this.els.set(key, e); } used.add(key); return e; };
    const who = (id) => id === Net.id ? G.player : (this.remotes.get(id) || {}).h;
    for (const r of this.remotes.values()) {
      const hp = this.headPos(r.h), s = this.scr(vp, hp[0], hp[1] + 0.75, hp[2]), e = el('n' + r.id, 'ptag');
      if (!s || Math.hypot(r.h.x - G.player.x, r.h.z - G.player.z) > 70) { e.style.display = 'none'; continue; }
      const p = Net.peers.get(r.id); e.style.display = 'block'; e.textContent = p ? p.name : ''; e.style.left = s[0] + 'px'; e.style.top = s[1] + 'px';
    }
    for (const [id, b] of this.bubbles) {
      const age = now - b.t0, h = who(id); if (age > b.dur || !h) { this.bubbles.delete(id); continue; }
      const hp = this.headPos(h), e = el('b' + id, 'bub'), named = id !== Net.id, s = this.scr(vp, hp[0], hp[1] + (named ? 1.35 : 0.8), hp[2]);
      if (!s || Math.hypot(h.x - G.player.x, h.z - G.player.z) > 90) { e.style.display = 'none'; continue; }
      if (e.textContent !== b.text) e.textContent = b.text;
      e.style.display = 'block'; e.style.left = s[0] + 'px'; e.style.top = s[1] + 'px'; e.style.opacity = age > b.dur - 700 ? Math.max(0, (b.dur - age) / 700) : Math.min(1, age / 150);
    }
    for (const [k, e] of this.els) if (!used.has(k)) { e.remove(); this.els.delete(k); }
  },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
