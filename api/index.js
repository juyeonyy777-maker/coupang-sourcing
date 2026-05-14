const express = require('express');
const path = require('path');
const app = express();

// 메모리 기반 저장소 (서버리스 환경)
let sessions = [];
let currentSessionId = null;
let progress = null;
let extVersion = Date.now();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 익스텐션에서 데이터 수신
app.post('/api/collect', (req, res) => {
  const { categoryName, page, products, url } = req.body;
  if (!products || !products.length) {
    return res.status(400).json({ error: '상품 데이터가 없습니다' });
  }

  products.forEach(p => {
    p['카테고리'] = categoryName || '';
  });

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
  const catNames = [...new Set(session.products.map(p => p['카테고리']))].filter(Boolean);
  if (catNames.length > 1) session.categoryName = catNames.join(', ');

  const totalAll = sessions.reduce((s, ss) => s + ss.products.length, 0);
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
  sessions.splice(idx, 1);
  if (currentSessionId === req.params.id) currentSessionId = null;
  res.json({ ok: true });
});

// 익스텐션 버전
app.get('/api/ext-version', (req, res) => {
  res.json({ version: extVersion });
});

// 디버그 HTML
app.post('/api/debug-html', (req, res) => {
  res.json({ ok: true });
});

// 데이터 초기화
app.post('/api/clear', (req, res) => {
  sessions = [];
  currentSessionId = null;
  res.json({ ok: true });
});

// 새 세션
app.post('/api/new-session', (req, res) => {
  currentSessionId = null;
  res.json({ ok: true });
});

// 진행상황
app.post('/api/progress', (req, res) => {
  progress = req.body;
  res.json({ ok: true });
});
app.get('/api/progress', (req, res) => {
  res.json(progress || { active: false });
});

module.exports = app;
