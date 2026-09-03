/* 乌龟对对碰 · 主程序（界面与流程）
 * 依赖：engine.js（window.TurtleEngine）、share.js（window.TurtleShare）
 * ES2017 / Chrome 61：不用可选链、空值合并、对象展开、Array.flat、Promise.finally。 */
(function () {
  'use strict';

  var E = window.TurtleEngine;
  var S = window.TurtleShare;

  /* 数值配置（待调） */
  var CONFIG = { startPacks: 20, shakeLimit: 1 };
  var STORAGE_KEY = 'ttddp.best.v1';
  var COLOR_NAMES = ['红', '橙', '黄', '绿', '青', '蓝', '靛', '紫', '粉'];

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
    var def = { rounds: 0, earned: 0, runs: 0 };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      var o = JSON.parse(raw);
      return { rounds: o.rounds | 0, earned: o.earned | 0, runs: o.runs | 0 };
    } catch (e) { return def; }
  }
  function saveBest(b) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch (e) { /* 存储不可用时忽略 */ }
  }
  var best = loadBest();
  function renderBest() {
    $('best-rounds').textContent = best.rounds;
    $('best-earned').textContent = best.earned;
    $('best-runs').textContent = best.runs;
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
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';
  var boardEl = $('board');
  var boardWrap = boardEl.parentNode;
  var cells = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    for (var i = 0; i < 9; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      var inner = document.createElement('div');
      inner.className = 'cell__inner';
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'turtle');
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttributeNS(XLINK_NS, 'xlink:href', '#t-turtle');
      use.setAttribute('href', '#t-turtle');
      svg.appendChild(use);
      inner.appendChild(svg);
      cell.appendChild(inner);
      boardEl.appendChild(cell);
      cells.push({ el: cell, inner: inner, svg: svg, color: null });
    }
  }

  function paintCell(i, color) {
    var c = cells[i];
    c.color = color;
    var lucky = state && color !== null && color === state.lucky;
    c.el.className = 'cell' + (color === null ? '' : ' is-filled') + (lucky ? ' is-lucky' : '');
    c.inner.className = 'cell__inner';
    c.inner.style.transform = '';
    c.svg.setAttribute('class', color === null ? 'turtle' : 'turtle turtle--c' + color);
  }

  function renderBoard(board) {
    for (var i = 0; i < 9; i++) paintCell(i, board[i]);
  }

  function floatText(target, text, kind) {
    var f = document.createElement('span');
    f.className = 'float' + (kind ? ' float--' + kind : '');
    f.textContent = text;
    target.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 950);
  }

  function setTicker(text, strong) {
    var t = $('ticker-text');
    t.textContent = text;
    t.classList.toggle('is-strong', !!strong);
  }

  function showShake(show) { $('shake').classList.toggle('is-show', show); }

  /* ---------- HUD ---------- */
  var state = null;
  var busy = false;

  function bumpPacks(kind) {
    var w = $('hud-packs-wrap');
    w.classList.remove('is-bump', 'is-drop');
    // 强制重启动画
    void w.offsetWidth;
    w.classList.add(kind);
  }

  function renderHud() {
    $('hud-round').textContent = state.round;
    $('hud-packs').textContent = state.packs;
    $('hud-earned').textContent = state.earned;
    var empties = 0;
    for (var i = 0; i < 9; i++) if (state.board[i] === null) empties++;
    var cost = Math.min(empties, state.packs);
    var sub = $('deal-cost');
    if (state.ended) sub.textContent = '本局已结束';
    else if (state.pendingShake) sub.textContent = '先摇一摇棋盘';
    else if (cost >= empties) sub.textContent = '用 ' + cost + ' 个卡包填满';
    else sub.textContent = '卡包不足，只能填 ' + cost + ' 格';
  }

  /* ---------- 结算演出（发牌与摇晃共用） ----------
   * out: 引擎返回的 { board, result, needShake, ended } */
  async function playSettlement(out) {
    var res = out.result;
    var R = state.cfg.reward;
    var shownPacks = state.packs - res.reward.total; // HUD 上逐步累加到 state.packs
    var shownEarned = state.earned - res.reward.total;
    var k, q;

    async function settleGroup(indices, hitClass, label, gain, kind, floatAt) {
      // 幸运色加成：组内每只幸运色乌龟 +R.lucky
      var luckyCells = [];
      for (q = 0; q < indices.length; q++) if (cells[indices[q]].color === state.lucky) luckyCells.push(indices[q]);
      var bonus = luckyCells.length * R.lucky;
      for (q = 0; q < indices.length; q++) cells[indices[q]].el.classList.add('is-hit', hitClass);
      setTicker(label + '  +' + gain + (bonus ? '  幸运 +' + bonus : ''), true);
      floatText(floatAt, '+' + gain, kind);
      await wait(bonus ? 300 : 480);
      if (bonus) {
        for (q = 0; q < luckyCells.length; q++) floatText(cells[luckyCells[q]].el, '★ +' + R.lucky, 'lucky');
        await wait(380);
      }
      for (q = 0; q < indices.length; q++) cells[indices[q]].el.classList.add('is-removing');
      await wait(320);
      for (q = 0; q < indices.length; q++) paintCell(indices[q], null);
      gain += bonus;
      shownPacks += gain;
      shownEarned += gain;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = shownEarned;
      bumpPacks('is-bump');
      await wait(220);
    }

    if (res.slam) {
      await settleGroup([0, 1, 2, 3, 4, 5, 6, 7, 8], 'is-hit--slam', '大满贯！九色齐聚', res.reward.slam, 'purple', boardEl);
    } else {
      for (k = 0; k < res.lines.length; k++) {
        var line = res.lines[k];
        // 共享格子已被前一条线消掉时，只高亮仍在盘上的格子
        var alive = [];
        for (var t = 0; t < 3; t++) if (cells[line[t]].color !== null) alive.push(line[t]);
        await settleGroup(alive, 'is-hit--line', '连线碰 ' + (k + 1) + '/' + res.lines.length, R.line, 'gold', cells[line[1]].el);
      }
      for (k = 0; k < res.pairs.length; k++) {
        var p = res.pairs[k];
        await settleGroup(p, 'is-hit--pair', '对子碰 ' + (k + 1) + '/' + res.pairs.length, R.pair, '', cells[p[1]].el);
      }
    }

    if (res.clear) {
      setTicker('清空盘面！额外 +' + res.reward.clear, true);
      floatText(boardEl, '清空 +' + res.reward.clear, 'gold');
      await wait(500);
      shownPacks += res.reward.clear;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = state.earned;
      bumpPacks('is-bump');
      await wait(400);
    } else {
      setTicker('本轮共 +' + res.reward.total + ' 卡包');
      await wait(250);
    }
  }

  /* 一次判定结束后的收尾：等待摇晃 / 结束 / 允许下一轮 */
  async function afterJudge(out) {
    renderHud();
    if (out.needShake) {
      setTicker(out.moves ? '摇完还是没碰上，再摇一次' : '什么都没碰上，摇一摇试试', true);
      showShake(true);
      busy = false;
      return;
    }
    busy = false;
    if (state.ended) {
      await wait(400);
      finishRun();
    } else {
      $('btn-deal').disabled = false;
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

    $('hud-round').textContent = state.round;
    $('hud-packs').textContent = state.packs - res.reward.total; // 先显示扣费后的数字
    bumpPacks('is-drop');
    setTicker('开卡包…');
    for (k = 0; k < out.filled.length; k++) {
      i = out.filled[k];
      paintCell(i, out.board[i]);
      cells[i].el.classList.add('is-dealing');
    }
    await wait(120 + out.filled.length * 70 + 260);
    for (k = 0; k < out.filled.length; k++) cells[out.filled[k]].el.classList.remove('is-dealing');

    if (res.removed.length === 0) {
      if (!out.needShake) { setTicker('什么都没碰上…', true); await wait(700); }
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
    setTicker('摇一摇…');
    await wait(560);
    boardWrap.classList.remove('is-shaking');

    // 2. 乌龟按新位置滑动（FLIP）
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
      if (!out.needShake) { setTicker('摇过了还是没碰上…', true); await wait(800); }
      await afterJudge(out);
      return;
    }
    await wait(150);
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 开局选幸运色 ---------- */
  function buildLuckyGrid() {
    var grid = $('lucky-grid');
    if (grid.childNodes.length) return;
    for (var c = 0; c < 9; c++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lucky-opt';
      btn.setAttribute('aria-label', COLOR_NAMES[c] + '色乌龟');
      btn.setAttribute('data-color', c);
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'turtle turtle--c' + c);
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttributeNS(XLINK_NS, 'xlink:href', '#t-turtle');
      use.setAttribute('href', '#t-turtle');
      svg.appendChild(use);
      btn.appendChild(svg);
      grid.appendChild(btn);
    }
    grid.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== grid && !(t.getAttribute && t.getAttribute('data-color') !== null)) t = t.parentNode;
      if (!t || t === grid) return;
      setOverlay('lucky', false);
      startRun(parseInt(t.getAttribute('data-color'), 10));
    });
  }

  function openLuckyPicker() {
    buildLuckyGrid();
    setOverlay('result', false);
    setOverlay('lucky', true);
  }

  /* ---------- Run 开始 / 结束 ---------- */
  function startRun(lucky) {
    state = E.startRun(CONFIG);
    E.setLucky(state, lucky);
    $('lucky-pill-turtle').setAttribute('class', 'turtle lucky-pill__turtle turtle--c' + lucky);
    buildBoard();
    renderBoard(state.board);
    renderHud();
    showShake(false);
    setTicker('点击「发牌」开始');
    $('btn-deal').disabled = false;
    busy = false;
    showScreen('game');
  }

  var lastStats = null;

  function finishRun() {
    $('btn-deal').disabled = true;
    showShake(false);
    var reasonText = state.ended === 'nomatch' ? '摇过棋盘还是没有任何消除' : '卡包用完了';
    var newRecord = state.round > best.rounds || state.earned > best.earned;
    best.runs++;
    if (state.round > best.rounds) best.rounds = state.round;
    if (state.earned > best.earned) best.earned = state.earned;
    saveBest(best);
    renderBest();

    lastStats = {
      rounds: state.round, earned: state.earned, bestRound: state.bestRound,
      lines: state.counts.lines, pairs: state.counts.pairs,
      clears: state.counts.clear, slams: state.counts.slam, shakes: state.counts.shakes,
      lucky: state.lucky, luckyBonus: state.counts.lucky * state.cfg.reward.lucky,
      reasonText: reasonText, newRecord: newRecord
    };

    $('result-reason').textContent = reasonText;
    var luckyEl = $('result-lucky');
    luckyEl.innerHTML = '';
    luckyEl.appendChild(document.createTextNode('幸运色'));
    var luckySvg = document.createElementNS(SVG_NS, 'svg');
    luckySvg.setAttribute('class', 'turtle turtle--c' + state.lucky);
    var luckyUse = document.createElementNS(SVG_NS, 'use');
    luckyUse.setAttributeNS(XLINK_NS, 'xlink:href', '#t-turtle');
    luckyUse.setAttribute('href', '#t-turtle');
    luckySvg.appendChild(luckyUse);
    luckyEl.appendChild(luckySvg);
    luckyEl.appendChild(document.createTextNode('消除 ' + state.counts.lucky + ' 只，加成 +' + lastStats.luckyBonus));
    $('result-rounds').textContent = lastStats.rounds;
    $('result-earned').textContent = lastStats.earned;
    $('result-best-round').textContent = lastStats.bestRound;
    $('result-lines').textContent = lastStats.lines;
    $('result-pairs').textContent = lastStats.pairs;
    $('result-clears').textContent = lastStats.clears;
    $('result-slams').textContent = lastStats.slams;
    $('result-new-record').classList.toggle('is-show', newRecord);
    $('btn-share').disabled = false;
    setOverlay('result', true);
  }

  function goHome() {
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
    var canvas = S.renderCard(lastStats);
    var r = await S.saveToAlbum(canvas);
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

  /* ---------- 启动 ---------- */
  renderBest();
  buildBoard();
  showScreen('home');

  // 调试钩子（不影响运行）
  window.TTDDP = { getState: function () { return state; }, config: CONFIG, colorNames: COLOR_NAMES };
})();
