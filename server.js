#!/usr/bin/env node
/* PYRAMID CHAOS 联机服务器（零依赖）：静态文件 + WebSocket 房间中继。
 * 用法：node server.js [端口，默认 8787]
 * 然后用浏览器打开 http://本机IP:端口 ，同一房间号的玩家互相可见。局域网/公网都行（需放行端口）。 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.argv[2] || +process.env.PORT || 8787, ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
const rooms = new Map(), MAX_ROOM = 16, MAX_ROOMS = 200, t0 = Date.now();
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad'); }
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); let n = 0; rooms.forEach(s => n += s.size); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: n, uptime: Math.round((Date.now() - t0) / 1000) })); }
  if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(ROOT) || /server\.js$/.test(f)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(d); });
});
function frame(str) {
  const b = Buffer.from(str), n = b.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, b]);
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  const room = decodeURIComponent((req.url || '/').split('?')[0].slice(1)).slice(0, 16) || 'lobby';
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  if ((!rooms.has(room) && rooms.size >= MAX_ROOMS) || (rooms.get(room) && rooms.get(room).size >= MAX_ROOM)) { sock.write('HTTP/1.1 503 Full\r\n\r\n'); return sock.destroy(); }
  if (!rooms.has(room)) rooms.set(room, new Set()); const set = rooms.get(room); set.add(sock); sock.setNoDelay(true); sock.setKeepAlive(true, 20000);
  const pinger = setInterval(() => { try { sock.write(Buffer.from([0x89, 0])); } catch (e) {} }, 25000);
  let buf = Buffer.alloc(0);
  const bye = () => { clearInterval(pinger); set.delete(sock); if (!set.size) rooms.delete(room); };
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const op = buf[0] & 15; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 128; if (buf.length < off + (masked ? 4 : 0) + len) return;
      if (len > 65536) return sock.destroy();
      const mask = masked ? buf.slice(off, off + 4) : null; off += masked ? 4 : 0;
      const pay = Buffer.from(buf.slice(off, off + len)); if (mask) for (let i = 0; i < pay.length; i++) pay[i] ^= mask[i & 3];
      buf = buf.slice(off + len);
      if (op === 8) { sock.end(); return bye(); }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, pay.length]), pay])); continue; }
      if (op === 1) { const out = frame(pay.toString()); for (const o of set) if (o !== sock) o.write(out); }
    }
  });
  sock.on('close', bye); sock.on('error', bye);
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('PYRAMID CHAOS 联机服务器已启动\n  本机：http://localhost:' + PORT + ips.map(a => '\n  局域网（把这个发给朋友）：http://' + a + ':' + PORT).join('') + '\n  房间：在网址后面不用加东西，游戏内 /room 名字 切换房间\n  健康检查：/health    关闭：Ctrl+C');
});
