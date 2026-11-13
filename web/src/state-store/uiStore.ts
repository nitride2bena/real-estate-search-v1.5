import { create } from "zustand";
import type { RegionFeature } from "../api/regions";

interface UiStore {
  toast: { id: number; text: string } | null;
  showToast(text: string): void;
  drawerOpen: boolean;
  setDrawerOpen(v: boolean): void;
  sheetSnap: 0 | 1 | 2; // 15% / 50% / 90%
  setSheetSnap(v: 0 | 1 | 2): void;
  resultsOpen: boolean;
  setResultsOpen(v: boolean): void;
  miniCard: { feature: RegionFeature; level: "sido" | "sigungu" | "emd" } | null;
  setMiniCard(v: UiStore["miniCard"]): void;
  /** Dynamic FitBounds 용 패널 가림 영역 */
  mapPadding: { top: number; right: number; bottom: number; left: number };
  setMapPadding(p: UiStore["mapPadding"]): void;
}

let toastId = 0;

export const useUiStore = create<UiStore>((set) => ({
  toast: null,
  showToast: (text) => set({ toast: { id: ++toastId, text } }),
  drawerOpen: true,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  sheetSnap: 1,
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  resultsOpen: false,
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),
  miniCard: null,
  setMiniCard: (miniCard) => set({ miniCard }),
  mapPadding: { top: 40, right: 40, bottom: 40, left: 420 },
  setMapPadding: (mapPadding) => set({ mapPadding }),
}));
