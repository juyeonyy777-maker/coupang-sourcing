// ===== Wing API 호출 (Service Worker) =====

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'wing-metrics') {
    fetchWingMetrics(msg.keyword).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true; // async response
  }
  if (msg.type === 'wing-check') {
    checkWingLogin().then(sendResponse).catch(e => sendResponse({ loggedIn: false }));
    return true;
  }
});

async function checkWingLogin() {
  try {
    const resp = await fetch('https://wing.coupang.com/', { method: 'HEAD', credentials: 'include' });
    // wing이 로그인 안 되면 로그인 페이지로 리다이렉트 (302)
    return { loggedIn: resp.ok || resp.status === 200 };
  } catch {
    return { loggedIn: false };
  }
}

async function fetchWingMetrics(keyword) {
  // XSRF 토큰 가져오기
  const xsrfCookie = await chrome.cookies.get({ url: 'https://wing.coupang.com', name: 'XSRF-TOKEN' });
  const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';

  const resp = await fetch('https://wing.coupang.com/tenants/seller-web/pre-matching/search', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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

  if (!resp.ok) {
    throw new Error('Wing API ' + resp.status);
  }

  return await resp.json();
}
