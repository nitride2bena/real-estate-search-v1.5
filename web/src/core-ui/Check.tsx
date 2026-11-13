import { useEffect, useRef } from "react";

export type CheckState = "on" | "off" | "mixed";

/** 44px 히트 영역을 보장하는 3상태 체크박스 (DRD 3.2-3, 4.2 Indeterminate) */
export function Check({
  state,
  onChange,
  label,
  color,
  badge,
  sub,
}: {
  state: CheckState;
  onChange: () => void;
  label: string;
  color?: string;
  badge?: string;
  sub?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <label className={`check check-${state}`} style={color ? ({ "--accent": color } as React.CSSProperties) : undefined}>
      <input ref={ref} type="checkbox" checked={state === "on"} onChange={onChange} />
      <span className="check-box" aria-hidden>
        {state === "on" ? "✓" : state === "mixed" ? "−" : ""}
      </span>
      <span className="check-label">{label}</span>
      {sub && <span className="check-sub">{sub}</span>}
      {badge && <span className="badge-partial">{badge}</span>}
    </label>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="color-dot" style={{ background: color }} aria-hidden />;
}
