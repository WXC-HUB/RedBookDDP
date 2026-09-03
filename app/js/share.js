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
    bg.addColorStop(0, '#f4e7cc'); bg.addColorStop(1, '#ece0c0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 外框 + 底部格纹
    ctx.strokeStyle = '#93ad7f'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.fillStyle = '#93ad7f';
    for (var gx0 = 0; gx0 < W; gx0 += 30) {
      for (var gy0 = H - 30; gy0 < H; gy0 += 30) {
        if (((gx0 / 30) + (gy0 / 30)) % 2 === 0) ctx.fillRect(gx0, gy0, 30, 30);
      }
    }

    // 装饰：9 款围成一圈
    for (var i = 0; i < 9; i++) {
      var ang = (i / 9) * Math.PI * 2;
      var rot = skin.type === 'image' ? (Math.sin(ang) * 0.25) : (ang + Math.PI / 2);
      drawItem(ctx, i, W / 2 + Math.cos(ang) * 360, 250 + Math.sin(ang) * 130, skin.type === 'image' ? 120 : 90, rot, skin, images);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7d9a6a';
    ctx.font = '900 84px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('乌龟对对碰', W / 2, 300);
    ctx.font = '500 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#7d9a6a';
    ctx.fillText('•  MY RUN · ' + skin.name + '  •', W / 2, 350);

    // 白卡
    ctx.fillStyle = '#93ad7f';
    roundRect(ctx, 84, 412, 732, 666, 26); ctx.fill();
    ctx.fillStyle = '#f4e7cc';
    roundRect(ctx, 92, 420, 716, 650, 20); ctx.fill();
    // 结果标题带
    ctx.fillStyle = '#2e2d28';
    roundRect(ctx, W / 2 - 120, 396, 240, 52, 26); ctx.fill();
    ctx.fillStyle = '#f4e7cc';
    ctx.font = '900 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('RUN 结束', W / 2, 432);

    // 大数字：最终得分（只）= 暂存区 + 盘上剩余
    var numFont = '900 170px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var unitFont = '700 44px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var numStr = String(stats.score);
    ctx.font = numFont;
    var nw = ctx.measureText(numStr).width;
    ctx.font = unitFont;
    var uw = ctx.measureText('只').width;
    var x0 = W / 2 - (nw + 14 + uw) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8552c';
    ctx.font = numFont;
    ctx.fillText(numStr, x0, 606);
    ctx.fillStyle = '#2e2d28';
    ctx.font = unitFont;
    ctx.fillText('只', x0 + nw + 14, 606);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5f7c4b';
    ctx.font = '700 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('暂存区 ' + stats.stashed + ' 只 + 棋盘剩余 ' + stats.onBoard + ' 只', W / 2, 652);
    ctx.font = 'italic 500 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#6e6c62';
    ctx.fillText(stats.reasonText, W / 2, 690);

    // Top3：持有数量最多的三款
    var top = stats.top || [];
    var tw = 210, th = 180, tgap = 20, ty = 726;
    var tx0 = W / 2 - (top.length * tw + (top.length - 1) * tgap) / 2;
    for (var k = 0; k < top.length; k++) {
      var tx = tx0 + k * (tw + tgap), first = k === 0;
      ctx.fillStyle = first ? '#d8552c' : '#93ad7f';
      roundRect(ctx, tx, ty, tw, th, 16); ctx.fill();
      ctx.fillStyle = '#ece0c0';
      roundRect(ctx, tx + 3, ty + 3, tw - 6, th - 6, 14); ctx.fill();
      ctx.fillStyle = first ? '#d8552c' : '#2e2d28';
      roundRect(ctx, tx + tw / 2 - 44, ty - 14, 88, 28, 14); ctx.fill();
      ctx.fillStyle = '#f4e7cc';
      ctx.font = '900 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('TOP ' + (k + 1), tx + tw / 2, ty + 6);
      drawItem(ctx, top[k].color, tx + tw / 2, ty + 74, 86, 0, skin, images);
      ctx.fillStyle = first ? '#d8552c' : '#2e2d28';
      ctx.font = '900 38px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(top[k].count), tx + tw / 2, ty + 146);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(Skin.itemName(top[k].color), tx + tw / 2, ty + 170);
    }

    // 过程数据一行
    var items = [['轮次', stats.rounds], ['卡包赚取', stats.earned], ['连线', stats.lines], ['对子', stats.pairs]];
    var cellW = 168, cellH = 84, gap = 12, gy = 928;
    var gx = W / 2 - (items.length * cellW + (items.length - 1) * gap) / 2;
    for (k = 0; k < items.length; k++) {
      var cx = gx + k * (cellW + gap);
      ctx.fillStyle = '#93ad7f';
      roundRect(ctx, cx, gy, cellW, cellH, 14); ctx.fill();
      ctx.fillStyle = '#ece0c0';
      roundRect(ctx, cx + 3, gy + 3, cellW - 6, cellH - 6, 12); ctx.fill();
      ctx.fillStyle = '#2e2d28';
      ctx.font = '800 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(items[k][1]), cx + cellW / 2, gy + 44);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(items[k][0], cx + cellW / 2, gy + 72);
    }

    if (stats.lucky !== null && stats.lucky !== undefined) {
      drawItem(ctx, stats.lucky, W / 2 - 150, 1042, 56, 0, skin, images);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('幸运款 ' + Skin.itemName(stats.lucky) + ' · 加成 +' + stats.luckyBonus, W / 2 - 112, 1050);
      ctx.textAlign = 'center';
    }

    if (stats.newRecord) {
      ctx.fillStyle = '#d8552c';
      roundRect(ctx, W / 2 - 120, 1088, 240, 44, 22); ctx.fill();
      ctx.fillStyle = '#f4e7cc';
      ctx.font = '800 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('新纪录！', W / 2, 1119);
    }

    ctx.fillStyle = '#2e2d28';
    ctx.font = 'italic 700 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("BUY LIKE THERE'S NO TOMORROW  ·  你能比我收集更多吗？", W / 2, 1158);
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
