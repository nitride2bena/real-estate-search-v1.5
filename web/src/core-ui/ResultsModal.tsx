import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  postSearch,
  type Property,
  type SearchSort,
} from "../api/mockServer";
import {
  BUILDING_USE_LABEL,
  SQM_PER_PYEONG,
  TRADE_LABEL,
  ZONE_LABEL,
  formatMoney,
  type TradeType,
} from "../domain/constants";
import {
  formatPropertyShareText,
  getPropertyLinks,
} from "../domain/platformLinks";
import { MAX_COMPARE_COUNT, useBookmarkStore } from "../state-store/bookmarkStore";
import { buildCountRequest, useFilterStore } from "../state-store/filterStore";
import { buildRegionQuery, useRegionStore } from "../state-store/regionStore";
import { useUiStore } from "../state-store/uiStore";
import { copyTextToClipboard } from "./clipboard";
import { exportPropertiesToExcel } from "./excelExport";

const PAGE_SIZE = 50;

const MODAL_TRADE_FILTERS: Array<{ value: TradeType; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "SALE", label: "매매" },
  { value: "JEONSE", label: "전세" },
  { value: "MONTHLY", label: "월세" },
];

export function ResultsModal() {
  const open = useUiStore((s) => s.resultsOpen);
  const setOpen = useUiStore((s) => s.setResultsOpen);
  const setCompareOpen = useUiStore((s) => s.setCompareOpen);
  const showToast = useUiStore((s) => s.showToast);

  const {
    bookmarks,
    compareIds,
    toggleBookmark,
    toggleCompare,
    isBookmarked,
    isCompared,
  } = useBookmarkStore();

  const [items, setItems] = useState<Property[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<SearchSort>("ppp_asc");
  const [retrySeq, setRetrySeq] = useState(0);

  // 모달 내부 빠른 필터
  const [tradeFilter, setTradeFilter] = useState<TradeType>("ALL");
  const [keyword, setKeyword] = useState("");
  const [bookmarkOnly, setBookmarkOnly] = useState(false);
  const [expandedLinks, setExpandedLinks] = useState<Record<number, boolean>>({});

  const ctrlRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean, sort: SearchSort) => {
      ctrlRef.current?.abort();
      const c = new AbortController();
      ctrlRef.current = c;

      if (append) {
        setLoadingMore(true);
      } else {
        setStatus("loading");
      }

      try {
        const req = buildCountRequest(
          buildRegionQuery(useRegionStore.getState()),
          useFilterStore.getState(),
        );
        const res = await postSearch(
          req,
          { limit: PAGE_SIZE, offset, sort },
          c.signal,
        );
        if (c.signal.aborted) return;
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotalCount(res.total_count);
        setHasMore(res.has_more);
        setStatus("ready");
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setStatus("error");
        }
      } finally {
        if (!c.signal.aborted) {
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      ctrlRef.current?.abort();
      return;
    }
    setItems([]);
    setTotalCount(0);
    setHasMore(false);
    void fetchPage(0, false, sortBy);
    return () => {
      ctrlRef.current?.abort();
    };
  }, [open, sortBy, retrySeq, fetchPage]);

  const bookmarkIdSet = useMemo(
    () => new Set(bookmarks.map((b) => b.property_id)),
    [bookmarks],
  );

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((p) => {
      if (tradeFilter !== "ALL" && p.trade_type !== tradeFilter) return false;
      if (bookmarkOnly && !bookmarkIdSet.has(p.property_id)) return false;
      if (q) {
        const links = getPropertyLinks(p);
        const zoneText = p.land_use_zones
          .map((z) => ZONE_LABEL[z] ?? z)
          .join(" ");
        const useText =
          BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use;
        const haystack =
          `${links.fullAddress} ${p.emd_name} ${zoneText} ${useText}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, tradeFilter, bookmarkOnly, bookmarkIdSet, keyword]);

  if (!open) return null;

  const handleToggleCompare = (p: Property) => {
    const alreadyCompared = isCompared(p.property_id);
    if (!alreadyCompared && compareIds.length >= MAX_COMPARE_COUNT) {
      showToast(`비교함은 최대 ${MAX_COMPARE_COUNT}건까지 담을 수 있습니다`);
      return;
    }
    if (!alreadyCompared && !isBookmarked(p.property_id)) {
      toggleBookmark(p);
    }
    const ok = toggleCompare(p.property_id);
    if (!ok) {
      showToast(`비교함은 최대 ${MAX_COMPARE_COUNT}건까지 담을 수 있습니다`);
      return;
    }
    showToast(
      alreadyCompared
        ? "비교함에서 제외했습니다"
        : "비교함에 담았습니다 (관심 매물 자동 저장)",
    );
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="검색 결과"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2>
              검색 결과
              <span className="version-badge">v1.6</span>
            </h2>
            <p className="tnum">
              {status === "loading"
                ? "매물 데이터를 불러오는 중…"
                : status === "error"
                  ? "조회에 실패했습니다"
                  : `총 ${totalCount.toLocaleString()}건 중 ${items.length.toLocaleString()}건 로드 · 표시 ${filteredItems.length.toLocaleString()}건`}
            </p>
          </div>
          <div className="modal-head-actions">
            <button
              type="button"
              className="btn-header-pill"
              onClick={() => {
                setOpen(false);
                setCompareOpen(true);
              }}
              title="관심 매물 및 비교함 열기"
            >
              <span>★ 비교함</span>
              <span className="bookmark-count-badge tnum">
                {compareIds.length}/{MAX_COMPARE_COUNT}
              </span>
            </button>
            <button
              type="button"
              className="btn-export-excel"
              disabled={!filteredItems.length}
              onClick={() => {
                const n = exportPropertiesToExcel(filteredItems);
                showToast(`검색 매물 엑셀(${n}건)을 다운로드했습니다`);
              }}
              title="현재 목록 엑셀(.xlsx) 다운로드 (16컬럼 + 플랫폼 링크)"
            >
              <span aria-hidden="true">📥</span>
              <span>엑셀 다운로드</span>
            </button>
            {bookmarks.length > 0 && (
              <button
                type="button"
                className="btn-export-excel"
                onClick={() => {
                  const n = exportPropertiesToExcel(
                    bookmarks,
                    "부동산_관심매물목록",
                  );
                  showToast(`북마크 매물 엑셀(${n}건)을 다운로드했습니다`);
                }}
                title="저장된 관심 매물만 엑셀(.xlsx)로 내보내기"
              >
                <span aria-hidden="true">★</span>
                <span>북마크 엑셀 ({bookmarks.length})</span>
              </button>
            )}
            <select
              className="modal-sort-select"
              aria-label="정렬 기준"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SearchSort)}
            >
              <option value="ppp_asc">평당가 낮은 순</option>
              <option value="price_asc">가격 낮은 순</option>
              <option value="price_desc">가격 높은 순</option>
              <option value="area_desc">대지면적 넓은 순</option>
            </select>
            <button
              type="button"
              className="btn-icon"
              aria-label="닫기"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
        </header>

        {/* 모달 내부 필터 툴바 */}
        <div className="modal-toolbar">
          <div className="modal-toolbar-row">
            <input
              type="search"
              className="modal-search-input"
              placeholder="결과 내 주소·동·용도지역 검색…"
              aria-label="결과 내 키워드 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="modal-filter-pills" role="group" aria-label="거래유형 빠른 필터">
              {MODAL_TRADE_FILTERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tradeFilter === t.value}
                  className={`modal-pill ${tradeFilter === t.value ? "is-on" : ""}`}
                  onClick={() => setTradeFilter(t.value)}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={bookmarkOnly}
                className={`modal-pill ${bookmarkOnly ? "is-bookmark-on" : ""}`}
                onClick={() => setBookmarkOnly((v) => !v)}
              >
                ★ 북마크만
              </button>
            </div>
          </div>
        </div>

        <ul className="result-list">
          {status === "loading" &&
            Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="skeleton result-skel" />
            ))}

          {status === "error" && (
            <li className="modal-error-box">
              <span>매물 목록을 불러오는 중 오류가 발생했습니다.</span>
              <button
                type="button"
                className="btn-retry"
                onClick={() => setRetrySeq((n) => n + 1)}
              >
                ↻ 다시 시도
              </button>
            </li>
          )}

          {status === "ready" && filteredItems.length === 0 && (
            <li className="empty-filter-msg">
              {items.length === 0
                ? "조건에 맞는 매물이 없습니다."
                : "현재 모달 내 필터 조건에 일치하는 매물이 없습니다."}
            </li>
          )}

          {filteredItems.map((p) => {
            const links = getPropertyLinks(p);
            const bookmarked = isBookmarked(p.property_id);
            const compared = isCompared(p.property_id);
            const showExtraLinks = Boolean(expandedLinks[p.property_id]);

            return (
              <li key={p.property_id} className="result-card">
                <div className="result-top">
                  <span className={`trade trade-${p.trade_type}`}>
                    {TRADE_LABEL[p.trade_type]}
                  </span>
                  <strong className="tnum">
                    {p.trade_type === "MONTHLY"
                      ? `${formatMoney(p.price)} / 월 ${formatMoney(p.monthly_rent)}`
                      : formatMoney(p.price)}
                  </strong>
                  <span className="result-ppp tnum">
                    평당 {formatMoney(p.price_per_pyeong)}
                  </span>
                </div>
                <div className="result-addr">{links.fullAddress}</div>
                <div className="result-meta tnum">
                  대지 {Math.round(p.land_area_sqm).toLocaleString()}㎡ (
                  {Math.round(p.land_area_sqm / SQM_PER_PYEONG).toLocaleString()}
                  평)
                  {p.building_area_sqm > 0 &&
                    ` · 연면적 ${Math.round(p.building_area_sqm).toLocaleString()}㎡ (${Math.round(p.building_area_sqm / SQM_PER_PYEONG).toLocaleString()}평)`}
                  {` · ${BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use}`}
                </div>
                <div className="result-tags">
                  {p.land_use_zones.map((z) => (
                    <span key={z} className="tag">
                      {ZONE_LABEL[z] ?? z}
                    </span>
                  ))}
                </div>

                {/* 관심 매물 / 비교함 / 카톡·문자 공유 액션 */}
                <div className="result-card-actions">
                  <button
                    type="button"
                    aria-pressed={bookmarked}
                    className={`btn-card-action ${bookmarked ? "is-bookmarked" : ""}`}
                    onClick={() => {
                      toggleBookmark(p);
                      showToast(
                        bookmarked
                          ? "관심 매물에서 해제했습니다"
                          : "관심 매물로 저장했습니다",
                      );
                    }}
                  >
                    <span>{bookmarked ? "★" : "☆"}</span>
                    <span>{bookmarked ? "관심됨" : "관심 저장"}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={compared}
                    className={`btn-card-action ${compared ? "is-compared" : ""}`}
                    onClick={() => handleToggleCompare(p)}
                  >
                    <span>{compared ? "✓" : "+"}</span>
                    <span>{compared ? "비교함" : "비교함 담기"}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-card-action"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(
                        formatPropertyShareText(p),
                      );
                      showToast(
                        ok
                          ? "카톡/문자 공유용 매물 정보를 복사했습니다"
                          : "클립보드 복사에 실패했습니다",
                      );
                    }}
                  >
                    <span aria-hidden="true">📋</span>
                    <span>카톡/문자 공유복사</span>
                  </button>
                </div>

                {/* 매물 원본 정보 조회 외부 링크 모음 (4대 기본 + 접이식 확장 링크) */}
                <div className="result-links">
                  <span className="links-title">외부 조회:</span>
                  <a
                    href={links.naverLandUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-chip link-naver"
                    title="네이버페이 부동산 매물 및 단지 지도 (새 창)"
                  >
                    네이버 부동산 ↗
                  </a>
                  <a
                    href={links.cadastralUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-chip link-cadastral"
                    title="네이버 지도 지적편집도 및 필지 경계선 조회 (새 창)"
                  >
                    지적편집도 ↗
                  </a>
                  <a
                    href={links.valuemapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-chip link-valuemap"
                    title="밸류맵 토지·건물 실거래가 및 토지이용계획 조회 (새 창)"
                  >
                    밸류맵 실거래 ↗
                  </a>
                  <a
                    href={links.kakaoMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-chip link-kakao"
                    title="카카오맵 위치 및 로드뷰 (새 창)"
                  >
                    카카오맵 ↗
                  </a>
                  {showExtraLinks && (
                    <>
                      <a
                        href={links.hogangnonoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-chip link-hogangnono"
                        title="호갱노노 실거래·학군·호재 조회 (새 창)"
                      >
                        호갱노노 ↗
                      </a>
                      <a
                        href={links.asilUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-chip link-asil"
                        title="아실 실거래·매물 증감 조회 (새 창)"
                      >
                        아실 ↗
                      </a>
                      <a
                        href={links.kblandUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-chip link-kb"
                        title="KB부동산 시세·지도 조회 (새 창)"
                      >
                        KB부동산 ↗
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    className="link-more-toggle"
                    aria-expanded={showExtraLinks}
                    onClick={() =>
                      setExpandedLinks((prev) => ({
                        ...prev,
                        [p.property_id]: !prev[p.property_id],
                      }))
                    }
                  >
                    {showExtraLinks ? "접기 ▴" : "+ 호갱노노·아실·KB ▾"}
                  </button>
                </div>
              </li>
            );
          })}

          {status === "ready" && hasMore && (
            <li className="load-more-wrap">
              <button
                type="button"
                className="btn-load-more tnum"
                disabled={loadingMore}
                onClick={() => void fetchPage(items.length, true, sortBy)}
              >
                {loadingMore
                  ? "불러오는 중…"
                  : `더 보기 (${items.length.toLocaleString()} / ${totalCount.toLocaleString()}건)`}
              </button>
            </li>
          )}
        </ul>

        <p className="modal-foot">
          ※ 본 매물 데이터는 v1.6 검색 시뮬레이션용 가상 데이터입니다. (국토교통부 표준 법정동 8자리 코드 기반)
        </p>
      </div>
    </div>
  );
}
