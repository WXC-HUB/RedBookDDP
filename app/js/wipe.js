/* 乌龟对对碰 · 页面转场（拉锁 + 图标放大）
 * 时间线（一个 rAF 循环驱动，按真实时间推进，掉帧也不会失步）：
 *   1. 落下  FALL   ：图标从屏幕顶部正中带重力加速落到下方；图标是拉锁头，
 *                     它经过的地方旧界面沿中线向两侧裂开（clip-path 多边形，弧形 V 口，顶端最宽），露出墨黑底
 *   2. 着地  LAND   ：图标挤压回弹；旧界面剩下的两片向两侧滑走，整屏只剩墨黑底 + 图标
 *   3. 放大  COVER  ：图标放大到盖满屏幕
 *   4. 切屏  HOLD   ：执行 mid（切屏、重建 DOM），眨一下眼
 *   5. 露出  REVEAL ：图标缩回消失，露出新界面
 * 只有图标的 transform 与旧界面的 clip-path 在动。clip-path 不支持时旧界面改为淡出。
 * prefers-reduced-motion / 页面不可见时跳过动画直接切屏。Chrome 61 可用。挂到 window.TurtleWipe。 */
(function (root) {
  'use strict';

  /* r / cy：剪影内切圆的半径（已扣掉半个描边宽，描边是墨色不算填充）与圆心纵向偏移，
   * 单位为 viewBox 单位 = 元素 100px 下的像素，用来算盖满屏幕所需倍数 */
  var SHAPES = {
    cat:    { href: '#w-cat',    r: 36.5, cy: 6 },
    turtle: { href: '#w-turtle', r: 34.5, cy: 4 }
  };
  var FALL_MS = 380, LAND_MS = 150, COVER_MS = 250, HOLD_MS = 70, REVEAL_MS = 280;
  var T_LAND = FALL_MS, T_COVER = T_LAND + LAND_MS, T_HOLD = T_COVER + COVER_MS,
      T_REVEAL = T_HOLD + HOLD_MS, T_END = T_REVEAL + REVEAL_MS;
  var ICON_SCALE = 1;        // 图标落下时的大小（1 = 100px 盒，猫头直径约 76px）
  var LAND_Y = 0.84;         // 着地点（视口高度比例）
  var START_Y = -90;         // 起点（视口上方）
  var SLIT_SAMPLES = 10;     // 裂口每侧采样点数
  var BLINK_MS = 80;
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  var layer = null, shapeEl = null, useEl = null, bgEl = null, eyes = null;
  var active = false;
  var reduced = false, clipOK = false;
  try {
    reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var probe = 'polygon(0px 0px, 1px 0px, 0px 1px)';
    clipOK = !!(root.CSS && CSS.supports &&
      (CSS.supports('clip-path', probe) || CSS.supports('-webkit-clip-path', probe)));
  } catch (e) { /* 忽略 */ }

  function ensure() {
    if (layer) return;
    layer = document.getElementById('wipe');
    shapeEl = layer.querySelector('.wipe__shape');
    useEl = shapeEl.querySelector('use');
    bgEl = document.getElementById('wipe-bg');
  }

  function setShape(name) {
    var s = SHAPES[name] || SHAPES.cat;
    useEl.setAttributeNS(XLINK_NS, 'href', s.href);
    useEl.setAttribute('href', s.href);
    eyes = null;
    return s;
  }

  function blink() {
    if (!eyes) {
      var sym = document.querySelector(useEl.getAttribute('href'));
      eyes = sym ? sym.querySelectorAll('.w-eye') : [];
    }
    var i, saved = [];
    for (i = 0; i < eyes.length; i++) { saved.push(eyes[i].getAttribute('ry')); eyes[i].setAttribute('ry', '0.8'); }
    setTimeout(function () {
      for (var k = 0; k < eyes.length; k++) eyes[k].setAttribute('ry', saved[k]);
    }, BLINK_MS);
  }

  function setClip(el, v) { el.style.webkitClipPath = v; el.style.clipPath = v; }

  /* 旧界面仍可见的区域：整屏减去一个从顶部裂到 apexY 的弧形 V 口。
   * wTop：顶端半开口宽度；flat∈[0,1]：着地后两片向外滑走的进度（1 = 完全消失）。 */
  function slitPolygon(W, H, apexY, wTop, flat) {
    var c = W / 2, n = SLIT_SAMPLES;
    wTop = Math.min(wTop, c);
    var yEnd = flat > 0 ? H : Math.min(apexY, H);
    var left = [], right = [];
    for (var k = 0; k <= n; k++) {
      var y = yEnd * k / n;
      var prof = (apexY > 0 && y < apexY) ? Math.pow((apexY - y) / apexY, 0.65) : 0;
      var w = wTop * Math.max(prof, flat);
      left.push((c - w).toFixed(1) + 'px ' + y.toFixed(1) + 'px');
      right.push((c + w).toFixed(1) + 'px ' + y.toFixed(1) + 'px');
    }
    right.reverse();
    var pts = ['0px 0px'].concat(left, right, [W + 'px 0px', W + 'px ' + H + 'px', '0px ' + H + 'px']);
    return 'polygon(' + pts.join(', ') + ')';
  }

  /* 求放大倍数 k，使圆心 (cx, yLand + cy·k)、半径 r·k 的内切圆盖住最远的顶角：
   * r²k² ≥ cx² + (yLand + cy·k)²  →  (r² - cy²)k² - 2·yLand·cy·k - (cx² + yLand²) ≥ 0 */
  function coverScaleFor(s, cx, yLand) {
    var a = s.r * s.r - s.cy * s.cy, b = -2 * yLand * s.cy, c = -(cx * cx + yLand * yLand);
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) * 1.06;
  }

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* opts: { shape, color, mid, done }
   * color：图标填充色（缺省用 CSS 的 --ember）；mid 在盖满屏幕时调用；done 在整段结束后调用。
   * 正在转场时再次调用会被忽略并返回 false（防双击）。 */
  function run(opts) {
    opts = opts || {};
    if (active) return false;
    ensure();
    if (reduced || document.hidden) {
      if (opts.mid) opts.mid();
      if (opts.done) opts.done();
      return true;
    }
    active = true;
    var W = root.innerWidth, H = root.innerHeight;
    var s = setShape(opts.shape);
    var cx = W / 2, yLand = H * LAND_Y;
    var coverScale = coverScaleFor(s, cx, yLand);
    var old = document.querySelector('.screen.is-active');
    var useClip = clipOK && !!old;

    layer.style.color = opts.color || '';
    layer.classList.add('is-active');
    bgEl.classList.add('is-active');
    shapeEl.style.transition = 'none';

    var t0 = null, midDone = false, finished = false, guard;

    function applyOld(apexY, wTop, flat, progress) {
      if (!old) return;
      if (useClip) setClip(old, apexY > 0 || flat > 0 ? slitPolygon(W, H, apexY, wTop, flat) : '');
      else old.style.opacity = String(1 - progress);
    }
    function hideOld() { if (old) old.style.visibility = 'hidden'; }
    function restoreOld() {
      if (!old) return;
      if (useClip) setClip(old, '');
      old.style.opacity = ''; old.style.visibility = '';
    }
    function doMid() {
      if (midDone) return;
      midDone = true;
      if (opts.mid) opts.mid();
      restoreOld();               // 此时旧屏已 display:none，清掉裁切不会闪
      bgEl.classList.remove('is-active');
      blink();
    }
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      doMid();
      layer.classList.remove('is-active');
      bgEl.classList.remove('is-active');
      shapeEl.style.transform = 'scale(0.01)';
      active = false;
      if (opts.done) opts.done();
    }
    function place(ty, rot, sx, sy) {
      shapeEl.style.transform = 'translate(' + (cx - 50) + 'px,' + (ty - 50) + 'px) rotate(' + rot + 'deg) scale(' + sx + ',' + sy + ')';
    }

    function frame(now) {
      if (finished) return;
      if (t0 === null) t0 = now;
      var e = now - t0, t, sc;
      if (e < T_LAND) {
        t = e / FALL_MS;
        var ty = START_Y + (yLand - START_Y) * t * t;          // 重力加速
        place(ty, -12 * (1 - t), ICON_SCALE, ICON_SCALE);
        applyOld(ty - 10, cx * Math.pow(t, 1.3), 0, t);
      } else if (e < T_COVER) {
        t = (e - T_LAND) / LAND_MS;
        var k = Math.sin(Math.PI * t);                          // 挤压 → 回弹
        var sx = ICON_SCALE * (1 + 0.16 * k), sy = ICON_SCALE * (1 - 0.22 * k);
        place(yLand + 44 * (ICON_SCALE - sy), 0, sx, sy);       // 底边不动
        applyOld(yLand - 10, cx, easeOut(t), 1);
      } else if (e < T_HOLD) {
        t = (e - T_COVER) / COVER_MS;
        hideOld();
        sc = ICON_SCALE + (coverScale - ICON_SCALE) * t * t * t; // 越来越快地撑满
        place(yLand, 0, sc, sc);
      } else if (e < T_REVEAL) {
        place(yLand, 0, coverScale, coverScale);
        doMid();
      } else if (e < T_END) {
        doMid();                                                // 卡顿跳过了 HOLD 段时在这里补切屏
        t = (e - T_REVEAL) / REVEAL_MS;
        sc = Math.max(0.01, coverScale * (1 - easeInOut(t)));
        place(yLand, 0, sc, sc);
      } else {
        finish();
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // 中途切后台 rAF 会停：兜底把流程走完，避免遮罩和输入锁死
    guard = setTimeout(finish, T_END + 800);
    return true;
  }

  root.TurtleWipe = { run: run, isActive: function () { return active; } };
})(window);
