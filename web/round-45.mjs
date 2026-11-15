// round-45.mjs: 네이버 부동산 다양한 검색 URL 패턴 테스트
const task = await taskSpace("naver-land-test-45");

const testAddresses = [
  { full: "서울 강동구 명일1동 391", dong: "서울 강동구 명일동", simple: "명일동" },
  { full: "충북 충주시 달천동 734-8", dong: "충북 충주시 달천동", simple: "달천동" }
];

const urls = [
  // 1. 기존 m.land.naver.com
  { name: "m.land dong", url: `https://m.land.naver.com/search/result/${encodeURIComponent(testAddresses[0].dong)}` },
  // 2. new.land.naver.com PC 검색
  { name: "new.land sk full", url: `https://new.land.naver.com/search?sk=${encodeURIComponent(testAddresses[0].full)}` },
  { name: "new.land sk dong", url: `https://new.land.naver.com/search?sk=${encodeURIComponent(testAddresses[0].dong)}` },
  // 3. fin.land.naver.com Npay 부동산
  { name: "fin.land q full", url: `https://fin.land.naver.com/search?q=${encodeURIComponent(testAddresses[0].full)}` },
  { name: "fin.land q dong", url: `https://fin.land.naver.com/search?q=${encodeURIComponent(testAddresses[0].dong)}` },
  // 4. 네이버 통합검색 부동산 스마트블록
  { name: "naver search 부동산", url: `https://search.naver.com/search.naver?query=${encodeURIComponent(testAddresses[0].dong + " 부동산")}` },
  // 5. 네이버 지도 검색
  { name: "map.naver.com", url: `https://map.naver.com/p/search/${encodeURIComponent(testAddresses[0].full)}` },
];

console.log('네이버 부동산 URL 후보 테스트 시작...');

for (const item of urls) {
  try {
    const p = await task.newPage();
    const res = await p.goto(item.url, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2500));
    const title = await p.title();
    const finalUrl = await p.evaluate(() => window.location.href);
    const bodyText = await p.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
    console.log(`[${item.name}]`);
    console.log(`  - Title: ${title}`);
    console.log(`  - Final URL: ${finalUrl}`);
    console.log(`  - Snippet: ${bodyText.replace(/\n+/g, ' ')}`);
    console.log('--------------------------------------------------');
    await p.close();
  } catch (err) {
    console.log(`[${item.name}] ERROR: ${err.message}`);
  }
}

await task.finish({ keep: [] });
