// ==============================================================
// 쿠팡 소싱 수집기 - Chrome 콘솔용 (F12 > Console)
//
// [사용법]
//  1. 쿠팡 검색 결과 1페이지에서 익스텐션 활성화 (우클릭 > 쿠팡 상품 지표보기)
//  2. 지표가 보이면 F12 > Console에 이 스크립트 붙여넣기 → Enter
//  3. 현재 페이지 수집 후 자동으로 다음 페이지로 이동
//  4. 각 페이지에서 자동으로 같은 스크립트 다시 붙여넣기 안내
//  5. 4페이지 완료 시 CSV+JSON 자동 다운로드
//
// [팁] 매번 붙여넣기 귀찮으면:
//       1페이지에서 이 스크립트 붙여넣기 후
//       2~4페이지에서는 콘솔에서 ↑(위 화살표) 누르고 Enter만 치면 됩니다.
// ==============================================================

(() => {
  const TOTAL_PAGES = 4;
  const SK = '__cp_sourcing__';

  function scrape() {
    const products = [];
    document.querySelectorAll('li.search-product, li[class*="search-product"]').forEach((item, idx) => {
      const p = {};
      p['상품명'] = item.querySelector('.name, .descriptions .name')?.textContent?.trim() || '';
      p['가격'] = item.querySelector('.price-value, strong.price-value')?.textContent?.trim() || '';
      p['할인율'] = item.querySelector('.discount-percentage, .instant-discount-rate')?.textContent?.trim() || '';
      p['별점'] = item.querySelector('.rating, .star-rating .rating')?.textContent?.trim() || '';
      p['리뷰수'] = item.querySelector('.rating-total-count, .count')?.textContent?.trim()?.replace(/[()]/g, '') || '';

      const href = item.querySelector('a.search-product-link, a[href*="/products/"]')?.getAttribute('href') || '';
      p['상품ID'] = href.match(/products\/(\d+)/)?.[1] || '';
      p['링크'] = href ? 'https://www.coupang.com' + href : '';
      p['로켓배송'] = item.querySelector('.badge.rocket, img[alt*="로켓"]') ? 'Y' : 'N';

      const me = item.querySelector('.ct-metrics, .ct-prodinfo');
      if (me) {
        me.querySelectorAll('.metric').forEach(row => {
          const l = row.querySelector('.label')?.textContent?.trim() || '';
          const v = row.querySelector('.value')?.textContent?.trim() || '';
          if (l.includes('조회수')) p['조회수'] = v;
          if (l.includes('판매량')) p['판매량'] = v;
          if (l.includes('전환율')) p['전환율'] = v;
          if (l.includes('매출')) p['매출'] = v;
        });

        // chip 기반 fallback
        if (!p['조회수']) me.querySelectorAll('.chip').forEach(c => {
          const t = c.textContent?.trim();
          if (c.className.includes('pv')) p['조회수'] = t;
          else if (c.className.includes('rate')) p['전환율'] = t;
          else if (c.className.includes('sales') && !p['판매량']) p['판매량'] = t;
          else if (c.className.includes('sales')) p['매출'] = t;
        });

        // revenue display
        const rev = me.querySelector('.ct-revenue-display');
        if (rev) p['매출'] = rev.textContent?.trim();

        // 텍스트 파싱 fallback
        const ft = me.textContent || '';
        if (!p['조회수']) p['조회수'] = ft.match(/조회수\s*([\d,]+)/)?.[1] || '';
        if (!p['판매량']) p['판매량'] = ft.match(/판매량\s*([\d,]+)/)?.[1] || '';
        if (!p['전환율']) p['전환율'] = ft.match(/전환율\s*([\d.]+%?)/)?.[1] || '';
        if (!p['매출']) p['매출'] = ft.match(/매출\s*([\d,만억원]+)/)?.[1] || '';
        p['노출상품ID'] = ft.match(/노출상품ID\s*(\d+)/)?.[1] || '';
        p['옵션ID'] = ft.match(/옵션ID\s*(\d+)/)?.[1] || '';
        p['브랜드'] = ft.match(/브랜드\s*(\S+)/)?.[1] || '';

        if (!p['조회수'] && !p['판매량']) p['익스텐션_원본'] = ft.trim().replace(/\s+/g, ' ').slice(0, 200);
      }

      if (p['상품명']) { p['순위'] = idx + 1; products.push(p); }
    });
    return products;
  }

  function download(data) {
    const h = ['페이지','순위','상품명','가격','할인율','별점','리뷰수','상품ID','로켓배송','노출상품ID','옵션ID','브랜드','조회수','판매량','전환율','매출','링크'];
    const csv = [h.join(','), ...data.map(p => h.map(k => `"${(p[k]||'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
    const d = new Date().toISOString().slice(0,10);

    const a1 = document.createElement('a');
    a1.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'}));
    a1.download = `coupang_sourcing_${d}.csv`; a1.click();

    const a2 = document.createElement('a');
    a2.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    a2.download = `coupang_sourcing_${d}.json`; a2.click();
  }

  // === 실행 ===
  const pg = parseInt(new URLSearchParams(location.search).get('page')) || 1;
  let all = [];
  try { all = JSON.parse(sessionStorage.getItem(SK) || '[]'); } catch {}

  // 이전 페이지 데이터가 현재 페이지보다 높으면 리셋 (새로 시작)
  if (all.length > 0 && all[all.length-1]['페이지'] >= pg) {
    all = [];
  }

  console.log(`%c=== 페이지 ${pg}/${TOTAL_PAGES} 수집중 ===`, 'color:#0984e3;font-size:14px;font-weight:bold');

  const hasExt = !!document.querySelector('.ct-metrics, .ct-prodinfo');
  console.log(hasExt ? '  ✓ 익스텐션 지표 감지됨' : '  ✗ 익스텐션 지표 없음 (기본 데이터만 수집)');

  const products = scrape();
  products.forEach(p => { p['페이지'] = pg; });
  all.push(...products);
  sessionStorage.setItem(SK, JSON.stringify(all));

  console.log(`  수집: ${products.length}개 | 누적: ${all.length}개`);
  console.table(products.slice(0,5).map(p => ({
    순위:p['순위'], 상품명:p['상품명']?.slice(0,30), 가격:p['가격'],
    조회수:p['조회수']||'-', 판매량:p['판매량']||'-', 전환율:p['전환율']||'-', 매출:p['매출']||'-'
  })));

  if (pg < TOTAL_PAGES) {
    console.log(`%c\n>> ${pg+1}페이지로 이동합니다. 이동 후 콘솔에서 ↑ Enter로 다시 실행하세요 <<`, 'color:#6c5ce7;font-weight:bold');
    setTimeout(() => {
      const p = new URLSearchParams(location.search);
      p.set('page', pg + 1);
      location.search = p.toString();
    }, 2000);
  } else {
    // 완료
    download(all);
    const wm = all.filter(p => p['조회수'] || p['판매량']).length;
    console.log(`%c\n=== 수집 완료! ===`, 'color:#00b894;font-size:16px;font-weight:bold');
    console.log(`총 ${all.length}개 상품 (지표 포함: ${wm}개)`);
    console.log('CSV + JSON 다운로드 완료!');
    sessionStorage.removeItem(SK);
  }
})();
