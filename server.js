const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 8080;

// 익스텐션 파일 변경 감지 → 자동 리로드용 버전 (폴링 방식, WSL2 호환)
let extVersion = Date.now();
let lastMtimes = {};
setInterval(() => {
  const extDir = path.join(__dirname, 'extension');
  try {
    const files = fs.readdirSync(extDir);
    files.forEach(f => {
      const mtime = fs.statSync(path.join(extDir, f)).mtimeMs;
      if (lastMtimes[f] && lastMtimes[f] !== mtime) {
        extVersion = Date.now();
        console.log('  익스텐션 파일 변경 감지: ' + f + ' → v' + extVersion);
      }
      lastMtimes[f] = mtime;
    });
  } catch (e) {}
}, 1000);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS (익스텐션에서 전송 허용)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== 수집 데이터 저장소 =====
let allProducts = [];

// 익스텐션에서 데이터 수신
app.post('/api/collect', (req, res) => {
  const { categoryName, page, products, url } = req.body;
  if (!products || !products.length) {
    return res.status(400).json({ error: '상품 데이터가 없습니다' });
  }

  // 카테고리/페이지 정보 추가
  products.forEach(p => {
    p['카테고리'] = categoryName || '';
  });

  allProducts.push(...products);
  console.log(`  수신: ${categoryName} p${page} - ${products.length}개 (누적 ${allProducts.length}개)`);

  res.json({ ok: true, received: products.length, total: allProducts.length });
});

// 수집 데이터 조회
app.get('/api/data', (req, res) => {
  res.json({ products: allProducts, total: allProducts.length });
});

// 익스텐션 버전 (자동 리로드용)
app.get('/api/ext-version', (req, res) => {
  res.json({ version: extVersion });
});

// 디버그: 상품 카드 HTML 수신
app.post('/api/debug-html', (req, res) => {
  const { html } = req.body;
  if (html) {
    const fs = require('fs');
    fs.writeFileSync('debug-card.html', html);
    console.log('  디버그 HTML 저장됨 (debug-card.html)');
  }
  res.json({ ok: true });
});

// 데이터 초기화
app.post('/api/clear', (req, res) => {
  allProducts = [];
  console.log('  데이터 초기화');
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  쿠팡 소싱 도구 서버 실행중!`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`\n  1. Chrome에서 extension 폴더를 로드하세요`);
  console.log(`  2. 쿠팡 카테고리 페이지에서 "소싱 데이터 수집" 버튼 클릭`);
  console.log(`  3. http://localhost:${PORT} 에서 결과 확인 & 다운로드\n`);
});
