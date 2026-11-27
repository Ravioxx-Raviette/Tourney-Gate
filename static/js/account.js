'use strict';
(() => {
  const {api} = window.TG;
  const dialog = document.getElementById('account-cancel-dialog');
  if (!dialog) return;
  const form = document.getElementById('account-cancel-form');
  const submit = form.querySelector('[type="submit"]');
  const keep = form.querySelector('[data-keep-booking]');
  const error = document.getElementById('account-cancel-error');
  const result = document.getElementById('account-booking-result');
  let selected, pending = false;
  document.querySelectorAll('[data-cancel-booking]').forEach(button => {
    button.addEventListener('click', () => {
      if (pending) return;
      selected = button; error.hidden = true; error.textContent = ''; result.textContent = '';
      document.getElementById('account-cancel-event').textContent = button.dataset.eventTitle;
      dialog.showModal(); keep.focus();
    });
  });
  keep.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !selected) return;
    pending = true; submit.disabled = true; keep.disabled = true;
    form.setAttribute('aria-busy', 'true'); error.hidden = true;
    const button = selected;
    try {
      await api(`/api/bookings/${encodeURIComponent(button.dataset.cancelBooking)}/cancel`, {method: 'POST', body: '{}'});
      const row = button.closest('[data-booking-id]');
      row.querySelector('.account-status').textContent = 'Cancelled';
      dialog.close(); button.remove();
      row.querySelector('a[href]')?.focus({preventScroll: true});
      result.textContent = 'Booking cancelled. Your tickets are available again.';
      selected = null;
    } catch (problem) {
      error.textContent = problem.message; error.hidden = false;
    } finally {
      pending = false; submit.disabled = false; keep.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
