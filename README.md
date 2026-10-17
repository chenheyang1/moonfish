# 月下捞鱼 · Moonfish

一个零依赖的**单文件**小游戏：猫坐在荷叶上左右挪动，接住天上掉下来的鱼。
**分数够了才算赢，赢一局才解出一张兑换码** —— 一共 5 张，抽完为止。

![对局中](preview/game-play.png)

## 直接玩

| 方式 | 怎么用 |
|---|---|
| 下载即玩 | 下 `release/moonfish.html`，双击打开就能玩，也能直接转发给别人（猫贴图已内嵌） |
| 源码版 | 打开 `game/moonfish.html`（会读取 `assets/pet-cutout.png`；贴图缺失时自动退回现画的矢量猫） |
| 在线玩 | 在仓库设置里打开 GitHub Pages 后访问 `https://<用户名>.github.io/moonfish/game/moonfish.html` |

## 玩法

- 小鱼 +10、金鱼 +25（连击最高 ×3）、奶瓶 +1 条命、炸弹 −1 条命。
- 30 秒内到目标分就算赢；3 条命用完、或者时间到还差分就算输。
- 难度跟着「已经赢过几局」涨：目标分 125 → 250，落速、刷新频率、炸弹密度一起涨。
  想调难度就改 `game/moonfish.html` 顶部的 `LEVELS`。
- 操作：`←` `→` / `A` `D` 移动，也可以直接用鼠标或手指拖动荷叶；空格开始。
- 进度存在浏览器 `localStorage`（`dsh-pet/moonfish/v1`）。想重来：收藏页「重置进度」，或打开 `?reset=1`。

![捞到一张](preview/game-win.png)

## 填兑换码

```bash
node scripts/game-codes.mjs set CODE-1 CODE-2 CODE-3 CODE-4 CODE-5
node scripts/game-codes.mjs list      # 看看现在填了什么
node scripts/game-codes.mjs clear     # 清空
node scripts/game-build.mjs           # 改完码重新生成 release/moonfish.html
```

`set` 会把码转成混淆串写进页面，源码里看不到明文，**只有赢了才会解出那一张**。

## 说清楚防作弊的边界

**这个文件藏不住秘密。** 传到 GitHub、发链接、发文件都一样：页面进了浏览器就是明文，
右键「查看网页源代码」或者 `curl` 一下就能把码拿到手，混淆只挡得住顺手看一眼的人。

想让文件怎么传都不亏，最省事的做法是**别把真码放进去**：把 5 个「领奖口令」
（例如 `LING-3-A7K2`）当成码填进游戏，赢家把口令发给你，你再私发真兑换码。
真要「自动发码且不能作弊」，那得写服务端：客户端只上报操作，服务端用同一套逻辑重放校验后才发码。

⚠️ 所以：**别把真码提交进这个仓库**，尤其是开了 GitHub Pages 之后。

## 测试

```bash
node --test tests/game.test.mjs
```

覆盖：页面能否独立解析、兑换码的隐藏与还原、脚本改写、构建时贴图内嵌。

## License

MIT
