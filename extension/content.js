// ===== 쿠팡 소싱 수집기 =====
(function () {
  const K = '__cps__';
  const SERVER = 'http://localhost:8080';
  const CATS = [
    { n: '생활용품 > 수납/정리', id: '184791' },
    { n: '생활용품 > 주방수납/잡화', id: '186147' },
  ];
  const PP = 4;
  const WAIT = 5000;

  // ===== 자동 수집 모드 =====
  let st = JSON.parse(sessionStorage.getItem(K) || 'null');

  if (st && st.running) {
    const cat = CATS[st.ci];
    if (!cat) return;
    if (!location.pathname.includes('/categories/' + cat.id)) {
      location.href = '/np/categories/' + cat.id + '?page=' + st.pg + '&listSize=60&sorter=bestAsc&channel=user';
      return;
    }

    addStopButton();

    setTimeout(async () => {
      showFloat(`${cat.n} ${st.pg}/${PP} 수집중...`, '#fdcb6e');

      // 1. 상품 스크랩
      const products = scrape();
      products.forEach(p => { p['카테고리'] = cat.n; p['페이지'] = st.pg; });

      // 2. Wing API로 지표 가져오기
      if (products.length > 0) {
        showFloat(`${cat.n} ${st.pg}/${PP}: ${products.length}개 발견, 지표 수집중...`, '#00cec9');
        await fetchMetricsForProducts(products);
      }

      // 3. 서버 전송
      if (products.length > 0) {
        try {
          await fetch(SERVER + '/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryName: cat.n, page: st.pg, products, url: location.href }),
          });
        } catch (e) { console.error('[소싱] 서버 전송 실패:', e); }
      }

      st.total = (st.total || 0) + products.length;
      const withMetrics = products.filter(p => p['조회수']).length;
      console.log(`%c[소싱] ${cat.n} p${st.pg}: ${products.length}개 (지표 ${withMetrics}개)`, 'color:#0984e3;font-weight:bold');
      showFloat(`${cat.n} ${st.pg}/${PP}: ${products.length}개 (지표 ${withMetrics}개, 누적 ${st.total})`, '#00b894');

      // 완료?
      if (st.ci >= CATS.length - 1 && st.pg >= PP) {
        sessionStorage.removeItem(K);
        showFloat(`수집 완료! 총 ${st.total}개. localhost:8080에서 확인!`, '#00b894', true);
        return;
      }

      if (st.pg < PP) { st.pg++; } else { st.ci++; st.pg = 1; }
      sessionStorage.setItem(K, JSON.stringify(st));

      const next = CATS[st.ci];
      showFloat(`3초 후 → ${next.n} ${st.pg}페이지`, '#00cec9');
      setTimeout(() => {
        location.href = '/np/categories/' + next.id + '?page=' + st.pg + '&listSize=60&sorter=bestAsc&channel=user';
      }, 3000);
    }, WAIT);
    return;
  }

  // ===== 수동 모드 =====
  if (!location.pathname.includes('/categories/')) return;
  if (document.getElementById('sourcing-btns')) return;

  const wrap = document.createElement('div');
  wrap.id = 'sourcing-btns';
  wrap.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';

  const btnAuto = mkBtn('전체 자동 수집', '#00b894', '#00cec9', '18px', () => {
    fetch(SERVER + '/api/clear', { method: 'POST' }).catch(() => {});
    sessionStorage.setItem(K, JSON.stringify({ ci: 0, pg: 1, total: 0, running: true }));
    location.href = '/np/categories/' + CATS[0].id + '?page=1&listSize=60&sorter=bestAsc&channel=user';
  });

  const btnPage = mkBtn('이 페이지만 수집', '#555', '#777', '14px', async () => {
    btnPage.textContent = '수집중...';
    const products = scrape();
    const catId = location.pathname.match(/categories\/(\d+)/)?.[1] || '';
    const cat = CATS.find(c => c.id === catId);
    const name = cat ? cat.n : document.title.replace(/ - 쿠팡!?$/, '');
    const pg = parseInt(new URLSearchParams(location.search).get('page')) || 1;
    products.forEach(p => { p['카테고리'] = name; p['페이지'] = pg; });

    btnPage.textContent = `${products.length}개 발견, 지표 수집중...`;
    await fetchMetricsForProducts(products);

    try {
      const r = await fetch(SERVER + '/api/collect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: name, page: pg, products, url: location.href }),
      });
      const d = await r.json();
      const wm = products.filter(p => p['조회수']).length;
      btnPage.textContent = `완료! ${products.length}개 (지표 ${wm}개)`;
    } catch { btnPage.textContent = '서버 연결 실패'; }
    setTimeout(() => { btnPage.textContent = '이 페이지만 수집'; }, 3000);
  });

  wrap.appendChild(btnAuto);
  wrap.appendChild(btnPage);
  document.body.appendChild(wrap);

  // ===== Wing API로 지표 가져오기 =====
  async function fetchMetricsForProducts(products) {
    // itemId가 있는 상품만 Wing API 호출
    const targets = products.filter(p => p['_itemId']);
    console.log(`[소싱] Wing API 시작: ${targets.length}/${products.length}개 (itemId 있는 상품)`);

    let success = 0;
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      const itemId = p['_itemId'];
      try {
        const data = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'wing-metrics', keyword: itemId }, resp => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (resp?.error) return reject(new Error(resp.error));
            resolve(resp);
          });
        });

        // result 배열에서 itemId 매칭
        const results = data?.content || data?.result || [];
        const match = results.find(r => String(r.itemId) === itemId)
                   || results.find(r => String(r.productId) === p['상품ID'])
                   || results[0];

        if (match) {
          p['조회수'] = match.pvLast28Day?.toLocaleString() || '';
          p['판매량'] = match.salesLast28d?.toLocaleString() || '';
          p['전환율'] = (match.pvLast28Day && match.salesLast28d) ? ((match.salesLast28d / match.pvLast28Day) * 100).toFixed(2) + '%' : '';
          p['매출'] = (match.salesLast28d && match.salePrice) ? Math.round(match.salesLast28d * match.salePrice).toLocaleString() + '원' : '';
          p['브랜드'] = match.brandName || '';
          p['노출상품ID'] = match.exposureProductId ? String(match.exposureProductId) : '';
          p['옵션ID'] = match.vendorItemId ? String(match.vendorItemId) : '';
          success++;
        }
      } catch (e) {
        console.error(`[소싱] Wing 실패 (${itemId}):`, e.message);
        if (e.message.includes('로그인')) {
          console.error('[소싱] 쿠팡윙 로그인 필요! wing.coupang.com에 로그인하세요.');
          break;
        }
      }
      // 요청 간 딜레이
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 200));
      // 진행률 로그
      if ((i + 1) % 10 === 0) console.log(`[소싱] Wing 진행: ${i + 1}/${targets.length} (성공 ${success})`);
    }
    console.log(`[소싱] Wing 완료: ${success}/${targets.length}개 지표 수집`);
  }

  // ===== 스크래핑 =====
  function scrape() {
    const ps = [];
    const seen = new Set();

    // 상품 링크 기반으로 수집 (가장 확실한 방법)
    const links = document.querySelectorAll('a[href*="/products/"]');
    links.forEach(a => {
      const container = a.closest('li') || a.closest('[class*="product"]') || a.parentElement?.parentElement;
      if (!container || container._done) return;
      container._done = true;
      const p = extractProduct(container, a);
      if (p && !seen.has(p['상품ID'])) { seen.add(p['상품ID']); p['순위'] = ps.length + 1; ps.push(p); }
    });

    console.log(`[소싱] 상품 링크 ${links.length}개 → 수집 ${ps.length}개`);
    return ps;
  }

  function extractProduct(item, lk) {
    const hr = lk?.getAttribute('href') || '';
    const pid = hr.match(/products\/(\d+)/)?.[1];
    if (!pid) return null;

    let name = '';
    // title 속성이 가장 깨끗한 상품명
    name = lk.getAttribute('title') || '';
    if (!name) {
      for (const sel of ['.name', 'dt.name', '.baby-product-name', 'dt', '[class*="name"]']) {
        const el = item.querySelector(sel);
        const t = el?.textContent?.trim();
        if (t && t.length > 2 && t.length < 150) { name = t; break; }
      }
    }
    if (!name || name.length < 2) return null;

    const q = (sels) => {
      for (const s of sels.split(',')) {
        const el = item.querySelector(s.trim());
        if (el) return el.textContent.trim();
      }
      return '';
    };

    // 가격: 텍스트에서 추출 시도
    let price = q('.price-value, strong.price-value, [class*="price-value"], .sale-price .price');
    if (!price) {
      const priceMatch = item.textContent.match(/([\d,]+)원/);
      if (priceMatch) price = priceMatch[1] + '원';
    }

    // 리뷰수
    let reviews = q('.rating-total-count, .count, [class*="rating-total"]').replace(/[()]/g, '');

    // 별점
    let rating = q('.rating:not([class*="count"]):not([class*="total"]), .star-rating .rating');

    // URL에서 itemId, vendorItemId 추출
    let itemId = '', vendorItemId = '';
    try {
      const url = new URL(hr, location.origin);
      itemId = url.searchParams.get('itemId') || '';
      vendorItemId = url.searchParams.get('vendorItemId') || '';
    } catch {}

    return {
      '상품명': name.slice(0, 200),
      '가격': price,
      '할인율': q('.discount-percentage, .instant-discount-rate, [class*="discount"]'),
      '별점': rating,
      '리뷰수': reviews,
      '상품ID': pid,
      '_itemId': itemId,
      '_vendorItemId': vendorItemId,
      '링크': hr.startsWith('http') ? hr : location.origin + hr,
      '로켓배송': item.querySelector('img[alt*="로켓"], [class*="rocket"]') ? 'Y' : 'N',
    };
  }

  // ===== 유틸 =====
  function mkBtn(text, c1, c2, size, onclick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `padding:14px 28px;font-size:${size};font-weight:800;background:linear-gradient(135deg,${c1},${c2});color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);`;
    b.onclick = onclick;
    return b;
  }

  function addStopButton() {
    const b = document.createElement('button');
    b.textContent = '수집 중지';
    b.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:12px 24px;font-size:16px;font-weight:800;background:#d63031;color:#fff;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
    b.onclick = () => { sessionStorage.removeItem(K); location.reload(); };
    document.body.appendChild(b);
  }

  function showFloat(msg, color, persistent) {
    let el = document.getElementById('sourcing-float');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sourcing-float';
      el.style.cssText = 'position:fixed;bottom:30px;right:30px;z-index:99999;padding:16px 24px;font-size:15px;font-weight:700;background:rgba(0,0,0,0.9);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:400px;';
      document.body.appendChild(el);
    }
    el.style.color = color;
    el.textContent = msg;
    if (!persistent) setTimeout(() => { el?.remove(); }, 10000);
  }
})();
