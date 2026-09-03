/* 乌龟对对碰 · 主程序（界面与流程）
 * 依赖：engine.js（window.TurtleEngine）、skins.js（window.TurtleSkin）、share.js（window.TurtleShare）
 * ES2017 / Chrome 61：不用可选链、空值合并、对象展开、Array.flat、Promise.finally。 */
(function () {
  'use strict';

  var E = window.TurtleEngine;
  var Skin = window.TurtleSkin;
  var S = window.TurtleShare;

  /* 数值配置（待调） */
  var CONFIG = { startPacks: 20, shakeLimit: 1 };
  var STORAGE_KEY = 'ttddp.best.v2'; // v1 记最长轮次；v2 改记最高得分（暂存区 + 盘上剩余）

  /* 开发开关：自动发牌（不暴露给玩家），默认开启
   * 第一次手动发牌后持续自动发牌 / 自动摇晃，直到本局结束。
   * 关闭方式任选：URL 带 ?auto=0（?auto=1 重新开启，选择会记住）；或控制台 TTDDP.setAutoDeal(false)。 */
  var DEV_KEY = 'ttddp.dev.autoDeal';
  var DEV = { autoDeal: true, autoDelay: 350 };
  (function initDev() {
    try {
      var m = /[?&]auto=([01])/.exec(location.search);
      if (m) localStorage.setItem(DEV_KEY, m[1]);
      DEV.autoDeal = localStorage.getItem(DEV_KEY) !== '0';
    } catch (e) { /* ignore */ }
  })();
  function setAutoDeal(on) {
    DEV.autoDeal = !!on;
    try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (state) renderHud();
    return DEV.autoDeal;
  }

  function $(id) { return document.getElementById(id); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- 视口高度（软键盘 / 容器高度变化兜底） ---------- */
  function setAppHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);

  /* ---------- 本地纪录 ---------- */
  function loadBest() {
    var def = { score: 0, earned: 0, runs: 0 };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      var o = JSON.parse(raw);
      return { score: o.score | 0, earned: o.earned | 0, runs: o.runs | 0 };
    } catch (e) { return def; }
  }
  function saveBest(b) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch (e) { /* 存储不可用时忽略 */ }
  }
  var best = loadBest();
  function renderBest() {
    var map = { 'best-score': best.score, 'best-earned': best.earned, 'best-runs': best.runs };
    for (var id in map) { var el = $(id); if (el) el.textContent = map[id]; }
  }

  /* ---------- 屏幕与覆盖层 ---------- */
  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('is-active', screens[i].id === 'screen-' + name);
    }
  }
  function setOverlay(id, open) { $(id).classList.toggle('is-open', open); }

  /* ---------- 棋盘 DOM ---------- */
  var boardEl = $('board');
  var boardWrap = boardEl.parentNode;
  var cells = [];
  var FX = window.TurtleFX;
  FX.init(boardWrap);

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    for (var i = 0; i < 9; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      var inner = document.createElement('div');
      inner.className = 'cell__inner';
      Skin.mount(inner);
      cell.appendChild(inner);
      boardEl.appendChild(cell);
      cells.push({ el: cell, inner: inner, color: null });
    }
  }

  function paintCell(i, color) {
    var c = cells[i];
    c.color = color;
    var lucky = state && color !== null && color === state.lucky;
    c.el.className = 'cell' + (color === null ? '' : ' is-filled') + (lucky ? ' is-lucky' : '');
    if (color === null) c.el.removeAttribute('data-fx');
    else c.el.setAttribute('data-fx', Skin.fx(color).id);
    c.inner.className = 'cell__inner sprite';
    c.inner.style.transform = '';
    Skin.paint(c.inner, color);
  }

  function renderBoard(board) {
    for (var i = 0; i < 9; i++) paintCell(i, board[i]);
  }

  function floatText(target, text, kind, color) {
    var f = document.createElement('span');
    f.className = 'float' + (kind ? ' float--' + kind : '');
    f.textContent = text;
    if (color) f.style.color = color;
    target.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 950);
  }

  /* ---------- 滚动新闻（TV 字幕式播报） ----------
   * push(text) 把一条播报排到队尾，从右侧滚入；文字持续向左匀速滚动，滚空后从头循环，
   * 循环时把队列裁到最近几条。reset() 开局清空，stop() 离开游戏页时停掉 rAF。 */
  var News = (function () {
    var viewport = $('ticker-viewport'), track = $('ticker-text');
    var items = [], x = 0, lastT = 0, speed = 64, running = false, raf = 0;
    var KEEP = 4;
    function render() {
      track.innerHTML = '';
      for (var i = 0; i < items.length; i++) {
        if (i) { var sep = document.createElement('span'); sep.className = 'ticker__sep'; sep.textContent = '\u25C6'; track.appendChild(sep); }
        var it = document.createElement('span');
        it.className = 'ticker__item' + (items[i].strong ? ' is-strong' : '');
        it.textContent = items[i].text;
        track.appendChild(it);
      }
    }
    function frame(t) {
      if (!running) return;
      var dt = Math.min(64, t - lastT); lastT = t;
      x -= speed * dt / 1000;
      if (x < -track.offsetWidth - 20) {
        if (items.length > KEEP) { items = items.slice(items.length - KEEP); render(); }
        x = viewport.clientWidth;
      }
      track.style.transform = 'translateX(' + x + 'px)';
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true; lastT = performance.now(); x = viewport.clientWidth;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function push(text, strong) {
      items.push({ text: text, strong: !!strong });
      if (items.length > 12) items = items.slice(items.length - 12);
      render();
      start();
    }
    function reset(text) {
      stop();
      items = [];
      render();
      if (text) push(text, false);
    }
    return { push: push, reset: reset, start: start, stop: stop };
  })();
  function setTicker(text, strong) { News.push(text, strong); }

  /* 生成一条播报：<款式名><模板>（+N 卡包，幸运 +M） */
  function headline(kind, colorIdx, gain, bonus) {
    var body;
    if (kind === 'slam') body = '九位大咖同框合影，全场轰动';
    else body = Skin.itemName(colorIdx) + Skin.news(colorIdx)[kind];
    return body + '（+' + gain + ' 卡包' + (bonus ? '，幸运 +' + bonus : '') + '）';
  }

  function showShake(show) { $('shake').classList.toggle('is-show', show); }

  /* ---------- 暂存区（被消除的棋子按款式计数，HUD 显示总数） ---------- */
  var stashItems = [];

  function buildStash() {
    var el = $('stash-items');
    el.innerHTML = '';
    stashItems = [];
    for (var c = 0; c < 9; c++) {
      var item = document.createElement('div');
      item.className = 'stash__item';
      item.setAttribute('aria-label', Skin.itemName(c));
      var sp = document.createElement('div');
      Skin.paint(sp, c);
      item.appendChild(sp);
      var n = document.createElement('span');
      n.className = 'stash__count';
      n.textContent = '0';
      item.appendChild(n);
      el.appendChild(item);
      stashItems.push({ el: item, count: n });
    }
  }

  /* counts: 长度 9 的每款数量；bumpColors: 刚入库的款式，弹一下 */
  function renderStash(counts, bumpColors) {
    var total = 0, c;
    for (c = 0; c < 9; c++) {
      total += counts[c];
      stashItems[c].count.textContent = counts[c];
      stashItems[c].el.classList.toggle('is-has', counts[c] > 0);
    }
    $('hud-stash').textContent = total;
    if (bumpColors) {
      for (c = 0; c < bumpColors.length; c++) {
        var it = stashItems[bumpColors[c]].el;
        it.classList.remove('is-bump');
        void it.offsetWidth;
        it.classList.add('is-bump');
      }
    }
  }

  /* ---------- HUD ---------- */
  var state = null;
  var busy = false;

  function bumpPacks(kind, color) {
    var w = $('hud-packs-wrap');
    w.style.setProperty('--fx', color || 'transparent');
    w.classList.remove('is-bump', 'is-drop');
    // 强制重启动画
    void w.offsetWidth;
    w.classList.add(kind);
  }

  function renderHud() {
    renderStash(state.stash);
    $('hud-packs').textContent = state.packs;
    $('hud-earned').textContent = state.earned;
    var empties = 0;
    for (var i = 0; i < 9; i++) if (state.board[i] === null) empties++;
    var cost = Math.min(empties, state.packs);
    var sub = $('deal-cost');
    if (state.ended) sub.textContent = '本局已结束';
    else if (DEV.autoDeal && state.round > 0) sub.textContent = '自动发牌中';
    else if (state.pendingShake) sub.textContent = '先摇一摇棋盘';
    else if (cost >= empties) sub.textContent = '用 ' + cost + ' 个卡包填满';
    else sub.textContent = '卡包不足，只能填 ' + cost + ' 格';
  }

  /* ---------- 结算演出（发牌与摇晃共用） ----------
   * out: 引擎返回的 { board, result, needShake, ended }
   * 节奏：命中高亮 + 预备压扁(0.3s) → [幸运加成飘字] → 本体动作 + 粒子 + 记账(0.5s)。
   * 连线、对子都逐组串行播放。 */
  function thumpBoard() {
    boardWrap.classList.remove('is-thump');
    void boardWrap.offsetWidth;
    boardWrap.classList.add('is-thump');
  }

  async function playSettlement(out) {
    var res = out.result;
    var R = state.cfg.reward;
    var shownPacks = state.packs - res.reward.total; // HUD 上逐步累加到 state.packs
    var shownEarned = state.earned - res.reward.total;
    var k;
    // 暂存区在界面上逐组累加：先退回本次消除的数量，随每组消除再加回去
    var shownStash = state.stash.slice();
    for (k = 0; k < res.removed.length; k++) shownStash[out.board[res.removed[k]]]--;

    /* 结算一组格子。opts: { hitClass, label, gain, kind, floatAt, intensity, word, color, thump } */
    async function settleGroup(indices, opts) {
      var q, fx0 = Skin.fx(cells[indices[0]].color);
      var word = opts.word != null ? opts.word : fx0.word;
      var color = opts.color || fx0.color;
      var luckyCells = [];
      for (q = 0; q < indices.length; q++) if (cells[indices[q]].color === state.lucky) luckyCells.push(indices[q]);
      var bonus = luckyCells.length * R.lucky;

      for (q = 0; q < indices.length; q++) cells[indices[q]].el.classList.add('is-hit', opts.hitClass);
      News.push(headline(opts.newsKind || 'pair', cells[indices[0]].color, opts.gain, bonus), opts.newsKind !== 'pair');
      floatText(opts.floatAt, word + ' +' + opts.gain, opts.kind, color);
      await wait(300);
      if (bonus) {
        for (q = 0; q < luckyCells.length; q++) floatText(cells[luckyCells[q]].el, '★ +' + R.lucky, 'lucky');
        await wait(320);
      }
      // 本体动作 + 粒子 + 记账同时发生
      for (q = 0; q < indices.length; q++) {
        var c = cells[indices[q]];
        var fx = Skin.fx(c.color);
        c.el.classList.add('is-removing');
        FX.burst(fx.id, c.el, opts.intensity || 1, fx.color);
      }
      if (opts.thump) thumpBoard();
      var gain = opts.gain + bonus;
      shownPacks += gain;
      shownEarned += gain;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = shownEarned;
      bumpPacks('is-bump', color);
      await wait(500);
      // 消掉的棋子进暂存区
      var stashed = [];
      for (q = 0; q < indices.length; q++) {
        stashed.push(cells[indices[q]].color);
        shownStash[cells[indices[q]].color]++;
        paintCell(indices[q], null);
      }
      renderStash(shownStash, stashed);
    }

    if (res.slam) {
      // 大满贯：九只各自的特效依次点燃，再一起消掉
      var all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      await settleGroup(all, {
        hitClass: 'is-hit--slam', newsKind: 'slam', gain: res.reward.slam, kind: 'purple',
        floatAt: boardEl, intensity: 1.5, word: '大满贯', color: null, thump: true
      });
    } else {
      for (k = 0; k < res.lines.length; k++) {
        var line = res.lines[k];
        // 共享格子已被前一条线消掉时，只高亮仍在盘上的格子
        var alive = [];
        for (var t = 0; t < 3; t++) if (cells[line[t]].color !== null) alive.push(line[t]);
        if (!alive.length) continue;
        await settleGroup(alive, {
          hitClass: 'is-hit--line', newsKind: 'line', gain: R.line, kind: 'gold',
          floatAt: cells[line[1]].el, intensity: 2.2, thump: true
        });
      }
      for (k = 0; k < res.pairs.length; k++) {
        var p = res.pairs[k];
        await settleGroup(p, {
          hitClass: 'is-hit--pair', newsKind: 'pair', gain: R.pair, kind: '',
          floatAt: cells[p[1]].el, intensity: 1
        });
      }
    }

    if (res.clear) {
      News.push('盘面清空，今日收摊大吉（+' + res.reward.clear + ' 卡包）', true);
      floatText(boardEl, '清空 +' + res.reward.clear, 'gold');
      FX.celebrate(boardEl, 2);
      thumpBoard();
      await wait(500);
      shownPacks += res.reward.clear;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = state.earned;
      bumpPacks('is-bump', '#e8590c');
      await wait(400);
    } else {
      News.push('本轮共入账 ' + res.reward.total + ' 卡包');
      await wait(250);
    }
  }

  /* 一次判定结束后的收尾：等待摇晃 / 结束 / 允许下一轮 */
  async function afterJudge(out) {
    renderHud();
    var runState = state; // 自动模式下延时后核对仍是同一局
    if (out.needShake) {
      News.push(out.moves ? '摇完还是没缘分，再摇一次' : '今日无事发生，摇一摇看看缘分', true);
      showShake(true);
      busy = false;
      if (DEV.autoDeal) {
        await wait(DEV.autoDelay + 300);
        if (state === runState && state.pendingShake && !busy) shakeBoard();
      }
      return;
    }
    busy = false;
    if (state.ended) {
      await wait(400);
      finishRun();
    } else {
      $('btn-deal').disabled = false;
      if (DEV.autoDeal) {
        await wait(DEV.autoDelay);
        if (state === runState && !state.ended && !state.pendingShake && !busy) playRound();
      }
    }
  }

  /* ---------- 发牌 ---------- */
  async function playRound() {
    if (busy || !state || state.ended || state.pendingShake) return;
    busy = true;
    $('btn-deal').disabled = true;

    var out = E.deal(state);
    if (!out) { busy = false; finishRun(); return; }

    var res = out.result;
    var i, k;

    $('hud-packs').textContent = state.packs - res.reward.total; // 先显示扣费后的数字
    bumpPacks('is-drop');
    News.push('第 ' + state.round + ' 轮：新一批卡包到店');
    for (k = 0; k < out.filled.length; k++) {
      i = out.filled[k];
      paintCell(i, out.board[i]);
      cells[i].el.classList.add('is-dealing');
    }
    await wait(120 + out.filled.length * 70 + 260);
    for (k = 0; k < out.filled.length; k++) cells[out.filled[k]].el.classList.remove('is-dealing');

    if (res.removed.length === 0) {
      if (!out.needShake) { News.push('今日无事发生，大家面面相觑', true); await wait(700); }
      await afterJudge(out);
      return;
    }
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 摇晃棋盘 ---------- */
  async function shakeBoard() {
    if (busy || !state || state.ended || !state.pendingShake) return;
    busy = true;
    showShake(false);

    var out = E.shake(state);
    if (!out) { busy = false; return; }

    // 1. 整盘抖动
    boardWrap.classList.remove('is-shaking');
    void boardWrap.offsetWidth;
    boardWrap.classList.add('is-shaking');
    News.push('摇一摇，缘分重新排队');
    await wait(560);
    boardWrap.classList.remove('is-shaking');

    // 2. 款式按新位置滑动（FLIP）
    var rects = [], k;
    for (k = 0; k < 9; k++) rects.push(cells[k].el.getBoundingClientRect());
    for (k = 0; k < out.moves.length; k++) {
      var m = out.moves[k];
      var dx = rects[m.to].left - rects[m.from].left;
      var dy = rects[m.to].top - rects[m.from].top;
      cells[m.from].inner.classList.add('is-moving');
      cells[m.from].inner.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1)';
    }
    await wait(480);
    renderBoard(out.board);

    // 3. 重新判定
    var res = out.result;
    if (res.removed.length === 0) {
      if (!out.needShake) { News.push('摇过了还是没缘分，本局落幕', true); await wait(800); }
      await afterJudge(out);
      return;
    }
    await wait(150);
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 皮肤 ---------- */
  function paintMascots() {
    var ms = document.querySelectorAll('.home__mascot');
    for (var i = 0; i < ms.length; i++) Skin.paint(ms[i], parseInt(ms[i].getAttribute('data-item'), 10));
    $('btn-skins').textContent = '皮肤';
    $('lucky-title').textContent = '选一只幸运' + Skin.get().noun;
  }

  function buildSkinList() {
    var list = $('skin-list');
    list.innerHTML = '';
    var skins = Skin.list();
    var cur = Skin.get();
    for (var i = 0; i < skins.length; i++) {
      var s = skins[i];
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'skin-item' + (s === cur ? ' is-active' : '');
      item.setAttribute('data-skin', s.id);
      var previews = document.createElement('div');
      previews.className = 'skin-item__previews';
      for (var p = 0; p < 3; p++) {
        var sp = document.createElement('div');
        Skin.paint(sp, p * 3, s);
        previews.appendChild(sp);
      }
      var text = document.createElement('div');
      text.className = 'skin-item__text';
      var name = document.createElement('span');
      name.className = 'skin-item__name';
      name.textContent = s.name;
      var meta = document.createElement('span');
      meta.className = 'skin-item__meta';
      meta.textContent = s.items[0].name + '、' + s.items[1].name + '、' + s.items[2].name + ' 等 9 款';
      text.appendChild(name);
      text.appendChild(meta);
      var check = document.createElement('span');
      check.className = 'skin-item__check';
      check.textContent = '✓';
      item.appendChild(previews);
      item.appendChild(text);
      item.appendChild(check);
      list.appendChild(item);
    }
  }

  $('skin-list').addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-skin'))) t = t.parentNode;
    if (!t || t === this) return;
    if (Skin.set(t.getAttribute('data-skin'))) {
      buildSkinList();
      Skin.preload();
    }
  });

  Skin.onChange(function () {
    paintMascots();
    luckyGridBuilt = false;
    if (state) {
      renderBoard(state.board);
      buildStash();
      renderStash(state.stash);
    }
  });

  /* ---------- 开局选幸运款 ---------- */
  var luckyGridBuilt = false;

  function buildLuckyGrid() {
    var grid = $('lucky-grid');
    if (luckyGridBuilt) return;
    grid.innerHTML = '';
    for (var c = 0; c < 9; c++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lucky-opt';
      btn.setAttribute('aria-label', Skin.itemName(c));
      btn.setAttribute('data-color', c);
      var sp = document.createElement('div');
      Skin.paint(sp, c);
      btn.appendChild(sp);
      var nm = document.createElement('span');
      nm.className = 'lucky-opt__name';
      nm.textContent = Skin.itemName(c);
      btn.appendChild(nm);
      grid.appendChild(btn);
    }
    luckyGridBuilt = true;
  }

  $('lucky-grid').addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-color') !== null)) t = t.parentNode;
    if (!t || t === this) return;
    setOverlay('lucky', false);
    startRun(parseInt(t.getAttribute('data-color'), 10));
  });

  function openLuckyPicker() {
    buildLuckyGrid();
    setOverlay('result', false);
    setOverlay('lucky', true);
  }

  /* ---------- Run 开始 / 结束 ---------- */
  function startRun(lucky) {
    state = E.startRun(CONFIG);
    E.setLucky(state, lucky);
    Skin.paint($('lucky-pill-sprite'), lucky);
    $('lucky-pill-note').textContent = Skin.itemName(lucky) + ' · 消除时每只 +1';
    buildBoard();
    buildStash();
    renderBoard(state.board);
    renderHud();
    showShake(false);
    News.reset('欢迎收看对对碰快讯 · 点击「发牌」开始');
    $('btn-deal').disabled = false;
    busy = false;
    showScreen('game');
  }

  var lastStats = null;

  function finishRun() {
    $('btn-deal').disabled = true;
    showShake(false);
    var reasonText = state.ended === 'nomatch' ? '摇过棋盘还是没有任何消除' : '卡包用完了';
    // 最终得分 = 暂存区 + 盘上剩余；不看轮次
    var t = E.tally(state, 3);
    var newRecord = t.total > best.score || state.earned > best.earned;
    best.runs++;
    if (t.total > best.score) best.score = t.total;
    if (state.earned > best.earned) best.earned = state.earned;
    saveBest(best);
    renderBest();

    lastStats = {
      score: t.total, stashed: t.stashed, onBoard: t.onBoard, top: t.top,
      rounds: state.round, earned: state.earned, bestRound: state.bestRound,
      lines: state.counts.lines, pairs: state.counts.pairs,
      clears: state.counts.clear, slams: state.counts.slam, shakes: state.counts.shakes,
      lucky: state.lucky, luckyBonus: state.counts.lucky * state.cfg.reward.lucky,
      reasonText: reasonText, newRecord: newRecord
    };

    $('result-reason').textContent = reasonText;
    var luckyEl = $('result-lucky');
    luckyEl.innerHTML = '';
    luckyEl.appendChild(document.createTextNode('幸运款'));
    var sp = document.createElement('div');
    Skin.paint(sp, state.lucky);
    luckyEl.appendChild(sp);
    luckyEl.appendChild(document.createTextNode(Skin.itemName(state.lucky) + ' 消除 ' + state.counts.lucky + ' 只，加成 +' + lastStats.luckyBonus));
    $('result-score').textContent = t.total;
    $('result-breakdown').textContent = '暂存区 ' + t.stashed + ' 只 + 棋盘剩余 ' + t.onBoard + ' 只';
    renderTop3(t.top);
    $('result-rounds').textContent = lastStats.rounds;
    $('result-earned').textContent = lastStats.earned;
    $('result-lines').textContent = lastStats.lines;
    $('result-pairs').textContent = lastStats.pairs;
    $('result-clears').textContent = lastStats.clears;
    $('result-slams').textContent = lastStats.slams;
    $('result-new-record').classList.toggle('is-show', newRecord);
    $('btn-share').disabled = false;
    setOverlay('result', true);
  }

  /* 结算 Top3：持有数量（暂存区 + 盘上剩余）最多的三款 */
  function renderTop3(top) {
    var box = $('result-top3');
    box.innerHTML = '';
    for (var i = 0; i < top.length; i++) {
      var card = document.createElement('div');
      card.className = 'top3 top3--' + (i + 1);
      var rank = document.createElement('span');
      rank.className = 'top3__rank';
      rank.textContent = 'TOP ' + (i + 1);
      var sp = document.createElement('div');
      Skin.paint(sp, top[i].color);
      var num = document.createElement('span');
      num.className = 'top3__count';
      num.textContent = top[i].count;
      var nm = document.createElement('span');
      nm.className = 'top3__name';
      nm.textContent = Skin.itemName(top[i].color);
      card.appendChild(rank);
      card.appendChild(sp);
      card.appendChild(num);
      card.appendChild(nm);
      box.appendChild(card);
    }
  }

  function goHome() {
    News.stop();
    setOverlay('result', false);
    setOverlay('share-preview', false);
    showShake(false);
    state = null;
    busy = false;
    showScreen('home');
  }

  /* ---------- 分享 ---------- */
  async function shareResult() {
    if (!lastStats) return;
    var btn = $('btn-share');
    btn.disabled = true;
    var card = await S.buildCard(lastStats);
    var r = await S.saveToAlbum(card.dataUrl);
    $('share-img').src = r.dataUrl;
    $('share-hint').textContent = r.msg;
    setOverlay('share-preview', true);
    btn.disabled = false;
  }

  /* ---------- 事件绑定 ---------- */
  $('btn-start').addEventListener('click', openLuckyPicker);
  $('btn-again').addEventListener('click', openLuckyPicker);
  $('btn-lucky-random').addEventListener('click', function () {
    setOverlay('lucky', false);
    startRun(Math.floor(Math.random() * 9));
  });
  $('btn-home').addEventListener('click', goHome);
  $('btn-home-ingame').addEventListener('click', function () {
    if (busy) return;
    if (state && !state.ended && state.round > 0) {
      if (!confirm('退出当前这局？进度不会保存。')) return;
    }
    goHome();
  });
  $('btn-deal').addEventListener('click', playRound);
  $('btn-shake').addEventListener('click', shakeBoard);
  $('btn-share').addEventListener('click', shareResult);
  $('btn-share-close').addEventListener('click', function () { setOverlay('share-preview', false); });
  $('btn-rules').addEventListener('click', function () { setOverlay('rules', true); });
  $('btn-rules-close').addEventListener('click', function () { setOverlay('rules', false); });
  $('btn-skins').addEventListener('click', function () { buildSkinList(); setOverlay('skins', true); });
  $('btn-skins-close').addEventListener('click', function () { setOverlay('skins', false); });

  /* ---------- 启动 ---------- */
  renderBest();
  buildBoard();
  paintMascots();
  Skin.preload();
  showScreen('home');

  // 调试钩子（不影响运行）
  window.TTDDP = {
    getState: function () { return state; },
    config: CONFIG,
    dev: DEV,
    setAutoDeal: setAutoDeal
  };
})();
