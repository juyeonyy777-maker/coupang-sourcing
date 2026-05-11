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

  console.log('[소싱] 익스텐션 로드됨: ' + location.href);

  // ===== 자동 수집 모드 =====
  var st = JSON.parse(sessionStorage.getItem(K) || 'null');

  if (st && st.running) {
    var cat = CATS[st.ci];
    if (!cat) {
      console.log('[소싱] 자동수집 완료/오류 - 상태 초기화');
      sessionStorage.removeItem(K);
    } else if (!location.pathname.includes('/categories/' + cat.id)) {
      console.log('[소싱] 자동수집: ' + cat.n + ' 페이지로 이동');
      location.href = '/np/categories/' + cat.id + '?page=' + st.pg + '&listSize=60&sorter=bestAsc&channel=user';
      return;
    } else {
      console.log('[소싱] 자동수집 진행: ' + cat.n + ' p' + st.pg);
      addStopButton();
      setTimeout(function () { doCollect(cat.n, st.pg, true); }, WAIT);
      return;
    }
  }

  // ===== 수동 모드 =====
  if (!location.pathname.includes('/categories/')) return;
  if (document.getElementById('sourcing-btns')) return;

  var wrap = document.createElement('div');
  wrap.id = 'sourcing-btns';
  wrap.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';

  var btnAuto = makeButton('전체 자동 수집 v7', '#00b894', '18px');
  btnAuto.onclick = function () {
    fetch(SERVER + '/api/clear', { method: 'POST' }).catch(function () {});
    sessionStorage.setItem(K, JSON.stringify({ ci: 0, pg: 1, total: 0, running: true }));
    location.href = '/np/categories/' + CATS[0].id + '?page=1&listSize=60&sorter=bestAsc&channel=user';
  };

  var btnPage = makeButton('이 페이지만 수집', '#555', '14px');
  btnPage.onclick = function () {
    btnPage.textContent = '수집중...';
    var catId = (location.pathname.match(/categories\/(\d+)/) || [])[1] || '';
    var found = null;
    for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === catId) found = CATS[i]; }
    var name = '';
    if (found) {
      name = found.n;
    } else {
      // h1, h2 등 페이지 제목 요소에서 카테고리명 추출
      var headingEl = document.querySelector('h1, .title, #category-title, [class*="category"] > h1, [class*="category"] > h2');
      if (headingEl) {
        var ht = headingEl.textContent.trim();
        if (ht.length > 1 && ht.length < 50) name = ht;
      }
      if (!name) {
        // 페이지 제목에서 " - 쿠팡" 앞부분만 사용
        name = document.title.replace(/\s*[-|]\s*쿠팡.*$/, '').trim();
        // 서브카테고리 목록 제거 (첫 카테고리만)
        if (name.length > 30) name = name.split(/[,]/)[0].trim();
      }
    }
    if (!name) name = '미분류';
    var pg = parseInt(new URLSearchParams(location.search).get('page')) || 1;
    doCollect(name, pg, false).then(function (count) {
      btnPage.textContent = '완료! ' + count + '개';
      setTimeout(function () { btnPage.textContent = '이 페이지만 수집'; }, 3000);
    });
  };

  wrap.appendChild(btnAuto);
  wrap.appendChild(btnPage);
  document.body.appendChild(wrap);

  // ===== 수집 실행 =====
  async function doCollect(categoryName, pageNum, isAuto) {
    showFloat(categoryName + ' 수집중...', '#fdcb6e');

    // 1. 스크랩
    var products = scrape();
    products.forEach(function (p) {
      p['카테고리'] = categoryName;
      p['순위'] = pageNum + '-' + p['순위'];
    });
    console.log('[소싱] 수집: ' + products.length + '개');

    // 2. 상품 페이지에서 판매가 + 카테고리 수집
    if (products.length > 0) {
      showFloat(products.length + '개 발견, 상품 상세 수집중...', '#fdcb6e');
      await fetchProductDetails(products);
    }

    // 3. Wing 지표
    if (products.length > 0) {
      showFloat(products.length + '개 발견, 지표 수집중...', '#00cec9');
      await fetchMetrics(products);
    }

    // 3. 서버 전송
    var total = 0;
    if (products.length > 0) {
      try {
        var resp = await fetch(SERVER + '/api/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryName: categoryName, page: pageNum, products: products, url: location.href }),
        });
        var result = await resp.json();
        total = result.total;
      } catch (e) { console.error('[소싱] 서버 전송 실패:', e); }
    }

    var withMetrics = products.filter(function (p) { return p['조회수']; }).length;
    showFloat(categoryName + ' ' + pageNum + 'p: ' + products.length + '개 (지표 ' + withMetrics + '개)', '#00b894');

    // 자동 모드: 다음 페이지
    if (isAuto) {
      st.total = (st.total || 0) + products.length;
      if (st.ci >= CATS.length - 1 && st.pg >= PP) {
        sessionStorage.removeItem(K);
        showFloat('수집 완료! 총 ' + st.total + '개. localhost:8080에서 확인!', '#00b894', true);
        return products.length;
      }
      if (st.pg < PP) { st.pg++; } else { st.ci++; st.pg = 1; }
      sessionStorage.setItem(K, JSON.stringify(st));
      var next = CATS[st.ci];
      showFloat('3초 후 → ' + next.n + ' ' + st.pg + '페이지', '#00cec9');
      setTimeout(function () {
        location.href = '/np/categories/' + next.id + '?page=' + st.pg + '&listSize=60&sorter=bestAsc&channel=user';
      }, 3000);
    }

    return products.length;
  }

  // ===== 스크래핑 =====
  function scrape() {
    var products = [];
    var seen = {};

    // 모든 상품 링크 찾기
    var links = document.querySelectorAll('a[href*="/products/"]');
    console.log('[소싱] 상품 링크: ' + links.length + '개');

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      var m = href.match(/products\/(\d+)/);
      if (!m) continue;
      var pid = m[1];
      if (seen[pid]) continue;
      seen[pid] = true;

      // 부모 컨테이너 (li > a 구조)
      var li = a.closest('li') || a.parentElement?.parentElement || a.parentElement;
      // a 링크 자체와 li 둘 다에서 검색
      var searchIn = [a, li].filter(Boolean);

      // 상품명
      var name = a.getAttribute('title') || '';
      if (!name || name.length < 3) {
        for (var si = 0; si < searchIn.length && (!name || name.length < 3); si++) {
          var nameEl = searchIn[si].querySelector('.name, dt.name, .baby-product-name, [class*="name"]');
          if (nameEl && nameEl.textContent.trim().length > 2 && nameEl.textContent.trim().length < 150) {
            name = nameEl.textContent.trim();
          }
        }
      }
      // 폴백: 링크 안의 텍스트 요소 탐색
      if (!name || name.length < 3) {
        var texts = a.querySelectorAll('div, span, dt, dd');
        for (var j = 0; j < texts.length; j++) {
          var t = texts[j].textContent.trim();
          if (t.length > 5 && t.length < 150 && !/^[\d,]+원/.test(t) && !/^\d+%/.test(t)) { name = t; break; }
        }
      }
      if (!name || name.length < 3) continue;
      // 상품명 정리: 가격/퍼센트 이후 제거
      name = name.replace(/\d+%[\s\S]*$/, '').replace(/[\d,]+원[\s\S]*$/, '').trim();
      // "할인" 포함 단어 모두 제거 (쿠폰할인, 블랙쿠폰할인, 와우할인, 할인특가 등)
      name = name.replace(/\S*할인\S*/g, '').trim();
      // 기타 배지/태그 제거
      name = name.replace(/(로켓와우|판매자\s*추천|다른\s*고객이\s*많이\s*본\s*상품|BEST|Best|best|광고|AD|ad|무료배송|로켓배송|로켓직구|로켓프레시)/g, '').trim();
      // 정리: 앞뒤 쉼표, 다중 공백 제거
      name = name.replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!name || name.length < 3) continue;

      // li의 전체 텍스트에서 정보 추출
      var fullText = li ? li.textContent : a.textContent;

      // 별점: 숫자 (예: 4.5, 4.0, 4)
      var rating = '';
      var ratingEl = (li || a).querySelector('[class*="rating"], [class*="star"], .star-score, .rating');
      if (ratingEl) {
        var rm = ratingEl.textContent.match(/(\d(?:\.\d)?)/);
        if (rm) rating = rm[1];
      }
      if (!rating) {
        var allEls = (li || a).querySelectorAll('*');
        for (var ri = 0; ri < allEls.length; ri++) {
          var rt = allEls[ri].textContent.trim();
          if (allEls[ri].children.length === 0 && /^\d(\.\d)?$/.test(rt) && parseFloat(rt) <= 5) {
            rating = rt;
            break;
          }
        }
      }

      // 리뷰수: (숫자) 패턴
      var reviews = '';
      var reviewMatches = fullText.match(/\((\d[\d,]*)\)/g);
      if (reviewMatches) {
        // 가장 큰 숫자가 리뷰수 (작은 건 옵션 수 등)
        var revNums = reviewMatches.map(function(r) {
          var n = r.replace(/[(),]/g, '');
          return { text: n, num: parseInt(n) };
        });
        revNums.sort(function(a, b) { return b.num - a.num; });
        if (revNums.length > 0) reviews = revNums[0].text;
      }

      // 로켓배송
      var rocket = 'N';
      var liHtml = li ? li.innerHTML : a.innerHTML;
      if (liHtml.indexOf('로켓') > -1) rocket = 'Y';

      // URL에서 itemId 추출
      var itemId = '', vendorItemId = '';
      try {
        var url = new URL(href, location.origin);
        itemId = url.searchParams.get('itemId') || '';
        vendorItemId = url.searchParams.get('vendorItemId') || '';
      } catch (e) {}

      // 디버그: 첫 상품의 실제 텍스트를 서버로 전송
      if (products.length === 0) {
        fetch(SERVER + '/api/debug-html', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: '=== a.textContent ===\n' + aText.substring(0, 500) + '\n=== name ===\n' + name + '\n=== price ===\n' + price + '\n=== priceMatches ===\n' + JSON.stringify(priceMatches) })
        }).catch(function(){});
      }

      products.push({
        '순위': products.length + 1,
        '상품명': name.slice(0, 200),
        '가격': '',
        '별점': rating,
        '리뷰수': reviews,
        '상품ID': pid,
        '_itemId': itemId,
        '_vendorItemId': vendorItemId,
        '링크': href.startsWith('http') ? href : location.origin + href,
        '로켓배송': rocket,
        '옵션ID': '',
        '브랜드': '',
        '조회수': '',
        '판매량': '',
        '전환율': '',
        '매출': '',
      });
    }

    console.log('[소싱] 최종 수집: ' + products.length + '개');
    return products;
  }

  // ===== 실제 카테고리 수집 =====
  async function fetchCategories(products) {
    console.log('[소싱] 카테고리 수집: ' + products.length + '개');
    var success = 0;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      try {
        var resp = await fetch(p['링크']);
        var html = await resp.text();
        // 방법1: JSON-LD BreadcrumbList
        var jsonMatch = html.match(/"@type"\s*:\s*"BreadcrumbList"[\s\S]*?"itemListElement"\s*:\s*\[([\s\S]*?)\]/);
        if (jsonMatch) {
          var names = jsonMatch[1].match(/"name"\s*:\s*"([^"]+)"/g);
          if (names) {
            var cats = names.map(function(n) { return n.replace(/"name"\s*:\s*"/, '').replace(/"$/, ''); })
              .filter(function(n) { return n !== '쿠팡 홈' && n !== '홈'; });
            if (cats.length > 0) { p['카테고리'] = cats.join(' > '); success++; continue; }
          }
        }
        // 방법2: HTML에서 breadcrumb 텍스트 추출
        var bcMatch = html.match(/breadcrumb[^>]*>([\s\S]*?)<\/(?:ul|ol|nav|div)/i);
        if (bcMatch) {
          var linkTexts = bcMatch[1].match(/>([^<]+)</g);
          if (linkTexts) {
            var cats = linkTexts.map(function(t) { return t.replace(/^>/, '').replace(/<$/, '').trim(); })
              .filter(function(t) { return t.length > 1 && t !== '쿠팡 홈' && t !== '홈' && !/^\s*[>›»]\s*$/.test(t); });
            if (cats.length > 0) { p['카테고리'] = cats.join(' > '); success++; continue; }
          }
        }
      } catch (e) {
        console.error('[소싱] 카테고리 실패 (' + p['상품ID'] + '):', e.message);
      }
      if (i < products.length - 1) await sleep(200);
      if ((i + 1) % 10 === 0) {
        console.log('[소싱] 카테고리: ' + (i + 1) + '/' + products.length + ' (성공 ' + success + ')');
        showFloat('카테고리 수집중... ' + (i + 1) + '/' + products.length, '#fdcb6e');
      }
    }
    console.log('[소싱] 카테고리 완료: ' + success + '/' + products.length);
  }

  // ===== 상품 페이지에서 판매가 + 카테고리 수집 =====
  async function fetchProductDetails(products) {
    console.log('[소싱] 상품 상세 수집: ' + products.length + '개');
    var success = 0;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      try {
        var resp = await fetch(p['링크']);
        var html = await resp.text();

        // 디버그: 첫 상품 HTML을 서버로 전송
        if (i === 0) {
          fetch(SERVER + '/api/debug-html', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: html.substring(0, 15000) })
          }).catch(function(){});
        }

        // === 판매가 추출 ===
        // 방법1: JSON-LD Product.offers.price
        var productJson = html.match(/"@type"\s*:\s*"Product"[\s\S]*?"offers"\s*:\s*\{[\s\S]*?"price"\s*:\s*"?(\d+)"?/);
        if (productJson) {
          var pNum = parseInt(productJson[1]);
          if (pNum > 0) p['가격'] = pNum.toLocaleString() + '원';
        }
        // 방법2: HTML에서 큰 빨간 판매가 (salePrice, total-price 등)
        if (!p['가격']) {
          var salePriceMatch = html.match(/class="[^"]*(?:sale-price|total-price|discount-price)[^"]*"[^>]*>[\s]*(?:<[^>]+>)*[\s]*([\d,]+)[\s]*(?:<[^>]+>)*[\s]*원/i);
          if (salePriceMatch) {
            var pNum = parseInt(salePriceMatch[1].replace(/,/g, ''));
            if (pNum > 0) p['가격'] = pNum.toLocaleString() + '원';
          }
        }
        // 방법3: meta tag
        if (!p['가격']) {
          var metaPrice = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="(\d+)"/);
          if (metaPrice) {
            var pNum = parseInt(metaPrice[1]);
            if (pNum > 0) p['가격'] = pNum.toLocaleString() + '원';
          }
        }

        // === 카테고리 추출 ===
        // 방법1: JSON-LD BreadcrumbList
        var bcJson = html.match(/"@type"\s*:\s*"BreadcrumbList"[\s\S]*?"itemListElement"\s*:\s*\[([\s\S]*?)\]/);
        if (bcJson) {
          var names = bcJson[1].match(/"name"\s*:\s*"([^"]+)"/g);
          if (names) {
            var cats = names.map(function(n) { return n.replace(/"name"\s*:\s*"/, '').replace(/"$/, ''); })
              .filter(function(n) { return n !== '쿠팡 홈' && n !== '홈'; });
            if (cats.length > 0) p['카테고리'] = cats.join(' > ');
          }
        }
        // 방법2: HTML breadcrumb
        if (!p['카테고리'] || p['카테고리'] === categoryName) {
          var bcHtml = html.match(/breadcrumb[^>]*>([\s\S]*?)<\/(?:ul|ol|nav|div)/i);
          if (bcHtml) {
            var linkTexts = bcHtml[1].match(/>([^<]+)</g);
            if (linkTexts) {
              var cats = linkTexts.map(function(t) { return t.replace(/^>/, '').trim(); })
                .filter(function(t) { return t.length > 1 && t !== '쿠팡 홈' && t !== '홈' && !/^\s*[>›»]\s*$/.test(t); });
              if (cats.length > 0) p['카테고리'] = cats.join(' > ');
            }
          }
        }

        if (p['가격']) success++;
      } catch (e) {
        console.error('[소싱] 상세 실패 (' + p['상품ID'] + '):', e.message);
      }
      if (i < products.length - 1) await sleep(200);
      if ((i + 1) % 10 === 0) {
        console.log('[소싱] 상세: ' + (i + 1) + '/' + products.length + ' (성공 ' + success + ')');
        showFloat('상품 상세 수집중... ' + (i + 1) + '/' + products.length, '#fdcb6e');
      }
    }
    console.log('[소싱] 상세 완료: ' + success + '/' + products.length);
  }

  // ===== Wing 지표 =====
  async function fetchMetrics(products) {
    console.log('[소싱] Wing API: ' + products.length + '개');

    var success = 0;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var keyword = p['_itemId'] || p['상품ID'];
      if (!keyword) continue;
      try {
        var data = await sendMessage({ type: 'wing-metrics', keyword: keyword });
        var results = data.content || data.result || [];
        var match = null;
        for (var j = 0; j < results.length; j++) {
          if (String(results[j].itemId) === p['_itemId'] || String(results[j].productId) === p['상품ID']) { match = results[j]; break; }
        }
        if (!match && results.length > 0) match = results[0];

        if (match) {
          p['조회수'] = match.pvLast28Day ? match.pvLast28Day.toLocaleString() : '';
          p['판매량'] = match.salesLast28d ? match.salesLast28d.toLocaleString() : '';
          p['전환율'] = (match.pvLast28Day && match.salesLast28d) ? ((match.salesLast28d / match.pvLast28Day) * 100).toFixed(2) + '%' : '';
          p['매출'] = (match.salesLast28d && match.salePrice) ? Math.round(match.salesLast28d * match.salePrice).toLocaleString() + '원' : '';
          p['브랜드'] = match.brandName || '';
          p['옵션ID'] = match.vendorItemId ? String(match.vendorItemId) : '';
          success++;
        }
      } catch (e) {
        console.error('[소싱] Wing 실패 (' + p['_itemId'] + '):', e.message);
        if (e.message.indexOf('로그인') > -1) {
          console.error('[소싱] 쿠팡윙 로그인 필요!');
          showFloat('쿠팡윙 로그인이 필요합니다! wing.coupang.com에 로그인하세요.', '#ff7675', true);
          break;
        }
      }
      if (i < products.length - 1) await sleep(200);
      if ((i + 1) % 10 === 0) {
        console.log('[소싱] Wing: ' + (i + 1) + '/' + products.length + ' (성공 ' + success + ')');
        showFloat('지표 수집중... ' + (i + 1) + '/' + products.length, '#00cec9');
      }
    }
    console.log('[소싱] Wing 완료: ' + success + '/' + products.length);
  }

  function sendMessage(msg) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp && resp.error) return reject(new Error(resp.error));
        resolve(resp);
      });
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ===== UI =====
  function makeButton(text, color, size) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'padding:14px 28px;font-size:' + size + ';font-weight:800;background:' + color + ';color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
    return b;
  }

  function addStopButton() {
    var b = document.createElement('button');
    b.textContent = '수집 중지';
    b.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:12px 24px;font-size:16px;font-weight:800;background:#d63031;color:#fff;border:none;border-radius:10px;cursor:pointer;';
    b.onclick = function () { sessionStorage.removeItem(K); location.reload(); };
    document.body.appendChild(b);
  }

  function showFloat(msg, color, persistent) {
    var el = document.getElementById('sourcing-float');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sourcing-float';
      el.style.cssText = 'position:fixed;bottom:30px;right:30px;z-index:99999;padding:16px 24px;font-size:15px;font-weight:700;background:rgba(0,0,0,0.9);border-radius:12px;max-width:400px;';
      document.body.appendChild(el);
    }
    el.style.color = color;
    el.textContent = msg;
    if (!persistent) setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 10000);
  }
})();
