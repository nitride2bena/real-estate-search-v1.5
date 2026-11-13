import { useEffect, useState } from "react";

export type LayoutMode = "desktop" | "tablet" | "mobile";

function getMode(): LayoutMode {
  const w = window.innerWidth;
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

/** DRD 3.1 — 3단계 브레이크포인트 (DOM은 그대로 두고 레이아웃 모드만 전환) */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(getMode);
  useEffect(() => {
    const onResize = () => setMode(getMode());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mode;
}

/** FR-11 — 입력 장치 판별 (마우스 호버 가능 여부) */
export function useHoverCapable(): boolean {
  const q = "(hover: hover) and (pointer: fine)";
  const [hover, setHover] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setHover(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return hover;
}

/** FR-16 — VisualViewport API 로 가상 키보드 높이를 CSS 변수(--kb-inset)에 반영 */
export function useVisualViewportInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
}
