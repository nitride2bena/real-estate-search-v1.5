import { useEffect, useMemo, useState } from "react";
import { postSearch, type Property } from "../api/mockServer";
import {
  BUILDING_USE_LABEL,
  SQM_PER_PYEONG,
  ZONE_LABEL,
  formatMoney,
} from "../domain/constants";
import { buildCountRequest, useFilterStore } from "../state-store/filterStore";
import { buildRegionQuery, useRegionStore } from "../state-store/regionStore";
import { useUiStore } from "../state-store/uiStore";

const TRADE_LABEL = { SALE: "매매", JEONSE: "전세", MONTHLY: "월세" } as const;
type SortKey = "ppp_asc" | "price_asc" | "area_desc";

const SIDO_NAME_MAP: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
};

function getFullAddress(p: Property): { fullAddress: string; dongAddress: string } {
  const sidoPrefix = SIDO_NAME_MAP[p.bjd_code.slice(0, 2)] ?? "";
  const fullAddress = sidoPrefix ? `${sidoPrefix} ${p.address}` : p.address;
  const parts = p.address.split(" ");
  const dongPart = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : p.address;
  const dongAddress = sidoPrefix ? `${sidoPrefix} ${dongPart}` : dongPart;
  return { fullAddress, dongAddress };
}

export function ResultsModal() {
  const open = useUiStore((s) => s.resultsOpen);
  const setOpen = useUiStore((s) => s.setResultsOpen);
  const [data, setData] = useState<{
    total_count: number;
    items: Property[];
  } | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("ppp_asc");

  useEffect(() => {
    if (!open) return;
    setData(null);
    const c = new AbortController();
    const req = buildCountRequest(
      buildRegionQuery(useRegionStore.getState()),
      useFilterStore.getState(),
    );
    postSearch(req, 100, c.signal)
      .then(setData)
      .catch(() => {});
    return () => c.abort();
  }, [open]);

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    const copy = [...data.items];
    if (sortBy === "price_asc") {
      copy.sort((a, b) => a.price - b.price);
    } else if (sortBy === "area_desc") {
      copy.sort((a, b) => b.land_area_sqm - a.land_area_sqm);
    } else {
      copy.sort((a, b) => a.price_per_pyeong - b.price_per_pyeong);
    }
    return copy;
  }, [data, sortBy]);

  if (!open) return null;

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
            <h2>검색 결과</h2>
            <p className="tnum">
              {data
                ? `총 ${data.total_count.toLocaleString()}건 · 상위 ${data.items.length}건 표시`
                : "불러오는 중…"}
            </p>
          </div>
          <div className="modal-head-actions">
            <select
              className="modal-sort-select"
              aria-label="정렬 기준"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
            >
              <option value="ppp_asc">평당가 낮은 순</option>
              <option value="price_asc">가격 낮은 순</option>
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

        <ul className="result-list">
          {!data &&
            Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="skeleton result-skel" />
            ))}
          {data && sortedItems.length === 0 && (
            <li className="empty-filter-msg">
              조건에 맞는 매물이 없습니다.
            </li>
          )}
          {sortedItems.map((p) => (
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
              <div className="result-addr">{p.address}</div>
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

              {/* 매물 원본 정보 조회 외부 링크 모음 */}
              {(() => {
                const { fullAddress, dongAddress } = getFullAddress(p);
                return (
                  <div className="result-links">
                    <span className="links-title">원래 정보 조회:</span>
                    <a
                      href={`https://m.land.naver.com/search/result/${encodeURIComponent(dongAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-naver"
                      title="네이버 부동산 동 단위 매물 및 시세 검색 (새 창)"
                    >
                      네이버 부동산 ↗
                    </a>
                    <a
                      href={`https://map.naver.com/p/search/${encodeURIComponent(fullAddress)}?c=17.00,0,0,0,cadastral`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-cadastral"
                      title="네이버 지도 지적편집도 및 필지 경계선 조회 (새 창)"
                    >
                      지적편집도 ↗
                    </a>
                    <a
                      href={`https://www.valueupmap.com/search?q=${encodeURIComponent(fullAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-valuemap"
                      title="밸류맵 토지·건물 실거래가 및 토지이용계획 조회 (새 창)"
                    >
                      밸류맵 실거래 ↗
                    </a>
                    <a
                      href={`https://map.kakao.com/?q=${encodeURIComponent(fullAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-kakao"
                      title="카카오맵 위치 및 로드뷰 (새 창)"
                    >
                      카카오맵 ↗
                    </a>
                  </div>
                );
              })()}
            </li>
          ))}
        </ul>

        <p className="modal-foot">
          ※ 프로토타입용 가상 매물 데이터입니다. (법정동 10자리 표준 코드 기반)
        </p>
      </div>
    </div>
  );
}
