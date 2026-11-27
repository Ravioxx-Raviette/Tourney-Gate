/** Small, dependency-free controllers shared by the campaign and its tests. */
export function effectiveMotion({ root = globalThis.document?.documentElement, media = matchMedia('(prefers-reduced-motion: reduce)'), events = globalThis.window } = {}) {
  const listeners = new Set();
  const preference = { get matches() { return Boolean(media.matches || root?.classList?.contains('a11y-motion')); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { media.removeEventListener?.('change', changed); events?.removeEventListener?.('tg-a11y-change', changed); listeners.clear(); } };
  const changed = () => listeners.forEach(fn => fn(preference.matches));
  media.addEventListener?.('change', changed);
  events?.addEventListener?.('tg-a11y-change', changed);
  return preference;
}

export const UNIT_SIZE_RATIOS = Object.freeze({ low: 0.25, medium: 0.5, high: 0.75, ultra: 1 });
export const DEFAULT_UNIT_SIZE = 'medium';

export function normalizeUnitSize(value) {
  return Object.prototype.hasOwnProperty.call(UNIT_SIZE_RATIOS, value) ? value : DEFAULT_UNIT_SIZE;
}

export function effectiveUnitSize({ root = globalThis.document?.documentElement, events = globalThis.window } = {}) {
  const listeners = new Set();
  const read = () => normalizeUnitSize(root?.dataset?.a11yUnitSize);
  let last = read();
  const preference = {
    get value() { return read(); },
    get ratio() { return UNIT_SIZE_RATIOS[read()]; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { events?.removeEventListener?.('tg-a11y-change', changed); listeners.clear(); },
  };
  const changed = () => {
    const next = read();
    if (next === last) return;
    last = next;
    listeners.forEach(fn => fn(next, UNIT_SIZE_RATIOS[next]));
  };
  events?.addEventListener?.('tg-a11y-change', changed);
  return preference;
}

export function campaignShortcut(event, { focused, fullscreen, strategic }) {
  const target = event.target;
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing ||
      target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  if (!focused && !fullscreen) return null;
  const key = event.key.toLowerCase();
  if (key === 'escape') return 'escape';
  if (strategic) return null;
  if (fullscreen && ['w','a','s','d','q','e','shift'].includes(key)) return key;
  if (event.repeat) return null;
  if (['t','u','n'].includes(key)) return key;
  return fullscreen && key === 'h' ? key : null;
}

export function createFrameLoop({ frame, active = () => true, request = requestAnimationFrame, cancel = cancelAnimationFrame, onError = error => { throw error; } }) {
  let id = null, last = null, disposed = false;
  function tick(time) {
    id = null;
    if (disposed || !active()) { last = null; return; }
    const dt = last === null ? 0 : Math.max(0, Math.min((time - last) / 1000, .05));
    last = time;
    try { frame(dt, time); }
    catch (error) { last = null; onError(error); return; }
    if (!disposed && active()) id = request(tick); else last = null;
  }
  return {
    resume() { if (!disposed && id === null && active()) { last = null; id = request(tick); } },
    pause() { if (id !== null) cancel(id); id = null; last = null; },
    dispose() { this.pause(); disposed = true; },
  };
}

/** One user command per painted transition. Click/key bursts never form a queue. */
export function createCampaignCommands({ execute, onBusy = () => {} }) {
  let command = null, stage = 'idle', disposed = false;
  const clear = () => {
    command = null;
    if (stage !== 'idle') { stage = 'idle'; onBusy(false); }
  };
  return {
    request(value) {
      if (disposed || stage !== 'idle') return false;
      command = value; stage = 'queued'; onBusy(true); return true;
    },
    beginFrame() {
      // Paint the busy feedback once before running potentially expensive work.
      if (stage === 'queued') { stage = 'ready'; return false; }
      if (stage !== 'ready') return false;
      stage = 'executing';
      try { execute(command); }
      catch (error) { clear(); throw error; }
      return true;
    },
    finishFrame() { if (stage === 'executing') clear(); },
    cancel: clear,
    dispose() { clear(); disposed = true; },
    get busy() { return stage !== 'idle'; },
  };
}

export function createCampaignLoader({ load, onState = () => {}, onError = () => {}, onChange = () => {} }) {
  let module, flight, viewer, wanted = false, suspended = false, disposed = false;
  function apply() {
    if (disposed) return;
    viewer?.setMode(wanted ? '3d' : '2d');
    if (wanted && !suspended) viewer?.resume(); else viewer?.pause();
    onState(wanted ? (viewer ? '3d' : 'loading') : '2d');
  }
  const controller = {
    async set3D(enabled) {
      if (disposed) return;
      wanted = Boolean(enabled); apply(); onChange(wanted);
      if (!wanted || viewer) return;
      if (!flight) flight = (async () => {
        module ||= await load();
        if (disposed || !wanted) return;
        const mounted = await module.mountAtlas3D({
          onMode: mode => { if (wanted !== (mode === '3d')) controller.set3D(mode === '3d'); },
          onError: error => controller.fail(error),
        });
        if (disposed) { mounted?.dispose(); return; }
        if (!mounted) throw new Error('3D could not start. The illustrated map is still available.');
        viewer = mounted;
      })().finally(() => { flight = null; });
      try { await flight; apply(); }
      catch (error) { controller.fail(error); }
    },
    fail(error) {
      if (disposed) return;
      wanted = false; viewer?.dispose(); viewer = null;
      onState('error'); onChange(false); onError(error);
    },
    pause() { suspended = true; viewer?.pause(); },
    resume() { if (disposed) return; suspended = false; apply(); },
    dispose() { if (disposed) return; disposed = true; viewer?.dispose(); viewer = null; },
    get active() { return wanted; },
  };
  return controller;
}
