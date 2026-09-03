# 皮肤套系

游戏里的 9 种「颜色」在表现层是 9 个「款式」，由皮肤套系决定长什么样。引擎只认索引 0..8，与皮肤无关。

## 现有套系

| id | 名称 | 类型 | 资源 |
| --- | --- | --- | --- |
| `turtle` | 经典乌龟 | svg | `index.html` 内的 `#t-turtle` symbol + 9 个颜色 |
| `cats` | 猫猫日常 | image | `app/skins/cats/1.webp` … `9.webp`（源文件在 `myasset/cat_1..9.png`） |

默认套系 `cats`，玩家在首页「皮肤」里切换，选择存 `localStorage`（键 `ttddp.skin.v1`）。

## 新增一个图片套系

1. 准备 9 张 **256×256、透明背景、正方形** 图，四周留 6%–8% 边距，九张轮廓大小尽量一致。
2. 转成 WebP 放到 `app/skins/<id>/1.webp` … `9.webp`：
   ```bash
   python - <<'PY'
   from PIL import Image
   for i in range(1, 10):
       Image.open(f'myasset/xxx_{i}.png').convert('RGBA').save(f'app/skins/<id>/{i}.webp', 'WEBP', quality=88, method=6)
   PY
   ```
3. 在 [`app/js/skins.js`](../app/js/skins.js) 的 `SKINS` 数组里加一条：
   ```js
   {
     id: '<id>', name: '套系显示名', noun: '单只怎么称呼',
     type: 'image', dir: './skins/<id>/', ext: '.webp',
     items: [ { name: '款式1名', file: '1' }, … 共 9 条 ]
   }
   ```
4. `bash tools/pack.sh` 重新审计打包。9 张 WebP 约 110 KB，远低于 2 MiB 建议线。

## 代码里用到皮肤的位置

- 棋盘格子、首页三只吉祥物、幸运款标签、开局选幸运款、结果页幸运款：都通过 `TurtleSkin.paint(container, idx)` 渲染，同一个容器可在 svg / image 类型间切换。
- 战绩图（`share.js`）：图片套系用 `drawImage` 画包内图片；若容器把 canvas 判为跨源导致 `toDataURL` 失败，自动退回无图版本。
- 款式名（`TurtleSkin.itemName(idx)`）用于选款按钮的文字和结果页。
