// round-44.mjs: 폴링 대기 및 엑셀 다운로드 검증
const task = await taskSpace("verify-excel-44");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 로드...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 3000));

console.log('[2] 서울 칩 선택 대기...');
for (let i = 0; i < 20; i++) {
  const clicked = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.chip'));
    const seoul = chips.find(c => c.textContent && c.textContent.includes('서울'));
    if (seoul) {
      seoul.click();
      return true;
    }
    return false;
  });
  if (clicked) break;
  await new Promise(r => setTimeout(r, 500));
}

await new Promise(r => setTimeout(r, 2000));

console.log('[3] 모달 오픈...');
await page.evaluate(() => {
  const btn = document.querySelector('.btn-main');
  if (btn) btn.click();
});

let excelState = null;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  excelState = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return null;
    const excelBtn = modal.querySelector('.btn-export-excel');
    const cards = modal.querySelectorAll('.result-card');
    return {
      hasModal: true,
      cardCount: cards.length,
      hasExcelBtn: Boolean(excelBtn),
      btnText: excelBtn?.textContent?.trim(),
      disabled: excelBtn?.disabled
    };
  });
  if (excelState && excelState.cardCount > 0) break;
}

console.log('엑셀 다운로드 상태:', JSON.stringify(excelState, null, 2));

if (excelState && excelState.hasExcelBtn) {
  console.log('[4] 엑셀 다운로드 버튼 클릭...');
  await page.evaluate(() => {
    document.querySelector('.btn-export-excel')?.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim());
  console.log('토스트 알림 확인:', toast);
}

await task.finish({ keep: [] });
