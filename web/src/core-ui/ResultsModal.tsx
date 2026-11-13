import { useEffect, useState } from "react";
import { postSearch, type Property } from "../api/mockServer";
import { BUILDING_USE_LABEL, SQM_PER_PYEONG, ZONE_LABEL, formatMoney } from "../domain/constants";
import { buildCountRequest, useFilterStore } from "../state-store/filterStore";
import { buildRegionQuery, useRegionStore } from "../state-store/regionStore";
import { useUiStore } from "../state-store/uiStore";

const TRADE_LABEL = { SALE: "매매", JEONSE: "전세", MONTHLY: "월세" } as const;

export function ResultsModal() {
  const open = useUiStore((s) => s.resultsOpen);
  const setOpen = useUiStore((s) => s.setResultsOpen);
  const [data, setData] = useState<{ total_count: number; items: Property[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    const c = new AbortController();
    const req = buildCountRequest(buildRegionQuery(useRegionStore.getState()), useFilterStore.getState());
    postSearch(req, 100, c.signal).then(setData).catch(() => {});
    return () => c.abort();
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="검색 결과" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>검색 결과</h2>
            <p className="tnum">{data ? `총 ${data.total_count.toLocaleString()}건 · 평당가 낮은 순 상위 ${data.items.length}건` : "불러오는 중…"}</p>
          </div>
          <button type="button" className="btn-icon" aria-label="닫기" onClick={() => setOpen(false)}>✕</button>
        </header>
        <ul className="result-list">
          {!data && Array.from({ length: 6 }, (_, i) => <li key={i} className="skeleton result-skel" />)}
          {data?.items.map((p) => (
            <li key={p.property_id} className="result-card">
              <div className="result-top">
                <span className={`trade trade-${p.trade_type}`}>{TRADE_LABEL[p.trade_type]}</span>
                <strong className="tnum">
                  {p.trade_type === "MONTHLY" ? `${formatMoney(p.price)} / ${formatMoney(p.monthly_rent)}` : formatMoney(p.price)}
                </strong>
                <span className="result-ppp tnum">평당 {formatMoney(p.price_per_pyeong)}</span>
              </div>
              <div className="result-addr">{p.address}</div>
              <div className="result-meta tnum">
                대지 {Math.round(p.land_area_sqm).toLocaleString()}㎡ ({Math.round(p.land_area_sqm / SQM_PER_PYEONG).toLocaleString()}평)
                {p.building_area_sqm > 0 && ` · 연면적 ${Math.round(p.building_area_sqm).toLocaleString()}㎡`}
                {` · ${BUILDING_USE_LABEL[p.building_main_use]}`}
              </div>
              <div className="result-tags">
                {p.land_use_zones.map((z) => <span key={z} className="tag">{ZONE_LABEL[z]}</span>)}
              </div>
            </li>
          ))}
        </ul>
        <p className="modal-foot">※ 프로토타입용 가상 매물 데이터입니다.</p>
      </div>
    </div>
  );
}
