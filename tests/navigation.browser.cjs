/* Run with Playwright available to Node and Flask/pytest available to PYTHON.
   PYTHON and CHROMIUM_EXECUTABLE_PATH may select local runtime binaries.
   The server and role sessions use a temporary database, never instance data. */
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {mkdir} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, baseURL, sessions;
const pageErrors = [];
const python = `
import sys, tempfile, shutil, json, threading
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'tests'))
from app import create_app
from conftest import client_with_csrf
from db import transaction
from test_booking import reserve, confirm
from werkzeug.serving import make_server
with tempfile.TemporaryDirectory(prefix='tourney-navigation-') as directory:
    database = str(Path(directory) / 'test.sqlite')
    shutil.copyfile('database/tourney-gate.sqlite', database)
    app = create_app({'TESTING':True, 'SECRET_KEY':'navigation-browser-tests', 'DATABASE':database})
    sessions = {}
    for role in ['guest', 'user', 'staff', 'admin', 'owner']:
        for count in [0, 20]:
            client = app.test_client() if role == 'guest' else client_with_csrf(app, role=role)[0]
            client.get('/')
            with client.session_transaction() as state:
                state['itinerary'] = list(range(1, count + 1))
                uid = state.get('user_id')
            if uid:
                with app.app_context(), transaction() as db:
                    db.execute('UPDATE account_profiles SET itinerary_json=? WHERE user_id=?', (json.dumps(list(range(1,count+1))), uid))
            sessions[role + str(count)] = client.get_cookie('session').value
    booked, headers = client_with_csrf(app)
    for seat in [1, 2]:
        booking = reserve(booked, headers, payload={'items':[{'tier_id':1,'seat_ids':[seat]}]}).json
        assert confirm(booked, headers, booking).status_code == 200
    sessions['booked0'] = booked.get_cookie('session').value
    server = make_server('127.0.0.1', 0, app, threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(json.dumps({'port':server.server_port,'sessions':sessions}), flush=True)
    sys.stdin.read()
    server.shutdown()
`;
before(async () => {
  server = spawn(process.env.PYTHON || 'python', ['-u', '-c', python], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
  let errors = '';
  server.stderr.on('data', chunk => { errors += chunk; });
  const ready = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error(`Preview server timed out: ${errors}`)), 30000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(Error(`Preview server exited (${code}): ${errors}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timeout); resolve(JSON.parse(output.split('\n')[0])); }
    });
  });
  baseURL = `http://127.0.0.1:${ready.port}`;
  sessions = ready.sessions;
  browser = await chromium.launch({headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.stdin.end();
    await exited;
  }
  assert.deepEqual(pageErrors, [], 'Browser pages must not produce JavaScript errors');
});
async function pageFor(role = 'guest', count = 0, route = '/', width = 1440, prefs = {}, motion = 'reduce') {
  const context = await browser.newContext({viewport: {width, height: 1000}, hasTouch: width <= 620, reducedMotion: motion});
  await context.addCookies([{name: 'session', value: sessions[role + count], url: baseURL}]);
  await context.addInitScript(prefs => { if (localStorage.getItem('tg-a11y') === null) localStorage.setItem('tg-a11y', JSON.stringify(prefs)); }, prefs);
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(baseURL + route);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  return page;
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function openNav(page) {
  if (await page.locator('.menu-toggle').isVisible() && await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false') await page.locator('.menu-toggle').click();
}

test('guest profile disclosure supports keyboard, outside click, and native links', async () => {
  const page = await pageFor();
  const summary = page.locator('.nav-profile summary');
  const login = page.locator('#profile-links a[href="/login"]');
  assert.equal(await login.isVisible(), false);
  await summary.focus(); await page.keyboard.press('Enter');
  await login.waitFor({state: 'visible'});
  await settle(page);
  assert.equal(await summary.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Tab'); await login.press('Escape');
  assert.equal(await login.isVisible(), false);
  assert.equal(await summary.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Space'); await login.waitFor({state: 'visible'});
  await page.locator('main h1').click();
  assert.equal(await login.isVisible(), false);
  await summary.click(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.locator('#profile-links a[href="/register"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Tab'); assert.equal(await login.isVisible(), false);
  await summary.click(); await login.click(); await page.waitForURL('**/login');
  assert.equal(await page.locator('.nav-profile').getAttribute('open'), null);
  await page.context().close();
});

test('compact profile uses an inline disclosure and Escape closes one layer at a time', async () => {
  const page = await pageFor('guest', 0, '/', 320);
  await page.locator('.menu-toggle').tap(); await page.locator('.nav-profile summary').tap();
  const register = page.locator('#profile-links a[href="/register"]');
  await register.scrollIntoViewIfNeeded();
  const box = await register.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 320);
  await register.focus(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.menu-toggle').evaluate(node => node === document.activeElement), true);
  await page.context().close();
});

test('header fits viewport, role controls, saved counts, and accessibility combinations', async () => {
  const widths = [320, 390, 850, 1150, 1320, 1321, 1440, 1920];
  const preferences = [{}, {font: true}, {text: 3}, {spacing: true}, {font: true, text: 3, spacing: true, links: true}];
  for (const role of ['guest', 'user', 'staff', 'admin', 'owner']) {
    for (const count of [0, 20]) {
      const page = await pageFor(role, count, role === 'owner' ? '/admin' : '/');
      for (const width of widths) {
        await page.setViewportSize({width, height: 1000});
        for (const prefs of preferences) {
          await page.evaluate(prefs => {
            const root = document.documentElement;
            for (const flag of ['font', 'spacing', 'links']) root.classList.toggle(`a11y-${flag}`, !!prefs[flag]);
            if (prefs.text) root.dataset.a11yText = prefs.text; else delete root.dataset.a11yText;
            dispatchEvent(new CustomEvent('tg-a11y-change'));
          }, prefs);
          await settle(page);
          const result = await page.evaluate(() => {
            const header = document.querySelector('.site-header'), inner = header.querySelector('.header-inner');
            const visible = node => !!node.getClientRects().length;
            const items = [...inner.children].filter(visible).map(node => ({node, box: node.getBoundingClientRect()}));
            const bounds = inner.getBoundingClientRect();
            const problems = [];
            const brand = header.querySelector('.brand');
            const brandText = document.createRange();
            brandText.selectNodeContents(brand.querySelector(':scope > span').firstChild);
            if (brandText.getBoundingClientRect().right > items[1].box.left) problems.push('brand text overlaps next control');
            for (let i = 0; i < items.length; i++) {
              const {node, box} = items[i];
              if (box.left < bounds.left - 1 || box.right > bounds.right + 1) problems.push(`${node.className || node.tagName} exceeds header`);
              if (i && box.left < items[i - 1].box.right - 1) problems.push('header controls overlap');
            }
            const compact = visible(header.querySelector('.menu-toggle'));
            const cta = header.querySelector('.header-cta');
            if (cta && !compact) {
              if (cta.scrollWidth > cta.clientWidth + 1 || cta.scrollHeight > cta.clientHeight + 1) problems.push('Plan my day clips');
              const range = document.createRange(); range.selectNodeContents(cta);
              if (range.getClientRects().length !== 1) problems.push('Plan my day wraps');
            }
            for (const icon of header.querySelectorAll('.nav-icon, .menu-toggle, .theme-toggle')) {
              if (visible(icon)) { const box = icon.getBoundingClientRect(); if (box.width < 44 || box.height < 44) problems.push('small icon target'); }
            }
            return {compact, problems};
          });
          assert.deepEqual(result.problems, [], JSON.stringify({role, count, width, prefs, ...result}));
          if (width <= 1320) assert.equal(result.compact, true);
          if (width === 1920 && !Object.keys(prefs).length) assert.equal(result.compact, false);
          if (width === 1440 && prefs.font && prefs.text && role !== 'owner') assert.equal(result.compact, true);
        }
      }
      await openNav(page);
      if (role !== 'owner') assert.equal(await page.locator('#navigation .mobile-plan-link').count(), 1);
      if (role !== 'guest') {
        assert.equal(await page.getByRole('button', {name: 'Log out', exact: true}).count(), 1);
        if (role !== 'owner') assert.equal(await page.getByRole('link', {name: 'My account', exact: true}).count(), 1);
      }
      await page.context().close();
    }
  }
});

test('Readable Font keeps CTA width and live underline preferences decorate only text', async () => {
  const page = await pageFor('guest', 20, '/', 1920);
  const cta = page.locator('.header-cta');
  const original = await cta.boundingBox();
  await page.locator('[data-a11y-open]').click();
  await page.locator('[data-a11y-flag="font"]').check();
  await settle(page);
  assert.equal((await cta.boundingBox()).width, original.width);
  await page.locator('[data-a11y-flag="links"]').check();
  await page.locator('[data-a11y-close]').click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const link = page.locator('.atlas-intro > .underlined-link');
    assert.match(await link.locator('.a11y-link-label').evaluate(node => getComputedStyle(node).textDecorationLine), /underline/);
    assert.equal(await link.locator('[aria-hidden="true"]').evaluate(node => getComputedStyle(node).textDecorationLine), 'none');
    assert.equal(await cta.evaluate(node => getComputedStyle(node).textDecorationLine), 'none');
    const navLink = page.locator('#navigation > a').first(); await navLink.hover();
    assert.equal(await navLink.evaluate(node => getComputedStyle(node, '::after').display), 'none');
    assert.match(await navLink.evaluate(node => getComputedStyle(node).textDecorationLine), /underline/);
  }
  // Replaced atlas content must receive the same text-only treatment.
  await page.evaluate(() => {
    document.querySelector('#atlas-preview-content').innerHTML = '<a class="underlined-link" href="/events">Browse gatherings <span aria-hidden="true">+</span></a>';
  });
  await page.locator('#atlas-preview-content .a11y-link-label').waitFor();
  await page.reload(); await settle(page);
  assert.equal(await page.locator('html.a11y-font.a11y-links').count(), 1);
  await page.context().close();
});

test('representative pages retain navigation and produce usable previews', async () => {
  const directory = path.join(root, 'test-results', 'navigation');
  await mkdir(directory, {recursive: true});
  for (const [role, route, width, name] of [
    ['guest', '/', 1440, 'home-desktop'], ['guest', '/events', 390, 'events-mobile'],
    ['user', '/itinerary', 1440, 'itinerary-readable'], ['user', '/account', 390, 'account-mobile'],
  ]) {
    const page = await pageFor(role, 20, route, width, {font: true, links: true});
    await openNav(page);
    await page.screenshot({path: path.join(directory, `${name}.png`)});
    assert.ok(await page.locator('main h1').isVisible());
    if (route === '/account') {
      await page.keyboard.press('Escape');
      await page.locator('.account-itinerary').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(directory, 'account-itinerary-mobile.png')});
    }
    await page.context().close();
  }
  const desktop = await pageFor('guest', 0, '/', 1440);
  await desktop.locator('.nav-profile summary').click();
  await desktop.screenshot({path: path.join(directory, 'profile-menu-desktop.png')});
  await desktop.context().close();
  const compact = await pageFor('guest', 20, '/', 320, {font: true, text: 3, spacing: true, links: true});
  await openNav(compact);
  assert.equal(await compact.locator('#navigation').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  assert.equal(await compact.locator('.mobile-plan-link').evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length;
  }), 1);
  await compact.locator('.nav-profile summary').click();
  await compact.locator('#profile-links a[href="/register"]').scrollIntoViewIfNeeded();
  await compact.screenshot({path: path.join(directory, 'profile-menu-largest-text.png')});
  await compact.context().close();
});

test('homepage anchors, numeric typography, and long Herald lists work with accessible layouts', async () => {
  for (const width of [320, 390, 850, 1440, 1920]) {
    const page = await pageFor('guest', 0, '/', width);
    for (const theme of ['light', 'dark']) {
      for (const prefs of [{}, {font: true}, {font: true, text: 3, spacing: true}]) {
        await page.evaluate(prefs => {
          const root = document.documentElement;
          root.classList.toggle('a11y-font', !!prefs.font);
          root.classList.toggle('a11y-spacing', !!prefs.spacing);
          if (prefs.text) root.dataset.a11yText = prefs.text; else delete root.dataset.a11yText;
          dispatchEvent(new CustomEvent('tg-a11y-change'));
          scrollTo({top: 0, behavior: 'instant'});
        }, prefs);
        await settle(page);
        if ((await page.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await page.locator('[data-theme-toggle]').click();
        await page.locator('.proclamation-actions a[href="#atlas"]').click();
        await page.waitForFunction(() => Math.abs(document.getElementById('atlas').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom - 12) < 3);
        assert.equal(new URL(page.url()).hash, '#atlas');
        const font = await page.locator('.atlas-event-row time strong').first().evaluate(node => getComputedStyle(node).fontFamily);
        assert.match(font, prefs.font ? /Verdana/ : /Cinzel/);
        assert.match(await page.locator('.upcoming-countdown strong').first().evaluate(node => getComputedStyle(node).fontFamily), prefs.font ? /Verdana/ : /Cinzel/);
        const fits = await page.locator('.atlas-event-row').first().evaluate(node => {
          const date = node.querySelector('time strong').getBoundingClientRect();
          const copy = node.querySelector('.atlas-row-copy').getBoundingClientRect();
          const price = node.querySelector('.atlas-row-price').getBoundingClientRect();
          return date.right <= copy.left && copy.right <= price.left;
        });
        assert.equal(fits, true, `Atlas date/title/price overlap at ${width}px with ${JSON.stringify(prefs)}`);
      }
    }
    await page.evaluate(() => {
      const list = document.querySelector('.atlas-event-rows');
      list.innerHTML += list.innerHTML.repeat(20);
    });
    await settle(page);
    const scrollAreas = await page.locator('#atlas-preview-content, .atlas-event-rows').evaluateAll(nodes => nodes.map(node => ({
      overflow: getComputedStyle(node).overflowY, fits: node.scrollHeight <= node.clientHeight + 1,
    })));
    for (const area of scrollAreas) { assert.equal(area.overflow, 'visible'); assert.equal(area.fits, true); }
    if (width === 1440) await page.screenshot({path: path.join(root, 'test-results/navigation/atlas-dark-large-text.png')});
    await page.context().close();
  }
});

test('normal-motion Explore the Realm finishes at the shared header offset', async () => {
  const page = await pageFor('guest', 0, '/', 1440, {}, 'no-preference');
  await page.locator('.proclamation-actions a[href="#atlas"]').click();
  await page.waitForFunction(() => Math.abs(document.getElementById('atlas').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom - 12) < 3);
  assert.equal(await page.locator('.page-transition.is-active').count(), 0);
  // A venue selection is a same-document history change and must not open gates.
  await page.locator('.atlas-landmark[data-venue="1"]').click();
  await page.locator('.atlas-landmark[data-venue="2"]').click();
  await page.goBack();
  assert.equal(new URL(page.url()).searchParams.get('venue'), '1');
  assert.equal(await page.locator('.page-transition.is-active').count(), 0);
  await page.context().close();
});

test('scrollbar separator remains painted beside the thumb throughout scrolling', async () => {
  const page = await pageFor();
  const colors = await page.evaluate(() => {
    const root = document.documentElement;
    const track = getComputedStyle(root, '::-webkit-scrollbar-track');
    const thumb = getComputedStyle(root, '::-webkit-scrollbar-thumb');
    return {edge: track.borderLeftWidth, border: thumb.borderLeftColor, clip: thumb.backgroundClip};
  });
  assert.equal(colors.edge, '1px');
  assert.equal(colors.border, 'rgba(0, 0, 0, 0)');
  assert.equal(colors.clip, 'padding-box');
  for (const [position, ratio] of [['top', 0], ['middle', .5], ['bottom', 1]]) {
    await page.evaluate(ratio => scrollTo({top: (document.documentElement.scrollHeight - innerHeight) * ratio, behavior: 'instant'}), ratio);
    await page.screenshot({path: path.join(root, `test-results/navigation/scrollbar-${position}.png`)});
  }
  await page.context().close();
});

test('guest booking prompts survive availability polling and preserve both auth destinations', async () => {
  const page = await pageFor('guest', 0, '/events/silver-lance', 1440);
  const login = page.locator('.booking-panel > a.button');
  assert.equal(await login.textContent(), 'Log in to book');
  const next = '/events/silver-lance/seats';
  assert.equal(new URL(await login.getAttribute('href'), baseURL).searchParams.get('next'), next);
  await page.waitForResponse(response => response.url().endsWith('/api/events/1/availability'));
  assert.equal(await login.textContent(), 'Log in to book');
  const register = page.locator('.booking-auth-hint a').first();
  assert.equal(new URL(await register.getAttribute('href'), baseURL).searchParams.get('next'), next);
  await register.click(); await page.waitForURL('**/register?**');
  assert.equal(await page.locator('input[name="next"]').inputValue(), next);
  assert.equal(await page.locator('input[name="password"]').getAttribute('maxlength'), '64');
  await page.context().close();
});

test('account cancellation handles keep, server failures, duplicate submits, and successful updates', async () => {
  const page = await pageFor('booked', 0, '/account#bookings', 390, {font: true, links: true});
  const controls = page.locator('[data-cancel-booking]');
  assert.equal(await controls.count(), 2);
  const row = page.locator('[data-booking-id]').first();
  await row.locator('[data-cancel-booking]').click();
  await page.locator('[data-keep-booking]').click();
  assert.equal(await controls.count(), 2);
  await page.route('**/api/bookings/*/cancel', route => route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({error: 'Cancellation closes 24 hours before the event.'})}));
  await row.locator('[data-cancel-booking]').click();
  await page.locator('#account-cancel-form [type="submit"]').click();
  await page.locator('#account-cancel-error').waitFor({state: 'visible'});
  assert.equal(await row.locator('.account-status').textContent(), 'Confirmed');
  await page.locator('[data-keep-booking]').click();
  await page.unroute('**/api/bookings/*/cancel');
  let requests = 0;
  await page.route('**/api/bookings/*/cancel', async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.continue();
  });
  await row.locator('[data-cancel-booking]').click();
  await page.locator('#account-cancel-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await page.waitForFunction(() => !document.getElementById('account-cancel-dialog').open);
  assert.equal(requests, 1);
  assert.equal(await row.locator('.account-status').textContent(), 'Cancelled');
  assert.equal(await controls.count(), 1);
  assert.match(await page.locator('#account-booking-result').textContent(), /Booking cancelled/);
  assert.equal(await row.getByRole('link', {name: 'View ticket'}).count(), 1);
  await page.screenshot({path: path.join(root, 'test-results/navigation/account-cancelled-mobile.png')});
  await page.context().close();
});

test('fresh Back/Forward loads replay gates and preserve URL, scroll, and reduced motion', async () => {
  const page = await pageFor('guest', 0, '/events?category=Joust', 1440, {}, 'no-preference');
  const saved = await page.evaluate(() => { scrollTo({top: 500, behavior: 'instant'}); return scrollY; });
  await page.goto(baseURL + '/house');
  await page.goBack({waitUntil: 'domcontentloaded'});
  await page.locator('.page-transition.is-active').waitFor();
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type), 'back_forward');
  assert.equal(new URL(page.url()).search, '?category=Joust');
  await page.waitForFunction(() => !document.querySelector('.page-transition').classList.contains('is-active'));
  const restored = await page.evaluate(() => scrollY);
  assert.ok(Math.abs(restored - saved) < 3, `Expected scroll ${saved}; restored ${restored}`);
  await page.goForward({waitUntil: 'domcontentloaded'});
  await page.locator('.page-transition.is-active').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.page-transition.is-active').count(), 0);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goBack({waitUntil: 'domcontentloaded'});
  assert.equal(await page.locator('.page-transition.is-active').count(), 0);
  await page.context().close();
});

test('authentication failure during cancellation preserves the My Bookings return path', async () => {
  const page = await pageFor('booked', 0, '/account#bookings', 1440);
  await page.context().clearCookies();
  await page.route('**/api/bookings/*/cancel', route => route.fulfill({status: 401, contentType: 'application/json', body: JSON.stringify({error: 'Sign in to continue.', login_url: '/login'})}));
  await page.locator('[data-cancel-booking]').first().click();
  await page.locator('#account-cancel-form [type="submit"]').click();
  await page.waitForURL('**/login?**');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/account#bookings');
  assert.equal(await page.locator('input[name="next"]').inputValue(), '/account#bookings');
  await page.context().close();
});

test('an actual back-forward-cache restore replays the gate on the preserved document', async () => {
  const cachedBrowser = await chromium.launch({headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache', '--hide-scrollbars'], ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  try {
    const context = await cachedBrowser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'no-preference'});
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.__documentIdentity = Math.random();
      addEventListener('pageshow', event => { window.__restoredFromCache = event.persisted; });
    });
    await page.goto(baseURL + '/events');
    await page.evaluate(() => document.fonts.ready);
    const saved = await page.evaluate(() => { scrollTo({top: 400, behavior: 'instant'}); return scrollY; });
    const identity = await page.evaluate(() => window.__documentIdentity);
    await page.goto(baseURL + '/house');
    await page.goBack({waitUntil: 'commit'});
    await page.waitForFunction(() => window.__restoredFromCache === true);
    assert.equal(await page.evaluate(() => window.__documentIdentity), identity);
    await page.locator('.page-transition.is-active').waitFor();
    await page.waitForFunction(() => !document.querySelector('.page-transition').classList.contains('is-active'));
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - saved) < 3);
    await page.goForward({waitUntil: 'commit'});
    await page.keyboard.press('Escape');
    await page.locator('[data-a11y-open]').click();
    await page.locator('[data-a11y-flag="motion"]').check();
    await page.goBack({waitUntil: 'commit'});
    // The browser may evict the second no-store entry. Either restoration path
    // must honor the preference changed on the intervening page.
    await page.waitForFunction(() => document.documentElement.classList.contains('a11y-motion'));
    await settle(page);
    assert.equal(await page.locator('html.a11y-motion').count(), 1);
    assert.equal(await page.locator('.page-transition.is-active').count(), 0);
    await context.close();
  } finally { await cachedBrowser.close(); }
});
