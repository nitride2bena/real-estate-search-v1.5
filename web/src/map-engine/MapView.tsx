import { useEffect, useMemo, useRef, useState } from "react";
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
const LEVELS: Level[] = ["sido", "sigungu", "emd"];
const CODE_LEN: Record<Level, number> = { sido: 2, sigungu: 5, emd: 8 };
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

interface Plan {
  active: Level;
  context: Level[];
  lod: boolean;
  data: Record<Level, RegionFeature[]>;
  state: Record<string, { selected: boolean; color: string }>;
}

const fc = (features: RegionFeature[]) => ({ type: "FeatureCollection", features }) as FeatureCollection;

function addLevelLayers(map: maplibregl.Map, lvl: Level) {
  map.addSource(lvl, { type: "geojson", data: fc([]), promoteId: "code" });
  const sel = ["boolean", ["feature-state", "selected"], false] as const;
  const hov = ["boolean", ["feature-state", "hover"], false] as const;
  const color = ["coalesce", ["feature-state", "color"], "#2563EB"] as const;
  map.addLayer({
    id: `${lvl}-fill`, type: "fill", source: lvl, layout: { visibility: "none" },
    paint: {
      "fill-color": ["case", sel, color, "#2563EB"] as never,
      "fill-opacity": ["case", sel, ["case", hov, 0.65, 0.5], ["case", hov, 0.15, 0]] as never,
      "fill-opacity-transition": { duration: 150 },
    },
  });
  map.addLayer({
    id: `${lvl}-ctx`, type: "line", source: lvl, layout: { visibility: "none" },
    paint: { "line-color": "#334155", "line-width": 1.2, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: `${lvl}-line-unsel`, type: "line", source: lvl, layout: { visibility: "none" },
    paint: { "line-color": "#666666", "line-width": 1, "line-dasharray": [2, 2], "line-opacity": ["case", sel, 0, 0.3] as never },
  });
  map.addLayer({
    id: `${lvl}-line-sel`, type: "line", source: lvl, layout: { visibility: "none", "line-join": "round" },
    paint: { "line-color": color as never, "line-width": 2, "line-opacity": ["case", sel, 1, 0] as never },
  });
  map.addLayer({
    id: `${lvl}-line-hover`, type: "line", source: lvl, layout: { visibility: "none", "line-join": "round" },
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

export function MapView({ layout, hoverCapable }: { layout: LayoutMode; hoverCapable: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; code: string; level: Level } | null>(null);
  const planRef = useRef<Plan | null>(null);
  const hoverRef = useRef<{ level: Level; id: string } | null>(null);

  const geo = useGeoStore();
  const region = useRegionStore();
  const count = useCountStore((s) => s.data);
  const padding = useUiStore((s) => s.mapPadding);
  const setMiniCard = useUiStore((s) => s.setMiniCard);

  const limit = layout === "mobile" || !hoverCapable ? LOD_LIMIT.mobile : LOD_LIMIT.desktop;

  // ---------- 렌더 계획 (단계·LOD·색상) ----------
  const plan: Plan = useMemo(() => {
    const { step, selectedSidoCodes, selectedSigunguCodes, sidoColor, selectedEmdBySigungu } = region;
    const sgg = step >= 2 ? selectedSidoCodes.flatMap((c) => geo.sigunguBySido[c] ?? []) : [];
    const emd = step >= 3 ? selectedSigunguCodes.flatMap((c) => geo.emdBySigungu[c] ?? []) : [];
    const state: Plan["state"] = {};
    let active: Level = step === 1 ? "sido" : step === 2 ? "sigungu" : "emd";
    let lod = false;
    if (active === "sigungu" && sgg.length > limit) {
      active = "sido";
      lod = true;
    }
    if (active === "emd" && emd.length > limit) {
      active = "sigungu";
      lod = true;
    }

    if (active === "sido") {
      for (const f of geo.sido) {
        const c = f.properties.code;
        const selected = step === 1 ? selectedSidoCodes.includes(c) : selectedSigunguCodes.some((s) => s.startsWith(c));
        state[c] = { selected, color: sidoColor[c] ?? "#2563EB" };
      }
    } else if (active === "sigungu") {
      for (const f of sgg) {
        const c = f.properties.code;
        if (step === 2) state[c] = { selected: selectedSigunguCodes.includes(c), color: sidoColor[c.slice(0, 2)] };
        else {
          const total = geo.emdBySigungu[c]?.length ?? 0;
          state[c] = {
            selected: sigunguState(region, c) !== "off" && checkedEmdCount(region, c, total) > 0,
            color: selectedEmdBySigungu[c]?.paletteColor ?? "#2563EB",
          };
        }
      }
    } else {
      for (const f of emd) {
        const c = f.properties.code;
        const sg = f.properties.sigungu!;
        state[c] = { selected: isEmdChecked(region, sg, c), color: selectedEmdBySigungu[sg]?.paletteColor ?? "#2563EB" };
      }
    }
    const context = LEVELS.slice(0, LEVELS.indexOf(active)).filter((l) => l !== "emd");
    return { active, context, lod, data: { sido: geo.sido, sigungu: sgg, emd: active === "emd" ? emd : [] }, state };
  }, [region, geo.sido, geo.sigunguBySido, geo.emdBySigungu, limit]);
  planRef.current = plan;

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
      map.addSource("labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "labels", type: "symbol", source: "labels",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12.5,
          "text-line-height": 1.25,
          "text-allow-overlap": false,
          "text-padding": 2,
        },
        paint: { "text-color": "#FFFFFF", "text-halo-color": "rgba(15,23,42,0.85)", "text-halo-width": 1.5 },
      });

      for (const lvl of LEVELS) {
        const layer = `${lvl}-fill`;
        map.on("mousemove", layer, (e: MapLayerMouseEvent) => {
          if (planRef.current?.active !== lvl) return;
          const id = String(e.features?.[0]?.properties?.code ?? "");
          if (!id) return;
          const prev = hoverRef.current;
          if (prev && (prev.id !== id || prev.level !== lvl)) map.setFeatureState({ source: prev.level, id: prev.id }, { hover: false });
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
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          const p = planRef.current;
          if (!p || p.active !== lvl) return;
          const code = String(e.features?.[0]?.properties?.code ?? "");
          if (!code) return;
          handleToggle(lvl, code);
          const touch = (e.originalEvent as PointerEvent).pointerType === "touch" || !window.matchMedia("(hover: hover)").matches;
          if (touch) {
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
    () => LEVELS.map((l) => plan.data[l].length + ":" + (plan.data[l][0]?.properties.code ?? "")).join("|") +
      plan.data.sigungu.map((f) => f.properties.code).join(",") + plan.data.emd.map((f) => f.properties.code).join(","),
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
    for (const [id, st] of Object.entries(plan.state)) {
      map.setFeatureState({ source: plan.active, id }, st);
    }
  }, [ready, plan, dataKey]);

  // ---------- 라벨 (행정구역명 + 매물 건수 배지) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const len = CODE_LEN[plan.active];
    const agg = new Map<string, number>();
    for (const c of count?.clusters ?? []) agg.set(c.bjd_code.slice(0, len), (agg.get(c.bjd_code.slice(0, len)) ?? 0) + c.count);
    const feats = plan.data[plan.active]
      .filter((f) => plan.state[f.properties.code]?.selected)
      .map((f) => {
        const n = agg.get(f.properties.code);
        return {
          type: "Feature" as const,
          geometry: { type: "Point", coordinates: [f.properties.lx, f.properties.ly] } as Point,
          properties: { label: n != null ? `${f.properties.name}\n${n.toLocaleString()}건` : f.properties.name },
        };
      });
    (map.getSource("labels") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
  }, [ready, plan, count]);

  // ---------- FR-12 Dynamic FitBounds ----------
  const fitKey = useMemo(() => {
    const { step, selectedSidoCodes, selectedSigunguCodes, selectedEmdBySigungu } = region;
    const emdKey = step === 3
      ? selectedSigunguCodes.map((c) => {
          const e = selectedEmdBySigungu[c];
          return `${c}:${e?.isAllSelected ? "*" : e?.checkedEmdCodes.length}:${geo.emdBySigungu[c] ? 1 : 0}`;
        }).join(",")
      : "";
    return `${step}|${selectedSidoCodes.join(",")}|${step >= 2 ? selectedSigunguCodes.join(",") : ""}|${emdKey}`;
  }, [region, geo.emdBySigungu]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const t = setTimeout(() => {
      const { step, selectedSidoCodes, selectedSigunguCodes, selectedEmdBySigungu } = useRegionStore.getState();
      const byCode = useGeoStore.getState().byCode;
      let codes: string[] = selectedSidoCodes;
      if (step >= 2 && selectedSigunguCodes.length) codes = selectedSigunguCodes;
      if (step === 3 && selectedSigunguCodes.length) {
        const emds = selectedSigunguCodes.flatMap((sg) => {
          const e = selectedEmdBySigungu[sg];
          const list = useGeoStore.getState().emdBySigungu[sg];
          if (!e || !list) return [sg];
          return e.isAllSelected ? [sg] : e.checkedEmdCodes;
        });
        if (emds.length) codes = emds;
      }
      const boxes = codes.map((c) => byCode[c]?.properties.bbox).filter(Boolean) as [number, number, number, number][];
      const b = boxes.length
        ? boxes.reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])])
        : KOREA_BOUNDS;
      const { width, height } = map.getContainer().getBoundingClientRect();
      const p = { ...padding };
      // 패딩이 가시 영역을 넘지 않도록 보정
      if (p.left + p.right > width - 80) { const k = (width - 80) / (p.left + p.right); p.left *= k; p.right *= k; }
      if (p.top + p.bottom > height - 80) { const k = (height - 80) / (p.top + p.bottom); p.top *= k; p.bottom *= k; }
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: p, duration: 500, maxZoom: 13.5 });
    }, 120);
    return () => clearTimeout(t);
  }, [ready, fitKey, padding]);

  // ---------- 툴팁 내용 ----------
  const tipFeature = tip ? geo.byCode[tip.code] : null;
  const tipCount = useMemo(() => {
    if (!tip || !count) return null;
    return count.clusters.filter((c) => c.bjd_code.startsWith(tip.code)).reduce((a, c) => a + c.count, 0);
  }, [tip, count]);
  const tipSelected = tip ? plan.state[tip.code]?.selected : false;

  return (
    <div className="map-container">
      <div ref={ref} className="map-canvas" />
      {plan.lod && (
        <div className="lod-chip" role="status">
          성능 보호 모드 · 폴리곤 {limit}개 초과로 {plan.active === "sido" ? "시·도" : "시·군·구"} 단위 병합 표시
        </div>
      )}
      {hoverCapable && tip && tipFeature && (
        <div className="map-tooltip" style={{ left: tip.x + 14, top: tip.y - 14 }}>
          <strong>{parentName(tipFeature, geo.byCode)}{tipFeature.properties.name}</strong>
          <span>
            {tipSelected ? "선택됨" : "미선택"} · 클릭하여 {tipSelected ? "해제" : "선택"}
            {tipCount != null && tipSelected ? ` · ${tipCount.toLocaleString()}건` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function parentName(f: RegionFeature, byCode: Record<string, RegionFeature>) {
  const p = f.properties.sigungu ?? f.properties.sido;
  const parent = p ? byCode[p] : null;
  return parent ? `${parent.properties.name} ` : "";
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
