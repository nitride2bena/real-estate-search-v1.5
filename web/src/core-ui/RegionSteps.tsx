import React, { useMemo, useState } from "react";
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

/** DRD 4.1: 1. 시·도 > 2. 시·군·구 > 3. 읍·면·동 브레드크럼 스테퍼 */
export function Stepper() {
  const region = useRegionStore();
  const { step, setStep, selectedSidoCodes, selectedSigunguCodes } = region;
  const { emdBySigungu } = useGeoStore();

  const enabled = (s: Step) =>
    s === 1 ||
    (s === 2 && selectedSidoCodes.length > 0) ||
    (s === 3 && selectedSigunguCodes.length > 0);

  // 3단계 선택된 읍면동 총 개수 계산
  const totalCheckedEmd = useMemo(() => {
    if (!selectedSigunguCodes.length) return 0;
    return selectedSigunguCodes.reduce((acc, sg) => {
      const total = emdBySigungu[sg]?.length ?? 0;
      return acc + checkedEmdCount(region, sg, total);
    }, 0);
  }, [region, selectedSigunguCodes, emdBySigungu]);

  const getStepCount = (s: Step) => {
    if (s === 1 && selectedSidoCodes.length > 0) return selectedSidoCodes.length;
    if (s === 2 && selectedSigunguCodes.length > 0) return selectedSigunguCodes.length;
    if (s === 3 && totalCheckedEmd > 0) return totalCheckedEmd;
    return null;
  };

  return (
    <nav aria-label="지역 선택 단계 브레드크럼">
      <ol className="stepper">
        {STEPS.map((s, i) => {
          const count = getStepCount(s.step);
          const isCurrent = step === s.step;
          const isDone = step > s.step;
          return (
            <li key={s.step}>
              {i > 0 && (
                <span className="stepper-sep" aria-hidden="true">
                  ›
                </span>
              )}
              <button
                type="button"
                className={`stepper-btn ${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""}`}
                disabled={!enabled(s.step)}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => setStep(s.step)}
              >
                <span className="stepper-num tnum">{s.step}.</span>
                <span className="stepper-label">{s.label}</span>
                {count != null && (
                  <span className="stepper-count tnum">{count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** DRD 4.2 - 1단계: 시·도 다중 선택 */
export function SidoStep() {
  const sido = useGeoStore((s) => s.sido);
  const {
    selectedSidoCodes,
    sidoColor,
    toggleSido,
    selectAllSido,
    resetSido,
    setStep,
  } = useRegionStore();

  return (
    <section className="step-body" aria-label="1단계 시·도 선택">
      <div className="step-head">
        <h3>
          시·도를 선택하세요{" "}
          <small className="tnum">
            {selectedSidoCodes.length > 0
              ? `${selectedSidoCodes.length}개 선택됨`
              : "복수 선택 가능"}
          </small>
        </h3>
        <div className="step-actions">
          <button
            type="button"
            className="btn-text"
            onClick={selectAllSido}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={resetSido}
          >
            초기화
          </button>
        </div>
      </div>

      {/* 모바일 및 상단 빠른 다음 단계 이동 버튼 */}
      {selectedSidoCodes.length > 0 && (
        <button
          type="button"
          className="btn-next-top"
          onClick={() => setStep(2)}
          aria-label="시·군·구 선택 단계로 이동"
        >
          <span>시·도 {selectedSidoCodes.length}개 선택됨 · <strong>다음: 시·군·구 선택 →</strong></span>
        </button>
      )}

      {!sido.length && (
        <div className="chip-grid" aria-busy="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="skeleton chip-skel" />
          ))}
        </div>
      )}

      <div className="chip-grid">
        {sido.map((f) => {
          const c = f.properties.code;
          const on = selectedSidoCodes.includes(c);
          const color = sidoColor[c];
          return (
            <button
              key={c}
              type="button"
              className={`chip ${on ? "is-on" : ""}`}
              aria-pressed={on}
              style={
                on && color
                  ? ({ "--accent": color } as React.CSSProperties)
                  : undefined
              }
              onClick={() => toggleSido(c)}
            >
              {on && color && <ColorDot color={color} />}
              <span>{shortSido(f.properties.name)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn-next"
        disabled={!selectedSidoCodes.length}
        onClick={() => setStep(2)}
      >
        다음: 시·군·구 선택 →
      </button>
    </section>
  );
}

/** DRD 4.2 - 2단계: 시·군·구 정밀 선택 (아코디언 그룹 + 검색 필터 + Indeterminate 반체크 & 일부 선택 배지) */
export function SigunguStep() {
  const region = useRegionStore();
  const { sigunguBySido, sido, emdBySigungu } = useGeoStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const nameOf = (code: string) =>
    sido.find((f) => f.properties.code === code)?.properties.name ?? code;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // 선택된 모든 시·도의 시·군·구 일괄 선택 / 해제
  const handleSelectAllSigungu = (on: boolean) => {
    for (const sd of region.selectedSidoCodes) {
      region.setSigunguGroup(sd, on);
    }
  };

  return (
    <section className="step-body" aria-label="2단계 시·군·구 선택">
      <div className="step-head">
        <h3>
          시·군·구를 선택하세요{" "}
          <small>선택하지 않은 시·도는 전체 검색</small>
        </h3>
        <div className="step-actions">
          <button
            type="button"
            className="btn-text"
            onClick={() => handleSelectAllSigungu(true)}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => handleSelectAllSigungu(false)}
          >
            선택 해제
          </button>
        </div>
      </div>

      {/* 모바일 및 상단 빠른 다음 단계 이동 버튼 */}
      {region.selectedSigunguCodes.length > 0 && (
        <button
          type="button"
          className="btn-next-top"
          onClick={() => region.setStep(3)}
          aria-label="읍·면·동 정밀 선택 단계로 이동"
        >
          <span>시·군·구 {region.selectedSigunguCodes.length}개 선택됨 · <strong>다음: 읍·면·동 정밀 선택 →</strong></span>
        </button>
      )}

      {/* 시·군·구 빠른 검색 필터 */}
      <div className="search-filter-box">
        <input
          type="search"
          className="search-filter-input"
          placeholder="시·군·구 이름 빠른 검색 (예: 청주, 상당구)"
          aria-label="시·군·구 이름 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="search-filter-clear"
            aria-label="검색어 지우기"
            onClick={() => setSearchQuery("")}
          >
            ✕
          </button>
        )}
      </div>

      {region.selectedSidoCodes.map((sd) => {
        const list = sigunguBySido[sd];
        const filteredList =
          list && trimmedQuery
            ? list.filter((f) =>
                f.properties.name.toLowerCase().includes(trimmedQuery),
              )
            : list;

        const nSel = region.selectedSigunguCodes.filter((c) =>
          c.startsWith(sd),
        ).length;
        // 하위 동이 일부 해제된 시·군·구가 포함되어 있는지도 확인
        const hasPartial =
          list?.some((f) => sigunguState(region, f.properties.code) === "mixed") ??
          false;
        const groupState = !list
          ? "off"
          : nSel === 0
            ? "off"
            : nSel === list.length && !hasPartial
              ? "on"
              : "mixed";
        const open = trimmedQuery ? true : !collapsed[sd];
        const color = region.sidoColor[sd];

        return (
          <div key={sd} className="acc">
            <div className="acc-head">
              <Check
                state={groupState}
                onChange={() =>
                  region.setSigunguGroup(sd, groupState !== "on")
                }
                label={nameOf(sd)}
                color={color}
                leadingDot={true}
                sub={list ? `${nSel}/${list.length}` : "불러오는 중…"}
              />
              <button
                type="button"
                className="acc-toggle"
                aria-expanded={open}
                aria-label={`${nameOf(sd)} ${open ? "접기" : "펼치기"}`}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [sd]: open }))
                }
              >
                {open ? "▴" : "▾"}
              </button>
            </div>
            {open && (
              <div className="acc-body">
                {!list && (
                  <div className="check-grid" aria-busy="true">
                    {Array.from({ length: 8 }, (_, i) => (
                      <span key={i} className="skeleton row-skel" />
                    ))}
                  </div>
                )}
                {list && filteredList && filteredList.length === 0 && (
                  <p className="empty-filter-msg">
                    "{searchQuery}"에 해당하는 시·군·구가 없습니다.
                  </p>
                )}
                {filteredList && filteredList.length > 0 && (
                  <div className="check-grid">
                    {filteredList.map((f) => {
                      const c = f.properties.code;
                      const st = sigunguState(region, c);
                      const total = emdBySigungu[c]?.length;
                      const n =
                        total != null
                          ? checkedEmdCount(region, c, total)
                          : null;
                      return (
                        <Check
                          key={c}
                          state={st}
                          onChange={() => region.toggleSigungu(c)}
                          label={f.properties.name}
                          color={color}
                          badge={
                            st === "mixed"
                              ? n != null && total != null
                                ? `일부 선택 (${n}/${total})`
                                : "일부 선택"
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="btn-next"
        disabled={!region.selectedSigunguCodes.length}
        onClick={() => region.setStep(3)}
      >
        다음: 읍·면·동 정밀 선택 →
      </button>
    </section>
  );
}

/** DRD 4.2 - 3단계: 읍·면·동 정밀 선택 (기본 전체 선택 + 그룹/개별 토글 + 동 이름 빠른 검색) */
export function EmdStep() {
  const region = useRegionStore();
  const { emdBySigungu, byCode } = useGeoStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // 전체 시·군·구의 모든 읍·면·동 일괄 선택/해제
  const handleAllEmdGroup = (on: boolean) => {
    for (const sg of region.selectedSigunguCodes) {
      region.setEmdGroup(sg, on);
    }
  };

  return (
    <section className="step-body" aria-label="3단계 읍·면·동 정밀 선택">
      <div className="step-head">
        <h3>
          읍·면·동 정밀 선택{" "}
          <small>기본 전체 선택 · 불필요한 동만 해제</small>
        </h3>
        <div className="step-actions">
          <button
            type="button"
            className="btn-text"
            onClick={() => handleAllEmdGroup(true)}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => handleAllEmdGroup(false)}
          >
            전체 해제
          </button>
        </div>
      </div>

      {/* 동 이름 빠른 검색(필터) 입력창 */}
      <div className="search-filter-box">
        <input
          type="search"
          className="search-filter-input"
          placeholder="읍·면·동 빠른 검색 (예: 북문로, 오창읍, 율량동)"
          aria-label="읍·면·동 빠른 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="search-filter-clear"
            aria-label="검색어 지우기"
            onClick={() => setSearchQuery("")}
          >
            ✕
          </button>
        )}
      </div>

      {region.selectedSigunguCodes.map((sg) => {
        const list = emdBySigungu[sg];
        const filteredList =
          list && trimmedQuery
            ? list.filter((f) =>
                f.properties.name.toLowerCase().includes(trimmedQuery),
              )
            : list;

        const sel = region.selectedEmdBySigungu[sg];
        const total = list?.length ?? 0;
        const n = checkedEmdCount(region, sg, total);
        const groupState = !list
          ? "on"
          : n === 0
            ? "off"
            : n === total
              ? "on"
              : "mixed";
        const open = trimmedQuery ? true : !collapsed[sg];
        const sgName = byCode[sg]?.properties.name ?? sg;
        const sdName = shortSido(
          byCode[sg.slice(0, 2)]?.properties.name ?? "",
        );
        const color = sel?.paletteColor;

        return (
          <div key={sg} className="acc">
            <div className="acc-head">
              <Check
                state={groupState}
                onChange={() =>
                  region.setEmdGroup(sg, groupState !== "on")
                }
                label={`${sdName} ${sgName}`}
                color={color}
                leadingDot={true}
                sub={list ? `${n}/${total}` : "불러오는 중…"}
                badge={
                  groupState === "mixed" && list
                    ? `일부 선택 (${n}/${total})`
                    : undefined
                }
              />
              <button
                type="button"
                className="acc-toggle"
                aria-expanded={open}
                aria-label={`${sgName} ${open ? "접기" : "펼치기"}`}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [sg]: open }))
                }
              >
                {open ? "▴" : "▾"}
              </button>
            </div>
            {open && (
              <div className="acc-body">
                {!list && (
                  <div className="check-grid" aria-busy="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className="skeleton row-skel" />
                    ))}
                  </div>
                )}
                {list && filteredList && filteredList.length === 0 && (
                  <p className="empty-filter-msg">
                    "{searchQuery}"에 해당하는 읍·면·동이 없습니다.
                  </p>
                )}
                {filteredList && filteredList.length > 0 && (
                  <div className="check-grid">
                    {filteredList.map((f) => (
                      <Check
                        key={f.properties.code}
                        state={
                          isEmdChecked(region, sg, f.properties.code)
                            ? "on"
                            : "off"
                        }
                        onChange={() =>
                          region.toggleEmd(sg, f.properties.code)
                        }
                        label={f.properties.name}
                        color={color}
                      />
                    ))}
                  </div>
                )}
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
    .replace(
      /^(충청|경상|전라)(북|남)도$/,
      (_, a: string, b: string) => `${a[0]}${b}`,
    )
    .replace(/도$/, "");
}
