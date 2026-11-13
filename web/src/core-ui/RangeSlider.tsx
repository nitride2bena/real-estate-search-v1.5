import { useEffect, useState } from "react";
import type { Range } from "../api/mockServer";

/** 비선형 눈금(ticks) 기반 듀얼 슬라이더. 드래그 완료 시점(onChangeCommitted)에만 커밋 */
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
    ticks.forEach((t, i) => (Math.abs(t - d) < Math.abs(ticks[best] - d) ? (best = i) : null));
    return best;
  };
  const [lo, setLo] = useState(() => toIdx(value.min, 0));
  const [hi, setHi] = useState(() => toIdx(value.max, last));

  useEffect(() => {
    setLo(toIdx(value.min, 0));
    setHi(toIdx(value.max, last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.min, value.max, ticks]);

  const commit = (l = lo, h = hi) =>
    onCommit({ min: l === 0 ? null : fromDisplay(ticks[l]), max: h === last ? null : fromDisplay(ticks[h]) });

  const pct = (i: number) => (i / last) * 100;
  const text = lo === 0 && hi === last ? "전체" : `${lo === 0 ? "최소" : format(ticks[lo])} ~ ${hi === last ? "최대" : format(ticks[hi])}`;

  return (
    <div className="range">
      <div className="range-value tnum" aria-live="polite">{text}</div>
      <div className="range-track" style={{ "--lo": `${pct(lo)}%`, "--hi": `${pct(hi)}%` } as React.CSSProperties}>
        <input
          type="range" min={0} max={last} step={1} value={lo}
          aria-label={`${label} 최소`}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={() => commit()} onKeyUp={() => commit()} onBlur={() => commit()}
        />
        <input
          type="range" min={0} max={last} step={1} value={hi}
          aria-label={`${label} 최대`}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={() => commit()} onKeyUp={() => commit()} onBlur={() => commit()}
        />
      </div>
      <div className="range-scale"><span>{format(ticks[0])}</span><span>{format(ticks[last])}+</span></div>
    </div>
  );
}

/** 최소~최대 직접 입력 (빈 칸 = 제한 없음) */
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
  const show = (v: number | null) => (v == null ? "" : String(Math.round(toDisplay(v) * 10) / 10));
  const [min, setMin] = useState(show(value.min));
  const [max, setMax] = useState(show(value.max));
  useEffect(() => {
    setMin(show(value.min));
    setMax(show(value.max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.min, value.max, unit]);
  const parse = (s: string) => (s.trim() === "" || isNaN(Number(s)) ? null : fromDisplay(Number(s)));
  const commit = () => onCommit({ min: parse(min), max: parse(max) });
  return (
    <div className="minmax">
      <input inputMode="decimal" placeholder="최소" aria-label={`${label} 최소`} value={min}
        onChange={(e) => setMin(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <span>~</span>
      <input inputMode="decimal" placeholder="최대" aria-label={`${label} 최대`} value={max}
        onChange={(e) => setMax(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <span className="minmax-unit">{unit}</span>
    </div>
  );
}
