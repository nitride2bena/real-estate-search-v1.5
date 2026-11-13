// 행정구역 경계 전처리 스크립트
// - 원본: vuski/admdongkor (HangJeongDong_ver20261001.geojson, CC BY 4.0)
// - Douglas-Peucker(Visvalingam 대신 DP) 단순화 후 시도/시군구/읍면동 3단계 TopoJSON 생성
// - 시군구·읍면동은 상위 시도별 파일로 분할해 API(지연 로딩)를 흉내냅니다.
import mapshaper from "mapshaper";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "data-raw", "hjd.geojson");
const out = path.join(root, "public", "data");

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, "sigungu"), { recursive: true });
await fs.mkdir(path.join(out, "emd"), { recursive: true });

const input = { "in.json": await fs.readFile(src, "utf8") };

async function run(cmd) {
  return mapshaper.applyCommands(cmd, input);
}

const prep = [
  "-i in.json name=emd",
  "-simplify dp 7% keep-shapes",
  "-clean",
  // 통합시(시+구) 표기: '청주시상당구' -> '청주시 상당구'
  `-each "sggnm = sggnm.replace(/^(.+?시)(.+구)$/, '$1 $2'); code = adm_cd2.slice(0, 8); name = adm_nm.split(' ').pop()"`,
].join(" ");

const label = `-each "lx = +this.innerX.toFixed(5); ly = +this.innerY.toFixed(5); bbox = this.bounds.map(v => +v.toFixed(5))"`;

// 1) 시도
{
  const r = await run(
    `${prep} -dissolve sido copy-fields=sidonm -rename-fields code=sido,name=sidonm ${label} ` +
      `-filter-fields code,name,lx,ly,bbox -o format=topojson quantization=1e5 sido.json`,
  );
  await fs.writeFile(path.join(out, "sido.json"), r["sido.json"]);
}

// 2) 시군구 (시도별 분할)
{
  const r = await run(
    `${prep} -dissolve sgg copy-fields=sggnm,sido -rename-fields code=sgg,name=sggnm ${label} ` +
      `-filter-fields code,name,sido,lx,ly,bbox -split sido -o format=topojson singles quantization=1e5 sigungu.json`,
  );
  for (const [file, content] of Object.entries(r)) {
    const sido = file.match(/(\d{2})\.json$/)[1];
    await fs.writeFile(path.join(out, "sigungu", `${sido}.json`), content);
  }
}

// 3) 읍면동 (시도별 분할)
{
  const r = await run(
    `${prep} -rename-fields sigungu=sgg ${label} ` +
      `-filter-fields code,name,sigungu,sido,lx,ly,bbox -split sido -o format=topojson singles quantization=1e5 emd.json`,
  );
  for (const [file, content] of Object.entries(r)) {
    const sido = file.match(/(\d{2})\.json$/)[1];
    await fs.writeFile(path.join(out, "emd", `${sido}.json`), content);
  }
}

const files = [];
for (const dir of ["", "sigungu", "emd"]) {
  for (const f of await fs.readdir(path.join(out, dir))) {
    const p = path.join(out, dir, f);
    const st = await fs.stat(p);
    if (st.isFile()) files.push(`${path.join(dir, f)} ${(st.size / 1024).toFixed(0)}KB`);
  }
}
console.log(files.join("\n"));
