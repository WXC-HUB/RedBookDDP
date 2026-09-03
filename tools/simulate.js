// 蒙特卡洛：SHAKE_LIMIT=1 node tools/simulate.js [runs] [startPacks...]
// 复用 app/js/engine.js 的 Run 状态机，统计 Run 长度、收益与结束原因。
const E = require('../app/js/engine.js');

const runs = parseInt(process.argv[2], 10) || 20000;
const SHAKE_LIMIT = process.env.SHAKE_LIMIT === 'inf' ? Infinity : (parseInt(process.env.SHAKE_LIMIT, 10) || 1);
const packsList = process.argv.slice(3).map(Number).filter(Boolean);
if (!packsList.length) packsList.push(10, 20, 30, 50);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function simulate(startPacks) {
  const rounds = [];
  let earned = 0, spent = 0, empty = 0, nomatch = 0;
  const counts = { slam: 0, lines: 0, pairs: 0, clear: 0, shakes: 0 };
  let dealsTotal = 0, cellsFilled = 0;
  for (let r = 0; r < runs; r++) {
    const s = E.startRun({ startPacks, shakeLimit: SHAKE_LIMIT });
    E.setLucky(s, Math.floor(Math.random() * s.cfg.colors));
    while (!s.ended) {
      if (s.pendingShake) { E.shake(s); continue; } // 玩家总是选择摇晃
      const out = E.deal(s);
      if (!out) break;
      dealsTotal++;
      cellsFilled += out.filled.length;
    }
    rounds.push(s.round);
    earned += s.earned; spent += s.spent;
    if (s.ended === 'empty') empty++; else nomatch++;
    counts.slam += s.counts.slam; counts.lines += s.counts.lines;
    counts.pairs += s.counts.pairs; counts.clear += s.counts.clear;
    counts.shakes += s.counts.shakes;
  }
  rounds.sort((a, b) => a - b);
  const mean = rounds.reduce((a, b) => a + b, 0) / runs;
  return {
    startPacks,
    meanRounds: mean.toFixed(2),
    p50: percentile(rounds, 0.5),
    p90: percentile(rounds, 0.9),
    max: rounds[rounds.length - 1],
    returnRate: (earned / spent * 100).toFixed(1) + '%',
    endEmpty: (empty / runs * 100).toFixed(1) + '%',
    endNoMatch: (nomatch / runs * 100).toFixed(1) + '%',
    slamPerRun: (counts.slam / runs).toFixed(4),
    linesPerRun: (counts.lines / runs).toFixed(3),
    pairsPerRun: (counts.pairs / runs).toFixed(2),
    clearsPerRun: (counts.clear / runs).toFixed(3),
    shakesPerRun: (counts.shakes / runs).toFixed(2),
    avgFillPerDeal: (cellsFilled / dealsTotal).toFixed(2)
  };
}

console.log(`runs per setting: ${runs}, shakeLimit: ${SHAKE_LIMIT}\n`);
console.table(packsList.map(simulate));
