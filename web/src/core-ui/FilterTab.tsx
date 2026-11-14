import { useState } from "react";
import {
  BUILDING_USES,
  SQM_PER_PYEONG,
  TICKS,
  TRADE_TYPES,
  ZONE_LABEL,
  ZONING,
  formatMoney,
} from "../domain/constants";
import { useFilterStore, type AreaUnit } from "../state-store/filterStore";
import type { Range } from "../api/mockServer";
import { MinMaxInput, RangeSlider } from "./RangeSlider";

const sqmToPy = (v: number) => v / SQM_PER_PYEONG;
const pyToSqm = (v: number) => v * SQM_PER_PYEONG;
const ident = (v: number) => v;

/** DRD 4.3: [㎡ | 평] 실시간 단위 변환 스위치 */
function UnitSwitch({
  value,
  onChange,
  label,
}: {
  value: AreaUnit;
  onChange: (u: AreaUnit) => void;
  label: string;
}) {
  return (
    <div className="unit-switch" role="radiogroup" aria-label={`${label} 단위`}>
      {(["sqm", "pyeong"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          className={value === u ? "is-on" : ""}
          onClick={() => onChange(u)}
        >
          {u === "sqm" ? "㎡" : "평"}
        </button>
      ))}
    </div>
  );
}

/** DRD 4.3 & FR-05: 면적 및 규모 섹션 (슬라이더 + 직접 입력 + 실시간 단위 변환) */
function AreaSection({
  title,
  value,
  unit,
  onUnit,
  onCommit,
}: {
  title: string;
  value: Range;
  unit: AreaUnit;
  onUnit: (u: AreaUnit) => void;
  onCommit: (r: Range) => void;
}) {
  const py = unit === "pyeong";
  const to = py ? sqmToPy : ident;
  const from = py ? pyToSqm : ident;
  const fmt = (v: number) => `${Math.round(v).toLocaleString()}${py ? "평" : "㎡"}`;

  // 반대 단위로 실시간 환산 표기 (내부 저장값은 항상 ㎡)
  const other = (sqm: number | null, empty: string) =>
    sqm == null
      ? empty
      : py
        ? `${Math.round(sqm).toLocaleString()}㎡`
        : `${Math.round(sqmToPy(sqm)).toLocaleString()}평`;

  return (
    <section className="f-section" aria-label={title}>
      <div className="f-head">
        <h4>
          {title}{" "}
          <small className="tnum">
            {py ? "1평 ≈ 3.31㎡" : "3.31㎡ ≈ 1평"}
          </small>
        </h4>
        <UnitSwitch value={unit} onChange={onUnit} label={title} />
      </div>
      <RangeSlider
        ticks={py ? TICKS.pyeong : TICKS.sqm}
        value={value}
        onCommit={onCommit}
        format={fmt}
        label={title}
        toDisplay={to}
        fromDisplay={from}
      />
      <MinMaxInput
        value={value}
        onCommit={onCommit}
        unit={py ? "평" : "㎡"}
        toDisplay={to}
        fromDisplay={from}
        label={title}
      />
      {(value.min != null || value.max != null) && (
        <p className="f-hint tnum">
          실시간 환산: {other(value.min, "최소")} ~ {other(value.max, "최대")}
        </p>
      )}
    </section>
  );
}

/** DRD 4.3: 상세 조건 탭 UI 컴포넌트 */
export function FilterTab() {
  const f = useFilterStore();
  const [openZone, setOpenZone] = useState<string | null>("R");

  const priceLabel =
    f.tradeType === "SALE"
      ? "매매가"
      : f.tradeType === "ALL"
        ? "매매가 / 보증금"
        : "보증금";

  const allZoneCodes = ZONING.flatMap((g) => g.items.map((i) => i.code));

  return (
    <div className="filter-tab">
      {/* 1. 거래유형 세그먼트 컨트롤 */}
      <section className="f-section" aria-label="거래유형">
        <div className="f-head">
          <h4>거래유형</h4>
        </div>
        <div className="segment" role="radiogroup" aria-label="거래유형">
          {TRADE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={f.tradeType === t.value}
              className={f.tradeType === t.value ? "is-on" : ""}
              onClick={() => f.setTradeType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 2. 거래유형 종속 가격 슬라이더 (매매가/보증금 단일 또는 보증금+월차임 2단 확장) */}
      <section className="f-section" aria-label="가격 조건">
        <div className="f-head">
          <h4>{priceLabel}</h4>
        </div>
        <RangeSlider
          ticks={f.tradeType === "MONTHLY" ? TICKS.deposit : TICKS.price}
          value={f.price}
          onCommit={(r) => f.set("price", r)}
          format={formatMoney}
          label={priceLabel}
        />
        <MinMaxInput
          value={f.price}
          onCommit={(r) => f.set("price", r)}
          unit="만원"
          label={priceLabel}
        />

        {f.tradeType === "MONTHLY" && (
          <div className="f-sub-block">
            <div className="f-head f-sub">
              <h4>월차임</h4>
            </div>
            <RangeSlider
              ticks={TICKS.rent}
              value={f.rent}
              onCommit={(r) => f.set("rent", r)}
              format={formatMoney}
              label="월차임"
            />
            <MinMaxInput
              value={f.rent}
              onCommit={(r) => f.set("rent", r)}
              unit="만원"
              label="월차임"
            />
          </div>
        )}
      </section>

      {/* 3. 평당 단가 범위 */}
      <section className="f-section" aria-label="평당 단가 범위">
        <div className="f-head">
          <h4>
            평당 단가 범위 <small>만원 / 3.3㎡ 기준</small>
          </h4>
        </div>
        <MinMaxInput
          value={f.pyeongPrice}
          onCommit={(r) => f.set("pyeongPrice", r)}
          unit="만원/평"
          label="평당 단가"
        />
      </section>

      {/* 4. 대지면적 & 연면적 (실시간 ㎡ | 평 변환 스위치 포함) */}
      <AreaSection
        title="대지면적"
        value={f.landArea}
        unit={f.landUnit}
        onUnit={(u) => f.set("landUnit", u)}
        onCommit={(r) => f.set("landArea", r)}
      />
      <AreaSection
        title="연면적"
        value={f.buildingArea}
        unit={f.buildingUnit}
        onUnit={(u) => f.set("buildingUnit", u)}
        onCommit={(r) => f.set("buildingArea", r)}
      />

      {/* 5. 국토계획법 용도지역 7대 대분류 2단 확장형 칩 (Expandable Chip) */}
      <section className="f-section" aria-label="용도지역">
        <div className="f-head">
          <h4>
            용도지역{" "}
            <small>
              {f.zoning.length > 0
                ? `${f.zoning.length}개 세분류 선택됨`
                : "7대 대분류를 눌러 세분류 선택"}
            </small>
          </h4>
          {f.zoning.length > 0 && (
            <button
              type="button"
              className="btn-text"
              onClick={() => f.setZones(allZoneCodes, false)}
            >
              초기화
            </button>
          )}
        </div>
        <div className="chip-grid">
          {ZONING.map((g) => {
            const codes = g.items.map((i) => i.code);
            const n = codes.filter((c) => f.zoning.includes(c)).length;
            const open = openZone === g.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-expanded={open}
                className={`chip chip-expand ${n ? "is-on" : ""} ${open ? "is-open" : ""}`}
                onClick={() => setOpenZone(open ? null : g.key)}
              >
                <span>{g.label}</span>
                <span className="chip-meta">
                  {n > 0 && <span className="chip-count tnum">{n}</span>}
                  <span className="chip-arrow" aria-hidden="true">
                    {open ? "▴" : "▾"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {openZone &&
          (() => {
            const g = ZONING.find((z) => z.key === openZone);
            if (!g) return null;
            const codes = g.items.map((i) => i.code);
            const all = codes.every((c) => f.zoning.includes(c));
            return (
              <div
                className="zone-sub"
                role="group"
                aria-label={`${g.label} 세분류`}
              >
                <button
                  type="button"
                  aria-pressed={all}
                  className={`chip chip-sm ${all ? "is-on" : ""}`}
                  onClick={() => f.setZones(codes, !all)}
                >
                  {g.label} 전체
                </button>
                {g.items.map((i) => {
                  const isSelected = f.zoning.includes(i.code);
                  return (
                    <button
                      key={i.code}
                      type="button"
                      aria-pressed={isSelected}
                      className={`chip chip-sm ${isSelected ? "is-on" : ""}`}
                      onClick={() => f.toggleZone(i.code)}
                    >
                      {i.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

        {f.zoning.length > 0 && (
          <div className="selected-tags" aria-label="선택된 용도지역 목록">
            {f.zoning.map((code) => (
              <button
                key={code}
                type="button"
                className="selected-tag-chip"
                onClick={() => f.toggleZone(code)}
                title="클릭하여 해제"
              >
                {ZONE_LABEL[code] ?? code} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 6. 건축물 주용도 다중 선택 칩 */}
      <section className="f-section" aria-label="건축물 주용도">
        <div className="f-head">
          <h4>
            건축물 주용도{" "}
            <small className="tnum">
              {f.buildingUses.length > 0
                ? `${f.buildingUses.length}개 선택됨`
                : "다중 선택 가능"}
            </small>
          </h4>
          {f.buildingUses.length > 0 && (
            <button
              type="button"
              className="btn-text"
              onClick={() => f.set("buildingUses", [])}
            >
              초기화
            </button>
          )}
        </div>
        <div className="chip-grid">
          {BUILDING_USES.map((b) => {
            const isSelected = f.buildingUses.includes(b.code);
            return (
              <button
                key={b.code}
                type="button"
                aria-pressed={isSelected}
                className={`chip ${isSelected ? "is-on" : ""}`}
                onClick={() => f.toggleUse(b.code)}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </section>

      <button type="button" className="btn-outline" onClick={f.reset}>
        상세 조건 초기화
      </button>
    </div>
  );
}
