// DRD 2.1 — 12색 고대비 표준 팔레트
export const PALETTE = [
  "#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#DB2777",
  "#0891B2", "#4F46E5", "#65A30D", "#EA580C", "#0D9488", "#9333EA",
] as const;

export const SQM_PER_PYEONG = 3.305785;

// FR-14 — 동시 렌더링 폴리곤 상한선
export const LOD_LIMIT = { mobile: 150, desktop: 500 } as const;

export const KOREA_BOUNDS: [number, number, number, number] = [124.6, 33.1, 131.0, 38.65];

export type TradeType = "ALL" | "SALE" | "JEONSE" | "MONTHLY";

export const TRADE_TYPES: { value: TradeType; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "SALE", label: "매매" },
  { value: "JEONSE", label: "전세" },
  { value: "MONTHLY", label: "월세" },
];

export const TRADE_LABEL: Record<Exclude<TradeType, "ALL">, string> = {
  SALE: "매매",
  JEONSE: "전세",
  MONTHLY: "월세",
};

/** 국토교통부 표준 법정동 시도 코드(2자리) → 단축 시·도 명칭 맵 (sido.json v20261001 12/51/52 및 구코드 29/42/45/46 하위호환 포함) */
export const SIDO_NAME_MAP: Record<string, string> = {
  "11": "서울",
  "12": "전남광주",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
  "51": "강원",
  "52": "전북",
};

/** 통합 코드 `12` 내 광주광역시 자치구 시·군·구 코드(5자리) */
export const GWANGJU_SIGUNGU_CODES = new Set([
  "12210", // 동구
  "12240", // 서구
  "12270", // 남구
  "12300", // 북구
  "12330", // 광산구
]);

const GWANGJU_SIGUNGU_NAMES = new Set(["광산구", "남구", "동구", "북구", "서구"]);

/**
 * 법정동(8/10자리)·시군구(5자리)·시도(2자리) 코드와 선택적 주소 힌트로 시·도 약칭을 반환합니다.
 * 통합 코드 `12`(전남광주)는 시군구 코드(12210~12330) 또는 주소 힌트로 "광주" vs "전남"을 판별합니다.
 */
export function getSidoShortName(bjdOrSidoCode: string, addressHint?: string): string {
  const code = (bjdOrSidoCode ?? "").trim();
  const sidoCode = code.slice(0, 2);
  if (!sidoCode) return "";
  if (sidoCode !== "12") return SIDO_NAME_MAP[sidoCode] ?? "";

  if (code.length >= 5) {
    const sggCode = code.slice(0, 5);
    if (GWANGJU_SIGUNGU_CODES.has(sggCode)) return "광주";
    const numeric = Number(sggCode);
    if (Number.isInteger(numeric) && numeric >= 12210 && numeric <= 12330) return "광주";
    return "전남";
  }

  const hint = (addressHint ?? "").trim();
  if (hint) {
    if (hint.startsWith("전남광주")) return "전남광주";
    if (hint.includes("전남") || hint.includes("전라남도")) return "전남";
    if (hint.includes("광주")) return "광주";
    const firstToken = hint.split(/\s+/)[0] ?? "";
    if (GWANGJU_SIGUNGU_NAMES.has(firstToken)) return "광주";
    return "전남";
  }

  return SIDO_NAME_MAP["12"];
}

// FR-06 — 국토계획법 용도지역 7대 대분류 + 세분류 (토지이음 용도지역 코드 체계)
export interface ZoneGroup {
  key: string;
  label: string;
  items: { code: string; label: string }[];
}

export const ZONING: ZoneGroup[] = [
  {
    key: "R", label: "주거지역",
    items: [
      { code: "UQA111", label: "제1종전용주거" },
      { code: "UQA112", label: "제2종전용주거" },
      { code: "UQA121", label: "제1종일반주거" },
      { code: "UQA122", label: "제2종일반주거" },
      { code: "UQA123", label: "제3종일반주거" },
      { code: "UQA130", label: "준주거" },
    ],
  },
  {
    key: "C", label: "상업지역",
    items: [
      { code: "UQA210", label: "중심상업" },
      { code: "UQA220", label: "일반상업" },
      { code: "UQA230", label: "근린상업" },
      { code: "UQA240", label: "유통상업" },
    ],
  },
  {
    key: "I", label: "공업지역",
    items: [
      { code: "UQA310", label: "전용공업" },
      { code: "UQA320", label: "일반공업" },
      { code: "UQA330", label: "준공업" },
    ],
  },
  {
    key: "G", label: "녹지지역",
    items: [
      { code: "UQA410", label: "보전녹지" },
      { code: "UQA420", label: "생산녹지" },
      { code: "UQA430", label: "자연녹지" },
    ],
  },
  {
    key: "M", label: "관리지역",
    items: [
      { code: "UQB100", label: "보전관리" },
      { code: "UQB200", label: "생산관리" },
      { code: "UQB300", label: "계획관리" },
    ],
  },
  { key: "A", label: "농림지역", items: [{ code: "UQC001", label: "농림지역" }] },
  { key: "N", label: "자연환경보전", items: [{ code: "UQD001", label: "자연환경보전지역" }] },
];

export const ZONE_LABEL: Record<string, string> = Object.fromEntries(
  ZONING.flatMap((g) => g.items.map((i) => [i.code, i.label])),
);

// 건축물대장 주용도 코드
export const BUILDING_USES: { code: string; label: string }[] = [
  { code: "00000", label: "나대지(건물없음)" },
  { code: "01000", label: "단독주택" },
  { code: "02000", label: "공동주택" },
  { code: "03000", label: "제1종근생" },
  { code: "04000", label: "제2종근생" },
  { code: "07000", label: "판매시설" },
  { code: "10000", label: "교육연구" },
  { code: "14000", label: "업무시설" },
  { code: "15000", label: "숙박시설" },
  { code: "17000", label: "공장" },
  { code: "18000", label: "창고시설" },
  { code: "21000", label: "동식물관련" },
];

export const BUILDING_USE_LABEL: Record<string, string> = Object.fromEntries(
  BUILDING_USES.map((b) => [b.code, b.label]),
);

// 비선형 슬라이더 눈금
export const TICKS = {
  price: [0, 1000, 3000, 5000, 7000, 10000, 15000, 20000, 30000, 50000, 70000, 100000, 150000, 200000, 300000, 500000],
  deposit: [0, 100, 300, 500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000],
  rent: [0, 10, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000],
  sqm: [0, 33, 66, 100, 165, 330, 500, 660, 1000, 1650, 3300, 5000, 10000, 33000],
  pyeong: [0, 10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, 1500, 3000, 10000],
};

export function formatMoney(manwon: number): string {
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rest = Math.round(manwon % 10000);
    return rest ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${Math.round(manwon).toLocaleString()}만`;
}
