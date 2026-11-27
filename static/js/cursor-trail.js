'use strict';
/* Cursor trail and hover effect — the same for the plain pointer and every weapon cursor:
   - Moving the pointer leaves a short, fading trail of gold glints.
   - Over anything clickable, a thin gilt ring eases in around the pointer's point of contact.
   - Clicking pulses the ring outward and throws a small burst of glints.
   With a weapon from "Choose your armory" equipped, the cursor also becomes a shield over anything
   clickable, and the shield shines: a soft glow with slowly turning, twinkling rays at its top-left
   corner. The system cursor is always painted above the page, so a page effect can't sit on top of
   it; while that shine shows, the system cursor is hidden and the shield is drawn here instead.
   Mouse and trackpad only; off when motion is reduced (system setting or the site's switch) and
   when "Cursor sparkles" is switched off in the accessibility panel. Purely decorative: the overlay
   ignores the pointer and is hidden from assistive technology. */
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const osReduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches) return;
  const root = document.documentElement;
  const CLICKABLE = 'a[href], button:not(:disabled), summary, select, label[for], [role="button"], [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="submit"], .armory-option, .seat';

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  const glint = document.createElement('div');
  glint.className = 'cursor-glint';
  glint.setAttribute('aria-hidden', 'true');
  const glintShield = document.createElement('span');
  glintShield.className = 'cursor-glint-shield';
  glint.append(glintShield);
  document.body.append(canvas, ring, glint);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); ring.remove(); glint.remove(); return; }

  let enabled = false, armed = false, large = false, dpr = 1;
  let particles = [], frame = 0, last = null;
  const pointer = {x: -100, y: -100}, ringPos = {x: -100, y: -100};
  let hovering = false, ringScale = 0, pulse = 0;

  function readPrefs() {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('tg-a11y') || '{}'); } catch (_error) { /* Storage is optional. */ }
    enabled = !prefs.notrail && !prefs.motion && !osReduced.matches;
    armed = root.classList.contains('tg-armed') && root.dataset.armory !== 'system';
    root.classList.toggle('cursor-fx', enabled);
    large = !!prefs.bigcursor;
    glint.classList.toggle('is-large', large);
    ring.classList.toggle('is-large', large);
    // The same shield artwork as the cursor (from js/accessibility.js), drawn under the shine.
    if (armed && window.TG_A11Y?.weaponSvg) glintShield.innerHTML = window.TG_A11Y.weaponSvg('shield', false, prefs.bigcursor ? 48 : 32, 'glint-shield');
    setShine(false);
    if (!enabled) { particles = []; hovering = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    refreshOverlay();
  }
  function setShine(on) {
    on = Boolean(on && enabled && armed && glintShield.firstElementChild && glint.isConnected && glint.parentElement === overlayHost());
    if (on && glint.classList.contains('is-on') && root.classList.contains('shield-shine')) return;
    glint.classList.toggle('is-on', on);
    // A custom cursor is a fallback, never something to hide before its drawn
    // replacement can actually be painted in the current fullscreen/top layer.
    if (on && (!glintShield.getBoundingClientRect().width || getComputedStyle(glint).visibility !== 'visible')) {
      on = false; glint.classList.remove('is-on');
    }
    root.classList.toggle('shield-shine', on);
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Bright golds, each drawn with a soft dark edge (see tick) so they read on night blue and parchment alike.
  const glitter = () => ['#f6dc8e', '#ffe9a8', '#e3b85a'];

  function spawn(x, y, burst = false) {
    const colours = glitter();
    const count = burst ? 12 : 1;
    for (let i = 0; i < count; i++) {
      const angle = burst ? (Math.PI * 2 * i) / count + Math.random() * .4 : Math.random() * Math.PI * 2;
      const speed = burst ? 1.6 + Math.random() * 1.8 : Math.random() * .35;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + (burst ? 0 : .25),
        life: 1, decay: burst ? .035 + Math.random() * .02 : .028 + Math.random() * .018,
        size: 2 + Math.random() * 2,
        colour: colours[(Math.random() * colours.length) | 0], spin: Math.random() * Math.PI,
      });
    }
    if (particles.length > 160) particles.splice(0, particles.length - 160);
    wake();
  }

  function drawStar(p) {
    // A tiny four-pointed glint for glitter.
    const r = p.size * (0.6 + p.life * 0.6);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 ? r * .35 : r * 1.6, a = (Math.PI / 4) * i;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function tick() {
    frame = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.shadowColor = 'rgba(26, 18, 8, .55)'; ctx.shadowBlur = 2;
    particles = particles.filter(p => (p.life -= p.decay) > 0);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= .96; p.vy = p.vy * .96 + .02;
      p.spin += .08;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.colour;
      drawStar(p);
    }
    ctx.globalAlpha = 1;
    // The ring eases toward the pointer and grows in while hovering something clickable.
    // The ring is centred on the cursor's point of contact. With a weapon it never fully disappears.
    ringPos.x += (pointer.x - ringPos.x) * .3; ringPos.y += (pointer.y - ringPos.y) * .3;
    const target = hovering ? 1 : 0;
    ringScale += (target - ringScale) * .22;
    pulse *= .86;
    const scale = ringScale * (1 + pulse * .9);
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    ring.style.opacity = (Math.min(1, ringScale * 1.2) * (1 - pulse * .6)).toFixed(3);
    const busy = particles.length || Math.abs(target - ringScale) > .01 || pulse > .01
      || Math.hypot(pointer.x - ringPos.x, pointer.y - ringPos.y) > .5;
    if (busy) wake();
  }
  function wake() { if (enabled && !frame) frame = requestAnimationFrame(tick); }

  // Native fullscreen and modal dialogs live above ordinary page overlays.
  // CSS fullscreen also has its own high stacking context. Keep all cursor
  // effects together in the visible host rather than only increasing z-index.
  function overlayHost() {
    let modal = null;
    try { modal = document.querySelector('dialog:modal'); } catch (_error) { modal = document.querySelector('dialog[open]'); }
    const fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (modal && (!fullscreen || fullscreen.contains(modal) || modal.contains(target))) return modal;
    const cssFullscreen = document.querySelector('.atlas-map-stage.is-css-fullscreen');
    // A site's sticky header can remain above the CSS fallback's ancestor
    // stacking context. Its controls need the body overlay, not one below it.
    return fullscreen || (cssFullscreen && (!target || cssFullscreen.contains(target)) ? cssFullscreen : document.body);
  }
  function placeOverlay() {
    const host = overlayHost();
    if ([canvas, ring, glint].some(node => node.parentElement !== host)) {
      setShine(false);
      host.append(canvas, ring, glint);
    }
  }
  function updateHover(target) {
    hovering = Boolean(target?.closest?.(CLICKABLE));
    glint.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    setShine(hovering);
  }
  function refreshOverlay() {
    setShine(false); placeOverlay(); resize();
    updateHover(document.elementFromPoint(pointer.x, pointer.y)); wake();
  }

  addEventListener('pointermove', event => {
    if (!enabled || event.pointerType === 'touch') return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    placeOverlay();
    if (ringScale < .02) { ringPos.x = pointer.x; ringPos.y = pointer.y; }
    updateHover(event.target);
    // Leave a glint every few pixels travelled, so slow movements stay quiet.
    if (!last || Math.hypot(pointer.x - last.x, pointer.y - last.y) > 12) {
      spawn(pointer.x + (Math.random() - .5) * 4, pointer.y + (Math.random() - .5) * 4);
      last = {x: pointer.x, y: pointer.y};
    }
    wake();
  }, {passive: true});
  addEventListener('pointerdown', event => {
    if (!enabled || event.pointerType === 'touch' || event.button !== 0) return;
    pulse = 1; wake();
    spawn(event.clientX, event.clientY, true);
  }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => { hovering = false; setShine(false); wake(); });
  // Scrolling can move a link out from under a still pointer; let the next move re-check.
  addEventListener('scroll', () => setShine(false), {passive: true});
  addEventListener('resize', refreshOverlay, {passive: true});
  addEventListener('blur', () => { hovering = false; setShine(false); });
  document.addEventListener('fullscreenchange', refreshOverlay);
  document.addEventListener('webkitfullscreenchange', refreshOverlay);
  // Handle dialog changes and removal/replacement of the active host, including
  // a fullscreen transition while the pointer has not moved.
  const hosts = new MutationObserver(records => {
    if (!glint.isConnected || glint.parentElement !== overlayHost() || records.some(record => record.type === 'attributes')) refreshOverlay();
  });
  hosts.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['open']});
  const atlasStage = document.getElementById('atlas-map-stage');
  if (atlasStage) hosts.observe(atlasStage, {attributes: true, attributeFilter: ['class']});
  osReduced.addEventListener?.('change', readPrefs);
  // The accessibility panel announces every preference change (including weapon and motion).
  addEventListener('tg-a11y-change', readPrefs);
  resize(); readPrefs();
})();
