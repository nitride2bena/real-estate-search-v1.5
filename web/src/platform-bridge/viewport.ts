import { useEffect, useState } from "react";
import { PALETTE, type TradeType } from "../domain/constants";
import type { Range } from "../api/mockServer";
import { useRegionStore, type EmdSelection, type RegionSelectionState, type Step, type Tab } from "../state-store/regionStore";
import { useFilterStore, type AreaUnit, type FilterState } from "../state-store/filterStore";
import { useUiStore } from "../state-store/uiStore";

export type LayoutMode = "desktop" | "tablet" | "mobile";

function getMode(): LayoutMode {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

/** DRD 3.1 — 현재 뷰포트가 태블릿(768px ~ 1023px) 세로 모드인지 판별 */
export function isTabletPortrait(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 768 && w < 1024 && h > w;
}

let initialUrlHydrated = false;

/** DRD 3.1 — 3단계 브레이크포인트 (DOM은 그대로 두고 레이아웃 모드만 전환 + 태블릿 세로 모드 진입 시 드로어 기본 접힘) */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(getMode);

  useEffect(() => {
    // 앱 최초 마운트 시 URL 쿼리 파라미터가 있으면 자동 복원 (FR-17)
    if (!initialUrlHydrated) {
      initialUrlHydrated = true;
      if (typeof window !== "undefined" && window.location.search.length > 1) {
        hydrateFromUrl(window.location.search);
      }
    }

    let prevMode = getMode();
    let prevPortrait = isTabletPortrait();

    // 최초 마운트 시 태블릿 세로 모드라면 기본 접힘 보장
    if (prevPortrait) {
      useUiStore.getState().setDrawerOpen(false);
    }

    const onResize = () => {
      const nextMode = getMode();
      const nextPortrait = isTabletPortrait();
      setMode(nextMode);

      // DRD 3.1: 태블릿 세로 모드 진입 시 지도 가시성 확보를 위해 드로어 기본 접힘
      if (nextPortrait && !prevPortrait) {
        useUiStore.getState().setDrawerOpen(false);
      } else if ((nextMode === "desktop" && prevMode !== "desktop") || (nextMode === "tablet" && !nextPortrait && prevPortrait)) {
        useUiStore.getState().setDrawerOpen(true);
      }

      prevMode = nextMode;
      prevPortrait = nextPortrait;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return mode;
}

/** FR-11 — 입력 장치 판별 (마우스 호버 가능 여부) */
export function useHoverCapable(): boolean {
  const q = "(hover: hover) and (pointer: fine)";
  const [hover, setHover] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setHover(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return hover;
}

/** FR-16 — VisualViewport API 로 가상 키보드 높이를 CSS 변수(--kb-inset)에 반영 */
export function useVisualViewportInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
}

// ============================================================================
// FR-17 — 검색 조건 URL 쿼리 직렬화 · 복원 · 네이티브 공유 / 클립보드 복사 헬퍼
// ============================================================================

function serializeRange(r: Range | undefined): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  const minStr = r.min != null ? String(Math.round(r.min * 100) / 100) : "";
  const maxStr = r.max != null ? String(Math.round(r.max * 100) / 100) : "";
  return `${minStr}-${maxStr}`;
}

function parseRange(raw: string | null): Range | undefined {
  if (!raw) return undefined;
  const idx = raw.indexOf("-");
  if (idx < 0) return undefined;
  const minPart = raw.slice(0, idx).trim();
  const maxPart = raw.slice(idx + 1).trim();
  const min = minPart !== "" && !isNaN(Number(minPart)) ? Number(minPart) : null;
  const max = maxPart !== "" && !isNaN(Number(maxPart)) ? Number(maxPart) : null;
  if (min == null && max == null) return undefined;
  return { min, max };
}

/**
 * 현재 regionStore와 filterStore 상태를 URL 쿼리 문자열이 포함된 전체 URL로 직렬화합니다.
 */
export function serializeSearchUrl(
  regionOverride?: Partial<RegionSelectionState & { step?: Step; tab?: Tab }>,
  filterOverride?: Partial<FilterState>,
): string {
  const r = { ...useRegionStore.getState(), ...regionOverride };
  const f = { ...useFilterStore.getState(), ...filterOverride };
  const params = new URLSearchParams();

  if (r.selectedSidoCodes.length > 0) {
    params.set("sido", r.selectedSidoCodes.join(","));
  }
  if (r.selectedSigunguCodes.length > 0) {
    params.set("sgg", r.selectedSigunguCodes.join(","));
  }

  // 3단계 커스텀 해제(Partial Sync)된 시군구의 선택 읍면동 코드 직렬화
  const customEmds: string[] = [];
  const emptySggs: string[] = [];
  for (const sg of r.selectedSigunguCodes) {
    const e = r.selectedEmdBySigungu[sg];
    if (e && !e.isAllSelected) {
      if (e.checkedEmdCodes.length > 0) customEmds.push(...e.checkedEmdCodes);
      else emptySggs.push(sg);
    }
  }
  if (customEmds.length > 0) params.set("emd", customEmds.join(","));
  if (emptySggs.length > 0) params.set("emptySgg", emptySggs.join(","));

  if (r.step && r.step > 1) params.set("step", String(r.step));
  if (r.tab && r.tab !== "region") params.set("tab", r.tab);

  // 상세 조건 필터 직렬화
  if (f.tradeType && f.tradeType !== "ALL") params.set("trade", f.tradeType);
  const priceStr = serializeRange(f.price);
  if (priceStr) params.set("price", priceStr);
  const rentStr = serializeRange(f.rent);
  if (rentStr) params.set("rent", rentStr);
  const pyeongStr = serializeRange(f.pyeongPrice);
  if (pyeongStr) params.set("pyeong", pyeongStr);
  const landStr = serializeRange(f.landArea);
  if (landStr) params.set("land", landStr);
  const bldgStr = serializeRange(f.buildingArea);
  if (bldgStr) params.set("bldg", bldgStr);
  if (f.landUnit && f.landUnit !== "sqm") params.set("landUnit", f.landUnit);
  if (f.buildingUnit && f.buildingUnit !== "sqm") params.set("bldgUnit", f.buildingUnit);
  if (f.zoning?.length) params.set("zones", f.zoning.join(","));
  if (f.buildingUses?.length) params.set("uses", f.buildingUses.join(","));

  const qs = params.toString();
  if (typeof window === "undefined") return qs ? `?${qs}` : "";
  const base = `${window.location.origin}${window.location.pathname}`;
  return qs ? `${base}?${qs}` : base;
}

/**
 * URL 쿼리 파라미터(?sido=...&sgg=...&emd=...&trade=... 등)로부터
 * regionStore 및 filterStore 상태를 복원합니다.
 */
export function hydrateFromUrl(search?: string | URLSearchParams): boolean {
  if (typeof window === "undefined" && !search) return false;
  const rawSearch = search ?? window.location.search;
  const params = typeof rawSearch === "string" ? new URLSearchParams(rawSearch) : rawSearch;

  const hasRegionParams = params.has("sido") || params.has("sgg") || params.has("emd");
  const hasFilterParams =
    params.has("trade") ||
    params.has("price") ||
    params.has("rent") ||
    params.has("pyeong") ||
    params.has("land") ||
    params.has("bldg") ||
    params.has("zones") ||
    params.has("uses");

  if (!hasRegionParams && !hasFilterParams && !params.has("step") && !params.has("tab")) {
    return false;
  }

  const splitCodes = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const sidoSet = new Set<string>(splitCodes("sido"));
  const sggSet = new Set<string>(splitCodes("sgg"));
  const emdList = splitCodes("emd");
  const emptySggSet = new Set<string>(splitCodes("emptySgg"));

  // 하위 코드에서 상위 코드 자동 보충
  const emdBySgg = new Map<string, string[]>();
  for (const emd of emdList) {
    const sg = emd.slice(0, 5);
    const sd = emd.slice(0, 2);
    if (sd.length === 2) sidoSet.add(sd);
    if (sg.length === 5) {
      sggSet.add(sg);
      const arr = emdBySgg.get(sg) ?? [];
      arr.push(emd);
      emdBySgg.set(sg, arr);
    }
  }
  for (const sg of emptySggSet) {
    if (sg.length === 5) {
      sggSet.add(sg);
      sidoSet.add(sg.slice(0, 2));
    }
  }
  for (const sg of sggSet) {
    const sd = sg.slice(0, 2);
    if (sd.length === 2) sidoSet.add(sd);
  }

  const selectedSidoCodes = [...sidoSet];
  const selectedSigunguCodes = [...sggSet];
  const sidoColor: Record<string, string> = {};
  selectedSidoCodes.forEach((sd, i) => {
    sidoColor[sd] = PALETTE[i % PALETTE.length];
  });

  const selectedEmdBySigungu: Record<string, EmdSelection> = {};
  selectedSigunguCodes.forEach((sg, i) => {
    const customEmds = emdBySgg.get(sg);
    const isExplicitEmpty = emptySggSet.has(sg);
    selectedEmdBySigungu[sg] = {
      isAllSelected: !customEmds && !isExplicitEmpty,
      checkedEmdCodes: customEmds ?? [],
      paletteColor: PALETTE[i % PALETTE.length],
    };
  });

  const stepParam = Number(params.get("step"));
  const inferredStep: Step =
    stepParam === 1 || stepParam === 2 || stepParam === 3
      ? stepParam
      : emdList.length > 0 || emptySggSet.size > 0
        ? 3
        : selectedSigunguCodes.length > 0
          ? 2
          : 1;

  const tabParam = params.get("tab");
  const inferredTab: Tab = tabParam === "filter" ? "filter" : "region";

  useRegionStore.getState().restore({
    selectedSidoCodes,
    selectedSigunguCodes,
    selectedEmdBySigungu,
    sidoColor,
    step: inferredStep,
    tab: inferredTab,
  });

  if (hasFilterParams) {
    const tradeRaw = params.get("trade");
    const tradeType: TradeType =
      tradeRaw === "SALE" || tradeRaw === "JEONSE" || tradeRaw === "MONTHLY" ? tradeRaw : "ALL";
    const landUnitRaw = params.get("landUnit");
    const bldgUnitRaw = params.get("bldgUnit");
    const landUnit: AreaUnit = landUnitRaw === "pyeong" ? "pyeong" : "sqm";
    const buildingUnit: AreaUnit = bldgUnitRaw === "pyeong" ? "pyeong" : "sqm";

    useFilterStore.getState().restore({
      tradeType,
      price: parseRange(params.get("price")),
      rent: parseRange(params.get("rent")),
      pyeongPrice: parseRange(params.get("pyeong")),
      landArea: parseRange(params.get("land")),
      buildingArea: parseRange(params.get("bldg")),
      landUnit,
      buildingUnit,
      zoning: splitCodes("zones"),
      buildingUses: splitCodes("uses"),
    });
  }

  return true;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 폴백으로 진행 */
    }
  }
  if (typeof document !== "undefined") {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export interface ShareSearchOptions {
  title?: string;
  text?: string;
  onToast?: (msg: string) => void;
}

/**
 * 현재 검색 조건을 URL 쿼리에 반영하고,
 * 모바일/터치 환경에서 navigator.share 지원 시 네이티브 공유 시트를 호출하며,
 * 미지원 시 클립보드에 URL을 복사하고 토스트 알림을 띄웁니다.
 */
export async function shareSearchUrl(
  optionsOrToast?: ShareSearchOptions | ((msg: string) => void),
): Promise<string> {
  const opts: ShareSearchOptions =
    typeof optionsOrToast === "function" ? { onToast: optionsOrToast } : (optionsOrToast ?? {});
  const notify = opts.onToast ?? useUiStore.getState().showToast;
  const url = serializeSearchUrl();

  if (typeof window !== "undefined" && window.history?.replaceState) {
    window.history.replaceState(null, "", url);
  }

  const isTouchDevice =
    typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (isTouchDevice && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: opts.title ?? "부동산 검색 조건 공유",
        text: opts.text ?? "설정한 지역 및 상세 필터 검색 조건입니다.",
        url,
      });
      notify("검색 조건 URL을 공유했습니다");
      return url;
    } catch (e) {
      if ((e as Error).name === "AbortError") return url;
      // 공유 실패 시 클립보드 복사로 폴백
    }
  }

  const copied = await copyTextToClipboard(url);
  if (copied) {
    notify("검색 조건 URL이 클립보드에 복사되었습니다");
  } else {
    notify("주소창에 검색 조건 URL이 반영되었습니다");
  }
  return url;
}
