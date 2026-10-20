import { derived } from 'svelte/store';
import { lang } from './stores';
import type { Lang, LocalizedText } from './types';

/**
 * UI strings. Every user-visible string lives here, in both languages.
 * Data-driven text (site names, summaries) comes from the JSON files as {zh, en}.
 */
const dict = {
  'app.title': { zh: '潜图', en: 'Dive Atlas' },
  'app.subtitle': { zh: '世界潜点地图', en: 'World dive map' },
  'app.tagline': { zh: '按月份和物种，找下一个潜点', en: 'Find your next dive by month and species' },
  'nav.search': { zh: '搜索潜点', en: 'Search sites' },
  'search.placeholder': { zh: '中文 / 英文 / 拼音', en: 'Name, country or pinyin' },
  'search.empty': { zh: '没有匹配的潜点', en: 'No matching sites' },
  'filter.clear': { zh: '清除筛选', en: 'Clear filter' },
  'nav.lang': { zh: 'EN', en: '中文' },
  'theme.day': { zh: '日间', en: 'Day' },
  'theme.night': { zh: '夜潜', en: 'Night' },
  'compass.n': { zh: '北', en: 'N' },
  'tick.n': { zh: '北', en: 'N' },
  'tick.s': { zh: '南', en: 'S' },
  'tick.e': { zh: '东', en: 'E' },
  'tick.w': { zh: '西', en: 'W' },
  'month.all': { zh: '全年', en: 'All year' },
  'month.1': { zh: '1月', en: 'Jan' },
  'month.2': { zh: '2月', en: 'Feb' },
  'month.3': { zh: '3月', en: 'Mar' },
  'month.4': { zh: '4月', en: 'Apr' },
  'month.5': { zh: '5月', en: 'May' },
  'month.6': { zh: '6月', en: 'Jun' },
  'month.7': { zh: '7月', en: 'Jul' },
  'month.8': { zh: '8月', en: 'Aug' },
  'month.9': { zh: '9月', en: 'Sep' },
  'month.10': { zh: '10月', en: 'Oct' },
  'month.11': { zh: '11月', en: 'Nov' },
  'month.12': { zh: '12月', en: 'Dec' },
  'card.bestSeason': { zh: '最佳季节', en: 'Best season' },
  'card.yearRound': { zh: '全年可潜', en: 'Year-round' },
  'card.species': { zh: '明星物种', en: 'Signature species' },
  'card.waterTemp': { zh: '水温', en: 'Water temp' },
  'card.visibility': { zh: '能见度', en: 'Visibility' },
  'card.level': { zh: '证书要求', en: 'Level' },
  'card.types': { zh: '潜水类型', en: 'Dive types' },
  'card.access': { zh: '出行方式', en: 'Access' },
  'card.highlights': { zh: '看点', en: 'Highlights' },
  'card.sources': { zh: '资料来源', en: 'Sources' },
  'card.unverified': { zh: '待核实', en: 'Unverified' },
  'card.reference': { zh: '以上为参考值，出发前请与潜店确认', en: 'Reference values — confirm with your dive operator' },
  'card.copyLink': { zh: '复制链接', en: 'Copy link' },
  'card.copied': { zh: '已复制', en: 'Copied' },
  'card.longPressCopy': { zh: '复制失败，长按下面的链接手动复制', en: 'Copy blocked, long-press the link below to copy' },
  'card.close': { zh: '关闭', en: 'Close' },
  'map.loading': { zh: '地图加载中…', en: 'Loading map…' },
  'map.noGeo': {
    zh: '还没有底图数据，请先运行 npm run geo',
    en: 'No base map yet — run npm run geo first',
  },
  'map.sitesShown': { zh: '个潜点', en: 'sites' },
  'footprint.open': { zh: '足迹', en: 'Log' },
  'footprint.title': { zh: '我的足迹', en: 'My dive log' },
  'footprint.shareTitle': { zh: '我的潜水足迹', en: 'My dive footprint' },
  'footprint.dived': { zh: '潜过', en: 'Dived' },
  'footprint.wish': { zh: '想去', en: 'Want to go' },
  'footprint.none': { zh: '还没有标记，点开一个潜点卡片试试', en: 'Nothing marked yet, open a site card to start' },
  'footprint.share': { zh: '生成分享图', en: 'Make share image' },
  'footprint.rendering': { zh: '生成中…', en: 'Rendering…' },
  'footprint.shareFailed': { zh: '生成失败，请重试', en: 'Could not render the image, try again' },
  'footprint.saveHint': { zh: '长按图片保存，或发送给朋友', en: 'Long-press the image to save or send it' },
  'footprint.copyLink': { zh: '复制足迹链接', en: 'Copy footprint link' },
  'footprint.viewingBanner': { zh: '正在看朋友的足迹', en: "Viewing a friend's dive log" },
  'footprint.viewMine': { zh: '看我的', en: 'Show mine' },
  'footprint.adopt': { zh: '导入为我的足迹', en: 'Import as mine' },
  'footprint.adoptConfirm': { zh: '会覆盖你现在的足迹，继续？', en: 'This replaces your current log. Continue?' },
  'footprint.scanHint': { zh: '扫码看我的潜水足迹', en: 'Scan to see my dive map' },
  'footprint.privacy': { zh: '链接和分享图会显示你标记的潜点', en: 'The link and the image show the sites you mark' },
  'level.OW': { zh: '开放水域 OW', en: 'Open Water' },
  'level.AOW': { zh: '进阶 AOW', en: 'Advanced' },
  'level.Tech': { zh: '技术潜水', en: 'Technical' },
  'type.reef': { zh: '珊瑚礁', en: 'Reef' },
  'type.wall': { zh: '峭壁', en: 'Wall' },
  'type.drift': { zh: '放流', en: 'Drift' },
  'type.wreck': { zh: '沉船', en: 'Wreck' },
  'type.cave': { zh: '洞穴', en: 'Cave' },
  'type.muck': { zh: '微距', en: 'Muck' },
  'type.pelagic': { zh: '大洋 / 大货', en: 'Pelagic' },
  'type.coldwater': { zh: '冷水', en: 'Cold water' },
  'type.kelp': { zh: '海藻林', en: 'Kelp' },
  'access.shore': { zh: '岸潜', en: 'Shore' },
  'access.boat': { zh: '船潜', en: 'Boat' },
  'access.liveaboard': { zh: '船宿', en: 'Liveaboard' },
  'footer.data': { zh: '数据来源见各潜点卡片 · 底图：Natural Earth', en: 'Sources on each site card · Base map: Natural Earth' },
} satisfies Record<string, LocalizedText>;

export type I18nKey = keyof typeof dict;

export function translate(key: I18nKey, l: Lang): string {
  return dict[key][l];
}

/** `$t('card.waterTemp')` in components — re-renders on language change. */
export const t = derived(lang, ($lang) => (key: I18nKey) => translate(key, $lang));

/** Pick one language from a {zh, en} object. */
export const tx = derived(lang, ($lang) => (text: LocalizedText | undefined) => text?.[$lang] ?? '');

export const MONTH_KEYS = [
  'month.1', 'month.2', 'month.3', 'month.4', 'month.5', 'month.6',
  'month.7', 'month.8', 'month.9', 'month.10', 'month.11', 'month.12',
] as const satisfies readonly I18nKey[];
