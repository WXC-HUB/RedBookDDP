/* 猫猫对对碰 · 主程序（界面与流程）
 * 依赖：engine.js（window.TurtleEngine）、skins.js（window.TurtleSkin）、share.js（window.TurtleShare）
 * ES2017 / Chrome 61：不用可选链、空值合并、对象展开、Array.flat、Promise.finally。 */
(function () {
  'use strict';

  var E = window.TurtleEngine;
  var Skin = window.TurtleSkin;
  var S = window.TurtleShare;
  var Fortune = window.TurtleFortune;

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
    if (!DEV.autoDeal && Speed.get() !== 1) Speed.set(1); // 手动模式没有倍速控件，回到常速
    if (state) renderHud(); else renderDealMode();
    return DEV.autoDeal;
  }

  function $(id) { return document.getElementById(id); }
  /* ---------- 全局倍速：0 = 暂停，1 / 2 / 4 ----------
   * 所有演出用的等待都走 Speed.wait：切倍速时把每个等待者已走过的「游戏时间」结算掉，再按新倍速重排；
   * CSS 动画通过 :root 的 --spd 变量缩短时长，暂停用 is-paused 冻结 animation-play-state；
   * 粒子特效（fx.js）与滚动新闻（News）各自按倍率缩放步长。 */
  var Speed = (function () {
    var rate = 1, waiters = [];
    function remove(w) { var i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); }
    function schedule(w) {
      if (w.timer) { clearTimeout(w.timer); w.timer = 0; }
      if (rate <= 0) return; // 暂停：不排定时器，等恢复时再排
      w.start = performance.now();
      w.rateAt = rate;
      w.timer = setTimeout(function () { remove(w); w.resolve(); }, w.remaining / rate);
    }
    function wait(ms) {
      return new Promise(function (resolve) {
        var w = { remaining: ms, resolve: resolve, timer: 0, start: 0, rateAt: 1 };
        waiters.push(w);
        schedule(w);
      });
    }
    function set(r) {
      var i, w;
      for (i = 0; i < waiters.length; i++) {
        w = waiters[i];
        if (w.timer) w.remaining = Math.max(0, w.remaining - (performance.now() - w.start) * w.rateAt);
      }
      rate = r;
      document.documentElement.style.setProperty('--spd', String(r || 1)); // 暂停时不改时长，只冻结播放
      document.documentElement.classList.toggle('is-paused', r === 0);
      if (FX.setRate) FX.setRate(r);
      News.setRate(r);
      for (i = 0; i < waiters.length; i++) schedule(waiters[i]);
      var btns = document.querySelectorAll('.speed__btn');
      for (i = 0; i < btns.length; i++) btns[i].classList.toggle('is-active', parseFloat(btns[i].getAttribute('data-speed')) === r);
    }
    return { wait: wait, set: set, get: function () { return rate; } };
  })();
  function wait(ms) { return Speed.wait(ms); }
  function after(ms, fn) { Speed.wait(ms).then(fn); }

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
  /* 拉锁转场：图标落下裂开旧屏，盖满时执行 mid（切屏 / 重建 DOM）。图标色固定为海报橙红（--ember），与款式色无关。 */
  function wipeTo(mid, color) {
    return Wipe.run({ shape: Skin.get().wipe, color: color, mid: mid });
  }

  /* ---------- 棋盘 DOM ---------- */
  var boardEl = $('board');
  var boardWrap = boardEl.parentNode;
  var cells = [];
  var FX = window.TurtleFX;
  var Wipe = window.TurtleWipe;
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
    c.inner.style.transitionDelay = '';
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
    after(950, function () { if (f.parentNode) f.parentNode.removeChild(f); });
  }

  /* ---------- 滚动新闻（TV 字幕式连续播报） ----------
   * 轨道是一条持续向左滚动的 DOM 流：新播报 push 进来只会接在当前尾部，绝不打断正在滚动的内容；
   * 完全滚出左侧的元素被移除，并把它的宽度加回偏移量，画面不跳；
   * 尾部一旦进入视口且后面没内容了，就把最近几条循环补上，字幕永远不断流。 */
  var News = (function () {
    var viewport = $('ticker-viewport'), track = $('ticker-text');
    var x = 0, lastT = 0, speed = 64, rate = 1, running = false, raf = 0;
    var recent = [], cycle = 0, KEEP = 4;

    function makeNode(item, isCycle) {
      var frag = document.createDocumentFragment();
      if (track.childNodes.length) {
        var sep = document.createElement('span');
        sep.className = 'ticker__sep'; sep.textContent = '\u25C6';
        if (isCycle) sep.setAttribute('data-cycle', '1');
        frag.appendChild(sep);
      }
      var el = document.createElement('span');
      el.className = 'ticker__item' + (item.strong ? ' is-strong' : '');
      el.textContent = item.text;
      if (isCycle) el.setAttribute('data-cycle', '1');
      frag.appendChild(el);
      track.appendChild(frag);
    }

    /* 去掉尚未进入视口的循环补位内容，让新播报紧跟在可见尾部之后 */
    function dropUnseenCycles() {
      var vw = viewport.clientWidth;
      while (track.lastChild && track.lastChild.getAttribute('data-cycle') && x + track.lastChild.offsetLeft > vw) {
        track.removeChild(track.lastChild);
      }
    }

    function frame(t) {
      if (!running) return;
      var dt = Math.min(64, t - lastT); lastT = t;
      x -= speed * rate * dt / 1000;
      // 头部完全滚出 → 移除并补偿偏移
      while (track.firstChild) {
        var w = track.firstChild.offsetWidth;
        if (x + w < -2) { x += w; track.removeChild(track.firstChild); } else break;
      }
      // 尾部进入视口且后面没内容 → 循环补最近几条
      var vw = viewport.clientWidth;
      if (recent.length && x + track.offsetWidth < vw - 4) {
        makeNode(recent[cycle % recent.length], true);
        cycle++;
      }
      track.style.transform = 'translateX(' + x + 'px)';
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true; lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function push(text, strong) {
      var item = { text: text, strong: !!strong };
      recent.push(item);
      if (recent.length > KEEP) recent.shift();
      cycle = 0;
      dropUnseenCycles();
      if (!track.childNodes.length) x = viewport.clientWidth; // 空轨道：从右侧滚入
      makeNode(item, false);
      start();
    }
    function reset(text) {
      stop();
      track.innerHTML = '';
      recent = []; cycle = 0;
      x = viewport.clientWidth;
      track.style.transform = 'translateX(' + x + 'px)';
      if (text) push(text, false);
    }
    function setRate(r) { rate = r; }
    return { push: push, reset: reset, start: start, stop: stop, setRate: setRate };
  })();

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
    var sub;
    if (state.ended) sub = '本局已结束';
    else if (DEV.autoDeal && state.round > 0) sub = '自动发牌中';
    else if (state.pendingShake) sub = '先摇一摇棋盘';
    else if (cost >= empties) sub = '用 ' + cost + ' 个卡包填满';
    else sub = '卡包不足，只能填 ' + cost + ' 格';
    $('deal-cost').textContent = sub;
    $('deal-start-cost').textContent = sub;
    renderDealMode();
  }

  /* 自动发牌模式：底栏不放发牌按钮；开局在棋盘上盖一层遮罩，只留一个发牌按钮，点过一次后整局不再出现。
   * 手动模式：保持底栏发牌按钮。 */
  function renderDealMode() {
    $('screen-game').classList.toggle('is-auto', DEV.autoDeal);
    var show = DEV.autoDeal && !!state && !state.ended && state.round === 0 && !state.pendingShake && !busy;
    $('deal-mask').classList.toggle('is-show', show);
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
    }
  }

  /* 一次判定结束后的收尾：等待摇晃 / 结束 / 允许下一轮 */
  async function afterJudge(out) {
    renderHud();
    var runState = state; // 自动模式下延时后核对仍是同一局
    if (out.needShake) {
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
    $('deal-mask').classList.remove('is-show');

    var out = E.deal(state);
    if (!out) { busy = false; finishRun(); return; }

    var res = out.result;
    var i, k;

    $('hud-packs').textContent = state.packs - res.reward.total; // 先显示扣费后的数字
    bumpPacks('is-drop');
    var dealt = [];
    for (k = 0; k < out.filled.length; k++) dealt.push(out.board[out.filled[k]]);
    await playPackOpen(dealt);
    // 逐张快速撕开：每 TEAR_STEP 撕一张，撕开 TEAR_TO_FLY 后这张票的猫飞出、票身爆开
    var TEAR_STEP = 55, TEAR_TO_FLY = 220;
    for (k = 0; k < out.filled.length; k++) {
      i = out.filled[k];
      after(k * TEAR_STEP, tearTicket.bind(null, k));
      flyIn(i, out.board[i], k * TEAR_STEP + TEAR_TO_FLY, tickets[k].body);
      after(k * TEAR_STEP + TEAR_TO_FLY, burstTicket.bind(null, k));
    }
    var lastFly = (out.filled.length - 1) * TEAR_STEP + TEAR_TO_FLY;
    after(lastFly + 300, clearTickets);
    await wait(lastFly + 470 + 260);

    if (res.removed.length === 0) {
      if (!out.needShake) await wait(700);
      await afterJudge(out);
      return;
    }
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 开卡包演出：票券扇形落下 → 撕下票根 → 猫猫从各自票身飞到格子 ---------- */
  var packsEl = $('packs');
  var SVG_NS = 'http://www.w3.org/2000/svg';
  /* 票 62 宽 × 100 高，穿孔在 y=32；左右各一个半圆缺口。路径为开放路径，穿孔那条边不描，留给虚线 */
  var TK_STUB = 'M7.5,32 A6,6 0 0 0 1.5,26 L1.5,7.5 A6,6 0 0 1 7.5,1.5 L54.5,1.5 A6,6 0 0 1 60.5,7.5 L60.5,26 A6,6 0 0 0 54.5,32';
  var TK_BODY = 'M54.5,32 A6,6 0 0 0 60.5,38 L60.5,92.5 A6,6 0 0 1 54.5,98.5 L7.5,98.5 A6,6 0 0 1 1.5,92.5 L1.5,38 A6,6 0 0 0 7.5,32';
  var TK_SHADOW = 'rgba(46, 45, 40, 0.3)';

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  /* 一块票（票根或票身）的 SVG：硬投影 + 填色 + 描边（穿孔那条边不描，留给虚线） */
  function ticketPart(viewBox, d, fill, extra) {
    var svg = svgEl('svg', { viewBox: viewBox });
    svg.appendChild(svgEl('path', { d: d + ' Z', fill: TK_SHADOW, transform: 'translate(3.5 4.5)' }));
    svg.appendChild(svgEl('path', { d: d + ' Z', fill: fill }));
    svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: '#2e2d28', 'stroke-width': '3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (var i = 0; extra && i < extra.length; i++) svg.appendChild(extra[i]);
    return svg;
  }
  function buildTicket(color) {
    var tk = document.createElement('div');
    tk.className = 'tk';
    var stub = document.createElement('div');
    stub.className = 'tk__stub';
    stub.appendChild(ticketPart('0 0 62 32', TK_STUB, '#93ad7f', [
      svgEl('rect', { x: 12, y: 9, width: 38, height: 3, rx: 1.5, fill: '#f4e7cc' }),
      svgEl('rect', { x: 12, y: 15.5, width: 26, height: 3, rx: 1.5, fill: '#f4e7cc' }),
      svgEl('rect', { x: 12, y: 22, width: 38, height: 3, rx: 1.5, fill: '#f4e7cc' })
    ]));
    var body = document.createElement('div');
    body.className = 'tk__body';
    body.appendChild(ticketPart('0 32 62 68', TK_BODY, '#d8552c', [
      svgEl('line', { x1: 9.5, y1: 32, x2: 52.5, y2: 32, stroke: '#2e2d28', 'stroke-width': '2', 'stroke-dasharray': '3 3' })
    ]));
    var src = Skin.src(color);
    if (src) {
      var img = document.createElement('img');
      img.className = 'tk__icon';
      img.alt = '';
      img.src = src;
      body.appendChild(img);
    }
    tk.appendChild(stub);
    tk.appendChild(body);
    return { el: tk, body: body, stub: stub };
  }

  var tickets = [];

  /* 生成 N 张票并扇形排开（先缩在中心，再过渡到各自位置）。colors[k] 为第 k 张票里那只猫 */
  function fanTickets(colors) {
    var n = colors.length, bw = boardWrap.clientWidth;
    var w = bw * (n >= 6 ? 0.2 : (n >= 4 ? 0.24 : 0.28)), h = w * 100 / 62;
    var R = bw * 0.7;
    var step = n > 1 ? Math.min(12, 60 / (n - 1)) : 0; // 9 张时总展开约 60°，两端不出棋盘
    var mid = (n - 1) / 2, k;
    packsEl.innerHTML = '';
    tickets = [];
    for (k = 0; k < n; k++) {
      var t = buildTicket(colors[k]);
      var deg = (k - mid) * step;
      t.el.style.width = w + 'px';
      t.el.style.height = h + 'px';
      t.el.style.zIndex = String(n - Math.round(Math.abs(k - mid)));
      t.el.style.transition = 'none';
      t.el.style.opacity = '0';
      t.el.style.transform = 'translate(-50%, -50%) scale(0.4)';
      t.pose = 'translate(-50%, -50%) translateY(' + (R * 0.91) + 'px) rotate(' + deg + 'deg) translateY(' + (-R) + 'px)';
      packsEl.appendChild(t.el);
      tickets.push(t);
    }
    void packsEl.offsetWidth;
    for (k = 0; k < n; k++) {
      tickets[k].el.style.transition = '';
      tickets[k].el.style.transitionDelay = (k * 30) + 'ms';
      tickets[k].el.style.opacity = '1';
      tickets[k].el.style.transform = tickets[k].pose;
    }
    return n;
  }

  /* 扇形摆好并停一拍，等待逐张撕开 */
  async function playPackOpen(colors) {
    var n = fanTickets(colors);
    await wait(320 + n * 30 + 150);
  }

  /* 撕开第 k 张票的票根，撕口飞出纸屑 */
  function tearTicket(k) {
    var t = tickets[k];
    if (!t) return;
    t.el.style.transitionDelay = '';
    t.el.classList.add('is-tear');
    FX.burst('scraps', t.stub, 0.8);
  }

  /* 第 k 张票的票身爆开（在它的猫飞出时调用） */
  function burstTicket(k) {
    var t = tickets[k];
    if (!t) return;
    t.el.classList.add('is-out');
    FX.burst('pop', t.body, 0.6, '#f4e7cc');
  }
  function clearTickets() { packsEl.innerHTML = ''; tickets = []; }

  /* delay 毫秒后，猫猫从票身位置飞到格子：先摆到起点，再过渡回原位；落地压一下并扬起尘土。
   * 上色也在 delay 时才做，格子随猫到达逐个亮起 */
  function flyIn(i, color, delay, fromEl) {
    var c = cells[i];
    after(delay, function () {
      paintCell(i, color);
      var from = fromEl.getBoundingClientRect(), to = c.inner.getBoundingClientRect();
      var dx = from.left + from.width / 2 - (to.left + to.width / 2);
      var dy = from.top + from.height / 2 - (to.top + to.height / 2);
      c.inner.style.transition = 'none';
      c.inner.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.3) rotate(-20deg)';
      void c.inner.offsetWidth;
      c.inner.style.transition = '';
      c.inner.classList.add('is-flying');
      c.inner.style.transform = '';
      after(470, function () {
        if (c.color !== color || !c.inner.classList.contains('is-flying')) return; // 期间被重画了
        c.inner.classList.remove('is-flying');
        c.el.classList.add('is-landed');
        FX.burst('dust', c.el, 1);
        after(300, function () { c.el.classList.remove('is-landed'); });
      });
    });
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
      if (!out.needShake) await wait(800);
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
    if (Wipe.isActive()) return;
    var color = parseInt(t.getAttribute('data-color'), 10);
    setOverlay('lucky', false);
    wipeTo(function () { startRun(color); });
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
    Fortune.prepare(state.cfg);
    stopAmbient();
    FX.attach(boardWrap);
    Skin.paint($('lucky-pill-sprite'), lucky);
    $('lucky-pill-note').textContent = Skin.itemName(lucky) + ' · 消除时每只 +1';
    buildBoard();
    buildStash();
    renderBoard(state.board);
    if (Speed.get() === 0) Speed.set(1); // 上局暂停着就开新局：解除暂停，保留 2× / 4× 的选择
    renderHud();
    showShake(false);
    News.reset();
    $('btn-deal').disabled = false;
    busy = false;
    showScreen('game');
  }

  var lastStats = null;

  function hexToRgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(216,85,44,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  /* 各款式结算页的环境特效节奏：every 间隔 ms，k 强度，zone 撒点区域
   * top: 弹层上沿飘落 / 迸出；bottom: 弹层下沿往上飘（音符、蒸汽）；edges: 卡片四周随机；all: 全屏随机 */
  var AMBIENT = {
    donut:   { every: 520, k: 0.55, zone: 'top' },
    code:    { every: 460, k: 0.5,  zone: 'top' },
    music:   { every: 560, k: 0.6,  zone: 'bottom' },
    coffee:  { every: 640, k: 0.7,  zone: 'bottom' },
    photo:   { every: 1300, k: 0.5, zone: 'edges' },
    chef:    { every: 620, k: 0.55, zone: 'bottom' },
    gym:     { every: 700, k: 0.6,  zone: 'edges' },
    painter: { every: 560, k: 0.55, zone: 'all' },
    party:   { every: 420, k: 0.6,  zone: 'top' },
    pop:     { every: 800, k: 0.5,  zone: 'edges' }
  };
  var ambientTimer = 0;

  function stopAmbient() { if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = 0; } }

  /* 结算特效：全部集中在运势标签上。粒子画布挂到结算弹层；
   * 先用 Top1 款式的预设在标签上炸开一次（档位越高越强，中吉以上追加彩纸），随后按该款式节奏在标签上持续小爆发。 */
  function playResultFx(tier, themeIdx) {
    var fxInfo = Skin.fx(themeIdx);
    var overlay = $('result'), stamp = $('fortune-stamp');
    FX.attach(overlay);
    stopAmbient();
    stamp.classList.remove('is-in');
    void stamp.offsetWidth;
    stamp.classList.add('is-in');
    setTimeout(function () {
      if (!overlay.classList.contains('is-open')) return;
      FX.burst(fxInfo.id, stamp, 1.2 + tier * 0.45, fxInfo.color);
      if (tier >= 2) FX.celebrate(stamp, tier === 3 ? 2 : 1.2);
    }, 380);

    var amb = AMBIENT[fxInfo.id] || AMBIENT.pop;
    var every = Math.round(amb.every * 1.6 * (tier === 3 ? 0.7 : tier === 0 ? 1.5 : 1));
    ambientTimer = setInterval(function () {
      var cv = document.querySelector('.fx-canvas');
      if (!overlay.classList.contains('is-open') || !cv || cv.parentNode !== overlay) { stopAmbient(); return; }
      // 只在标签范围内随机取点，不往外扩
      var o = overlay.getBoundingClientRect(), r = stamp.getBoundingClientRect();
      var x = r.left - o.left + Math.random() * r.width;
      var y = r.top - o.top + Math.random() * r.height;
      FX.burstAt(fxInfo.id, x, y, 22, amb.k * 0.8, fxInfo.color);
    }, every);
  }

  function finishRun() {
    $('btn-deal').disabled = true;
    showShake(false);
    // 占卜：本局翻开卡包数在蒙特卡洛分布里的百分位 → 4 档运势
    var fortune = Fortune.rate(state.cfg, state.spent);
    var reasonText = '今日运势 ' + fortune.name + ' · 翻开 ' + state.spent + ' 个卡包，超过 ' + fortune.pctText + ' 的' + Skin.get().noun;
    // 最终得分 = 暂存区 + 盘上剩余；不看轮次
    var t = E.tally(state, 3);
    // 结算主题由 Top1 款式决定（持有最多的那一款）；没有任何棋子时退回幸运款
    var themeIdx = (t.top && t.top.length) ? t.top[0].color : state.lucky;
    var fortuneLine = Skin.fortune(themeIdx)[fortune.tier];
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
      reasonText: reasonText, newRecord: newRecord,
      spent: state.spent, fortune: fortune.name, fortuneTier: fortune.tier, fortuneLine: fortuneLine, themeIdx: themeIdx
    };

    $('result-reason').textContent = '超越 ' + fortune.pctText + ' 的玩家'; // 界面只留一句，完整文案给战绩图
    // 结算界面围绕 Top1 款式定主题：强调色取其特效主色，背景 / 标签 / 标语 / 环境特效跟着款式走
    var themeFx = Skin.fx(themeIdx), theme = Skin.theme(themeIdx);
    var acc = themeFx.color;
    var bannerEl = document.querySelector('#result .banner');
    bannerEl.style.setProperty('--acc', acc);
    bannerEl.style.setProperty('--acc-soft', hexToRgba(acc, 0.16));
    bannerEl.style.setProperty('--acc-faint', hexToRgba(acc, 0.07));
    bannerEl.setAttribute('data-tier', fortune.tier);
    bannerEl.setAttribute('data-theme', themeFx.id);
    $('result-title').textContent = theme.ribbon;
    $('result-tagline').textContent = theme.tagline;
    var stamp = $('fortune-stamp');
    stamp.textContent = fortune.name;
    stamp.className = 'fortune__stamp fortune__stamp--' + fortune.tier;
    $('fortune-line').textContent = fortuneLine;
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
    playResultFx(fortune.tier, themeIdx);
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
    stopAmbient();
    FX.attach(boardWrap);
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
    if (Wipe.isActive()) return;
    var color = Math.floor(Math.random() * 9);
    setOverlay('lucky', false);
    wipeTo(function () { startRun(color); });
  });
  $('btn-home').addEventListener('click', function () {
    if (Wipe.isActive()) return;
    setOverlay('result', false);
    setOverlay('share-preview', false);
    wipeTo(goHome);
  });
  $('btn-home-ingame').addEventListener('click', function () {
    if (busy || Wipe.isActive()) return;
    if (state && !state.ended && state.round > 0) {
      if (!confirm('退出当前这局？进度不会保存。')) return;
    }
    wipeTo(goHome);
  });
  $('btn-deal').addEventListener('click', playRound);
  $('btn-deal-start').addEventListener('click', playRound);
  $('speed').addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-speed') !== null)) t = t.parentNode;
    if (!t || t === this) return;
    Speed.set(parseFloat(t.getAttribute('data-speed')));
  });
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
    setAutoDeal: setAutoDeal,
    // 调试用：立刻按当前状态结束本局并弹结算页
    finish: function () { if (state && !busy) { if (!state.ended) state.ended = 'empty'; finishRun(); } },
    // 调参用：扇形摆出 n 张票并停住（不撕、不发牌）；TTDDP.previewPacks(0) 清掉
    previewPacks: function (n) {
      clearTickets();
      var colors = [];
      for (var i = 0; i < (n || 0); i++) colors.push(Math.floor(Math.random() * 9));
      if (colors.length) fanTickets(colors);
    }
  };
})();
