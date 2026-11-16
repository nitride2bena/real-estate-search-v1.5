// round-43.mjs: 엑셀 다운로드 버튼 렌더링 및 클릭 테스트
const task = await taskSpace("verify-excel-43");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 로드...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 2500));

console.log('[2] 서울 선택...');
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.chip'));
  const seoul = chips.find(c => c.textContent && c.textContent.includes('서울'));
  if (seoul) seoul.click();
});
await new Promise(r => setTimeout(r, 1500));

console.log('[3] 결과 모달 오픈...');
await page.evaluate(() => {
  const btn = document.querySelector('.btn-main');
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2000));

// 엑셀 다운로드 버튼 및 모달 헤더 상태 확인
const result = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  if (!modal) return { hasModal: false };
  const excelBtn = modal.querySelector('.btn-export-excel');
  return {
    hasModal: true,
    hasExcelBtn: Boolean(excelBtn),
    excelBtnText: excelBtn?.textContent?.trim(),
    excelBtnDisabled: excelBtn?.disabled,
    cardCount: modal.querySelectorAll('.result-card').length
  };
});

console.log('엑셀 버튼 상태:', JSON.stringify(result, null, 2));

// 엑셀 다운로드 버튼 클릭
if (result.hasExcelBtn && !result.excelBtnDisabled) {
  console.log('[4] 엑셀 다운로드 버튼 클릭...');
  await page.evaluate(() => {
    document.querySelector('.btn-export-excel')?.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  
  // 토스트 메시지 확인
  const toastText = await page.evaluate(() => document.querySelector('.toast')?.textContent?.trim());
  console.log('토스트 알림:', toastText);
}

await task.finish({ keep: [] });
