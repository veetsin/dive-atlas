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
- `npm run data:validate` 校验 `data/*.json`（字段、坐标范围、物种引用、来源）
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

- **v1 必含**：中英切换、可分享 URL、我的足迹（潜过 / 想去）、带二维码的分享图、足迹查看模式（SPEC §6.1 #10–#12，§3.4 URL 契约 `d`/`w`）。
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
- [ ] 贴纸 B2–B7、D1–D2：按 §3.3 继续（现在 43 个物种里只有 4 个有贴纸，其余显示圆点）
- [x] 底图风格重设计落地：日 / 夜主题、海域名、图框罗盘；1280 与 375、日夜四种组合已在浏览器确认；顺带修了 zoom 重建弹回、深链接被抽屉遮挡、`role="img"`、`color-mix` 等缺陷
- [x] 足迹 + 分享图 + 二维码（SPEC §6.1 #10–#12）：`stores.ts` 的 `footprint` / `viewing` 与位图编解码、`share-image.ts`（Canvas2D + lean-qr）、`FootprintPanel.svelte`、`data/footprint-index.json`；浏览器里已验证标记、分享图、`?d=&w=` 查看模式不落盘、导入覆盖。**真机未测**：微信长按保存 / 识别二维码、低端安卓渲染耗时
- [ ] v1 潜点数据：**目标 ≥ 200 个**（用户要求不少于参考图）。2026-10-21 第一波已合并 43 个（东南亚 / 红海 / 澳新 / 美洲，34 个已核实，含来源与维护 notes）；珊瑚三角、东亚、印度洋、太平洋、大西洋/极地 5 个区域因额度中断待续跑（workflow `wf_7dc44019-bfe` 可 resume），之后再跑第二波补到 200+。物种中文名策略见 ILLUSTRATION_GUIDE §3.4。**200 个潜点前必须先做区域聚合气泡（SPEC §6.2 #10），否则世界视图挤成一团**
- [x] 区域聚合气泡（SPEC §6.1 #13）：桌面 < 1.6x、窄屏 < 2.6x 且区域可见潜点 ≥ 3 时折叠为"区域色外环 + 当季数 + 区域名"的气泡，点击缩放到该区域；稀疏区域仍显示单个贴纸
- [ ] 地球模式（可拖动旋转的正射投影，日/夜）：已评估可行，d3-geo 自带、零新依赖；效果预览见 `preview/map-style-candidates/globe-preview.png`；排在聚合气泡之后
- [x] 搜索（中文 / 英文 / 拼音 / 国家）：工具栏放大镜 → `SearchPanel.svelte`，选中后 `openSite()` 飞到潜点；`pinyin` 字段由 `npm run data:pinyin` 生成并被校验脚本要求；`?sp=` 物种筛选现在有可关闭的芯片
- [x] 贴纸落地准备：`spriteUrl()` 只对 `public/sprites/manifest.json` 里有的贴纸返回地址（没画的不再 404），地图贴纸尺寸按 `sizeClass` 48/40/32/24 px
- [ ] 买域名 → 托管拍板 → 国内实测：三网测速 + 微信扫码打开
- 下一步见 `docs/SPEC.md` §11 里程碑
