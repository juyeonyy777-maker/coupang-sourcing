// ===== Wing API 호출 (Service Worker) =====

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'wing-metrics') {
    fetchWingMetrics(msg.keyword).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
});

async function fetchWingMetrics(keyword) {
  if (!keyword) throw new Error('키워드 없음');

  // XSRF 토큰 + 세션 확인
  const xsrfCookie = await chrome.cookies.get({ url: 'https://wing.coupang.com', name: 'XSRF-TOKEN' });
  const sessionCookie = await chrome.cookies.get({ url: 'https://wing.coupang.com', name: 'sxSessionId' });

  if (!xsrfCookie?.value || !sessionCookie?.value) {
    throw new Error('새 탭에서 쿠팡윙 로그인을 해주세요');
  }

  let token = xsrfCookie.value;

  // 최대 10회 재시도 (비-JSON 응답 대응)
  for (let attempt = 0; attempt <= 10; attempt++) {
    // 재시도 시 토큰 갱신
    if (attempt > 0) {
      const fresh = await chrome.cookies.get({ url: 'https://wing.coupang.com', name: 'XSRF-TOKEN' });
      if (fresh?.value) token = fresh.value;
    }

    const decodedToken = decodeURIComponent(token);

    let resp;
    try {
      resp = await fetch('https://wing.coupang.com/tenants/seller-web/pre-matching/search', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-xsrf-token': decodedToken,
        },
        body: JSON.stringify({
          keyword: String(keyword),
          excludedProductIds: [],
          searchPage: 0,
          searchOrder: 'DEFAULT',
          sortType: 'DEFAULT',
        }),
      });
    } catch {
      throw new Error('새 탭에서 쿠팡윙 로그인을 해주세요');
    }

    if (!resp.ok) {
      if (resp.status === 429) throw new Error('요청 제한됨, 잠시 후 재시도');
      throw new Error('Wing API ' + resp.status);
    }

    // 비-JSON 응답이면 재시도
    const contentType = resp.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      if (attempt < 10) continue;
      throw new Error('요청이 많아 잠시 후 다시 시도해주세요');
    }

    try {
      return await resp.json();
    } catch {
      if (attempt < 10) continue;
      throw new Error('응답 파싱 실패');
    }
  }

  throw new Error('최대 재시도 초과');
}
