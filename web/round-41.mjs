// round-41.mjs: 디버깅 및 직접 검색 상태 점검
const task = await taskSpace("verify-debug-41");
const page = (await task.pages())[0] || (await task.newPage());

await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 2500));

// 충북 클릭
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cb = chips.find(c => c.textContent && c.textContent.includes('충북'));
  if (cb) cb.click();
});
await new Promise(r => setTimeout(r, 1500));

// 충주시 클릭
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.region-chip'));
  const cj = chips.find(c => c.textContent && c.textContent.includes('충주시'));
  if (cj) cj.click();
});
await new Promise(r => setTimeout(r, 1500));

// 버튼 텍스트 확인
const btnText = await page.evaluate(() => document.querySelector('.btn-main')?.innerText);
console.log('버튼 텍스트:', btnText);

// 버튼 클릭
await page.evaluate(() => document.querySelector('.btn-main')?.click());
await new Promise(r => setTimeout(r, 2000));

// 모달 내용 확인
const modalInfo = await page.evaluate(() => {
  const m = document.querySelector('.modal');
  if (!m) return { open: false };
  return {
    open: true,
    head: m.querySelector('.modal-head')?.innerText,
    htmlSnippet: m.innerHTML.slice(0, 1000)
  };
});
console.log('모달 정보:', modalInfo);

await task.finish({ keep: [] });
