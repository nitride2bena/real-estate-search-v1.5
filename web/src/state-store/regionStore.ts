import { create } from "zustand";
import { PALETTE } from "../domain/constants";
import { emdCodesOf, useGeoStore } from "./geoStore";
import { serializeSearchUrl, hydrateFromUrl, shareSearchUrl } from "../platform-bridge/viewport";

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

export interface RegionStore extends RegionSelectionState {
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
  restore(state: Partial<RegionSelectionState> & { step?: Step; tab?: Tab }): void;
}

export function nextPaletteColor(used: string[]): string {
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

  setStep: (step) => {
    const s = get();
    // 3단계 진입 시 선택된 시군구 중 selectedEmdBySigungu 엔트리가 없는 항목만 기본 전체 선택으로 보충 (Partial Sync 보존)
    const emd = { ...s.selectedEmdBySigungu };
    let emdUpdated = false;
    for (const sg of s.selectedSigunguCodes) {
      if (!emd[sg]) {
        const used = Object.values(emd).map((e) => e.paletteColor);
        emd[sg] = { isAllSelected: true, checkedEmdCodes: [], paletteColor: nextPaletteColor(used) };
        emdUpdated = true;
      }
    }
    set(emdUpdated ? { step, tab: "region", selectedEmdBySigungu: emd } : { step, tab: "region" });

    // 단계 이동 시 필요한 하위 행정구역 경계 데이터 보장
    if (step >= 2 && s.selectedSidoCodes.length) {
      void useGeoStore.getState().ensureSigungu(s.selectedSidoCodes);
    }
    if (step === 3 && s.selectedSigunguCodes.length) {
      const sidos = [...new Set(s.selectedSigunguCodes.map((c) => c.slice(0, 2)))];
      void useGeoStore.getState().ensureEmd(sidos);
    }
  },

  toggleSido: (code) => {
    const s = get();
    if (s.selectedSidoCodes.includes(code)) {
      // FR-13: 해제된 시·도에 속한 하위 시군구/읍면동만 제거하고, 다른 시·도의 하위 커스텀 선택은 유지
      const sgg = s.selectedSigunguCodes.filter((c) => !c.startsWith(code));
      const emd = { ...s.selectedEmdBySigungu };
      for (const k of Object.keys(emd)) {
        if (k.startsWith(code)) delete emd[k];
      }
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
        sidoColor: { ...s.sidoColor, [code]: nextPaletteColor(Object.values(s.sidoColor)) },
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
      if (!colors[c]) colors[c] = nextPaletteColor(Object.values(colors));
      if (!order.includes(c)) order.push(c);
    }
    set({ selectedSidoCodes: order, sidoColor: colors });
    void useGeoStore.getState().ensureSigungu(all);
  },

  resetSido: () => set({ ...empty }),

  toggleSigungu: (code) => {
    const s = get();
    if (s.selectedSigunguCodes.includes(code)) {
      const curEmd = s.selectedEmdBySigungu[code];
      // 3단계에서 모든 동이 해제된(0개) 상태였던 시군구를 2단계에서 다시 클릭하면 전체 선택으로 복원
      if (curEmd && !curEmd.isAllSelected && curEmd.checkedEmdCodes.length === 0) {
        set({
          selectedEmdBySigungu: {
            ...s.selectedEmdBySigungu,
            [code]: { ...curEmd, isAllSelected: true, checkedEmdCodes: [] },
          },
        });
        return;
      }
      const emd = { ...s.selectedEmdBySigungu };
      delete emd[code];
      set({
        selectedSigunguCodes: s.selectedSigunguCodes.filter((c) => c !== code),
        selectedEmdBySigungu: emd,
      });
    } else {
      // FR-03 & FR-13 — 기존 시군구의 하위 커스텀 선택 상태는 그대로 유지(Partial Sync)하고 새로 추가된 시군구만 전체 선택 상태로 병합
      const sido = code.slice(0, 2);
      const sidoCodes = s.selectedSidoCodes.includes(sido) ? s.selectedSidoCodes : [...s.selectedSidoCodes, sido];
      const sidoColor = s.sidoColor[sido]
        ? s.sidoColor
        : { ...s.sidoColor, [sido]: nextPaletteColor(Object.values(s.sidoColor)) };
      const used = Object.values(s.selectedEmdBySigungu).map((e) => e.paletteColor);
      set({
        selectedSidoCodes: sidoCodes,
        sidoColor,
        selectedSigunguCodes: [...s.selectedSigunguCodes, code],
        selectedEmdBySigungu: {
          ...s.selectedEmdBySigungu,
          [code]: { isAllSelected: true, checkedEmdCodes: [], paletteColor: nextPaletteColor(used) },
        },
      });
      void useGeoStore.getState().ensureEmd([sido]);
    }
  },

  setSigunguGroup: (sido, on) => {
    const list = useGeoStore.getState().sigunguBySido[sido]?.map((f) => f.properties.code) ?? [];
    const s = get();
    if (on) {
      const sgg = [...s.selectedSigunguCodes];
      const emd = { ...s.selectedEmdBySigungu };
      for (const c of list) {
        if (sgg.includes(c)) {
          // FR-13: 이미 선택되어 있던 시군구 중 커스텀 부분 선택(mixed) 상태는 보존하되, 0개 선택 상태였다면 전체 선택으로 복구
          if (emd[c] && !emd[c].isAllSelected && emd[c].checkedEmdCodes.length === 0) {
            emd[c] = { ...emd[c], isAllSelected: true, checkedEmdCodes: [] };
          }
          continue;
        }
        sgg.push(c);
        emd[c] = {
          isAllSelected: true,
          checkedEmdCodes: [],
          paletteColor: nextPaletteColor(Object.values(emd).map((e) => e.paletteColor)),
        };
      }
      set({ selectedSigunguCodes: sgg, selectedEmdBySigungu: emd });
      void useGeoStore.getState().ensureEmd([sido]);
    } else {
      const emd = { ...s.selectedEmdBySigungu };
      for (const c of list) delete emd[c];
      for (const k of Object.keys(emd)) {
        if (k.startsWith(sido)) delete emd[k];
      }
      set({
        selectedSigunguCodes: s.selectedSigunguCodes.filter((c) => !c.startsWith(sido)),
        selectedEmdBySigungu: emd,
      });
    }
  },

  toggleEmd: (sigungu, emd) => {
    const s = get();
    const cur = s.selectedEmdBySigungu[sigungu];
    const all = emdCodesOf(sigungu);
    if (!cur || !all || !all.length) return;
    const base = cur.isAllSelected ? [...all] : [...cur.checkedEmdCodes];
    const setCodes = new Set(base);
    if (setCodes.has(emd)) setCodes.delete(emd);
    else setCodes.add(emd);
    const checked = all.filter((code) => setCodes.has(code));
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
    const cur = get();
    const selectedSidoCodes = [...new Set(state.selectedSidoCodes ?? cur.selectedSidoCodes)];
    const selectedSigunguCodes = [...new Set(state.selectedSigunguCodes ?? cur.selectedSigunguCodes)];

    // 상위 시도 코드가 누락된 시군구가 있으면 자동으로 시도 코드 보충
    for (const sg of selectedSigunguCodes) {
      const sd = sg.slice(0, 2);
      if (sd && !selectedSidoCodes.includes(sd)) selectedSidoCodes.push(sd);
    }

    const sidoColor: Record<string, string> = { ...(state.sidoColor ?? {}) };
    for (const sd of selectedSidoCodes) {
      if (!sidoColor[sd]) sidoColor[sd] = nextPaletteColor(Object.values(sidoColor));
    }

    const selectedEmdBySigungu: Record<string, EmdSelection> = {};
    const rawEmd = state.selectedEmdBySigungu ?? {};
    for (const sg of selectedSigunguCodes) {
      const existing = rawEmd[sg];
      const used = Object.values(selectedEmdBySigungu).map((e) => e.paletteColor);
      selectedEmdBySigungu[sg] = {
        isAllSelected: existing ? existing.isAllSelected : true,
        checkedEmdCodes: existing ? [...existing.checkedEmdCodes] : [],
        paletteColor: existing?.paletteColor || nextPaletteColor(used),
      };
    }

    set({
      selectedSidoCodes,
      selectedSigunguCodes,
      selectedEmdBySigungu,
      sidoColor,
      ...(state.step ? { step: state.step } : {}),
      ...(state.tab ? { tab: state.tab } : {}),
    });

    const geo = useGeoStore.getState();
    if (selectedSidoCodes.length) void geo.ensureSigungu(selectedSidoCodes);
    const sidosForEmd = [...new Set(selectedSigunguCodes.map((c) => c.slice(0, 2)))];
    if (sidosForEmd.length) void geo.ensureEmd(sidosForEmd);
  },
}));

// ---------- 파생 셀렉터 ----------

/** 시군구의 선택 상태: 'on' | 'mixed' | 'off' */
export function sigunguState(s: RegionSelectionState, code: string): "on" | "mixed" | "off" {
  if (!s.selectedSigunguCodes.includes(code)) return "off";
  const e = s.selectedEmdBySigungu[code];
  if (!e || e.isAllSelected) return "on";
  const total = emdCodesOf(code)?.length;
  if (total != null && total > 0 && e.checkedEmdCodes.length >= total) return "on";
  return "mixed";
}

export function isEmdChecked(s: RegionSelectionState, sigungu: string, emd: string): boolean {
  const e = s.selectedEmdBySigungu[sigungu];
  if (!e) return false;
  return e.isAllSelected || e.checkedEmdCodes.includes(emd);
}

export function checkedEmdCount(s: RegionSelectionState, sigungu: string, total?: number): number {
  const e = s.selectedEmdBySigungu[sigungu];
  if (!e) return 0;
  const resolvedTotal = total ?? emdCodesOf(sigungu)?.length ?? 0;
  return e.isAllSelected ? resolvedTotal : e.checkedEmdCodes.length;
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

// FR-17 URL 직렬화·복원·공유 헬퍼 Re-export (regionStore 또는 viewport 어디서든 import 가능)
export { serializeSearchUrl, hydrateFromUrl, shareSearchUrl };
