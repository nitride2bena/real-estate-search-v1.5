// round-42.mjs: UI 조작 및 매물 모달 4종 링크 검증
const task = await taskSpace("verify-links-42");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 로드...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 3000));

console.log('[2] 충북 선택...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.chip'));
  const cb = chips.find(c => c.textContent && c.textContent.includes('충북'));
  if (cb) cb.click();
});
await new Promise(r => setTimeout(r, 1000));

console.log('[3] 다음 단계(시군구) 클릭...');
await page.evaluate(() => {
  const nextBtn = document.querySelector('.btn-next');
  if (nextBtn) nextBtn.click();
});
await new Promise(r => setTimeout(r, 1500));

console.log('[4] 충주시 선택 및 다음 단계(읍면동) 클릭...');
await page.evaluate(() => {
  // 시군구 목록 중 충주시 라벨/체크박스 찾기
  const labels = Array.from(document.querySelectorAll('label'));
  const cj = labels.find(l => l.textContent && l.textContent.includes('충주시'));
  if (cj) {
    const input = cj.querySelector('input') || cj;
    input.click();
  }
});
await new Promise(r => setTimeout(r, 1500));

// btn-main 매물 버튼 텍스트 확인
const btnText = await page.evaluate(() => document.querySelector('.btn-main')?.innerText);
console.log('매물 버튼 텍스트:', btnText);

// 매물 보기 클릭
await page.evaluate(() => document.querySelector('.btn-main')?.click());
console.log('[5] 매물 모달 오픈 대기...');

let cardsInfo = null;
for (let i = 0; i < 25; i++) {
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

console.log('카드 정보:', JSON.stringify(cardsInfo, null, 2));

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
