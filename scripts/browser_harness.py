# Test-only DOM harness: managed Chromium disallows navigation, so localhost HTTP
# responses are delivered through a Playwright binding. No app source is modified.
import json, re, base64, os, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('FORMA_TEST_URL', 'http://127.0.0.1:4318')

def bundle():
    out = ['window.__FORMA_MODULES__ = {};']
    files = ['shared/catalog.mjs', 'shared/design.mjs', 'shared/elements.mjs', 'shared/ui-catalog.mjs', 'shared/schema.mjs', 'shared/content.mjs', 'shared/pages.mjs', 'shared/icons.mjs', 'public/app.mjs']
    for file in files:
        source = (ROOT / file).read_text()
        exports = re.findall(r'^export\s+(?:const|function|class)\s+(\w+)', source, re.M)
        def replace_import(m):
            names, uri = m.groups()
            target = 'shared/' + uri.rsplit('/', 1)[-1]
            return 'const {' + re.sub(r'\bas\b', ':', names) + '} = window.__FORMA_MODULES__[' + json.dumps(target) + '];'
        source = re.sub(r"^import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"];", replace_import, source, flags=re.M)
        source = re.sub(r'^export\s+', '', source, flags=re.M)
        out.append('window.__FORMA_MODULES__['+json.dumps(file)+'] = (() => {\n'+source+'\nreturn {'+','.join(exports)+'};\n})();')
    return '\n'.join(out)

def bridge(source, path, init):
    assert path.startswith('/api/'), path
    headers = init.get('headers') or {}
    data = init.get('body')
    req = urllib.request.Request(BASE + path, data=data.encode() if data is not None else None, headers=headers, method=init.get('method') or 'GET')
    try:
        response=urllib.request.urlopen(req,timeout=30)
    except urllib.error.HTTPError as exc:
        response=exc
    return {'status':response.status,'headers':dict(response.headers),'body':base64.b64encode(response.read()).decode()}

BOOT = r'''() => {
    if (!crypto.randomUUID) crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
    window.fetch = async (path, init = {}) => {
      if (init.signal?.aborted) throw new DOMException('Aborted','AbortError');
      const result = await window.__localHttp(path, {method:init.method,headers:init.headers,body:init.body});
      if (init.signal?.aborted) throw new DOMException('Aborted','AbortError');
      return new Response(Uint8Array.from(atob(result.body), c => c.charCodeAt(0)), {status:result.status,headers:result.headers});
    };
    window.__downloadBlobs = new Map(); window.__downloads = [];
    const nativeURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url=nativeURL(blob); window.__downloadBlobs.set(url,blob); return url; };
    document.addEventListener('click', async ev => {
      const a = ev.target.closest('a[download]'); if(!a)return; ev.preventDefault();
      const b=window.__downloadBlobs.get(a.href); if (b) window.__downloads.push({name:a.download,type:b.type,bytes:Array.from(new Uint8Array(await b.arrayBuffer()))});
    },true);
}'''

def load(page):
    if os.environ.get('FORMA_BROWSER_HTTP_BRIDGE') != '1':
        page.goto(BASE)
        page.wait_for_timeout(1100)
        # Capture download payloads without writing outside the artifact directory.
        page.evaluate('() => {' + BOOT[BOOT.index('window.__downloadBlobs'):BOOT.rindex('}') ] + '}')
        return
    request = urllib.request.urlopen(BASE)
    html = request.read().decode()
    html = html.replace('<link rel="stylesheet" href="/app.css"/>','<style>'+(ROOT/'public/app.css').read_text()+'</style>')
    html = html.replace('<script type="module" src="/app.mjs"></script>', '')
    # Use the real parent CSP so srcdoc runtime is tested under the same policy.
    csp = request.headers['Content-Security-Policy'].replace("frame-ancestors 'none'",'')
    html = html.replace('<meta charset="utf-8"/>','<meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="'+csp+'"/>')
    page.expose_binding('__localHttp',bridge)
    page.set_content(html)
    page.evaluate(BOOT)
    page.evaluate(bundle())
    page.wait_for_timeout(1100)
