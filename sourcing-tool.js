// ==============================================================
// 쿠팡 소싱 도구 v3 - Chrome 콘솔 실행용
//
// [사용법]
//  1. Chrome에서 www.coupang.com 아무 페이지 열기
//  2. 쿠팡윙(wing.coupang.com)에도 로그인된 상태 확인
//  3. F12 > Console에 이 스크립트 전체 붙여넣기 → Enter
//  4. 오른쪽 하단에 소싱 도구 패널이 나타남
//  5. "수집 시작" 버튼 클릭
// ==============================================================

(async () => {
  // ===== 설정 =====
  const CATEGORIES = [
    { name: '생활용품 > 수납/정리', id: '184791' },
    { name: '생활용품 > 주방수납/잡화', id: '186147' },
  ];
  const PAGES_PER_CATEGORY = 4;

  // ===== UI 생성 =====
  const existingPanel = document.getElementById('cp-sourcing-panel');
  if (existingPanel) existingPanel.remove();

  const panel = document.createElement('div');
  panel.id = 'cp-sourcing-panel';
  panel.innerHTML = `
    <style>
      #cp-sourcing-panel {
        position: fixed; bottom: 20px; right: 20px; width: 520px; max-height: 80vh;
        background: #1a1a2e; color: #eee; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, 'Malgun Gothic', sans-serif; font-size: 13px; z-index: 999999;
        display: flex; flex-direction: column; overflow: hidden;
      }
      #cp-sourcing-panel .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 14px 18px; font-size: 15px; font-weight: 700; display: flex;
        justify-content: space-between; align-items: center; cursor: move;
      }
      #cp-sourcing-panel .header .close-btn {
        background: rgba(255,255,255,0.2); border: none; color: #fff; width: 24px; height: 24px;
        border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 24px; text-align: center;
      }
      #cp-sourcing-panel .body { padding: 14px 18px; overflow-y: auto; max-height: 60vh; }
      #cp-sourcing-panel .category-list { margin: 8px 0; }
      #cp-sourcing-panel .category-item {
        background: #16213e; padding: 8px 12px; margin: 4px 0; border-radius: 6px;
        display: flex; justify-content: space-between; align-items: center;
      }
      #cp-sourcing-panel .category-item .status { font-size: 11px; color: #888; }
      #cp-sourcing-panel .category-item .status.done { color: #00b894; }
      #cp-sourcing-panel .category-item .status.active { color: #fdcb6e; }
      #cp-sourcing-panel .btn {
        background: linear-gradient(135deg, #00b894, #00cec9); border: none; color: #fff;
        padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 700;
        cursor: pointer; width: 100%; margin-top: 12px; transition: opacity 0.2s;
      }
      #cp-sourcing-panel .btn:hover { opacity: 0.85; }
      #cp-sourcing-panel .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      #cp-sourcing-panel .btn.download {
        background: linear-gradient(135deg, #0984e3, #6c5ce7);
      }
      #cp-sourcing-panel .progress-bar {
        background: #16213e; border-radius: 4px; height: 6px; margin: 8px 0; overflow: hidden;
      }
      #cp-sourcing-panel .progress-bar .fill {
        background: linear-gradient(90deg, #00b894, #00cec9); height: 100%; width: 0%;
        transition: width 0.3s; border-radius: 4px;
      }
      #cp-sourcing-panel .log {
        background: #0f0f23; border-radius: 6px; padding: 8px 10px; margin-top: 10px;
        font-family: monospace; font-size: 11px; color: #a0a0a0; max-height: 120px;
        overflow-y: auto; white-space: pre-wrap;
      }
      #cp-sourcing-panel .stats {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 10px;
      }
      #cp-sourcing-panel .stat-box {
        background: #16213e; padding: 10px; border-radius: 6px; text-align: center;
      }
      #cp-sourcing-panel .stat-box .num { font-size: 20px; font-weight: 700; color: #00cec9; }
      #cp-sourcing-panel .stat-box .label { font-size: 10px; color: #888; margin-top: 2px; }
      #cp-sourcing-panel table {
        width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;
      }
      #cp-sourcing-panel th {
        background: #16213e; padding: 6px 4px; text-align: left; position: sticky; top: 0;
      }
      #cp-sourcing-panel td { padding: 5px 4px; border-bottom: 1px solid #222; }
      #cp-sourcing-panel tr:hover td { background: rgba(255,255,255,0.03); }
    </style>
    <div class="header">
      <span>🔍 쿠팡 소싱 도구</span>
      <button class="close-btn" id="cp-close">✕</button>
    </div>
    <div class="body">
      <div class="category-list" id="cp-categories"></div>
      <div class="progress-bar"><div class="fill" id="cp-progress"></div></div>
      <div id="cp-status" style="font-size:12px;color:#888;margin:4px 0;">대기중</div>
      <div class="stats" id="cp-stats" style="display:none;">
        <div class="stat-box"><div class="num" id="cp-total">0</div><div class="label">총 상품</div></div>
        <div class="stat-box"><div class="num" id="cp-metrics">0</div><div class="label">지표 포함</div></div>
        <div class="stat-box"><div class="num" id="cp-pages">0</div><div class="label">수집 페이지</div></div>
      </div>
      <button class="btn" id="cp-start-btn">수집 시작</button>
      <button class="btn download" id="cp-download-btn" style="display:none;">📥 엑셀(CSV) 다운로드</button>
      <div class="log" id="cp-log"></div>
      <div id="cp-preview"></div>
    </div>
  `;
  document.body.appendChild(panel);

  // UI 렌더링 - 카테고리 목록
  const catListEl = document.getElementById('cp-categories');
  CATEGORIES.forEach((cat, i) => {
    catListEl.innerHTML += `
      <div class="category-item" id="cp-cat-${i}">
        <span>${cat.name}</span>
        <span class="status" id="cp-cat-status-${i}">대기</span>
      </div>`;
  });

  // UI 헬퍼
  const $ = id => document.getElementById(id);
  const log = (msg) => {
    const el = $('cp-log');
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
    console.log('[소싱도구]', msg);
  };
  const setProgress = (pct) => { $('cp-progress').style.width = pct + '%'; };
  const setStatus = (msg) => { $('cp-status').textContent = msg; };

  // 닫기 버튼
  $('cp-close').onclick = () => panel.remove();

  // 드래그 기능
  let isDragging = false, dragX, dragY;
  panel.querySelector('.header').addEventListener('mousedown', e => {
    isDragging = true;
    dragX = e.clientX - panel.offsetLeft;
    dragY = e.clientY - panel.offsetTop;
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragX) + 'px';
    panel.style.top = (e.clientY - dragY) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // ===== 크롤링 로직 =====
  const allProducts = [];

  async function fetchCategoryPage(categoryId, pageNum) {
    const url = `https://www.coupang.com/np/categories/${categoryId}?page=${pageNum}&listSize=60`;
    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  }

  function parseProductsFromHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const products = [];

    doc.querySelectorAll('li.baby-product, li.search-product, li[class*="product"]').forEach((item, idx) => {
      const p = {};

      // 상품명
      const nameEl = item.querySelector('.name, .descriptions .name, dt.name, .baby-product-name');
      p['상품명'] = nameEl?.textContent?.trim() || '';

      // 가격
      const priceEl = item.querySelector('.price-value, strong.price-value, .base-price');
      p['가격'] = priceEl?.textContent?.trim() || '';

      // 할인율
      const discountEl = item.querySelector('.discount-percentage, .instant-discount-rate, .discount-rate');
      p['할인율'] = discountEl?.textContent?.trim() || '';

      // 별점
      const ratingEl = item.querySelector('.rating, .star-rating .rating, .ratingstar');
      p['별점'] = ratingEl?.textContent?.trim() || '';

      // 리뷰수
      const reviewEl = item.querySelector('.rating-total-count, .count, .ratingcount');
      p['리뷰수'] = reviewEl?.textContent?.trim()?.replace(/[()]/g, '') || '';

      // 상품 링크 & ID
      const linkEl = item.querySelector('a[href*="/products/"], a.baby-product-link');
      const href = linkEl?.getAttribute('href') || '';
      p['상품ID'] = href.match(/products\/(\d+)/)?.[1] || '';
      p['링크'] = href ? 'https://www.coupang.com' + href : '';

      // 아이템ID (vendorItemId)
      const vendorItemId = href.match(/vendorItemId=(\d+)/)?.[1] ||
                           item.getAttribute('data-vendor-item-id') || '';
      p['vendorItemId'] = vendorItemId;

      // 로켓배송
      p['로켓배송'] = item.querySelector('.badge.rocket, img[alt*="로켓"], .rocket-icon') ? 'Y' : 'N';

      if (p['상품명'] && p['상품명'].length > 1) {
        p['순위'] = idx + 1;
        products.push(p);
      }
    });

    return products;
  }

  // Wing API로 지표 수집
  async function getWingMetrics(keyword) {
    try {
      // XSRF 토큰 가져오기
      const cookies = document.cookie.split('; ');
      let xsrfToken = '';
      for (const c of cookies) {
        if (c.startsWith('XSRF-TOKEN=')) {
          xsrfToken = decodeURIComponent(c.split('=')[1]);
          break;
        }
      }

      // Wing API 호출 (다른 서브도메인이라 실패할 수 있음)
      const resp = await fetch('https://wing.coupang.com/tenants/seller-web/pre-matching/search', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-xsrf-token': xsrfToken,
        },
        body: JSON.stringify({
          keyword: String(keyword),
          excludedProductIds: [],
          searchPage: 0,
          searchOrder: 'DEFAULT',
          sortType: 'DEFAULT',
        }),
      });

      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      // CORS 실패 등
      return null;
    }
  }

  // Wing 지표를 상품에 매칭
  function matchMetrics(products, wingData) {
    if (!wingData?.content) return;

    const wingMap = new Map();
    wingData.content.forEach(item => {
      if (item.productId) wingMap.set(String(item.productId), item);
    });

    products.forEach(p => {
      const wItem = wingMap.get(p['상품ID']);
      if (wItem) {
        p['조회수'] = wItem.pvLast28Day?.toLocaleString() || '';
        p['판매량'] = wItem.salesLast28d?.toLocaleString() || '';
        p['브랜드'] = wItem.brandName || '';
        if (wItem.pvLast28Day && wItem.salesLast28d) {
          const rate = ((wItem.salesLast28d / wItem.pvLast28Day) * 100).toFixed(1);
          p['전환율'] = rate + '%';
        }
        if (wItem.salesLast28d && wItem.salePrice) {
          p['매출'] = (wItem.salesLast28d * wItem.salePrice).toLocaleString() + '원';
        }
      }
    });
  }

  // 엑셀 다운로드
  function downloadCSV(data, filename) {
    const headers = ['카테고리', '페이지', '순위', '상품명', '가격', '할인율', '별점', '리뷰수',
                     '상품ID', '로켓배송', '브랜드', '조회수', '판매량', '전환율', '매출', '링크'];
    const csvRows = [headers.join(',')];
    data.forEach(p => {
      const row = headers.map(h => `"${(p[h] || '').toString().replace(/"/g, '""')}"`);
      csvRows.push(row.join(','));
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // 미리보기 테이블 업데이트
  function updatePreview() {
    const previewEl = $('cp-preview');
    if (allProducts.length === 0) return;

    const recent = allProducts.slice(-10);
    previewEl.innerHTML = `
      <div style="margin-top:10px;font-size:11px;color:#888;">최근 수집 (${allProducts.length}개 중 마지막 10개)</div>
      <table>
        <tr><th>#</th><th>상품명</th><th>가격</th><th>조회수</th><th>판매량</th><th>전환율</th></tr>
        ${recent.map(p => `
          <tr>
            <td>${p['순위']}</td>
            <td title="${p['상품명']}">${(p['상품명'] || '').slice(0, 28)}${p['상품명']?.length > 28 ? '…' : ''}</td>
            <td>${p['가격'] || '-'}</td>
            <td>${p['조회수'] || '-'}</td>
            <td>${p['판매량'] || '-'}</td>
            <td>${p['전환율'] || '-'}</td>
          </tr>
        `).join('')}
      </table>`;
  }

  // ===== 메인 수집 로직 =====
  async function startCollection() {
    const startBtn = $('cp-start-btn');
    startBtn.disabled = true;
    startBtn.textContent = '수집중...';
    $('cp-stats').style.display = 'grid';
    allProducts.length = 0;

    const totalSteps = CATEGORIES.length * PAGES_PER_CATEGORY;
    let currentStep = 0;

    for (let ci = 0; ci < CATEGORIES.length; ci++) {
      const cat = CATEGORIES[ci];
      $(`cp-cat-status-${ci}`).textContent = '수집중...';
      $(`cp-cat-status-${ci}`).className = 'status active';
      log(`\n▶ ${cat.name} 수집 시작`);

      for (let page = 1; page <= PAGES_PER_CATEGORY; page++) {
        currentStep++;
        setProgress((currentStep / totalSteps) * 100);
        setStatus(`${cat.name} - ${page}/${PAGES_PER_CATEGORY} 페이지`);
        log(`  페이지 ${page} 가져오는 중...`);

        try {
          const html = await fetchCategoryPage(cat.id, page);
          const products = parseProductsFromHTML(html);

          products.forEach(p => {
            p['카테고리'] = cat.name;
            p['페이지'] = page;
          });

          // Wing 지표 시도 (첫 상품명으로 검색)
          if (products.length > 0) {
            log(`  상품 ${products.length}개 발견, Wing 지표 조회중...`);
            try {
              const wingData = await getWingMetrics(products[0]['상품명'].slice(0, 20));
              if (wingData) {
                matchMetrics(products, wingData);
                const withMetrics = products.filter(p => p['조회수']);
                log(`  Wing 지표 매칭: ${withMetrics.length}개`);
              } else {
                log(`  Wing API 응답 없음 (CORS 제한 가능)`);
              }
            } catch (e) {
              log(`  Wing API 오류: ${e.message}`);
            }
          }

          allProducts.push(...products);
          log(`  페이지 ${page}: ${products.length}개 수집 (누적 ${allProducts.length}개)`);

          // 통계 업데이트
          $('cp-total').textContent = allProducts.length;
          $('cp-metrics').textContent = allProducts.filter(p => p['조회수']).length;
          $('cp-pages').textContent = currentStep;

          updatePreview();

          // 쿠팡 서버 부하 방지 딜레이
          if (page < PAGES_PER_CATEGORY || ci < CATEGORIES.length - 1) {
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
          }

        } catch (e) {
          log(`  ✗ 페이지 ${page} 실패: ${e.message}`);
          if (e.message.includes('403')) {
            log(`  [!] Access Denied - 잠시 대기 후 재시도...`);
            await new Promise(r => setTimeout(r, 5000));
            page--; // 재시도
            currentStep--;
          }
        }
      }

      $(`cp-cat-status-${ci}`).textContent = '완료 ✓';
      $(`cp-cat-status-${ci}`).className = 'status done';
      log(`✓ ${cat.name} 수집 완료`);
    }

    // 완료
    setProgress(100);
    setStatus(`수집 완료! 총 ${allProducts.length}개 상품`);
    startBtn.textContent = '수집 완료';

    // 다운로드 버튼 활성화
    const dlBtn = $('cp-download-btn');
    dlBtn.style.display = 'block';
    dlBtn.onclick = () => {
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(allProducts, `coupang_sourcing_${date}.csv`);
      downloadJSON(allProducts, `coupang_sourcing_${date}.json`);
      log('📥 CSV + JSON 다운로드 완료!');
    };

    log(`\n=== 전체 수집 완료 ===`);
    log(`총 상품: ${allProducts.length}개`);
    log(`지표 포함: ${allProducts.filter(p => p['조회수']).length}개`);
  }

  // 시작 버튼 연결
  $('cp-start-btn').onclick = startCollection;

  log('소싱 도구 준비 완료!');
  log('카테고리:');
  CATEGORIES.forEach(c => log(`  - ${c.name}`));
  log('"수집 시작" 버튼을 클릭하세요.');
})();
