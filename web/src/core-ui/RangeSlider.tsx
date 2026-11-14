import React, { useEffect, useRef, useState } from "react";
import type { Range } from "../api/mockServer";

/**
 * 비선형 눈금(ticks) 기반 듀얼 슬라이더 (ADD 6.1, DRD 4.3)
 * - 드래그 중에는 로컬 눈금 상태만 즉시 갱신하고, 드래그 완료(onChangeCommitted) 시점에 상위 스토어로 커밋
 */
export function RangeSlider({
  ticks,
  value,
  onCommit,
  format,
  label,
  toDisplay = (v) => v,
  fromDisplay = (v) => v,
}: {
  ticks: number[];
  value: Range;
  onCommit: (r: Range) => void;
  format: (v: number) => string;
  label: string;
  toDisplay?: (stored: number) => number;
  fromDisplay?: (display: number) => number;
}) {
  const last = ticks.length - 1;
  const toIdx = (v: number | null, fallback: number) => {
    if (v == null) return fallback;
    const d = toDisplay(v);
    let best = 0;
    ticks.forEach((t, i) => {
      if (Math.abs(t - d) < Math.abs(ticks[best] - d)) best = i;
    });
    return best;
  };

  const [lo, setLo] = useState(() => toIdx(value.min, 0));
  const [hi, setHi] = useState(() => toIdx(value.max, last));
  const draggingRef = useRef(false);

  useEffect(() => {
    setLo(toIdx(value.min, 0));
    setHi(toIdx(value.max, last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.min, value.max, ticks]);

  const commit = (l = lo, h = hi) => {
    const safeLo = Math.min(l, h);
    const safeHi = Math.max(l, h);
    onCommit({
      min: safeLo === 0 ? null : fromDisplay(ticks[safeLo]),
      max: safeHi === last ? null : fromDisplay(ticks[safeHi]),
    });
  };

  const pct = (i: number) => (i / last) * 100;
  const text =
    lo === 0 && hi === last
      ? "전체"
      : `${lo === 0 ? "최소" : format(ticks[lo])} ~ ${hi === last ? "최대" : format(ticks[hi])}`;

  return (
    <div className="range">
      <div className="range-header">
        <div className="range-value tnum" aria-live="polite">
          {text}
        </div>
        {(lo > 0 || hi < last) && (
          <button
            type="button"
            className="range-reset-btn"
            onClick={() => {
              setLo(0);
              setHi(last);
              commit(0, last);
            }}
          >
            전체로 초기화
          </button>
        )}
      </div>
      <div
        className="range-track"
        style={
          {
            "--lo": `${pct(lo)}%`,
            "--hi": `${pct(hi)}%`,
          } as React.CSSProperties
        }
      >
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={lo}
          aria-label={`${label} 최소`}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onChange={(e) => {
            const nextLo = Math.min(Number(e.target.value), hi);
            setLo(nextLo);
            if (!draggingRef.current) commit(nextLo, hi);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
          onTouchEnd={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
          onKeyUp={() => commit(lo, hi)}
          onBlur={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
        />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={hi}
          aria-label={`${label} 최대`}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onChange={(e) => {
            const nextHi = Math.max(Number(e.target.value), lo);
            setHi(nextHi);
            if (!draggingRef.current) commit(lo, nextHi);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
          onTouchEnd={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
          onKeyUp={() => commit(lo, hi)}
          onBlur={() => {
            draggingRef.current = false;
            commit(lo, hi);
          }}
        />
      </div>
      <div className="range-scale tnum">
        <span>{format(ticks[0])}</span>
        <span>{format(ticks[Math.floor(last / 2)])}</span>
        <span>{format(ticks[last])}+</span>
      </div>
    </div>
  );
}

/** 최소~최대 직접 입력 (빈 칸 = 제한 없음, 44px 터치 타겟 보장) */
export function MinMaxInput({
  value,
  onCommit,
  unit,
  toDisplay = (v) => v,
  fromDisplay = (v) => v,
  label,
}: {
  value: Range;
  onCommit: (r: Range) => void;
  unit: string;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  label: string;
}) {
  const show = (v: number | null) =>
    v == null ? "" : String(Math.round(toDisplay(v) * 10) / 10);
  const [min, setMin] = useState(() => show(value.min));
  const [max, setMax] = useState(() => show(value.max));

  useEffect(() => {
    setMin(show(value.min));
    setMax(show(value.max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.min, value.max, unit]);

  const parse = (s: string) => {
    const trimmed = s.trim().replace(/,/g, "");
    if (trimmed === "" || isNaN(Number(trimmed))) return null;
    const num = Number(trimmed);
    return num < 0 ? 0 : fromDisplay(num);
  };

  const commit = (minStr = min, maxStr = max) => {
    let parsedMin = parse(minStr);
    let parsedMax = parse(maxStr);
    if (parsedMin != null && parsedMax != null && parsedMin > parsedMax) {
      [parsedMin, parsedMax] = [parsedMax, parsedMin];
    }
    onCommit({ min: parsedMin, max: parsedMax });
  };

  return (
    <div className="minmax">
      <input
        type="text"
        inputMode="decimal"
        className="tnum"
        placeholder="최소"
        aria-label={`${label} 최소`}
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={() => commit(min, max)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(min, max);
          }
        }}
      />
      <span className="minmax-sep" aria-hidden="true">
        ~
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="tnum"
        placeholder="최대"
        aria-label={`${label} 최대`}
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onBlur={() => commit(min, max)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(min, max);
          }
        }}
      />
      <span className="minmax-unit">{unit}</span>
    </div>
  );
}
