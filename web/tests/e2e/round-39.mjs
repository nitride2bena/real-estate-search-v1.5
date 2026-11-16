// round-39.mjs: btn-main 클릭 및 매물 링크 실시간 검증
const task = await taskSpace("verify-links-39");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 로드...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 3000));

console.log('[2] 충북 클릭...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cb = chips.find(c => c.textContent && c.textContent.includes('충북'));
  if (cb) cb.click();
});
await new Promise(r => setTimeout(r, 2000));

console.log('[3] 충주시 클릭...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cj = chips.find(c => c.textContent && c.textContent.includes('충주시'));
  if (cj) cj.click();
});
await new Promise(r => setTimeout(r, 2000));

console.log('[4] Enter 키 전송 및 btn-main 클릭...');
await page.evaluate(() => {
  const btn = document.querySelector('.btn-main');
  if (btn && !btn.disabled) {
    btn.click();
  } else {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
});
await new Promise(r => setTimeout(r, 2500));

// 모달 검사
const modalState = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  if (!modal) return { open: false };
  const cards = Array.from(modal.querySelectorAll('.result-card'));
  return {
    open: true,
    cardCount: cards.length,
    firstCard: cards[0] ? {
      addr: cards[0].querySelector('.result-addr')?.textContent?.trim(),
      links: Array.from(cards[0].querySelectorAll('.result-links a')).map(a => ({
        text: a.textContent?.trim(),
        href: a.getAttribute('href'),
        title: a.getAttribute('title')
      }))
    } : null
  };
});

console.log('모달 상태:', JSON.stringify(modalState, null, 2));

if (modalState.firstCard && modalState.firstCard.links) {
  console.log('\n[5] 매물 외부 링크 4종 URL 검증:');
  for (const l of modalState.firstCard.links) {
    console.log(`- [${l.text}]`);
    console.log(`  URL: ${l.href}`);
    console.log(`  Tooltip: ${l.title}`);
    
    // 별도 페이지에서 실제 접속 응답 확인
    try {
      const p = await task.newPage();
      await p.goto(l.href);
      await new Promise(r => setTimeout(r, 2500));
      const title = await p.title();
      const currentUrl = await p.evaluate(() => window.location.href);
      console.log(`  => 로드 성공: 타이틀 = "${title}", 최종URL = ${currentUrl.slice(0, 80)}...`);
      await p.close();
    } catch (e) {
      console.log(`  => 로드 실패: ${e.message}`);
    }
  }
}

await task.finish({ keep: [] });
