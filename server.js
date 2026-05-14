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

// 요청 로깅
app.use((req, res, next) => {
  console.log(`  [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// CORS (익스텐션에서 전송 허용)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== 수집 데이터 저장소 (세션 기반, 파일 저장) =====
const DATA_FILE = path.join(__dirname, 'data', 'sessions.json');

function loadSessions() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('  데이터 로드 실패:', e.message); }
  return [];
}

function saveSessions() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) { console.error('  데이터 저장 실패:', e.message); }
}

let sessions = loadSessions();
let currentSessionId = null;

// 익스텐션에서 데이터 수신
app.post('/api/collect', (req, res) => {
  const { categoryName, page, products, url } = req.body;
  if (!products || !products.length) {
    return res.status(400).json({ error: '상품 데이터가 없습니다' });
  }

  products.forEach(p => {
    p['카테고리'] = categoryName || '';
  });

  // 현재 세션이 없거나 카테고리가 바뀌면 새 세션 생성
  let session = sessions.find(s => s.id === currentSessionId);
  if (!session) {
    session = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      categoryName: categoryName || '미분류',
      products: []
    };
    sessions.push(session);
    currentSessionId = session.id;
  }

  session.products.push(...products);
  // 세션 카테고리명 업데이트 (여러 카테고리 수집 시)
  const catNames = [...new Set(session.products.map(p => p['카테고리']))].filter(Boolean);
  if (catNames.length > 1) session.categoryName = catNames.join(', ');

  const totalAll = sessions.reduce((s, ss) => s + ss.products.length, 0);
  console.log(`  수신: ${categoryName} p${page} - ${products.length}개 (세션 ${session.products.length}개 / 전체 ${totalAll}개)`);

  saveSessions();
  res.json({ ok: true, received: products.length, total: totalAll, sessionId: session.id });
});

// 수집 데이터 조회
app.get('/api/data', (req, res) => {
  const { sessionId } = req.query;
  if (sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    return res.json({ products: session.products, total: session.products.length, sessions });
  }
  const allProducts = sessions.flatMap(s => s.products);
  res.json({ products: allProducts, total: allProducts.length, sessions });
});

// 세션 삭제
app.delete('/api/session/:id', (req, res) => {
  const idx = sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
  const removed = sessions.splice(idx, 1)[0];
  if (currentSessionId === req.params.id) currentSessionId = null;
  console.log(`  세션 삭제: ${removed.categoryName} (${removed.products.length}개)`);
  saveSessions();
  res.json({ ok: true });
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

// 데이터 초기화 (전체)
app.post('/api/clear', (req, res) => {
  sessions = [];
  currentSessionId = null;
  console.log('  전체 데이터 초기화');
  saveSessions();
  res.json({ ok: true });
});

// 새 세션 시작 (자동수집 시작 시 호출)
app.post('/api/new-session', (req, res) => {
  currentSessionId = null;
  console.log('  새 세션 대기');
  res.json({ ok: true });
});

// 진행상황
let progress = null;
app.post('/api/progress', (req, res) => {
  progress = req.body;
  res.json({ ok: true });
});
app.get('/api/progress', (req, res) => {
  res.json(progress || { active: false });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  쿠팡 소싱 도구 서버 실행중!`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`\n  1. Chrome에서 extension 폴더를 로드하세요`);
  console.log(`  2. 쿠팡 카테고리 페이지에서 "소싱 데이터 수집" 버튼 클릭`);
  console.log(`  3. http://localhost:${PORT} 에서 결과 확인 & 다운로드\n`);
});
