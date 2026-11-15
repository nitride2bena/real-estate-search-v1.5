// round-47.mjs: 정식 시도명 및 시군구+동 검색어 테스트
const task = await taskSpace("naver-land-test-47");

const tests = [
  { label: "정식 시도명 서울", query: "서울특별시 강동구 명일동" },
  { label: "시군구+동 서울", query: "강동구 명일동" },
  { label: "정식 시도명 충북", query: "충청북도 충주시 달천동" },
  { label: "시군구+동 충북", query: "충주시 달천동" }
];

for (const t of tests) {
  try {
    const p = await task.newPage();
    const url = `https://fin.land.naver.com/search?q=${encodeURIComponent(t.query)}`;
    await p.goto(url, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2500));
    const title = await p.title();
    const snippet = await p.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
    console.log(`[${t.label}] (${t.query})`);
    console.log(`  - Title: ${title}`);
    console.log(`  - Match: ${snippet.includes('지역 1 개') || snippet.includes('단지') ? 'SUCCESS' : 'NO_RESULT'}`);
    console.log(`  - Snippet: ${snippet.replace(/\n+/g, ' ')}`);
    console.log('--------------------------------------------------');
    await p.close();
  } catch (err) {
    console.log(`[${t.label}] ERROR: ${err.message}`);
  }
}

await task.finish({ keep: [] });
