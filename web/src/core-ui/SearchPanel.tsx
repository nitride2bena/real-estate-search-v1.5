import React, { useEffect, useRef } from "react";
import { useRegionStore } from "../state-store/regionStore";
import { useFilterStore, activeFilterCount } from "../state-store/filterStore";
import { useUiStore } from "../state-store/uiStore";
import { Stepper, SidoStep, SigunguStep, EmdStep } from "./RegionSteps";
import { FilterTab } from "./FilterTab";
import { ActionBar } from "./ActionBar";
import {
  shareSearchUrl,
  type LayoutMode,
} from "../platform-bridge/viewport";

export function SearchPanel({ layout }: { layout: LayoutMode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartSnap = useRef<0 | 1 | 2>(1);

  const { tab, setTab, step, selectedSidoCodes, selectedSigunguCodes } =
    useRegionStore();
  const filters = useFilterStore();
  const {
    drawerOpen,
    setDrawerOpen,
    sheetSnap,
    setSheetSnap,
    setResultsOpen,
    setMapPadding,
    showToast,
  } = useUiStore();

  const filterCount = activeFilterCount(filters);
  const regionCount =
    selectedSigunguCodes.length > 0
      ? selectedSigunguCodes.length
      : selectedSidoCodes.length;

  // DRD 3.1 & FR-12: 디바이스 레이아웃 및 패널 상태에 따른 지도 중심점 패딩 동기화
  useEffect(() => {
    const updatePadding = () => {
      const h = window.innerHeight;
      if (layout === "desktop") {
        setMapPadding({ left: 420, right: 40, top: 40, bottom: 40 });
      } else if (layout === "tablet") {
        setMapPadding({
          left: drawerOpen ? 380 : 40,
          right: 40,
          top: 40,
          bottom: 40,
        });
      } else {
        // 모바일 3단 스냅: 0(15%), 1(50%), 2(90%)
        const snapHeights = [
          Math.max(140, Math.round(h * 0.15)),
          Math.round(h * 0.5),
          Math.round(h * 0.9),
        ];
        setMapPadding({
          left: 20,
          right: 20,
          top: 20,
          bottom: snapHeights[sheetSnap] + 20,
        });
      }
    };
    updatePadding();
    window.addEventListener("resize", updatePadding);
    return () => window.removeEventListener("resize", updatePadding);
  }, [layout, drawerOpen, sheetSnap, setMapPadding]);

  // DRD 3.2: 모바일 상단 48px 핸들바 드래그 & 탭 전환 핸들러
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    dragStartSnap.current = sheetSnap;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const dy = dragStartY.current - e.clientY; // 위로 드래그 시 양수(+), 아래로 드래그 시 음수(-)
    dragStartY.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (Math.abs(dy) < 12) {
      // 짧은 탭: 0 -> 1 -> 2 -> 0 순환 전환
      setSheetSnap(((sheetSnap + 1) % 3) as 0 | 1 | 2);
      return;
    }

    const h = window.innerHeight || 800;
    if (dy > h * 0.28) {
      setSheetSnap(2);
    } else if (dy > 32) {
      setSheetSnap(Math.min(2, dragStartSnap.current + 1) as 0 | 1 | 2);
    } else if (dy < -h * 0.28) {
      setSheetSnap(0);
    } else if (dy < -32) {
      setSheetSnap(Math.max(0, dragStartSnap.current - 1) as 0 | 1 | 2);
    }
  };

  const snapClass = `snap-${sheetSnap}`;

  return (
    <aside
      ref={panelRef}
      className={`search-panel layout-${layout} ${snapClass} ${drawerOpen ? "is-open" : "is-collapsed"}`}
      aria-label="검색 조건 설정 패널"
    >
      {/* 모바일 3단 스냅 헤더 핸들바 (48px 터치 영역 · 드래그 및 탭 전환) */}
      {layout === "mobile" && (
        <div
          className="sheet-handle-bar"
          role="button"
          tabIndex={0}
          aria-label="바텀 시트 높이 전환 (15% / 50% / 90%)"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSheetSnap(((sheetSnap + 1) % 3) as 0 | 1 | 2);
            }
          }}
        >
          <div className="sheet-handle-pill" />
          <span className="sheet-snap-hint tnum">
            {sheetSnap === 0
              ? `선택 지역 ${regionCount} · 위로 당겨 펼치기`
              : sheetSnap === 1
                ? "50% 기본 보기"
                : "90% 전체 확장"}
          </span>
        </div>
      )}

      {/* 태블릿 드로어 접기/펼치기 토글 버튼 (44px 이상 터치 타겟) */}
      {layout === "tablet" && (
        <button
          type="button"
          className="drawer-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label={drawerOpen ? "패널 접기" : "패널 열기"}
          title={drawerOpen ? "패널 접기" : "패널 열기"}
        >
          {drawerOpen ? "◀" : "▶"}
        </button>
      )}

      {/* DRD 4.1: 상단 메인 탭 + 우측 검색 조건 URL 공유 버튼 (FR-17) */}
      <header className="panel-header">
        <div className="header-top-row">
          <div className="main-tabs" role="tablist" aria-label="검색 조건 구분">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "region"}
              className={`tab-btn ${tab === "region" ? "is-active" : ""}`}
              onClick={() => setTab("region")}
            >
              <span>지역 선택</span>
              {regionCount > 0 && (
                <span className="tab-badge tnum">지역 {regionCount}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "filter"}
              className={`tab-btn ${tab === "filter" ? "is-active" : ""}`}
              onClick={() => setTab("filter")}
            >
              <span>상세 조건</span>
              {filterCount > 0 && (
                <span className="tab-badge tnum">필터 {filterCount}</span>
              )}
            </button>
          </div>

          <button
            type="button"
            className="btn-share"
            aria-label="검색 조건 URL 공유"
            title="현재 검색 조건 URL 복사 및 공유"
            onClick={() => {
              void shareSearchUrl(showToast);
            }}
          >
            <span aria-hidden="true">🔗</span>
            <span>공유</span>
          </button>
        </div>
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
