// round-46.mjs: 충북 충주시 달천동 및 다양한 지역 테스트
const task = await taskSpace("naver-land-test-46");

const candidates = [
  { name: "fin.land 충북 충주시 달천동", url: `https://fin.land.naver.com/search?q=${encodeURIComponent("충북 충주시 달천동")}` },
  { name: "fin.land 충주시 달천동", url: `https://fin.land.naver.com/search?q=${encodeURIComponent("충주시 달천동")}` },
  { name: "new.land sk 충주시 달천동", url: `https://new.land.naver.com/search?sk=${encodeURIComponent("충주시 달천동")}` },
  { name: "fin.land map 명일동", url: `https://fin.land.naver.com/map?query=${encodeURIComponent("서울 강동구 명일동")}` },
];

for (const c of candidates) {
  try {
    const p = await task.newPage();
    await p.goto(c.url, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2500));
    const title = await p.title();
    const finalUrl = await p.evaluate(() => window.location.href);
    const snippet = await p.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
    console.log(`[${c.name}]`);
    console.log(`  - Title: ${title}`);
    console.log(`  - Final URL: ${finalUrl}`);
    console.log(`  - Snippet: ${snippet.replace(/\n+/g, ' ')}`);
    console.log('--------------------------------------------------');
    await p.close();
  } catch (e) {
    console.log(`[${c.name}] ERROR: ${e.message}`);
  }
}

await task.finish({ keep: [] });
