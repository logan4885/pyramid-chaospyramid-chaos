/* 手机/平板触屏控制：左半屏浮动摇杆、右半屏拖动转视角、右下角动作按钮；自动降画质保帧率。依赖 game.js 的 K / mouse / G / Social / renderer。 */
const Touch = {
  on: false, stick: null, look: null, btns: new Map(), run: false, fpsN: 0, fpsT: 0, last: 0,
  init() {
    const coarse = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
    if (!coarse) return;
    this.on = true; document.body.classList.add('touch');
    renderer.setQuality('med'); renderer.dprCap = 1.25;                       // 手机默认中画质、限制分辨率
    const opt = { passive: false };
    addEventListener('touchstart', e => this.start(e), opt); addEventListener('touchmove', e => this.move(e), opt);
    addEventListener('touchend', e => this.end(e), opt); addEventListener('touchcancel', e => this.end(e), opt);
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('resize', () => { if (renderer) renderer.resize(); });
    const loop = t => { requestAnimationFrame(loop); this.perf(t); }; requestAnimationFrame(loop);
    document.addEventListener('gesturestart', e => e.preventDefault());
  },
  playing() { return typeof G !== 'undefined' && G && G.phase === 'play' && !G.paused && !G.overlay; },
  show() { const on = this.on && typeof G !== 'undefined' && G && G.phase === 'play'; $('tctl').classList.toggle('hidden', !on); },
  keys(x, y) { K.KeyA = x < -0.3; K.KeyD = x > 0.3; K.KeyW = y < -0.3; K.KeyS = y > 0.3; },
  clearMove() { K.KeyA = K.KeyD = K.KeyW = K.KeyS = false; },
  press(a, down) {
    if (a === 'jump') { K.Space = down; if (down) G.jumpReq = true; }
    else if (!down) return;
    else if (a === 'e') G.eReq = true; else if (a === 'f') G.fReq = true; else if (a === 'g') G.gReq = true; else if (a === 'r') G.flopReq = true;
    else if (a === 'run') { this.run = !this.run; K.ShiftLeft = this.run; $('tbRun').classList.toggle('on', this.run); }
    else if (a === 'chat') Social.openChat();
  },
  start(e) {
    if (!this.on) return; this.show();
    const t0 = e.target;
    if (G && G.chatOpen && !(t0.closest && t0.closest('#chatBox'))) Social.close(false);
    if (!this.playing()) { this.clearMove(); return; }
    if (t0.closest && t0.closest('#btns,#chatBox')) return;                       // 暂停/静音按钮、聊天框走正常点击
    e.preventDefault(); Snd.init();
    for (const t of e.changedTouches) {
      const b = t.target.closest && t.target.closest('.tb');
      if (b) { const a = b.dataset.a; this.btns.set(t.identifier, a); b.classList.add('down'); this.press(a, true); continue; }
      if (t.clientX < innerWidth * 0.46 && !this.stick) {
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        const base = $('stickBase'); base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.classList.add('act'); $('stickKnob').style.transform = 'translate(-50%,-50%)';
      } else if (!this.look && t.clientX >= innerWidth * 0.3) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  },
  move(e) {
    if (!this.on) return;
    if (this.stick || this.look) e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy; const R = 56, l = Math.hypot(dx, dy);
        if (l > R) { this.stick.ox += dx / l * (l - R); this.stick.oy += dy / l * (l - R); dx = dx / l * R; dy = dy / l * R; $('stickBase').style.left = this.stick.ox + 'px'; $('stickBase').style.top = this.stick.oy + 'px'; }
        $('stickKnob').style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
        this.keys(dx / R, dy / R);
      } else if (this.look && t.identifier === this.look.id) {
        mouse.dx += (t.clientX - this.look.x) * 1.25; mouse.dy += (t.clientY - this.look.y) * 1.25; this.look.x = t.clientX; this.look.y = t.clientY;
      }
    }
  },
  end(e) {
    if (!this.on) return;
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.clearMove(); $('stickBase').classList.remove('act'); }
      if (this.look && t.identifier === this.look.id) this.look = null;
      if (this.btns.has(t.identifier)) { const a = this.btns.get(t.identifier); this.btns.delete(t.identifier); if (a === 'jump') K.Space = false; document.querySelectorAll('.tb.down').forEach(b => { if (![...this.btns.values()].includes(b.dataset.a)) b.classList.remove('down'); }); }
    }
  },
  /** 帧率保护：连续偏低就降一档画质 */
  perf(t) {
    this.show();
    if (!this.playing() || !renderer) { this.last = t; this.fpsN = 0; this.fpsT = 0; return; }
    const dt = t - this.last; this.last = t; if (dt > 500) return;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT > 3000) {
      const fps = this.fpsN * 1000 / this.fpsT; this.fpsN = 0; this.fpsT = 0;
      if (fps < 26 && renderer.q !== 'low') { const q = renderer.q === 'high' ? 'med' : 'low'; renderer.setQuality(q); renderer.dprCap = q === 'low' ? 1 : 1.25; popup('帧率偏低，已自动降到「' + (q === 'med' ? '中' : '低') + '」画质'); }
    }
  },
};
