const express = require('express');
const path = require('path');
const app = express();
const PORT = 8080;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 쿠팡 카테고리 페이지 프록시
app.post('/api/fetch-page', async (req, res) => {
  const { categoryId, page, cookies } = req.body;
  const url = `https://www.coupang.com/np/categories/${categoryId}?page=${page}&listSize=60&channel=user&sorter=bestAsc`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Referer': 'https://www.coupang.com/',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    });

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `HTTP ${resp.status}`, body: await resp.text() });
    }
    const html = await resp.text();
    res.json({ html });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Wing API 프록시
app.post('/api/wing-metrics', async (req, res) => {
  const { keyword, wingCookies, xsrfToken } = req.body;

  try {
    const resp = await fetch('https://wing.coupang.com/tenants/seller-web/pre-matching/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-xsrf-token': xsrfToken || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Referer': 'https://wing.coupang.com/',
        'Origin': 'https://wing.coupang.com',
        ...(wingCookies ? { 'Cookie': wingCookies } : {}),
      },
      body: JSON.stringify({
        keyword: String(keyword),
        excludedProductIds: [],
        searchPage: 0,
        searchOrder: 'DEFAULT',
        sortType: 'DEFAULT',
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Wing API ${resp.status}`, body: text });
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// HTML에서 상품 파싱 (서버사이드) - cheerio 없이 정규식으로
app.post('/api/parse-products', (req, res) => {
  const { html, categoryName, page } = req.body;
  if (!html) return res.json({ products: [] });

  const products = [];

  // 상품 링크 + 주변 데이터 추출 (정규식 기반)
  // 쿠팡 카테고리 페이지의 상품은 <li> 안에 <a href="/vp/products/..."> 패턴
  const productPattern = /<li[^>]*class="[^"]*baby-product[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const fallbackPattern = /<li[^>]*>([\s\S]*?<a[^>]*href="[^"]*\/(?:vp\/)?products\/\d+[^"]*"[\s\S]*?)<\/li>/gi;

  let matches = [...html.matchAll(productPattern)];
  if (matches.length === 0) {
    matches = [...html.matchAll(fallbackPattern)];
  }

  const seen = new Set();

  matches.forEach((m, idx) => {
    const block = m[1] || m[0];

    // 상품ID + 링크
    const linkMatch = block.match(/href="([^"]*\/(?:vp\/)?products\/(\d+)[^"]*)"/);
    if (!linkMatch) return;
    const pid = linkMatch[2];
    if (seen.has(pid)) return;
    seen.add(pid);
    const link = 'https://www.coupang.com' + linkMatch[1];

    // 상품명: <div class="name"> 또는 title 속성
    let name = '';
    const nameMatch = block.match(/<(?:div|dt|span)[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)/i);
    if (nameMatch) name = nameMatch[1].trim();
    if (!name) {
      const titleMatch = block.match(/title="([^"]{2,200})"/);
      if (titleMatch) name = titleMatch[1].trim();
    }
    // 사이드바 쓰레기 필터링
    if (!name || name.length < 2 || name.length > 200) return;
    if (name.includes('필터만') || name.includes('카테고리')) return;

    // 가격
    let price = '';
    const priceMatch = block.match(/class="[^"]*price-value[^"]*"[^>]*>([^<]+)/i);
    if (priceMatch) price = priceMatch[1].trim();

    // 할인율
    let discount = '';
    const discMatch = block.match(/class="[^"]*discount-percentage[^"]*"[^>]*>([^<]+)/i);
    if (discMatch) discount = discMatch[1].trim();

    // 별점
    let rating = '';
    const ratingMatch = block.match(/class="[^"]*rating[^"]*"[^>]*>([^<]+)/i);
    if (ratingMatch) rating = ratingMatch[1].trim();

    // 리뷰수
    let reviews = '';
    const reviewMatch = block.match(/class="[^"]*rating-total-count[^"]*"[^>]*>\(?([^)<]+)/i);
    if (reviewMatch) reviews = reviewMatch[1].trim();

    // 로켓배송
    const rocket = /로켓|rocket/i.test(block) ? 'Y' : 'N';

    products.push({
      '카테고리': categoryName || '',
      '페이지': page || 1,
      '순위': products.length + 1,
      '상품명': name,
      '가격': price,
      '할인율': discount,
      '별점': rating,
      '리뷰수': reviews,
      '상품ID': pid,
      '로켓배송': rocket,
      '링크': link,
    });
  });

  res.json({ products, matchCount: matches.length });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  쿠팡 소싱 도구 서버 실행중!`);
  console.log(`  http://localhost:${PORT}\n`);
});
