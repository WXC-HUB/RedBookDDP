/* 乌龟对对碰 · 占卜（今日运势）
 * 用真实规则引擎跑蒙特卡洛，得到「一局翻开卡包数」的分布；结算时用玩家本局翻开数在分布里的百分位定 4 档运势。
 * 分布按配置签名缓存；开局即在后台分块计算（不阻塞主线程），结算时若还没算完则同步补足一个较小样本。
 * 依赖 engine.js（window.TurtleEngine）。经典脚本，挂到 window.TurtleFortune。ES2017 / Chrome 61。 */
(function (root) {
  'use strict';

  var E = root.TurtleEngine;

  /* 4 档：按百分位下限从低到高 */
  var TIERS = [
    { key: 'mo',    name: '末吉', min: 0 },
    { key: 'xiao',  name: '小吉', min: 0.3 },
    { key: 'zhong', name: '中吉', min: 0.6 },
    { key: 'da',    name: '大吉', min: 0.85 }
  ];

  var N = 2400;        // 后台目标样本数
  var CHUNK = 200;     // 每个 setTimeout 片算多少局
  var MIN_SYNC = 600;  // 结算时若未算完，同步补足到这个数
  var cache = {};

  function sig(cfg) {
    return JSON.stringify([cfg.startPacks, cfg.shakeLimit, cfg.colors, cfg.cells, cfg.reward]);
  }

  /* 模拟一局：玩家总是选择摇晃；幸运款随机（对翻开数分布无偏） */
  function simulateOne(cfg) {
    var s = E.startRun(cfg);
    E.setLucky(s, Math.floor(Math.random() * cfg.colors));
    var guard = 0;
    while (!s.ended && guard++ < 5000) {
      if (s.pendingShake) { E.shake(s); continue; }
      if (!E.deal(s)) break;
    }
    return s.spent;
  }

  function entryFor(cfg) {
    var k = sig(cfg);
    if (!cache[k]) cache[k] = { samples: [], sorted: null, done: false, scheduled: false };
    return cache[k];
  }

  function finish(entry) {
    entry.sorted = entry.samples.slice().sort(function (a, b) { return a - b; });
    entry.done = true;
  }

  /* 后台分块计算；重复调用无副作用 */
  function prepare(cfg) {
    cfg = E.mergeConfig(cfg);
    var entry = entryFor(cfg);
    if (entry.done || entry.scheduled) return;
    entry.scheduled = true;
    function chunk() {
      if (entry.done) return;
      var end = Math.min(N, entry.samples.length + CHUNK);
      while (entry.samples.length < end) entry.samples.push(simulateOne(cfg));
      if (entry.samples.length >= N) { finish(entry); return; }
      setTimeout(chunk, 0);
    }
    setTimeout(chunk, 0);
  }

  function ready(cfg) { return entryFor(E.mergeConfig(cfg)).done; }

  /* 评级：返回 { tier: 0..3, key, name, pct: 0..1, pctText, n, spent } */
  function rate(cfg, spent) {
    cfg = E.mergeConfig(cfg);
    var entry = entryFor(cfg);
    if (!entry.done) {
      while (entry.samples.length < MIN_SYNC) entry.samples.push(simulateOne(cfg));
      finish(entry);
    }
    var arr = entry.sorted, n = arr.length, less = 0, equal = 0, i;
    for (i = 0; i < n; i++) {
      if (arr[i] < spent) less++;
      else if (arr[i] === spent) equal++;
      else break;
    }
    // 百分位取「严格更少 + 一半相等」，避免并列时偏高或偏低
    var pct = n ? (less + equal * 0.5) / n : 0.5;
    var tier = 0;
    for (i = TIERS.length - 1; i >= 0; i--) { if (pct >= TIERS[i].min) { tier = i; break; } }
    return {
      tier: tier, key: TIERS[tier].key, name: TIERS[tier].name,
      pct: pct, pctText: Math.round(pct * 100) + '%', n: n, spent: spent
    };
  }

  /* 调试：分布分位数 */
  function quantiles(cfg) {
    cfg = E.mergeConfig(cfg);
    var entry = entryFor(cfg);
    if (!entry.done) return null;
    var a = entry.sorted, q = function (p) { return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
    return { n: a.length, p10: q(0.1), p30: q(0.3), p50: q(0.5), p60: q(0.6), p85: q(0.85), p95: q(0.95), max: a[a.length - 1] };
  }

  root.TurtleFortune = { TIERS: TIERS, prepare: prepare, ready: ready, rate: rate, quantiles: quantiles };
})(window);
