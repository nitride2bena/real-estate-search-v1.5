import { create } from "zustand";
import { fetchEmdBySido, fetchSido, fetchSigungu, type RegionFeature } from "../api/regions";

interface GeoState {
  sido: RegionFeature[];
  sigunguBySido: Record<string, RegionFeature[]>;
  emdBySigungu: Record<string, RegionFeature[]>;
  emdLoadedSido: Record<string, true>;
  /** 코드 → 피처 (시도·시군구·읍면동 공통 조회) */
  byCode: Record<string, RegionFeature>;
  pending: number;
  error: string | null;
  init(): Promise<void>;
  ensureSigungu(sidoCodes: string[]): Promise<void>;
  ensureEmd(sidoCodes: string[]): Promise<void>;
}

const inflight = new Map<string, Promise<void>>();

function once(key: string, fn: () => Promise<void>) {
  let p = inflight.get(key);
  if (!p) {
    p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export const useGeoStore = create<GeoState>((set, get) => {
  const track = async (fn: () => Promise<void>) => {
    set((s) => ({ pending: s.pending + 1 }));
    try {
      await fn();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
    }
  };

  return {
    sido: [],
    sigunguBySido: {},
    emdBySigungu: {},
    emdLoadedSido: {},
    byCode: {},
    pending: 0,
    error: null,

    init: () =>
      once("sido", () =>
        track(async () => {
          const feats = await fetchSido();
          set((s) => ({
            sido: feats,
            byCode: { ...s.byCode, ...Object.fromEntries(feats.map((f) => [f.properties.code, f])) },
          }));
        }),
      ),

    ensureSigungu: async (sidoCodes) => {
      const missing = sidoCodes.filter((c) => !get().sigunguBySido[c]);
      await Promise.all(
        missing.map((sido) =>
          once(`sgg:${sido}`, () =>
            track(async () => {
              const [g] = await fetchSigungu([sido]);
              set((s) => ({
                sigunguBySido: { ...s.sigunguBySido, [sido]: g.features },
                byCode: { ...s.byCode, ...Object.fromEntries(g.features.map((f) => [f.properties.code, f])) },
              }));
            }),
          ),
        ),
      );
    },

    ensureEmd: async (sidoCodes) => {
      const missing = sidoCodes.filter((c) => !get().emdLoadedSido[c]);
      await Promise.all(
        missing.map((sido) =>
          once(`emd:${sido}`, () =>
            track(async () => {
              const [g] = await fetchEmdBySido([sido]);
              const grouped: Record<string, RegionFeature[]> = {};
              for (const f of g.features) (grouped[f.properties.sigungu!] ??= []).push(f);
              set((s) => ({
                emdBySigungu: { ...s.emdBySigungu, ...grouped },
                emdLoadedSido: { ...s.emdLoadedSido, [sido]: true },
                byCode: { ...s.byCode, ...Object.fromEntries(g.features.map((f) => [f.properties.code, f])) },
              }));
            }),
          ),
        ),
      );
    },
  };
});

export function emdCodesOf(sigungu: string): string[] | undefined {
  return useGeoStore.getState().emdBySigungu[sigungu]?.map((f) => f.properties.code);
}
