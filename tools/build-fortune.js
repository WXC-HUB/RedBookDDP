// 预生成占卜分布表：node tools/build-fortune.js [runs]
// 用当前规则引擎跑蒙特卡洛，把「一局翻开卡包数」的累计分布写进 app/js/fortune-data.js。
// 数值（startPacks / shakeLimit / reward）改动后重新运行即可；pack.sh 会自动执行。
const fs = require('fs');
const path = require('path');
const E = require('../app/js/engine.js');

// 与 app/js/app.js 里的 CONFIG 保持一致
const APP_CONFIG = { startPacks: 20, shakeLimit: 1 };
const runs = parseInt(process.argv[2], 10) || 20000;
const cfg = E.mergeConfig(APP_CONFIG);

function simulateOne() {
  const s = E.startRun(cfg);
  E.setLucky(s, Math.floor(Math.random() * cfg.colors));
  let guard = 0;
  while (!s.ended && guard++ < 5000) {
    if (s.pendingShake) { E.shake(s); continue; }
    if (!E.deal(s)) break;
  }
  return s.spent;
}

const counts = [];
let max = 0;
for (let i = 0; i < runs; i++) {
  const v = simulateOne();
  counts[v] = (counts[v] || 0) + 1;
  if (v > max) max = v;
}
// cdf[s] = P(spent <= s)，保留 4 位小数
const cdf = [];
let acc = 0;
for (let s = 0; s <= max; s++) {
  acc += counts[s] || 0;
  cdf.push(Math.round(acc / runs * 10000) / 10000);
}
const sig = JSON.stringify([cfg.startPacks, cfg.shakeLimit, cfg.colors, cfg.cells, cfg.reward]);
const q = (p) => cdf.findIndex((c) => c >= p);
const out = `/* 猫猫对对碰 · 占卜分布表（自动生成，勿手改）
 * 由 tools/build-fortune.js 用当前规则引擎跑 ${runs} 局蒙特卡洛得到。
 * cdf[s] = 一局翻开卡包数 <= s 的概率。分位数：P30=${q(0.3)} P50=${q(0.5)} P60=${q(0.6)} P85=${q(0.85)} P95=${q(0.95)} max=${max}
 * 生成时间 ${new Date().toISOString().slice(0, 10)} */
window.TurtleFortuneData = {
  sig: ${JSON.stringify(sig)},
  n: ${runs},
  cdf: [${cdf.join(',')}]
};
`;
const target = path.join(__dirname, '..', 'app', 'js', 'fortune-data.js');
fs.writeFileSync(target, out, 'utf8');
console.log(`fortune-data.js written: runs=${runs} max=${max} P30=${q(0.3)} P50=${q(0.5)} P60=${q(0.6)} P85=${q(0.85)} P95=${q(0.95)}`);
