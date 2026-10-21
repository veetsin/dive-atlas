# Dive Atlas（潜图）技术规格

版本 0.2 · 2026-10-20 · 作者：项目发起人 + Claude（0.2：足迹 / 分享图 / 二维码移入 v1；托管与微信调研结论；出图模型修订）

> 本文是项目的"唯一事实来源"。CLAUDE.md 是它的摘要。改了这里要同步 CLAUDE.md 的硬约束和状态。

---

## 1. 背景、目标、边界

### 1.1 目标

做一个**中英双语、可交互、精美**的世界潜点地图网页，部署在 GitHub Pages，让中国大陆的潜水爱好者能打开、能用、愿意分享。

核心用户问题只有两个：
- "**我这个假期去哪潜？**"（按月份 → 潜点）
- "**我想看 X（鲸鲨 / 蝠鲼 / 锤头鲨…），什么时候去哪？**"（按物种 → 潜点 + 季节）

### 1.2 成功标准（v1）

- 大陆网络下首屏可打开（实测 ≤ 5 s 可见地图），微信内置浏览器可打开。
- 手机上单手可完成：看地图 → 选月份 → 点潜点 → 看卡片 → 切换语言 → 复制链接。
- 60–80 个潜点，数据全部带来源。
- 第一眼"惊艳"：统一的插画风底图 + 贴纸，不像默认地图库的样子。

### 1.3 边界（版权与合规）

- 参考图（小红书 × PADI 世界潜水地图）**只作为"风格类型"的参考**：扁平插画 + 柔和配色 + 海洋生物点缀 + 太平洋居中。
  不复刻构图、不描摹任何插画元素、不复制标注文案、不出现其品牌与标语。
- 底图数据：Natural Earth（公有领域）。
- 插画：自产（GPT 生成 + 处理），或 CC 授权素材（需在 `CREDITS.md` 注明）。
- 潜点"事实"（名称、坐标、季节）不受版权保护，但描述文案必须自己写。
- 国界画法：使用 Natural Earth 的中国视角（CHN POV）数据；默认**淡化国界线**，以海岸线/大洲/海域为视觉主体。

---

## 2. 用户场景

| 场景 | 入口 | 期望结果 |
|---|---|---|
| 十一去哪潜 | 月份选"10 月"或快捷"十一" | 当季潜点亮起，其余变暗；点开看详情 |
| 想看鲸鲨 | 底部物种栏点"鲸鲨" | 只显示有鲸鲨的潜点，并标出各自季节 |
| 朋友发来链接 | `?lang=zh&site=sipadan&m=5` | 打开即定位到该潜点，卡片已展开，月份已选 |
| 计划船宿 | 筛选"船宿" | 只显示船宿目的地 |
| 记录足迹（v1） | 卡片上点"潜过 / 想去" | 本地保存；一键生成带二维码的 1080×1920 分享图；朋友扫码打开即看到这份足迹（只读，可"导入为我的"） |

---

## 3. 架构

### 3.1 图层分层（最重要的架构决定）

**底图用代码画，GPT 只画"贴纸"。** AI 生成整张地图地理不准、国界不可控、无法交互。

| 图层 | 来源 | 渲染 | 备注 |
|---|---|---|---|
| 海洋背景 | 代码 | 全幅 `<rect>`：日间 = 纵向渐变（赤道亮带，`eqY` 在缩放结束时更新）+ 径向高光；夜间 = 径向渐变 | 在 zoom `<g>` 之外，只在尺寸变化时重绘 |
| 经纬网 + 回归线 | `d3-geo` geoGraticule 30° | SVG path，`non-scaling-stroke` | 极淡；回归线虚线 |
| 大陆架 / 浅海 | 代码 | **一份合并海岸线**（`topojson.merge`）放 `<defs>`，`<use>` 四次描边 28/16/8/3 px（夜间 20/10/4 px 发光环） | 宽带只描 ≥ 4000 km² 的多边形，避免环礁变靶心；替代 `feGaussianBlur` |
| 陆地 | Natural Earth 10m CHN POV，合并后无国界 | `<use>` 同一份几何，线性渐变填充；日间加 1 px 深沙色边 | 国界默认不画（见 §4.5） |
| 格陵兰 | 同上，单独合并 | `unwrapped` 投影 | 见 §4.4 |
| 海域名 | `data/labels.json`（25 条，三级） | 宋体系统栈 SVG text，按"每度经线像素数"分级显隐，`scale(k^-0.75)` | 中英；一级名下加英文小字 |
| 海底深度分层（可选） | Natural Earth bathymetry | SVG path，3–4 档蓝 | v1.5；可替换伪等深带 |
| 潜点标记 | `data/sites.json` | SVG `<g>`（圆点 / 贴纸） | 反向缩放保持像素大小 |
| 物种贴纸 | `public/sprites/*.webp` | `<image>` | 透明 WebP，两档尺寸 |
| 静态覆盖层 | 代码 | 晕影 `<rect>`（日）、纸张颗粒（CSS `feTurbulence` 平铺 div）、星点（夜，120 个种子随机点）、桌面图框 + 经纬刻度（随缩放更新）+ 罗盘（"北"走 i18n） | 全部在 zoom `<g>` 之外，`pointer-events: none` |
| 装饰（船、波纹） | 贴纸 / 代码 | `<image>` / SVG | 可关（reduced motion） |
| UI | Svelte 组件 | HTML | 卡片、月份条、物种栏、搜索、语言 |

### 3.2 技术栈

- **Vite + Svelte 5 + TypeScript (strict)**：单页、体积小、无运行时框架开销大头。
- **d3-geo**（投影、路径）、**d3-zoom**（缩放平移）、**d3-selection**（挂 zoom）、**topojson-client**（解包底图）。
- **mapshaper**（dev 依赖）：简化与转换地理数据。
- **Python 3.13 via uv（rembg + Pillow）**：贴纸处理流水线（不进前端；本机 python3.14 不可用，命令见 ILLUSTRATION_GUIDE §6）。
- **lean-qr/nano**（≈2 KB gzip，MIT，零依赖）：分享图里的二维码。这是 v1 唯一新增的运行时依赖；分享图本身用 Canvas2D + d3-geo 的 `path.context(ctx)` 画，不引入新库。
- 部署：GitHub Actions → GitHub Pages。

### 3.3 目录

见 CLAUDE.md "目录速查"。

### 3.4 状态与 URL

全局状态（`src/lib/stores.ts`）：`lang`、`month`（0 = 全年）、`selectedSiteId`、`speciesFilter`、
`footprint`（我的足迹，`{v:1, dived:[id], wish:[id]}`，存 `localStorage['dive-atlas:footprint']`）、
`viewing`（正在查看的朋友足迹，只读，**永不写入 localStorage**，除非用户点"导入为我的"）。

URL 同步规则：`?lang=zh|en&m=1..12&site=<id>&sp=<speciesId>&d=<mask>&w=<mask>`。
- `d` / `w`（潜过 / 想去）是 base64url 位图：第 i 位对应 `data/footprint-index.json` 的第 i 个 id（**只追加、不重排、不删除**，所以旧二维码永远可解；见 §7.3a）。80 个潜点各 14 个字符，整条分享 URL 在短域名下约 60 字符，二维码 V4–V5。
- 打开页面：先读 URL，再读 `localStorage`（lang、footprint），最后按浏览器语言猜。URL 里有 `d`/`w` 即进入"查看朋友足迹"模式，顶部横幅可切回"我的"。
- 状态变化：`history.replaceState`，不产生历史记录。查看模式下 `syncUrl` 必须保留 `d`/`w`，否则点一下月份就丢了朋友的链接。
- 单个潜点的"复制链接"**不带**足迹参数；只有足迹面板的"复制足迹链接 / 生成分享图"才把 `d`/`w` 写进链接，避免无意泄露。
- 任何页面都应可被复制分享后还原。

---

## 4. 底图

### 4.1 数据源

| 用途 | 文件（Natural Earth v5+） | 说明 |
|---|---|---|
| 国家面（中国视角） | `ne_10m_admin_0_countries_chn` | **视角版本只有 10m 一档**（镜像里没有 50m/110m 的 `_chn`），世界视图和放大视图都从它简化得到；带 `NAME_ZH` / `NAME_EN` / `ADM0_A3` / `CONTINENT` |
| 海底深度（可选） | `ne_10m_bathymetry_L_0 … H_3000` | 只取 0 / 200 / 1000 / 3000 四档；v1.5 |
| 湖泊（可选） | `ne_50m_lakes` | 仅大湖；可不要 |

来源镜像：GitHub `nvkelso/natural-earth-vector`（master 分支），脚本优先用 raw 下载，失败则 sparse-checkout（`--filter=blob:none`，只拉需要的文件）。

### 4.2 处理流程（`scripts/build-geo.sh`）

```
下载 shp → mapshaper
  -filter "CONTINENT != 'Antarctica'"   # 地图裁到 60°S，南极不需要
  -simplify 3% keep-shapes              # 世界视图；--detail 版用 15%
  -filter-fields ADM0_A3,NAME_EN,NAME_ZH,CONTINENT
  -clean
  -o format=topojson quantization=1e4
→ public/geo/countries.topo.json          实测 160 KB，gzip 48 KB（预算 ≤ 250 KB / ≤ 100 KB）
→ public/geo/countries-detail.topo.json   仅 `npm run geo -- --detail`；缩放 ≥ 4x 时懒加载（v1.5）
```

无浏览器时用 `npm run preview:map [宽 高]` 把底图 + 标记渲染成 `preview/map-<宽>.svg`（有 rsvg / ImageMagick / sharp 时顺带出 PNG），用来肉眼检查投影、格陵兰和标记位置。

### 4.3 投影

- `d3.geoNaturalEarth1()`，`rotate([-150, 0])` → 中央经线 150°E，太平洋居中，亚洲在中、美洲在右、欧非在左。
- 纬度范围裁到 **-60° ～ 85°**：不画南极，画面上下更紧凑。实现：用 raw 投影算出 y(85°) 与 y(-60°)、x(±180°) 的范围，再求 scale/translate（`fitWorld()`），不用 `fitSize(Sphere)`。
- 海洋背景是全幅矩形，所以投影边缘外的空白也是"海"，不会露出球面轮廓。

### 4.4 格陵兰 unwrap（为什么要单独画）

中央经线 150°E 时，切割线在 **30°W**，正好穿过格陵兰。直接渲染会把格陵兰劈成两半（一半在最右，一半在最左）。

解法（`src/lib/projection.ts` 的 `unwrappedPath`）：
1. 主图层排除 `ADM0_A3 === 'GRL'`。
2. 格陵兰用**手工投影**：`λ' = λ − 150`，若 `λ' < −150` 则 `λ' += 360`（格陵兰落到 137°～198°），
   再直接调用 `geoNaturalEarth1Raw(λ', φ)` 并套 scale/translate。绕过 d3 的反子午线裁剪，让它完整地"溢出"右边缘。
3. 因为背景是矩形海洋，溢出的几度看不出异常。冰岛（−24°～−13°）不受影响，完整出现在左侧欧洲旁边。

同样的方法适用于任何被切割线穿过的小岛（亚速尔等，必要时加入 `UNWRAP_LIST`）。

### 4.5 国界显示策略

- 默认：**只画海岸线，不画国界**。所有国家在加载时用 `topojson.merge` 合成一份几何，内部边界自然消失；陆地统一填色，不按大洲或国家区分（避免"政治地图"观感，也去掉了相邻国家接缝的高亮感）。
- 若日后需要国界，另加一层 `mesh(topo, obj, (a, b) => a !== b)`，极淡、可关；默认不加。
- 不渲染任何争议区域图层、不单独标注任何敏感地名。

---

## 5. 视觉规范

> **2026-10-20 决定**：第一版底图被判定"太 AI 味"。日间主题采用 `docs/map-style-candidates/editorial-atlas/`（印刷图集：渐变海、阶梯大陆架、经纬网、宋体海名、图框与罗盘），夜间主题采用 `night-dive/`（海军蓝 + 海岸发光环），两者共用"合并海岸线一份几何、`<use>` 多次描边"的结构，日夜允许观感不同。实现后用各自 SPEC.md 的色值更新 §5.2，并新增 `data/labels.json`（海洋 / 海域名，zh + en）。

### 5.1 关键词

精致扁平矢量插画 · 柔和但饱满的海洋色 · 轻微纸张/孔版颗粒 · 无描边 · 左上光源 · 克制的动效。
**不是**：卡通大眼睛、拟人表情、粗黑描边、荧光渐变、默认地图库的灰蓝。

### 5.2 色板（CSS 变量，`src/app.css`）

| 变量 | 日间 | 夜潜 | 用途 |
|---|---|---|---|
| `--ocean-deep` | `#0E2A47` | 同 | 画框边缘、晕影、body 背景 |
| `--ocean-mid` | `#124A6C` | `#0B1F35` | 海洋渐变中段 |
| `--ocean` | `#19858F` | `#123A5C` | 海洋主色（日间赤道亮带 / 夜间中心） |
| `--ocean-shallow` | `#6FCBBE` | `#2A6A85` | 径向高光 |
| `--seafoam` | `#9ED9C9` | `#4A8FA6` | 高光 |
| `--ring-far` / `-mid` / `-near` | `#6FCBBE` ×3 | `#2A6A85` / `#397C97` / `#4A8FA6` | 大陆架四条带（夜间三条发光环） |
| `--land` / `--land-hi` / `--land-2` | `#F3E6CB` / `#F6EAD2` / `#EEDCBB` | `#36526D` / `#3D5B77` / `#33506A` | 陆地（渐变左上 → 右下） |
| `--land-edge` | `#D8C49A` | transparent | 陆地 1 px 边 |
| `--map-line` | `#FBF8F1` | `#9ED9C9` | 经纬网、海域名、图框、罗盘、页眉文字 |
| `--coral` | `#F2795B` | 同 | 强调 / 选中 / 标记 |
| `--sun` | `#F6C453` | 同 | 当季标记、悬停与选中外环 |
| `--shell` | `#F2B5A7` | `#F9A68B` | 次强调；夜间标记外环 |
| `--ink` / `--paper` | `#13293D` / `#FBF8F1` | 互换 | 文字 / 卡片背景 |
| `--glass` | `rgba(251,248,241,.88)` | `rgba(19,41,61,.82)` | 悬浮药丸背景（替代 `color-mix`，旧内核可用） |
| `--font-serif` | `'Songti SC','STSong','Noto Serif CJK SC',Georgia,serif` | 同 | 海域名、刻度、罗盘；Android 多半回退为 sans，可接受 |

主题通过 `<html data-theme="night">` 切换（`src/lib/stores.ts` 的 `theme`：默认跟随 `prefers-color-scheme`，右上角按钮切换后记入 localStorage，不进 URL）。除 token 外，MapView 只按 `data-theme` 切换几个图层的显隐：夜间隐藏纵向渐变、晕影、最宽的一条大陆架带和标记投影，显示径向夜海、星点和标记发光环。贴纸会落在 `#0E2A47 → #19858F`（日）/ `#0E2A47 → #123A5C`（夜）的背景上，验收贴纸时两种底色都要看。

### 5.3 字体

- 正文：系统字体栈 `-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`，零下载。
- 标题（可选）：一款开源展示字体做**子集化**（只含用到的字），WOFF2 ≤ 60 KB；否则不用。
- 英文地名标签：`Inter` 子集或系统字体。

### 5.4 海洋质感（代码实现，无图片）

1. 日间海洋：纵向渐变 `deep → mid → ocean（赤道）→ mid → deep`，赤道位置 `eqY` 取自投影并在缩放结束时更新；再叠一层以赤道为中心的径向高光。夜间：径向 `ocean → deep`。
2. 大陆架：同一份合并海岸线 `<use>` 四次，`non-scaling-stroke`；28 / 16 px 只描 ≥ 4000 km² 的多边形（`geoArea ≥ 1e-4 sr`），8 / 3 px 描全部；夜间改为 20 / 10 / 4 px 的三条发光环。
3. 纸张颗粒：`.grain` div 用 `feTurbulence` 的 data-URI 做 200 px 平铺背景，`opacity .16`（夜间 `.06`），在 zoom `<g>` 之外，浏览器只栅格化一次。
4. 晕影（日）、星点（夜）、桌面图框 + 刻度 + 罗盘：全部静态，`pointer-events: none`。
5. v1.5：真实海底深度分层（§4.1）可替换第 2 条的伪等深带。

---

## 6. 交互清单

### 6.1 v1（必须）

| # | 功能 | 验收标准 |
|---|---|---|
| 1 | 缩放平移 | 滚轮 / 双指缩放 1x–8x；拖动平移；标记与文字保持像素大小不随地图放大 |
| 2 | 潜点标记 | 圆点统一珊瑚色（足迹状态另有配色），有贴纸的潜点显示贴纸；hover / 点击高亮；放大 > 2.5x（窄屏 4x）时显示当季潜点的名称标签 |
| 3 | 潜点详情卡 | 桌面：右侧栏 360 px；手机：底部抽屉，上拉至 70% 高。内容：中英名、国家/区域、12 格季节条、明星物种、水温、能见度、难度/证书、潜水类型、访问方式、简介、来源、"待核实"标记 |
| 4 | 月份筛选 | 顶部 12 个月 + "全年"；选中后当季潜点 100%、非当季 30%（夜间 40%）透明；卡片季节条同步高亮 |
| 5 | 中英切换 | 右上角开关；所有文案、地名、卡片即时切换；写入 URL 与 localStorage |
| 6 | 分享链接 | URL 完整还原 lang / month / site / species；卡片上"复制链接"按钮 |
| 7 | 搜索 | 输入框匹配中文名、英文名、拼音（用 `pinyin-pro` 预生成拼音字段，不在运行时引入拼音库） |
| 8 | 移动端 | 375 px 可用；触控目标 ≥ 40 px；抽屉可点海面 / Escape / × 关闭（拖动关闭移至 v1.5）；窄屏默认 1.9x 定位到东南亚（整张世界图在手机上太小） |
| 9 | 可访问性 | 标记可键盘聚焦；卡片有 `aria-label`；动效尊重 `prefers-reduced-motion` |
| 10 | 我的足迹 | 卡片底部两个开关"潜过 / 想去"（≥ 40 px，`aria-pressed`）；地图上潜过 = 珊瑚色实心、想去 = 日光色圆环、其余弱化；顶部"足迹"按钮打开面板（计数、名单、一行隐私提示） |
| 11 | 分享图 + 二维码 | 面板点"生成分享图"：Canvas2D 画 1080×1920 JPEG（q 0.92；顶部 1/3 世界图 + 足迹点，下方计数与地名，右下二维码 8 px/模块、ECC M）；结果以 `<img src="data:image/jpeg…">` 弹层显示并提示"长按保存"（微信里 `download`、`navigator.share(files)` 都不可用）；二维码内容 = 足迹链接 |
| 12 | 足迹查看模式 | 扫码 / 点链接打开 `?d=&w=` 时只读展示朋友足迹，横幅提供"看我的"与"导入为我的足迹"（二次确认）；复制链接在微信失败时回退到 `execCommand('copy')`，再失败显示可长按选中的链接框 |
| 13 | 区域聚合气泡（从 v1.5 提前） | 缩放低于阈值（桌面 1.6x、窄屏 2.6x）且某区域可见潜点 ≥ 3 时，该区域折叠成一个气泡：区域色外环 + 当季潜点数 + 区域名；点气泡缩放到该区域范围（约占视口 70%）后散开为标记；不足 3 个的区域始终显示单个标记；月份 / 物种筛选影响气泡计数 |

### 6.2 v1.5（惊艳点）

| # | 功能 | 说明 |
|---|---|---|
| 10 | 分级缩放 + 区域聚合 | **已提前到 v1（§6.1 #13）**；v1.5 剩余：缩放过渡动画、气泡内按月份显示当季比例 |
| 11 | 年度迁徙播放 | 播放键：12 个月自动轮播（每月 1.2 s），当季物种贴纸淡入淡出、轻微浮动 |
| 12 | 物种图鉴联动 | 底部物种栏；点一个物种 → 只亮有它的潜点，卡片显示该物种在各地的季节 |
| 13 | 环境动效 | 海面波纹、偶发鲸鱼跃出（SVG 动画，≤ 2 个同时）；低端机自动降级 |
| 14 | 日 / 夜主题 | 切换 CSS 变量；夜潜模式贴纸发光描边 |
| 15 | 10m 底图切换 | 缩放 > 4x 时换用 10m 数据（懒加载） |

### 6.3 v2（进阶）

| # | 功能 | 说明 |
|---|---|---|
| 16 | 足迹 JSON 文件导入导出 | 文件级备份（v1 里分享链接本身已是导出，"导入为我的足迹"已是导入） |
| 17 | 分享图上叠物种贴纸 | v1 分享图只画圆点 + 统计 + 二维码；贴纸需要 `createImageBitmap` 逐张加载，v2 再做 |
| 18 | 假期快捷筛选 | 春节 / 五一 / 十一 / 圣诞 |
| 19 | 条件筛选 | 证书等级、潜水类型（沉船 / 洞穴 / 放流 / 微距 / 大货 / 冷水）、船宿 |
| 20 | 潜点对比 | 选 2–3 个潜点并排比较季节 / 水温 / 难度 |

---

## 7. 数据模型

### 7.1 `data/sites.json`

```jsonc
{
  "id": "sipadan",                      // kebab-case，稳定不变，用于 URL
  "name": { "zh": "诗巴丹", "en": "Sipadan" },
  "pinyin": "shibadan",                 // 由脚本生成，用于搜索
  "country": { "zh": "马来西亚", "en": "Malaysia" },
  "region": "coral-triangle",           // regions.json 的 id
  "coords": [118.63, 4.11],             // [lon, lat]
  "bestMonths": [4, 5, 6, 7, 8, 9],     // 1–12；空数组 = 全年
  "species": ["green-turtle", "barracuda", "bumphead-parrotfish"], // species.json 的 id，按"看点优先级"排序
  "level": "AOW",                       // OW | AOW | Tech
  "types": ["wall", "drift"],           // reef | wall | drift | wreck | cave | muck | pelagic | coldwater | kelp
  "access": ["boat"],                   // shore | boat | liveaboard
  "waterTempC": [27, 30],
  "visibilityM": [15, 30],
  "summary": { "zh": "…（≤ 120 字）", "en": "…（≤ 90 words）" },   // 与 §7.4、校验脚本一致
  "highlights": [ { "zh": "…", "en": "…" } ],   // 2–4 条看点，可选
  "sources": ["https://…"],             // verified:true 时至少 1 条；官方 / 公园管理处 / 权威潜水媒体优先
  "verified": false,                    // 逐条核实后改 true
  "notes": "…",                         // 维护备注（来源分歧、肩季、坐标精度）。构建时由 vite.config.ts 的 stripNotes 剥掉，不进 bundle
  "pinyin": "shibadan sbd",             // 由 npm run data:pinyin 生成，必填
  "updatedAt": "2026-10-20"
}
```

体积：`data/sites.json` 仍是唯一手工维护的文件，但由 `vite.config.ts` 的 `siteData` 插件拆成两份发布——静态导入拿到轻字段（地图 / 搜索 / 足迹用），`summary / highlights / sources` 进入 `virtual:site-details` 虚拟模块，卡片首次打开时按需 `import()`（43 个潜点时主包 73 KB gzip，详情块 17 KB）；`notes` 不发布。

### 7.2 `data/species.json`

```jsonc
{
  "id": "whale-shark",
  "name": { "zh": "鲸鲨", "en": "Whale shark" },
  "sci": "Rhincodon typus",
  "sprite": "whale-shark",              // public/sprites/whale-shark-192.webp / -512.webp
  "sizeClass": "xl",                    // xl | l | m | s → 没有 lengthM 时的兜底尺寸
  "lengthM": 10,                        // 典型成体体长（米；鱼群按看到的群体尺寸），地图贴纸按对数缩放：2 cm→22 px，1 m→45 px，10 m→58 px，25 m→64 px
  "tags": ["pelagic", "big"]
}
```

### 7.3 `data/regions.json`

```jsonc
{ "id": "red-sea", "name": { "zh": "红海", "en": "Red Sea" }, "center": [35.5, 24.0], "color": "#F2795B" }
```

### 7.3a `data/footprint-index.json`

```jsonc
// 足迹位图的位序。只能在末尾追加；潜点下线也不删，只在 sites.json 里移除。
["sipadan", "komodo", "raja-ampat", …]
```
校验：每个 `sites.json` 的 id 在索引里恰好出现一次；索引里多出的 id 只警告（墓碑）。

### 7.4 校验规则（`scripts/validate-data.mjs`）

- `id` 唯一、kebab-case；`coords` 在范围内；`bestMonths` ⊂ 1..12；`species` / `region` 引用存在；
- `sources` 非空，否则 `verified` 必须为 false；
- zh/en 都存在且非空；`summary.zh` ≤ 120 字、`summary.en` ≤ 90 词。

### 7.5 数据工作规范

- 先定潜点清单（按区域配额：东南亚 / 珊瑚三角 20，红海 8，印度洋 10，太平洋 10，澳新 6，美洲 12，欧洲 / 冷水 6），再从中统计物种清单 → 再画贴纸。
- 每条记录至少 2 个独立来源交叉；季节写"主流说法"，有争议的在 `notes` 里注明。
- 文案风格：具体、克制、有画面感；不用"世界最佳""必去"等绝对词。

---

## 8. 插画流水线（概要，详见 `docs/ILLUSTRATION_GUIDE.md`）

1. 在 ChatGPT（Plus，Images 2.5，与聊天模型选择无关）按风格总纲出图，**2×2 宫格**保证同批风格一致；每次附色板图 `art/palette-swatch.png`，第一批通过验收后作为第二张参考图锚定后续批次。
2. 背景：**默认灰底 → `rembg` 抠图**（结果可控）。ChatGPT 的透明输出不稳定，只在验证到真 alpha 时用 `--no-rembg`。API 路线（`gpt-image-2.5-sunburst` + `background: transparent`）仅作备用。
3. `scripts/process-sprites.py`（用 `uv run --python 3.13` 运行）：切宫格 → 去底 → 裁边 → 导出 192 px（地图贴纸）与 512 px（卡片）WebP → 写 `public/sprites/manifest.json`。
4. 命名与 `species.json` 的 `sprite` 字段一致。27 个物种 + 装饰共 9 次生成（B1–B7、D1–D2），前 3 批即可覆盖当前所有潜点的主图物种。

---

## 9. 性能与大陆访问

- **零外部请求**（硬约束）。构建后用 `grep -r "https://" dist/` 检查没有运行时外链（允许 `sources` 里的链接，它们只是文本）。
- 预算：首屏 ≤ 2 MB（gzip ≤ 800 KB）；JS ≤ 150 KB gzip；底图 ≤ 100 KB gzip；贴纸懒加载。
  2026-10-20 实测基线：JS 54 KB gzip、CSS 2.5 KB、底图 47 KB gzip，首屏 ≈ 104 KB gzip；足迹 + 分享图 + 二维码预计再加 ≈ 7 KB gzip；80 个潜点的数据约再加 25 KB gzip。
- 贴纸：`loading="lazy"`，只加载视口内或当前筛选命中的。
- 字体：不下载或子集化 ≤ 60 KB。
- 实测清单（上线前）：
  - 国内测速工具（如 17ce / boce）看各省首屏时间；
  - 微信内置浏览器打开 `*.github.io` 链接是否被拦截或提示；
  - 备选方案调研结论（2026-10-20，详见各来源）：
    - **Gitee Pages 已于 2024 年停止服务**，不再是选项。
    - **任何大陆 CDN 节点都要 ICP 备案**（阿里云 / 腾讯云 CDN、EdgeOne、Cloudflare China Network 均如此）；Vercel / Netlify 官方说明大陆可能被限制；Cloudflare 代理会把大陆用户调度到海外节点（实测 TLS 170–215 ms），不要用。
    - `*.github.io` 间歇性受干扰（GreatFire 2026-10-11 测得 33% disrupted），且作为"境外未备案共享域名"最容易触发微信的"请在浏览器打开"拦截。
    - 大陆托管 + 备案不做：除了备案门槛，自制投影的世界地图在境内公开发布属于《地图管理条例》要求送审的范围；香港托管不在该条例的属地范围内。
  - 2026-10-20 从大陆 15–20 个家庭宽带探针实测 GitHub Pages（Globalping）：移动 / 联通 70/71 次 HTTP 200，TCP 70–110 ms、TTFB 80–300 ms；电信 2 个探针 7 次里 4 次超时；ISP 解析器无 DNS 污染。结论：**可用但不保证**，弱点是电信和晚高峰。
  - **推荐（两步走）**：
    1. 现在就买一个短 `.com`，DNS 放 DNSPod / 阿里云 DNS（不要 Cloudflare 代理），CNAME 到 GitHub Pages，`public/CNAME` + `BASE_PATH=/`。二维码只印自有域名——以后怎么换托管都不影响已发出去的图。
    2. 上线周在 21:00 前后用 Globalping / 17ce 分运营商测 `HTTP 200 ≤ 5 s` 成功率，并用电信 / 移动 SIM 微信扫码。**电信或移动 < 80% 才买香港服务器**（Caddy 自动 HTTPS + 工作流 `rsync dist/`，GitHub Pages 继续作镜像）；否则不买。
    - 腾讯云国内站：香港 锐驰型 2C1G，200 Mbps 无限流量，¥40/月（需国内实名）。
    - 腾讯云国际站：香港 Starter 2C2G，20–30 Mbps、512 GB–1 TB/月，US$6–8.5/月（USD 计价，无需大陆实名；2 MB 站点够用）。
    - 零服务器备选：阿里云 OSS 香港桶 + 自定义域名（官方文档明确非大陆桶无需备案），≈ ¥10–20/月，但证书续签要自己盯。

---

## 10. 部署

- `.github/workflows/deploy.yml`：push `main` → `npm ci` → `npm run build` → 上传 `dist` → 部署 Pages。
- `vite.config.ts` 的 `base` 读 `BASE_PATH` 环境变量；工作流里设为 `/<repo>/`。用户站点（`<user>.github.io` 仓库）则为 `/`。
- 自定义域名：先买（二维码永远只印自有域名，不印 github.io）。指向 GitHub Pages 时放 `public/CNAME`，`BASE_PATH` 改为 `/`。
- 大陆访问主站（§9 决策后）：工作流在 `npm run build` 后加一步 `rsync -az --delete dist/ user@hk:/srv/dist/`（SSH 私钥放 GitHub Secrets），服务器上 Caddyfile 三行：`root * /srv/dist`、`file_server`、`encode gzip`。GitHub Pages 继续作为镜像部署。

---

## 11. 里程碑

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| M0 ✅ | 规格、插画规范、脚手架 | 本仓库 |
| M1 | 底图成型：投影、光晕、格陵兰、国界策略、日夜主题 | 1280 / 375 两种宽度截图满意 |
| M2 | v1 数据：60–80 潜点 + 物种清单 + 校验通过 | `verified: true` ≥ 80% |
| M3 | v1 交互：标记、卡片、月份、语言、URL、搜索、移动端、**足迹 + 分享图 + 二维码** | §6.1 全部验收（含 #10–#12）；iPhone 与低端 Android 的微信内真机通过 |
| M4 | 贴纸第一批（20 个物种）+ 装饰 | 风格一致，体积达标 |
| M5 | 域名 + 托管（§9 决策）+ 上线 + 国内实测 | 17ce / itdog 电信 / 联通 / 移动三网首屏 ≤ 5 s；微信扫码直接打开无拦截 |
| M6 | v1.5：聚合、迁徙播放、物种联动、动效 | §6.2 |

---

## 12. 风险与未决

| 风险 | 应对 |
|---|---|
| GitHub Pages 在大陆慢 / 不稳（2026-10 测得间歇性干扰） | 自有域名 + 香港源站为主，GitHub Pages 只作镜像；二维码永远印自有域名 |
| 微信拦截 / "非微信官方网页"提示 | 境外未备案的共享域名最容易触发；用自有 `.com`、主流 CA 证书、HTTPS 直达无跳转；上线前用电信 / 移动卡真机扫码 |
| 国界 / 地图合规 | CHN POV 数据 + 淡化国界 + 可关闭；境内发布自制世界地图需送审（《地图管理条例》），所以不做大陆托管与备案；页脚注明"示意图，非测绘地图" |
| GPT 出图风格漂移 | 宫格 + 色板图 + 第一批参考图锚定 + 统一后处理；不合格的只重画那一格 |
| ChatGPT 透明底不稳定 | 默认灰底 + rembg；透明输出只在验证到真 alpha 后使用 |
| 足迹链接泄露行踪 | 面板一行提示；单潜点链接不带足迹参数；查看模式不落盘 |
| 季节数据有争议 | 标"参考"，多来源交叉，保留 `notes` |
| 名称 | `dive-atlas` 仅代号；正式名称与域名待定 |

---

## 13. 变更记录

### 2026-10-20 · 0.2 实现落地

- **底图**：按 §5 实现日间（印刷图集）与夜间（夜潜）两套主题，`MapView.svelte` 一套 SVG 结构 + `data-theme` 切换；新增 `data/labels.json`（25 个海域名）、`ThemeToggle.svelte`、`theme` store；`scripts/preview-map.mts` 支持 `--theme night`。
- **足迹**：§3.4 / §6.1 #10–#12 / §7.3a 全部实现。与设计稿的差异：分享图导出 JPEG（q 0.92，≈ 150 KB）而非 PNG，便于微信长按保存与识别；分享图里未叠物种贴纸（v2 #17）；单潜点"复制链接"会主动剥掉 `d` / `w`。
- **脚手架修复**：缩放行为只创建一次；深链接标记放在手机可见带；`<svg>` 去掉 `role="img"`；标签只在当季潜点显示；URL 同步改为单一 derived 订阅并保留 hash；复制链接带 `execCommand` 回退与只读链接框；`color-mix` 改 `--glass`；抽屉适配安全区；Escape / 点海面关卡片；`scripts/check-dist.mjs` 作为零外链与 800 KB gzip 门禁进入工作流；内联 favicon。
- **搜索与筛选**：§6.1 #7 实现为工具栏放大镜 + `SearchPanel.svelte`（匹配中文名、英文名、拼音全拼 / 首字母、国家），`pinyin` 字段由 `scripts/gen-pinyin.mjs` 生成（括号别名拆成独立词）且为必填；`?sp=` 物种筛选有可关闭芯片。`spriteUrl()` 以 `public/sprites/manifest.json` 为准，未生成的贴纸不发请求；地图贴纸按 `sizeClass` 取 48 / 40 / 32 / 24 px。
- **未做**：微信真机验证（长按保存、识别二维码、低端安卓渲染耗时）、80 个潜点下的标签避让、抽屉拖动关闭（现为点海面 / Escape / ×）、`countries-detail.topo.json` 的合并方式需与 `src/lib/geo.ts` 一致。

### 2026-10-21 · 数据第一波、贴纸落地、体积

- **贴纸**：B1 四物种入库，`--outline 2.5` 刀模边定为标准；地图贴纸尺寸改为按 `species.lengthM` 对数缩放（§7.2）；`spriteUrl()` 以 manifest 为准，未生成的物种不发请求。
- **数据**：第一波合并 43 个潜点（东南亚 8、红海 8、澳新 6、美洲 13 + 8 个未重做的种子），34 个 `verified: true`，新增 16 个物种；每条带 `notes`（构建时剥离）。目标提高到 ≥ 200 个（用户要求不少于参考海报），第二波待续跑。
- **体积**：43 个潜点时 JS 87 KB gzip（剥 notes 前 95 KB）。按每潜点约 0.5 KB gzip 估算，200 个潜点需要把 `summary / highlights / sources` 拆成按需 `import()`（§7.1 体积提醒）。
- **评估**：地球模式（d3 `geoOrthographic`）可行、零新依赖，静态效果见 `preview/map-style-candidates/globe-preview.png`，渲染脚本 `docs/map-style-candidates/globe-preview.mjs`；建议做成"平面 / 地球"切换而不是替代平面图，排在区域聚合之后。
