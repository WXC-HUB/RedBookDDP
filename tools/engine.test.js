// 引擎单元测试：node tools/engine.test.js
const E = require('../app/js/engine.js');
let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
  else console.log('ok  ', name);
}
const _ = null;

// 大满贯：9 色各不同 → slam 5 + clear 5 = 10
let r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, 8]);
eq('slam total', r.reward.total, 10);
eq('slam removed', r.removed.length, 9);

// 一条横线 + 其余不同色 → +5，不清空
r = E.evaluate([0, 0, 0, 1, 2, 3, 4, 5, 6]);
eq('line total', r.reward.total, 5);
eq('line pairs', r.pairs.length, 0);

// L 形三连 → 1 对
r = E.evaluate([0, 0, _, 0, _, _, _, _, _]);
eq('L shape pairs', r.pairs.length, 1);
eq('L shape not clear', r.clear, false);

// 2x2 → 2 对，且清空 → 2 + 5
r = E.evaluate([0, 0, _, 0, 0, _, _, _, _]);
eq('2x2 pairs', r.pairs.length, 2);
eq('2x2 total', r.reward.total, 7);

// 蛇形四连（非直线）：0-1、1-5、5-8 相邻；最大匹配应为 2 对
r = E.evaluate([0, 0, _, _, _, 0, _, _, 0]);
eq('snake pairs (max matching)', r.pairs.length, 2);

// 连线优先于对子：一列同色 + 一只同色挂在旁边 → 线消掉后那只孤龟不成对，只有 +5
r = E.evaluate([0, 0, _, 0, _, _, 0, _, _]);
eq('line eats neighbour total', r.reward.total, 5);
eq('line eats neighbour lines', r.lines.length, 1);
eq('line eats neighbour pairs', r.pairs.length, 0);
// 一行同色 + 另一色相邻对，且全部消光 → 5 + 1 + 清空 5 = 11
r = E.evaluate([0, 0, 0, 1, 1, _, _, _, _]);
eq('line plus pair plus clear total', r.reward.total, 11);
// 一行同色 + 另一色相邻对 + 一只孤龟 → 5 + 1，不清空
r = E.evaluate([0, 0, 0, 1, 1, 2, _, _, _]);
eq('line plus pair total', r.reward.total, 6);
// 填满后 deal 返回填充快照
const s0 = E.startRun({ startPacks: 9 });
const d0 = E.deal(s0);
eq('deal snapshot has 9 colors', d0.board.filter(function (c) { return c !== null; }).length, 9);

// 无消除：满盘但 0 号色在两个角，不相邻
r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, 0]);
eq('no match', r.removed.length, 0);

// 部分填充：只有两格同色相邻 → 清空 1 + 5
r = E.evaluate([0, 0, _, _, _, _, _, _, _]);
eq('partial clear', r.reward.total, 6);

// 斜线
r = E.evaluate([3, 1, 2, 4, 3, 5, 6, 7, 3]);
eq('diag line', r.lines.length, 1);

// 两条同色线共享中心：横中线 + 竖中线 → 2 条线 +10，剩 4 角不同色
r = E.evaluate([1, 0, 2, 0, 0, 0, 3, 0, 4]);
eq('cross lines', r.lines.length, 2);
eq('cross total', r.reward.total, 10);

// deal 流程：卡包不足只填 3 格
const s = E.startRun({ startPacks: 3 });
const d = E.deal(s);
eq('partial fill count', d.filled.length, 3);
eq('round advanced', s.round, 1);

// 两只同色不相邻 → 进入等待摇晃，而不是直接结束
const s2 = E.startRun({ startPacks: 2 });
s2.board = [0, null, null, null, null, null, null, null, 0];
s2.pendingShake = true;
eq('deal while pending is null', E.deal(s2), null);
const sh2 = E.shake(s2);
eq('shake returns moves', Array.isArray(sh2.moves), true);
// 摇后要么消掉（+1+5 清空）要么用尽 shakeLimit=1 结束
eq('shake resolves', sh2.result.removed.length === 2 || s2.ended === 'nomatch', true);
eq('shake after resolve is null', E.shake(s2), null);

// shake 保持颜色多重集不变
const s3 = E.startRun({ startPacks: 20 });
s3.board = [0, 1, 2, 3, 4, 5, 6, 7, 0];
s3.pendingShake = true;
const sh3 = E.shake(s3);
const sorted = (arr) => arr.filter(c => c !== null).slice().sort();
eq('shake keeps multiset', sorted(sh3.board), sorted([0, 1, 2, 3, 4, 5, 6, 7, 0]));
eq('shake counted', s3.counts.shakes, 1);
eq('shake not pending when not needed', E.shake(E.startRun()), null);

// shakeLimit = Infinity 且盘面有同色 → 摇到消为止，不会因零消除结束
const s4 = E.startRun({ startPacks: 20, shakeLimit: Infinity });
s4.board = [0, 1, 2, 3, 4, 5, 6, 7, 0];
s4.pendingShake = true;
let guard = 0;
while (s4.pendingShake && guard++ < 200) E.shake(s4);
eq('infinite shake eventually matches', s4.ended === null && s4.pendingShake === false, true);

// 幸运色：一行 0 色 + 幸运色 0 → 5 + 3 只幸运 = 8
r = E.evaluate([0, 0, 0, 1, 2, 3, 4, 5, 6], null, 0);
eq('lucky line bonus', r.reward.lucky, 3);
eq('lucky line total', r.reward.total, 8);
// 幸运色不在消除里 → 无加成
r = E.evaluate([0, 0, 0, 1, 2, 3, 4, 5, 6], null, 1);
eq('lucky absent', r.reward.lucky, 0);
// 大满贯里恰好一只幸运色 → 5 + 5 + 1
r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, 8], null, 4);
eq('lucky slam total', r.reward.total, 11);
// 孤龟不可能匹配 → 不进入摇晃，直接结束
const s5 = E.startRun({ startPacks: 1, shakeLimit: Infinity });
E.deal(s5);
eq('hopeless board ends immediately', s5.ended, 'nomatch');

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
