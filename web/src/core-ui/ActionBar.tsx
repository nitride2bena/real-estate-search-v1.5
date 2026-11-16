import React, { useEffect, useRef, useState } from "react";
import { postCount } from "../api/mockServer";
import {
  buildCountRequest,
  useCountStore,
  useFilterStore,
} from "../state-store/filterStore";
import { buildRegionQuery, useRegionStore } from "../state-store/regionStore";
import { useUiStore } from "../state-store/uiStore";

/** 카운트업 애니메이션 숫자 (DRD 4.4) */
function useCountUp(target: number, ms = 450) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = Math.round(a + (target - a) * e);
      setV(cur);
      from.current = cur;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** FR-08 — 300ms 디바운싱 + AbortController 로 실시간 매물 건수 조회 */
export function useLiveCount() {
  const region = useRegionStore();
  const filters = useFilterStore();
  const setCount = useCountStore((s) => s.set);
  const q = buildRegionQuery(region);
  const [retrySeq, setRetrySeq] = useState(0);

  // 선택된 시·군·구가 있을 때 모든 시·군·구의 하위 읍·면·동이 해제된 경우 판별
  const allSigunguEmdCleared =
    region.selectedSigunguCodes.length > 0 &&
    region.selectedSigunguCodes.every((sg) => {
      const e = region.selectedEmdBySigungu[sg];
      return e != null && !e.isAllSelected && e.checkedEmdCodes.length === 0;
    });

  const isEmptySelection = q.empty || (region.step === 3 && allSigunguEmdCleared);
  const req = buildCountRequest(q, filters);
  const key = JSON.stringify({ ...req, isEmptySelection });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.none || isEmptySelection) {
      ctrl.current?.abort();
      setCount({ status: "idle", data: null });
      return;
    }
    setCount({ status: "loading" });
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      try {
        const data = await postCount(req, c.signal);
        if (!c.signal.aborted) setCount({ status: "ready", data });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setCount({ status: "error" });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retrySeq]);

  const retry = () => setRetrySeq((n) => n + 1);

  return { ...q, empty: isEmptySelection, retry };
}

export function ActionBar({ onSearch }: { onSearch: () => void }) {
  const q = useLiveCount();
  const { status, data } = useCountStore();
  const resetFilters = useFilterStore((s) => s.reset);
  const showToast = useUiStore((s) => s.showToast);
  const resetRegion = useRegionStore((s) => s.resetAll);
  const n = useCountUp(data?.total_count ?? 0);
  const wasEmpty = useRef(false);

  // FRD 5 & DRD 4.4 — 읍·면·동 전체 해제 예외: 경고 토스트 안내 (상태 진입 시 1회)
  useEffect(() => {
    if (q.empty && !wasEmpty.current) {
      showToast("최소 1개 이상의 읍·면·동을 선택해주세요");
    }
    wasEmpty.current = q.empty;
  }, [q.empty, showToast]);

  let label: React.ReactNode;
  let disabled = false;
  let action = onSearch;
  let tone = "primary";

  if (q.none) {
    label = "지역을 먼저 선택해주세요";
    disabled = true;
  } else if (q.empty) {
    label = "최소 1개 이상의 읍·면·동을 선택해주세요";
    disabled = true;
  } else if (status === "ready" && data?.total_count === 0) {
    label = "조건에 맞는 매물이 없습니다 (필터 초기화)";
    action = () => {
      resetFilters();
      showToast("상세 조건을 초기화했습니다");
    };
    tone = "warn";
  } else if (status === "error") {
    label = "건수를 불러오지 못했습니다 · 다시 시도";
    action = q.retry;
    tone = "warn";
  } else {
    label = (
      <>
        <span className="tnum">{n.toLocaleString()}</span>개 매물 보기
        {status === "loading" && (
          <span className="spinner" aria-label="집계 중" />
        )}
      </>
    );
  }

  return (
    <div className="action-bar">
      <button
        type="button"
        className="btn-reset"
        aria-label="전체 초기화"
        title="전체 초기화 (Esc)"
        onClick={() => {
          resetRegion();
          resetFilters();
          showToast("검색 조건을 모두 초기화했습니다");
        }}
      >
        ↺
      </button>
      <button
        type="button"
        className={`btn-main tnum tone-${tone}`}
        disabled={disabled}
        onClick={action}
        title="매물 조회 (Enter)"
      >
        {label}
      </button>
    </div>
  );
}
