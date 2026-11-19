'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const ease = 'cubic-bezier(.19,1,.22,1)';
  const overlay = $('.page-transition');
  const left = $('.leaf-left');
  const right = $('.leaf-right');
  const mark = $('.transition-mark');
  let leaving = false;
  let pageAnimations = [];

  function resetGate() {
    pageAnimations.forEach(animation => animation.cancel());
    pageAnimations = [];
    overlay.classList.remove('is-active', 'is-leaving');
    document.documentElement.classList.remove('gate-arrival');
    [left, right, mark].forEach(node => node.removeAttribute('style'));
    leaving = false;
  }

  async function openGate() {
    let arrival;
    try {
      arrival = JSON.parse(sessionStorage.getItem('tg-transition') || 'null');
      sessionStorage.removeItem('tg-transition');
    } catch (_error) { /* Browser storage is optional. */ }
    const expected = location.pathname + location.search;
    if (preference.matches || !arrival || arrival.path !== expected || Date.now() - arrival.time > 8000 || !overlay.animate) {
      resetGate();
      return;
    }
    overlay.classList.add('is-active');
    left.style.transform = right.style.transform = 'translateX(0)';
    mark.style.opacity = '1';
    document.documentElement.classList.remove('gate-arrival');
    const options = {duration: 620, easing: ease, fill: 'forwards'};
    pageAnimations = [
      left.animate([{transform:'translateX(0)'},{transform:'translateX(-102%)'}], options),
      right.animate([{transform:'translateX(0)'},{transform:'translateX(102%)'}], options),
      mark.animate([{opacity:1},{opacity:0}], {duration:180,fill:'forwards'}),
      $('#main').animate([{opacity:.25,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}], {duration:640,easing:ease,fill:'both'})
    ];
    await Promise.allSettled(pageAnimations.map(animation => animation.finished));
    // A user may start another navigation before the entrance has finished.
    if (!leaving) resetGate();
  }

  async function navigate(href) {
    const target = new URL(href, location.href);
    if (leaving) return;
    if (preference.matches || !overlay.animate || target.origin !== location.origin) {
      location.assign(target.href);
      return;
    }
    resetGate();
    leaving = true;
    try { sessionStorage.setItem('tg-transition', JSON.stringify({path:target.pathname+target.search,time:Date.now()})); } catch (_error) { /* Navigation still works without storage. */ }
    overlay.classList.add('is-active', 'is-leaving');
    let committed = false;
    const commit = () => { if (!committed) { committed = true; location.assign(target.href); } };
    // The navigation must work even if an animation is interrupted.
    const fallback = setTimeout(commit, 700);
    const options = {duration:210,easing:'cubic-bezier(.65,0,.35,1)',fill:'forwards'};
    pageAnimations = [
      left.animate([{transform:'translateX(-102%)'},{transform:'translateX(0)'}], options),
      right.animate([{transform:'translateX(102%)'},{transform:'translateX(0)'}], options),
      mark.animate([{opacity:0},{opacity:1}], {duration:160,delay:65,fill:'forwards'})
    ];
    await Promise.allSettled(pageAnimations.map(animation => animation.finished));
    clearTimeout(fallback);
    commit();
  }
  window.TG.navigate = navigate;
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self') || preference.matches) return;
    const target = new URL(anchor.href, location.href);
    if (!['http:','https:'].includes(target.protocol) || target.origin !== location.origin || (target.pathname === location.pathname && target.search === location.search)) return;
    event.preventDefault();
    navigate(target.href);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) resetGate(); });
  preference.addEventListener('change', () => {
    // Do not cancel the intended navigation if reduced motion is enabled mid-wipe.
    if (!leaving) resetGate();
    if (preference.matches) $$('.button-ripple').forEach(node => node.remove());
  });
  openGate();

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
    details.addEventListener('toggle', () => { if (!animation) desiredOpen = details.open; });
    summary.addEventListener('click', event => {
      if (preference.matches || !details.animate) return;
      event.preventDefault();
      desiredOpen = !desiredOpen;
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
