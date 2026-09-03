/* 乌龟对对碰 · 消除特效层（Canvas 2D 粒子）
 * 一张覆盖棋盘的 canvas，所有款式的消除特效都画在这一层；DOM 不增加节点。
 * 每个款式一个预设（PRESETS），皮肤表里用 fx 字段指向预设名。
 * 挂到 window.TurtleFX。ES2017 / Chrome 61：不用 OffscreenCanvas / Worker。 */
(function (root) {
  'use strict';

  var MAX_LIVE = 170;           // 活粒子上限，超出的直接不生成
  var TAU = Math.PI * 2;
  var canvas = null, ctx = null;
  var dpr = 1, W = 0, H = 0;    // CSS 像素尺寸
  var parts = [], pool = [];
  var running = false, lastT = 0;
  var quality = 1;              // 低端机降级：连续掉帧后粒子数减半（本次会话内保持）
  var slowFrames = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- 画布 ---------- */
  function init(hostEl) {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    hostEl.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureSize() {
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  }

  /* ---------- 粒子 ---------- */
  function spawn(p) {
    if (parts.length >= MAX_LIVE) return null;
    var o = pool.pop() || {};
    o.x = p.x; o.y = p.y;
    o.vx = p.vx || 0; o.vy = p.vy || 0;
    o.g = p.g || 0; o.drag = p.drag || 1;
    o.age = -(p.delay || 0); o.life = p.life || 0.8;
    o.size = p.size || 6; o.size2 = p.size2 == null ? o.size : p.size2;
    o.w = p.w || 0; o.h = p.h || 0;
    o.rot = p.rot || 0; o.vr = p.vr || 0;
    o.color = p.color || '#fff'; o.color2 = p.color2 || null;
    o.shape = p.shape || 'circle'; o.text = p.text || '';
    o.alpha = p.alpha == null ? 1 : p.alpha;
    o.sway = p.sway || 0; o.freq = p.freq || 0; o.phase = Math.random() * TAU;
    o.lw = p.lw || 0; o.lw2 = p.lw2 == null ? o.lw : p.lw2;
    o.fade = p.fade == null ? 0.4 : p.fade; // 生命最后这一段比例内淡出
    parts.push(o);
    if (!running) { running = true; lastT = 0; requestAnimationFrame(step); }
    return o;
  }

  function step(now) {
    // 物理步长限制在 50ms 内防止穿越；寿命按真实时间走（上限 250ms），页面卡顿时粒子也能及时消散
    var wall = lastT ? (now - lastT) / 1000 : 0.016;
    var dt = Math.min(0.05, wall);
    var ageDt = Math.min(0.25, wall);
    lastT = now;
    if (wall > 0.024) { if (++slowFrames >= 10) quality = 0.5; } else slowFrames = 0;
    ctx.clearRect(0, 0, W, H);
    var k;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += ageDt;
      if (p.age < 0) continue;
      if (p.age >= p.life) { parts.splice(i, 1); pool.push(p); continue; }
      p.vy += p.g * dt;
      if (p.drag !== 1) { k = Math.pow(p.drag, dt * 60); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      draw(p);
    }
    if (parts.length) requestAnimationFrame(step);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  function draw(p) {
    var t = p.age / p.life;
    var a = p.alpha * (t > 1 - p.fade ? (1 - t) / p.fade : 1);
    var s = p.size + (p.size2 - p.size) * t;
    var x = p.x + (p.sway ? Math.sin(p.age * p.freq + p.phase) * p.sway : 0);
    ctx.save();
    ctx.globalAlpha = a < 0 ? 0 : (a > 1 ? 1 : a);
    ctx.translate(x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    switch (p.shape) {
      case 'circle':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); break;
      case 'rect':
      case 'flash':
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); break;
      case 'text':
        ctx.font = '900 ' + s + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.text, 0, 0); break;
      case 'ring':
        ctx.strokeStyle = p.color; ctx.lineWidth = p.lw + (p.lw2 - p.lw) * t;
        ctx.beginPath(); ctx.arc(0, 0, s < 0.1 ? 0.1 : s, 0, TAU); ctx.stroke(); break;
      case 'photo': // 白边小相片
        ctx.fillStyle = '#fff'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 + p.w * 0.1, -p.h / 2 + p.h * 0.1, p.w * 0.8, p.h * 0.62); break;
      case 'egg': // 荷包蛋碎块
        ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
        ctx.fillStyle = p.color2 || '#f5b400'; ctx.beginPath(); ctx.arc(s * 0.1, 0, s * 0.5, 0, TAU); ctx.fill(); break;
      case 'bean': // 咖啡豆
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.65, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = p.color2 || '#3d2314'; ctx.lineWidth = s * 0.18 < 1 ? 1 : s * 0.18;
        ctx.beginPath(); ctx.moveTo(-s * 0.6, 0); ctx.quadraticCurveTo(0, s * 0.45, s * 0.6, 0); ctx.stroke(); break;
      case 'splat': // 颜料 / 糖霜溅点
        ctx.beginPath();
        ctx.moveTo(s, 0); ctx.arc(0, 0, s, 0, TAU);
        ctx.moveTo(s * 1.25, -s * 0.4); ctx.arc(s * 0.8, -s * 0.4, s * 0.45, 0, TAU);
        ctx.moveTo(-s * 0.35, s * 0.5); ctx.arc(-s * 0.7, s * 0.5, s * 0.35, 0, TAU);
        ctx.fill(); break;
      case 'drop': // 汗珠
        ctx.beginPath(); ctx.moveTo(0, -s * 1.5);
        ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.5); ctx.fill(); break;
    }
    ctx.restore();
  }

  /* 从格子中心附近向随机方向发射一个粒子 */
  function radial(c, o) {
    var ang = o.ang != null ? o.ang : rnd(0, TAU);
    var sp = o.speed || 0;
    spawn({
      x: c.cx + rnd(-c.r * 0.3, c.r * 0.3), y: c.cy + rnd(-c.r * 0.3, c.r * 0.3),
      vx: Math.cos(ang) * sp + (o.vx || 0), vy: Math.sin(ang) * sp + (o.vy || 0),
      g: o.g, drag: o.drag, life: o.life, delay: o.delay,
      size: o.size, size2: o.size2, w: o.w, h: o.h,
      rot: o.rot != null ? o.rot : rnd(0, TAU), vr: o.vr != null ? o.vr : rnd(-10, 10),
      color: o.color, color2: o.color2, shape: o.shape, text: o.text, alpha: o.alpha,
      sway: o.sway, freq: o.freq, lw: o.lw, lw2: o.lw2, fade: o.fade
    });
  }

  function count(n, c) { return Math.round(n * c.k * quality); }

  /* ---------- 各款式预设。c = { cx, cy, r: 半格边长, k: 强度, v: 速度倍率, color } ---------- */
  var PRESETS = {
    /* 默认：本色圆点 + 冲击环（矢量乌龟套系用） */
    pop: function (c) {
      var i, n = count(10, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: c.color, size: c.r * rnd(0.06, 0.12), speed: rnd(150, 260) * c.v, g: 600, life: rnd(0.5, 0.8) });
      spawn({ x: c.cx, y: c.cy, shape: 'ring', color: c.color, size: c.r * 0.3, size2: c.r * 1.3, lw: 6, lw2: 1, life: 0.35, fade: 0.6 });
    },
    /* 甜甜圈猫：彩色糖针迸开 + 粉色糖霜溅点 */
    donut: function (c) {
      var cols = ['#f783ac', '#ffd43b', '#69db7c', '#4dabf7', '#ff6b6b', '#ffffff'];
      var i, n = count(14, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.07, h: c.r * 0.24, speed: rnd(180, 330) * c.v, vy: -80, g: 650, drag: 0.985, life: rnd(0.6, 1.0) });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: '#f8a5c2', size: c.r * rnd(0.08, 0.14), speed: rnd(90, 170) * c.v, g: 400, vr: rnd(-3, 3), life: rnd(0.45, 0.7) });
    },
    /* 码农猫：绿色代码字符往下掉 + 一帧绿闪 */
    code: function (c) {
      var glyphs = ['0', '1', '<', '>', '/', '{', '}', ';', '=', '#'];
      var i, n = count(16, c);
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#2ecc71', w: c.r * 1.9, h: c.r * 1.9, alpha: 0.35, life: 0.18, fade: 1 });
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.9, c.r * 0.9), y: c.cy + rnd(-c.r * 0.9, c.r * 0.2),
        vx: rnd(-25, 25), vy: rnd(120, 280) * c.v, g: 300,
        shape: 'text', text: pick(glyphs), color: Math.random() < 0.5 ? '#2ecc71' : '#1e8e4a',
        size: c.r * rnd(0.22, 0.34), life: rnd(0.6, 0.95), delay: rnd(0, 0.15), fade: 0.5
      });
    },
    /* 音乐猫：音符左右摆着往上飘 */
    music: function (c) {
      var notes = ['♪', '♫', '♩', '♬'], cols = ['#4dabf7', '#748ffc', '#f783ac', '#2e2d28'];
      var i, n = count(8, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.6, c.r * 0.6), y: c.cy + rnd(-c.r * 0.3, c.r * 0.3),
        vx: rnd(-40, 40), vy: -rnd(150, 260) * c.v, g: -80,
        shape: 'text', text: pick(notes), color: pick(cols), size: c.r * rnd(0.34, 0.5),
        rot: rnd(-0.3, 0.3), vr: rnd(-1.5, 1.5), sway: 12, freq: rnd(5, 8), life: rnd(0.8, 1.1), delay: rnd(0, 0.2), fade: 0.5
      });
    },
    /* 咖啡猫：白色蒸汽卷往上散 + 咖啡豆落下 */
    coffee: function (c) {
      var i, n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.4, c.r * 0.4), y: c.cy - c.r * rnd(0.1, 0.5),
        vy: -rnd(50, 110), shape: 'circle', color: '#ffffff', alpha: 0.6,
        size: c.r * 0.12, size2: c.r * 0.34, sway: 9, freq: rnd(2.5, 4), life: rnd(0.9, 1.3), delay: rnd(0, 0.25), fade: 0.7
      });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'bean', color: '#6b3e1e', color2: '#3d2314', size: c.r * rnd(0.09, 0.13), speed: rnd(130, 220) * c.v, vy: -120, g: 750, vr: rnd(-8, 8), life: rnd(0.6, 0.9) });
    },
    /* 摄影猫：整格白闪 + 快门光圈收缩 + 一张小相片飞出 + 星光 */
    photo: function (c) {
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#ffffff', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.95, life: 0.22, fade: 0.8 });
      spawn({ x: c.cx, y: c.cy, shape: 'ring', color: '#2e2d28', size: c.r * 1.15, size2: c.r * 0.05, lw: 5, lw2: 14, life: 0.32, fade: 0.3, alpha: 0.85 });
      spawn({ x: c.cx, y: c.cy, vx: rnd(90, 160), vy: -rnd(280, 360) * c.v, g: 750, shape: 'photo', color: '#a8c5d6', w: c.r * 0.62, h: c.r * 0.72, rot: -0.2, vr: rnd(2, 4), life: 0.95, fade: 0.3 });
      var i, n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'text', text: '✦', color: pick(['#ffd43b', '#ffffff']), size: c.r * rnd(0.18, 0.3), speed: rnd(120, 220), g: 150, vr: rnd(-2, 2), life: rnd(0.4, 0.7), delay: 0.05 });
    },
    /* 厨师猫：荷包蛋碎块 + 白气 */
    chef: function (c) {
      var i, n = count(8, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'egg', color: '#fffaf0', color2: '#f5b400', size: c.r * rnd(0.09, 0.15), speed: rnd(160, 280) * c.v, vy: -140, g: 850, vr: rnd(-12, 12), life: rnd(0.6, 0.9) });
      n = count(5, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.2, vy: -rnd(90, 150),
        shape: 'circle', color: '#ffffff', alpha: 0.7, size: c.r * 0.14, size2: c.r * 0.36, sway: 6, freq: 3, life: rnd(0.6, 0.9), fade: 0.7
      });
    },
    /* 健身猫：地面冲击波双环 + 汗珠飞散 */
    gym: function (c) {
      spawn({ x: c.cx, y: c.cy + c.r * 0.5, shape: 'ring', color: '#e8590c', size: c.r * 0.3, size2: c.r * 1.5, lw: 9, lw2: 1, life: 0.4, fade: 0.6 });
      spawn({ x: c.cx, y: c.cy + c.r * 0.5, shape: 'ring', color: '#2e2d28', size: c.r * 0.2, size2: c.r * 1.1, lw: 4, lw2: 1, life: 0.3, fade: 0.6, delay: 0.05, alpha: 0.6 });
      var i, n = count(10, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.4,
        vx: rnd(-220, 220) * c.v, vy: -rnd(120, 320) * c.v, g: 950,
        shape: 'drop', color: '#4dabf7', size: c.r * rnd(0.06, 0.1), life: rnd(0.5, 0.8)
      });
    },
    /* 画家猫：调色盘颜料溅点 + 一道沿弧线依次点出的笔触 */
    painter: function (c) {
      var cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d'];
      var i, n = count(12, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: pick(cols), size: c.r * rnd(0.07, 0.16), speed: rnd(110, 300) * c.v, g: 500, vr: rnd(-4, 4), life: rnd(0.5, 0.8) });
      var col = pick(cols), steps = 12;
      for (i = 0; i < steps; i++) {
        var a = -2.4 + (i / (steps - 1)) * 1.6; // 约 -137° → -46°
        spawn({
          x: c.cx + Math.cos(a) * c.r * 0.85, y: c.cy + Math.sin(a) * c.r * 0.85,
          shape: 'circle', color: col, size: c.r * (0.06 + 0.05 * Math.sin(i / steps * Math.PI)),
          delay: i * 0.022, life: 0.5, fade: 0.6
        });
      }
    },
    /* 派对猫：彩纸屑 + 飘带 */
    party: function (c) {
      var cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d', '#f783ac'];
      var i, n = count(22, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.15, h: c.r * 0.09, speed: rnd(200, 380) * c.v, vy: -140, g: 700, drag: 0.985, vr: rnd(-14, 14), life: rnd(0.9, 1.2) });
      n = count(5, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.05, h: c.r * 0.5, speed: rnd(120, 240) * c.v, vy: -200, g: 500, drag: 0.98, vr: rnd(-3, 3), sway: 10, freq: 7, life: rnd(0.9, 1.3) });
    }
  };

  /* ---------- 对外 ---------- */
  function centerOf(el) {
    var a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    return { cx: a.left - b.left + a.width / 2, cy: a.top - b.top + a.height / 2, r: Math.min(a.width, a.height) / 2 };
  }

  /* 在某个格子上播放款式特效。fxId 预设名；k 强度（对子 1，连线约 2.2，大满贯约 1.5）；color 供默认预设使用 */
  function burst(fxId, el, k, color) {
    if (!canvas) return;
    ensureSize();
    var c = centerOf(el);
    c.k = k || 1;
    c.v = 1 + (c.k - 1) * 0.25;
    c.color = color || '#e8590c';
    (PRESETS[fxId] || PRESETS.pop)(c);
  }

  /* 全盘庆祝（清空 / 大满贯）：从棋盘中心撒彩纸 */
  function celebrate(el, k) {
    if (!canvas) return;
    ensureSize();
    var c = centerOf(el);
    c.r = Math.min(c.r, 80);
    c.k = k || 2;
    c.v = 1.4;
    c.color = '#e8590c';
    PRESETS.party(c);
    PRESETS.pop(c);
  }

  root.TurtleFX = { init: init, burst: burst, celebrate: celebrate, PRESETS: PRESETS };
})(window);
