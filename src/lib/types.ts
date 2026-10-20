export type Lang = 'zh' | 'en';
export type LocalizedText = Record<Lang, string>;

/** Longitude/latitude pair, GeoJSON order. */
export type LonLat = [number, number];

export type DiveLevel = 'OW' | 'AOW' | 'Tech';
export type DiveType =
  | 'reef'
  | 'wall'
  | 'drift'
  | 'wreck'
  | 'cave'
  | 'muck'
  | 'pelagic'
  | 'coldwater'
  | 'kelp';
export type Access = 'shore' | 'boat' | 'liveaboard';
export type SizeClass = 'xl' | 'l' | 'm' | 's';

export interface DiveSite {
  id: string;
  name: LocalizedText;
  pinyin?: string;
  country: LocalizedText;
  region: string;
  coords: LonLat;
  /** 1–12; empty array means year-round. */
  bestMonths: number[];
  species: string[];
  level: DiveLevel;
  types: DiveType[];
  access: Access[];
  waterTempC: [number, number];
  visibilityM: [number, number];
  summary: LocalizedText;
  highlights?: LocalizedText[];
  sources: string[];
  verified: boolean;
  notes?: string;
  updatedAt?: string;
}

export interface Species {
  id: string;
  name: LocalizedText;
  sci?: string;
  sprite: string;
  sizeClass: SizeClass;
  /** Typical adult length in metres (for schools: the size of the school as seen); drives sprite size on the map. */
  lengthM?: number;
  tags?: string[];
}

export interface Region {
  id: string;
  name: LocalizedText;
  center: LonLat;
  color: string;
}

/** Ocean / sea name drawn on the base map (data/labels.json). */
export interface SeaLabel {
  id: string;
  /** 1 = oceans (always shown), 2 = major seas, 3 = minor seas (zoomed in only). */
  tier: 1 | 2 | 3;
  name: LocalizedText;
  /** Anchor in open water, [lon, lat]. */
  at: LonLat;
  /** Optional baseline direction for elongated seas, two [lon, lat] points. */
  along?: [LonLat, LonLat];
}
