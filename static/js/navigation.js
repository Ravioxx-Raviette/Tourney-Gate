'use strict';
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const inner = header.querySelector('.header-inner');
  const nav = header.querySelector('#navigation');
  const menu = header.querySelector('.menu-toggle');
  const profile = header.querySelector('.nav-profile');
  const summary = profile?.querySelector('summary');
  const compact = matchMedia('(max-width: 1320px)');

  function closeProfile() {
    if (profile) profile.open = false;
    summary?.setAttribute('aria-expanded', 'false');
  }
  function closeNavigation() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation');
    closeProfile();
  }
  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') !== 'true';
    closeProfile();
    nav.classList.toggle('open', expanded);
    menu.setAttribute('aria-expanded', String(expanded));
    menu.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
    updateMenuHeight();
  });
  profile?.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(profile.open)));
  nav.addEventListener('click', event => { if (event.target.closest('a[href]')) closeNavigation(); });
  document.addEventListener('click', event => {
    if (!profile?.contains(event.target)) closeProfile();
    if (!header.contains(event.target)) closeNavigation();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (profile?.open) {
      closeProfile(); summary.focus(); event.preventDefault();
    } else if (nav.classList.contains('open')) {
      closeNavigation(); menu.focus(); event.preventDefault();
    }
  });
  profile?.addEventListener('focusout', event => {
    if (!profile.contains(event.relatedTarget)) closeProfile();
  });
  window.addEventListener('pagehide', closeNavigation);

  function updateMenuHeight() {
    inner.style.setProperty('--header-bottom', `${Math.max(0, inner.getBoundingClientRect().bottom)}px`);
    document.documentElement.style.setProperty('--sticky-header-offset', `${header.getBoundingClientRect().height + 12}px`);
  }
  function fitNavigation() {
    const previous = header.classList.contains('nav-collapsed');
    let collapsed = compact.matches;
    if (!collapsed) {
      // All desktop items have their natural width (no flex shrink). Measure in
      // this frame, then restore the chosen layout before the browser paints.
      header.classList.add('nav-measuring');
      const last = inner.lastElementChild.getBoundingClientRect();
      collapsed = last.right > inner.getBoundingClientRect().right + .5;
      header.classList.remove('nav-measuring');
    }
    header.classList.toggle('nav-collapsed', collapsed);
    if (previous !== collapsed) {
      const focused = document.activeElement;
      const wasInside = nav.contains(focused) || focused === menu;
      closeNavigation();
      if (wasInside) {
        if (collapsed) menu.focus();
        else nav.querySelector('a[href]')?.focus();
      }
    }
    updateMenuHeight();
  }
  let frame;
  const scheduleFit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitNavigation);
  };
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('tg-a11y-change', scheduleFit);
  window.addEventListener('pageshow', scheduleFit);
  window.addEventListener('scroll', () => { if (nav.classList.contains('open')) updateMenuHeight(); }, {passive: true});
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(inner); observer.observe(nav);
  }
  const cta = header.querySelector('.header-cta');
  if (cta) new MutationObserver(scheduleFit).observe(cta, {childList: true, subtree: true, characterData: true});
  document.fonts?.ready.then(scheduleFit);
  fitNavigation();
})();
