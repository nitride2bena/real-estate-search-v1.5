// 매물 API 목업 서버 (POST /api/v1/properties/count, /search)
// - 읍면동 코드를 시드로 결정론적 가짜 매물을 생성 (새로고침해도 동일)
// - 네트워크 지연 + AbortController 취소를 그대로 재현
import { loadTopology } from "./regions";
import { SQM_PER_PYEONG, ZONING } from "../domain/constants";

export interface Range {
  min: number | null;
  max: number | null;
}

export interface CountRequest {
  /** 3단계에서 일부만 선택된 시군구의 읍면동 코드(8자리) */
  eupmyeondong_codes: string[];
  /** (확장) 전체 선택 상태인 시군구 코드 — 수천 개 동 코드 전송을 피하기 위한 압축 표현 */
  sigungu_codes: string[];
  /** (확장) 하위 시군구를 고르지 않은 시도 코드 — 시도 전체 */
  sido_codes: string[];
  trade_type: "SALE" | "JEONSE" | "MONTHLY" | null;
  land_area_sqm: Range | null;
  building_area_sqm: Range | null;
  zoning_codes: string[];
  building_uses: string[];
  price_range: Range | null;
  monthly_rent_range: Range | null;
  pyeong_price_range: Range | null;
}

export interface Property {
  property_id: number;
  bjd_code: string; // 8자리 읍면동 코드
  emd_name: string;
  address: string;
  land_area_sqm: number;
  building_area_sqm: number;
  land_use_zones: string[];
  building_main_use: string;
  trade_type: "SALE" | "JEONSE" | "MONTHLY";
  price: number;
  monthly_rent: number;
  price_per_pyeong: number;
}

export interface CountResponse {
  total_count: number;
  clusters: { bjd_code: string; count: number }[];
}

// ---------- 결정론적 난수 ----------
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
function pick<T>(r: () => number, arr: readonly T[], weights?: number[]): T {
  if (!weights) return arr[Math.floor(r() * arr.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < arr.length; i++) {
    x -= weights[i];
    if (x <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

const METRO = new Set(["11", "26", "27", "28", "30", "31"]);
const zoneByGroup = Object.fromEntries(ZONING.map((g) => [g.key, g.items.map((i) => i.code)]));

const bySido = new Map<string, Promise<Property[]>>();

function generateForEmd(code: string, name: string, sigunguName: string): Property[] {
  const seed = hash(code);
  const r = rng(seed);
  const sido = code.slice(0, 2);
  const metro = METRO.has(sido);
  const n = Math.floor(r() * (metro ? 40 : 28)) + (metro ? 8 : 2);
  const out: Property[] = [];
  const priceLevel = metro ? 2.2 + r() * 2.5 : 0.25 + r() * 1.2; // 평당 천만원 단위 지수
  const baseId = (Number(code) || (seed % 90_000_000)) * 100;
  for (let i = 0; i < n; i++) {
    const groupKey = metro
      ? pick(r, ["R", "C", "I", "G"], [62, 22, 8, 8])
      : pick(r, ["R", "C", "I", "G", "M", "A", "N"], [20, 6, 6, 14, 30, 18, 6]);
    const zones = [pick(r, zoneByGroup[groupKey])];
    if (r() < 0.12) {
      const extra = pick(r, zoneByGroup[pick(r, ["R", "G", "M"])]);
      if (!zones.includes(extra)) zones.push(extra);
    }

    const rural = ["M", "A", "N", "G"].includes(groupKey);
    const land = Math.round(Math.exp((rural ? 6.3 : 5.0) + r() * (rural ? 2.4 : 1.8)));
    const bare = rural ? r() < 0.55 : r() < 0.12;
    const use = bare
      ? "00000"
      : groupKey === "R"
        ? pick(r, ["01000", "02000", "03000", "04000"], [35, 30, 18, 17])
        : groupKey === "C"
          ? pick(r, ["03000", "04000", "07000", "14000", "15000"], [25, 30, 15, 20, 10])
          : groupKey === "I"
            ? pick(r, ["17000", "18000", "04000"], [60, 30, 10])
            : pick(r, ["01000", "18000", "21000", "17000", "04000"], [35, 20, 20, 15, 10]);
    const bldg = bare ? 0 : Math.round(land * (0.3 + r() * 1.8));
    const pyeong = land / SQM_PER_PYEONG;
    const ppp = Math.max(30, Math.round(priceLevel * 1000 * (0.5 + r()) * (rural ? 0.35 : 1))); // 만원/평
    const sale = Math.round((pyeong * ppp) / 100) * 100;

    const trade = pick(r, ["SALE", "JEONSE", "MONTHLY"] as const, bare ? [92, 2, 6] : [50, 20, 30]);
    let price = sale;
    let rent = 0;
    if (trade === "JEONSE") price = Math.round((sale * (0.45 + r() * 0.25)) / 100) * 100;
    if (trade === "MONTHLY") {
      price = Math.round(Math.max(100, sale * (0.03 + r() * 0.07)) / 100) * 100;
      rent = Math.max(10, Math.round((sale * (0.0025 + r() * 0.002)) / 5) * 5);
    }
    out.push({
      property_id: baseId + i + 1,
      bjd_code: code,
      emd_name: name,
      address: `${sigunguName} ${name} ${Math.floor(r() * 900) + 1}${r() < 0.6 ? `-${Math.floor(r() * 30) + 1}` : ""}`,
      land_area_sqm: land,
      building_area_sqm: bldg,
      land_use_zones: zones,
      building_main_use: use,
      trade_type: trade,
      price,
      monthly_rent: rent,
      price_per_pyeong: Math.round(price / pyeong),
    });
  }
  return out;
}

function propertiesOfSido(sido: string): Promise<Property[]> {
  let p = bySido.get(sido);
  if (!p) {
    p = Promise.all([loadTopology(`emd/${sido}.json`), loadTopology(`sigungu/${sido}.json`)]).then(([emds, sggs]) => {
      const sggName = new Map(sggs.map((f) => [f.properties.code, f.properties.name]));
      return emds.flatMap((f) =>
        generateForEmd(f.properties.code, f.properties.name, sggName.get(f.properties.sigungu ?? "") ?? ""),
      );
    });
    p.catch(() => bySido.delete(sido));
    bySido.set(sido, p);
  }
  return p;
}

function inRange(v: number, r: Range | null) {
  if (!r) return true;
  if (r.min != null && v < r.min) return false;
  if (r.max != null && v > r.max) return false;
  return true;
}

async function query(req: CountRequest): Promise<Property[]> {
  const sidos = new Set<string>([
    ...req.sido_codes,
    ...req.sigungu_codes.map((c) => c.slice(0, 2)),
    ...req.eupmyeondong_codes.map((c) => c.slice(0, 2)),
  ]);
  const all = (await Promise.all([...sidos].map(propertiesOfSido))).flat();
  const sidoSet = new Set(req.sido_codes);
  const sggSet = new Set(req.sigungu_codes);
  const emdSet = new Set(req.eupmyeondong_codes);
  const zoneSet = new Set(req.zoning_codes);
  const useSet = new Set(req.building_uses);
  return all.filter((p) => {
    const c = p.bjd_code;
    if (!(sidoSet.has(c.slice(0, 2)) || sggSet.has(c.slice(0, 5)) || emdSet.has(c))) return false;
    if (req.trade_type && p.trade_type !== req.trade_type) return false;
    if (!inRange(p.land_area_sqm, req.land_area_sqm)) return false;
    if (!inRange(p.building_area_sqm, req.building_area_sqm)) return false;
    if (zoneSet.size && !p.land_use_zones.some((z) => zoneSet.has(z))) return false;
    if (useSet.size && !useSet.has(p.building_main_use)) return false;
    if (!inRange(p.price, req.price_range)) return false;
    if (req.trade_type === "MONTHLY" && !inRange(p.monthly_rent, req.monthly_rent_range)) return false;
    if (!inRange(p.price_per_pyeong, req.pyeong_price_range)) return false;
    return true;
  });
}

function latency(signal?: AbortSignal, ms = 120 + Math.random() * 280): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/** POST /api/v1/properties/count */
export async function postCount(req: CountRequest, signal?: AbortSignal): Promise<CountResponse> {
  const [rows] = await Promise.all([query(req), latency(signal)]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const m = new Map<string, number>();
  for (const p of rows) m.set(p.bjd_code, (m.get(p.bjd_code) ?? 0) + 1);
  return { total_count: rows.length, clusters: [...m].map(([bjd_code, count]) => ({ bjd_code, count })) };
}

/** POST /api/v1/properties/search */
export async function postSearch(req: CountRequest, limit = 100, signal?: AbortSignal) {
  const [rows] = await Promise.all([query(req), latency(signal, 250)]);
  const sorted = [...rows].sort((a, b) => a.price_per_pyeong - b.price_per_pyeong);
  return { total_count: rows.length, items: sorted.slice(0, limit) };
}
