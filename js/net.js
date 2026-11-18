/* 联机：房间 / 在线玩家 / 聊天。
 * 传输层（自动选择）：
 *   1) WebSocket 中继（运行 server.js；从 http://服务器:端口 打开游戏会自动连，或在菜单填写服务器地址）→ 跨电脑联机
 *   2) BroadcastChannel（无服务器时）→ 同一浏览器的多个标签页/窗口互相可见
 * 协议（JSON）：hello / state / chat / bye，同房间内广播。 */
const Net = {
  id: Math.random().toString(36).slice(2, 9), name: '', room: 'lobby', peers: new Map(), log: [], mode: '', joined: false,
  getState: null, onChat: null, onChange: null, _bc: null, _ws: null, _timer: null, _retry: 0, _url: '', _n: 0, _seen: new Set(),
  join(room, name, server) {
    this.leave(); this.room = (room || 'lobby').trim().slice(0, 16) || 'lobby'; this.name = (name || L('游客')).trim().slice(0, 12) || L('游客');
    this.joined = true; this.peers.clear(); this.mode = ''; this._url = server || '';
    try { this._bc = new BroadcastChannel('pyramid-chaos:' + this.room); this._bc.onmessage = e => this.handle(e.data); this.mode = 'tab'; } catch (e) { this._bc = null; }
    const http = location.protocol === 'http:' || location.protocol === 'https:';
    const url = server || (http ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host : '');
    if (url) this._connect(url);
    this.send({ t: 'hello' });
    this._timer = setInterval(() => this.tick(), 100);
    addEventListener('pagehide', this._bye = () => this.send({ t: 'bye' }));
    this.changed();
  },
  leave() {
    if (!this.joined) return;
    this.send({ t: 'bye' }); this.joined = false; clearInterval(this._timer);
    if (this._bc) this._bc.close(); this._bc = null;
    if (this._ws) { this._ws.onclose = null; try { this._ws.close(); } catch (e) {} } this._ws = null;
    removeEventListener('pagehide', this._bye); this.peers.clear(); this.mode = ''; this.changed();
  },
  _connect(url) {
    try {
      const ws = new WebSocket(url.replace(/\/+$/, '') + '/' + encodeURIComponent(this.room)); this._ws = ws;
      ws.onopen = () => { this._retry = 0; this.mode = 'ws'; this.send({ t: 'hello' }); this.changed(); };
      ws.onmessage = e => { try { this.handle(JSON.parse(e.data)); } catch (er) {} };
      ws.onclose = () => { if (this._ws !== ws) return; this._ws = null; this.mode = this._bc ? 'tab' : ''; this.changed(); if (this.joined && this._retry++ < 3) setTimeout(() => this.joined && !this._ws && this._connect(url), 2000 * this._retry); };
      ws.onerror = () => {};
    } catch (e) { this._ws = null; }
  },
  send(m) {
    m.id = this.id; m.name = this.name; m.n = ++this._n;
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(m));
    if (this._bc) { try { this._bc.postMessage(m); } catch (e) {} }
  },
  handle(m) {
    if (!m || m.id === this.id || !this.joined) return;
    if (m.t === 'chat' || m.t === 'bye' || m.t === 'ev') { const k = m.id + ':' + m.n; if (this._seen.has(k)) return; this._seen.add(k); if (this._seen.size > 200) this._seen.delete(this._seen.values().next().value); }   // 双通道（WS+标签页）去重
    if (m.t === 'bye') { if (this.peers.delete(m.id)) this.changed(); return; }
    let p = this.peers.get(m.id);
    if (!p) { p = { id: m.id, name: m.name }; this.peers.set(m.id, p); this.changed(); }
    p.t = performance.now(); if (p.name !== m.name) { p.name = m.name; this.changed(); }
    if (m.t === 'hello') this.sendState();
    else if (m.t === 'state') Object.assign(p, m.s, { name: m.name });
    else if (m.t === 'ev') { if (m.to === this.id && this.onEv) this.onEv(m); }
    else if (m.t === 'chat') { const e = { id: m.id, name: m.name, text: String(m.text || '').slice(0, 80), t: performance.now() }; this.pushLog(e); if (this.onChat) this.onChat(e); }
  },
  pushLog(e) { this.log.push(e); if (this.log.length > 30) this.log.shift(); this.changed(); },
  sendState() { if (this.getState) this.send({ t: 'state', s: this.getState() }); },
  chat(text) { text = String(text).slice(0, 80); const e = { id: this.id, name: this.name, text, t: performance.now(), me: true }; this.send({ t: 'chat', text }); this.pushLog(e); if (this.onChat) this.onChat(e); },
  sendEv(to, k, d) { this.send({ t: 'ev', to, k, d: d || {} }); },
  rename(n) { this.name = (n || '').trim().slice(0, 12) || this.name; this.send({ t: 'hello' }); this.changed(); },
  tick() {
    this.sendState();
    const now = performance.now(); let gone = false;
    for (const [id, p] of this.peers) if (now - p.t > 6000) { this.peers.delete(id); gone = true; }
    if (gone) this.changed();
  },
  changed() { if (this.onChange) this.onChange(); },
};
