// Keep the native scrollbar; the fade simply signals that more of the Desk is below.
export function mountScrollCue(viewport, environment = globalThis) {
  const frame = viewport.parentElement, target = environment.window;
  const fonts = environment.document?.fonts;
  let disposed = false;
  const update = () => {
    if (disposed) return;
    frame.classList.toggle('has-more-below', viewport.scrollHeight - viewport.clientHeight - Math.max(0, viewport.scrollTop) > 2);
  };
  const resize = environment.ResizeObserver ? new environment.ResizeObserver(update) : null;
  const observeContent = () => {
    resize?.disconnect();
    resize?.observe(viewport);
    for (const child of viewport.children) resize?.observe(child);
  };
  const mutation = environment.MutationObserver ? new environment.MutationObserver(() => { observeContent(); update(); }) : null;
  observeContent();
  mutation?.observe(viewport, {childList: true, subtree: true, characterData: true});
  viewport.addEventListener('scroll', update, {passive: true});
  const events = ['resize', 'tg-a11y-change', 'pageshow'];
  events.forEach(event => target?.addEventListener(event, update));
  fonts?.addEventListener('loadingdone', update);
  fonts?.ready?.then(update);
  update();
  return () => {
    disposed = true;
    resize?.disconnect(); mutation?.disconnect();
    viewport.removeEventListener('scroll', update);
    events.forEach(event => target?.removeEventListener(event, update));
    fonts?.removeEventListener('loadingdone', update);
  };
}

const viewport = globalThis.document?.getElementById('atlas-preview-content');
if (viewport) mountScrollCue(viewport);
