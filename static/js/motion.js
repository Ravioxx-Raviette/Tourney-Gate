'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const osPreference = matchMedia('(prefers-reduced-motion: reduce)');
  // Honour the OS setting and the site's own "Reduce motion" switch (html.a11y-motion).
  const preference = { get matches() { return osPreference.matches || document.documentElement.classList.contains('a11y-motion'); }, addEventListener: (...args) => osPreference.addEventListener(...args) };
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const ease = 'cubic-bezier(.19,1,.22,1)';
  const overlay = $('.page-transition');
  const left = $('.leaf-left');
  const right = $('.leaf-right');
  const mark = $('.transition-mark');
  // One owner for gate animations, navigation, and interruption cleanup.
  let phase = 'idle', generation = 0, pageAnimations = [];
  let fallbackTimer, cleanupTimer, pendingCommit;
  const arrivalKey = 'tg-transition';
  const route = url => url.pathname + url.search;
  function clearArrival() { try { sessionStorage.removeItem(arrivalKey); } catch (_error) { /* Storage is optional. */ } }
  function resetGate() {
    generation++;
    clearTimeout(fallbackTimer); clearTimeout(cleanupTimer);
    const animations = pageAnimations; pageAnimations = [];
    animations.forEach(animation => animation.cancel());
    overlay.classList.remove('is-active', 'is-leaving');
    document.documentElement.classList.remove('gate-arrival');
    [left, right, mark].forEach(node => node.removeAttribute('style'));
    phase = 'idle'; pendingCommit = null;
  }
  function playGate(node,frames,options) {
    const animation=node.animate(frames,options);
    pageAnimations.push(animation);
    animation.finished.catch(() => {});
    return animation;
  }
  async function openGate() {
    let arrival;
    try { arrival = JSON.parse(sessionStorage.getItem(arrivalKey) || 'null'); } catch (_error) { /* Storage is optional. */ }
    clearArrival();
    const age = Date.now() - arrival?.time;
    // A link may be redirected (e.g. /admin -> /admin/login); the browser reports that, so the
    // gate still opens on the page the visitor actually reached.
    let redirected = false;
    try { redirected = (performance.getEntriesByType('navigation')[0]?.redirectCount || 0) > 0; } catch (_error) { /* Older browsers: exact path only. */ }
    const valid = arrival?.kind === 'faire-gate' && (arrival.path === route(location) || redirected) && age >= 0 && age <= 5000;
    // The arrival already started in CSS at first paint (see faire-polish.css). Follow those
    // animations rather than restarting them, so the opening never waits on page scripts.
    const running = valid && !preference.matches && document.documentElement.classList.contains('gate-arrival') && typeof document.getAnimations === 'function'
      ? document.getAnimations().filter(animation => [left, right, mark].includes(animation.effect?.target)) : [];
    if (running.length) {
      phase = 'arriving'; const token = generation;
      overlay.classList.add('is-active');
      pageAnimations.push(...running);
      cleanupTimer = setTimeout(() => { if (token === generation) resetGate(); }, 2800);
      try { await Promise.allSettled(running.map(animation => animation.finished)); }
      finally { if (token === generation) resetGate(); }
      return;
    }
    resetGate();
    if (preference.matches || !valid || !overlay.animate) return;
    phase = 'arriving'; const token = generation;
    overlay.classList.add('is-active');
    left.style.transform = 'translateY(0)'; right.style.opacity = '1'; mark.style.opacity = '1';
    cleanupTimer = setTimeout(() => { if (token === generation) resetGate(); }, 2800);
    try {
      // The portcullis holds briefly on the crest, then winches up; the gatehouse fades away.
      playGate(left,[{transform:'translateY(0)'},{transform:'translateY(calc(-100% - 40px))'}], {duration:1000,delay:1000,easing:'cubic-bezier(.45,0,.2,1)',fill:'both'});
      playGate(right,[{opacity:1},{opacity:0}], {duration:500,delay:1500,fill:'both'});
      playGate(mark,[{opacity:1},{opacity:0}], {duration:450,delay:1050,fill:'both'});
      playGate($('#main'),[{opacity:.7,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}], {duration:700,delay:1100,easing:ease,fill:'both'});
      await Promise.allSettled(pageAnimations.map(animation => animation.finished));
    } finally { if (token === generation) resetGate(); }
  }
  async function navigate(href) {
    if (phase === 'leaving') return;
    const target = new URL(href, location.href);
    resetGate();
    if (preference.matches || !overlay.animate || target.origin !== location.origin || route(target) === route(location)) {
      clearArrival(); location.assign(target.href); return;
    }
    phase = 'leaving'; const token = generation; let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true; clearTimeout(fallbackTimer); pendingCommit = null;
      try {
        if (preference.matches) clearArrival();
        else sessionStorage.setItem(arrivalKey, JSON.stringify({kind:'faire-gate',path:route(target),time:Date.now()}));
      } catch (_error) { /* Native navigation still works. */ }
      // If loading is stopped, uncover this document and allow another navigation.
      cleanupTimer = setTimeout(() => { if (token === generation) { clearArrival(); resetGate(); } }, 1500);
      location.assign(target.href);
    };
    pendingCommit = commit;
    overlay.classList.add('is-active', 'is-leaving');
    fallbackTimer = setTimeout(commit, 1100);
    try {
      // The portcullis drops under its own weight, slams a few pixels past its seat (hidden under the
      // stone lintel) and settles. It never lifts back up, so the page beneath is never uncovered.
      playGate(left,[{transform:'translateY(calc(-100% - 40px))',easing:'cubic-bezier(.55,0,1,.45)'},{transform:'translateY(10px)',offset:.8,easing:'ease-out'},{transform:'translateY(0)'}], {duration:640,fill:'both'});
      playGate(right,[{opacity:0},{opacity:1}], {duration:260,fill:'both'});
      playGate(mark,[{opacity:0},{opacity:1}], {duration:320,delay:240,fill:'both'});
      await Promise.allSettled(pageAnimations.map(animation => animation.finished));
    } catch (_error) { /* The navigation fallback does not depend on animation support. */ }
    finally { if (token === generation) commit(); }
  }
  window.TG.navigate = navigate;
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self') || preference.matches) return;
    const target = new URL(anchor.href, location.href);
    // Already on the home page: "Home" (or the crest) glides back to the top instead of reloading.
    if (target.origin === location.origin && target.pathname === '/' && location.pathname === '/' && !target.search && !location.search && !target.hash) {
      event.preventDefault();
      if (location.hash) history.replaceState(history.state, '', '/');
      window.scrollTo({top:0, behavior:preference.matches ? 'auto' : 'smooth'});
      return;
    }
    if (!['http:','https:'].includes(target.protocol) || target.origin !== location.origin || route(target) === route(location)) return;
    event.preventDefault(); navigate(target.href);
  });
  // While leaving, keep the closed gate up until the next page replaces this one; resetting here could
  // uncover the old page for a frame. A page restored from the back/forward cache is reset on pageshow.
  window.addEventListener('pagehide', () => { if (phase === 'leaving' && !pendingCommit) return; resetGate(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearArrival(); resetGate(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'arriving') resetGate(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && phase !== 'idle') { clearArrival(); resetGate(); } });
  preference.addEventListener('change', () => {
    if (preference.matches) {
      const commit = pendingCommit;
      resetGate(); clearArrival(); commit?.();
      $$('.button-ripple').forEach(node => node.remove());
    }
  });
  openGate().catch(resetGate);

  /* One requestAnimationFrame for the progress strip and sticky header state. */
  const progress = $('.scroll-progress>span');
  const header = $('.site-header');
  let scrollScheduled = false;
  function updateScroll() {
    const range = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1,scrollY/range) : 0})`;
    header.classList.toggle('is-scrolled', scrollY > 30);
    scrollScheduled = false;
  }
  addEventListener('scroll', () => {
    if (!scrollScheduled) { requestAnimationFrame(updateScroll); scrollScheduled = true; }
  }, {passive:true});
  addEventListener('resize', updateScroll);
  updateScroll();

  /* Small physical feedback on desktop; touch keeps a stable flat card. */
  $$('.event-card').forEach(card => {
    let pendingFrame = 0;
    card.addEventListener('pointermove', event => {
      if (preference.matches || !finePointer.matches) return;
      if (event.target.closest('.venue-3d-stage, .venue-3d-trigger')) {
        card.style.setProperty('--tilt-x','0deg');
        card.style.setProperty('--tilt-y','0deg');
        return;
      }
      const box = card.getBoundingClientRect();
      const x = (event.clientX-box.left)/box.width-.5;
      const y = (event.clientY-box.top)/box.height-.5;
      cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        card.style.setProperty('--tilt-x',`${x*3.5}deg`);
        card.style.setProperty('--tilt-y',`${-y*3.5}deg`);
        pendingFrame = 0;
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(pendingFrame);
      card.style.setProperty('--tilt-x','0deg');
      card.style.setProperty('--tilt-y','0deg');
    });
  });

  document.addEventListener('pointerdown', event => {
    if (preference.matches || event.button !== 0) return;
    const button = event.target.closest('.button,.category-tab');
    if (!button || button.disabled || !button.animate) return;
    const box = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'button-ripple';
    ripple.setAttribute('aria-hidden','true');
    ripple.style.left = `${event.clientX-box.left}px`;
    ripple.style.top = `${event.clientY-box.top}px`;
    button.append(ripple);
    const animation = ripple.animate([{transform:'scale(0)',opacity:1},{transform:`scale(${Math.max(box.width,box.height)/8})`,opacity:0}], {duration:650,easing:'ease-out'});
    animation.finished.finally(() => ripple.remove()).catch(() => {});
  });

  /* Native details semantics, with cancellable expansion for rapid toggles. */
  $$('.faq-list details').forEach(details => {
    const summary = details.querySelector('summary');
    let animation;
    let desiredOpen = details.open;
    details.addEventListener('toggle', () => { if (!animation) { desiredOpen = details.open; details.dataset.state = details.open ? 'open' : 'closed'; } });
    summary.addEventListener('click', event => {
      if (preference.matches || !details.animate) return;
      event.preventDefault();
      desiredOpen = !desiredOpen;
      // Reflect the new state at once so the +/× icon flips immediately, not after the collapse.
      details.dataset.state = desiredOpen ? 'open' : 'closed';
      const startHeight = details.getBoundingClientRect().height;
      animation?.cancel();
      details.style.height = 'auto';
      details.open = true;
      const style = getComputedStyle(details);
      const closedHeight = summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const endHeight = desiredOpen ? details.getBoundingClientRect().height : closedHeight;
      details.style.overflow = 'hidden';
      const current = details.animate([{height:`${startHeight}px`},{height:`${endHeight}px`}], {duration:380,easing:ease,fill:'forwards'});
      animation = current;
      current.finished.then(() => {
        if (animation !== current) return;
        details.open = desiredOpen;
        details.style.removeProperty('height');
        details.style.removeProperty('overflow');
        current.cancel();
        animation = undefined;
      }).catch(() => {});
    });
    preference.addEventListener('change', () => {
      if (!preference.matches) return;
      animation?.cancel();
      animation = undefined;
      details.open = desiredOpen;
      details.style.removeProperty('height');
      details.style.removeProperty('overflow');
    });
  });
})();
