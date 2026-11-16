import { useMemo } from "react";
import {
  BUILDING_USE_LABEL,
  SQM_PER_PYEONG,
  TRADE_LABEL,
  ZONE_LABEL,
  formatMoney,
} from "../domain/constants";
import {
  formatCompareShareText,
  getPropertyLinks,
} from "../domain/platformLinks";
import {
  MAX_COMPARE_COUNT,
  useBookmarkStore,
} from "../state-store/bookmarkStore";
import { useUiStore } from "../state-store/uiStore";
import { copyTextToClipboard } from "./clipboard";
import { exportPropertiesToExcel } from "./excelExport";

/**
 * 관심 매물(북마크) 관리 및 최대 4건 나란히 비교 모달 (v1.6)
 */
export function BookmarkCompareModal() {
  const compareOpen = useUiStore((s) => s.compareOpen);
  const bookmarksOpen = useUiStore((s) => s.bookmarksOpen);
  const setCompareOpen = useUiStore((s) => s.setCompareOpen);
  const setBookmarksOpen = useUiStore((s) => s.setBookmarksOpen);
  const showToast = useUiStore((s) => s.showToast);

  const {
    bookmarks,
    compareIds,
    removeBookmark,
    clearBookmarks,
    toggleCompare,
    isCompared,
    clearCompare,
  } = useBookmarkStore();

  const open = compareOpen || bookmarksOpen;

  const close = () => {
    setCompareOpen(false);
    setBookmarksOpen(false);
  };

  const compareItems = useMemo(() => {
    const map = new Map(bookmarks.map((b) => [b.property_id, b]));
    return compareIds
      .map((id) => map.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [bookmarks, compareIds]);

  // 비교함에 선택된 매물이 없으면 저장된 북마크 상위 최대 4건 미리보기 제공
  const tableItems = useMemo(
    () =>
      compareItems.length > 0
        ? compareItems
        : bookmarks.slice(0, MAX_COMPARE_COUNT),
    [compareItems, bookmarks],
  );

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="관심 매물 및 비교함"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2>
              관심 매물 &amp; 비교함
              <span className="version-badge tnum">
                저장 {bookmarks.length} · 비교 {compareItems.length}/{MAX_COMPARE_COUNT}
              </span>
            </h2>
            <p>
              관심 매물을 관리하고 최대 {MAX_COMPARE_COUNT}개 매물을 나란히 비교할 수 있습니다.
            </p>
          </div>
          <div className="modal-head-actions">
            <button
              type="button"
              className="btn-card-action"
              disabled={!tableItems.length}
              onClick={async () => {
                const text = formatCompareShareText(tableItems);
                const ok = await copyTextToClipboard(text);
                showToast(
                  ok
                    ? `비교 요약 텍스트(${tableItems.length}건)를 복사했습니다`
                    : "클립보드 복사에 실패했습니다",
                );
              }}
            >
              <span aria-hidden="true">📋</span>
              <span>비교 공유복사</span>
            </button>
            <button
              type="button"
              className="btn-export-excel"
              disabled={!bookmarks.length}
              onClick={() => {
                const n = exportPropertiesToExcel(
                  bookmarks,
                  "부동산_관심매물목록",
                );
                showToast(`관심 매물 엑셀(${n}건)을 다운로드했습니다`);
              }}
            >
              <span aria-hidden="true">📥</span>
              <span>북마크 엑셀</span>
            </button>
            <button
              type="button"
              className="btn-icon"
              aria-label="닫기"
              onClick={close}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="compare-body">
          {bookmarks.length === 0 ? (
            <div className="compare-empty">
              <p>저장된 관심 매물이 없습니다.</p>
              <p>검색 결과에서 ☆ 관심 저장 또는 비교함 담기를 눌러 추가해보세요.</p>
            </div>
          ) : (
            <>
              {/* 1. 나란히 비교 테이블 */}
              <section aria-label="매물 비교표">
                <div className="f-head" style={{ marginBottom: 8 }}>
                  <h4>
                    매물 비교표{" "}
                    <small className="tnum">
                      {compareItems.length > 0
                        ? `선택된 ${compareItems.length}건 비교 중`
                        : `비교 체크가 없어 최근 저장 ${tableItems.length}건 미리보기`}
                    </small>
                  </h4>
                  {compareItems.length > 0 && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        clearCompare();
                        showToast("비교 선택을 초기화했습니다");
                      }}
                    >
                      비교 선택 비우기
                    </button>
                  )}
                </div>

                <div className="compare-table-wrap">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th scope="col">비교 항목</th>
                        {tableItems.map((p, idx) => {
                          const links = getPropertyLinks(p);
                          return (
                            <th key={p.property_id} scope="col">
                              <div>매물 {idx + 1}</div>
                              <div style={{ fontWeight: 500, fontSize: 12 }}>
                                {links.fullAddress}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">소재지</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id}>
                            {getPropertyLinks(p).fullAddress}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">거래유형 / 가격</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id} className="tnum">
                            <span className={`trade trade-${p.trade_type}`}>
                              {TRADE_LABEL[p.trade_type]}
                            </span>{" "}
                            <strong>
                              {p.trade_type === "MONTHLY"
                                ? `${formatMoney(p.price)} / 월 ${formatMoney(p.monthly_rent)}`
                                : formatMoney(p.price)}
                            </strong>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">평당가</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id} className="tnum">
                            평당 {formatMoney(p.price_per_pyeong)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">대지면적</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id} className="tnum">
                            {Math.round(p.land_area_sqm).toLocaleString()}㎡ (
                            {Math.round(
                              p.land_area_sqm / SQM_PER_PYEONG,
                            ).toLocaleString()}
                            평)
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">연면적</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id} className="tnum">
                            {p.building_area_sqm > 0
                              ? `${Math.round(p.building_area_sqm).toLocaleString()}㎡ (${Math.round(p.building_area_sqm / SQM_PER_PYEONG).toLocaleString()}평)`
                              : "나대지 (0㎡)"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">용도지역</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id}>
                            {p.land_use_zones
                              .map((z) => ZONE_LABEL[z] ?? z)
                              .join(", ")}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">건축물 주용도</th>
                        {tableItems.map((p) => (
                          <td key={p.property_id}>
                            {BUILDING_USE_LABEL[p.building_main_use] ??
                              p.building_main_use}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">플랫폼 링크</th>
                        {tableItems.map((p) => {
                          const links = getPropertyLinks(p);
                          return (
                            <td key={p.property_id}>
                              <div className="modal-filter-pills">
                                <a
                                  href={links.naverLandUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-naver"
                                >
                                  네이버 ↗
                                </a>
                                <a
                                  href={links.cadastralUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-cadastral"
                                >
                                  지적도 ↗
                                </a>
                                <a
                                  href={links.valuemapUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-valuemap"
                                >
                                  밸류맵 ↗
                                </a>
                                <a
                                  href={links.kakaoMapUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-kakao"
                                >
                                  카카오 ↗
                                </a>
                                <a
                                  href={links.hogangnonoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-hogangnono"
                                >
                                  호갱노노 ↗
                                </a>
                                <a
                                  href={links.asilUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-asil"
                                >
                                  아실 ↗
                                </a>
                                <a
                                  href={links.kblandUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link-chip link-kb"
                                >
                                  KB ↗
                                </a>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 2. 저장된 북마크 매물 관리 리스트 */}
              <section aria-label="저장된 관심 매물 목록">
                <div className="f-head" style={{ marginBottom: 8 }}>
                  <h4>
                    저장된 관심 매물 목록{" "}
                    <small className="tnum">({bookmarks.length}건)</small>
                  </h4>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      clearBookmarks();
                      showToast("모든 관심 매물을 삭제했습니다");
                    }}
                  >
                    전체 삭제
                  </button>
                </div>
                <ul style={{ listStyle: "none" }}>
                  {bookmarks.map((p) => {
                    const links = getPropertyLinks(p);
                    const checked = isCompared(p.property_id);
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
                          대지 {Math.round(p.land_area_sqm).toLocaleString()}㎡ ·{" "}
                          {BUILDING_USE_LABEL[p.building_main_use] ??
                            p.building_main_use}
                        </div>
                        <div className="result-card-actions">
                          <button
                            type="button"
                            aria-pressed={checked}
                            className={`btn-card-action ${checked ? "is-compared" : ""}`}
                            onClick={() => {
                              const ok = toggleCompare(p.property_id);
                              if (!ok) {
                                showToast(
                                  `비교함은 최대 ${MAX_COMPARE_COUNT}건까지 선택할 수 있습니다`,
                                );
                              }
                            }}
                          >
                            <span>{checked ? "✓" : "+"}</span>
                            <span>{checked ? "비교 중" : "비교 선택"}</span>
                          </button>
                          <button
                            type="button"
                            className="btn-card-action"
                            onClick={() => {
                              removeBookmark(p.property_id);
                              showToast("관심 매물에서 삭제했습니다");
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>

        <p className="modal-foot">
          ※ 관심 매물과 비교 목록은 브라우저 LocalStorage에 저장됩니다.
        </p>
      </div>
    </div>
  );
}
