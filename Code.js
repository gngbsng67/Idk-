export default {
  async fetch(request) {
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🔑 Key Grabber Launcher</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#241a3f,#17102a);font:14px/1.5 system-ui;color:#f3edff}
  .box{background:linear-gradient(160deg,#2a1d4d,#160f2b);border:1px solid #9d6bff;border-radius:16px;
    padding:32px;width:340px;box-shadow:0 0 60px rgba(124,77,255,.5)}
  h1{font-size:20px;color:#c9b3ff;margin:0 0 4px}
  p{color:#8f7fc9;font-size:12px;margin:0 0 18px}
  label{display:block;font-size:12px;color:#b9a8e8;margin:10px 0 4px}
  input{width:100%;box-sizing:border-box;background:#120b24;border:1px solid #5a3fa0;border-radius:8px;
    padding:10px 12px;color:#f3edff;font:14px monospace;outline:none}
  input:focus{border-color:#9d6bff}
  input.err{border-color:#ff5b7f}
  button{width:100%;margin-top:18px;background:#7c4dff;color:#fff;border:0;border-radius:8px;
    padding:12px;font:600 15px system-ui;cursor:pointer}
  button:hover{background:#8f66ff}
</style>
</head>
<body>
<div class="box">
  <h1>🔑 Key Grabber Launcher</h1>
  <p>Enter domain + authtool code, then press GO.</p>
  <label>Domain</label>
  <input id="domain" placeholder="authtool.app" spellcheck="false">
  <label>Code (or full link)</label>
  <input id="code" placeholder="paste code here" spellcheck="false">
  <button id="go">GO 🚀</button>
</div>
<script>
  const d = document.getElementById('domain');
  const c = document.getElementById('code');
  function go(){
    let domain = d.value.trim().replace(/^https?:\\/\\//,'').replace(/\\/.*/,'') || 'authtool.app';
    let raw = c.value.trim();
    d.classList.remove('err'); c.classList.remove('err');
    const m = raw.match(/[?&]code=([a-f0-9-]{6,})/i);
    const code = m ? m[1] : (raw && !raw.startsWith('http') ? raw : null);
    if (!code){ c.classList.add('err'); return; }
    if (!/^[a-z0-9.-]+\\.[a-z]{2,}$/i.test(domain)){ d.classList.add('err'); return; }
    location.href = 'https://' + domain + '/get-key/?code=' + encodeURIComponent(code);
  }
  document.getElementById('go').onclick = go;
  [d,c].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  d.focus();
</script>
</body>
</html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
};
