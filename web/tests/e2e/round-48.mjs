// round-48.mjs: 라이브 사이트 매물 모달 내 네이버부동산 링크 최종 검증
const task = await taskSpace("verify-naver-land-48");
const page = (await task.pages())[0] || (await task.newPage());

console.log('[1] 라이브 사이트 접속...');
await page.goto('https://nitride2bena.github.io/real-estate-search-v1.5/?t=' + Date.now());
await new Promise(r => setTimeout(r, 3000));

console.log('[2] 서울 선택...');
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

let linkInfo = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 500));
  linkInfo = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return null;
    const firstCard = modal.querySelector('.result-card');
    if (!firstCard) return null;
    const addr = firstCard.querySelector('.result-addr')?.textContent?.trim();
    const naverLink = firstCard.querySelector('.link-naver');
    return {
      addr,
      href: naverLink?.getAttribute('href'),
      text: naverLink?.textContent?.trim()
    };
  });
  if (linkInfo && linkInfo.href) break;
}

console.log('첫 번째 매물 정보:', JSON.stringify(linkInfo, null, 2));

if (linkInfo && linkInfo.href) {
  console.log('[4] 네이버 부동산 링크 실제 접속 검증...');
  const testPage = await task.newPage();
  await testPage.goto(linkInfo.href, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  const title = await testPage.title();
  const currentUrl = await testPage.evaluate(() => window.location.href);
  const snippet = await testPage.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
  
  console.log(`- 접속 결과:`);
  console.log(`  Title: "${title}"`);
  console.log(`  Loaded URL: ${currentUrl.slice(0, 80)}...`);
  console.log(`  Snippet: ${snippet.replace(/\n+/g, ' ')}`);
  
  const isNormal = snippet.includes('단지') || snippet.includes('지역 1 개') || snippet.includes('아파트') || currentUrl.includes('fin.land.naver.com');
  console.log(`  정상 동작 여부: ${isNormal ? '✅ 정상 로드' : '⚠️ 확인 필요'}`);
  await testPage.close();
}

await task.finish({ keep: [] });
