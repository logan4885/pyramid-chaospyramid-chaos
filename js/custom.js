/* 捏脸 / 换装：规格存 localStorage，实时预览（相机绕角色旋转），通过 Net 同步给其他玩家。 */
const Cust = {
  KEY: 'pc-look-v1', open: false, ang: Math.PI, auto: true, spec0: { skin: '#d9a577', hairCol: '#2a1b12', eyeCol: '#1a1210', shirt: '#b9652f', pants: '#3a4a63', shoe: '#3b2f2a', hatCol: '#ffd23f',
    hat: 'straw', gag: '', hairStyle: 'short', glasses: '', beard: '', stripe: '', scale: 1, wide: 1, head: 1, eye: 1, nose: 1, mouth: 1 },
  S: null, json: '',
  SL: [['scale', L('身高'), 0.8, 1.25], ['wide', L('胖瘦'), 0.8, 1.45], ['head', L('头大小'), 0.8, 1.4], ['eye', L('眼睛'), 0.7, 1.8], ['nose', L('鼻子'), 0.5, 2], ['mouth', L('嘴巴'), 0.6, 1.8]],
  CO: [['skin', L('肤色')], ['hairCol', L('发色')], ['eyeCol', L('瞳色')], ['shirt', L('上衣')], ['pants', L('裤子')], ['shoe', L('鞋')], ['hatCol', L('帽色')]],
  CH: [['hairStyle', L('发型'), [['short', L('短发')], ['long', L('长发')], ['bun', L('丸子头')], ['mohawk', L('莫西干')], ['twin', L('双马尾')], ['afro', L('爆炸头')], ['bald', L('光头')]]],
    ['hat', L('帽子'), [['none', L('无')], ['cap', L('鸭舌帽')], ['straw', L('草帽')], ['turban', L('头巾')]]], ['gag', L('搞怪'), [['', L('无')], ['cone', L('路锥')], ['duck', L('小黄鸭')], ['ring', L('游泳圈')]]],
    ['glasses', L('眼镜'), [['', L('无')], ['clear', L('透明')], ['shade', L('墨镜')]]], ['beard', L('胡子'), [['', L('无')], ['goatee', L('山羊胡')], ['full', L('大胡子')]]], ['stripe', L('上衣花纹'), [['', L('纯色')], ['light', L('浅条纹')], ['dark', L('深条纹')]]]],
  load() { try { this.S = Object.assign({}, this.spec0, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) { this.S = Object.assign({}, this.spec0); } this.json = JSON.stringify(this.S); return this.S; },
  spec() { return this.S || this.load(); },
  save() { this.json = JSON.stringify(this.S); try { localStorage.setItem(this.KEY, this.json); } catch (e) {} },
  apply() { if (G && G.player) { const p = G.player; p.look = makeLook(this.S); } this.save(); },
  build() {
    const d = document.createElement('div'); d.id = 'cust'; d.className = 'hidden';
    let h = L('<div class="chead"><b>🎭 捏脸 / 换装</b><span><button id="cRnd">🎲 随机</button><button id="cRst">重置</button><button id="cOk" class="big">完成</button></span></div><div class="cbody">');
    h += L('<div class="cgrp">体型 / 脸型</div>') + this.SL.map(s => `<label class="csl">${s[1]}<input type="range" data-k="${s[0]}" min="${s[2]}" max="${s[3]}" step="0.01"><em></em></label>`).join('');
    h += L('<div class="cgrp">颜色</div><div class="ccols">') + this.CO.map(c => `<label>${c[1]}<input type="color" data-k="${c[0]}"></label>`).join('') + '</div>';
    h += this.CH.map(c => `<div class="cgrp">${c[1]}</div><div class="cchips" data-k="${c[0]}">` + c[2].map(o => `<b data-v="${o[0]}">${o[1]}</b>`).join('') + '</div>').join('');
    h += L('<div class="chint">拖动画面旋转角色 · 设置自动保存，联机时其他玩家能看到</div></div>');
    d.innerHTML = h; document.body.appendChild(d); this.el = d;
    d.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; this.S[k] = e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value; this.apply(); this.sync(); });
    d.addEventListener('click', e => { const t = e.target; if (t.dataset.v === undefined) return; this.S[t.parentNode.dataset.k] = t.dataset.v; this.apply(); this.sync(); });
    $('cOk').onclick = () => this.close();
    $('cRst').onclick = () => { this.S = Object.assign({}, this.spec0); this.apply(); this.sync(); };
    $('cRnd').onclick = () => { const r = a => a[Math.floor(Math.random() * a.length)], hex = () => '#' + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 190).toString(16).padStart(2, '0')).join('');
      const S = this.S; S.skin = r(SKINS); S.hairCol = hex(); S.shirt = r(SHIRTS); S.pants = r(PANTS); S.shoe = hex(); S.hatCol = hex(); S.eyeCol = '#1a1210';
      this.CH.forEach(c => S[c[0]] = r(c[2])[0]); this.SL.forEach(s => S[s[0]] = +(s[2] + Math.random() * (s[3] - s[2])).toFixed(2)); this.apply(); this.sync(); };
    // 拖动旋转
    const cv = $('gl'); let dn = null;
    cv.addEventListener('pointerdown', e => { if (this.open) dn = e.clientX; });
    addEventListener('pointermove', e => { if (this.open && dn !== null) { this.ang -= (e.clientX - dn) * 0.01; dn = e.clientX; this.auto = false; } });
    addEventListener('pointerup', () => { dn = null; });
  },
  sync() {
    const S = this.S;
    this.el.querySelectorAll('input[type=range]').forEach(i => { i.value = S[i.dataset.k]; i.nextSibling.textContent = (+S[i.dataset.k]).toFixed(2); });
    this.el.querySelectorAll('input[type=color]').forEach(i => { i.value = S[i.dataset.k]; });
    this.el.querySelectorAll('.cchips').forEach(c => c.querySelectorAll('b').forEach(b => b.classList.toggle('on', b.dataset.v === String(S[c.dataset.k]))));
  },
  show() {
    if (!G || !G.player) return; this.load(); if (!this.el) this.build(); this.sync();
    this.open = true; this.auto = true; this.ang = Math.PI; this.prevMenu = !$('screenMenu').classList.contains('hidden'); this.prevPause = !$('screenPause').classList.contains('hidden');
    this.saveCam = { yaw: G.cam.yaw, pitch: G.cam.pitch, px: G.cam.px, py: G.cam.py, pz: G.cam.pz, rp: G.cam.rpitch };
    $('screenMenu').classList.add('hidden'); $('screenPause').classList.add('hidden'); this.el.classList.remove('hidden'); document.body.classList.add('editing');
    if (document.pointerLockElement) document.exitPointerLock();
    G.player.look = makeLook(this.S);
  },
  close() {
    this.open = false; this.el.classList.add('hidden'); document.body.classList.remove('editing'); this.apply();
    const c = this.saveCam; if (c) { Object.assign(G.cam, { yaw: c.yaw, pitch: c.pitch, px: c.px, py: c.py, pz: c.pz, rpitch: c.rp }); }
    $('screenMenu').classList.toggle('hidden', !this.prevMenu); $('screenPause').classList.toggle('hidden', !this.prevPause);
    if (G.phase === 'play') snapCam();
  },
  camUpdate(dt) {
    const P = G.player, C = G.cam; if (this.auto) this.ang += dt * 0.5;
    const d = 3.3 * Math.max(1, P.look.scale), a = this.ang + P.yaw;
    C.px = P.x + Math.sin(a) * d; C.pz = P.z + Math.cos(a) * d; C.py = P.y + 1.35 * P.look.scale; C.yaw = a; C.rpitch = -0.04;
  },
};
