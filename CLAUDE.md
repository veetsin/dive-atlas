# Dive Atlas（潜图）— 项目记忆

> 这是 Claude Code 每次会话都会读的文件。保持简短，只放"每次都要记住"的东西。
> 细节在 `docs/SPEC.md`（技术规格）和 `docs/ILLUSTRATION_GUIDE.md`（插画规范）。
> **开始任何非琐碎任务前，先读 `docs/SPEC.md` 对应章节。**

## 项目一句话

一个中英双语、可交互的"世界潜点地图"静态网页：扁平插画风底图 + 潜点标记 + 物种贴纸 + 月份/物种筛选，
部署在 GitHub Pages，**主要受众是中国大陆的潜水爱好者**，所以一切以"墙内能打开、手机上好用"为准。
`dive-atlas` 只是代号，正式名称待定。

## 硬约束（不可违反，改动前先问）

1. **零外部请求。** 不用任何 CDN、Google Fonts、在线地图瓦片、第三方统计。所有 JS/字体/数据/图片都打包进仓库。
   新增依赖时确认它不会在运行时请求外部 URL。
2. **不出现任何第三方品牌。** 页面、代码、素材里不得出现 PADI、小红书、Awesome Maps 等名称、logo、标语。
   `art/reference/` 里的参考图只用来对齐"风格类型"，不得描摹、复刻其构图、插画、标注文案。
3. **底图用 Natural Earth 中国视角（CHN point-of-view）数据**（`ne_10m_admin_0_countries_chn`，视角版本只有 10m 一档），
   由 `scripts/build-geo.sh` 生成，不要手动改 `public/geo/` 里的文件，也不要换成其他来源的国界数据。
4. **投影：Natural Earth I，中央经线 150°E（太平洋居中），纬度裁到 -60°～85°（不画南极）。**
   格陵兰用 `unwrapped` 图层单独绘制（见 `src/lib/projection.ts`），不要"修掉"这个逻辑。
   地球模式（`?view=globe`）是附加视图：`geoOrthographic`、不用 unwrap、中心纬度夹在 -60°～85°、-60° 以南涂暗；平面图规则不变。
5. **所有用户可见文案走 i18n**（`src/lib/i18n.ts` + 数据里的 `{zh, en}` 字段）。不得在组件里硬编码中文或英文。
6. **数据必须带来源。** `data/sites.json` 每条记录都要有 `sources`；`verified: false` 的记录 UI 上显示"待核实"标记。
   季节、水温、能见度一律是"参考值"，文案里不要写成保证。
7. **体积预算：** 首屏总下载 ≤ 2 MB（gzip 后 ≤ 800 KB）；底图 TopoJSON ≤ 250 KB；
   单张地图贴纸 ≤ 15 KB、卡片大图 ≤ 40 KB（WebP）。超预算先优化再合并。
8. **移动端优先。** 任何交互都要在 375px 宽、触屏、无 hover 的前提下可用；动效尊重 `prefers-reduced-motion`。
9. **坐标统一 `[lon, lat]`**（GeoJSON 顺序），数据和代码里都是。

## 技术栈与命令

- Vite + Svelte 5 + TypeScript（strict）；地图用 `d3-geo` + `d3-zoom` 渲染 SVG；数据用 TopoJSON。
- `npm run dev` 开发 · `npm run build` 构建 · `npm run check` 类型检查 · `npm run preview` 预览构建产物
- `npm run geo` 下载 Natural Earth 数据并生成 `public/geo/countries.topo.json`（需要网络，幂等；`-- --detail` 多出放大用的版本）
- `npm run preview:map [宽 高]` 无浏览器渲染底图到 `preview/map-<宽>.svg|png`，改投影 / 底图后用它看效果
- `npm run data:validate` 校验 `data/*.json`（字段、坐标范围、物种引用、来源）+ `data:geo` 地理校验（离岸距离、国家、重复；首次先 `npm run geo` 缓存 10m 原始数据）
- 扩充潜点：枚举 workflow（清单型来源）→ `node scripts/select-candidates.mjs <enum.json>`（去重、自动入选、分批）→ 补全 workflow（每潜点 ≤ 2 次搜索）→ 合并、`data:pinyin`、`data:validate`；品牌域名（padi / ssi / 小红书）只做对照，`check:dist` 会扫出任何品牌字样
- 贴纸处理：`uv run --python 3.13 --with 'rembg[cpu]' --with pillow python scripts/process-sprites.py <grid.png> --grid 2x2 --ids a,b,c,d`
  （本机 `python3` 是 3.14 且 pyexpat 损坏，`npm run sprites` 会失败；详见 `docs/ILLUSTRATION_GUIDE.md` §6）
- 改完代码的收尾动作固定为：`npm run check && npm run data:validate && npm run build && npm run check:dist`（最后一步扫描 dist 里的运行时外链与 gzip 总量）

## 目录速查

```
CLAUDE.md                 ← 本文件
docs/SPEC.md              ← 技术规格：架构、交互清单、数据模型、性能、部署、里程碑
docs/ILLUSTRATION_GUIDE.md← 插画风格总纲、GPT prompt 模板、尺寸规格、处理流水线
data/sites.json           ← 潜点数据（中英双语，带 sources / verified）
data/species.json         ← 物种清单（id → 中英名、贴纸文件、体型等级）
data/regions.json         ← 区域（用于聚合气泡与筛选）
public/geo/               ← 生成的底图 TopoJSON（由 scripts/build-geo.sh 产出）
public/sprites/           ← 处理好的贴纸 WebP（由 scripts/process-sprites.py 产出）
src/lib/projection.ts     ← 投影、fit、格陵兰 unwrap
src/lib/i18n.ts           ← 语言切换与文案字典
src/lib/stores.ts         ← 全局状态（lang / month / selectedSite / speciesFilter）+ URL 同步
src/components/MapView.svelte  ← 地图主体（底图、光晕、标记、缩放）
src/components/SiteCard.svelte ← 潜点详情卡（桌面侧栏 / 手机底部抽屉）
scripts/                  ← 构建数据与素材的脚本，不进 bundle
art/raw/                  ← GPT 原始出图（gitignore，体积大）
```

## 代码约定

- Svelte 5 组件；全局状态用 `svelte/store`（简单、可测），组件内局部状态可用 runes。
- 不引入整个 `d3`，只按需引入 `d3-geo` / `d3-zoom` / `d3-selection`。
- 组件不直接 fetch 数据；数据通过 `import` JSON 或 `src/lib/data.ts` 统一加载。
- 样式：全局 CSS 变量（`src/app.css` 的 `:root`），组件内用 scoped style；主题（日/夜）只改变量。
- 新增文案：同时加 zh/en，key 用 `camelCase`，分组前缀如 `card.waterTemp`。
- 提交信息：`feat: …` / `fix: …` / `data: …` / `art: …` / `docs: …`。

## 工作方式

- 大于一个文件的改动先给计划再动手；涉及硬约束的改动先问。
- 不确定的地理/物种/季节事实不要编，标 `verified: false` 并在 `sources` 留空待补。
- 改地图渲染后在 375px 和 1280px 两个宽度各截图确认一次。

## 已定决策（2026-10-20）

- **v1 必含**：中英切换、可分享 URL、我的足迹（潜过 / 想去）、带二维码的分享海报（SPEC §6.1 #10–#11）。**2026-10-22 取消"查看朋友足迹"模式**：二维码与分享链接只是站点地址，没人想导入别人的足迹。
- **只保留日间主题（2026-10-22）**：日 / 夜在生物贴纸上没有区分度，主题按钮已撤，夜间 token 留在 `app.css` 备用；分享海报刻意用深色夜潜风与浅色界面形成对比。
- **出图**：ChatGPT Plus 的 Images 2.5（与聊天模型选择无关）；默认灰底 + rembg；prompt 与批次计划在 `docs/ILLUSTRATION_GUIDE.md`，色板参考图 `art/palette-swatch.png`。
- **托管（两步走）**：先买短 `.com`（DNSPod 解析，CNAME 到 GitHub Pages），二维码只印自有域名；上线后分运营商实测，电信 / 移动成功率 < 80% 才加香港轻量服务器；不做大陆托管 / 备案（SPEC §9）。
- **底图视觉（已实现 2026-10-20）**：日间 = 印刷图集、夜间 = 夜潜，一套 SVG 结构（合并海岸线 + `<use>` 四次描边、海域名 `data/labels.json`、静态图框 / 罗盘 / 颗粒），差异全在 `app.css` 的 token 和 `data-theme` 显隐；右上角按钮切换主题。设计稿与来源在 `docs/map-style-candidates/`，规范见 SPEC §5。
- **中文名规则（已定）**：看得懂优先于学名；潜点用通行译名 + 括号俚语（马拉帕斯夸（妈妈岛））；现象类保留"风暴"；海豚 / 海狮用泛称；鹰鳐不用雪花鸭嘴燕魟。详见 ILLUSTRATION_GUIDE §3.4。

## 当前状态（2026-10-20）

- [x] 规格与插画规范（docs/，0.2 版）
- [x] 脚手架：地图渲染、中英切换、月份筛选、潜点卡片、URL 同步（单一 derived 订阅、保留 hash、无效 site 忽略）、复制链接带 execCommand 回退、Escape / 点海面关卡片、`check:dist` 零外链与体积门禁、GitHub Pages 工作流（`BASE_PATH` 仓库变量可切自定义域名）；git 已初始化，首次提交 `954a18f`；首屏 ≈ 116 KB gzip
- [x] 底图数据：`public/geo/countries.topo.json` 已生成（Natural Earth 10m CHN POV，简化 3%，160 KB / gzip 48 KB），1280 与 375 宽度预览已确认投影与格陵兰正常
- [x] 贴纸流水线本机验证通过（uv + Python 3.13 + rembg）
- [x] 贴纸 B1（鲸鲨 / 礁蝠鲼 / 绿海龟 / 海蛞蝓）已出图、验收、入库，**冻结为后续批次的参考图**（`art/raw/batch-01/grid.png`）；统一加 `--outline 2.5` 米白刀模边；地图贴纸按 `species.lengthM` 对数缩放
- [x] 贴纸 B1–B13：52 个物种中 51 个已有贴纸（玻璃鱼群待第二波数据后凑 B14），全部 `--outline 2.5`、体积达标；B12 布氏鲸、B13 硬珊瑚、B09 护士鲨建议局部重画（指令在 `art/prompts/出图教程-B8-B13.md`）；D1–D2 装饰未画
- [x] 底图风格重设计落地：日 / 夜主题、海域名、图框罗盘；1280 与 375、日夜四种组合已在浏览器确认；顺带修了 zoom 重建弹回、深链接被抽屉遮挡、`role="img"`、`color-mix` 等缺陷
- [x] 足迹 + "潜水星图"海报 + 二维码（SPEC §6.1 #10–#11，2026-10-22 v3）：`share-image.ts`（按需加载块，含 lean-qr）1080×1920 炭黑金色海报：经纬网星图裁到标记范围、金色光点 + 最近邻样条航迹、灰色参照潜点、四个数字（潜点 / 国家 / 物种 / 公里跨度 = 最大两两大圆距离）、标本录（目击过的物种按稀有度排序，◆ 标记）、"你潜过几个？" + 纯站点地址二维码；`ranks.ts` 16 级称号（score = 潜点 + 3·国家 + 2·区域 + 公里/800，前缀 = 占 ≥ 60% 的区域名 / 跨洋 / 环球）；生成前要求输入名字（`dive-atlas:name`，可跳过）；`FootprintPanel.svelte` 每行带物种缩略图、显示等级与称号。**真机未测**：微信长按保存 / 识别二维码、低端安卓渲染耗时
- [x] 手机放大与重叠点击（2026-10-22）：最大缩放 24×，超过 6× 时按需加载 `public/geo/countries-detail.topo.json`（`npm run geo -- --detail`，141 KB gzip，不计首屏）；标签文字算作点击目标，圆点命中 32 px；点到重叠的多个潜点弹出就地选择列表（`map.nearbySites`）。仙本那几个点现实中只隔 3–5 km，24× 下仍需列表，马萨阿拉姆一带已可逐个点到
- [x] 默认地球视图 + 月份收起（2026-10-22）：`mapView` 默认 globe（URL 只在平面图时写 `view=atlas`），手机上地球开屏填满 92% 屏宽、居中东南亚；工具栏只留一个月份胶囊（全年或所选月），点开才展开 12 个月
- [x] 物种稀有度 + 目击（2026-10-22）：`species.rarity` 四档 普通 40 / 珍稀 26 / 史诗 12 / 传说 8（按"普通行程里碰到的难度"判，校验脚本强制）；物种面板有"目击过"按钮，写入 `footprint.seen`；海报标本录只列目击过的
- [x] 体积：物种简介已并入 `virtual:site-details` 懒加载块（vite 插件剥离 `blurb`），海报与 lean-qr 为按需加载块；主 JS ≈ 102 KB gzip、首屏 ≈ 151 KB、详情块 145 KB、高精度底图 141 KB（均按需）
- [x] v1 潜点数据（2026-10-21）：**320 个潜点**、86 个物种、11 个区域。前两波按区域手写 brief 做深度研究（慢、漏点）；第三波 136 个改为"枚举清单型来源 → `scripts/select-candidates.mjs` 自动入选 → 每潜点 ≤ 2 次搜索的补全 → `data:validate` 内的脚本地理校验"，23 分钟 + 15 分钟跑完。`verified:false` 的在 UI 显示"待核实"；研究 agent 一律 Opus 5.5（研究 max、代码 xhigh）
- [x] 区域聚合气泡（SPEC §6.1 #13）：桌面 < 1.6x、窄屏 < 2.6x 且区域可见潜点 ≥ 3 时折叠为"区域色外环 + 当季数 + 区域名"的气泡，点击缩放到该区域；稀疏区域仍显示单个贴纸
- [x] 分级缩放第二层（2026-10-21）：气泡拆开后，互相压住超过 40% 半径的贴纸按"选中 > 当季 > 已核实 > 有贴纸 > 体型大"贪心保留，其余画成 6 px 圆点（仍可点、保留足迹色与月份变暗），地球转动中冻结；珊瑚三角 2.5× 从 173 张叠贴纸变 58 张 + 120 点。可选后续：同物种在近处重复时降权，避免一屏全是鲸鲨
- [x] 地球模式（2026-10-21，SPEC §5.5、§6.1 #14）：工具栏地球按钮、`?view=globe` + `localStorage dive-atlas:view`、MapView 内切模式（d3-zoom 事件改读为旋转 / 中心缩放）、大圆飞行、运动 LOD（旋转中隐藏 s1–s3，飞行中再隐藏 s4 与海名，抽稀陆地 `landLo`）；无头自检 `npm run preview:map 375 700 night globe` 会在有潜点落在圆盘外时报错。6× 慢 CPU 模拟：拖动达标，搜索飞行因开卡那一帧 83 ms 略超，**真机 / 微信未测**
- [x] 搜索（中文 / 英文 / 拼音 / 国家）：工具栏放大镜 → `SearchPanel.svelte`，选中后 `openSite()` 飞到潜点；`pinyin` 字段由 `npm run data:pinyin` 生成并被校验脚本要求；`?sp=` 物种筛选现在有可关闭的芯片
- [x] 贴纸落地准备：`spriteUrl()` 只对 `public/sprites/manifest.json` 里有的贴纸返回地址（没画的不再 404），地图贴纸尺寸按 `sizeClass` 48/40/32/24 px
- [x] 域名与托管（2026-10-22）：`veetsin.com` 裸域 A 记录 + www CNAME（阿里云 DNS）→ GitHub Pages（仓库 `veetsin/dive-atlas`，Actions 构建，`BASE_PATH` 变量 = `/`，`public/CNAME`）；证书已签发并强制 HTTPS，http 与 www 均 301 到 https://veetsin.com。推送 main 即部署
- [ ] 国内实测：三网打开速度、微信扫码与长按保存海报、低端安卓的地球拖动与海报渲染
- 下一步见 `docs/SPEC.md` §11 里程碑
