import { create } from "zustand";
import type { RegionFeature } from "../api/regions";

export interface UiStore {
  toast: { id: number; text: string } | null;
  showToast(text: string): void;
  drawerOpen: boolean;
  setDrawerOpen(v: boolean): void;
  sheetSnap: 0 | 1 | 2; // 15% / 50% / 90%
  setSheetSnap(v: 0 | 1 | 2): void;
  resultsOpen: boolean;
  setResultsOpen(v: boolean): void;
  compareOpen: boolean;
  setCompareOpen(v: boolean): void;
  bookmarksOpen: boolean;
  setBookmarksOpen(v: boolean): void;
  miniCard: { feature: RegionFeature; level: "sido" | "sigungu" | "emd" } | null;
  setMiniCard(v: UiStore["miniCard"]): void;
  /** Dynamic FitBounds 용 패널 가림 영역 */
  mapPadding: { top: number; right: number; bottom: number; left: number };
  setMapPadding(p: UiStore["mapPadding"]): void;
}

let toastId = 0;

/** DRD 3.1 — 태블릿(768px ~ 1023px) 세로 모드 진입 여부 판별 */
function isInitialTabletPortrait(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 768 && w < 1024 && h > w;
}

function getInitialMapPadding(drawerOpen: boolean) {
  if (typeof window === "undefined") {
    return { top: 40, right: 40, bottom: 40, left: 420 };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1024) {
    return { top: 40, right: 40, bottom: 40, left: 420 };
  }
  if (w >= 768) {
    return { top: 40, right: 40, bottom: 40, left: drawerOpen ? 380 : 40 };
  }
  return { top: 20, right: 20, bottom: Math.round(h * 0.5) + 20, left: 20 };
}

const initialDrawerOpen = !isInitialTabletPortrait();

export const useUiStore = create<UiStore>((set) => ({
  toast: null,
  showToast: (text) => set({ toast: { id: ++toastId, text } }),
  // DRD 3.1 — 태블릿 세로 모드(768~1023px, h > w) 초기 진입 시 드로어 기본 접힘, 그 외에는 열림
  drawerOpen: initialDrawerOpen,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  sheetSnap: 1,
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  resultsOpen: false,
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),
  compareOpen: false,
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  bookmarksOpen: false,
  setBookmarksOpen: (bookmarksOpen) => set({ bookmarksOpen }),
  miniCard: null,
  setMiniCard: (miniCard) => set({ miniCard }),
  mapPadding: getInitialMapPadding(initialDrawerOpen),
  setMapPadding: (mapPadding) => set({ mapPadding }),
}));
