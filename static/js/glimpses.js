'use strict';
/* Glimpses of the day: open a photo full size in a lightbox.
   Arrow keys / buttons step through the set, Escape or the backdrop closes it, and focus
   returns to the photo that opened it. */
(() => {
  const dialog = document.querySelector('[data-glimpse-lightbox]');
  const grid = document.querySelector('[data-glimpses]');
  if (!dialog || !grid || typeof dialog.showModal !== 'function') return;
  const items = [...grid.querySelectorAll('.glimpse')];
  const img = dialog.querySelector('[data-lightbox-img]');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const credit = dialog.querySelector('[data-lightbox-credit]');
  const count = dialog.querySelector('[data-lightbox-count]');
  let index = 0, opener = null;

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index].dataset;
    dialog.classList.add('is-loading');
    img.onload = () => dialog.classList.remove('is-loading');
    img.onerror = () => dialog.classList.remove('is-loading');
    img.src = item.full; img.alt = item.alt;
    caption.textContent = item.caption;
    credit.textContent = item.credit; credit.href = item.creditUrl;
    count.textContent = `${index + 1} / ${items.length}`;
  }
  items.forEach((item, i) => item.addEventListener('click', () => {
    opener = item; show(i); dialog.showModal();
  }));
  dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  });
  // A click on the dimmed backdrop (outside the photo and buttons) closes the viewer.
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { img.removeAttribute('src'); opener?.focus(); });
})();
