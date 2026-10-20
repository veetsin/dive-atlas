# Dive Atlas（潜图）

中英双语、可交互的插画风世界潜点地图。静态站点，部署在 GitHub Pages，面向中国大陆可访问。
`dive-atlas` 是代号，正式名称待定。

An interactive, bilingual (zh/en), illustrated world dive map. Static site for GitHub Pages, built to load from mainland China.

## 快速开始

```bash
npm install
npm run geo          # 下载 Natural Earth（中国视角）并生成底图 TopoJSON
npm run dev          # http://localhost:5173
```

其他命令：`npm run check`（类型检查）· `npm run data:validate`（数据校验）· `npm run build` · `npm run preview`

## 用 Claude Code 开发

项目的上下文在 `CLAUDE.md`（每次会话自动读取）和 `docs/SPEC.md`（完整规格）。在仓库根目录启动 Claude Code 后，可以直接说：

> 读一下 docs/SPEC.md，然后从 M1（底图成型）开始。

## 目录

| 路径 | 内容 |
|---|---|
| `CLAUDE.md` | 项目记忆：硬约束、命令、约定、当前状态 |
| `docs/SPEC.md` | 技术规格：架构、交互、数据模型、性能、部署、里程碑 |
| `docs/ILLUSTRATION_GUIDE.md` | 插画风格总纲、GPT prompt 模板、尺寸、处理流水线 |
| `data/` | 潜点 / 物种 / 区域数据（JSON，中英双语，带来源） |
| `src/` | Svelte 5 + TypeScript 前端 |
| `scripts/` | 底图生成、数据校验、拼音生成、贴纸处理 |
| `public/geo/`、`public/sprites/` | 生成产物（底图、贴纸） |

## 数据与版权

- 底图：Natural Earth（公有领域），中国视角（CHN point-of-view）版本。
- 潜点数据由项目自行整理，每条带 `sources`；`verified: false` 的条目在页面上标"待核实"。
- 插画为原创（GPT 生成 + 后处理）；不使用任何第三方品牌、logo 或既有地图的插画元素。

## 许可

代码：MIT。数据与插画：CC BY 4.0（待定）。
