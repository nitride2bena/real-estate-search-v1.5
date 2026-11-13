import React, { useEffect, useRef } from "react";
import { useRegionStore } from "../state-store/regionStore";
import { useFilterStore, activeFilterCount } from "../state-store/filterStore";
import { useGeoStore } from "../state-store/geoStore";
import { useUiStore } from "../state-store/uiStore";
import { Stepper, SidoStep, SigunguStep, EmdStep } from "./RegionSteps";
import { FilterTab } from "./FilterTab";
import { ActionBar } from "./ActionBar";
import type { LayoutMode } from "../platform-bridge/viewport";

export function SearchPanel({ layout }: { layout: LayoutMode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { tab, setTab, step, selectedSidoCodes, selectedSigunguCodes } = useRegionStore();
  const filters = useFilterStore();
  const geoPending = useGeoStore((s) => s.pending);
  const { drawerOpen, setDrawerOpen, sheetSnap, setSheetSnap, setResultsOpen, setMapPadding } = useUiStore();

  const filterCount = activeFilterCount(filters);
  const regionCount = selectedSigunguCodes.length || selectedSidoCodes.length;

  // DRD 3.1 & FR-12: 측정하여 맵 패딩 자동 동기화
  useEffect(() => {
    const updatePadding = () => {
      const h = window.innerHeight;
      if (layout === "desktop") {
        setMapPadding({ left: 420, right: 40, top: 40, bottom: 40 });
      } else if (layout === "tablet") {
        setMapPadding({ left: drawerOpen ? 380 : 40, right: 40, top: 40, bottom: 40 });
      } else {
        // mobile 3단 스냅: 0(15%), 1(50%), 2(90%)
        const snapRatios = [0.15, 0.5, 0.9];
        const bottomPad = Math.round(h * snapRatios[sheetSnap]) + 20;
        setMapPadding({ left: 20, right: 20, top: 20, bottom: bottomPad });
      }
    };
    updatePadding();
    window.addEventListener("resize", updatePadding);
    return () => window.removeEventListener("resize", updatePadding);
  }, [layout, drawerOpen, sheetSnap, setMapPadding]);

  // 바텀 시트 높이 클래스
  const snapClass = `snap-${sheetSnap}`;

  return (
    <aside
      ref={panelRef}
      className={`search-panel layout-${layout} ${snapClass} ${drawerOpen ? "is-open" : "is-collapsed"}`}
    >
      {/* 모바일 3단 스냅 헤더 핸들바 (48px 터치 영역) */}
      {layout === "mobile" && (
        <div
          className="sheet-handle-bar"
          onClick={() => setSheetSnap(((sheetSnap + 1) % 3) as 0 | 1 | 2)}
          aria-label="바텀 시트 높이 전환"
        >
          <div className="sheet-handle-pill" />
        </div>
      )}

      {/* 태블릿 드로어 접기/펼치기 토글 버튼 */}
      {layout === "tablet" && (
        <button
          type="button"
          className="drawer-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label={drawerOpen ? "패널 접기" : "패널 열기"}
        >
          {drawerOpen ? "◀" : "▶"}
        </button>
      )}

      <header className="panel-header">
        <div className="main-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "region"}
            className={`tab-btn ${tab === "region" ? "is-active" : ""}`}
            onClick={() => setTab("region")}
          >
            지역 선택
            {regionCount > 0 && <span className="tab-badge">지역 {regionCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "filter"}
            className={`tab-btn ${tab === "filter" ? "is-active" : ""}`}
            onClick={() => setTab("filter")}
          >
            상세 조건
            {filterCount > 0 && <span className="tab-badge">필터 {filterCount}</span>}
          </button>
        </div>
        {geoPending > 0 && (
          <div className="floating-loading-pill" role="status">
            <span className="spinner-sm" /> 행정구역 경계 불러오는 중...
          </div>
        )}
      </header>

      <div className="panel-scroll-area">
        {tab === "region" ? (
          <div className="region-view">
            <Stepper />
            {step === 1 && <SidoStep />}
            {step === 2 && <SigunguStep />}
            {step === 3 && <EmdStep />}
          </div>
        ) : (
          <FilterTab />
        )}
      </div>

      <footer className="panel-footer">
        <ActionBar onSearch={() => setResultsOpen(true)} />
      </footer>
    </aside>
  );
}
