import React, { useEffect, useRef } from "react";

export type CheckState = "on" | "off" | "mixed";

/**
 * 44px × 44px 이상 히트 영역을 보장하는 3상태 체크박스 (DRD 3.2-3, 4.2 Indeterminate)
 * - state === "mixed": Indeterminate 반체크("-") 및 일부 선택 배지 표시
 */
export function Check({
  state,
  onChange,
  label,
  color,
  badge,
  sub,
  leadingDot = false,
}: {
  state: CheckState;
  onChange: () => void;
  label: string;
  color?: string;
  badge?: string;
  sub?: string;
  /** DRD 2.1: 아코디언 헤더 좌측 Color Dot 표시 여부 */
  leadingDot?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === "mixed";
    }
  }, [state]);

  return (
    <label
      className={`check check-${state}`}
      data-state={state}
      style={color ? ({ "--accent": color } as React.CSSProperties) : undefined}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={state === "on"}
        aria-checked={state === "mixed" ? "mixed" : state === "on"}
        onChange={onChange}
      />
      <span className="check-box" aria-hidden="true">
        {state === "on" ? "✓" : state === "mixed" ? "-" : ""}
      </span>
      {leadingDot && color && <ColorDot color={color} />}
      <span className="check-label">{label}</span>
      {sub && <span className="check-sub tnum">{sub}</span>}
      {badge && <span className="badge-partial tnum">{badge}</span>}
    </label>
  );
}

/** DRD 2.1: 8px × 8px 고유 팔레트 원형 Color Dot */
export function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="color-dot"
      style={{ backgroundColor: color, width: "8px", height: "8px" }}
      aria-hidden="true"
    />
  );
}
