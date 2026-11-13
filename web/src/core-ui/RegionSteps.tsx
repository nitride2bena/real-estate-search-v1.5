import { useState } from "react";
import { useGeoStore } from "../state-store/geoStore";
import {
  checkedEmdCount,
  isEmdChecked,
  sigunguState,
  useRegionStore,
  type Step,
} from "../state-store/regionStore";
import { Check, ColorDot } from "./Check";

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "시·도" },
  { step: 2, label: "시·군·구" },
  { step: 3, label: "읍·면·동" },
];

export function Stepper() {
  const { step, setStep, selectedSidoCodes, selectedSigunguCodes } = useRegionStore();
  const enabled = (s: Step) => s === 1 || (s === 2 && selectedSidoCodes.length > 0) || (s === 3 && selectedSigunguCodes.length > 0);
  return (
    <ol className="stepper" aria-label="지역 선택 단계">
      {STEPS.map((s, i) => (
        <li key={s.step}>
          {i > 0 && <span className="stepper-sep" aria-hidden>›</span>}
          <button
            type="button"
            className={`stepper-btn ${step === s.step ? "is-current" : ""} ${step > s.step ? "is-done" : ""}`}
            disabled={!enabled(s.step)}
            aria-current={step === s.step ? "step" : undefined}
            onClick={() => setStep(s.step)}
          >
            <span className="stepper-num">{s.step}</span>
            {s.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function SidoStep() {
  const sido = useGeoStore((s) => s.sido);
  const { selectedSidoCodes, sidoColor, toggleSido, selectAllSido, resetSido, setStep } = useRegionStore();
  return (
    <section className="step-body">
      <div className="step-head">
        <h3>시·도를 선택하세요 <small>복수 선택 가능</small></h3>
        <div className="step-actions">
          <button type="button" className="btn-text" onClick={selectAllSido}>전체 선택</button>
          <button type="button" className="btn-text" onClick={resetSido}>초기화</button>
        </div>
      </div>
      {!sido.length && <div className="skeleton-grid">{Array.from({ length: 16 }, (_, i) => <span key={i} className="skeleton chip-skel" />)}</div>}
      <div className="chip-grid">
        {sido.map((f) => {
          const c = f.properties.code;
          const on = selectedSidoCodes.includes(c);
          return (
            <button
              key={c}
              type="button"
              className={`chip ${on ? "is-on" : ""}`}
              aria-pressed={on}
              style={on ? ({ "--accent": sidoColor[c] } as React.CSSProperties) : undefined}
              onClick={() => toggleSido(c)}
            >
              {on && <ColorDot color={sidoColor[c]} />}
              {shortSido(f.properties.name)}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn-next" disabled={!selectedSidoCodes.length} onClick={() => setStep(2)}>
        다음: 시·군·구 선택 →
      </button>
    </section>
  );
}

export function SigunguStep() {
  const region = useRegionStore();
  const { sigunguBySido, sido, emdBySigungu } = useGeoStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const nameOf = (code: string) => sido.find((f) => f.properties.code === code)?.properties.name ?? code;

  return (
    <section className="step-body">
      <div className="step-head">
        <h3>시·군·구를 선택하세요 <small>선택하지 않은 시·도는 전체 검색</small></h3>
      </div>
      {region.selectedSidoCodes.map((sd) => {
        const list = sigunguBySido[sd];
        const nSel = region.selectedSigunguCodes.filter((c) => c.startsWith(sd)).length;
        const groupState = !list ? "off" : nSel === 0 ? "off" : nSel === list.length ? "on" : "mixed";
        const open = !collapsed[sd];
        return (
          <div key={sd} className="acc">
            <div className="acc-head">
              <Check
                state={groupState}
                onChange={() => region.setSigunguGroup(sd, groupState !== "on")}
                label={nameOf(sd)}
                color={region.sidoColor[sd]}
                sub={list ? `${nSel}/${list.length}` : "불러오는 중…"}
              />
              <ColorDot color={region.sidoColor[sd]} />
              <button type="button" className="acc-toggle" aria-expanded={open} aria-label={`${nameOf(sd)} 펼치기`}
                onClick={() => setCollapsed((c) => ({ ...c, [sd]: open }))}>
                {open ? "▴" : "▾"}
              </button>
            </div>
            {open && (
              <div className="acc-body check-grid">
                {!list && Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton row-skel" />)}
                {list?.map((f) => {
                  const c = f.properties.code;
                  const st = sigunguState(region, c);
                  const total = emdBySigungu[c]?.length;
                  const n = total != null ? checkedEmdCount(region, c, total) : null;
                  return (
                    <Check
                      key={c}
                      state={st}
                      onChange={() => region.toggleSigungu(c)}
                      label={f.properties.name}
                      color={region.sidoColor[sd]}
                      badge={st === "mixed" ? `일부 선택${n != null ? ` ${n}/${total}` : ""}` : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn-next" disabled={!region.selectedSigunguCodes.length} onClick={() => region.setStep(3)}>
        다음: 읍·면·동 정밀 선택 →
      </button>
    </section>
  );
}

export function EmdStep() {
  const region = useRegionStore();
  const { emdBySigungu, byCode } = useGeoStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <section className="step-body">
      <div className="step-head">
        <h3>읍·면·동 정밀 선택 <small>기본 전체 선택 · 불필요한 동만 해제</small></h3>
      </div>
      {region.selectedSigunguCodes.map((sg) => {
        const list = emdBySigungu[sg];
        const sel = region.selectedEmdBySigungu[sg];
        const total = list?.length ?? 0;
        const n = checkedEmdCount(region, sg, total);
        const groupState = !list ? "on" : n === 0 ? "off" : n === total ? "on" : "mixed";
        const open = !collapsed[sg];
        const sgName = byCode[sg]?.properties.name ?? sg;
        const sdName = shortSido(byCode[sg.slice(0, 2)]?.properties.name ?? "");
        return (
          <div key={sg} className="acc">
            <div className="acc-head">
              <Check
                state={groupState}
                onChange={() => region.setEmdGroup(sg, groupState !== "on")}
                label={`${sdName} ${sgName}`}
                color={sel?.paletteColor}
                sub={list ? `${n}/${total}` : "불러오는 중…"}
              />
              {sel && <ColorDot color={sel.paletteColor} />}
              <button type="button" className="acc-toggle" aria-expanded={open} aria-label={`${sgName} 펼치기`}
                onClick={() => setCollapsed((c) => ({ ...c, [sg]: open }))}>
                {open ? "▴" : "▾"}
              </button>
            </div>
            {open && (
              <div className="acc-body check-grid">
                {!list && Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton row-skel" />)}
                {list?.map((f) => (
                  <Check
                    key={f.properties.code}
                    state={isEmdChecked(region, sg, f.properties.code) ? "on" : "off"}
                    onChange={() => region.toggleEmd(sg, f.properties.code)}
                    label={f.properties.name}
                    color={sel?.paletteColor}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function shortSido(name: string) {
  return name
    .replace("특별자치시", "")
    .replace("특별자치도", "")
    .replace("전남광주통합특별시", "전남광주")
    .replace("특별시", "")
    .replace("광역시", "")
    .replace(/^(충청|경상|전라)(북|남)도$/, (_, a: string, b: string) => `${a[0]}${b}`)
    .replace(/도$/, "");
}
