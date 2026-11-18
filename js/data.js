'use strict';
/* ============================================================
 * data.js — 配置表 + 文案 + 挑战（MVP02 · 第三人称搞笑沙盒）
 * ============================================================ */
const CFG = {
  walk: 4.8, sprint: 8.2, jump: 8.6, gravity: 24,
  hpMax: 100, startMoney: 60, shopPrice: 10, rentPrice: 15, rentTime: 120,
  comboWindow: 4, comboMax: 8,
  heatDecayDelay: 5, heatDecay: 0.3, guardSight: 38,
  respawn: { x: 0, z: 100 },
  tourists: 22, props: 46,
  camDist: 6.5, camDistVeh: 11,
};

const HUMOR = {
  hit: [L('游客.exe 已停止响应'), L('保龄球！全中！'), L('一位游客获得了短暂的飞行体验'), L('他本来只想拍张照'), L('物理学：你好'), L('这位游客选择了“起飞”'), L('路人 +1 腾空'), L('那人的自拍杆还在天上')],
  flop: [L('你选择躺平。地心引力表示同意。'), L('主动摔倒也是一种旅行方式'), L('这个姿势，法老见了都得点赞')],
  landing: [L('完美着陆（并没有）'), L('大地：我接住你了。'), L('你降落的姿势很有艺术性')],
  busted: [L('保安把你当“违规行李”寄存了一圈'), L('被友好地请出景区（罚款一半）'), L('“先生，这里不能骑骆驼冲。”“那能跑吗。”')],
  dead: [L('游客生涯结束：表演性去世'), L('你以一个很夸张的姿势结束了今天'), L('保险公司表示：请出示发票')],
  stealCamel: [L('骆驼商人：“朋友！那是我家老二！”'), L('你偷了一只正在发呆的骆驼')],
  hornScare: [L('“噗——”全场肃静'), L('喇叭声音太大，连金字塔都抖了一下')],
  banana: [L('经典永不过时'), L('香蕉：我只是路过')],
  shopFail: [L('“赊账？朋友，我们这里只收 $10，不收人情。”')],
  shopOk: [L('“朋友价！看，这是我从骆驼那里抢救下来的。”')],
};

const ITEMS = {
  selfie:  { name: L('自拍杆'),   icon: '🤳', hint: L('F 自拍（空中/追逐/金字塔入镜加倍）'), ammo: Infinity },
  horn:    { name: L('空气炮喇叭'), icon: '📣', hint: L('F 吹响，把周围的人掀翻'), ammo: 4 },
  jetpack: { name: L('火箭背包'), icon: '🚀', hint: L('空中按住 空格 喷射（落地回油）'), ammo: 100 },
  banana:  { name: L('香蕉皮'),   icon: '🍌', hint: L('F 在脚下放一片'), ammo: 4 },
};

const CHALLENGES = [
  { id: 'pyrSelfie', t: L('金字塔打卡'), d: L('在金字塔附近自拍一张'), cash: 20, score: 100 },
  { id: 'selfieAir', t: L('空中自拍'),   d: L('离地 6 米以上自拍'), cash: 40, score: 300 },
  { id: 'bowling',   t: L('人肉保龄球'), d: L('4 秒内撞飞 5 个人'), cash: 50, score: 300 },
  { id: 'airtime',   t: L('滞空大师'),   d: L('骑乘载具连续滞空 2.5 秒'), cash: 40, score: 250 },
  { id: 'camelExit', t: L('骆驼冲线'),   d: L('骑骆驼冲进出口（东侧）'), cash: 60, score: 300 },
  { id: 'escape',    t: L('全身而退'),   d: L('达到三星通缉后成功甩掉'), cash: 80, score: 400 },
  { id: 'throwFar', t: L('投掷大师'), d: L('把人扔出 25 米远'), cash: 50, score: 300 },
  { id: 'ramCop',   t: L('撞飞骑警'), d: L('开载具高速撞飞骑骆驼的保安'), cash: 60, score: 350 },
  { id: 'nukeSurvive', t: L('核爆幸存者'), d: L('五星时在核弹下活下来'), cash: 150, score: 1200 },
  { id: 'summit',    t: L('登顶金字塔'), d: L('站上大金字塔顶端'), cash: 120, score: 800 },
];

const SELFIE_TAGS = {
  air: [L('空中自拍'), 3], pyramid: [L('金字塔入镜'), 1.5], chased: [L('背景有保安追杀'), 2], camel: [L('骑骆驼自拍'), 1.5],
  pile: [L('背景有人躺平'), 2], wanted: [L('全景区通缉'), 1.5], summit: [L('登顶！'), 5], vehicle: [L('驾驶中自拍'), 1.3],
};
