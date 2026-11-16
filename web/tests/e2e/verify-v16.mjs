// verify-v16.mjs: v1.6 최종 QA E2E 검증 (데스크톱 1280x800 + 모바일 390x844 + 엑셀 xlsx 파싱)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../../node_modules/xlsx/xlsx.js");

const BASE_URL = "http://127.0.0.1:4173/";
const DOWNLOAD_DIR = path.resolve("D:/AI/Antigravity/부동산 v1.5/web/tests/e2e/.tmp-downloads");
fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const mark = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${mark} | ${name} | ${detail}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function setupErrorAndClipboardTracking(page) {
  await page.cdp("Runtime.enable");
  await page.cdp("Page.enable");
  await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__qaErrors = [];
      window.addEventListener("error", (e) => {
        window.__qaErrors.push("pageerror: " + (e.message || e.error || "unknown"));
      });
      window.addEventListener("unhandledrejection", (e) => {
        window.__qaErrors.push("unhandledrejection: " + String(e.reason));
      });
      const origConsoleError = console.error.bind(console);
      console.error = (...args) => {
        window.__qaErrors.push("console.error: " + args.map(String).join(" "));
        origConsoleError(...args);
      };
      window.__copiedTexts = [];
      const origClipboard = navigator.clipboard;
      if (origClipboard && typeof origClipboard.writeText === "function") {
        const origWrite = origClipboard.writeText.bind(origClipboard);
        origClipboard.writeText = async (text) => {
          window.__copiedTexts.push(String(text));
          try {
            return await origWrite(text);
          } catch {
            return undefined;
          }
        };
      }
      const origExec = document.execCommand.bind(document);
      document.execCommand = (cmd, ...rest) => {
        if (cmd === "copy") {
          const active = document.activeElement;
          if (active && typeof active.value === "string") {
            window.__copiedTexts.push(active.value);
          }
        }
        return origExec(cmd, ...rest);
      };
    `,
  });
}

async function waitForXlsxDownload(page, prevFiles, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const evs = await page.events();
    const completed = evs.find(
      (e) =>
        (e.method === "Browser.downloadProgress" || e.method === "Page.downloadProgress") &&
        e.params?.state === "completed",
    );
    if (completed?.params?.filePath && fs.existsSync(completed.params.filePath)) {
      await new Promise((r) => setTimeout(r, 200));
      return completed.params.filePath;
    }
    const files = fs
      .readdirSync(DOWNLOAD_DIR)
      .filter((f) => f.endsWith(".xlsx") && !f.endsWith(".crdownload"));
    const added = files.filter((f) => !prevFiles.has(f));
    if (added.length > 0) {
      const fullPath = path.join(DOWNLOAD_DIR, added[0]);
      await new Promise((r) => setTimeout(r, 300));
      return fullPath;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const dirList = fs.readdirSync(DOWNLOAD_DIR);
  throw new Error(`엑셀(.xlsx) 다운로드 타임아웃 (dir=${JSON.stringify(dirList)})`);
}

function verifyXlsxFile(filePath, expectedMinRows) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  assert(sheetName === "부동산매물목록", `시트명 불일치: ${sheetName}`);
  const ws = wb.Sheets[sheetName];
  const ref = ws["!ref"];
  assert(ref, "시트 !ref 없음");
  const range = XLSX.utils.decode_range(ref);
  assert(range.e.c === 15, `컬럼 수 불일치: ${range.e.c + 1} (기대: 16, A~P)`);

  const expectedHeaders = [
    "연번",
    "소재지_주소",
    "거래유형",
    "가격(만원)",
    "월세(만원)",
    "평당가(만원)",
    "대지면적(㎡)",
    "대지면적(평)",
    "연면적(㎡)",
    "연면적(평)",
    "용도지역",
    "건축물주용도",
    "네이버부동산_링크",
    "지적편집도_링크",
    "밸류맵실거래_링크",
    "카카오맵_링크",
  ];
  const actualHeaders = [];
  for (let c = 0; c <= 15; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    actualHeaders.push(cell?.v);
  }
  assert(
    JSON.stringify(actualHeaders) === JSON.stringify(expectedHeaders),
    `헤더 불일치: ${JSON.stringify(actualHeaders)}`,
  );

  const rowCount = range.e.r;
  assert(rowCount >= expectedMinRows, `데이터 행 수 부족: ${rowCount} < ${expectedMinRows}`);

  let linkChecked = 0;
  for (let r = 1; r <= Math.min(rowCount, 10); r++) {
    const m = ws[XLSX.utils.encode_cell({ r, c: 12 })];
    const n = ws[XLSX.utils.encode_cell({ r, c: 13 })];
    const o = ws[XLSX.utils.encode_cell({ r, c: 14 })];
    const p = ws[XLSX.utils.encode_cell({ r, c: 15 })];
    assert(m?.l?.Target?.startsWith("https://fin.land.naver.com/search?q="), `M${r + 1} 링크 오류: ${m?.l?.Target}`);
    assert(
      n?.l?.Target?.startsWith("https://map.naver.com/p/search/") && n.l.Target.includes("cadastral"),
      `N${r + 1} 링크 오류: ${n?.l?.Target}`,
    );
    assert(o?.l?.Target?.startsWith("https://www.valueupmap.com/search?q="), `O${r + 1} 링크 오류: ${o?.l?.Target}`);
    assert(p?.l?.Target?.startsWith("https://map.kakao.com/?q="), `P${r + 1} 링크 오류: ${p?.l?.Target}`);
    linkChecked++;
  }
  return { sheetName, cols: actualHeaders.length, rows: rowCount, linkChecked };
}

const task = await taskSpace("qa-verify-v16");

try {
  // =========================================================================
  // PART A. 데스크톱(1280×800) 검증
  // =========================================================================
  const page = (await task.pages())[0] || (await task.newPage());
  await setupErrorAndClipboardTracking(page);
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.cdp("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });
  await page.cdp("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  });

  await page.goto(BASE_URL, { timeout: 20000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ timeout: 20000 });
  await page.waitForSelector(".chip-grid .chip", { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 1. 타이틀 / v1.6 배지 / 레이아웃
  const meta = await page.evaluate(() => ({
    title: document.title,
    badge: document.querySelector(".panel-header .version-badge")?.textContent?.trim(),
    sidoCount: document.querySelectorAll(".chip-grid .chip").length,
    panelClass: document.querySelector(".search-panel")?.className,
    mapSize: (() => {
      const c = document.querySelector("canvas.maplibregl-canvas");
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  }));
  record(
    "데스크톱 초기 로드/타이틀/v1.6 배지",
    meta.title.includes("v1.6") && meta.badge === "v1.6" && meta.sidoCount === 16 && meta.mapSize?.w > 600,
    `title="${meta.title}", badge="${meta.badge}", sido=${meta.sidoCount}개, map=${meta.mapSize?.w}x${meta.mapSize?.h}`,
  );

  // 2. 시도 코드 정상화 검증 (강원 51, 전북 52, 전남광주 12 광주 vs 전남, 서울 11)
  async function checkRegionLinks(sidoLabel, sigunguLabel, expectedPrefix) {
    // 1단계 복귀 & 초기화
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) =>
        el.textContent?.includes("지역 선택"),
      );
      if (tab) tab.click();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const s1 = Array.from(document.querySelectorAll(".stepper-btn"))[0];
      if (s1) s1.click();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const reset = Array.from(document.querySelectorAll(".step-actions .btn-text")).find((b) =>
        b.textContent?.includes("초기화"),
      );
      if (reset) reset.click();
    });
    await page.waitForTimeout(200);

    // 시·도 클릭
    const clickedSido = await page.evaluate((lbl) => {
      const chip = Array.from(document.querySelectorAll(".chip-grid .chip")).find(
        (c) => c.textContent?.trim() === lbl,
      );
      if (chip) {
        chip.click();
        return true;
      }
      return false;
    }, sidoLabel);
    assert(clickedSido, `시·도 '${sidoLabel}' 칩 미발견`);
    await page.waitForTimeout(400);

    if (sigunguLabel) {
      await page.click(".btn-next");
      await page.waitForSelector(".acc .check-grid label", { timeout: 10000 });
      await page.waitForTimeout(300);
      const clickedSgg = await page.evaluate((sg) => {
        const labels = Array.from(document.querySelectorAll(".acc .check-grid label"));
        const target = labels.find((l) => l.textContent?.includes(sg));
        if (target) {
          target.click();
          return true;
        }
        return false;
      }, sigunguLabel);
      assert(clickedSgg, `시·군·구 '${sigunguLabel}' 미발견`);
      await page.waitForTimeout(500);
    }

    // 건수 로딩 완료 후 결과 모달 오픈
    await page.waitForFunction(
      () => {
        const b = document.querySelector(".btn-main");
        return b && !b.hasAttribute("disabled") && /매물.*보기/.test(b.textContent || "");
      },
      undefined,
      { timeout: 15000 },
    );
    await page.click(".btn-main");
    await page.waitForSelector(".modal .result-card", { timeout: 15000 });
    await page.waitForTimeout(200);

    // 첫 번째 카드 확장 링크 열기
    await page.click(".modal .result-card:first-of-type .link-more-toggle");
    await page.waitForSelector(".modal .result-card:first-of-type .link-hogangnono", { timeout: 5000 });

    const cardCheck = await page.evaluate((prefix) => {
      const cards = Array.from(document.querySelectorAll(".modal .result-card")).slice(0, 5);
      const addrs = cards.map((c) => c.querySelector(".result-addr")?.textContent?.trim() || "");
      const first = cards[0];
      const getHref = (sel) => first.querySelector(sel)?.getAttribute("href") || "";
      return {
        addrs,
        allStartWithPrefix: addrs.length > 0 && addrs.every((a) => a.startsWith(prefix)),
        noMergedPrefix: addrs.every((a) => !a.startsWith("전남광주")),
        links: {
          naver: getHref(".link-naver"),
          cadastral: getHref(".link-cadastral"),
          valuemap: getHref(".link-valuemap"),
          kakao: getHref(".link-kakao"),
          hogangnono: getHref(".link-hogangnono"),
          asil: getHref(".link-asil"),
          kb: getHref(".link-kb"),
        },
      };
    }, expectedPrefix);

    const linksValid =
      /^https:\/\/fin\.land\.naver\.com\/search\?q=/.test(cardCheck.links.naver) &&
      /^https:\/\/map\.naver\.com\/p\/search\/.*cadastral/.test(cardCheck.links.cadastral) &&
      /^https:\/\/www\.valueupmap\.com\/search\?q=/.test(cardCheck.links.valuemap) &&
      /^https:\/\/map\.kakao\.com\/\?q=/.test(cardCheck.links.kakao) &&
      /^https:\/\/hogangnono\.com\/search\?q=/.test(cardCheck.links.hogangnono) &&
      /^https:\/\/asil\.kr\/asil\/sub\/main\.jsp\?q=/.test(cardCheck.links.asil) &&
      /^https:\/\/kbland\.kr\/map\?q=/.test(cardCheck.links.kb);

    // 모달 닫기
    await page.click('.modal .btn-icon[aria-label="닫기"]');
    await page.waitForTimeout(200);

    return { ...cardCheck, linksValid };
  }

  for (const tc of [
    { name: "시도코드 51(강원) 주소·7대링크", sido: "강원", sgg: null, prefix: "강원 " },
    { name: "시도코드 52(전북) 주소·7대링크", sido: "전북", sgg: null, prefix: "전북 " },
    { name: "시도코드 12(전남광주-광산구=광주) 주소·7대링크", sido: "전남광주", sgg: "광산구", prefix: "광주 " },
    { name: "시도코드 12(전남광주-여수시=전남) 주소·7대링크", sido: "전남광주", sgg: "여수시", prefix: "전남 " },
    { name: "시도코드 11(서울) 주소·7대링크", sido: "서울", sgg: null, prefix: "서울 " },
  ]) {
    const res = await checkRegionLinks(tc.sido, tc.sgg, tc.prefix);
    record(
      tc.name,
      res.allStartWithPrefix && res.noMergedPrefix && res.linksValid,
      `샘플주소="${res.addrs[0]}", 7종링크=${res.linksValid ? "정상" : JSON.stringify(res.links)}`,
    );
  }

  // 3. 3단계 지역 선택 & 읍면동 전체 해제 시 뷰포트/좌측 패널 유지
  await page.click(".btn-next"); // 서울 -> 2단계
  await page.waitForSelector(".acc .check-grid label", { timeout: 10000 });
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".acc .check-grid label"));
    const gangnam = labels.find((l) => l.textContent?.includes("강남구"));
    if (gangnam) gangnam.click();
  });
  await page.waitForTimeout(400);
  await page.click(".btn-next"); // -> 3단계
  await page.waitForSelector(".acc .check-grid label", { timeout: 10000 });
  await page.waitForTimeout(500);

  // 3단계에서 '전체 해제' 클릭
  await page.evaluate(() => {
    const clearAll = Array.from(document.querySelectorAll(".step-actions .btn-text")).find((b) =>
      b.textContent?.includes("전체 해제"),
    );
    if (clearAll) clearAll.click();
  });
  await page.waitForTimeout(600);

  const afterClearEmd = await page.evaluate(() => {
    const panel = document.querySelector(".search-panel")?.getBoundingClientRect();
    const mapCanvas = document.querySelector("canvas.maplibregl-canvas")?.getBoundingClientRect();
    const currentStep = document.querySelector('.stepper-btn[aria-current="step"] .stepper-label')?.textContent?.trim();
    const checkedCount = document.querySelectorAll('.acc .check-grid input[type="checkbox"]:checked').length;
    return {
      panel: panel ? { x: Math.round(panel.left), w: Math.round(panel.width), h: Math.round(panel.height) } : null,
      map: mapCanvas ? { w: Math.round(mapCanvas.width), h: Math.round(mapCanvas.height) } : null,
      currentStep,
      checkedCount,
    };
  });
  record(
    "3단계 읍면동 전체 해제 시 뷰포트/좌측 패널 유지",
    afterClearEmd.currentStep === "읍·면·동" &&
      afterClearEmd.checkedCount === 0 &&
      afterClearEmd.panel?.w >= 380 &&
      afterClearEmd.panel?.h >= 700 &&
      afterClearEmd.map?.w >= 600 &&
      afterClearEmd.map?.h >= 700,
    `step="${afterClearEmd.currentStep}", checked=${afterClearEmd.checkedCount}, panel=${afterClearEmd.panel?.w}x${afterClearEmd.panel?.h}, map=${afterClearEmd.map?.w}x${afterClearEmd.map?.h}`,
  );

  // 이후 검색 테스트를 위해 서울 전체로 복귀 (1단계 초기화 후 서울만 선택)
  await page.evaluate(() => {
    const s1 = Array.from(document.querySelectorAll(".stepper-btn"))[0];
    if (s1) s1.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const reset = Array.from(document.querySelectorAll(".step-actions .btn-text")).find((b) =>
      b.textContent?.includes("초기화"),
    );
    if (reset) reset.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll(".chip-grid .chip")).find((c) => c.textContent?.trim() === "서울");
    if (chip) chip.click();
  });
  await page.waitForTimeout(400);

  // 4. v1.6 필터 프리셋 4종 & 통합 검색 스키마 JSON 복사 & RangeSlider 양끝 겹침 재조작
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("상세 조건"),
    );
    if (tab) tab.click();
  });
  await page.waitForSelector(".preset-chips", { timeout: 5000 });

  const presetResults = [];
  for (const label of ["주거용", "상가·근생", "토지·공장/창고", "전체 초기화"]) {
    await page.evaluate((lbl) => {
      const btn = Array.from(document.querySelectorAll(".preset-chips .chip")).find(
        (b) => b.textContent?.trim() === lbl,
      );
      if (btn) btn.click();
    }, label);
    await page.waitForTimeout(150);
    const st = await page.evaluate((lbl) => {
      const btn = Array.from(document.querySelectorAll(".preset-chips .chip")).find(
        (b) => b.textContent?.trim() === lbl,
      );
      const badge = document.querySelectorAll('[role="tab"] .tab-badge')[1]?.textContent?.trim() || null;
      return { pressed: btn?.getAttribute("aria-pressed"), badge };
    }, label);
    presetResults.push({ label, ...st });
  }
  const presetsOk =
    presetResults[0].pressed === "true" &&
    presetResults[1].pressed === "true" &&
    presetResults[2].pressed === "true" &&
    presetResults[3].badge === null;
  record(
    "필터 프리셋 4종 동작",
    presetsOk,
    presetResults.map((p) => `${p.label}(pressed=${p.pressed},badge=${p.badge})`).join(", "),
  );

  // 통합 검색 스키마 JSON 복사
  await page.click(".btn-schema-copy");
  await page.waitForTimeout(200);
  const schemaCheck = await page.evaluate(() => {
    const last = window.__copiedTexts?.[window.__copiedTexts.length - 1] || "";
    try {
      const parsed = JSON.parse(last);
      return {
        ok: Boolean(parsed.location && Array.isArray(parsed.propertyType) && parsed.transaction && parsed.physicalSpecs),
        sido: parsed.location?.sido,
        keys: Object.keys(parsed),
      };
    } catch (e) {
      return { ok: false, err: String(e), rawLen: last.length };
    }
  });
  record(
    "통합 검색 스키마 JSON 복사",
    schemaCheck.ok && schemaCheck.sido?.includes("서울"),
    `sido="${schemaCheck.sido}", keys=[${schemaCheck.keys?.join(",")}]`,
  );

  // RangeSlider 양끝 겹침 시 재조작 검증 (첫 번째 슬라이더: 매매가 / 보증금)
  await page.evaluate(() => {
    document.querySelector('.range-track input[aria-label="매매가 / 보증금 최소"]')?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(150);

  // 양쪽 thumb을 우측 끝(max)으로 이동: lo input에 focus 후 End 키로 최대치 이동
  await page.focus('.range-track input[aria-label="매매가 / 보증금 최소"]');
  await page.press('.range-track input[aria-label="매매가 / 보증금 최소"]', "End");
  await page.waitForTimeout(200);

  const sliderBox = await page.evaluate(() => {
    const track = document.querySelector(".range-track");
    const lo = track?.querySelector('input[aria-label="매매가 / 보증금 최소"]');
    const r = track?.getBoundingClientRect();
    return {
      max: Number(lo?.getAttribute("max") || 15),
      rect: r ? { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } : null,
    };
  });

  const overlapState = await page.evaluate(() => {
    const track = document.querySelector(".range-track");
    const lo = track.querySelector('input[aria-label="매매가 / 보증금 최소"]');
    const hi = track.querySelector('input[aria-label="매매가 / 보증금 최대"]');
    const r = track.getBoundingClientRect();
    // 우측 끝 thumb(24px) 중앙 좌표에서 elementFromPoint 확인
    const hitEl = document.elementFromPoint(r.right - 12, r.top + r.height / 2);
    return {
      loVal: Number(lo.value),
      hiVal: Number(hi.value),
      loZ: Number(getComputedStyle(lo).zIndex),
      hiZ: Number(getComputedStyle(hi).zIndex),
      topHitLabel: hitEl?.getAttribute("aria-label") || hitEl?.tagName,
    };
  });

  // 겹친 상태에서 우측 끝 thumb을 마우스로 잡아 좌측(중앙)으로 드래그해 재조작!
  const endX = sliderBox.rect.right - 12;
  const midX = sliderBox.rect.left + sliderBox.rect.width * 0.5;
  const centerY = sliderBox.rect.top + sliderBox.rect.height / 2;
  await page.mouse.move(endX, centerY);
  await page.mouse.down();
  await page.mouse.move(midX, centerY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterDrag = await page.evaluate(() => {
    const track = document.querySelector(".range-track");
    const lo = track.querySelector('input[aria-label$=" 최소"]');
    const hi = track.querySelector('input[aria-label$=" 최대"]');
    const text = document.querySelector(".range-value")?.textContent?.trim();
    return { loVal: Number(lo.value), hiVal: Number(hi.value), text };
  });

  // 슬라이더 초기화
  await page.evaluate(() => {
    const resetBtn = document.querySelector(".range-reset-btn");
    if (resetBtn) resetBtn.click();
  });
  await page.waitForTimeout(200);

  record(
    "RangeSlider 양끝 겹침 시 z-index 및 재조작",
    overlapState.loVal === sliderBox.max &&
      overlapState.hiVal === sliderBox.max &&
      overlapState.loZ > overlapState.hiZ &&
      String(overlapState.topHitLabel).includes("최소") &&
      afterDrag.loVal < overlapState.loVal,
    `겹침(${overlapState.loVal}/${overlapState.hiVal}, loZ=${overlapState.loZ}>hiZ=${overlapState.hiZ}, hit="${overlapState.topHitLabel}") → 재조작 후 lo=${afterDrag.loVal} ("${afterDrag.text}")`,
  );

  // 5. 결과 모달 필터/정렬/더보기 + 북마크/비교함 + 엑셀 다운로드 & 파싱
  await page.waitForFunction(
    () => {
      const b = document.querySelector(".btn-main");
      return b && !b.hasAttribute("disabled") && /매물.*보기/.test(b.textContent || "");
    },
    undefined,
    { timeout: 15000 },
  );
  await page.click(".btn-main");
  await page.waitForSelector(".modal .result-card", { timeout: 15000 });
  await page.waitForTimeout(300);

  const initialModal = await page.evaluate(() => ({
    sub: document.querySelector(".modal-head p")?.textContent?.trim(),
    cardCount: document.querySelectorAll(".modal .result-card").length,
    loadMoreText: document.querySelector(".btn-load-more")?.textContent?.trim(),
  }));

  // 정렬 테스트 (price_asc, price_desc, area_desc)
  await page.selectOption(".modal-sort-select", "price_asc");
  await page.waitForTimeout(500);
  const priceAscOk = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll(".modal .result-card .result-top strong")).map((el) =>
      el.textContent?.trim(),
    );
    return { count: texts.length, first: texts[0], last: texts[texts.length - 1] };
  });

  await page.selectOption(".modal-sort-select", "price_desc");
  await page.waitForTimeout(500);
  const priceDescOk = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll(".modal .result-card .result-top strong")).map((el) =>
      el.textContent?.trim(),
    );
    return { first: texts[0], last: texts[texts.length - 1] };
  });

  await page.selectOption(".modal-sort-select", "area_desc");
  await page.waitForTimeout(500);
  const areaDescOk = await page.evaluate(() => {
    const areas = Array.from(document.querySelectorAll(".modal .result-card .result-meta")).map((el) => {
      const m = el.textContent?.match(/대지\s+([\d,]+)㎡/);
      return m ? Number(m[1].replace(/,/g, "")) : 0;
    });
    return {
      first: areas[0],
      last: areas[areas.length - 1],
      monotonic: areas.every((v, i) => i === 0 || areas[i - 1] >= v),
    };
  });

  await page.selectOption(".modal-sort-select", "ppp_asc");
  await page.waitForTimeout(500);

  // 더 보기(페이지네이션) 클릭
  await page.evaluate(() => {
    document.querySelector(".btn-load-more")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(150);
  await page.click(".btn-load-more");
  await page.waitForFunction(() => document.querySelectorAll(".modal .result-card").length > 50, undefined, {
    timeout: 15000,
  });
  const afterLoadMoreCount = await page.evaluate(
    () => document.querySelectorAll(".modal .result-card").length,
  );
  await page.evaluate(() => {
    const list = document.querySelector(".modal .result-list");
    if (list) list.scrollTop = 0;
  });
  await page.waitForTimeout(150);

  // 모달 내 거래유형 필터 + 키워드 검색 (로드된 목록 내 실제 존재하는 거래유형으로 검증)
  const targetTradeLabel = await page.evaluate(() => {
    const firstTrade = document.querySelector(".modal .result-card .trade")?.textContent?.trim();
    return firstTrade || "매매";
  });
  await page.evaluate((lbl) => {
    const btn = Array.from(document.querySelectorAll(".modal-filter-pills .modal-pill")).find(
      (b) => b.textContent?.trim() === lbl,
    );
    if (btn) btn.click();
  }, targetTradeLabel);
  await page.waitForTimeout(200);
  const tradeFilterCheck = await page.evaluate((lbl) => {
    const badges = Array.from(document.querySelectorAll(".modal .result-card .trade")).map((el) =>
      el.textContent?.trim(),
    );
    return { count: badges.length, allMatch: badges.length > 0 && badges.every((b) => b === lbl) };
  }, targetTradeLabel);
  // 전체로 복귀
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll(".modal-filter-pills .modal-pill")).find(
      (b) => b.textContent?.trim() === "전체",
    );
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);

  const firstDong = await page.evaluate(() => {
    const addr = document.querySelector(".modal .result-card .result-addr")?.textContent?.trim() || "";
    return addr.split(/\s+/)[2] || addr.split(/\s+/)[1] || "";
  });
  await page.fill(".modal-search-input", firstDong);
  await page.waitForTimeout(200);
  const keywordFilteredCount = await page.evaluate(
    () => document.querySelectorAll(".modal .result-card").length,
  );
  await page.fill(".modal-search-input", "");
  await page.waitForTimeout(200);

  record(
    "결과 모달 필터·정렬·더보기(페이지네이션)",
    initialModal.cardCount === 50 &&
      afterLoadMoreCount === 100 &&
      areaDescOk.monotonic &&
      tradeFilterCheck.allMatch &&
      keywordFilteredCount > 0 &&
      keywordFilteredCount < afterLoadMoreCount,
    `초기=${initialModal.cardCount}건 → 더보기=${afterLoadMoreCount}건, areaDesc=${areaDescOk.first}→${areaDescOk.last}㎡, ${targetTradeLabel}필터=${tradeFilterCheck.count}건, 키워드("${firstDong}")=${keywordFilteredCount}건`,
  );

  // 북마크(★) 및 비교함(2건 이상 담기)
  for (const [cardIdx, btnIdx] of [
    [1, 1],
    [2, 2],
    [3, 2],
  ]) {
    const sel = `.modal .result-card:nth-of-type(${cardIdx}) .btn-card-action:nth-of-type(${btnIdx})`;
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel);
    await page.waitForTimeout(100);
    await page.click(sel);
  }
  await page.waitForTimeout(200);

  // 엑셀 다운로드 (ResultsModal - 100건)
  await page.events(); // 이전 이벤트 버퍼 비우기
  const beforeFiles1 = new Set(fs.readdirSync(DOWNLOAD_DIR));
  await page.click('.modal .modal-head .btn-export-excel[title*="현재 목록"]');
  const xlsxPath1 = await waitForXlsxDownload(page, beforeFiles1);
  const xlsxSummary1 = verifyXlsxFile(xlsxPath1, 100);
  record(
    "엑셀(.xlsx) 다운로드 및 16컬럼(A~P) + M~P 하이퍼링크 검증",
    true,
    `파일=${path.basename(xlsxPath1)}, 시트="${xlsxSummary1.sheetName}", 컬럼=${xlsxSummary1.cols}, 행=${xlsxSummary1.rows}, M~P링크검증=${xlsxSummary1.linkChecked}행 OK`,
  );

  // 비교함 모달 열기 & 테이블/공유복사/북마크엑셀 검증
  await page.click('.modal .modal-head .btn-header-pill[title*="비교함"]');
  await page.waitForSelector('.modal[aria-label="관심 매물 및 비교함"] .compare-table', { timeout: 10000 });
  await page.waitForTimeout(200);

  const compareCheck = await page.evaluate(() => {
    const modal = document.querySelector('.modal[aria-label="관심 매물 및 비교함"]');
    const colCount = modal?.querySelectorAll(".compare-table thead th").length || 0;
    const rowLabels = Array.from(modal?.querySelectorAll(".compare-table tbody th") || []).map((th) =>
      th.textContent?.trim(),
    );
    const badge = modal?.querySelector(".version-badge")?.textContent?.trim();
    return { colCount, rowLabels, badge };
  });

  // 비교 공유복사 클릭
  await page.evaluate(() => {
    const modal = document.querySelector('.modal[aria-label="관심 매물 및 비교함"]');
    const btn = Array.from(modal.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("비교 공유복사"),
    );
    if (btn) btn.click();
  });
  await page.waitForTimeout(200);
  const compareCopied = await page.evaluate(
    () => window.__copiedTexts?.[window.__copiedTexts.length - 1] || "",
  );

  // 북마크 엑셀 다운로드
  await page.events(); // 이전 이벤트 버퍼 비우기
  const beforeFiles2 = new Set(fs.readdirSync(DOWNLOAD_DIR));
  await page.evaluate(() => {
    const modal = document.querySelector('.modal[aria-label="관심 매물 및 비교함"]');
    const btn = modal.querySelector(".btn-export-excel");
    if (btn) btn.click();
  });
  const xlsxPath2 = await waitForXlsxDownload(page, beforeFiles2);
  const xlsxSummary2 = verifyXlsxFile(xlsxPath2, 3);

  record(
    "관심 매물 북마크·비교함 테이블·비교 공유복사·북마크 엑셀",
    compareCheck.colCount === 3 && // 비교항목 + 매물 2건
      compareCheck.rowLabels.length === 8 &&
      compareCopied.includes("[관심 매물 비교 (2건)]") &&
      xlsxSummary2.rows === 3,
    `badge="${compareCheck.badge}", 테이블열=${compareCheck.colCount}(매물${compareCheck.colCount - 1}건), 행=${compareCheck.rowLabels.length}개, 북마크엑셀=${xlsxSummary2.rows}행`,
  );

  await page.click('.modal[aria-label="관심 매물 및 비교함"] .btn-icon[aria-label="닫기"]');
  await page.waitForTimeout(200);

  const desktopErrors = await page.evaluate(() => window.__qaErrors || []);
  record("데스크톱 콘솔/페이지 에러 0건", desktopErrors.length === 0, `에러=${desktopErrors.length}건 ${desktopErrors.join(" | ")}`);

  // =========================================================================
  // PART B. 모바일(390×844) 상호작용 & 지도/바텀시트/miniCard 검증
  // =========================================================================
  const mPage = await task.newPage();
  await setupErrorAndClipboardTracking(mPage);
  await mPage.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await mPage.cdp("Emulation.setTouchEmulationEnabled", { enabled: true });

  await mPage.goto(BASE_URL, { timeout: 20000 });
  await mPage.evaluate(() => localStorage.clear());
  await mPage.reload({ timeout: 20000 });
  await mPage.waitForSelector(".search-panel.layout-mobile", { timeout: 15000 });
  await mPage.waitForTimeout(3000);

  // snap-1 (기본 50%) -> 클릭 1회 -> snap-2 (90%) -> 클릭 1회 -> snap-0 (15%)
  await mPage.click(".sheet-handle-bar");
  await mPage.waitForTimeout(450);
  await mPage.click(".sheet-handle-bar");
  await mPage.waitForTimeout(500);

  const mobileSnap0 = await mPage.evaluate(() => ({
    panelClass: document.querySelector(".search-panel")?.className,
    mapCanvas: (() => {
      const r = document.querySelector("canvas.maplibregl-canvas")?.getBoundingClientRect();
      return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    })(),
  }));

  // 지도 내 한반도 폴리곤 영역 탭 (초기 50% 패딩 기준으로 한반도가 상단 y=160~260 부근에 배치됨)
  let miniCardOpened = false;
  let polyTapPoint = null;
  const candidatePoints = [
    [195, 200],
    [195, 220],
    [195, 240],
    [195, 180],
    [205, 210],
    [185, 230],
    [195, 270],
    [195, 310],
  ];
  for (const [x, y] of candidatePoints) {
    await mPage.mouse.click(x, y);
    await mPage.waitForTimeout(300);
    const hasMini = await mPage.evaluate(() => Boolean(document.querySelector(".mini-card")));
    if (hasMini) {
      miniCardOpened = true;
      polyTapPoint = [x, y];
      break;
    }
  }

  // 빈 영역(좌상단 황해 해상 좌표 25, 90) 탭 -> miniCard 해제 검증
  await mPage.mouse.click(25, 90);
  await mPage.waitForTimeout(300);
  const miniDismissed = await mPage.evaluate(() => !document.querySelector(".mini-card"));

  // 다시 폴리곤 탭하여 miniCard 재노출 후 바텀시트 스냅(50%/90%) 겹침 검증
  // (첫 탭으로 해당 시·도가 선택되며 snap-0 가시 영역 정중앙 y≈358 부근으로 fitBounds 이동됨)
  let miniReopened = false;
  for (const [x, y] of [
    [195, 358],
    [195, 330],
    [195, 380],
    [195, 280],
    [195, 200],
  ]) {
    await mPage.mouse.click(x, y);
    await mPage.waitForTimeout(300);
    const hasMini = await mPage.evaluate(() => Boolean(document.querySelector(".mini-card")));
    if (hasMini) {
      miniReopened = true;
      break;
    }
  }

  // snap-0 -> snap-1 (50%)
  await mPage.click(".sheet-handle-bar");
  await mPage.waitForTimeout(500);
  const snap1Check = await mPage.evaluate(() => {
    const panel = document.querySelector(".search-panel");
    const mini = document.querySelector(".mini-card");
    const canvas = document.querySelector("canvas.maplibregl-canvas");
    const pRect = panel?.getBoundingClientRect();
    const mRect = mini?.getBoundingClientRect();
    const cRect = canvas?.getBoundingClientRect();
    return {
      panelClass: panel?.className,
      miniClass: mini?.className,
      panelTop: pRect ? Math.round(pRect.top) : null,
      panelHeight: pRect ? Math.round(pRect.height) : null,
      miniBottom: mRect ? Math.round(mRect.bottom) : null,
      miniHeight: mRect ? Math.round(mRect.height) : null,
      noOverlap: Boolean(pRect && mRect && mRect.bottom <= pRect.top + 1),
      mapRendered: Boolean(cRect && cRect.width === 390 && cRect.height >= 700),
    };
  });

  // snap-1 -> snap-2 (90%)
  await mPage.click(".sheet-handle-bar");
  await mPage.waitForTimeout(500);
  const snap2Check = await mPage.evaluate(() => {
    const panel = document.querySelector(".search-panel");
    const mini = document.querySelector(".mini-card");
    const canvas = document.querySelector("canvas.maplibregl-canvas");
    const pRect = panel?.getBoundingClientRect();
    const cRect = canvas?.getBoundingClientRect();
    const miniDisplay = mini ? getComputedStyle(mini).display : "none";
    return {
      panelClass: panel?.className,
      panelHeight: pRect ? Math.round(pRect.height) : null,
      miniDisplay,
      mapRendered: Boolean(cRect && cRect.width === 390 && cRect.height >= 700),
    };
  });

  const mobileErrors = await mPage.evaluate(() => window.__qaErrors || []);

  record(
    "모바일(390×844) 지도 탭 miniCard 노출 및 빈 영역 탭 해제",
    miniCardOpened && miniDismissed && miniReopened,
    `tapPoint=${JSON.stringify(polyTapPoint)}, opened=${miniCardOpened}, emptyTapDismissed=${miniDismissed}, reopened=${miniReopened}`,
  );

  record(
    "모바일 바텀시트 스냅(50%/90%) 전환 시 지도 렌더링 및 miniCard 겹침 없음",
    snap1Check.noOverlap &&
      snap1Check.mapRendered &&
      snap2Check.miniDisplay === "none" &&
      snap2Check.mapRendered &&
      (snap2Check.panelHeight ?? 0) > (snap1Check.panelHeight ?? 0),
    `50%(panelH=${snap1Check.panelHeight}px, miniBottom=${snap1Check.miniBottom}<=panelTop=${snap1Check.panelTop}, overlap=false) | 90%(panelH=${snap2Check.panelHeight}px, miniDisplay=${snap2Check.miniDisplay})`,
  );

  record("모바일 콘솔/페이지 에러 0건", mobileErrors.length === 0, `에러=${mobileErrors.length}건 ${mobileErrors.join(" | ")}`);

  const allPassed = results.every((r) => r.passed);
  console.log(`\n=== QA SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED ===`);
  if (!allPassed) {
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  await task.finish({ keep: [] });
}
