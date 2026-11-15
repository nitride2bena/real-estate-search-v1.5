import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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

function getFullAddress(p: Property): {
  fullAddress: string;
  dongAddress: string;
  naverQuery: string;
  naverLandUrl: string;
  cadastralUrl: string;
  valuemapUrl: string;
  kakaoMapUrl: string;
} {
  const sidoPrefix = SIDO_NAME_MAP[p.bjd_code.slice(0, 2)] ?? "";
  const fullAddress = sidoPrefix ? `${sidoPrefix} ${p.address}` : p.address;
  const parts = p.address.split(" ");
  const sigungu = parts[0] || "";
  const dongRaw = parts[1] || "";
  const dongClean = dongRaw.replace(/(\d+)동$/, "동");
  const naverQuery = sigungu && dongClean ? `${sigungu} ${dongClean}` : p.address;
  const dongAddress = sidoPrefix ? `${sidoPrefix} ${sigungu} ${dongClean}` : naverQuery;

  // 공식 네이버페이 부동산 단지/매물 검색 URL (PC 및 모바일 완벽 호환)
  const naverLandUrl = `https://fin.land.naver.com/search?q=${encodeURIComponent(naverQuery)}`;
  const cadastralUrl = `https://map.naver.com/p/search/${encodeURIComponent(fullAddress)}?c=17.00,0,0,0,cadastral`;
  const valuemapUrl = `https://www.valueupmap.com/search?q=${encodeURIComponent(fullAddress)}`;
  const kakaoMapUrl = `https://map.kakao.com/?q=${encodeURIComponent(fullAddress)}`;

  return {
    fullAddress,
    dongAddress,
    naverQuery,
    naverLandUrl,
    cadastralUrl,
    valuemapUrl,
    kakaoMapUrl,
  };
}

/** 검색된 매물 목록 엑셀(.xlsx) 생성 및 다운로드 (네이버부동산 및 지적도/밸류맵 링크 포함) */
function exportToExcel(items: Property[]) {
  if (!items || items.length === 0) return;

  const rows = items.map((p, idx) => {
    const {
      fullAddress,
      naverLandUrl,
      cadastralUrl,
      valuemapUrl,
      kakaoMapUrl,
    } = getFullAddress(p);

    const landPyeong = Math.round(p.land_area_sqm / SQM_PER_PYEONG);
    const bldgPyeong =
      p.building_area_sqm > 0
        ? Math.round(p.building_area_sqm / SQM_PER_PYEONG)
        : 0;

    return {
      연번: idx + 1,
      소재지_주소: fullAddress,
      거래유형: TRADE_LABEL[p.trade_type],
      "가격(만원)": p.price,
      "월세(만원)": p.monthly_rent > 0 ? p.monthly_rent : 0,
      "평당가(만원)": p.price_per_pyeong,
      "대지면적(㎡)": Math.round(p.land_area_sqm),
      "대지면적(평)": landPyeong,
      "연면적(㎡)":
        p.building_area_sqm > 0 ? Math.round(p.building_area_sqm) : 0,
      "연면적(평)": bldgPyeong,
      용도지역: p.land_use_zones.map((z) => ZONE_LABEL[z] ?? z).join(", "),
      건축물주용도:
        BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use,
      네이버부동산_링크: naverLandUrl,
      지적편집도_링크: cadastralUrl,
      밸류맵실거래_링크: valuemapUrl,
      카카오맵_링크: kakaoMapUrl,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // 셀 하이퍼링크 객체 부여 (엑셀 내 클릭 시 바로 브라우저 오픈)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let R = 1; R <= range.e.r; ++R) {
    const p = items[R - 1];
    if (!p) continue;
    const {
      naverLandUrl,
      cadastralUrl,
      valuemapUrl,
      kakaoMapUrl,
    } = getFullAddress(p);

    // 컬럼 12: 네이버부동산, 13: 지적도, 14: 밸류맵, 15: 카카오맵
    const naverCell = XLSX.utils.encode_cell({ r: R, c: 12 });
    if (ws[naverCell]) {
      ws[naverCell].l = {
        Target: naverLandUrl,
        Tooltip: "네이버페이 부동산 매물/단지 지도 바로가기",
      };
    }
    const cadastralCell = XLSX.utils.encode_cell({ r: R, c: 13 });
    if (ws[cadastralCell]) {
      ws[cadastralCell].l = {
        Target: cadastralUrl,
        Tooltip: "네이버 지도 지적편집도 바로가기",
      };
    }
    const valuemapCell = XLSX.utils.encode_cell({ r: R, c: 14 });
    if (ws[valuemapCell]) {
      ws[valuemapCell].l = {
        Target: valuemapUrl,
        Tooltip: "밸류맵 토지·건물 실거래가 바로가기",
      };
    }
    const kakaoCell = XLSX.utils.encode_cell({ r: R, c: 15 });
    if (ws[kakaoCell]) {
      ws[kakaoCell].l = {
        Target: kakaoMapUrl,
        Tooltip: "카카오맵 위치 및 로드뷰 바로가기",
      };
    }
  }

  // 가독성을 위한 열 너비 지정
  ws["!cols"] = [
    { wch: 6 }, // 연번
    { wch: 30 }, // 소재지_주소
    { wch: 10 }, // 거래유형
    { wch: 14 }, // 가격
    { wch: 12 }, // 월세
    { wch: 14 }, // 평당가
    { wch: 14 }, // 대지면적(㎡)
    { wch: 14 }, // 대지면적(평)
    { wch: 14 }, // 연면적(㎡)
    { wch: 14 }, // 연면적(평)
    { wch: 20 }, // 용도지역
    { wch: 16 }, // 건축물주용도
    { wch: 42 }, // 네이버부동산_링크
    { wch: 42 }, // 지적편집도_링크
    { wch: 42 }, // 밸류맵실거래_링크
    { wch: 42 }, // 카카오맵_링크
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "부동산매물목록");

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `부동산_검색매물목록_${dateStr}.xlsx`);
}

export function ResultsModal() {
  const open = useUiStore((s) => s.resultsOpen);
  const setOpen = useUiStore((s) => s.setResultsOpen);
  const showToast = useUiStore((s) => s.showToast);
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
            <button
              type="button"
              className="btn-export-excel"
              disabled={!sortedItems.length}
              onClick={() => {
                exportToExcel(sortedItems);
                showToast(`엑셀 파일(${sortedItems.length}건)을 다운로드했습니다`);
              }}
              title="검색된 매물 목록 엑셀(.xlsx) 다운로드 (네이버부동산 및 지적도 링크 포함)"
            >
              <span aria-hidden="true">📥</span>
              <span>엑셀 다운로드</span>
            </button>
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
                const {
                  naverLandUrl,
                  cadastralUrl,
                  valuemapUrl,
                  kakaoMapUrl,
                } = getFullAddress(p);
                return (
                  <div className="result-links">
                    <span className="links-title">원래 정보 조회:</span>
                    <a
                      href={naverLandUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-naver"
                      title="네이버페이 부동산 매물 및 단지 지도 (새 창)"
                    >
                      네이버 부동산 ↗
                    </a>
                    <a
                      href={cadastralUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-cadastral"
                      title="네이버 지도 지적편집도 및 필지 경계선 조회 (새 창)"
                    >
                      지적편집도 ↗
                    </a>
                    <a
                      href={valuemapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-chip link-valuemap"
                      title="밸류맵 토지·건물 실거래가 및 토지이용계획 조회 (새 창)"
                    >
                      밸류맵 실거래 ↗
                    </a>
                    <a
                      href={kakaoMapUrl}
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
