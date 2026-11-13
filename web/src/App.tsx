import React, { useEffect } from "react";
import { useLayoutMode, useHoverCapable, useVisualViewportInset } from "./platform-bridge/viewport";
import { useGeoStore } from "./state-store/geoStore";
import { useUiStore } from "./state-store/uiStore";
import { useRegionStore } from "./state-store/regionStore";
import { useFilterStore } from "./state-store/filterStore";
import { MapView } from "./map-engine/MapView";
import { SearchPanel } from "./core-ui/SearchPanel";
import { ResultsModal } from "./core-ui/ResultsModal";

export function App() {
  const layout = useLayoutMode();
  const hoverCapable = useHoverCapable();
  useVisualViewportInset();

  const initGeo = useGeoStore((s) => s.init);
  const toast = useUiStore((s) => s.toast);
  const miniCard = useUiStore((s) => s.miniCard);
  const setMiniCard = useUiStore((s) => s.setMiniCard);
  const setResultsOpen = useUiStore((s) => s.setResultsOpen);
  const resetRegion = useRegionStore((s) => s.resetAll);
  const resetFilter = useFilterStore((s) => s.reset);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    initGeo();
  }, [initGeo]);

  // FR-17: 데스크톱 단축키 (Esc: 초기화, Enter: 매물 조회)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        resetRegion();
        resetFilter();
        showToast("모든 검색 조건을 초기화했습니다 (Esc)");
      } else if (e.key === "Enter") {
        setResultsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetRegion, resetFilter, showToast, setResultsOpen]);

  return (
    <div className="app-container">
      {/* 2분할/오버레이 사이드 패널 */}
      <SearchPanel layout={layout} />

      {/* MapLibre WebGL 지도 뷰 */}
      <MapView layout={layout} hoverCapable={hoverCapable} />

      {/* 매물 결과 모달 */}
      <ResultsModal />

      {/* 모바일 탭 미니 요약 카드 (FR-11) */}
      {miniCard && (
        <div className="mini-card" role="dialog">
          <div>
            <h4>{miniCard.feature.properties.name}</h4>
            <p>
              {miniCard.level === "sido" ? "시·도" : miniCard.level === "sigungu" ? "시·군·구" : "읍·면·동"} ·
              선택 상태가 변경되었습니다.
            </p>
          </div>
          <button
            type="button"
            className="btn-mini-close"
            onClick={() => setMiniCard(null)}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 전역 토스트 메시지 */}
      {toast && (
        <div key={toast.id} className="toast" role="alert">
          {toast.text}
        </div>
      )}
    </div>
  );
}
