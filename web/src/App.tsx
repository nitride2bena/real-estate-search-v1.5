import { useEffect } from "react";
import {
  useLayoutMode,
  useHoverCapable,
  useVisualViewportInset,
} from "./platform-bridge/viewport";
import { useGeoStore } from "./state-store/geoStore";
import { useUiStore } from "./state-store/uiStore";
import {
  isEmdChecked,
  sigunguState,
  useRegionStore,
} from "./state-store/regionStore";
import { useCountStore, useFilterStore } from "./state-store/filterStore";
import { MapView } from "./map-engine/MapView";
import { SearchPanel } from "./core-ui/SearchPanel";
import { ResultsModal } from "./core-ui/ResultsModal";

export function App() {
  const layout = useLayoutMode();
  const hoverCapable = useHoverCapable();
  useVisualViewportInset();

  const initGeo = useGeoStore((s) => s.init);
  const geoPending = useGeoStore((s) => s.pending);
  const toast = useUiStore((s) => s.toast);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const resultsOpen = useUiStore((s) => s.resultsOpen);
  const miniCard = useUiStore((s) => s.miniCard);
  const setMiniCard = useUiStore((s) => s.setMiniCard);
  const setResultsOpen = useUiStore((s) => s.setResultsOpen);
  const showToast = useUiStore((s) => s.showToast);

  const region = useRegionStore();
  const resetRegion = useRegionStore((s) => s.resetAll);
  const resetFilter = useFilterStore((s) => s.reset);
  const countData = useCountStore((s) => s.data);

  useEffect(() => {
    void initGeo();
  }, [initGeo]);

  // FR-17: 데스크톱 단축키 (Esc: 초기화, Enter: 매물 조회)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (resultsOpen) {
          setResultsOpen(false);
          return;
        }
        resetRegion();
        resetFilter();
        setMiniCard(null);
        showToast("모든 검색 조건을 초기화했습니다 (Esc)");
      } else if (e.key === "Enter") {
        setResultsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    resultsOpen,
    resetRegion,
    resetFilter,
    setMiniCard,
    showToast,
    setResultsOpen,
  ]);

  // 미니 카드 선택 여부 및 실시간 매물 건수 계산
  const miniCardCode = miniCard?.feature.properties.code ?? "";
  const miniCardSelected = miniCard
    ? miniCard.level === "sido"
      ? region.selectedSidoCodes.includes(miniCardCode)
      : miniCard.level === "sigungu"
        ? sigunguState(region, miniCardCode) !== "off"
        : isEmdChecked(region, miniCardCode.slice(0, 5), miniCardCode)
    : false;

  const miniCardCount =
    miniCard && countData
      ? countData.clusters
          .filter((c) => c.bjd_code.startsWith(miniCardCode))
          .reduce((acc, c) => acc + c.count, 0)
      : null;

  return (
    <div className="app-container">
      {/* 단일 DOM 기반 3단계 반응형 검색 조건 패널 */}
      <SearchPanel layout={layout} />

      {/* MapLibre GL JS WebGL 지도 뷰 */}
      <MapView layout={layout} hoverCapable={hoverCapable} />

      {/* DRD 4.4: 지도 경계 로딩 중 배경 지도를 가리지 않는 지도 상단 중앙 반투명 플로팅 필 */}
      {geoPending > 0 && (
        <div
          className={`floating-loading-pill layout-${layout} ${drawerOpen ? "is-drawer-open" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="spinner-sm" aria-hidden="true" />
          <span>행정구역 경계 불러오는 중...</span>
        </div>
      )}

      {/* 매물 결과 모달 */}
      <ResultsModal />

      {/* FR-11: 모바일·태블릿 탭 미니 요약 카드 */}
      {miniCard && (
        <div
          className={`mini-card layout-${layout}`}
          role="dialog"
          aria-label="선택 행정구역 요약"
        >
          <div className="mini-card-body">
            <h4>{miniCard.feature.properties.name}</h4>
            <p className="tnum">
              {miniCard.level === "sido"
                ? "시·도"
                : miniCard.level === "sigungu"
                  ? "시·군·구"
                  : "읍·면·동"}{" "}
              · {miniCardSelected ? "선택됨" : "선택 해제됨"}
              {miniCardSelected && miniCardCount != null
                ? ` · 매물 ${miniCardCount.toLocaleString()}건`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn-mini-close"
            onClick={() => setMiniCard(null)}
            aria-label="미니 카드 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 전역 토스트 메시지 */}
      {toast && (
        <div key={toast.id} className="toast" role="alert" aria-live="assertive">
          {toast.text}
        </div>
      )}
    </div>
  );
}
