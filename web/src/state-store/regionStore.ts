import { create } from "zustand";
import { PALETTE } from "../domain/constants";
import { emdCodesOf, useGeoStore } from "./geoStore";

export type Step = 1 | 2 | 3;
export type Tab = "region" | "filter";

export interface EmdSelection {
  isAllSelected: boolean;
  /** isAllSelected=false 일 때만 의미가 있는 선택 읍면동 코드 */
  checkedEmdCodes: string[];
  /** 3단계 시군구별 고유 팔레트 색상 */
  paletteColor: string;
}

// ADD 4.2 — selectedRegionTree (시군구 코드를 키로 하는 정규화 맵, Partial Sync)
export interface RegionSelectionState {
  selectedSidoCodes: string[];
  selectedSigunguCodes: string[];
  selectedEmdBySigungu: Record<string, EmdSelection>;
  sidoColor: Record<string, string>;
}

interface RegionStore extends RegionSelectionState {
  tab: Tab;
  step: Step;
  setTab(t: Tab): void;
  setStep(s: Step): void;
  toggleSido(code: string): void;
  selectAllSido(): void;
  resetSido(): void;
  toggleSigungu(code: string): void;
  setSigunguGroup(sido: string, on: boolean): void;
  toggleEmd(sigungu: string, emd: string): void;
  setEmdGroup(sigungu: string, on: boolean): void;
  resetAll(): void;
  restore(state: RegionSelectionState): void;
}

function nextColor(used: string[]): string {
  const free = PALETTE.find((c) => !used.includes(c));
  return free ?? PALETTE[used.length % PALETTE.length];
}

const empty: RegionSelectionState = {
  selectedSidoCodes: [],
  selectedSigunguCodes: [],
  selectedEmdBySigungu: {},
  sidoColor: {},
};

export const useRegionStore = create<RegionStore>((set, get) => ({
  ...empty,
  tab: "region",
  step: 1,

  setTab: (tab) => set({ tab }),
  setStep: (step) => set({ step, tab: "region" }),

  toggleSido: (code) => {
    const s = get();
    if (s.selectedSidoCodes.includes(code)) {
      const sgg = s.selectedSigunguCodes.filter((c) => !c.startsWith(code));
      const emd = { ...s.selectedEmdBySigungu };
      for (const k of Object.keys(emd)) if (k.startsWith(code)) delete emd[k];
      const colors = { ...s.sidoColor };
      delete colors[code];
      set({
        selectedSidoCodes: s.selectedSidoCodes.filter((c) => c !== code),
        selectedSigunguCodes: sgg,
        selectedEmdBySigungu: emd,
        sidoColor: colors,
      });
    } else {
      set({
        selectedSidoCodes: [...s.selectedSidoCodes, code],
        sidoColor: { ...s.sidoColor, [code]: nextColor(Object.values(s.sidoColor)) },
      });
      void useGeoStore.getState().ensureSigungu([code]);
    }
  },

  selectAllSido: () => {
    const all = useGeoStore.getState().sido.map((f) => f.properties.code);
    const s = get();
    const colors = { ...s.sidoColor };
    const order = [...s.selectedSidoCodes];
    for (const c of all) {
      if (!colors[c]) colors[c] = nextColor(Object.values(colors));
      if (!order.includes(c)) order.push(c);
    }
    set({ selectedSidoCodes: order, sidoColor: colors });
    void useGeoStore.getState().ensureSigungu(all);
  },

  resetSido: () => set({ ...empty }),

  toggleSigungu: (code) => {
    const s = get();
    if (s.selectedSigunguCodes.includes(code)) {
      const emd = { ...s.selectedEmdBySigungu };
      delete emd[code];
      set({ selectedSigunguCodes: s.selectedSigunguCodes.filter((c) => c !== code), selectedEmdBySigungu: emd });
    } else {
      // FR-03 / FR-13 — 새로 추가된 시군구만 전체 선택 상태로 병합
      const used = Object.values(s.selectedEmdBySigungu).map((e) => e.paletteColor);
      set({
        selectedSigunguCodes: [...s.selectedSigunguCodes, code],
        selectedEmdBySigungu: {
          ...s.selectedEmdBySigungu,
          [code]: { isAllSelected: true, checkedEmdCodes: [], paletteColor: nextColor(used) },
        },
      });
      void useGeoStore.getState().ensureEmd([code.slice(0, 2)]);
    }
  },

  setSigunguGroup: (sido, on) => {
    const list = useGeoStore.getState().sigunguBySido[sido]?.map((f) => f.properties.code) ?? [];
    const s = get();
    if (on) {
      const sgg = [...s.selectedSigunguCodes];
      const emd = { ...s.selectedEmdBySigungu };
      for (const c of list) {
        if (sgg.includes(c)) continue;
        sgg.push(c);
        emd[c] = {
          isAllSelected: true,
          checkedEmdCodes: [],
          paletteColor: nextColor(Object.values(emd).map((e) => e.paletteColor)),
        };
      }
      set({ selectedSigunguCodes: sgg, selectedEmdBySigungu: emd });
      void useGeoStore.getState().ensureEmd([sido]);
    } else {
      const emd = { ...s.selectedEmdBySigungu };
      for (const c of list) delete emd[c];
      set({ selectedSigunguCodes: s.selectedSigunguCodes.filter((c) => !c.startsWith(sido)), selectedEmdBySigungu: emd });
    }
  },

  toggleEmd: (sigungu, emd) => {
    const s = get();
    const cur = s.selectedEmdBySigungu[sigungu];
    const all = emdCodesOf(sigungu);
    if (!cur || !all) return;
    const checked = cur.isAllSelected ? [...all] : [...cur.checkedEmdCodes];
    const i = checked.indexOf(emd);
    if (i >= 0) checked.splice(i, 1);
    else checked.push(emd);
    const isAll = checked.length === all.length;
    set({
      selectedEmdBySigungu: {
        ...s.selectedEmdBySigungu,
        [sigungu]: { ...cur, isAllSelected: isAll, checkedEmdCodes: isAll ? [] : checked },
      },
    });
  },

  setEmdGroup: (sigungu, on) => {
    const s = get();
    const cur = s.selectedEmdBySigungu[sigungu];
    if (!cur) return;
    set({
      selectedEmdBySigungu: {
        ...s.selectedEmdBySigungu,
        [sigungu]: { ...cur, isAllSelected: on, checkedEmdCodes: [] },
      },
    });
  },

  resetAll: () => set({ ...empty, step: 1 }),

  restore: (state) => {
    set({ ...state });
    const geo = useGeoStore.getState();
    void geo.ensureSigungu(state.selectedSidoCodes);
    const sidos = [...new Set(state.selectedSigunguCodes.map((c) => c.slice(0, 2)))];
    if (sidos.length) void geo.ensureEmd(sidos);
  },
}));

// ---------- 파생 셀렉터 ----------

/** 시군구의 선택 상태: 'on' | 'mixed' | 'off' */
export function sigunguState(s: RegionSelectionState, code: string): "on" | "mixed" | "off" {
  if (!s.selectedSigunguCodes.includes(code)) return "off";
  const e = s.selectedEmdBySigungu[code];
  if (!e || e.isAllSelected) return "on";
  return "mixed";
}

export function isEmdChecked(s: RegionSelectionState, sigungu: string, emd: string): boolean {
  const e = s.selectedEmdBySigungu[sigungu];
  if (!e) return false;
  return e.isAllSelected || e.checkedEmdCodes.includes(emd);
}

export function checkedEmdCount(s: RegionSelectionState, sigungu: string, total: number): number {
  const e = s.selectedEmdBySigungu[sigungu];
  if (!e) return 0;
  return e.isAllSelected ? total : e.checkedEmdCodes.length;
}

export interface RegionQuery {
  sido_codes: string[];
  sigungu_codes: string[];
  eupmyeondong_codes: string[];
  /** 선택된 지역이 실제로 0건인지(전체 해제) */
  empty: boolean;
  /** 아무 지역도 고르지 않은 초기 상태 */
  none: boolean;
}

export function buildRegionQuery(s: RegionSelectionState): RegionQuery {
  const q: RegionQuery = { sido_codes: [], sigungu_codes: [], eupmyeondong_codes: [], empty: false, none: false };
  for (const sido of s.selectedSidoCodes) {
    const sggs = s.selectedSigunguCodes.filter((c) => c.startsWith(sido));
    if (!sggs.length) {
      q.sido_codes.push(sido);
      continue;
    }
    for (const sg of sggs) {
      const e = s.selectedEmdBySigungu[sg];
      if (!e || e.isAllSelected) q.sigungu_codes.push(sg);
      else q.eupmyeondong_codes.push(...e.checkedEmdCodes);
    }
  }
  q.none = s.selectedSidoCodes.length === 0;
  q.empty = !q.none && !q.sido_codes.length && !q.sigungu_codes.length && !q.eupmyeondong_codes.length;
  return q;
}
