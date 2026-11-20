/* Keep a usable error/return path even if a 3D module cannot be loaded. */
(() => {
  const dialog = document.getElementById('seat-preview-dialog');
  if (!dialog) return;
  const ready = import('./seat-preview.js').then(module => module.openSeatPreview).catch(() => null);
  let opening = false, fallbackOpener = null, fallbackWired = false;
  document.addEventListener('click', async action => {
    const trigger = action.target.closest('[data-seat-preview]');
    if (!trigger || trigger.disabled || opening) return;
    opening = true;
    try {
      const open = await ready;
      if (open) { open(trigger); return; }
      fallbackOpener = trigger;
      const error = dialog.querySelector('#seat-preview-error');
      error.textContent = 'The 3D preview could not load. You can still book using the seat map.';
      error.hidden = false;
      dialog.querySelectorAll('.seat-preview-tools button,[data-preview-slot],select').forEach(node => { node.disabled = true; });
      if (!fallbackWired) {
        fallbackWired = true;
        dialog.querySelectorAll('[data-preview-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
        dialog.addEventListener('close', () => {
          const replacement = document.querySelector(`.tier-tab[aria-pressed="true"]`);
          (fallbackOpener?.isConnected && !fallbackOpener.disabled ? fallbackOpener : replacement)?.focus();
        });
      }
      dialog.showModal(); dialog.querySelector('[data-preview-close]').focus();
    } finally { opening = false; }
  });
})();
