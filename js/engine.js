'use strict';
/* ============================================================
 * engine.js — 零依赖迷你 WebGL 渲染器（MVP01）
 * 为什么不用 Three.js：MVP01 要求"双击 index.html 即可运行"，
 * 且构建环境无网络。后续可整体替换为 Three.js / Babylon.js（D-01 待定），
 * 游戏逻辑只依赖 Renderer.frame(cam, env, objs) 这一个接口。
 * ============================================================ */

const M4 = {
  I() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
      o[c*4+r] = s;
    }
    return o;
  },
  T(x, y, z) { const m = M4.I(); m[12]=x; m[13]=y; m[14]=z; return m; },
  S(x, y, z) { const m = new Float32Array(16); m[0]=x; m[5]=y; m[10]=z; m[15]=1; return m; },
  RX(a) { const m = M4.I(), c=Math.cos(a), s=Math.sin(a); m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return m; },
  RY(a) { const m = M4.I(), c=Math.cos(a), s=Math.sin(a); m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return m; },
  RZ(a) { const m = M4.I(), c=Math.cos(a), s=Math.sin(a); m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return m; },
  // T * Ry * Rx * Rz * S
  compose(x, y, z, rx, ry, rz, sx, sy, sz) {
    return M4.mul(M4.T(x,y,z), M4.mul(M4.RY(ry), M4.mul(M4.RX(rx), M4.mul(M4.RZ(rz), M4.S(sx,sy,sz)))));
  },

  // 线段变换：把单位圆柱/方块(沿y轴、中心在原点)拉伸到 a→b；base=true 时原点在 a（用于锥体等底面在y=0的网格）
  seg(a, b, tx, tz, base) {
    let dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-4; dx /= len; dy /= len; dz /= len;
    let hx = 0, hy = 0, hz = 1; if (Math.abs(dz) > 0.9) { hx = 1; hz = 0; }
    let xx = hy*dz - hz*dy, xy = hz*dx - hx*dz, xz = hx*dy - hy*dx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const zx = xy*dz - xz*dy, zy = xz*dx - xx*dz, zz = xx*dy - xy*dx;
    const cx = base ? a[0] : (a[0]+b[0])/2, cy = base ? a[1] : (a[1]+b[1])/2, cz = base ? a[2] : (a[2]+b[2])/2;
    return new Float32Array([xx*tx, xy*tx, xz*tx, 0, dx*len, dy*len, dz*len, 0, zx*tz, zy*tz, zz*tz, 0, cx, cy, cz, 1]);
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o;
  },
  lookAt(e, c, up) {                     // 视图矩阵（相机沿 -z 看）
    let fx = c[0]-e[0], fy = c[1]-e[1], fz = c[2]-e[2]; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let sx = fy*up[2]-fz*up[1], sy = fz*up[0]-fx*up[2], sz = fx*up[1]-fy*up[0]; const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
    const ux = sy*fz-sz*fy, uy = sz*fx-sx*fz, uz = sx*fy-sy*fx;
    return new Float32Array([sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx*e[0]+sy*e[1]+sz*e[2]), -(ux*e[0]+uy*e[1]+uz*e[2]), (fx*e[0]+fy*e[1]+fz*e[2]), 1]);
  },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
};

/* ---------- 低面数网格（逐面平直着色，天然卡通风） ---------- */
function _tri(out, a, b, c, ctr) {
  let ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
  let vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
  let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const mx = (a[0]+b[0]+c[0])/3 - ctr[0], my = (a[1]+b[1]+c[1])/3 - ctr[1], mz = (a[2]+b[2]+c[2])/3 - ctr[2];
  if (nx*mx + ny*my + nz*mz < 0) { nx=-nx; ny=-ny; nz=-nz; const t=b; b=c; c=t; } // 保证朝外且逆时针
  out.push(a[0],a[1],a[2],nx,ny,nz, b[0],b[1],b[2],nx,ny,nz, c[0],c[1],c[2],nx,ny,nz);
}
function _quad(out, a, b, c, d, ctr) { _tri(out, a, b, c, ctr); _tri(out, a, c, d, ctr); }

function geoCube() {
  const o = [], c = [0,0,0], p = (x,y,z) => [x*.5, y*.5, z*.5];
  const v = [p(-1,-1,-1), p(1,-1,-1), p(1,1,-1), p(-1,1,-1), p(-1,-1,1), p(1,-1,1), p(1,1,1), p(-1,1,1)];
  [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]].forEach(f => _quad(o, v[f[0]], v[f[1]], v[f[2]], v[f[3]], c));
  return o;
}
function geoCyl(n = 10) { // 半径0.5，y∈[-0.5,0.5]
  const o = [], c = [0,0,0];
  for (let i = 0; i < n; i++) {
    const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2;
    const x0 = Math.cos(a0)*.5, z0 = Math.sin(a0)*.5, x1 = Math.cos(a1)*.5, z1 = Math.sin(a1)*.5;
    _quad(o, [x0,-.5,z0], [x1,-.5,z1], [x1,.5,z1], [x0,.5,z0], c);
    _tri(o, [0,.5,0], [x0,.5,z0], [x1,.5,z1], c);
    _tri(o, [0,-.5,0], [x0,-.5,z0], [x1,-.5,z1], c);
  }
  return o;
}
function geoCone(n, r, off) { // 底面 y=0，顶点 y=1
  const o = [], c = [0,.3,0];
  for (let i = 0; i < n; i++) {
    const a0 = i/n*Math.PI*2+off, a1 = (i+1)/n*Math.PI*2+off;
    const x0 = Math.cos(a0)*r, z0 = Math.sin(a0)*r, x1 = Math.cos(a1)*r, z1 = Math.sin(a1)*r;
    _tri(o, [0,1,0], [x0,0,z0], [x1,0,z1], c);
    _tri(o, [0,0,0], [x0,0,z0], [x1,0,z1], c);
  }
  return o;
}
function geoSphere(la = 6, lo = 10) { // 半径0.5
  const o = [], c = [0,0,0], P = (i, j) => {
    const th = i/la*Math.PI, ph = j/lo*Math.PI*2;
    return [Math.sin(th)*Math.cos(ph)*.5, Math.cos(th)*.5, Math.sin(th)*Math.sin(ph)*.5];
  };
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
    const a = P(i,j), b = P(i+1,j), cc = P(i+1,j+1), d = P(i,j+1);
    if (i === 0) _tri(o, a, b, cc, c); else if (i === la-1) _tri(o, a, b, d, c); else _quad(o, a, b, cc, d, c);
  }
  return o;
}


/* ---------- 平滑着色网格（球/圆柱/圆锥：圆润，不再"一块块"） ---------- */
function _triN(out, a, b, c, na, nb, nc) {
  let ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2], vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
  const fx = uy*vz-uz*vy, fy = uz*vx-ux*vz, fz = ux*vy-uy*vx;
  if (fx*(na[0]+nb[0]+nc[0]) + fy*(na[1]+nb[1]+nc[1]) + fz*(na[2]+nb[2]+nc[2]) < 0) { let t = b; b = c; c = t; t = nb; nb = nc; nc = t; }
  out.push(a[0],a[1],a[2],na[0],na[1],na[2], b[0],b[1],b[2],nb[0],nb[1],nb[2], c[0],c[1],c[2],nc[0],nc[1],nc[2]);
}
function geoSphereS(la, lo) {
  const o = [], P = (i, j) => { const th = i/la*Math.PI, ph = j/lo*Math.PI*2; return [Math.sin(th)*Math.cos(ph), Math.cos(th), Math.sin(th)*Math.sin(ph)]; };
  const h = v => [v[0]*.5, v[1]*.5, v[2]*.5];
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
    const a = P(i,j), b = P(i+1,j), c = P(i+1,j+1), d = P(i,j+1);
    if (i === 0) _triN(o, h(a), h(b), h(c), a, b, c); else if (i === la-1) _triN(o, h(a), h(b), h(d), a, b, d);
    else { _triN(o, h(a), h(b), h(c), a, b, c); _triN(o, h(a), h(c), h(d), a, c, d); }
  }
  return o;
}
function geoCylS(n) {
  const o = [], U = [0,1,0], D = [0,-1,0];
  for (let i = 0; i < n; i++) {
    const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const n0 = [c0,0,s0], n1 = [c1,0,s1], p = (c, s, y) => [c*.5, y, s*.5];
    _triN(o, p(c0,s0,-.5), p(c1,s1,-.5), p(c1,s1,.5), n0, n1, n1); _triN(o, p(c0,s0,-.5), p(c1,s1,.5), p(c0,s0,.5), n0, n1, n0);
    _triN(o, [0,.5,0], p(c0,s0,.5), p(c1,s1,.5), U, U, U); _triN(o, [0,-.5,0], p(c0,s0,-.5), p(c1,s1,-.5), D, D, D);
  }
  return o;
}
function geoConeS(n, r) {
  const o = [], D = [0,-1,0], nrm = (c, s) => { const l = Math.hypot(c, r, s); return [c/l, r/l, s/l]; };
  for (let i = 0; i < n; i++) {
    const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2, am = (a0+a1)/2, x0 = Math.cos(a0)*r, z0 = Math.sin(a0)*r, x1 = Math.cos(a1)*r, z1 = Math.sin(a1)*r;
    _triN(o, [0,1,0], [x0,0,z0], [x1,0,z1], nrm(Math.cos(am), Math.sin(am)), nrm(Math.cos(a0), Math.sin(a0)), nrm(Math.cos(a1), Math.sin(a1)));
    _triN(o, [0,0,0], [x0,0,z0], [x1,0,z1], D, D, D);
  }
  return o;
}

/** 圆角方块：尺寸 sx×sy×sz，倒角半径 b（米），顶点已含真实尺寸，使用时不要再缩放 */
function geoRBox(sx, sy, sz, b) {
  const o = [], hx = sx/2 - b, hy = sy/2 - b, hz = sz/2 - b;
  const ax = hx > 1e-4 ? [-hx-b, -hx-.414*b, -hx, hx, hx+.414*b, hx+b] : [-b, 0, b], ay = hy > 1e-4 ? [-hy-b, -hy-.414*b, -hy, hy, hy+.414*b, hy+b] : [-b, 0, b], az = hz > 1e-4 ? [-hz-b, -hz-.414*b, -hz, hz, hz+.414*b, hz+b] : [-b, 0, b];
  const V = (x, y, z) => {
    const qx = Math.max(-hx, Math.min(hx, x)), qy = Math.max(-hy, Math.min(hy, y)), qz = Math.max(-hz, Math.min(hz, z));
    let dx = x - qx, dy = y - qy, dz = z - qz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    return { p: [qx + dx*b, qy + dy*b, qz + dz*b], n: [dx, dy, dz] };
  };
  const face = (u, v, w, mk) => { for (let i = 0; i < u.length - 1; i++) for (let j = 0; j < v.length - 1; j++) {
    const a = V(...mk(u[i], v[j], w)), c = V(...mk(u[i+1], v[j], w)), d = V(...mk(u[i+1], v[j+1], w)), e = V(...mk(u[i], v[j+1], w));
    _triN(o, a.p, c.p, d.p, a.n, c.n, d.n); _triN(o, a.p, d.p, e.p, a.n, d.n, e.n); } };
  face(ay, az, sx/2, (y, z, x) => [x, y, z]); face(ay, az, -sx/2, (y, z, x) => [x, y, z]);
  face(ax, az, sy/2, (x, z, y) => [x, y, z]); face(ax, az, -sy/2, (x, z, y) => [x, y, z]);
  face(ax, ay, sz/2, (x, y, z) => [x, y, z]); face(ax, ay, -sz/2, (x, y, z) => [x, y, z]);
  return o;
}
/** 棕榈叶：沿 +X 长 1，自然下垂，带中脉折痕和小叶锯齿；双面 */
function geoLeaf() {
  const o = [], N = 16, P = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = t, y = 0.20 * t - 0.62 * t * t, w = (0.01 + 0.15 * Math.sin(Math.PI * Math.pow(t, 0.65))) * (i % 2 ? 0.78 : 1.0);
    P.push({ x, y, w, slope: 0.20 - 1.24 * t });
  }
  const pt = (i, s) => { const q = P[i]; return [q.x, q.y + (s === 0 ? 0.035 * q.w / 0.15 : -0.02 * q.w / 0.15), s * q.w]; };
  const nr = (i, s) => { const q = P[i], l = Math.hypot(q.slope, 1, 0.55 * s) ; return [-q.slope / l, 1 / l, 0.55 * s / l]; };
  const neg = n => [-n[0], -n[1], -n[2]];
  for (let i = 0; i < N; i++) for (const s of [-1, 1]) {
    const a = pt(i, 0), b = pt(i + 1, 0), c = pt(i + 1, s), d = pt(i, s);
    _triN(o, a, b, c, nr(i, s), nr(i + 1, s), nr(i + 1, s)); _triN(o, a, c, d, nr(i, s), nr(i + 1, s), nr(i, s));
    _triN(o, a, c, b, neg(nr(i, s)), neg(nr(i + 1, s)), neg(nr(i + 1, s))); _triN(o, a, d, c, neg(nr(i, s)), neg(nr(i, s)), neg(nr(i + 1, s)));
  }
  return o;
}

/* ---------- 着色器（v2：阴影贴图 + HDR + 色调映射 + 程序化材质） ---------- */
const GLSL_COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
`;
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol;
uniform mat4 uVP; uniform mat4 uModel;
varying vec3 vN; varying vec3 vW; varying vec4 vCol;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  mat3 M3 = mat3(uModel);
  vec3 s2 = vec3(dot(M3[0],M3[0]), dot(M3[1],M3[1]), dot(M3[2],M3[2]));
  vN = M3 * (aNor / s2);                       // 逆转置：椭球/拉伸体的法线才正确
  vW = w.xyz; vCol = aCol;
  gl_Position = uVP * w;
}`;
const FS = GLSL_COMMON + `
uniform vec3 uColor, uSunDir, uSunCol, uAmbS, uAmbG, uFog, uCam;
uniform float uMat, uVC, uUnlit, uSpec, uFogD, uTime, uShadowOn, uTexel, uOut, uHdr, uRim;
uniform sampler2D uShadow; uniform mat4 uLVP;
varying vec3 vN; varying vec3 vW; varying vec4 vCol;

float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float shadowTerm(vec3 wp, vec3 n, float ndl){
  if (uShadowOn < 0.01) return 1.0;
  vec3 off = n * (0.07 + 0.14*(1.0-clamp(ndl,0.0,1.0)));
  vec4 s = uLVP * vec4(wp + off, 1.0);
  vec3 p = s.xyz / s.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0010 + 0.0016*(1.0-clamp(ndl,0.0,1.0));
  float sum = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = unpackD(texture2D(uShadow, p.xy + vec2(float(i), float(j))*uTexel*1.15));
    sum += (p.z - bias > d) ? 0.0 : 1.0;
  }
  float e = min(min(p.x, 1.0-p.x), min(p.y, 1.0-p.y));
  return mix(1.0, sum/9.0, smoothstep(0.0, 0.06, e) * uShadowOn);
}
float sandH(vec2 p){ vec2 q = vec2(p.x*0.7 + p.y*0.25, p.y*1.5);
  return fbm(q*0.28)*1.4 + vnoise(q*2.2)*0.22 + vnoise(p*9.0)*0.05; }
void main(){
  vec3 base = uVC > 0.5 ? vCol.rgb : uColor;
  float mat = uVC > 0.5 ? vCol.a : uMat;
  vec3 alb = pow(base, vec3(2.2));
  vec3 n = normalize(vN);
  vec3 V = uCam - vW; float dist = length(V); V /= dist;
  if (uUnlit > 0.5) {
    vec3 c = alb * 2.2;
    float f = 1.0 - exp(-dist*dist*uFogD*uFogD*0.35);
    c = mix(c, uFog, f*0.6);
    gl_FragColor = vec4(uOut > 0.5 ? pow(aces(c), vec3(1.0/2.2)) : c * uHdr, 1.0); return;
  }
  float detail = 1.0 - smoothstep(18.0, 70.0, dist);
  float spec = uSpec;
  // ---- 程序化材质（世界坐标，随距离淡出） ----
  if (mat > 0.5 && mat < 1.5) {                  // 沙地：沙丘波纹 + 颗粒
    float up = smoothstep(0.35, 0.9, n.y);
    vec2 p = vW.xz; float e = 0.18;
    float h0 = sandH(p), hx = sandH(p + vec2(e, 0.0)), hz = sandH(p + vec2(0.0, e));
    n = normalize(n + vec3(-(hx-h0), 0.0, -(hz-h0)) / e * 0.55 * up * (0.35 + 0.65*detail));
    float v = fbm(p*0.06);
    alb *= (0.86 + 0.28*v) * (0.94 + 0.12*vnoise(p*38.0)*detail);
    alb = mix(alb, alb*vec3(1.08,0.97,0.82), smoothstep(0.35,0.75,fbm(p*0.02+4.0)));
    float pb = hash(floor(p*11.0)); alb *= 1.0 - step(0.975, pb) * 0.22 * detail * (0.6 + 0.4*hash(floor(p*11.0)+3.0));
    alb = mix(alb, alb*vec3(0.80,0.74,0.66), smoothstep(0.55, 0.8, fbm(p*0.035+11.0))*0.5);
    spec = 0.04;
  } else if ((mat > 1.5 && mat < 2.5) || mat > 4.5) {   // 石灰岩砌块（5 = 金字塔大块）
    float bs = mat > 4.5 ? 1.7 : 0.95;
    float topf = smoothstep(0.82, 0.97, n.y);
    float row = floor(vW.y / bs);
    vec2 tg = normalize(vec2(-n.z, n.x) + 1e-4);
    float u = dot(vW.xz, tg) / (bs * 1.9) + row * 0.37;
    vec2 g = mix(vec2(u, vW.y / bs), vW.xz / (bs * 1.5), topf);
    vec2 gf = fract(g), cell = floor(g);
    float mort = min(min(gf.x, 1.0-gf.x) * 1.9, min(gf.y, 1.0-gf.y));
    float line = 1.0 - smoothstep(0.018, 0.07, mort);
    float tint = hash(cell) - 0.5;
    float wear = fbm(vW.xz*0.45 + vW.y*0.35);
    alb *= (1.0 + tint*0.30) * (0.78 + 0.44*wear);
    alb *= 1.0 - line * 0.40 * (0.35 + 0.65*detail);
    float edge = smoothstep(0.0, 0.14, min(min(gf.x, 1.0-gf.x)*1.9, min(gf.y, 1.0-gf.y)));       // 石块边缘轻微凹陷 → 法线扰动
    n = normalize(n + vec3(0.0, (edge - 0.6) * 0.18, 0.0) * detail + vec3(tint, 0.0, -tint) * 0.09 * detail);
    spec = 0.03;
  } else if (mat > 2.5 && mat < 3.5) {           // 石板路 / 广场砖
    vec2 g = vW.xz / 1.3; vec2 gf = fract(g), cell = floor(g);
    float mort = min(min(gf.x, 1.0-gf.x), min(gf.y, 1.0-gf.y));
    float line = 1.0 - smoothstep(0.025, 0.06, mort);
    alb *= (0.93 + 0.14*hash(cell)) * (0.92 + 0.16*fbm(vW.xz*0.45));
    alb *= 1.0 - line * 0.34 * detail;
    float dust = smoothstep(0.50, 0.74, fbm(vW.xz*0.16 + 5.0)) * 0.55 + smoothstep(0.62, 0.8, vnoise(vW.xz*1.7)) * 0.2;
    alb = mix(alb, pow(vec3(0.85,0.73,0.51), vec3(2.2)) * (0.9 + 0.2*vnoise(vW.xz*20.0)), clamp(dust, 0.0, 0.7));     // 积沙
    alb *= 0.9 + 0.2*vnoise(vW.xz*6.0);
    spec = 0.05;
  } else if (mat > 3.5 && mat < 4.5) {           // 木头 / 树干：纵向纹理
    alb *= 0.88 + 0.24*vnoise(vec2(vW.x*3.0 + vW.z*3.0, vW.y*0.9));
  }
  // ---- 光照 ----
  vec3 L = normalize(uSunDir);
  float ndl = dot(n, L);
  float diff = max(ndl, 0.0), wrap = max((ndl + 0.30)/1.30, 0.0);
  float sh = shadowTerm(vW, normalize(vN), ndl);
  vec3 sunL = uSunCol * mix(wrap, diff, 0.65) * sh;
  float hemiT = n.y*0.5 + 0.5;
  float ao = mix(0.72, 1.0, smoothstep(0.0, 2.2, vW.y + 0.6)) ;       // 近地处略暗：廉价环境遮蔽
  ao = mix(1.0, ao, 1.0 - smoothstep(0.5, 0.95, n.y));
  vec3 hemi = mix(uAmbG, uAmbS, hemiT) * ao;
  vec3 col = alb * (sunL + hemi);
  vec3 H = normalize(L + V);
  col += uSunCol * pow(max(dot(n, H), 0.0), 40.0) * spec * sh * step(0.0, ndl);
  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += uAmbS * fr * uRim * (0.4 + 0.6*sh);
  // ---- 大气：指数雾 + 朝太阳方向的前向散射 ----
  float fogE = 1.0 - exp(-dist*dist*uFogD*uFogD);
  fogE *= exp(-max(vW.y - 2.0, 0.0)*0.012);
  float sunAmt = pow(max(dot(-V, L), 0.0), 6.0);
  vec3 fogC = uFog + uSunCol * sunAmt * 0.28;
  col = mix(col, fogC, clamp(fogE, 0.0, 1.0));
  gl_FragColor = vec4(uOut > 0.5 ? pow(aces(col), vec3(1.0/2.2)) : col * uHdr, 1.0);
}`;
const SKY_VS = `
attribute vec3 aPos; uniform mat4 uVPr; varying vec3 vDir;
void main(){ vDir = aPos*2.0; gl_Position = uVPr * vec4(vDir, 1.0); }`;
const SKY_FS = GLSL_COMMON + `
uniform vec3 uTop, uHor, uSunCol, uSunDir; uniform float uTime, uOut, uHdr;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  float s = max(dot(d, uSunDir), 0.0);
  vec3 c = mix(uHor, uTop, pow(h, 0.42));                                  // 瑞利式渐变：越高越蓝
  c = mix(c, uHor * vec3(1.06, 1.0, 0.93), exp(-h * 7.0) * 0.65);           // 地平线霾带
  float side = 0.45 + 0.55 * exp(-h * 3.0);
  c += uSunCol * (pow(s, 4.0) * 0.09 + pow(s, 28.0) * 0.20 + pow(s, 360.0) * 1.4) * side;     // 米氏散射光晕
  c += uSunCol * smoothstep(0.99915, 0.99968, s) * 14.0;                    // 日盘
  if (d.y > 0.01) {
    vec2 p = d.xz / (d.y + 0.25) * 1.4 + vec2(uTime*0.005, uTime*0.0015);
    float n = fbm(p*0.9), n2 = fbm(p*2.6 + 8.0);
    float cum = smoothstep(0.56, 0.92, n*0.8 + n2*0.3) * smoothstep(0.02, 0.2, d.y);          // 积云
    float cir = smoothstep(0.50, 0.85, fbm(vec2(p.x*0.35, p.y*2.2) + 3.0)) * 0.35 * smoothstep(0.05, 0.4, d.y);   // 卷云丝
    vec3 lit = mix(uHor, vec3(1.0), 0.55) * 0.95 + uSunCol * (0.18 + 0.8*pow(s, 3.0));
    vec3 shade = mix(uTop, uHor, 0.5) * 0.72;
    vec3 cc = mix(lit, shade, smoothstep(0.5, 0.9, n2) * 0.6);
    c = mix(c, cc, clamp(cum*0.85 + cir, 0.0, 1.0));
  }
  gl_FragColor = vec4(uOut > 0.5 ? pow(aces(c), vec3(1.0/2.2)) : c * uHdr, 1.0);
}`;
const SHADOW_VS = `
attribute vec3 aPos; uniform mat4 uLVP; uniform mat4 uModel;
void main(){ gl_Position = uLVP * uModel * vec4(aPos, 1.0); }`;
const SHADOW_FS = `
precision highp float;
void main(){
  float d = gl_FragCoord.z;
  vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * d; enc = fract(enc);
  enc -= enc.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
  gl_FragColor = enc;
}`;
const QUAD_VS = `attribute vec2 aPos; varying vec2 vUV; void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BRIGHT_FS = GLSL_COMMON + `
uniform sampler2D uTex; uniform vec2 uPx; uniform float uHdr; varying vec2 vUV;
void main(){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) c += texture2D(uTex, vUV + (vec2(float(i), float(j)) - 0.5)*uPx).rgb;
  c = c * 0.25 / uHdr;
  float l = max(max(c.r, c.g), c.b);
  c *= smoothstep(0.95, 2.6, l);
  gl_FragColor = vec4(min(c, vec3(4.0)) * 0.25, 1.0);          // 压到 [0,1]（×4 还原）
}`;
const BLUR_FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uDir; varying vec2 vUV;
void main(){
  vec3 c = texture2D(uTex, vUV).rgb * 0.2270270270;
  c += (texture2D(uTex, vUV + uDir*1.3846153846).rgb + texture2D(uTex, vUV - uDir*1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(uTex, vUV + uDir*3.2307692308).rgb + texture2D(uTex, vUV - uDir*3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
const COMP_FS = GLSL_COMMON + `
uniform sampler2D uScene, uBloom, uAO; uniform float uHdr, uBloomK, uVig, uTime, uExp, uAOk; varying vec2 vUV;
void main(){
  vec3 c = texture2D(uScene, vUV).rgb / uHdr;
  c *= mix(1.0, texture2D(uAO, vUV).r, uAOk);
  c += texture2D(uBloom, vUV).rgb * 4.0 * uBloomK;
  c *= uExp;
  c = aces(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.04);                                   // 略提饱和
  c *= mix(vec3(1.0), vec3(1.035, 1.0, 0.94), smoothstep(0.35, 1.0, l));   // 高光偏暖
  c = pow(c, vec3(1.0/2.2));
  vec2 q = vUV - 0.5; c *= 1.0 - uVig * smoothstep(0.25, 0.95, dot(q, q)*2.2);
  c += (hash(gl_FragCoord.xy + fract(uTime)*37.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
const AO_FS = GLSL_COMMON + `
uniform sampler2D uDepth; uniform vec4 uP; uniform vec2 uTx; uniform float uR; varying vec2 vUV;
float lin(float d){ float z = d*2.0 - 1.0; return 2.0*uP.z*uP.w / (uP.w + uP.z - z*(uP.w - uP.z)); }
vec3 vpos(vec2 uv){ float z = lin(texture2D(uDepth, uv).r); return vec3((uv*2.0 - 1.0) * vec2(uP.x*uP.y, uP.y) * z, -z); }
void main(){
  float d0 = texture2D(uDepth, vUV).r;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P0 = vpos(vUV), px = vpos(vUV + vec2(uTx.x, 0.0)) - vpos(vUV - vec2(uTx.x, 0.0)), py = vpos(vUV + vec2(0.0, uTx.y)) - vpos(vUV - vec2(0.0, uTx.y));
  vec3 N = normalize(cross(px, py)); if (dot(N, -P0) < 0.0) N = -N;           // 由深度重建法线：平地不会被误判为遮挡
  float z0 = -P0.z, r = min(uR / (z0 * uP.y * 2.0), 0.09);
  float ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831, occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i), a = ang + fi * 2.399, rr = (fi + 0.6) / 12.0;
    vec3 v = vpos(vUV + vec2(cos(a), sin(a)) * rr * r * vec2(1.0 / uP.x, 1.0)) - P0;
    float d = length(v);
    occ += max(dot(N, v) / max(d, 1e-3) - 0.34, 0.0) * step(0.0, 1.0) * (1.0 - smoothstep(uR, uR * 2.4, d));
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - occ / 12.0 * 2.8, 0.0, 1.0)), 1.0);
}`;
const FXAA_FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uPx; varying vec2 vUV;
void main(){
  vec3 rgbNW = texture2D(uTex, vUV + vec2(-1.0,-1.0)*uPx).rgb, rgbNE = texture2D(uTex, vUV + vec2(1.0,-1.0)*uPx).rgb;
  vec3 rgbSW = texture2D(uTex, vUV + vec2(-1.0, 1.0)*uPx).rgb, rgbSE = texture2D(uTex, vUV + vec2(1.0, 1.0)*uPx).rgb;
  vec3 rgbM = texture2D(uTex, vUV).rgb; vec3 lm = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, lm), lNE = dot(rgbNE, lm), lSW = dot(rgbSW, lm), lSE = dot(rgbSE, lm), lM = dot(rgbM, lm);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0/128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(8.0), max(vec2(-8.0), dir * rcp)) * uPx;
  vec3 a = 0.5 * (texture2D(uTex, vUV + dir*(1.0/3.0-0.5)).rgb + texture2D(uTex, vUV + dir*(2.0/3.0-0.5)).rgb);
  vec3 b = a*0.5 + 0.25*(texture2D(uTex, vUV + dir*-0.5).rgb + texture2D(uTex, vUV + dir*0.5).rgb);
  float lb = dot(b, lm);
  gl_FragColor = vec4((lb < lMin || lb > lMax) ? a : b, 1.0);
}`;
const PART_VS = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute float aSeed;
uniform mat4 uVP; varying vec2 vUV; varying vec4 vCol; varying float vSeed; varying float vD;
void main(){ vUV = aUV; vCol = aCol; vSeed = aSeed; gl_Position = uVP * vec4(aPos, 1.0); vD = gl_Position.w; }`;
const PART_FS = GLSL_COMMON + `
uniform float uAdd, uHdr, uOut; varying vec2 vUV; varying vec4 vCol; varying float vSeed; varying float vD;
void main(){
  float r = length(vUV); if (r > 1.0) discard;
  float n = fbm(vUV*2.3 + vSeed*13.7);
  float soft = smoothstep(1.0, 0.15, r);
  float a = vCol.a * soft * (0.35 + 1.15*n) * smoothstep(0.4, 3.0, vD);
  vec3 c = vCol.rgb * (0.75 + 0.5*n);
  if (uOut > 0.5) c = pow(aces(c), vec3(1.0/2.2));
  else c *= uHdr;
  gl_FragColor = uAdd > 0.5 ? vec4(c * a, 0.0) : vec4(c, a);
}`;

const QUAL = {
  high: { shadow: 2048, post: true, bloom: true, fxaa: true, ao: true },
  med:  { shadow: 1024, post: true, bloom: true, fxaa: false, ao: true },
  low:  { shadow: 0,    post: false, bloom: false, fxaa: false },
};

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('当前浏览器不支持 WebGL');
    this.canvas = canvas;
    this.prog = this._mk(VS, FS, ['aPos', 'aNor', 'aCol']);
    this.U = this._uni(this.prog, ['uVP','uModel','uColor','uSunDir','uSunCol','uAmbS','uAmbG','uFog','uCam','uMat','uVC','uUnlit','uSpec','uFogD','uTime','uShadowOn','uTexel','uOut','uHdr','uRim','uShadow','uLVP']);
    this.sky = this._mk(SKY_VS, SKY_FS, ['aPos']);
    this.SU = this._uni(this.sky, ['uVPr','uTop','uHor','uSunCol','uSunDir','uTime','uOut','uHdr']);
    this.shp = this._mk(SHADOW_VS, SHADOW_FS, ['aPos']); this.SHU = this._uni(this.shp, ['uLVP', 'uModel']);
    this.bright = this._mk(QUAD_VS, BRIGHT_FS, ['aPos']); this.BU = this._uni(this.bright, ['uTex', 'uPx', 'uHdr']);
    this.blur = this._mk(QUAD_VS, BLUR_FS, ['aPos']); this.BLU = this._uni(this.blur, ['uTex', 'uDir']);
    this.comp = this._mk(QUAD_VS, COMP_FS, ['aPos']); this.CU = this._uni(this.comp, ['uScene', 'uBloom', 'uAO', 'uHdr', 'uBloomK', 'uVig', 'uTime', 'uExp', 'uAOk']);
    this.aop = this._mk(QUAD_VS, AO_FS, ['aPos']); this.AU = this._uni(this.aop, ['uDepth', 'uP', 'uR', 'uTx']);
    this.fxaa = this._mk(QUAD_VS, FXAA_FS, ['aPos']); this.FU = this._uni(this.fxaa, ['uTex', 'uPx']);
    this.part = this._mk(PART_VS, PART_FS, ['aPos', 'aUV', 'aCol', 'aSeed']); this.PU = this._uni(this.part, ['uVP', 'uAdd', 'uHdr', 'uOut']);
    this.m = {
      cube: this._mesh(geoCube()), cyl: this._mesh(geoCylS(14)), sph: this._mesh(geoSphereS(10, 16)),
      cone: this._mesh(geoConeS(14, .5)), leaf: this._mesh(geoLeaf()), pyr: this._mesh(geoCone(4, Math.SQRT1_2, Math.PI/4)),
    };
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.pbuf = gl.createBuffer(); this.pdata = new Float32Array(10 * 6 * 2600);
    this.tgt = {}; this.hdr = null; this.shadowMat = new Float32Array(16);
    this.setQuality('high');
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  }
  /** 带倒角的方块网格（按尺寸缓存；顶点含真实尺寸，使用时缩放取 1） */
  rbox(sx, sy, sz, b) {
    const k = [sx, sy, sz, b].map(v => v.toFixed(3)).join('|'); this._rb = this._rb || {};
    return this._rb[k] || (this._rb[k] = this._mesh(geoRBox(sx, sy, sz, b)));
  }
  get shadowOn() { return this.opt.shadow > 0; }
  setQuality(q) { this.q = q; this.opt = QUAL[q] || QUAL.high; }
  _sh(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  _mk(vs, fs, attrs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, this._sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  _uni(p, names) { const o = {}; names.forEach(n => o[n] = this.gl.getUniformLocation(p, n)); return o; }
  _mesh(data) {
    const gl = this.gl, buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { buf, count: data.length / 6, data: new Float32Array(data) };
  }
  _attrs(n) { const gl = this.gl; for (let i = 0; i < 4; i++) { if (i < n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); } }
  _bind(mesh, withNormal) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    if (withNormal) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); } else gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
  }
  _bindBatch(withNormal) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.batch.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    if (withNormal) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24); }
    else { gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); }
    gl.disableVertexAttribArray(3);
  }

  /** 静态场景合批：烘焙成一个顶点缓冲（位置/法线/颜色+材质），整个场景 1 次绘制。 */
  setStatic(objs) {
    const gl = this.gl, lit = objs.filter(o => !o.unlit); this.rest = objs.filter(o => o.unlit);
    let n = 0; lit.forEach(o => n += o.mesh.count);
    const out = new Float32Array(n * 10); let k = 0;
    for (const o of lit) {
      const m = o.m, d = o.mesh.data, c = o.col, mt = o.mat || 0;
      const s0 = m[0]*m[0] + m[1]*m[1] + m[2]*m[2], s1 = m[4]*m[4] + m[5]*m[5] + m[6]*m[6], s2 = m[8]*m[8] + m[9]*m[9] + m[10]*m[10];
      for (let i = 0; i < d.length; i += 6) {
        const x = d[i], y = d[i+1], z = d[i+2], nx = d[i+3] / s0, ny = d[i+4] / s1, nz = d[i+5] / s2;
        out[k++] = m[0]*x + m[4]*y + m[8]*z + m[12]; out[k++] = m[1]*x + m[5]*y + m[9]*z + m[13]; out[k++] = m[2]*x + m[6]*y + m[10]*z + m[14];
        const tx = m[0]*nx + m[4]*ny + m[8]*nz, ty = m[1]*nx + m[5]*ny + m[9]*nz, tz = m[2]*nx + m[6]*ny + m[10]*nz, l = Math.hypot(tx, ty, tz) || 1;
        out[k++] = tx / l; out[k++] = ty / l; out[k++] = tz / l;
        out[k++] = c[0]; out[k++] = c[1]; out[k++] = c[2]; out[k++] = mt;
      }
    }
    if (this.batch) gl.deleteBuffer(this.batch.buf);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
    this.batch = { buf, count: n };
  }
  resize(scale = 1) {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 1.5) * scale;
    const w = Math.max(2, Math.floor(c.clientWidth * dpr)), h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  /* ---------- 渲染目标 ---------- */
  _target(key, w, h, o = {}) {
    const gl = this.gl; let t = this.tgt[key];
    if (t && t.w === w && t.h === h && t.type === (o.type || gl.UNSIGNED_BYTE) && !!t.dtex === !!o.depthTex) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb); if (t.dtex) gl.deleteTexture(t.dtex); }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    const type = o.type || gl.UNSIGNED_BYTE, filt = o.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null, dtex = null;
    if (o.depthTex) { dtex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dtex, 0); }
    else if (o.depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t = this.tgt[key] = { fb, tex, rb, dtex, w, h, type, ok }; return t;
  }
  _sceneTarget(w, h) {
    const gl = this.gl;
    if (this.hdr === null) {
      this.hdr = { type: gl.UNSIGNED_BYTE, scale: 0.5 };
      const eh = gl.getExtension('OES_texture_half_float'), ec = gl.getExtension('EXT_color_buffer_half_float'), el = gl.getExtension('OES_texture_half_float_linear');
      if (eh && ec && el) { const t = this._target('scene', w, h, { depth: true, type: eh.HALF_FLOAT_OES }); if (t.ok) this.hdr = { type: eh.HALF_FLOAT_OES, scale: 1 }; }
    }
    if (this.dt === undefined) { this.dt = !!this.gl.getExtension('WEBGL_depth_texture'); }
    let t = this.dt ? this._target('scene', w, h, { depthTex: true, type: this.hdr.type }) : null;
    if (!t || !t.ok) { if (this.dt) { this.dt = false; } t = this._target('scene', w, h, { depth: true, type: this.hdr.type }); }
    return t;
  }
  _quadDraw() { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); this._attrs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  _tex(unit, tex) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

  /* ---------- 阴影贴图（太阳平行光，跟随镜头焦点，按纹素吸附防闪烁） ---------- */
  _shadowPass(cam, env, objs) {
    const gl = this.gl, S = this.opt.shadow, half = 48;
    const t = this._target('shadow', S, S, { depth: true, nearest: true });
    let L = env.sunDir.slice(); L[1] = Math.max(L[1], 0.34); const ll = Math.hypot(L[0], L[1], L[2]); L = L.map(v => v / ll);
    const fwd = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)];
    let tg = [cam.x + fwd[0] * 24, Math.max(0, cam.y - 6), cam.z + fwd[2] * 24];
    const f = [-L[0], -L[1], -L[2]];
    let right = [f[1]*0 - f[2]*1, f[2]*0 - f[0]*0, f[0]*1 - f[1]*0]; const rl = Math.hypot(right[0], right[1], right[2]); right = right.map(v => v / rl);
    const up = [right[1]*f[2]-right[2]*f[1], right[2]*f[0]-right[0]*f[2], right[0]*f[1]-right[1]*f[0]];
    const texel = 2 * half / S, tx = tg[0]*right[0] + tg[1]*right[1] + tg[2]*right[2], ty = tg[0]*up[0] + tg[1]*up[1] + tg[2]*up[2];
    const dx = Math.round(tx / texel) * texel - tx, dy = Math.round(ty / texel) * texel - ty;
    tg = [tg[0] + right[0]*dx + up[0]*dy, tg[1] + right[1]*dx + up[1]*dy, tg[2] + right[2]*dx + up[2]*dy];
    const eye = [tg[0] + L[0]*230, tg[1] + L[1]*230, tg[2] + L[2]*230];
    this.lvp = M4.mul(M4.ortho(-half, half, -half, half, 5, 470), M4.lookAt(eye, tg, [0, 1, 0]));
    this.shTexel = 1 / S;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, S, S);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.shp); gl.uniformMatrix4fv(this.SHU.uLVP, false, this.lvp);
    gl.cullFace(gl.FRONT);                                      // 画背面进深度图：避免自阴影斑纹
    if (this.batch) { this._bindBatch(false); gl.uniformMatrix4fv(this.SHU.uModel, false, M4.I()); gl.drawArrays(gl.TRIANGLES, 0, this.batch.count); }
    let last = null; const R2 = (half * 1.5) ** 2;
    for (const o of objs) {
      if (o.unlit || o.hide || o.noShadow) continue;
      const m = o.m, dx2 = m[12] - tg[0], dz2 = m[14] - tg[2]; if (dx2*dx2 + dz2*dz2 > R2 + (o.rad || 3) ** 2 && (m[13] < 30)) continue;
      if (o.mesh !== last) { this._bind(o.mesh, false); last = o.mesh; }
      gl.uniformMatrix4fv(this.SHU.uModel, false, m); gl.drawArrays(gl.TRIANGLES, 0, o.mesh.count);
    }
    gl.cullFace(gl.BACK); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  }

  /**
   * cam: {x,y,z,yaw,pitch,fov,t}    env: {top,hor,sunCol,amb,sunDir,fog,fogN,fogF}
   * objs: [{mesh,m,col,unlit,rad,hide,mat}]    parts: [{x,y,z,size,rot,r,g,b,a,add,seed}]
   */
  frame(cam, env, objs, parts) {
    const gl = this.gl, o = this.opt;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height, lin = c => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
    const time = cam.t || 0, post = o.post;
    let scene = null, hdrScale = 1;
    if (post) { scene = this._sceneTarget(W, H); hdrScale = this.hdr.scale; }
    let sh = null; if (o.shadow) sh = this._shadowPass(cam, env, objs);
    const sunLift = clampSun(env.sunDir[1]);
    // ----- 场景 -----
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? scene.fb : null); gl.viewport(0, 0, W, H);
    const asp = W / H, proj = M4.persp(cam.fov, asp, 0.1, 700); this.pj = { asp, tan: Math.tan(cam.fov / 2), n: 0.1, f: 700 }; const _x = 0, vr = M4.mul(M4.RX(-cam.pitch), M4.RY(-cam.yaw));
    const vp = M4.mul(proj, M4.mul(vr, M4.T(-cam.x, -cam.y, -cam.z)));
    const hor = lin(env.hor), top = lin(env.top), fogc = lin(env.fog), sunI = env.sunCol.map(v => v * 1.85);
    gl.clearColor(hor[0], hor[1], hor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.sky);
    gl.uniformMatrix4fv(this.SU.uVPr, false, M4.mul(proj, vr));
    gl.uniform3fv(this.SU.uTop, top); gl.uniform3fv(this.SU.uHor, hor); gl.uniform3fv(this.SU.uSunCol, sunI.map(v => v * 0.8)); gl.uniform3fv(this.SU.uSunDir, env.sunDir);
    gl.uniform1f(this.SU.uTime, time); gl.uniform1f(this.SU.uOut, post ? 0 : 1); gl.uniform1f(this.SU.uHdr, hdrScale);
    this._bind(this.m.sph, false); gl.drawArrays(gl.TRIANGLES, 0, this.m.sph.count);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(this.prog);
    const U = this.U;
    gl.uniformMatrix4fv(U.uVP, false, vp);
    gl.uniform3fv(U.uSunDir, env.sunDir); gl.uniform3fv(U.uSunCol, sunI);
    gl.uniform3fv(U.uAmbS, lin(env.amb).map((v, i) => v * 1.15 + top[i] * 0.40)); gl.uniform3fv(U.uAmbG, lin(env.amb).map((v, i) => v * 0.78 * [1.0, 0.84, 0.62][i] + hor[i] * 0.18));
    gl.uniform3fv(U.uFog, fogc); gl.uniform1f(U.uFogD, 2.1 / env.fogF); gl.uniform3f(U.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(U.uTime, time); gl.uniform1f(U.uOut, post ? 0 : 1); gl.uniform1f(U.uHdr, hdrScale);
    gl.uniform1f(U.uShadowOn, sh ? sunLift : 0); gl.uniform1f(U.uTexel, this.shTexel || 0);
    if (sh) { this._tex(0, sh.tex); gl.uniform1i(U.uShadow, 0); gl.uniformMatrix4fv(U.uLVP, false, this.lvp); }
    let drawn = 0;
    if (this.batch) {
      this._bindBatch(true);
      gl.uniformMatrix4fv(U.uModel, false, M4.I()); gl.uniform1f(U.uVC, 1); gl.uniform1f(U.uUnlit, 0); gl.uniform1f(U.uSpec, 0.05); gl.uniform1f(U.uRim, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.batch.count); drawn++;
      gl.uniform1f(U.uVC, 0);
    }
    if (this.rest && this.rest.length) objs = this.rest.concat(objs);
    let last = null, lastUnlit = -1;
    const far = env.fogF + 40;
    gl.uniform1f(U.uSpec, 0.10); gl.uniform1f(U.uRim, 0.35);
    for (let i = 0; i < objs.length; i++) {
      const ob = objs[i];
      if (ob.hide) continue;
      const m = ob.m, dx = m[12]-cam.x, dz = m[14]-cam.z, rr = (ob.rad || 2) + far;
      if (dx*dx + dz*dz > rr*rr) continue;                       // 远距离剔除
      if (ob.mesh !== last) { this._bind(ob.mesh, true); last = ob.mesh; }
      const u = ob.unlit ? 1 : 0;
      if (u !== lastUnlit) { gl.uniform1f(U.uUnlit, u); lastUnlit = u; }
      gl.uniformMatrix4fv(U.uModel, false, m);
      gl.uniform3fv(U.uColor, ob.col); gl.uniform1f(U.uMat, ob.mat || 0);
      gl.drawArrays(gl.TRIANGLES, 0, ob.mesh.count);
      drawn++;
    }
    this.lastDrawn = drawn;
    // ----- 粒子（半透明/加色，不写深度） -----
    if (parts && parts.length) this._particles(parts, cam, vp, post ? 0 : 1, hdrScale);
    // ----- 后期 -----
    if (post) this._post(scene, W, H, hdrScale, time);
  }

  _particles(parts, cam, vp, out, hdrScale) {
    const gl = this.gl, rx = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), fwd = [-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp];
    const upv = [rx[1]*fwd[2]-rx[2]*fwd[1], rx[2]*fwd[0]-rx[0]*fwd[2], rx[0]*fwd[1]-rx[1]*fwd[0]];
    const list = parts.length > 2500 ? parts.slice(0, 2500) : parts;
    const alpha = [], add = [];
    for (const p of list) { p.d = (p.x - cam.x) * fwd[0] + (p.y - cam.y) * fwd[1] + (p.z - cam.z) * fwd[2]; if (p.d < 0.2) continue; (p.add ? add : alpha).push(p); }
    alpha.sort((a, b) => b.d - a.d);
    gl.useProgram(this.part); gl.uniformMatrix4fv(this.PU.uVP, false, vp); gl.uniform1f(this.PU.uHdr, hdrScale); gl.uniform1f(this.PU.uOut, out);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    const run = (arr, additive) => {
      if (!arr.length) return;
      const d = this.pdata; let k = 0;
      for (const p of arr) {
        const s = p.size, c = Math.cos(p.rot || 0), si = Math.sin(p.rot || 0);
        const ax = (rx[0]*c + upv[0]*si) * s, ay = (rx[1]*c + upv[1]*si) * s, az = (rx[2]*c + upv[2]*si) * s;
        const bx = (-rx[0]*si + upv[0]*c) * s, by = (-rx[1]*si + upv[1]*c) * s, bz = (-rx[2]*si + upv[2]*c) * s;
        const V = (sx, sy, u, v) => { d[k++] = p.x + ax*sx + bx*sy; d[k++] = p.y + ay*sx + by*sy; d[k++] = p.z + az*sx + bz*sy; d[k++] = u; d[k++] = v; d[k++] = p.r; d[k++] = p.g; d[k++] = p.b; d[k++] = p.a; d[k++] = p.seed || 0; };
        V(-1, -1, -1, -1); V(1, -1, 1, -1); V(1, 1, 1, 1); V(-1, -1, -1, -1); V(1, 1, 1, 1); V(-1, 1, -1, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf); gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, k), gl.DYNAMIC_DRAW);
      this._attrs(4);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
      gl.uniform1f(this.PU.uAdd, additive ? 1 : 0);
      gl.blendFunc(additive ? gl.ONE : gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, k / 10); this.lastDrawn++;
    };
    run(alpha, false); run(add, true);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE); this._attrs(0);
  }

  _post(scene, W, H, hdrScale, time) {
    const gl = this.gl, o = this.opt;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2);
    let aoTex = null;
    if (o.ao && scene.dtex) {
      const aw = Math.max(2, W >> 1), ah = Math.max(2, H >> 1), a1 = this._target('ao1', aw, ah), a2 = this._target('ao2', aw, ah), pj = this.pj;
      gl.bindFramebuffer(gl.FRAMEBUFFER, a1.fb); gl.viewport(0, 0, aw, ah); gl.useProgram(this.aop);
      this._tex(0, scene.dtex); gl.uniform1i(this.AU.uDepth, 0); gl.uniform4f(this.AU.uP, pj.asp, pj.tan, pj.n, pj.f); gl.uniform1f(this.AU.uR, 1.2); gl.uniform2f(this.AU.uTx, 1 / aw, 1 / ah); this._quadDraw();
      gl.useProgram(this.blur); gl.uniform1i(this.BLU.uTex, 0);
      for (let it = 0; it < 2; it++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, a2.fb); this._tex(0, a1.tex); gl.uniform2f(this.BLU.uDir, 1.6 / aw, 0); this._quadDraw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, a1.fb); this._tex(0, a2.tex); gl.uniform2f(this.BLU.uDir, 0, 1.6 / ah); this._quadDraw();
      }
      aoTex = a1.tex;
    }
    let bloomTex = null;
    if (o.bloom) {
      const b1 = this._target('b1', bw, bh), b2 = this._target('b2', bw, bh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fb); gl.viewport(0, 0, bw, bh);
      gl.useProgram(this.bright); this._tex(0, scene.tex); gl.uniform1i(this.BU.uTex, 0); gl.uniform2f(this.BU.uPx, 2 / W, 2 / H); gl.uniform1f(this.BU.uHdr, hdrScale); this._quadDraw();
      gl.useProgram(this.blur); gl.uniform1i(this.BLU.uTex, 0);
      for (let it = 0; it < 2; it++) {
        const sp = 1 + it;
        gl.bindFramebuffer(gl.FRAMEBUFFER, b2.fb); this._tex(0, b1.tex); gl.uniform2f(this.BLU.uDir, sp / bw, 0); this._quadDraw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fb); this._tex(0, b2.tex); gl.uniform2f(this.BLU.uDir, 0, sp / bh); this._quadDraw();
      }
      bloomTex = b1.tex;
    }
    const mid = o.fxaa ? this._target('ldr', W, H) : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mid ? mid.fb : null); gl.viewport(0, 0, W, H);
    gl.useProgram(this.comp);
    this._tex(0, scene.tex); gl.uniform1i(this.CU.uScene, 0);
    this._tex(1, bloomTex || scene.tex); gl.uniform1i(this.CU.uBloom, 1);
    this._tex(2, aoTex || scene.tex); gl.uniform1i(this.CU.uAO, 2); gl.uniform1f(this.CU.uAOk, aoTex ? 0.78 : 0);
    gl.uniform1f(this.CU.uHdr, hdrScale); gl.uniform1f(this.CU.uBloomK, bloomTex ? (this.bloomK || 0.55) : 0); gl.uniform1f(this.CU.uVig, 0.32); gl.uniform1f(this.CU.uTime, time); gl.uniform1f(this.CU.uExp, this.exposure || 0.92);
    this._quadDraw();
    if (mid) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(this.fxaa); this._tex(0, mid.tex); gl.uniform1i(this.FU.uTex, 0); gl.uniform2f(this.FU.uPx, 1 / W, 1 / H); this._quadDraw();
    }
    this._attrs(0); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.activeTexture(gl.TEXTURE0);
  }
}
function clampSun(y) { const t = Math.min(1, Math.max(0, (y - 0.03) / 0.17)); return t * t * (3 - 2 * t); }

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
