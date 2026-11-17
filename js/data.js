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
  hit: ['游客.exe 已停止响应', '保龄球！全中！', '一位游客获得了短暂的飞行体验', '他本来只想拍张照', '物理学：你好', '这位游客选择了“起飞”', '路人 +1 腾空', '那人的自拍杆还在天上'],
  flop: ['你选择躺平。地心引力表示同意。', '主动摔倒也是一种旅行方式', '这个姿势，法老见了都得点赞'],
  landing: ['完美着陆（并没有）', '大地：我接住你了。', '你降落的姿势很有艺术性'],
  busted: ['保安把你当“违规行李”寄存了一圈', '被友好地请出景区（罚款一半）', '“先生，这里不能骑骆驼冲。”“那能跑吗。”'],
  dead: ['游客生涯结束：表演性去世', '你以一个很夸张的姿势结束了今天', '保险公司表示：请出示发票'],
  stealCamel: ['骆驼商人：“朋友！那是我家老二！”', '你偷了一只正在发呆的骆驼'],
  hornScare: ['“噗——”全场肃静', '喇叭声音太大，连金字塔都抖了一下'],
  banana: ['经典永不过时', '香蕉：我只是路过'],
  shopFail: ['“赊账？朋友，我们这里只收 $10，不收人情。”'],
  shopOk: ['“朋友价！看，这是我从骆驼那里抢救下来的。”'],
};

const ITEMS = {
  selfie:  { name: '自拍杆',   icon: '🤳', hint: 'F 自拍（空中/追逐/金字塔入镜加倍）', ammo: Infinity },
  horn:    { name: '空气炮喇叭', icon: '📣', hint: 'F 吹响，把周围的人掀翻', ammo: 4 },
  jetpack: { name: '火箭背包', icon: '🚀', hint: '空中按住 空格 喷射（落地回油）', ammo: 100 },
  banana:  { name: '香蕉皮',   icon: '🍌', hint: 'F 在脚下放一片', ammo: 4 },
};

const CHALLENGES = [
  { id: 'pyrSelfie', t: '金字塔打卡', d: '在金字塔附近自拍一张', cash: 20, score: 100 },
  { id: 'selfieAir', t: '空中自拍',   d: '离地 6 米以上自拍', cash: 40, score: 300 },
  { id: 'bowling',   t: '人肉保龄球', d: '4 秒内撞飞 5 个人', cash: 50, score: 300 },
  { id: 'airtime',   t: '滞空大师',   d: '骑乘载具连续滞空 2.5 秒', cash: 40, score: 250 },
  { id: 'camelExit', t: '骆驼冲线',   d: '骑骆驼冲进出口（东侧）', cash: 60, score: 300 },
  { id: 'escape',    t: '全身而退',   d: '达到三星通缉后成功甩掉', cash: 80, score: 400 },
  { id: 'throwFar', t: '投掷大师', d: '把人扔出 25 米远', cash: 50, score: 300 },
  { id: 'ramCop',   t: '撞飞骑警', d: '开载具高速撞飞骑骆驼的保安', cash: 60, score: 350 },
  { id: 'nukeSurvive', t: '核爆幸存者', d: '五星时在核弹下活下来', cash: 150, score: 1200 },
  { id: 'summit',    t: '登顶金字塔', d: '站上大金字塔顶端', cash: 120, score: 800 },
];

const SELFIE_TAGS = {
  air: ['空中自拍', 3], pyramid: ['金字塔入镜', 1.5], chased: ['背景有保安追杀', 2], camel: ['骑骆驼自拍', 1.5],
  pile: ['背景有人躺平', 2], wanted: ['全景区通缉', 1.5], summit: ['登顶！', 5], vehicle: ['驾驶中自拍', 1.3],
};
