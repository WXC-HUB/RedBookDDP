/* 乌龟对对碰 · 皮肤套系
 * 每个套系提供 9 个「款式」，对应引擎里的 9 个颜色索引 0..8。
 * 新增套系：把 9 张 256×256 透明图放到 app/skins/<id>/1..9.webp，在 SKINS 里加一条即可。
 * 经典脚本，挂到 window.TurtleSkin。ES2017 / Chrome 61。 */
(function (root) {
  'use strict';

  var SKINS = [
    {
      id: 'turtle',
      name: '经典乌龟',
      noun: '乌龟',
      type: 'svg',            // 用 index.html 里的 SVG symbol + CSS 颜色类
      symbol: '#t-turtle',
      colors: ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'],
      items: [
        { name: '红龟' }, { name: '橙龟' }, { name: '黄龟' },
        { name: '绿龟' }, { name: '青龟' }, { name: '蓝龟' },
        { name: '靛龟' }, { name: '紫龟' }, { name: '粉龟' }
      ]
    },
    {
      id: 'cats',
      name: '猫猫日常',
      noun: '猫猫',
      type: 'image',          // 包内图片
      dir: './skins/cats/',
      ext: '.webp',
      items: [
        { name: '甜甜圈猫', file: '1' },
        { name: '码农猫', file: '2' },
        { name: '音乐猫', file: '3' },
        { name: '咖啡猫', file: '4' },
        { name: '摄影猫', file: '5' },
        { name: '厨师猫', file: '6' },
        { name: '健身猫', file: '7' },
        { name: '画家猫', file: '8' },
        { name: '派对猫', file: '9' }
      ]
    }
  ];

  var DEFAULT_ID = 'cats';
  var STORAGE_KEY = 'ttddp.skin.v1';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  function byId(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return null;
  }

  var current = (function () {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && byId(saved)) return byId(saved);
    } catch (e) { /* ignore */ }
    return byId(DEFAULT_ID) || SKINS[0];
  })();

  var listeners = [];

  function get() { return current; }
  function list() { return SKINS.slice(); }

  function set(id) {
    var s = byId(id);
    if (!s || s === current) return false;
    current = s;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
    for (var i = 0; i < listeners.length; i++) listeners[i](s);
    return true;
  }

  function onChange(fn) { listeners.push(fn); }

  /* 图片型套系某款式的包内路径 */
  function src(idx, skin) {
    skin = skin || current;
    if (skin.type !== 'image') return null;
    return skin.dir + skin.items[idx].file + skin.ext;
  }

  function itemName(idx, skin) { return (skin || current).items[idx].name; }

  /* 确保容器内有 img + svg 两个子节点（各套系类型复用同一个容器） */
  function mount(container) {
    if (container.__sprite) return container.__sprite;
    container.classList.add('sprite');
    var img = document.createElement('img');
    img.className = 'sprite__img';
    img.alt = '';
    img.draggable = false;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sprite__svg turtle');
    var use = document.createElementNS(SVG_NS, 'use');
    svg.appendChild(use);
    container.appendChild(img);
    container.appendChild(svg);
    container.__sprite = { img: img, svg: svg, use: use };
    return container.__sprite;
  }

  /* 把某款式画到容器里；idx 为 null 时清空 */
  function paint(container, idx, skin) {
    skin = skin || current;
    var h = mount(container);
    container.classList.remove('sprite--svg', 'sprite--image');
    if (idx === null || idx === undefined) return;
    container.classList.add('sprite--' + skin.type);
    if (skin.type === 'svg') {
      h.use.setAttributeNS(XLINK_NS, 'xlink:href', skin.symbol);
      h.use.setAttribute('href', skin.symbol);
      h.svg.setAttribute('class', 'sprite__svg turtle turtle--c' + idx);
    } else {
      var s = src(idx, skin);
      if (h.img.getAttribute('src') !== s) h.img.setAttribute('src', s);
      h.img.alt = skin.items[idx].name;
    }
  }

  /* 预加载当前套系全部图片，避免首次发牌时闪一下。done(loadedImages[]) 总会被调用 */
  function preload(skin, done) {
    skin = skin || current;
    var result = [];
    if (skin.type !== 'image') { if (done) done(result); return; }
    var pending = skin.items.length, finished = false;
    function one() {
      pending--;
      if (pending === 0 && !finished) { finished = true; if (done) done(result); }
    }
    for (var i = 0; i < skin.items.length; i++) {
      var im = new Image();
      result.push(im);
      im.onload = one;
      im.onerror = one;
      im.src = src(i, skin);
    }
    setTimeout(function () { if (!finished) { finished = true; if (done) done(result); } }, 4000);
  }

  root.TurtleSkin = {
    SKINS: SKINS,
    get: get, list: list, set: set, onChange: onChange,
    src: src, itemName: itemName,
    mount: mount, paint: paint, preload: preload
  };
})(window);
