/* 聊天气泡 + 房间在线玩家列表 + 远程玩家渲染（依赖 net.js / entities.js / game.js 的全局） */
const Social = {
  bubbles: new Map(), remotes: new Map(), open: false, els: new Map(),
  rgb(a) { return a ? `rgb(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)})` : '#ccc'; },
  init() {
    const sv = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    $('nameIn').value = sv('pc_name') || '游客' + Math.floor(100 + Math.random() * 900);
    $('roomIn').value = sv('pc_room') || 'lobby'; $('srvIn').value = sv('pc_srv');
    Net.getState = () => {
      const P = G.player, v = P.state === 'ride' && P.vehicle ? P.vehicle : null, r = x => Math.round(x * 100) / 100;
      return { x: r(P.x), y: r(P.y), z: r(P.z), yaw: r(P.yaw), anim: r(P.anim), mv: r(P.moveAmt), run: r(P.runAmt), air: !!P.air, look: P.look,
        veh: v ? { k: v.kind, x: r(v.x), y: r(v.y), z: r(v.z), h: r(v.h), sp: r(v.sp), ph: r(v.ph) } : null };
    };
    Net.onChat = e => this.addBubble(e.id, e.text);
    Net.onChange = () => this.renderRoom();
    setInterval(() => this.renderRoom(), 1000);
    $('chatIn').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.close(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(false); }
    });
  },
  join() {
    const v = id => $(id).value.trim();
    try { localStorage.setItem('pc_name', v('nameIn')); localStorage.setItem('pc_room', v('roomIn')); localStorage.setItem('pc_srv', v('srvIn')); } catch (e) {}
    Net.join(v('roomIn'), v('nameIn'), v('srvIn')); this.bubbles.clear(); this.renderRoom();
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
    if ((m = /^\/name\s+(.+)/.exec(t))) { Net.rename(m[1]); $('nameIn').value = Net.name; try { localStorage.setItem('pc_name', Net.name); } catch (e) {} popup('昵称已改为：' + Net.name); }
    else if ((m = /^\/room\s+(\S+)/.exec(t))) { $('roomIn').value = m[1]; this.join(); popup('已进入房间：' + Net.room); }
    else Net.chat(t);
  },
  addBubble(id, text) { this.bubbles.set(id, { text, t0: performance.now(), dur: Math.min(13000, 5500 + text.length * 160) }); },
  renderRoom() {
    if (typeof G === 'undefined' || !G || !Net.joined) { $('roomPanel').classList.add('hidden'); return; }
    $('roomPanel').classList.remove('hidden');
    $('rRoom').textContent = '房间 ' + Net.room; $('rMode').textContent = Net.mode === 'ws' ? '🌐 联机' : '🖥 本机标签页';
    const peers = [...Net.peers.values()].filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name));
    $('rCount').textContent = '在线 ' + (peers.length + 1);
    const li = (name, look, me) => `<li><i style="background:${this.rgb(look && look.shirt)}"></i><span>${esc(name)}</span>${me ? '<em>你</em>' : ''}</li>`;
    $('rList').innerHTML = li(Net.name, G.player.look, true) + peers.map(p => li(p.name, p.look, false)).join('');
    const now = performance.now();
    $('chatLog').innerHTML = Net.log.slice(-6).map(e => `<div class="${now - e.t > 14000 ? 'old' : ''}"><b>${esc(e.name)}</b>${esc(e.text)}</div>`).join('');
  },
  /** 每帧：同步远程玩家（插值）、必要时创建/清理 */
  update(dt) {
    const live = new Set(), k = Math.min(1, dt * 10);
    for (const p of Net.peers.values()) {
      if (p.x === undefined) continue; live.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) { const h = new Human({ kind: 'remote', x: p.x, z: p.z, look: {} }); h.y = p.y; r = { h, veh: null, id: p.id }; this.remotes.set(p.id, r); }
      const h = r.h; if (p.look && p.look.skin) h.look = p.look;
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
