import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const brand = process.env.DJ_STUDIO_BRAND;
if (!['goldensteal', 'rolyfe'].includes(brand)) throw new Error('Set DJ_STUDIO_BRAND to goldensteal or rolyfe.');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
    const content = await readFile(target);
    response.writeHead(200, {
      'content-type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'cache-control': 'no-store' }).end('Not found');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let failure = null;

try {
  const viewports = [
    { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true },
    { name: 'desktop', width: 1365, height: 900, isMobile: false, hasTouch: false }
  ];

  for (const viewport of viewports) {
    console.log(`[${viewport.name}] opening app shell`);
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch
    });
    const pageErrors = [];
    const failedCoreRequests = [];

    // This is an app-shell boot test: isolate local code from third-party media,
    // embeds, and font hosts so external services cannot stall the browser.
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if ((requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:') && requestUrl.origin !== origin) {
        return route.abort();
      }
      return route.continue();
    });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const url = request.url();
      if (url.startsWith(origin) && /\.(js|css|html|webmanifest|json)(\?|$)/i.test(url)) {
        failedCoreRequests.push(url + ' — ' + (request.failure()?.errorText || 'request failed'));
      }
    });

    const response = await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 12000 });
    if (!response || !response.ok()) throw new Error(`${viewport.name}: app shell returned HTTP ${response?.status() ?? 'no response'}`);

    console.log(`[${viewport.name}] waiting for full studio API`);
    await page.waitForFunction((selectedBrand) => {
      if (selectedBrand === 'goldensteal') {
        return window.__goldenStealStudioReady === true &&
          document.documentElement.dataset.goldenstealStartup === 'ready' &&
          Boolean(window.GoldenStealStudio?.engine);
      }
      return window.__rolyfeStudioReady === true &&
        document.documentElement.dataset.rolyfeStartup === 'ready' &&
        Boolean(window.ROLyfeStudio?.engine);
    }, brand, { timeout: 25000 });

    await page.waitForTimeout(300);

    const state = await page.evaluate((selectedBrand) => {
      const studio = selectedBrand === 'goldensteal' ? window.GoldenStealStudio : window.ROLyfeStudio;
      const gate = document.querySelector(
        '#frontDoor, .front-door, #welcomeGate, .welcome-gate, #loginOverlay, .login-overlay, [data-entry-gate]'
      );
      const text = document.body.innerText.toUpperCase();
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 20;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollable ? 320 : 0);
      return {
        title: document.title,
        deckA: Boolean(document.getElementById('deckA') && studio?.deckState?.A?.audio),
        deckB: Boolean(document.getElementById('deckB') && studio?.deckState?.B?.audio),
        jogWheels: Boolean(document.getElementById('platterA') && document.getElementById('platterB')),
        mixer: Boolean(document.getElementById('mixer') && document.getElementById('crossfader')),
        musicLibrary: Boolean(document.getElementById('library') && document.getElementById('libraryFiles')),
        deckWorkspaceOpen: Boolean(document.getElementById('deckWorkspace')?.open),
        hasEntryGate: Boolean(gate) || text.includes('ENTER STUDIO') || text.includes('SIGN IN TO CONTINUE'),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollable,
        apiReady: typeof studio?.loadFileIntoDeck === 'function' &&
          typeof studio?.togglePlay === 'function' &&
          Boolean(studio?.engine)
      };
    }, brand);

    const failedChecks = [];
    for (const key of ['deckA', 'deckB', 'jogWheels', 'mixer', 'musicLibrary', 'deckWorkspaceOpen', 'apiReady']) {
      if (!state[key]) failedChecks.push(key);
    }
    if (state.hasEntryGate) failedChecks.push('blocking entry gate is present');
    if (state.horizontalOverflow) failedChecks.push('layout has horizontal overflow');
    if (viewport.isMobile && state.scrollable) {
      const scrollY = await page.evaluate(() => window.scrollY);
      if (scrollY < 1) failedChecks.push('phone/tablet page cannot scroll');
    }
    if (pageErrors.length) failedChecks.push('browser errors: ' + pageErrors.join(' | '));
    if (failedCoreRequests.length) failedChecks.push('failed app resources: ' + failedCoreRequests.join(' | '));

    console.log(`[${viewport.name}] ${JSON.stringify(state)}`);
    await Promise.race([
      page.close(),
      new Promise(resolve => setTimeout(resolve, 2500))
    ]);
    if (failedChecks.length) throw new Error(`${viewport.name} smoke test failed: ${failedChecks.join('; ')}`);
  }

  console.log(`PASS: ${brand} DJ Studio boots with both real decks, jog wheels, mixer and local music library on phone, tablet and desktop Chromium.`);
} catch (error) {
  failure = error;
} finally {
  await Promise.race([
    browser.close(),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

if (failure) {
  console.error('DJ Studio browser smoke test failed:', failure);
  process.exit(1);
}
console.log(`PASS: ${brand} browser startup checks completed. Exiting cleanly.`);
process.exit(0);
