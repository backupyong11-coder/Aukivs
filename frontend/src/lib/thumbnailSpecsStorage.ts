/**
 * 플랫폼별 썸네일 규격 — 편집 가능 대시보드 + localStorage
 */

export type ThumbnailSpecItem = {
  id: string;
  category: string;
  size: string;
  note?: string;
};

export type ThumbnailPlatformBlock = {
  id: string;
  /** 표시명 (엑셀·UI) */
  name: string;
  /** 플랫폼정리 DB 행 id — platform_rows */
  platformRowId: string;
  specs: ThumbnailSpecItem[];
};

export type ThumbnailSpecsProfile = {
  version: 1;
  platforms: ThumbnailPlatformBlock[];
};

const STORAGE_KEY = "worksheet_thumbnail_specs_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function spec(category: string, size: string, note?: string): ThumbnailSpecItem {
  return { id: newId("spec"), category, size, ...(note ? { note } : {}) };
}

function platform(name: string, specs: ThumbnailSpecItem[]): ThumbnailPlatformBlock {
  return { id: newId("plat"), name, platformRowId: "", specs };
}

/** 엑셀「플랫폼별 썸네일 작업 사이즈」기준 초기 데이터 */
export function createDefaultThumbnailSpecsProfile(): ThumbnailSpecsProfile {
  return {
    version: 1,
    platforms: [
      platform("미툰", [
        spec("원고", "1080"),
        spec("대표 썸네일", "140 x 140", "성인·비성인 2종"),
        spec("대표 썸네일", "300 x 300", "성인·비성인 2종"),
        spec("대표 썸네일", "500 x 700", "모바일 단순"),
        spec("대표 썸네일", "548 x 652", "모바일 단순"),
        spec("대표 썸네일", "600 x 600", "성인·비성인 2종"),
        spec("대표 썸네일", "800 x 378", "성인·비성인 2종"),
        spec("대표 썸네일", "1280 x 520", "우측 여백"),
        spec("대표 썸네일", "1280 x 520", "좌측 여백"),
        spec("대표 일러스트", "2500 x 2500"),
        spec("배너 썸네일", "1920 x 410", "PC"),
        spec("배너 썸네일", "1046 x 410", "PC"),
        spec("배너 썸네일", "750 x 400", "모바일"),
        spec("회차별 썸네일", "504 x 245", "성인"),
        spec("회차별 썸네일", "504 x 245", "비성인"),
      ]),
      platform("왓챠", [
        spec("원고", "1080~1600", "세로 30000"),
        spec("로고", "1000 이상"),
        spec("대표 썸네일", "1920 x 1080"),
        spec("대표 썸네일", "2025 x 3000"),
        spec("회차별 썸네일", "1080 x 608"),
      ]),
      platform("무툰", [
        spec("원고", "1080"),
        spec("대표 썸네일", "720 x 720"),
        spec("대표 썸네일", "720 x 994"),
        spec("대표 썸네일", "720 x 360"),
      ]),
      platform("투믹스", [
        spec("원고", "720"),
        spec("대표 썸네일", "1920 x 2176"),
        spec("회차별 썸네일", "200 x 120"),
      ]),
      platform("리디북스", [
        spec("원고", "1080"),
        spec("대표 썸네일", "1500 x 2175", "성인 이미지 안 됨"),
        spec("회차별 표지", "720 x 1044"),
      ]),
      platform("북큐브", [
        spec("원고", "720"),
        spec("대표 썸네일", "500 x 700", "비성인 표지 · 450kb 미만"),
        spec("대표 썸네일", "600 x 600", "70kb 미만"),
        spec("대표 썸네일", "904 x 350", "70kb 미만"),
        spec("대표 썸네일", "640 x 320", "40kb 미만"),
        spec("회차 썸네일", "640 x 250", "40kb 미만"),
      ]),
    ],
  };
}

function normalizeSpecItem(raw: unknown): ThumbnailSpecItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    category: typeof o.category === "string" ? o.category : "규격",
    size: typeof o.size === "string" ? o.size : "",
    ...(typeof o.note === "string" && o.note ? { note: o.note } : {}),
  };
}

function normalizePlatform(raw: unknown): ThumbnailPlatformBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const specsRaw = o.specs;
  if (!Array.isArray(specsRaw)) return null;
  const specs: ThumbnailSpecItem[] = [];
  for (const s of specsRaw) {
    const item = normalizeSpecItem(s);
    if (item) specs.push(item);
  }
  return {
    id: o.id,
    name: o.name,
    platformRowId: typeof o.platformRowId === "string" ? o.platformRowId : "",
    specs,
  };
}

export function normalizeThumbnailSpecsProfile(raw: unknown): ThumbnailSpecsProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1) return null;
  const platformsRaw = p.platforms;
  if (!Array.isArray(platformsRaw)) return null;
  const platforms: ThumbnailPlatformBlock[] = [];
  for (const item of platformsRaw) {
    const block = normalizePlatform(item);
    if (block) platforms.push(block);
  }
  return { version: 1, platforms };
}

export function loadThumbnailSpecsProfile(): ThumbnailSpecsProfile {
  if (typeof window === "undefined") return createDefaultThumbnailSpecsProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultThumbnailSpecsProfile();
    return normalizeThumbnailSpecsProfile(JSON.parse(raw) as unknown) ?? createDefaultThumbnailSpecsProfile();
  } catch {
    return createDefaultThumbnailSpecsProfile();
  }
}

export function saveThumbnailSpecsProfile(profile: ThumbnailSpecsProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

/** "720 x 720" → "720x720" */
export function normalizeSizeKey(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toLowerCase().replace(/×/g, "x");
  const m = compact.match(/(\d+)\s*[x×]\s*(\d+)/i) ?? compact.match(/(\d+)x(\d+)/);
  if (!m) return null;
  return `${m[1]}x${m[2]}`;
}

export function parseDimensions(raw: string): { w: number; h: number } | null {
  const key = normalizeSizeKey(raw);
  if (!key) return null;
  const [w, h] = key.split("x").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

export type ThumbnailSpecGroupMember = {
  platformId: string;
  platformName: string;
  specId: string;
  category: string;
  sizeRaw: string;
  note?: string;
};

export type ThumbnailSpecGroup = {
  id: string;
  sizeKey: string;
  displaySize: string;
  members: ThumbnailSpecGroupMember[];
};

/** 동일·유사(같은 픽셀 크기) 규격을 묶음 — 2개 이상일 때만 그룹 */
export function computeSpecGroups(profile: ThumbnailSpecsProfile): ThumbnailSpecGroup[] {
  const map = new Map<string, ThumbnailSpecGroupMember[]>();
  for (const plat of profile.platforms) {
    for (const s of plat.specs) {
      const sizeKey = normalizeSizeKey(s.size);
      if (!sizeKey) continue;
      const list = map.get(sizeKey) ?? [];
      list.push({
        platformId: plat.id,
        platformName: plat.name,
        specId: s.id,
        category: s.category,
        sizeRaw: s.size,
        note: s.note,
      });
      map.set(sizeKey, list);
    }
  }
  const groups: ThumbnailSpecGroup[] = [];
  for (const [sizeKey, members] of map) {
    if (members.length < 2) continue;
    const [w, h] = sizeKey.split("x");
    groups.push({
      id: `grp-${sizeKey}`,
      sizeKey,
      displaySize: `${w} × ${h}`,
      members,
    });
  }
  groups.sort((a, b) => {
    const da = parseDimensions(a.displaySize);
    const db = parseDimensions(b.displaySize);
    if (!da || !db) return a.sizeKey.localeCompare(b.sizeKey);
    return da.w * da.h - db.w * db.h;
  });
  return groups;
}

export function computeThumbnailKpis(profile: ThumbnailSpecsProfile) {
  let specCount = 0;
  let linkedCount = 0;
  for (const p of profile.platforms) {
    specCount += p.specs.length;
    if (p.platformRowId) linkedCount += 1;
  }
  const groups = computeSpecGroups(profile);
  return {
    platformCount: profile.platforms.length,
    specCount,
    linkedCount,
    groupCount: groups.length,
  };
}

export { newId as thumbnailNewId };
