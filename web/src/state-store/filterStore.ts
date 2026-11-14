import { create } from "zustand";
import type { TradeType } from "../domain/constants";
import type { CountRequest, CountResponse, Range } from "../api/mockServer";
import type { RegionQuery } from "./regionStore";

export type AreaUnit = "sqm" | "pyeong";

export interface FilterState {
  tradeType: TradeType;
  price: Range; // 매매가 또는 보증금 (만원)
  rent: Range; // 월차임 (만원)
  pyeongPrice: Range; // 평당 단가 (만원/평)
  landArea: Range; // ㎡
  buildingArea: Range; // ㎡
  landUnit: AreaUnit;
  buildingUnit: AreaUnit;
  zoning: string[];
  buildingUses: string[];
}

const anyRange = (): Range => ({ min: null, max: null });

export const initialFilters: FilterState = {
  tradeType: "ALL",
  price: anyRange(),
  rent: anyRange(),
  pyeongPrice: anyRange(),
  landArea: anyRange(),
  buildingArea: anyRange(),
  landUnit: "sqm",
  buildingUnit: "sqm",
  zoning: [],
  buildingUses: [],
};

export interface FilterStore extends FilterState {
  set<K extends keyof FilterState>(key: K, value: FilterState[K]): void;
  setTradeType(t: TradeType): void;
  toggleZone(code: string): void;
  setZones(codes: string[], on: boolean): void;
  toggleUse(code: string): void;
  reset(): void;
  restore(f: Partial<FilterState>): void;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  ...initialFilters,
  set: (key, value) => set({ [key]: value } as Partial<FilterState>),
  // FR-07 — 거래유형이 바뀌면 종속 가격 항목을 초기화
  setTradeType: (tradeType) => set({ tradeType, price: anyRange(), rent: anyRange() }),
  toggleZone: (code) => {
    const z = get().zoning;
    set({ zoning: z.includes(code) ? z.filter((c) => c !== code) : [...z, code] });
  },
  setZones: (codes, on) => {
    const z = new Set(get().zoning);
    codes.forEach((c) => (on ? z.add(c) : z.delete(c)));
    set({ zoning: [...z] });
  },
  toggleUse: (code) => {
    const u = get().buildingUses;
    set({ buildingUses: u.includes(code) ? u.filter((c) => c !== code) : [...u, code] });
  },
  reset: () =>
    set({
      ...initialFilters,
      price: anyRange(),
      rent: anyRange(),
      pyeongPrice: anyRange(),
      landArea: anyRange(),
      buildingArea: anyRange(),
      zoning: [],
      buildingUses: [],
      landUnit: get().landUnit,
      buildingUnit: get().buildingUnit,
    }),
  restore: (f) =>
    set({
      ...initialFilters,
      ...f,
      price: f.price ? { ...f.price } : anyRange(),
      rent: f.rent ? { ...f.rent } : anyRange(),
      pyeongPrice: f.pyeongPrice ? { ...f.pyeongPrice } : anyRange(),
      landArea: f.landArea ? { ...f.landArea } : anyRange(),
      buildingArea: f.buildingArea ? { ...f.buildingArea } : anyRange(),
      zoning: f.zoning ? [...f.zoning] : [],
      buildingUses: f.buildingUses ? [...f.buildingUses] : [],
    }),
}));

const isSet = (r: Range) => r.min != null || r.max != null;

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.tradeType !== "ALL") n++;
  if (isSet(f.price) || isSet(f.rent)) n++;
  if (isSet(f.pyeongPrice)) n++;
  if (isSet(f.landArea)) n++;
  if (isSet(f.buildingArea)) n++;
  if (f.zoning.length) n++;
  if (f.buildingUses.length) n++;
  return n;
}

export function buildCountRequest(r: RegionQuery, f: FilterState): CountRequest {
  const orNull = (x: Range) => (isSet(x) ? x : null);
  return {
    eupmyeondong_codes: r.eupmyeondong_codes,
    sigungu_codes: r.sigungu_codes,
    sido_codes: r.sido_codes,
    trade_type: f.tradeType === "ALL" ? null : f.tradeType,
    land_area_sqm: orNull(f.landArea),
    building_area_sqm: orNull(f.buildingArea),
    zoning_codes: f.zoning,
    building_uses: f.buildingUses,
    price_range: orNull(f.price),
    monthly_rent_range: f.tradeType === "MONTHLY" ? orNull(f.rent) : null,
    pyeong_price_range: orNull(f.pyeongPrice),
  };
}

// ---------- 실시간 매물 건수 상태 ----------
export interface CountStore {
  status: "idle" | "loading" | "ready" | "error";
  data: CountResponse | null;
  set(p: Partial<Pick<CountStore, "status" | "data">>): void;
}

export const useCountStore = create<CountStore>((set) => ({
  status: "idle",
  data: null,
  set: (p) => set(p),
}));
