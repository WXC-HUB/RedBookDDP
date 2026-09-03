/* 乌龟对对碰 · 战绩图（Canvas 2D 渲染）+ JSBridge 存相册
 * 仅在 Run 结束后按需调用，不参与首屏。ES2017 / Chrome 61。 */
(function (root) {
  'use strict';

  var COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 简笔乌龟（俯视） */
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

  /* 生成 3:4 战绩卡，返回 canvas */
  function renderCard(stats) {
    var W = 900, H = 1200;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#dff5e6'); bg.addColorStop(1, '#bfe8d0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 装饰乌龟
    for (var i = 0; i < 9; i++) {
      var ang = (i / 9) * Math.PI * 2;
      drawTurtle(ctx, W / 2 + Math.cos(ang) * 360, 250 + Math.sin(ang) * 130, 90, COLORS[i], ang + Math.PI / 2);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1f3a2d';
    ctx.font = '900 84px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('乌龟对对碰', W / 2, 300);
    ctx.font = '500 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#5c7a6a';
    ctx.fillText('我的这一局', W / 2, 350);

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
    if (stats.lucky !== null && stats.lucky !== undefined) {
      drawTurtle(ctx, W / 2 - 120, 1000 + 0, 60, COLORS[stats.lucky], 0);
      ctx.fillStyle = '#5c7a6a';
      ctx.font = '500 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('幸运色加成 +' + stats.luckyBonus, W / 2 - 80, 1010);
      ctx.textAlign = 'center';
    }

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

  function hasBridge() {
    return !!(root.xhs && root.xhs.miniTool && typeof root.xhs.miniTool.saveImageToPhotosAlbum === 'function');
  }

  /* 保存到相册。返回 Promise<{ok, msg}>，不 reject。 */
  function saveToAlbum(canvas) {
    var dataUrl = canvas.toDataURL('image/png');
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

  root.TurtleShare = { renderCard: renderCard, saveToAlbum: saveToAlbum, hasBridge: hasBridge };
})(window);
