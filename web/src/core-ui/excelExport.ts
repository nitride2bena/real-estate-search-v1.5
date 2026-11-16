import * as XLSX from "xlsx";
import type { Property } from "../api/mockServer";
import {
  BUILDING_USE_LABEL,
  SQM_PER_PYEONG,
  TRADE_LABEL,
  ZONE_LABEL,
} from "../domain/constants";
import { getPropertyLinks } from "../domain/platformLinks";

/**
 * 매물 목록을 지침서 v1.6 2.3절 16대 컬럼(A~P) 및 M~P 하이퍼링크 규격으로 엑셀(.xlsx) 내보내기합니다.
 */
export function exportPropertiesToExcel(
  items: Property[],
  filePrefix = "부동산_검색매물목록",
): number {
  if (!items || items.length === 0) return 0;

  const linksList = items.map((p) => getPropertyLinks(p));

  const rows = items.map((p, idx) => {
    const {
      fullAddress,
      naverLandUrl,
      cadastralUrl,
      valuemapUrl,
      kakaoMapUrl,
    } = linksList[idx];

    const landPyeong = Math.round(p.land_area_sqm / SQM_PER_PYEONG);
    const bldgPyeong =
      p.building_area_sqm > 0
        ? Math.round(p.building_area_sqm / SQM_PER_PYEONG)
        : 0;

    return {
      연번: idx + 1,
      소재지_주소: fullAddress,
      거래유형: TRADE_LABEL[p.trade_type],
      "가격(만원)": p.price,
      "월세(만원)": p.monthly_rent > 0 ? p.monthly_rent : 0,
      "평당가(만원)": p.price_per_pyeong,
      "대지면적(㎡)": Math.round(p.land_area_sqm),
      "대지면적(평)": landPyeong,
      "연면적(㎡)":
        p.building_area_sqm > 0 ? Math.round(p.building_area_sqm) : 0,
      "연면적(평)": bldgPyeong,
      용도지역: p.land_use_zones.map((z) => ZONE_LABEL[z] ?? z).join(", "),
      건축물주용도:
        BUILDING_USE_LABEL[p.building_main_use] ?? p.building_main_use,
      네이버부동산_링크: naverLandUrl,
      지적편집도_링크: cadastralUrl,
      밸류맵실거래_링크: valuemapUrl,
      카카오맵_링크: kakaoMapUrl,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // M~P 셀 하이퍼링크 객체 부여 (엑셀 내 클릭 시 바로 브라우저 오픈)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let R = 1; R <= range.e.r; ++R) {
    const links = linksList[R - 1];
    if (!links) continue;

    const specs: Array<{ c: number; target: string; tooltip: string }> = [
      {
        c: 12,
        target: links.naverLandUrl,
        tooltip: "네이버페이 부동산 매물/단지 지도 바로가기",
      },
      {
        c: 13,
        target: links.cadastralUrl,
        tooltip: "네이버 지도 지적편집도 바로가기",
      },
      {
        c: 14,
        target: links.valuemapUrl,
        tooltip: "밸류맵 토지·건물 실거래가 바로가기",
      },
      {
        c: 15,
        target: links.kakaoMapUrl,
        tooltip: "카카오맵 위치 및 로드뷰 바로가기",
      },
    ];

    for (const { c, target, tooltip } of specs) {
      const cell = XLSX.utils.encode_cell({ r: R, c });
      if (ws[cell]) {
        ws[cell].l = { Target: target, Tooltip: tooltip };
      }
    }
  }

  // 지침서 2.3절 열 너비 지정
  ws["!cols"] = [
    { wch: 6 }, // 연번
    { wch: 30 }, // 소재지_주소
    { wch: 10 }, // 거래유형
    { wch: 14 }, // 가격(만원)
    { wch: 12 }, // 월세(만원)
    { wch: 14 }, // 평당가(만원)
    { wch: 14 }, // 대지면적(㎡)
    { wch: 14 }, // 대지면적(평)
    { wch: 14 }, // 연면적(㎡)
    { wch: 14 }, // 연면적(평)
    { wch: 20 }, // 용도지역
    { wch: 16 }, // 건축물주용도
    { wch: 42 }, // 네이버부동산_링크
    { wch: 42 }, // 지적편집도_링크
    { wch: 42 }, // 밸류맵실거래_링크
    { wch: 42 }, // 카카오맵_링크
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "부동산매물목록");

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `${filePrefix}_${dateStr}.xlsx`);
  return items.length;
}
