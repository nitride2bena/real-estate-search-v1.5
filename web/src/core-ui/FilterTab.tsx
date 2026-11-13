import { useState } from "react";
import {
  BUILDING_USES,
  SQM_PER_PYEONG,
  TICKS,
  TRADE_TYPES,
  ZONING,
  formatMoney,
} from "../domain/constants";
import { useFilterStore, type AreaUnit } from "../state-store/filterStore";
import type { Range } from "../api/mockServer";
import { MinMaxInput, RangeSlider } from "./RangeSlider";

const sqmToPy = (v: number) => v / SQM_PER_PYEONG;
const pyToSqm = (v: number) => v * SQM_PER_PYEONG;
const ident = (v: number) => v;

function UnitSwitch({ value, onChange, label }: { value: AreaUnit; onChange: (u: AreaUnit) => void; label: string }) {
  return (
    <div className="unit-switch" role="radiogroup" aria-label={`${label} 단위`}>
      {(["sqm", "pyeong"] as const).map((u) => (
        <button key={u} type="button" role="radio" aria-checked={value === u} className={value === u ? "is-on" : ""} onClick={() => onChange(u)}>
          {u === "sqm" ? "㎡" : "평"}
        </button>
      ))}
    </div>
  );
}

function AreaSection({ title, value, unit, onUnit, onCommit }: {
  title: string; value: Range; unit: AreaUnit; onUnit: (u: AreaUnit) => void; onCommit: (r: Range) => void;
}) {
  const py = unit === "pyeong";
  const to = py ? sqmToPy : ident;
  const from = py ? pyToSqm : ident;
  const fmt = (v: number) => `${v.toLocaleString()}${py ? "평" : "㎡"}`;
  // 반대 단위로 실시간 환산 표기 (저장값은 항상 ㎡)
  const other = (sqm: number | null, empty: string) =>
    sqm == null ? empty : py ? `${Math.round(sqm).toLocaleString()}㎡` : `${Math.round(sqmToPy(sqm)).toLocaleString()}평`;
  return (
    <section className="f-section">
      <div className="f-head">
        <h4>{title}</h4>
        <UnitSwitch value={unit} onChange={onUnit} label={title} />
      </div>
      <RangeSlider ticks={py ? TICKS.pyeong : TICKS.sqm} value={value} onCommit={onCommit} format={fmt} label={title} toDisplay={to} fromDisplay={from} />
      <MinMaxInput value={value} onCommit={onCommit} unit={py ? "평" : "㎡"} toDisplay={to} fromDisplay={from} label={title} />
      {(value.min != null || value.max != null) && (
        <p className="f-hint tnum">
          환산: {other(value.min, "최소")} ~ {other(value.max, "최대")}
        </p>
      )}
    </section>
  );
}

export function FilterTab() {
  const f = useFilterStore();
  const [openZone, setOpenZone] = useState<string | null>(null);
  const priceLabel = f.tradeType === "SALE" ? "매매가" : f.tradeType === "ALL" ? "매매가 / 보증금" : "보증금";

  return (
    <div className="filter-tab">
      <section className="f-section">
        <h4>거래유형</h4>
        <div className="segment" role="radiogroup" aria-label="거래유형">
          {TRADE_TYPES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={f.tradeType === t.value}
              className={f.tradeType === t.value ? "is-on" : ""} onClick={() => f.setTradeType(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="f-section">
        <h4>{priceLabel}</h4>
        <RangeSlider
          ticks={f.tradeType === "MONTHLY" ? TICKS.deposit : TICKS.price}
          value={f.price} onCommit={(r) => f.set("price", r)} format={formatMoney} label={priceLabel}
        />
        {f.tradeType === "MONTHLY" && (
          <>
            <h4 className="f-sub">월차임</h4>
            <RangeSlider ticks={TICKS.rent} value={f.rent} onCommit={(r) => f.set("rent", r)} format={formatMoney} label="월차임" />
          </>
        )}
      </section>

      <section className="f-section">
        <h4>평당 단가 범위</h4>
        <MinMaxInput value={f.pyeongPrice} onCommit={(r) => f.set("pyeongPrice", r)} unit="만원/평" label="평당 단가" />
      </section>

      <AreaSection title="대지면적" value={f.landArea} unit={f.landUnit} onUnit={(u) => f.set("landUnit", u)} onCommit={(r) => f.set("landArea", r)} />
      <AreaSection title="연면적" value={f.buildingArea} unit={f.buildingUnit} onUnit={(u) => f.set("buildingUnit", u)} onCommit={(r) => f.set("buildingArea", r)} />

      <section className="f-section">
        <h4>용도지역 <small>대분류를 눌러 세분류 선택</small></h4>
        <div className="chip-grid">
          {ZONING.map((g) => {
            const codes = g.items.map((i) => i.code);
            const n = codes.filter((c) => f.zoning.includes(c)).length;
            const open = openZone === g.key;
            return (
              <button key={g.key} type="button" aria-expanded={open}
                className={`chip chip-expand ${n ? "is-on" : ""} ${open ? "is-open" : ""}`}
                onClick={() => setOpenZone(open ? null : g.key)}>
                {g.label}
                {n > 0 && <span className="chip-count">{n}</span>}
              </button>
            );
          })}
        </div>
        {openZone && (() => {
          const g = ZONING.find((z) => z.key === openZone)!;
          const codes = g.items.map((i) => i.code);
          const all = codes.every((c) => f.zoning.includes(c));
          return (
            <div className="zone-sub" role="group" aria-label={`${g.label} 세분류`}>
              <button type="button" className={`chip chip-sm ${all ? "is-on" : ""}`} onClick={() => f.setZones(codes, !all)}>
                {g.label} 전체
              </button>
              {g.items.map((i) => (
                <button key={i.code} type="button" aria-pressed={f.zoning.includes(i.code)}
                  className={`chip chip-sm ${f.zoning.includes(i.code) ? "is-on" : ""}`} onClick={() => f.toggleZone(i.code)}>
                  {i.label}
                </button>
              ))}
            </div>
          );
        })()}
      </section>

      <section className="f-section">
        <h4>건축물 주용도</h4>
        <div className="chip-grid">
          {BUILDING_USES.map((b) => (
            <button key={b.code} type="button" aria-pressed={f.buildingUses.includes(b.code)}
              className={`chip ${f.buildingUses.includes(b.code) ? "is-on" : ""}`} onClick={() => f.toggleUse(b.code)}>
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="btn-outline" onClick={f.reset}>상세 조건 초기화</button>
    </div>
  );
}
