const puppeteer = require('puppeteer-core');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_EXE = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\User Data';
const DEBUG_PORT = 9222;

const BASE_URL = 'https://www.coupang.com/np/search?component=&q=%EC%95%84%EC%9A%B0%ED%84%B0+%EC%95%95%EC%B6%95+%ED%8C%8C%EC%9A%B0%EC%B9%98&channel=user';
const PAGES_TO_SCRAPE = 4;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function launchChrome() {
  console.log('Chrome 실행중 (디버깅 모드)...');

  // Kill any existing Chrome instances first
  try { execSync('taskkill.exe /F /IM chrome.exe 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--profile-directory=Default',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
  ], {
    stdio: 'ignore',
    detached: true,
  });
  chromeProcess.unref();

  // Wait for Chrome to start and debugger to be ready
  console.log('Chrome 디버거 연결 대기중...');
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (resp.ok) {
        console.log('Chrome 디버거 연결 성공!');
        return;
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error('Chrome 디버거 연결 실패 (30초 타임아웃)');
}

async function waitForMetrics(page, timeout = 30000) {
  console.log('  익스텐션 지표 로딩 대기중...');
  try {
    await page.waitForSelector('.ct-metrics, .ct-prodinfo', { timeout });
    await sleep(3000);
    return true;
  } catch {
    console.log('  [!] 익스텐션 지표가 자동 로딩되지 않음');
    return false;
  }
}

async function scrapeProductsFromPage(page) {
  return await page.evaluate(() => {
    const products = [];
    const productItems = document.querySelectorAll('li.search-product, li[class*="search-product"]');

    productItems.forEach((item, index) => {
      const product = {};

      // Basic product info
      const nameEl = item.querySelector('.name, .descriptions .name');
      product['상품명'] = nameEl?.textContent?.trim() || '';

      const priceEl = item.querySelector('.price-value, strong.price-value');
      product['가격'] = priceEl?.textContent?.trim() || '';

      const discountEl = item.querySelector('.discount-percentage, .instant-discount-rate');
      product['할인율'] = discountEl?.textContent?.trim() || '';

      const ratingEl = item.querySelector('.rating, .star-rating .rating');
      product['별점'] = ratingEl?.textContent?.trim() || '';

      const reviewEl = item.querySelector('.rating-total-count, .count');
      product['리뷰수'] = reviewEl?.textContent?.trim()?.replace(/[()]/g, '') || '';

      const linkEl = item.querySelector('a.search-product-link, a[href*="/products/"]');
      const href = linkEl?.getAttribute('href') || '';
      const productIdMatch = href.match(/products\/(\d+)/);
      product['상품ID'] = productIdMatch ? productIdMatch[1] : '';
      product['링크'] = href ? `https://www.coupang.com${href}` : '';

      const rocketEl = item.querySelector('.badge.rocket, img[alt*="로켓"]');
      product['로켓배송'] = rocketEl ? 'Y' : 'N';

      // Extension metrics from .ct-metrics or .ct-prodinfo
      const metricsEl = item.querySelector('.ct-metrics, .ct-prodinfo');
      if (metricsEl) {
        const chips = metricsEl.querySelectorAll('.chip');
        chips.forEach(chip => {
          if (chip.classList.contains('pv')) {
            product['조회수'] = chip.textContent?.trim() || '';
          } else if (chip.classList.contains('sales')) {
            const text = chip.textContent?.trim() || '';
            if (text.includes('원') || text.length > 6) {
              product['매출'] = text;
            } else {
              product['판매량'] = text;
            }
          } else if (chip.classList.contains('rate')) {
            product['전환율'] = chip.textContent?.trim() || '';
          }
        });

        const metricRows = metricsEl.querySelectorAll('.metric');
        metricRows.forEach(row => {
          const label = row.querySelector('.label')?.textContent?.trim() || '';
          const value = row.querySelector('.value')?.textContent?.trim() || '';
          if (label.includes('조회수')) product['조회수'] = value;
          if (label.includes('판매량')) product['판매량'] = value;
          if (label.includes('전환율')) product['전환율'] = value;
          if (label.includes('매출')) product['매출'] = value;
        });

        // Fallback: parse full text
        const fullText = metricsEl.textContent || '';
        if (!product['조회수']) {
          const m = fullText.match(/조회수\s*([\d,]+)/);
          if (m) product['조회수'] = m[1];
        }
        if (!product['판매량']) {
          const m = fullText.match(/판매량\s*([\d,]+)/);
          if (m) product['판매량'] = m[1];
        }
        if (!product['전환율']) {
          const m = fullText.match(/전환율\s*([\d.]+%?)/);
          if (m) product['전환율'] = m[1];
        }
        if (!product['매출']) {
          const m = fullText.match(/매출\s*([\d,]+)/);
          if (m) product['매출'] = m[1];
        }

        const idMatch = fullText.match(/노출상품ID\s*(\d+)/);
        if (idMatch) product['노출상품ID'] = idMatch[1];
        const optionMatch = fullText.match(/옵션ID\s*(\d+)/);
        if (optionMatch) product['옵션ID'] = optionMatch[1];
        const brandMatch = fullText.match(/브랜드\s*([^\s조판전매]+)/);
        if (brandMatch) product['브랜드'] = brandMatch[1];

        if (!product['조회수'] && !product['판매량']) {
          product['익스텐션_원본'] = fullText.trim().replace(/\s+/g, ' ').slice(0, 200);
        }
      }

      if (product['상품명']) {
        product['순위'] = index + 1;
        products.push(product);
      }
    });

    return products;
  });
}

async function main() {
  console.log('=== 쿠팡 소싱 데이터 수집기 ===\n');
  console.log('검색어: 아우터 압축 파우치');
  console.log(`수집 페이지: 1~${PAGES_TO_SCRAPE}\n`);

  // Connect to already-running Chrome with debugging port
  console.log('Chrome 디버거 연결중...');
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });
    console.log('Chrome 연결 성공!');

    const page = await browser.newPage();

    // Remove webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // First visit coupang homepage to establish session
    console.log('쿠팡 홈페이지 접속으로 세션 생성중...');
    await page.goto('https://www.coupang.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    const allProducts = [];

    for (let pageNum = 1; pageNum <= PAGES_TO_SCRAPE; pageNum++) {
      console.log(`\n--- 페이지 ${pageNum}/${PAGES_TO_SCRAPE} 수집중 ---`);

      const url = `${BASE_URL}&page=${pageNum}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log('  페이지 로드 완료');

      // Wait for product list
      try {
        await page.waitForSelector('li.search-product, li[class*="search-product"], .search-product-list', { timeout: 15000 });
        console.log('  상품 목록 로드 완료');
      } catch {
        console.log('  [!] 상품 목록 감지 실패 - 셀렉터 확인 필요');
        // Debug: dump page structure
        const bodyHTML = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
        console.log('  페이지 구조:', bodyHTML.slice(0, 200));
        continue;
      }

      // Scroll to trigger lazy loading
      await page.evaluate(async () => {
        for (let i = 0; i < 5; i++) {
          window.scrollBy(0, 800);
          await new Promise(r => setTimeout(r, 500));
        }
        window.scrollTo(0, 0);
      });
      await sleep(2000);

      // Wait for extension metrics
      const metricsLoaded = await waitForMetrics(page, 15000);

      if (!metricsLoaded) {
        console.log('  익스텐션 수동 활성화 대기 (25초)...');
        console.log('  >> 브라우저에서 우클릭 > "쿠팡 상품 지표보기" 클릭해주세요 <<');
        try {
          await page.waitForSelector('.ct-metrics, .ct-prodinfo', { timeout: 25000 });
          await sleep(5000);
          console.log('  익스텐션 지표 감지됨!');
        } catch {
          console.log('  [!] 익스텐션 지표 없이 기본 데이터만 수집합니다');
        }
      }

      const products = await scrapeProductsFromPage(page);
      console.log(`  수집된 상품: ${products.length}개`);

      products.forEach(p => {
        p['페이지'] = pageNum;
        allProducts.push(p);
      });

      if (pageNum < PAGES_TO_SCRAPE) {
        console.log('  다음 페이지 이동 대기 (3초)...');
        await sleep(3000);
      }
    }

    // Save results
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const csvPath = path.join(__dirname, `coupang_sourcing_${timestamp}.csv`);
    const jsonPath = path.join(__dirname, `coupang_sourcing_${timestamp}.json`);

    fs.writeFileSync(jsonPath, JSON.stringify(allProducts, null, 2), 'utf-8');

    if (allProducts.length > 0) {
      const headers = ['페이지', '순위', '상품명', '가격', '할인율', '별점', '리뷰수', '상품ID',
                       '로켓배송', '노출상품ID', '옵션ID', '브랜드', '조회수', '판매량', '전환율', '매출', '링크'];
      const csvRows = [headers.join(',')];

      allProducts.forEach(p => {
        const row = headers.map(h => {
          const val = (p[h] || '').toString().replace(/"/g, '""');
          return `"${val}"`;
        });
        csvRows.push(row.join(','));
      });

      const bom = '\uFEFF';
      fs.writeFileSync(csvPath, bom + csvRows.join('\n'), 'utf-8');
    }

    console.log(`\n=== 수집 완료 ===`);
    console.log(`총 ${allProducts.length}개 상품`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`CSV:  ${csvPath}`);

    const withMetrics = allProducts.filter(p => p['조회수'] || p['판매량']);
    console.log(`익스텐션 지표 포함: ${withMetrics.length}개`);

  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    if (browser) {
      browser.disconnect();
    }
    console.log('\n완료! Chrome은 수동으로 닫아주세요.');
  }
}

main();
