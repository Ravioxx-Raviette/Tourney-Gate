'use strict';
/* Accessibility & armory panel.
   Preferences live in localStorage ('tg-a11y') and are applied to <html> by the inline head
   script before first paint (see base.html), so pages never flash at the wrong size.
   This file wires up the panel and builds the weapon cursors. */
(() => {
  const KEY = 'tg-a11y';
  const root = document.documentElement;
  const TEXT_STEPS = ['Default', 'Large', 'Larger', 'Largest'];
  const FLAGS = ['contrast', 'spacing', 'font', 'links', 'focus', 'motion', 'bigcursor'];

  // ---------- Weapon cursors ----------
  // Every weapon is drawn on a 32×32 grid with its striking point at (2,2), the hotspot.
  // A pale halo sits under a dark outline so each cursor stays visible on parchment and on night blue.
  const STEEL = '#dfe6eb', GILT = '#d4a94a', WOOD = '#8a5a2b', WINE = '#9e2b35', DARK = '#1a1208';
  // The armory's palette, taken from the flail: aged bronze for blades and heads, dark iron for
  // fittings, dark leather for wraps and grips, and a pale sheen for edges and strings.
  const BRONZE = '#7d6a55', BRONZE_DARK = '#6a5a48', IRON = '#5d5d5d', CHAIN = '#6b6b6b', LEATHER = '#4a2c14', SHEEN = '#d8c8b0';
  // Grooves and highlights on the metal (sword fuller, axe edge, flail ball): a deeper bronze, not a pale line.
  const GROOVE = '#4f4234';
  const WEAPONS = {
    sword: {
      name: 'Knight’s sword',
      draw: () => `<path d="M2 2 7.5 3.6 21.5 17.6 17.6 21.5 3.6 7.5Z" fill="${BRONZE}"/><path d="M5 5 19 19" stroke="${GROOVE}" stroke-width=".8" fill="none"/><path d="M14 25 25 14" stroke="${IRON}" stroke-width="3"/><path d="M21.5 21.5 27 27" stroke="${LEATHER}" stroke-width="3"/><circle cx="28.3" cy="28.3" r="2.3" fill="${IRON}"/>`,
    },
    axe: {
      name: 'Battle axe',
      // Bearded axe: a blocky head with a top spike, the blade sweeping down-left; it strikes with the blade's top corner.
      hot: [2, 8],
      draw: () => `<path d="M13.4 11 27.2 28.9 29.3 25.6 15.6 10.2Z" fill="${WOOD}"/><path d="M2 8.3C2.8 13.5 6.5 17.5 11.3 18.7L11.2 14C11.2 12.6 12.2 11.8 13.9 11.7L14.7 11 17.9 9.2 14.4 2.8 11 4.4 9.5 2.1 8.5 2.7 9.2 5C8.6 7 6 8.6 2 8.3Z" fill="${BRONZE}"/><path d="M3.6 9.8C4.2 12.8 6.4 15.4 9.8 16.8" stroke="${GROOVE}" stroke-width=".9" fill="none"/><path d="M23.8 23.9 25.9 22.3M25.1 25.5 27.2 23.9" stroke="${LEATHER}" stroke-width="1.4"/>`,
    },
    bow: {
      name: 'Longbow',
      draw: () => `<path d="M26.5 6.5Q9.5 9.5 6.5 26.5" fill="none" stroke="${WOOD}" stroke-width="2.6"/><path d="M26.5 6.5 22.5 22.5 6.5 26.5" fill="none" stroke="${SHEEN}" stroke-width=".9"/><path d="M4 4 22.5 22.5" stroke="#c9a46a" stroke-width="1.8"/><path d="M2 2 9.5 4 4 9.5Z" fill="${BRONZE}"/><path d="M19 22 22.5 22.5 22 19 19.5 19.5Z" fill="${LEATHER}"/>`,
    },
    javelin: {
      name: 'Javelin',
      draw: () => `<path d="M8 8 30 30" stroke="${WOOD}" stroke-width="2.4"/><path d="M2 2 8.4 4.3 11 11 4.3 8.4Z" fill="${BRONZE}"/><path d="M15 17.5 17.5 15M17 19.5 19.5 17" stroke="${LEATHER}" stroke-width="1.6"/><path d="M27 30.5 30.5 27" stroke="${IRON}" stroke-width="2"/>`,
    },
    mace: {
      name: 'Morning star',
      // A flail: a leather-wrapped wooden haft with iron caps, a chain hanging from its head end, and a
      // spiked bronze ball. Its point of contact is the tip of the iron cap's left prong, at the top.
      hot: [5.6, 1.6],
      draw: () => `<path d="M9.5 5.5 29 23.5" stroke="${WOOD}" stroke-width="3.4"/>` +
        `<path d="M12.25 10.35 14.55 7.85M16.15 13.95 18.45 11.45M20.05 17.55 22.35 15.05M23.95 21.15 26.25 18.65" stroke="${LEATHER}" stroke-width="1.2"/>` +
        `<path d="M6.5 4.5 10 2.6 11.6 6 8 7.8Z" fill="${IRON}"/><path d="M7.2 3.6 5.6 1.6M9.4 2.9 9.6 1" stroke="${IRON}" stroke-width="1.1"/><circle cx="29.3" cy="23.8" r="1.6" fill="${IRON}"/>` +
        `<g fill="none" stroke="${CHAIN}" stroke-width=".9"><ellipse cx="8.4" cy="8.9" rx=".9" ry="1.3"/><ellipse cx="8.7" cy="11.4" rx=".45" ry="1.3"/><ellipse cx="9" cy="13.9" rx=".9" ry="1.3"/><ellipse cx="9.2" cy="16.4" rx=".45" ry="1.3"/><ellipse cx="9.4" cy="18.9" rx=".9" ry="1.3"/></g>` +
        `<g transform="translate(9.6 24) scale(1.12) translate(-9.6 -24)"><path d="M6 23 3.2 24.2 6.1 25.2ZM7.2 26.8 5.6 29.6 8.4 27.6ZM10.2 27.7 10.6 30.9 11.6 27.4ZM13.1 23.2 16 23.8 13.2 24.9ZM12.2 21.2 14 18.9 11.2 20.4ZM7.2 21.1 5.2 19.3 6.4 22Z" fill="${BRONZE_DARK}"/>` +
        `<circle cx="9.6" cy="24" r="3.7" fill="${BRONZE}"/><circle cx="8.4" cy="22.8" r="1.1" fill="${GROOVE}" opacity=".7"/></g>`,
    },
  };

  // The outline comes from a filter: a thin dark edge traced around the whole silhouette.
  const ARROW = {draw: m => `<path d="M2 2v21.5l5.6-5.3 3.7 8.4 3.6-1.6-3.7-8.2H18Z" fill="${m === STEEL ? '#fffaf0' : m}" stroke="${DARK}" stroke-width="1.2"/>`};
  // Over anything clickable, every weapon gives way to a heater shield (crimson field, gold rim and
  // cross). Its point of contact is the shield's top-left corner, where the hover shine appears.
  const SHIELD = {
    // Drawn at 90% and centred so the rim and outline aren't clipped by the cursor's 32px box.
    hot: [5.2, 5.2],
    draw: () => `<g transform="translate(1.6 1.6) scale(.9)"><path d="M4 3.5 16 1.5 28 3.5V14c0 8-5 13.4-12 16.5C9 27.4 4 22 4 14Z" fill="${WINE}" stroke="${GILT}" stroke-width="2"/><path d="M16 6.5v18.5M9.5 12.5h13" stroke="${GILT}" stroke-width="2.4"/><path d="M7 6.2 13 5.2" stroke="#fff" stroke-width="1" opacity=".45"/></g>`,
  };
  const SPECIAL = {arrow: ARROW, shield: SHIELD};
  const artFor = (id, metal) => (SPECIAL[id] || WEAPONS[id]).draw(metal);
  function weaponSvg(id, ready, size = 32, fid = "o") {
    const art = artFor(id, STEEL);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
      `<filter id="${fid}" x="-10%" y="-10%" width="120%" height="120%">` +
      `<feMorphology in="SourceAlpha" operator="dilate" radius=".85" result="d"/><feFlood flood-color="${DARK}"/><feComposite in2="d" operator="in" result="line"/><feMerge><feMergeNode in="line"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<g filter="url(#${fid})" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
  }
  function cursorUrl(id, ready, size) {
    const [hx, hy] = ((SPECIAL[id] || WEAPONS[id]) || {}).hot || [2, 2];
    return `url("data:image/svg+xml,${encodeURIComponent(weaponSvg(id, ready, size))}") ${Math.round(hx * size / 32)} ${Math.round(hy * size / 32)}`;
  }

  // ---------- Preferences ----------
  function load() {
    try { return {text: 0, cursor: 'system', ...JSON.parse(localStorage.getItem(KEY) || '{}')}; }
    catch (_error) { return {text: 0, cursor: 'system'}; }
  }
  function save(prefs) { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_error) { /* Storage is optional. */ } }
  function apply(prefs) {
    const step = Math.max(0, Math.min(3, Number(prefs.text) || 0));
    if (step) root.dataset.a11yText = String(step); else delete root.dataset.a11yText;
    FLAGS.forEach(flag => root.classList.toggle(`a11y-${flag}`, !!prefs[flag]));
    // SVG (SMIL) animations, like the fluttering house banner, don't follow CSS; hold them still here.
    const still = !!prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.standard-svg').forEach(svg => {
      if (typeof svg.pauseAnimations !== 'function') return;
      if (still) { svg.pauseAnimations(); svg.setCurrentTime(0); } else svg.unpauseAnimations();
    });
    const chosen = WEAPONS[prefs.cursor] ? prefs.cursor : null;
    root.dataset.armory = chosen || 'system';
    // A large cursor with no weapon chosen uses an enlarged plain arrow.
    const weapon = chosen || (prefs.bigcursor ? 'arrow' : null);
    root.classList.toggle('tg-armed', !!weapon);
    if (weapon) {
      const size = prefs.bigcursor ? 48 : 32;
      root.style.setProperty('--tg-cursor', `${cursorUrl(weapon, false, size)}, auto`);
      // Clickable things: a shield for any weapon; the plain large arrow simply stays an arrow.
      root.style.setProperty('--tg-cursor-ready', `${cursorUrl(weapon === 'arrow' ? 'arrow' : 'shield', false, size)}, pointer`);
    } else {
      root.style.removeProperty('--tg-cursor');
      root.style.removeProperty('--tg-cursor-ready');
    }
    // Let other effects (the cursor trail) react to the change.
    dispatchEvent(new CustomEvent('tg-a11y-change'));
  }

  let prefs = load();
  apply(prefs);
  window.TG_A11Y = {weapons: WEAPONS, weaponSvg, prefs: () => ({...prefs})};

  // ---------- Panel ----------
  const launcher = document.querySelector('[data-a11y-open]');
  const panel = document.getElementById('a11y-panel');
  if (!launcher || !panel) return;
  const textLabel = panel.querySelector('[data-a11y-text-label]');
  const armory = panel.querySelector('[data-armory-list]');

  armory.innerHTML = [['system', 'Plain pointer', weaponSvg('arrow', false, 32, 'armory-arrow').replace('<svg ', '<svg aria-hidden="true" ')],
    ...Object.entries(WEAPONS).map(([id, weapon]) => [id, weapon.name, weaponSvg(id, false, 32, `armory-${id}`).replace('<svg ', '<svg aria-hidden="true" ')])]
    .map(([id, name, art]) => `<label class="armory-option"><input type="radio" name="armory" value="${id}"><span class="armory-art">${art}</span><span class="armory-name">${name}</span></label>`).join('');

  function sync() {
    const step = Number(prefs.text) || 0;
    textLabel.textContent = `${TEXT_STEPS[step]} · ${[100, 115, 130, 150][step]}%`;
    panel.querySelector('[data-a11y-text-down]').disabled = step === 0;
    panel.querySelector('[data-a11y-text-up]').disabled = step === 3;
    // A switch marked data-a11y-invert stores the opposite of what it shows ("on" = no preference saved).
    panel.querySelectorAll('[data-a11y-flag]').forEach(box => { const on = !!prefs[box.dataset.a11yFlag]; box.checked = box.hasAttribute('data-a11y-invert') ? !on : on; });
    armory.querySelectorAll('input').forEach(input => { input.checked = input.value === (WEAPONS[prefs.cursor] ? prefs.cursor : 'system'); });
  }
  function update(change, message) {
    prefs = {...prefs, ...change}; save(prefs); apply(prefs); sync();
    if (message) announce(message);
  }
  const live = panel.querySelector('[data-a11y-live]');
  function announce(message) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); }

  function open() {
    panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); sync();
    panel.querySelector('[data-a11y-close]').focus();
  }
  function close(returnFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    if (returnFocus) launcher.focus();
  }
  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.querySelector('[data-a11y-close]').addEventListener('click', () => close());
  // Escape closes; focus is never trapped — Tab simply moves on past the panel.
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !launcher.contains(event.target)) close(false); });
  // Alt+Shift+A opens the panel from anywhere.
  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyA') { event.preventDefault(); panel.hidden ? open() : close(); }
  });

  panel.querySelector('[data-a11y-text-down]').addEventListener('click', () => { const step = Math.max(0, (Number(prefs.text) || 0) - 1); update({text: step}, `Text size ${TEXT_STEPS[step]}`); });
  panel.querySelector('[data-a11y-text-up]').addEventListener('click', () => { const step = Math.min(3, (Number(prefs.text) || 0) + 1); update({text: step}, `Text size ${TEXT_STEPS[step]}`); });
  panel.querySelectorAll('[data-a11y-flag]').forEach(box => box.addEventListener('change', () => {
    update({[box.dataset.a11yFlag]: box.hasAttribute('data-a11y-invert') ? !box.checked : box.checked}, `${box.closest('label').querySelector('strong').textContent} ${box.checked ? 'on' : 'off'}`);
  }));
  armory.addEventListener('change', event => {
    if (event.target.name !== 'armory') return;
    const id = event.target.value;
    update({cursor: id}, id === 'system' ? 'Plain pointer restored' : `${WEAPONS[id].name} equipped`);
  });
  panel.querySelector('[data-a11y-reset]').addEventListener('click', () => {
    prefs = {text: 0, cursor: 'system'}; save(prefs); apply(prefs); sync(); announce('All settings restored to default');
  });
  sync();
})();
