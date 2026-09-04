/* 猫猫对对碰 · 占卜（今日运势）
 * 分布来自预生成表 fortune-data.js（tools/build-fortune.js 用真实规则引擎离线跑蒙特卡洛得到），
 * 运行时不做任何模拟：结算时用本局翻开卡包数在累计分布里的百分位定 4 档运势。
 * 若表的配置签名与当前配置不一致（改了数值却没重新生成），退回一次小样本同步模拟并在控制台提示。
 * 依赖 engine.js（window.TurtleEngine）、fortune-data.js（window.TurtleFortuneData）。经典脚本，ES2017 / Chrome 61。 */
(function (root) {
  'use strict';

  var E = root.TurtleEngine;
  var DATA = root.TurtleFortuneData || null;

  /* 4 档：按百分位下限从低到高 */
  var TIERS = [
    { key: 'mo',    name: '末吉', min: 0 },
    { key: 'xiao',  name: '小吉', min: 0.3 },
    { key: 'zhong', name: '中吉', min: 0.6 },
    { key: 'da',    name: '大吉', min: 0.85 }
  ];

  var FALLBACK_N = 600;
  var fallback = {}; // sig -> { cdf, n }

  function sig(cfg) {
    return JSON.stringify([cfg.startPacks, cfg.shakeLimit, cfg.colors, cfg.cells, cfg.reward]);
  }

  /* 预生成表是否匹配当前配置 */
  function table(cfg) {
    var k = sig(cfg);
    if (DATA && DATA.sig === k && DATA.cdf && DATA.cdf.length) return DATA;
    return fallback[k] || null;
  }

  /* 兜底：配置与表不一致时，同步跑一小批得到 cdf（仅开发期会走到） */
  function buildFallback(cfg) {
    var k = sig(cfg);
    if (fallback[k]) return fallback[k];
    if (root.console && console.warn) console.warn('[fortune] fortune-data.js 与当前配置不一致，请运行 node tools/build-fortune.js 重新生成');
    var counts = [], max = 0, i, v;
    for (i = 0; i < FALLBACK_N; i++) {
      var s = E.startRun(cfg);
      E.setLucky(s, Math.floor(Math.random() * cfg.colors));
      var guard = 0;
      while (!s.ended && guard++ < 5000) {
        if (s.pendingShake) { E.shake(s); continue; }
        if (!E.deal(s)) break;
      }
      v = s.spent;
      counts[v] = (counts[v] || 0) + 1;
      if (v > max) max = v;
    }
    var cdf = [], acc = 0;
    for (i = 0; i <= max; i++) { acc += counts[i] || 0; cdf.push(acc / FALLBACK_N); }
    fallback[k] = { sig: k, n: FALLBACK_N, cdf: cdf };
    return fallback[k];
  }

  /* 兼容旧调用：开局不再跑模拟，这里只做一次表匹配检查 */
  function prepare(cfg) {
    cfg = E.mergeConfig(cfg);
    if (!table(cfg)) buildFallback(cfg);
  }

  function ready(cfg) { return !!table(E.mergeConfig(cfg)); }

  /* 评级：返回 { tier: 0..3, key, name, pct: 0..1, pctText, n, spent } */
  function rate(cfg, spent) {
    cfg = E.mergeConfig(cfg);
    var T = table(cfg) || buildFallback(cfg);
    var cdf = T.cdf, m = cdf.length - 1;
    var le = spent < 0 ? 0 : cdf[Math.min(spent, m)];        // P(X <= spent)
    var lt = spent <= 0 ? 0 : cdf[Math.min(spent - 1, m)];   // P(X <  spent)
    // 百分位取「严格更少 + 一半并列」，避免并列时偏高或偏低
    var pct = (lt + le) / 2;
    var tier = 0, i;
    for (i = TIERS.length - 1; i >= 0; i--) { if (pct >= TIERS[i].min) { tier = i; break; } }
    return {
      tier: tier, key: TIERS[tier].key, name: TIERS[tier].name,
      pct: pct, pctText: Math.round(pct * 100) + '%', n: T.n, spent: spent
    };
  }

  /* 调试：分布分位数 */
  function quantiles(cfg) {
    cfg = E.mergeConfig(cfg);
    var T = table(cfg);
    if (!T) return null;
    var cdf = T.cdf, q = function (p) { for (var i = 0; i < cdf.length; i++) if (cdf[i] >= p) return i; return cdf.length - 1; };
    return { n: T.n, p10: q(0.1), p30: q(0.3), p50: q(0.5), p60: q(0.6), p85: q(0.85), p95: q(0.95), max: cdf.length - 1 };
  }

  root.TurtleFortune = { TIERS: TIERS, prepare: prepare, ready: ready, rate: rate, quantiles: quantiles };
})(window);
