/* 乌龟对对碰 · 页面转场（剪影扩张擦除）
 * 一个 fixed 图层里放一枚 SVG 剪影（猫头 / 龟壳），从点击位置用 transform: scale 放大盖满屏幕，
 * 盖住时执行 mid（切屏、重建 DOM），停一拍眨眼，再缩回原点露出新页面。
 * 只用 transform 动画（合成层），Chrome 61 可用；prefers-reduced-motion 时跳过动画直接切屏。
 * 挂到 window.TurtleWipe。 */
(function (root) {
  'use strict';

  /* r：剪影内切圆半径（viewBox 单位 = 元素 100px 下的像素），用来算盖满屏幕所需的倍数 */
  var SHAPES = {
    cat:    { href: '#w-cat',    r: 38 },
    turtle: { href: '#w-turtle', r: 36 }
  };
  var COVER_MS = 300, HOLD_MS = 140, REVEAL_MS = 320, BLINK_MS = 80;
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  var layer = null, shapeEl = null, useEl = null, eyes = null;
  var active = false;
  var reduced = false;
  try {
    reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { /* 忽略 */ }

  function ensure() {
    if (layer) return;
    layer = document.getElementById('wipe');
    shapeEl = layer.querySelector('.wipe__shape');
    useEl = shapeEl.querySelector('use');
  }

  function setShape(name) {
    var s = SHAPES[name] || SHAPES.cat;
    useEl.setAttributeNS(XLINK_NS, 'href', s.href);
    useEl.setAttribute('href', s.href);
    eyes = null; // 换形状后重新找眼睛
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

  /* 从 (x, y) 到视口四角的最远距离 */
  function farthest(x, y, w, h) {
    var dx = Math.max(x, w - x), dy = Math.max(y, h - y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* opts: { x, y, shape, color, mid, done }
   * x/y 缺省为屏幕中心；mid 在盖满屏幕时调用；done 在整段结束后调用。
   * 正在转场时再次调用会被忽略并返回 false（防双击）。 */
  function run(opts) {
    opts = opts || {};
    if (active) return false;
    ensure();
    if (reduced) {
      if (opts.mid) opts.mid();
      if (opts.done) opts.done();
      return true;
    }
    // 页面不可见（切后台）时 rAF / 过渡都不可靠，直接切屏
    if (document.hidden) {
      if (opts.mid) opts.mid();
      if (opts.done) opts.done();
      return true;
    }
    active = true;
    var w = root.innerWidth, h = root.innerHeight;
    var x = typeof opts.x === 'number' ? opts.x : w / 2;
    var y = typeof opts.y === 'number' ? opts.y : h / 2;
    var s = setShape(opts.shape);
    var scale = farthest(x, y, w, h) / s.r * 1.06;

    layer.style.color = opts.color || '';
    shapeEl.style.left = (x - 50) + 'px';
    shapeEl.style.top = (y - 50) + 'px';
    shapeEl.style.transition = 'none';
    shapeEl.style.transform = 'scale(0.01)';
    layer.classList.add('is-active');
    // 读一次布局强制把起始状态刷进样式，再开过渡；不用 rAF（后台标签页里 rAF 不触发，会卡在起点）
    void shapeEl.offsetWidth;
    shapeEl.style.transition = 'transform ' + COVER_MS + 'ms cubic-bezier(0.5, 0, 0.9, 0.4)';
    shapeEl.style.transform = 'scale(' + scale + ')';

    setTimeout(function () {
      if (opts.mid) opts.mid();
      setTimeout(blink, 20);
      setTimeout(function () {
        shapeEl.style.transition = 'transform ' + REVEAL_MS + 'ms cubic-bezier(0.3, 0.7, 0.4, 1)';
        shapeEl.style.transform = 'scale(0.01)';
        setTimeout(function () {
          layer.classList.remove('is-active');
          active = false;
          if (opts.done) opts.done();
        }, REVEAL_MS + 30);
      }, HOLD_MS);
    }, COVER_MS);
    return true;
  }

  /* 从事件里取坐标：鼠标 / 触摸有坐标就用，键盘触发（坐标为 0）则取按钮中心 */
  function pointFromEvent(e, el) {
    var x = e && e.clientX, y = e && e.clientY;
    if (!x && !y && el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    }
    return { x: x, y: y };
  }

  root.TurtleWipe = { run: run, pointFromEvent: pointFromEvent, isActive: function () { return active; } };
})(window);
