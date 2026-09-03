/* 乌龟对对碰 · 战绩图（Canvas 2D 渲染）+ JSBridge 存相册
 * 仅在 Run 结束后按需调用，不参与首屏。ES2017 / Chrome 61。
 * 依赖 skins.js（window.TurtleSkin）：图片套系直接 drawImage 包内图片；矢量套系用 Canvas 手绘乌龟。 */
(function (root) {
  'use strict';

  var Skin = root.TurtleSkin;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 简笔乌龟（俯视），矢量套系用 */
  function drawTurtle(ctx, cx, cy, size, color, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    var s = size / 100;
    ctx.scale(s, s);
    ctx.translate(-50, -50);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    var legs = [[22, 34, -38], [78, 34, 38], [22, 74, 38], [78, 74, -38]];
    for (var i = 0; i < legs.length; i++) {
      ctx.save(); ctx.translate(legs[i][0], legs[i][1]); ctx.rotate(legs[i][2] * Math.PI / 180);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(44, 97); ctx.lineTo(56, 97); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(50, 17, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#24332c';
    ctx.beginPath(); ctx.arc(45, 15, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(55, 15, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(50, 54, 32, 33, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(50, 53, 30, 31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(50, 38); ctx.lineTo(62, 45); ctx.lineTo(62, 60); ctx.lineTo(50, 67); ctx.lineTo(38, 60); ctx.lineTo(38, 45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(40, 36, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* 画第 idx 款：images 为预载好的图片数组（图片套系），为 null 时退回矢量乌龟 / 色块 */
  function drawItem(ctx, idx, cx, cy, size, rot, skin, images) {
    if (skin.type === 'image') {
      var im = images && images[idx];
      if (im && im.complete && im.naturalWidth > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot || 0);
        ctx.drawImage(im, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        // 图片不可用：画一个柔和色块占位
        ctx.save(); ctx.fillStyle = 'rgba(31,58,45,0.12)';
        ctx.beginPath(); ctx.arc(cx, cy, size / 2.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else {
      drawTurtle(ctx, cx, cy, size, skin.colors[idx], rot);
    }
  }

  /* 生成 3:4 战绩卡，返回 canvas（同步；images 可为 null） */
  function renderCard(stats, images) {
    var skin = Skin.get();
    var W = 900, H = 1200;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#dff5e6'); bg.addColorStop(1, '#bfe8d0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 装饰：9 款围成一圈
    for (var i = 0; i < 9; i++) {
      var ang = (i / 9) * Math.PI * 2;
      var rot = skin.type === 'image' ? (Math.sin(ang) * 0.25) : (ang + Math.PI / 2);
      drawItem(ctx, i, W / 2 + Math.cos(ang) * 360, 250 + Math.sin(ang) * 130, skin.type === 'image' ? 120 : 90, rot, skin, images);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1f3a2d';
    ctx.font = '900 84px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('乌龟对对碰', W / 2, 300);
    ctx.font = '500 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#5c7a6a';
    ctx.fillText('我的这一局 · ' + skin.name, W / 2, 350);

    // 白卡
    ctx.fillStyle = 'rgba(31,58,45,0.18)';
    roundRect(ctx, 90, 430, 720, 610, 40); ctx.fill();
    ctx.fillStyle = '#fff';
    roundRect(ctx, 90, 418, 720, 610, 40); ctx.fill();

    ctx.fillStyle = '#1f3a2d';
    ctx.font = '900 200px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(String(stats.rounds), W / 2 - 40, 640);
    ctx.font = '700 44px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#5c7a6a';
    ctx.fillText('轮', W / 2 + 150, 640);
    ctx.font = '500 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(stats.reasonText, W / 2, 700);

    var items = [
      ['累计赚取', stats.earned], ['最高单轮', stats.bestRound],
      ['连线', stats.lines], ['对子', stats.pairs],
      ['清空', stats.clears], ['大满贯', stats.slams]
    ];
    var cellW = 210, cellH = 120, gx = 120, gy = 750, gap = 20;
    for (var k = 0; k < items.length; k++) {
      var cx = gx + (k % 3) * (cellW + gap), cy = gy + Math.floor(k / 3) * (cellH + gap);
      ctx.fillStyle = '#f1f8f4';
      roundRect(ctx, cx, cy, cellW, cellH, 22); ctx.fill();
      ctx.fillStyle = '#1f3a2d';
      ctx.font = '800 46px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(items[k][1]), cx + cellW / 2, cy + 62);
      ctx.fillStyle = '#5c7a6a';
      ctx.font = '500 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(items[k][0], cx + cellW / 2, cy + 100);
    }

    if (stats.lucky !== null && stats.lucky !== undefined) {
      drawItem(ctx, stats.lucky, W / 2 - 150, 1005, 72, 0, skin, images);
      ctx.fillStyle = '#5c7a6a';
      ctx.font = '500 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('幸运款 ' + Skin.itemName(stats.lucky) + ' · 加成 +' + stats.luckyBonus, W / 2 - 105, 1014);
      ctx.textAlign = 'center';
    }

    if (stats.newRecord) {
      ctx.fillStyle = '#ff5a5f';
      roundRect(ctx, W / 2 - 130, 1060, 260, 60, 30); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('新纪录！', W / 2, 1101);
    }

    ctx.fillStyle = '#5c7a6a';
    ctx.font = '500 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('你能比我撑更多轮吗？', W / 2, 1160);
    return canvas;
  }

  /* 加载图片、渲染、导出 dataURL。若包内图片让 canvas 被判为跨源（toDataURL 抛错），改用无图版本重画。
   * 返回 Promise<{ canvas, dataUrl }>，不 reject。 */
  function buildCard(stats) {
    return new Promise(function (resolve) {
      Skin.preload(null, function (images) {
        var canvas = renderCard(stats, images);
        var dataUrl;
        try {
          dataUrl = canvas.toDataURL('image/png');
        } catch (e) {
          canvas = renderCard(stats, null);
          dataUrl = canvas.toDataURL('image/png');
        }
        resolve({ canvas: canvas, dataUrl: dataUrl });
      });
    });
  }

  function hasBridge() {
    return !!(root.xhs && root.xhs.miniTool && typeof root.xhs.miniTool.saveImageToPhotosAlbum === 'function');
  }

  /* 保存到相册。返回 Promise<{ok, msg, dataUrl}>，不 reject。 */
  function saveToAlbum(dataUrl) {
    if (!hasBridge()) {
      return Promise.resolve({ ok: false, msg: '当前环境不支持保存到相册', dataUrl: dataUrl });
    }
    var bridge = root.xhs.miniTool;
    var p;
    if (typeof bridge.writeTempFile === 'function') {
      p = bridge.writeTempFile({ data: dataUrl }).then(function (res) {
        return bridge.saveImageToPhotosAlbum({ filePath: res.filePath });
      });
    } else {
      p = bridge.saveImageToPhotosAlbum({ filePath: dataUrl });
    }
    return p.then(function () {
      return { ok: true, msg: '已保存到相册', dataUrl: dataUrl };
    }, function (err) {
      var m = (err && err.errMsg) ? err.errMsg : '保存失败';
      return { ok: false, msg: m, dataUrl: dataUrl };
    });
  }

  root.TurtleShare = { renderCard: renderCard, buildCard: buildCard, saveToAlbum: saveToAlbum, hasBridge: hasBridge };
})(window);
