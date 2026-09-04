# 音效与 BGM 规划（2026-09-04 初稿）

整体听感方向跟视觉一致：复古双色海报、贴纸感。音效偏「实物 + 一点卡通」：纸、木、硬币、橡皮弹跳，
少用纯电子哔哔声；BGM 走轻松的 lo-fi / bossa / 尤克里里小调，60–90 秒无缝循环。

优先级：**P0** 没有就明显缺东西；**P1** 显著加分；**P2** 锦上添花，可以后补。
「钩子」一列是 `app/js` 里对应的函数或 class，落实现时在那里调 `Sound.play()`。

## 一、通用 UI

| 事件 | 建议音色 | 优先级 | 钩子 |
| --- | --- | --- | --- |
| 按钮点击（开始 / 发牌 / 弹层关闭 / 下划线入口） | 短促木质 tap，一个音统一 | P0 | 各 `btn-*` 的 click |
| 弹层弹出（规则 / 皮肤 / 分享预览） | 轻软 pop，可与 tap 共用 | P2 | `setOverlay(id, true)` |
| 皮肤切换选中 | 上扬两音 | P2 | `buildSkinList` 里的选中 |

## 二、选幸运款 → 转场（`wipe.js`）

转场是全游戏最有辨识度的一段，值得配一组专属音，总时长约 1.1 秒，节点和时间线严格对应：

| 阶段 | 时长 | 建议音色 | 优先级 | 钩子 |
| --- | --- | --- | --- | --- |
| 选中幸运猫 | — | 明亮「选定」音，随机按钮可加一段极短的滚动声 | P1 | `#lucky-grid` click / `btn-lucky-random` |
| 落下 FALL + 拉锁裂开 | 380 ms | 一声 whoosh 叠一段拉锁 zip（zip 是这里的标志音） | P1 | `run()` 开始 |
| 着地 LAND | 150 ms | 橡皮 boing / 软 thud，是整段最爽的一拍 | P0 | `e >= T_LAND` 第一帧 |
| 放大 COVER | 250 ms | 上扬 swell / 反向 whoosh | P2 | `e >= T_COVER` 第一帧 |
| 切屏 + 眨眼 HOLD | 70 ms | 极小的 pip，可省 | P2 | `doMid()` |
| 露出 REVEAL | 280 ms | 轻 whoosh out | P2 | `e >= T_REVEAL` 第一帧 |

建议在 `TurtleWipe.run` 的 opts 里加一个 `onPhase(name)` 回调，音效层订阅即可，不把音效代码塞进 wipe.js。

## 三、游戏页：发牌演出（`playRound` / `playPackOpen`）

| 事件 | 建议音色 | 优先级 | 钩子 | 备注 |
| --- | --- | --- | --- | --- |
| 点击发牌，卡包数字掉落 | 筹码 / 硬币扣费「叮当落下」 | P1 | `bumpPacks('is-drop')` | |
| 票券扇形甩出 | 纸牌 fan，每张一个短 tick，间隔 30 ms | P1 | `fanTickets` | n 张 → 最多 9 个 tick，音量递减 |
| 撕票根 | 纸撕 rip，每张一次 | **P0** | `tearTicket(k)`，每 110 ms 一张 | 标志音之一；随机 ±5% 音高避免机枪感 |
| 票身爆开 | 小 pop | P2 | `burstTicket(k)` | 可并入 rip 的尾巴 |
| 猫飞入落地 + 扬尘 | 轻 pat / thud | P1 | `flyIn` 里的 `is-landed` | 9 只 1 秒内落完，同音 40 ms 内只放一次 |

## 四、游戏页：判定与结算（`playSettlement` / `settleGroup`）

结算是逐组进行的：高亮 300 ms → 幸运星 320 ms → 消除 + 加卡包 500 ms → 进暂存区。每组都会走一遍。

| 事件 | 建议音色 | 优先级 | 钩子 | 备注 |
| --- | --- | --- | --- | --- |
| 命中高亮 | 上扬 ding，对子 / 连线 / 大满贯三档递增 | **P0** | `settleGroup` 开头 `is-hit` | 用同一采样变调最省 |
| 幸运星加成 ★ | 小铃 sparkle | P1 | `bonus` 分支的 `floatText` | |
| 消除爆开 | 一声通用 pop / burst | **P0** | `is-removing` + `FX.burst` | 第二期可按皮肤款式配专属音（甜甜圈 / 代码 / 音乐…） |
| 加卡包，HUD 数字跳 | 硬币 coin | **P0** | `bumpPacks('is-bump')` | 和消除同帧，音量别叠爆 |
| 棋盘震一下 | 低频 boom | P1 | `thumpBoard()`（连线 / 大满贯） | |
| 连线 | 高亮 ding 的华丽版 + boom | P1 | `newsKind === 'line'` | |
| 大满贯 | 专属短 fanfare（1 秒内） | P1 | `res.slam` 分支 | |
| 清空盘面 | 彩带 confetti pop + 小 fanfare | P1 | `FX.celebrate(boardEl, 2)` | |
| 进暂存区 | 极轻 tick | P2 | `renderStash(..., bumped)` | 可省 |

## 五、零消除与摇晃

| 事件 | 建议音色 | 优先级 | 钩子 |
| --- | --- | --- | --- |
| 本轮没消掉，摇晃按钮盖出 | 低落的 womp / 泄气短音 | P1 | `showShake(true)` |
| 摇晃棋盘 | 摇罐子 / 摇骰子 rattle，长度对齐 `is-shaking` | **P0** | `shakeBoard` |

## 六、Run 结束与结算弹层（`finishRun`）

| 事件 | 建议音色 | 优先级 | 钩子 | 备注 |
| --- | --- | --- | --- | --- |
| 结算横幅弹出 | 按运势 4 档：末吉低落、小吉平、中吉上扬、大吉 fanfare | **P0** | `finishRun` → `setOverlay('result', true)` | `fortune.tier` 0..3 |
| 运势印章盖下 | 木章 stamp thud | P1 | `fortune-stamp` 出现 | 很配复古感 |
| 新纪录 | 短 sting | P1 | `result-new-record.is-show` | |
| 结算粒子环境 | 不配音 | — | `ambientTimer` | 循环粒子配音会吵 |
| 生成战绩图 | 快门 shutter | P2 | `shareResult` | |

## 七、不配音的地方

- 快讯滚动条 `News`：持续滚动，配音会变噪音。
- HUD 直播小红点闪烁、装饰格纹滚动：纯装饰。
- 自动发牌调试模式：音效照常，但依赖上面的节流规则防止刷屏。

## 八、BGM

- 一首 60–90 秒无缝循环即可，首页与游戏页共用，转场期间不中断、不重头。
- 结算弹层弹出时把 BGM 压低到 30% 左右（duck），关闭后恢复。
- 风格：lo-fi / bossa nova / 尤克里里 / 轻爵士，中速，无人声，不要太「游戏机」。
- 页面切后台（`visibilitychange`）暂停，回来续播。

## 九、技术约束（小工具容器）

- 媒体必须是**包内文件**，`data:` / `blob:` 音频源被容器 CSP 拦截，外链也不行。
- 最低基线 Android 8.1 / Chrome 61：`<audio>` 和 Web Audio API 都可用。SFX 想低延迟应走 Web Audio，
  但它需要 `fetch` / `XHR` 读到包内文件的字节再 `decodeAudioData`。**这一点要第一个在真机容器里验证**，
  容器以 file 或自定义 scheme 加载时 XHR 可能被拒；不行就退回 `new Audio(url)` 池化方案。
- 自动播放策略：所有声音必须在首次用户手势后解锁，最合适的点是首页「开始游戏」。解锁时顺手预热所有 SFX。
- 格式：mp3 兼容面最广。`<audio loop>` 播 mp3 在循环点会有可闻空隙，BGM 若用 `<audio>` 请用 ogg 或裁到刚好；
  用 Web Audio 的 `loop = true` 则没有这个问题。
- 体积预算：SFX 单声道 44.1k / 96 kbps，20 条以内合计约 300 KB；BGM 128 kbps 90 秒约 1.4 MB。整包音频控制在 2 MB 内。
- 静音开关：首页加一个，状态存 `localStorage`（建议键 `ttddp.sound.v1`），BGM 和 SFX 分开记。
- 混音规则：同一个音 40 ms 内只放一次；连发的音（撕票、猫落地）随机 ±5% 音高；总线留 -6 dB 余量防止结算时叠爆。

## 十、素材来源

真正 CC0（无需署名，可商用，可修改）：

| 站点 | 内容 | 说明 |
| --- | --- | --- |
| [kenney.nl/assets](https://kenney.nl/assets) | UI Audio、Interface Sounds、Impact Sounds、Casino Audio、Music Jingles | 全站 CC0，质量和风格统一，首选。Casino Audio 里的筹码 / 纸牌声正好配卡包和票券 |
| [freesound.org](https://freesound.org) | 海量录音 | 搜索后左侧许可筛「Creative Commons 0」。质量参差，要挑；纸撕、木章、摇罐子这类实物音在这里最全 |
| [opengameart.org](https://opengameart.org) | 游戏音效和音乐 | 许可筛 CC0。混杂，但能淘到成套的 |
| [freemusicarchive.org](https://freemusicarchive.org) | 音乐 | 许可筛 CC0，找 lo-fi / bossa 循环 |
| Loyalty Freak Music、Komiku、Monplaisir | 音乐 | 三位作者的作品都是 CC0 发布，风格轻快游戏感，在 Free Music Archive 和各自站点可下 |
| [abstractionmusic.com](https://abstractionmusic.com) | 音乐 | Benjamin Burnes 的游戏 BGM 包，CC0 |
| [musopen.org](https://musopen.org) | 古典公版录音 | 若想要一段公版钢琴 / 弦乐点缀 |

免费可商用但**不是 CC0**（各有自己的许可，用前看一眼条款）：

- [Sonniss GDC Game Audio Bundle](https://sonniss.com/gameaudiogdc)：每年 GDC 放出的专业音效包，几十 GB，royalty-free 可商用，质量最高，但不能二次分发素材本身。
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/)、[mixkit.co](https://mixkit.co/free-sound-effects/)：Pixabay / Mixkit 自有许可，免署名可商用，不能把素材单独转售。
- Incompetech（Kevin MacLeod）：CC BY，需要署名。

自己生成（版权完全归自己，最适合 UI 小音）：

- [sfxr.me](https://sfxr.me)（jsfxr）、Bfxr、ChipTone：几秒钟生成 tap / ding / coin / pop，导出 wav 后转 mp3。
  复古海报风建议只用它做「叮」「哔」类点缀，主力音还是实物录音。

搜索关键词速查（英文）：`paper tear`、`ticket rip`、`card fan`、`poker chip`、`coin drop`、`wooden stamp`、
`rubber stamp thud`、`zipper`、`whoosh short`、`boing`、`rattle can`、`dice shake`、`confetti pop`、
`success chime`、`fail womp`、`camera shutter`、`ukulele loop`、`bossa nova loop`、`lofi loop`。
