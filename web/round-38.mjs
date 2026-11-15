// round-38.mjs: 새 태스크 스페이스로 검증
const task = await taskSpace("verify real-estate links v2");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 페이지 접속...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 2500));

// 충북 선택
console.log('[2] 충북 선택...');
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button.region-chip'));
  const cb = btns.find(b => b.textContent && b.textContent.includes('충북'));
  if (cb) cb.click();
});
await new Promise(r => setTimeout(r, 1500));

// 충주시 선택
console.log('[3] 충주시 선택...');
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button.region-chip'));
  const cj = btns.find(b => b.textContent && b.textContent.includes('충주시'));
  if (cj) cj.click();
});
await new Promise(r => setTimeout(r, 1500));

// 모달 열기
console.log('[4] 결과 모달 열기...');
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('건') || b.textContent.includes('매물')));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2000));

// 모달 내 매물 카드와 링크 추출
const result = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  if (!modal) return { hasModal: false };
  const cards = Array.from(modal.querySelectorAll('.result-card'));
  if (cards.length === 0) return { hasModal: true, cardCount: 0 };
  
  const firstCard = cards[0];
  const addr = firstCard.querySelector('.result-addr')?.textContent?.trim() || '';
  const links = Array.from(firstCard.querySelectorAll('.result-links a')).map(a => ({
    text: a.textContent?.trim() || '',
    href: a.getAttribute('href') || '',
    title: a.getAttribute('title') || '',
    className: a.className || ''
  }));
  return { hasModal: true, cardCount: cards.length, firstAddr: addr, links };
});

console.log('결과:', JSON.stringify(result, null, 2));

if (result.links && result.links.length > 0) {
  console.log('\n[5] 각 링크 개별 접속 테스트:');
  for (const l of result.links) {
    try {
      const testPage = await task.newPage();
      await testPage.goto(l.href);
      await new Promise(r => setTimeout(r, 3000));
      const title = await testPage.title();
      const currentUrl = await testPage.evaluate(() => window.location.href);
      console.log(`- [${l.text}] -> 상태 OK | 타이틀: "${title}" | 최종URL: ${currentUrl}`);
      await testPage.close();
    } catch (e) {
      console.log(`- [${l.text}] -> 접속 실패: ${e.message}`);
    }
  }
}

await task.finish({ keep: [] });
