// round-40.mjs: 모달 내 매물 로드 대기 및 링크 4종 검증
const task = await taskSpace("verify-links-40");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 로드...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 2500));

console.log('[2] 충북 클릭...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cb = chips.find(c => c.textContent && c.textContent.includes('충북'));
  if (cb) cb.click();
});
await new Promise(r => setTimeout(r, 1500));

console.log('[3] 충주시 클릭...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cj = chips.find(c => c.textContent && c.textContent.includes('충주시'));
  if (cj) cj.click();
});
await new Promise(r => setTimeout(r, 1500));

console.log('[4] 결과 모달 오픈...');
await page.evaluate(() => {
  const btn = document.querySelector('.btn-main');
  if (btn) btn.click();
});

// 매물 카드가 렌더링될 때까지 폴링 대기
console.log('[5] 매물 카드 로딩 대기...');
let cardsInfo = null;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  cardsInfo = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.result-card'));
    if (cards.length === 0) return null;
    const first = cards[0];
    const addr = first.querySelector('.result-addr')?.textContent?.trim();
    const links = Array.from(first.querySelectorAll('.result-links a')).map(a => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href'),
      title: a.getAttribute('title')
    }));
    return { count: cards.length, addr, links };
  });
  if (cardsInfo) break;
}

console.log('카드 정보 로드 완료:', JSON.stringify(cardsInfo, null, 2));

if (cardsInfo && cardsInfo.links) {
  console.log('\n[6] 링크 4종 실제 페이지 접속 테스트:');
  for (const l of cardsInfo.links) {
    try {
      const p = await task.newPage();
      await p.goto(l.href);
      await new Promise(r => setTimeout(r, 3000));
      const title = await p.title();
      const currentUrl = await p.evaluate(() => window.location.href);
      console.log(`✔ [${l.text}]`);
      console.log(`   - Href: ${l.href}`);
      console.log(`   - Title: "${title}"`);
      console.log(`   - Loaded URL: ${currentUrl.slice(0, 90)}...`);
      await p.close();
    } catch (e) {
      console.log(`⚠ [${l.text}] 에러: ${e.message}`);
    }
  }
}

await task.finish({ keep: [] });
