export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Root / UI: The single entry point
    if (url.pathname === '/' && !url.searchParams.has('__dest')) {
      return new Response(renderHubHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 2. Proxy handler: Proxies authtool / sub2s / hops through YOUR domain
    const dest = url.searchParams.get('__dest');
    if (dest) {
      return handleProxy(request, dest, url.origin);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Proxies target websites, strips framing/CORS security, rewrites redirects & links,
 * and injects the client-side automation logic.
 */
async function handleProxy(request, targetUrlStr, workerOrigin) {
  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (e) {
    return new Response('Invalid target URL', { status: 400 });
  }

  // Clone headers and remove origin restrictions
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('Host', targetUrl.host);
  reqHeaders.set('Referer', targetUrl.origin);
  reqHeaders.delete('cf-connecting-ip');
  reqHeaders.delete('cf-ray');

  let response;
  try {
    response = await fetch(targetUrl.href, {
      method: request.method,
      headers: reqHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual',
    });
  } catch (err) {
    return new Response('Error contacting upstream: ' + err.message, { status: 502 });
  }

  const resHeaders = new Headers(response.headers);

  // Strip headers that prevent displaying/controlling sites inside custom environments
  resHeaders.delete('content-security-policy');
  resHeaders.delete('content-security-policy-report-only');
  resHeaders.delete('x-frame-options');

  // Intercept HTTP Redirects and wrap them back through our worker proxy
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const loc = resHeaders.get('Location');
    if (loc) {
      const resolvedLoc = new URL(loc, targetUrl.href).href;
      resHeaders.set('Location', `${workerOrigin}/?__dest=${encodeURIComponent(resolvedLoc)}`);
      return new Response(null, { status: response.status, headers: resHeaders });
    }
  }

  const contentType = resHeaders.get('content-type') || '';

  // Inject our automation script and rewrite in-page links if it's HTML
  if (contentType.includes('text/html')) {
    let body = await response.text();

    // Rewrite anchor and form targets so clicks stay on this worker domain
    body = body.replace(/href="((?:https?:\/\/|\/)[^"]+)"/gi, (m, link) => {
      try {
        const abs = new URL(link, targetUrl.href).href;
        return `href="${workerOrigin}/?__dest=${encodeURIComponent(abs)}"`;
      } catch (e) {
        return m;
      }
    });

    body = body.replace(/action="((?:https?:\/\/|\/)[^"]+)"/gi, (m, link) => {
      try {
        const abs = new URL(link, targetUrl.href).href;
        return `action="${workerOrigin}/?__dest=${encodeURIComponent(abs)}"`;
      } catch (e) {
        return m;
      }
    });

    // Embed the userscript logic natively into the response
    const injection = `<script>
      window.__WORKER_ORIGIN__ = "${workerOrigin}";
      window.__TARGET_ORIGIN__ = "${targetUrl.origin}";
      window.__TARGET_HREF__ = "${targetUrl.href}";
      ${clientBypassScript}
    </script></body>`;

    body = body.replace(/<\/body>/i, injection);

    resHeaders.delete('content-length');
    return new Response(body, {
      status: response.status,
      headers: resHeaders,
    });
  }

  // Pass through assets (CSS, JS, images)
  return new Response(response.body, {
    status: response.status,
    headers: resHeaders,
  });
}

/**
 * The client automation logic, adapted to run continuously inside the proxy
 */
const clientBypassScript = `
(function () {
  'use strict';
  if (window.__sub2sV33_injected) return;
  window.__sub2sV33_injected = true;

  const S = window.__kchState = window.__kchState || {};
  const origin = window.__WORKER_ORIGIN__;
  const currentTarget = window.__TARGET_HREF__;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null;

  const byText = words => $$('button, a, input[type="button"], input[type="submit"], [role="button"]')
    .find(b => {
      const t = ((b.innerText || b.value || '') + '').toUpperCase().replace(/\\s+/g, ' ').trim();
      return t && words.some(w => t.includes(w)) && visible(b);
    });

  const LINK_RE = /(?:https?:\\/\\/)?(?:api\\.)?sub2s\\.com\\/l\\/([a-z0-9]+)/i;
  const CODE_RE = /[?&]code=([a-f0-9-]{20,})/i;

  function wrapUrl(url) {
    return origin + '/?__dest=' + encodeURIComponent(url);
  }

  function findChainLink() {
    const parts = [];
    $$('a').forEach(a => { parts.push(a.href); parts.push(a.textContent); });
    $$('input, textarea').forEach(i => parts.push(i.value));
    if (document.body) parts.push(document.body.innerText);
    for (const p of parts) {
      const m = p && LINK_RE.exec(p);
      if (m) return 'https://api.sub2s.com/l/' + m[1];
    }
    return null;
  }

  function extractResult() {
    let h = location.href;
    try { h = decodeURIComponent(decodeURIComponent(h)); } catch (e) {}
    const m = h.match(/[?&]result=([^&#\\s]+)/);
    return m ? m[1] : null;
  }

  /* Overlay UI */
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;width:272px;background:linear-gradient(160deg,#241a3f,#17102a);border:1px solid #9d6bff;border-radius:14px;padding:12px;font:13px/1.4 system-ui;color:#f3edff;box-shadow:0 6px 24px rgba(124,77,255,.45)';
  panel.innerHTML = '<div style="font-weight:700;margin-bottom:6px;color:#c9b3ff">🔑 Single Hub Bypass</div>' +
                    '<div id="kch-status" style="color:#b9a8e8;margin-bottom:8px">working…</div>' +
                    '<div id="kch-logs" style="max-height:110px;overflow:auto;font-size:11px;color:#8f7fc9;margin-bottom:8px"></div>';
  document.documentElement.appendChild(panel);

  const status = m => { const el = $('#kch-status'); if (el) el.textContent = m; };
  const log = m => { const el = $('#kch-logs'); if (!el) return;
    const d = document.createElement('div'); d.textContent = '• ' + m; el.prepend(d); };

  function showKeyBanner(key) {
    if (S.bannerShown) return; S.bannerShown = true;
    try { navigator.clipboard.writeText(key); log('copied to clipboard'); } catch (e) {}
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(18,10,38,.96);display:flex;align-items:center;justify-content:center;font-family:system-ui';
    b.innerHTML = '<div style="background:linear-gradient(160deg,#2a1d4d,#160f2b);border:2px solid #9d6bff;border-radius:16px;padding:32px 40px;text-align:center;color:#f3edff;max-width:90vw;box-shadow:0 0 60px rgba(124,77,255,.5)">' +
      '<div style="font-size:22px;font-weight:700;margin-bottom:8px">🎉 Your Key</div>' +
      '<div style="font-size:14px;color:#b9a8e8;margin-bottom:16px">Key extracted directly on your domain:</div>' +
      '<div style="font-family:monospace;font-size:18px;background:#120b24;border-radius:8px;padding:14px 18px;margin-bottom:16px;user-select:all;word-break:break-all">' + key + '</div>' +
      '<button id="kch-copy" style="background:#7c4dff;color:#fff;border:0;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer">📋 COPY KEY</button>' +
      '</div>';
    document.body.appendChild(b);
    b.querySelector('#kch-copy').onclick = () => {
      navigator.clipboard.writeText(key).then(() => { b.querySelector('#kch-copy').textContent = '✅ COPIED'; });
    };
  }

  async function runAuthtool() {
    const key = extractResult();
    if (key) {
      status('✅ KEY READY');
      showKeyBanner(key);
      return;
    }

    if (!S.gotKey) {
      if ($('iframe[src*="challenges.cloudflare"]') && !S.cfNoted) {
        S.cfNoted = true;
        status('⚠️ Click Cloudflare Turnstile if it appears');
      }
      const btn = byText(['GET KEY']);
      if (btn) {
        S.gotKey = true;
        await sleep(500);
        btn.click();
        log('clicked GET KEY');
        status('retrieving key link…');
      }
      return;
    }

    if (!S.openedLink) {
      const url = findChainLink();
      if (url) {
        S.openedLink = true;
        log('opening link: ' + url);
        status('navigating to bypass chain…');
        setTimeout(() => { location.href = wrapUrl(url); }, 600);
      }
    }
  }

  async function runSub2s() {
    if (!S.started) {
      const start = byText(['BẮT ĐẦU VƯỢT LINK', 'BẮT ĐẦU', 'GET LINK']);
      if (start) {
        S.started = true;
        log('starting bypass step…');
        await sleep(600);
        start.click();
        return;
      }
    }
    if (!S.robotClicked) {
      const robot = $$('img').find(im => /lock\\.png/i.test(im.src) && !/unlock/i.test(im.src));
      if (robot) {
        S.robotClicked = true;
        log('robot check passed');
        robot.click();
      }
    }
    if (!S.continued) {
      const go = byText(['TIẾP TỤC', 'CONTINUE']);
      if (go) {
        S.continued = true;
        await sleep(700);
        go.click();
        log('progressing to next page…');
      }
    }
  }

  const run = () => {
    if (currentTarget.includes('authtool.app')) return runAuthtool();
    if (currentTarget.includes('sub2s.com')) return runSub2s();
    
    // Intermediate hops (layma.net, ontops.link, etc.)
    const key = extractResult();
    if (key && !S.hopped) {
      S.hopped = true;
      log('Key acquired from hop');
      status('redirecting to final key…');
      setTimeout(() => {
        location.href = wrapUrl('https://authtool.app/get-key/?result=' + encodeURIComponent(key));
      }, 800);
    }
  };

  run();
  setInterval(run, 2000);
})();
`;

/**
 * Starting Hub Interface
 */
function renderHubHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sub2s Auto-Bypass Console</title>
    <style>
        body {
            background: linear-gradient(160deg, #241a3f, #17102a);
            color: #f3edff;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .card {
            background: linear-gradient(160deg, #2a1d4d, #160f2b);
            border: 2px solid #9d6bff;
            border-radius: 16px;
            padding: 32px;
            width: min(90vw, 440px);
            box-shadow: 0 0 50px rgba(124, 77, 255, 0.4);
            text-align: center;
        }
        h2 { margin: 0 0 8px 0; color: #f3edff; font-size: 20px; }
        p { color: #8f7fc9; font-size: 13px; margin-bottom: 20px; }
        input {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid #5b3fa8;
            background: #120b24;
            color: #f3edff;
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
            margin-bottom: 14px;
        }
        input:focus { border-color: #9d6bff; }
        button {
            width: 100%;
            padding: 13px;
            border: 0;
            border-radius: 10px;
            cursor: pointer;
            background: linear-gradient(135deg, #7c4dff, #9d6bff);
            color: #fff;
            font-size: 15px;
            font-weight: 700;
        }
        .err { color: #ff5b7f; font-size: 12px; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <div class="card">
        <h2>🔑 Sub2s Helper Hub</h2>
        <p>Paste your full link or UUID code to bypass on this single page.</p>
        <input id="inputVal" type="text" placeholder="e.g. authtool.app/get-key/?code=..." autocomplete="off">
        <button id="goBtn">START BYPASS ⚡</button>
        <div id="errMsg" class="err">Invalid format. Please enter a valid code or link.</div>
    </div>
    <script>
      const CODE_RE = /[?&]code=([a-f0-9-]{20,})/i;
      const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

      document.getElementById('goBtn').addEventListener('click', () => {
        const val = document.getElementById('inputVal').value.trim();
        let code = null;

        const m1 = CODE_RE.exec(val);
        const m2 = val.match(UUID_RE);

        if (m1) code = m1[1];
        else if (m2) code = val;

        if (!code) {
          document.getElementById('errMsg').style.display = 'block';
          return;
        }

        const target = 'https://authtool.app/get-key/?code=' + encodeURIComponent(code);
        location.href = '/?__dest=' + encodeURIComponent(target);
      });
    </script>
</body>
</html>`;
}
