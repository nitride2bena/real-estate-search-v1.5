import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { useGeoStore } from "../state-store/geoStore";
import { isEmdChecked, sigunguState, useRegionStore, checkedEmdCount } from "../state-store/regionStore";
import { useCountStore } from "../state-store/filterStore";
import { useUiStore } from "../state-store/uiStore";
import { KOREA_BOUNDS, LOD_LIMIT } from "../domain/constants";
import type { RegionFeature } from "../api/regions";
import type { LayoutMode } from "../platform-bridge/viewport";

type Level = "sido" | "sigungu" | "emd";
type GpuTier = "low" | "standard" | "high";

const LEVELS: Level[] = ["sido", "sigungu", "emd"];
const CODE_LEN: Record<Level, number> = { sido: 2, sigungu: 5, emd: 8 };
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

interface Plan {
  active: Level;
  context: Level[];
  lod: boolean;
  rawPolygonCount: number;
  data: Record<Level, RegionFeature[]>;
  state: Record<string, { selected: boolean; color: string }>;
}

const fc = (features: RegionFeature[]) => ({ type: "FeatureCollection", features }) as FeatureCollection;

/** FR-14: 디바이스 WebGL 렌더러 및 하드웨어 사양 기반 GPU 티어 감지 */
function detectGpuTier(): GpuTier {
  if (typeof window === "undefined" || typeof document === "undefined") return "standard";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "low";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase() : "";
    if (/swiftshader|llvmpipe|software|basic render|mali-4|adreno \(tm\) 3|powervr sgx/i.test(renderer)) {
      return "low";
    }
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    if (cores <= 2 || mem <= 2) return "low";
    if (cores >= 8 && mem >= 8) return "high";
    return "standard";
  } catch {
    return "standard";
  }
}

/** DRD 2.1: 지도 폴리곤 상태별 스타일 규격 (선택/미선택/호버·탭) */
function addLevelLayers(map: maplibregl.Map, lvl: Level) {
  map.addSource(lvl, { type: "geojson", data: fc([]), promoteId: "code" });
  const sel = ["boolean", ["feature-state", "selected"], false] as const;
  const hov = ["boolean", ["feature-state", "hover"], false] as const;
  const color = ["coalesce", ["feature-state", "color"], "#2563EB"] as const;

  // 면 채우기: 선택됨(0.5, 호버/탭 시 0.65), 미선택(0.0, 호버/탭 시 #2563EB 0.15)
  map.addLayer({
    id: `${lvl}-fill`,
    type: "fill",
    source: lvl,
    layout: { visibility: "none" },
    paint: {
      "fill-color": ["case", sel, color, "#2563EB"] as never,
      "fill-opacity": ["case", sel, ["case", hov, 0.65, 0.5], ["case", hov, 0.15, 0]] as never,
      "fill-opacity-transition": { duration: 150 },
    },
  });

  // 상위 단계 컨텍스트 경계선
  map.addLayer({
    id: `${lvl}-ctx`,
    type: "line",
    source: lvl,
    layout: { visibility: "none", "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#334155", "line-width": 1.2, "line-opacity": 0.55 },
  });

  // 미선택 외곽선: #666666 1px 점선 ([2, 2], opacity: 0.3)
  map.addLayer({
    id: `${lvl}-line-unsel`,
    type: "line",
    source: lvl,
    layout: { visibility: "none" },
    paint: {
      "line-color": "#666666",
      "line-width": 1,
      "line-dasharray": [2, 2],
      "line-opacity": ["case", ["any", sel, hov], 0, 0.3] as never,
    },
  });

  // 선택됨 외곽선: 할당된 12색 팔레트 HEX 2px 실선 (opacity: 1.0)
  map.addLayer({
    id: `${lvl}-line-sel`,
    type: "line",
    source: lvl,
    layout: { visibility: "none", "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": color as never,
      "line-width": 2,
      "line-opacity": ["case", sel, 1, 0] as never,
    },
  });

  // 호버 / 탭 외곽선: 3px 실선 강조
  map.addLayer({
    id: `${lvl}-line-hover`,
    type: "line",
    source: lvl,
    layout: { visibility: "none", "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["case", sel, color, "#2563EB"] as never,
      "line-width": 3,
      "line-opacity": ["case", hov, 1, 0] as never,
    },
  });
}

function setVisible(map: maplibregl.Map, id: string, on: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

/** FR-12: .search-panel 실제 가림 영역 및 mapPadding을 반영한 동적 패딩 계산 */
function computeEffectivePadding(
  mapEl: HTMLElement,
  storePadding: { top: number; right: number; bottom: number; left: number },
  layout: LayoutMode,
): { top: number; right: number; bottom: number; left: number } {
  const mapRect = mapEl.getBoundingClientRect();
  const panelEl = document.querySelector<HTMLElement>(".search-panel");
  const baseMargin = layout === "mobile" ? 24 : 40;

  const p = {
    top: baseMargin,
    right: baseMargin,
    bottom: baseMargin,
    left: baseMargin,
  };

  if (panelEl && mapRect.width > 0 && mapRect.height > 0) {
    const panelRect = panelEl.getBoundingClientRect();
    const isCollapsed = panelEl.classList.contains("is-collapsed");

    if (layout === "mobile") {
      const overlapBottom = Math.max(0, Math.round(mapRect.bottom - panelRect.top));
      p.bottom = Math.max(overlapBottom + baseMargin, storePadding.bottom);
    } else if (layout === "tablet") {
      if (!isCollapsed) {
        const overlapLeft = Math.max(0, Math.round(panelRect.right - mapRect.left));
        p.left = Math.max(overlapLeft + baseMargin, storePadding.left);
      }
    } else {
      // 데스크톱: 패널이 지도 컨테이너와 실제로 겹치는 픽셀만큼만 좌측 패딩 추가
      // (Flex 레이아웃에서 이미 map-container가 패널 우측에 분리된 경우 중복 패딩 방지)
      const overlapLeft = Math.max(0, Math.round(panelRect.right - mapRect.left));
      p.left = overlapLeft > 10 ? overlapLeft + baseMargin : baseMargin;
    }
  } else {
    p.top = storePadding.top;
    p.right = storePadding.right;
    p.bottom = storePadding.bottom;
    p.left = layout === "desktop" ? baseMargin : storePadding.left;
  }

  // 패딩이 가시 영역을 넘지 않도록 안전 보정
  const minAvail = 80;
  if (p.left + p.right > mapRect.width - minAvail && mapRect.width > minAvail) {
    const k = Math.max(0, (mapRect.width - minAvail) / (p.left + p.right));
    p.left = Math.round(p.left * k);
    p.right = Math.round(p.right * k);
  }
  if (p.top + p.bottom > mapRect.height - minAvail && mapRect.height > minAvail) {
    const k = Math.max(0, (mapRect.height - minAvail) / (p.top + p.bottom));
    p.top = Math.round(p.top * k);
    p.bottom = Math.round(p.bottom * k);
  }
  return p;
}

/** 현재 선택된 행정구역들의 통합 BBox 계산 */
function computeSelectedBounds(): [number, number, number, number] {
  const { step, selectedSidoCodes, selectedSigunguCodes, selectedEmdBySigungu } = useRegionStore.getState();
  const { byCode, emdBySigungu } = useGeoStore.getState();

  let codes: string[] = selectedSidoCodes;
  if (step >= 2 && selectedSigunguCodes.length > 0) {
    codes = selectedSigunguCodes;
  }
  if (step === 3 && selectedSigunguCodes.length > 0) {
    const emds = selectedSigunguCodes.flatMap((sg) => {
      const e = selectedEmdBySigungu[sg];
      const list = emdBySigungu[sg];
      if (!e) return [];
      if (e.isAllSelected || !list) return [sg];
      return e.checkedEmdCodes;
    });
    if (emds.length > 0) codes = emds;
  }

  const boxes = codes
    .map((c) => byCode[c]?.properties.bbox)
    .filter((b): b is [number, number, number, number] => Array.isArray(b) && b.length === 4);

  if (boxes.length === 0) return KOREA_BOUNDS;
  return boxes.reduce(
    (a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])],
    [boxes[0][0], boxes[0][1], boxes[0][2], boxes[0][3]] as [number, number, number, number],
  );
}

export function MapView({ layout, hoverCapable }: { layout: LayoutMode; hoverCapable: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [gpuTier] = useState<GpuTier>(() => detectGpuTier());
  const [tip, setTip] = useState<{ x: number; y: number; code: string; level: Level } | null>(null);
  const [panelRectKey, setPanelRectKey] = useState("");
  const planRef = useRef<Plan | null>(null);
  const hoverRef = useRef<{ level: Level; id: string } | null>(null);
  const envRef = useRef({ layout, hoverCapable });
  envRef.current = { layout, hoverCapable };

  const geo = useGeoStore();
  const region = useRegionStore();
  const count = useCountStore((s) => s.data);
  const padding = useUiStore((s) => s.mapPadding);
  const setMiniCard = useUiStore((s) => s.setMiniCard);

  // FR-14: 모바일(150개) / 데스크톱(500개) 및 저사양 GPU 티어 기반 동적 LOD 상한선
  const limit = layout === "mobile" || !hoverCapable || gpuTier === "low" ? LOD_LIMIT.mobile : LOD_LIMIT.desktop;

  // ---------- 렌더 계획 (단계·LOD·색상) ----------
  const plan: Plan = useMemo(() => {
    const { step, selectedSidoCodes, selectedSigunguCodes, sidoColor, selectedEmdBySigungu } = region;
    const sgg = step >= 2 ? selectedSidoCodes.flatMap((c) => geo.sigunguBySido[c] ?? []) : [];
    const emd = step >= 3 ? selectedSigunguCodes.flatMap((c) => geo.emdBySigungu[c] ?? []) : [];
    const state: Plan["state"] = {};
    let active: Level = step === 1 ? "sido" : step === 2 ? "sigungu" : "emd";
    let lod = false;
    let rawPolygonCount = active === "sido" ? geo.sido.length : active === "sigungu" ? sgg.length : emd.length;

    // FR-14: 폴리곤 상한선 초과 시 상위 행정구역 단위로 자동 병합
    if (active === "emd" && emd.length > limit) {
      rawPolygonCount = emd.length;
      active = "sigungu";
      lod = true;
    }
    if (active === "sigungu" && sgg.length > limit) {
      if (!lod) rawPolygonCount = sgg.length;
      active = "sido";
      lod = true;
    }

    if (active === "sido") {
      for (const f of geo.sido) {
        const c = f.properties.code;
        const selected =
          step === 1
            ? selectedSidoCodes.includes(c)
            : selectedSigunguCodes.some((s) => {
                if (!s.startsWith(c)) return false;
                if (step === 2) return true;
                const total = geo.emdBySigungu[s]?.length ?? 0;
                return sigunguState(region, s) !== "off" && (total === 0 || checkedEmdCount(region, s, total) > 0);
              });
        state[c] = { selected, color: sidoColor[c] ?? "#2563EB" };
      }
    } else if (active === "sigungu") {
      for (const f of sgg) {
        const c = f.properties.code;
        if (step === 2) {
          state[c] = {
            selected: selectedSigunguCodes.includes(c),
            color: sidoColor[c.slice(0, 2)] ?? "#2563EB",
          };
        } else {
          const total = geo.emdBySigungu[c]?.length ?? 0;
          state[c] = {
            selected: sigunguState(region, c) !== "off" && (total === 0 || checkedEmdCount(region, c, total) > 0),
            color: selectedEmdBySigungu[c]?.paletteColor ?? sidoColor[c.slice(0, 2)] ?? "#2563EB",
          };
        }
      }
    } else {
      for (const f of emd) {
        const c = f.properties.code;
        const sg = f.properties.sigungu ?? c.slice(0, 5);
        state[c] = {
          selected: isEmdChecked(region, sg, c),
          color: selectedEmdBySigungu[sg]?.paletteColor ?? sidoColor[c.slice(0, 2)] ?? "#2563EB",
        };
      }
    }

    const context = LEVELS.slice(0, LEVELS.indexOf(active)).filter((l) => l !== "emd");
    return {
      active,
      context,
      lod,
      rawPolygonCount,
      data: { sido: geo.sido, sigungu: sgg, emd: active === "emd" ? emd : [] },
      state,
    };
  }, [region, geo.sido, geo.sigunguBySido, geo.emdBySigungu, limit]);
  planRef.current = plan;

  // ---------- FR-12: .search-panel 및 지도 컨테이너 ResizeObserver 관찰 ----------
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const panelEl = document.querySelector<HTMLElement>(".search-panel");
    const mapEl = ref.current;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
      if (panelEl) {
        const r = panelEl.getBoundingClientRect();
        const collapsed = panelEl.classList.contains("is-collapsed") ? "1" : "0";
        setPanelRectKey(`${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}:${collapsed}`);
      }
    });
    if (panelEl) ro.observe(panelEl);
    if (mapEl) ro.observe(mapEl);
    return () => ro.disconnect();
  }, [layout]);

  // ---------- 지도 초기화 ----------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: STYLE_URL,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true, customAttribution: "행정경계 © admdongkor (CC BY 4.0)" },
      dragRotate: false,
      pitchWithRotate: false,
      localIdeographFontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      LEVELS.forEach((l) => addLevelLayers(map, l));

      // DRD 2.1: 폴리곤 중앙 행정구역명 + 매물 건수 배지 심볼 레이어 (흰색 텍스트 #FFFFFF + 1.5px 다크 Halo)
      map.addSource("labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "labels",
        type: "symbol",
        source: "labels",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12.5,
          "text-line-height": 1.25,
          "text-justify": "center",
          "text-anchor": "center",
          "text-allow-overlap": false,
          "text-padding": 2,
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "rgba(15,23,42,0.85)",
          "text-halo-width": 1.5,
          "text-halo-blur": 0.5,
        },
      });

      for (const lvl of LEVELS) {
        const layer = `${lvl}-fill`;

        // FR-11 데스크톱(마우스): 호버 시 0.65 불투명도 + 3px 외곽선 강조 및 커서 우측 상단 툴팁 노출
        map.on("mousemove", layer, (e: MapLayerMouseEvent) => {
          if (planRef.current?.active !== lvl) return;
          const orig = e.originalEvent as PointerEvent | undefined;
          if (orig?.pointerType === "touch" || !envRef.current.hoverCapable) return;
          const id = String(e.features?.[0]?.properties?.code ?? "");
          if (!id) return;
          const prev = hoverRef.current;
          if (prev && (prev.id !== id || prev.level !== lvl)) {
            map.setFeatureState({ source: prev.level, id: prev.id }, { hover: false });
          }
          map.setFeatureState({ source: lvl, id }, { hover: true });
          hoverRef.current = { level: lvl, id };
          map.getCanvas().style.cursor = "pointer";
          setTip({ x: e.point.x, y: e.point.y, code: id, level: lvl });
        });

        map.on("mouseleave", layer, () => {
          const prev = hoverRef.current;
          if (prev) map.setFeatureState({ source: prev.level, id: prev.id }, { hover: false });
          hoverRef.current = null;
          map.getCanvas().style.cursor = "";
          setTip(null);
        });

        // FR-11: 클릭/탭 시 선택·해제 토글, 모바일·태블릿(터치)에서는 하단 요약 미니 카드 노출
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          const p = planRef.current;
          if (!p || p.active !== lvl) return;
          const code = String(e.features?.[0]?.properties?.code ?? "");
          if (!code) return;

          handleToggle(lvl, code);

          const orig = e.originalEvent as PointerEvent | undefined;
          const isTouch =
            orig?.pointerType === "touch" ||
            orig?.pointerType === "pen" ||
            !envRef.current.hoverCapable ||
            envRef.current.layout !== "desktop" ||
            !window.matchMedia("(hover: hover)").matches;

          if (isTouch) {
            const prev = hoverRef.current;
            if (prev && (prev.id !== code || prev.level !== lvl)) {
              map.setFeatureState({ source: prev.level, id: prev.id }, { hover: false });
            }
            map.setFeatureState({ source: lvl, id: code }, { hover: true });
            hoverRef.current = { level: lvl, id: code };

            const f = useGeoStore.getState().byCode[code];
            if (f) setMiniCard({ feature: f, level: lvl });
          }
        });
      }
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 소스·가시성·feature-state 동기화 ----------
  const dataKey = useMemo(
    () =>
      LEVELS.map((l) => plan.data[l].length + ":" + (plan.data[l][0]?.properties.code ?? "")).join("|") +
      plan.data.sigungu.map((f) => f.properties.code).join(",") +
      plan.data.emd.map((f) => f.properties.code).join(","),
    [plan.data],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const l of LEVELS) (map.getSource(l) as GeoJSONSource).setData(fc(plan.data[l]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const l of LEVELS) {
      const active = l === plan.active;
      setVisible(map, `${l}-fill`, active);
      setVisible(map, `${l}-line-unsel`, active);
      setVisible(map, `${l}-line-sel`, active);
      setVisible(map, `${l}-line-hover`, active);
      setVisible(map, `${l}-ctx`, plan.context.includes(l));
    }
    const hov = hoverRef.current;
    for (const [id, st] of Object.entries(plan.state)) {
      const isHovered = hov?.level === plan.active && hov.id === id;
      map.setFeatureState({ source: plan.active, id }, { ...st, hover: isHovered });
    }
  }, [ready, plan, dataKey]);

  // ---------- DRD 2.1: 라벨 (행정구역명 + 매물 건수 배지) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const len = CODE_LEN[plan.active];
    const agg = new Map<string, number>();
    for (const c of count?.clusters ?? []) {
      const prefix = c.bjd_code.slice(0, len);
      agg.set(prefix, (agg.get(prefix) ?? 0) + c.count);
    }
    const feats = plan.data[plan.active]
      .filter((f) => plan.state[f.properties.code]?.selected)
      .map((f) => {
        const n = count ? (agg.get(f.properties.code) ?? 0) : null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point", coordinates: [f.properties.lx, f.properties.ly] } as Point,
          properties: {
            label: n != null ? `${f.properties.name}\n${n.toLocaleString()}건` : f.properties.name,
          },
        };
      });
    (map.getSource("labels") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
  }, [ready, plan, count]);

  // ---------- FR-12: 패널 가림 보정 뷰포트 정렬 (Dynamic FitBounds) ----------
  const fitKey = useMemo(() => {
    const { step, selectedSidoCodes, selectedSigunguCodes, selectedEmdBySigungu } = region;
    const sggLoaded = selectedSidoCodes.map((c) => (geo.sigunguBySido[c] ? 1 : 0)).join("");
    const emdKey =
      step === 3
        ? selectedSigunguCodes
            .map((c) => {
              const e = selectedEmdBySigungu[c];
              return `${c}:${e?.isAllSelected ? "*" : e?.checkedEmdCodes.join(".")}:${geo.emdBySigungu[c] ? 1 : 0}`;
            })
            .join(",")
        : "";
    return `${step}|${selectedSidoCodes.join(",")}|${sggLoaded}|${step >= 2 ? selectedSigunguCodes.join(",") : ""}|${emdKey}|${geo.sido.length}`;
  }, [region, geo.sido.length, geo.sigunguBySido, geo.emdBySigungu]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const t = setTimeout(() => {
      const b = computeSelectedBounds();
      const p = computeEffectivePadding(map.getContainer(), padding, layout);
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: p, duration: 500, maxZoom: 13.5 },
      );
    }, 120);
    return () => clearTimeout(t);
  }, [ready, fitKey, padding, layout, panelRectKey]);

  // ---------- 전체 한반도 보기 (뷰포트 리셋) 핸들러 ----------
  const handleResetViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const p = computeEffectivePadding(map.getContainer(), padding, layout);
    map.fitBounds(
      [
        [KOREA_BOUNDS[0], KOREA_BOUNDS[1]],
        [KOREA_BOUNDS[2], KOREA_BOUNDS[3]],
      ],
      { padding: p, duration: 500 },
    );
  }, [padding, layout]);

  // ---------- FR-11: 데스크톱 플로팅 툴팁 데이터 ----------
  const tipFeature = tip ? geo.byCode[tip.code] : null;
  const tipCount = useMemo(() => {
    if (!tip || !count) return null;
    return count.clusters.filter((c) => c.bjd_code.startsWith(tip.code)).reduce((a, c) => a + c.count, 0);
  }, [tip, count]);
  const tipSelected = tip ? Boolean(plan.state[tip.code]?.selected) : false;
  const tipPartial = useMemo(() => {
    if (!tip || tip.level !== "sigungu") return false;
    return sigunguState(region, tip.code) === "mixed";
  }, [tip, region]);

  return (
    <div className="map-container">
      <div ref={ref} className="map-canvas" />

      {/* 우측 상단 컨트롤 영역: 전체 한반도 보기(뷰포트 리셋) 버튼 */}
      <button
        type="button"
        className="map-reset-bounds-btn"
        onClick={handleResetViewport}
        title="전체 한반도 보기 (뷰포트 리셋)"
        aria-label="전체 한반도 보기 (뷰포트 리셋)"
        style={{
          position: "absolute",
          top: 10,
          right: 48,
          zIndex: 15,
          minHeight: 36,
          padding: "0 12px",
          background: "rgba(255, 255, 255, 0.96)",
          color: "#0f172a",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.12)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          backdropFilter: "blur(4px)",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 13 }}>
          🗺️
        </span>
        <span>전체 한반도 보기</span>
      </button>

      {/* FR-14: 디바이스 GPU 티어 기반 동적 LOD 안내 배지 */}
      {plan.lod && (
        <div className="lod-chip" role="status" aria-live="polite">
          성능 보호 모드 · 폴리곤 {plan.rawPolygonCount.toLocaleString()}개(상한 {limit}개 초과)로{" "}
          {plan.active === "sido" ? "시·도" : "시·군·구"} 단위 병합 표시
        </div>
      )}

      {/* FR-11: 데스크톱 호버 시 커서 우측 상단 플로팅 툴팁 (전체 경로명, 선택 여부, 실시간 매물 건수) */}
      {hoverCapable && tip && tipFeature && (
        <div
          className="map-tooltip"
          style={{
            left: tip.x + 14,
            top: Math.max(8, tip.y - 12),
            transform: tip.y > 64 ? "translateY(-100%)" : "none",
          }}
        >
          <strong>{fullRegionPath(tipFeature, geo.byCode)}</strong>
          <span>
            {tipPartial ? "일부 선택됨" : tipSelected ? "선택됨" : "미선택"}
            {tipCount != null
              ? tipSelected
                ? ` · 실시간 매물 ${tipCount.toLocaleString()}건`
                : " · 선택 시 매물 집계"
              : ""}
            {" · "}클릭하여 {tipSelected ? "해제" : "선택"}
          </span>
        </div>
      )}
    </div>
  );
}

/** 행정구역 전체 경로명 조합 (시·도 + 시·군·구 + 읍·면·동) */
function fullRegionPath(f: RegionFeature, byCode: Record<string, RegionFeature>): string {
  const code = f.properties.code;
  const parts: string[] = [];
  if (code.length > 2) {
    const sidoCode = f.properties.sido ?? code.slice(0, 2);
    const sido = byCode[sidoCode];
    if (sido) parts.push(sido.properties.name);
  }
  if (code.length > 5) {
    const sggCode = f.properties.sigungu ?? code.slice(0, 5);
    const sgg = byCode[sggCode];
    if (sgg) parts.push(sgg.properties.name);
  }
  parts.push(f.properties.name);
  return parts.join(" ");
}

/** 지도 클릭 → 리스트 선택 상태 양방향 동기화 */
function handleToggle(level: Level, code: string) {
  const s = useRegionStore.getState();
  if (level === "sido") {
    if (s.step === 1) s.toggleSido(code);
    else s.setSigunguGroup(code, !s.selectedSigunguCodes.some((c) => c.startsWith(code)));
  } else if (level === "sigungu") {
    if (s.step === 2) s.toggleSigungu(code);
    else s.setEmdGroup(code, sigunguState(s, code) !== "on");
  } else {
    s.toggleEmd(code.slice(0, 5), code);
  }
}
