# 底图风格候选（2026-10-20）

> **已定稿并实现**：日间 = editorial-atlas，夜间 = night-dive，见 `src/components/MapView.svelte`、`src/app.css`、`data/labels.json` 与 SPEC §5。本目录保留作设计依据。

用户反馈第一版底图"太 AI 风格、不够有设计感"后，用同一套投影 / 底图数据渲染了四个方向做对比。
渲染稿（PNG，体积大，不进 git）在 `preview/map-style-candidates/`，对比图是 `compare-desktop.png` / `compare-mobile.png`。

| 目录 | 方向 | 迭代 | 备注 |
|---|---|---|---|
| `editorial-atlas/` | 印刷图集：靛青→蓝绿渐变海、阶梯大陆架、经纬网、宋体海名、图框 + 罗盘 + 标题块 | 3 轮 | 有 SPEC.md（图层、色值、实现到 MapView.svelte / app.css 的步骤、风险） |
| `night-dive/` | 夜潜：深海军蓝 + 海岸发光环 + 珊瑚色标记；同一结构也渲染了日间色 | 4 轮 | 有 SPEC.md；`topojson.merge` 合并海岸线、一份几何 `<use>` 四次的性能思路两个方案共用 |
| `risograph-poster/` | 孔版海报：平涂蓝绿 + 网点、奶油陆地错位阴影、超大淡色海名、回归线 | 1 轮 | 只有脚本和 labels.json，未自我迭代 |
| `lagoon-depth/` | 潟湖分层：多级等深光晕 + 波纹符号 | 1 轮 | 只有脚本；光晕过厚，评估为最弱 |

重新渲染某个方向：脚本原本在临时目录运行，依赖 `sharp`（项目里未安装）。
```bash
npm i -D sharp            # 一次
node --experimental-strip-types docs/map-style-candidates/<dir>/render.mts
```
脚本里引用投影的绝对路径指向本仓库 `src/lib/projection.ts`，如目录移动需改路径。

定稿后：把选中方向 SPEC.md 里的图层/色值落到 `src/components/MapView.svelte` 与 `src/app.css`，新增 `data/labels.json`（海名，zh/en），并更新 `docs/SPEC.md` §5。
