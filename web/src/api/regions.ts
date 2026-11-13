// 행정구역 조회 API 클라이언트
// 실제 백엔드의 GET /api/v1/regions/sigungu?sido_codes=.. , /eupmyeondong?sigungu_codes=.. 를
// 정적 TopoJSON(시도별 분할) + ETag 영구 캐싱(StorageAdapter)으로 흉내냅니다.
import { feature } from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { storage } from "../platform-bridge/storage";

export interface RegionProps {
  code: string;
  name: string;
  sido?: string;
  sigungu?: string;
  lx: number;
  ly: number;
  bbox: [number, number, number, number];
}

export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProps>;

const DATA_VERSION = "v20261001";
const BASE = `${import.meta.env.BASE_URL}data`;

async function loadTopology(path: string, signal?: AbortSignal): Promise<RegionFeature[]> {
  const key = `${DATA_VERSION}:${path}`;
  const cached = await storage.getBoundaryCache(key);
  const headers: HeadersInit = cached ? { "If-None-Match": cached.etag } : {};
  let topo: Topology;
  try {
    const res = await fetch(`${BASE}/${path}`, { headers, signal, cache: "no-cache" });
    if (res.status === 304 && cached) {
      topo = cached.topology as Topology;
    } else if (res.ok) {
      topo = (await res.json()) as Topology;
      await storage.setBoundaryCache(key, res.headers.get("ETag") ?? `"${key}"`, topo);
    } else if (cached) {
      topo = cached.topology as Topology;
    } else {
      throw new Error(`경계 데이터를 불러오지 못했습니다 (${res.status})`);
    }
  } catch (e) {
    if ((e as Error).name === "AbortError" || !cached) throw e;
    topo = cached.topology as Topology; // 오프라인 시 캐시 사용
  }
  const objectName = Object.keys(topo.objects)[0];
  const fc = feature(topo, topo.objects[objectName] as GeometryObject) as unknown as {
    features: RegionFeature[];
  };
  return fc.features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
}

export function fetchSido(signal?: AbortSignal) {
  return loadTopology("sido.json", signal);
}

/** GET /api/v1/regions/sigungu?sido_codes=43,41 — 시도별 그룹 */
export async function fetchSigungu(sidoCodes: string[], signal?: AbortSignal) {
  const groups = await Promise.all(
    sidoCodes.map(async (sido) => ({ sido, features: await loadTopology(`sigungu/${sido}.json`, signal) })),
  );
  return groups;
}

/** GET /api/v1/regions/eupmyeondong — 내부적으로 시도 단위 파일을 받아 시군구별로 그룹화 */
export async function fetchEmdBySido(sidoCodes: string[], signal?: AbortSignal) {
  const groups = await Promise.all(
    sidoCodes.map(async (sido) => ({ sido, features: await loadTopology(`emd/${sido}.json`, signal) })),
  );
  return groups;
}

export { loadTopology };
