import type { Property, Range } from "../api/mockServer";
import type { RegionFeature } from "../api/regions";
import type { FilterState } from "../state-store/filterStore";
import { useGeoStore } from "../state-store/geoStore";
import type { RegionSelectionState } from "../state-store/regionStore";
import {
  BUILDING_USE_LABEL,
  SIDO_NAME_MAP,
  SQM_PER_PYEONG,
  TRADE_LABEL,
  ZONE_LABEL,
  formatMoney,
  getSidoShortName,
} from "./constants";

export interface PropertyLinks {
  fullAddress: string;
  dongAddress: string;
  naverQuery: string;
  /** 필수 4대 링크 */
  naverLandUrl: string;
  cadastralUrl: string;
  valuemapUrl: string;
  kakaoMapUrl: string;
  /** 확장 플랫폼 링크 */
  hogangnonoUrl: string;
  asilUrl: string;
  kblandUrl: string;
}

/**
 * 매물의 행정구역 코드와 주소를 정규화하여 4대 필수 플랫폼 + 확장 플랫폼(호갱노노·아실·KB부동산) 링크를 생성합니다.
 */
export function getPropertyLinks(p: Property): PropertyLinks {
  const sidoPrefix = getSidoShortName(p.bjd_code, p.address);
  const fullAddress =
    sidoPrefix && !p.address.startsWith(sidoPrefix) ? `${sidoPrefix} ${p.address}` : p.address;

  const parts = p.address.trim().split(/\s+/);
  const sigungu = parts[0] || "";
  const dongRaw = parts[1] || p.emd_name || "";
  // 행정동 숫자 접미사(예: 역삼1동 -> 역삼동)를 법정동 검색어로 정규화
  const dongClean = dongRaw.replace(/(\d+)동$/, "동");
  const naverQuery = sigungu && dongClean ? `${sigungu} ${dongClean}` : p.address;
  const dongAddress = sidoPrefix ? `${sidoPrefix} ${naverQuery}`.trim() : naverQuery;

  const naverLandUrl = `https://fin.land.naver.com/search?q=${encodeURIComponent(naverQuery)}`;
  const cadastralUrl = `https://map.naver.com/p/search/${encodeURIComponent(fullAddress)}?c=17.00,0,0,0,cadastral`;
  const valuemapUrl = `https://www.valueupmap.com/search?q=${encodeURIComponent(fullAddress)}`;
  const kakaoMapUrl = `https://map.kakao.com/?q=${encodeURIComponent(fullAddress)}`;

  const hogangnonoUrl = `https://hogangnono.com/search?q=${encodeURIComponent(dongAddress)}`;
  const asilUrl = `https://asil.kr/asil/sub/main.jsp?q=${encodeURIComponent(dongAddress)}`;
  const kblandUrl = `https://kbland.kr/map?q=${encodeURIComponent(dongAddress)}`;

  return {
    fullAddress,
    dongAddress,
    naverQuery,
    naverLandUrl,
    cadastralUrl,
    valuemapUrl,
    kakaoMapUrl,
    hogangnonoUrl,
    asilUrl,
    kblandUrl,
  };
}

/** 기존 ResultsModal.tsx 호환 별칭 */
export const getFullAddress = getPropertyLinks;

function formatAreaLine(p: Property): string {
  const landSqm = Math.round(p.land_area_sqm).toLocaleString();
  const landPy = Math.round(p.land_area_sqm / SQM_PER_PYEONG).toLocaleString();
  const landPart = `대지 ${landSqm}㎡(${landPy}평)`;
  if (p.building_area_sqm > 0) {
    const bldgSqm = Math.round(p.building_area_sqm).toLocaleString();
    const bldgPy = Math.round(p.building_area_sqm / SQM_PER_PYEONG).toLocaleString();
    return `${landPart} / 연면적 ${bldgSqm}㎡(${bldgPy}평)`;
  }
  return landPart;
}

function formatPriceLine(p: Property): string {
  const trade = TRADE_LABEL[p.trade_type];
  const priceText =
    p.trade_type === "MONTHLY"
      ? `${formatMoney(p.price)} / 월 ${formatMoney(p.monthly_rent)}`
      : formatMoney(p.price);
  return `${trade} ${priceText} (평당 ${formatMoney(p.price_per_pyeong)})`;
}

/**
 * 카카오톡/문자 공유용 단일 매물 요약 텍스트를 생성합니다.
 */
export function formatPropertyShareText(p: Property): string {
  const links = getPropertyLinks(p);
  const zones = p.land_use_zones.map((z) => ZONE_LABEL[z] ?? z).join(", ") || "-";
  const use = BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use;

  return [
    `[매물 정보] ${links.fullAddress}`,
    `• 거래/가격: ${formatPriceLine(p)}`,
    `• 면적/용도: ${formatAreaLine(p)} · ${use}`,
    `• 용도지역: ${zones}`,
    `• 네이버부동산: ${links.naverLandUrl}`,
    `• 카카오맵: ${links.kakaoMapUrl}`,
  ].join("\n");
}

/**
 * 카카오톡/문자 공유용 다중 매물 비교 요약 텍스트를 생성합니다.
 */
export function formatCompareShareText(items: Property[]): string {
  if (!items.length) return "";
  const header = `[관심 매물 비교 (${items.length}건)]`;
  const blocks = items.map((p, idx) => {
    const links = getPropertyLinks(p);
    const zones = p.land_use_zones.map((z) => ZONE_LABEL[z] ?? z).join(", ") || "-";
    const use = BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use;
    return [
      `${idx + 1}. ${links.fullAddress}`,
      `   - ${formatPriceLine(p)}`,
      `   - ${formatAreaLine(p)} · ${use} · ${zones}`,
      `   - 네이버: ${links.naverLandUrl}`,
      `   - 카카오: ${links.kakaoMapUrl}`,
    ].join("\n");
  });
  return [header, ...blocks].join("\n\n");
}

// ---------- 통합 검색 스키마 어댑터 (UnifiedRealEstateSearchSchema) ----------

export type UnifiedPropertyType =
  | "APARTMENT"
  | "OFFICETEL"
  | "VILLA_MULTI"
  | "HOUSE_ONE_ROOM"
  | "COMMERCIAL"
  | "OFFICE"
  | "LAND"
  | "FACTORY_WAREHOUSE"
  | "REDEVELOPMENT";

export interface SchemaRange {
  min?: number;
  max?: number;
}

export interface UnifiedRealEstateSearchSchema {
  location: {
    sido: string;
    sigungu: string;
    eupmyeondong: string;
    ri?: string;
    jibun?: string;
    complexName?: string;
    subwayStation?: string;
    geoBounds?: {
      swLat: number;
      swLng: number;
      neLat: number;
      neLng: number;
    };
  };
  propertyType: UnifiedPropertyType[];
  transaction: {
    tradeType: Array<"SALE" | "JEONSE" | "MONTHLY" | "SHORT_TERM" | "AUCTION">;
    salePriceRange?: SchemaRange;
    depositRange?: SchemaRange;
    monthlyRentRange?: SchemaRange;
    maintenanceFeeMax?: number;
    premiumFeeType?: "NONE" | "ANY" | "CUSTOM_RANGE";
  };
  physicalSpecs: {
    exclusiveAreaRange?: SchemaRange;
    roomCount?: Array<"1ROOM" | "2ROOM" | "3ROOM_PLUS">;
    floorCondition?: Array<"LOW_EXCLUDED" | "TOP_FLOOR" | "GROUND_1F" | "BASEMENT">;
    direction?: Array<"SOUTH" | "EAST" | "WEST" | "NORTH">;
    completionYearRange?: { minYear: number; maxYear: number };
    minHouseholds?: number;
    parkingAvailable?: boolean;
    elevator?: boolean;
  };
  financialLoan: {
    loanSupport?: Array<"SME_100" | "SME_80" | "BURTIMMOK" | "KAKAO_BANK">;
    guaranteeInsurance?: boolean;
    gapPriceMax?: number;
    jeonseRateRange?: SchemaRange;
  };
  environmentContext: {
    subwayWalkingDistanceMin?: number;
    elementarySchoolAssigned?: boolean;
    academicScoreRanking?: boolean;
    sunlightSimulationHoursMin?: number;
  };
  specializedSpecs?: {
    landUseZone?: string[];
    landCategory?: string[];
    roadAccessMinMeters?: number;
    landAreaRange?: SchemaRange;
    pyeongPriceRange?: SchemaRange;
    auctionDisqualification?: Array<"EXCLUDE_SPECIAL_RIGHTS" | "LEGAL_SUPERFICIES">;
    failCountMin?: number;
    lowestPriceRatioMax?: number;
  };
}

const BUILDING_USE_TO_UNIFIED: Record<string, UnifiedPropertyType[]> = {
  "00000": ["LAND"],
  "01000": ["HOUSE_ONE_ROOM"],
  "02000": ["APARTMENT", "VILLA_MULTI"],
  "03000": ["COMMERCIAL"],
  "04000": ["COMMERCIAL"],
  "07000": ["COMMERCIAL"],
  "10000": ["OFFICE"],
  "14000": ["OFFICE"],
  "15000": ["COMMERCIAL"],
  "17000": ["FACTORY_WAREHOUSE"],
  "18000": ["FACTORY_WAREHOUSE"],
  "21000": ["LAND"],
};

function toSchemaRange(r: Range | undefined): SchemaRange | undefined {
  if (!r || (r.min == null && r.max == null)) return undefined;
  const out: SchemaRange = {};
  if (r.min != null) out.min = Math.round(r.min);
  if (r.max != null) out.max = Math.round(r.max);
  return out;
}

/**
 * 현재 regionStore와 filterStore 상태를 `UnifiedRealEstateSearchSchema` 규격 JSON 객체로 변환합니다.
 */
export function toUnifiedSearchSchema(
  regionState: RegionSelectionState,
  filterState: FilterState,
  byCodeOverride?: Record<string, RegionFeature>,
): UnifiedRealEstateSearchSchema {
  const byCode = byCodeOverride ?? useGeoStore.getState().byCode;

  const sidoNames = regionState.selectedSidoCodes.map(
    (c) => byCode[c]?.properties.name ?? SIDO_NAME_MAP[c] ?? c,
  );
  const sigunguNames = regionState.selectedSigunguCodes.map(
    (c) => byCode[c]?.properties.name ?? c,
  );

  // 읍면동 표기 및 geoBounds 산출 대상 코드 수집
  const emdNames: string[] = [];
  const boundCodes: string[] = [];
  let allSggAllSelected = regionState.selectedSigunguCodes.length > 0;

  for (const sg of regionState.selectedSigunguCodes) {
    const sel = regionState.selectedEmdBySigungu[sg];
    if (!sel || sel.isAllSelected) {
      boundCodes.push(sg);
      const sgName = byCode[sg]?.properties.name ?? sg;
      emdNames.push(`${sgName} 전체`);
    } else {
      allSggAllSelected = false;
      for (const emd of sel.checkedEmdCodes) {
        boundCodes.push(emd);
        emdNames.push(byCode[emd]?.properties.name ?? emd);
      }
    }
  }

  if (boundCodes.length === 0) {
    boundCodes.push(...regionState.selectedSidoCodes);
  }

  let geoBounds: UnifiedRealEstateSearchSchema["location"]["geoBounds"];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const c of boundCodes) {
    const bbox = byCode[c]?.properties.bbox;
    if (!bbox) continue;
    minLng = Math.min(minLng, bbox[0]);
    minLat = Math.min(minLat, bbox[1]);
    maxLng = Math.max(maxLng, bbox[2]);
    maxLat = Math.max(maxLat, bbox[3]);
  }
  if (Number.isFinite(minLng)) {
    geoBounds = {
      swLat: minLat,
      swLng: minLng,
      neLat: maxLat,
      neLng: maxLng,
    };
  }

  const propertyTypeSet = new Set<UnifiedPropertyType>();
  for (const useCode of filterState.buildingUses) {
    for (const mapped of BUILDING_USE_TO_UNIFIED[useCode] ?? []) {
      propertyTypeSet.add(mapped);
    }
  }

  const tradeType: UnifiedRealEstateSearchSchema["transaction"]["tradeType"] =
    filterState.tradeType === "ALL" ? ["SALE", "JEONSE", "MONTHLY"] : [filterState.tradeType];

  const priceRange = toSchemaRange(filterState.price);
  const rentRange = toSchemaRange(filterState.rent);
  const bldgAreaRange = toSchemaRange(filterState.buildingArea);
  const landAreaRange = toSchemaRange(filterState.landArea);
  const pyeongPriceRange = toSchemaRange(filterState.pyeongPrice);

  const transaction: UnifiedRealEstateSearchSchema["transaction"] = { tradeType };
  if (priceRange) {
    if (filterState.tradeType === "ALL" || filterState.tradeType === "SALE") {
      transaction.salePriceRange = priceRange;
    }
    if (filterState.tradeType === "JEONSE" || filterState.tradeType === "MONTHLY") {
      transaction.depositRange = priceRange;
    }
  }
  if (filterState.tradeType === "MONTHLY" && rentRange) {
    transaction.monthlyRentRange = rentRange;
  }

  const physicalSpecs: UnifiedRealEstateSearchSchema["physicalSpecs"] = {};
  if (bldgAreaRange) {
    physicalSpecs.exclusiveAreaRange = bldgAreaRange;
  }

  const hasSpecialized =
    filterState.zoning.length > 0 || Boolean(landAreaRange) || Boolean(pyeongPriceRange);
  const specializedSpecs: UnifiedRealEstateSearchSchema["specializedSpecs"] = hasSpecialized
    ? {
        ...(filterState.zoning.length > 0
          ? { landUseZone: filterState.zoning.map((z) => ZONE_LABEL[z] ?? z) }
          : {}),
        ...(landAreaRange ? { landAreaRange } : {}),
        ...(pyeongPriceRange ? { pyeongPriceRange } : {}),
      }
    : undefined;

  return {
    location: {
      sido: sidoNames.join(", "),
      sigungu: sigunguNames.join(", "),
      eupmyeondong: allSggAllSelected ? "전체" : emdNames.join(", "),
      ...(geoBounds ? { geoBounds } : {}),
    },
    propertyType: [...propertyTypeSet],
    transaction,
    physicalSpecs,
    financialLoan: {},
    environmentContext: {},
    ...(specializedSpecs ? { specializedSpecs } : {}),
  };
}
