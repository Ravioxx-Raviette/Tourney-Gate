import {Venue3DViewer} from './venue3d.js';
import {seatPreviewPose, previewCandidates, ownPreviewSeats} from './seat-layout.mjs';

export let openSeatPreview = null;

const dialog = document.getElementById('seat-preview-dialog');
if (dialog) {
  const {$, $$, read, money} = window.TG;
  let event = read('event-data');
  const booking = read('booking-data');
  let ownSeats = ownPreviewSeats(event, booking);
  const stateKey = value => JSON.stringify([value.status, value.seats, value.tiers.map(t => [t.id,t.name,t.kind,t.price]), [...ownSeats]]);
  let previousState = stateKey(event);
  let viewer = null, opener = null, active = 'A', slots = {A: null, B: null}, yaw = 0;
  const stage = $('#seat-preview-stage'), picker = $('#seat-preview-compare');
  const seat = id => event.seats.find(value => value.id === id);
  const tier = value => event.tiers.find(valueTier => valueTier.id === value?.tier_id);
  const label = value => `${tier(value)?.name || 'Seat'} · Row ${value.row} · Seat ${value.number}`;
  const pose = value => seatPreviewPose(event, tier(value), value);

  function updatePreviewActions() {
    $$('[data-seat-preview]').forEach(button => {
      const supported = Boolean(pose(seat(Number(button.dataset.seatPreview))));
      button.disabled = !supported;
      button.textContent = supported ? 'See My View' : 'Seat preview unavailable';
      button.classList.toggle('seat-preview-unavailable', !supported);
    });
  }

  function updateDetails() {
    const value = seat(slots[active]);
    if (!value) return;
    const available = value.status === 'available' || (value.status === 'held' && ownSeats.has(value.id));
    $('#seat-preview-details').textContent = `${label(value)} · ${money(tier(value).price)}${available ? '' : ' · No longer available'} · ${active === 'A' ? 'Original seat' : 'Comparison only'}`;
  }

  function refreshPicker() {
    const fragment = document.createDocumentFragment();
    fragment.append(new Option('Choose a seat to compare', ''));
    for (const value of previewCandidates(event, ownSeats)) {
      if (value.id !== slots.A) fragment.append(new Option(`${label(value)} · ${money(tier(value).price)}`, String(value.id)));
    }
    const current = seat(slots.B);
    if (current && ![...fragment.children].some(option => option.value === String(current.id))) {
      const option = new Option(`${label(current)} · No longer available`, String(current.id));
      option.disabled = true; fragment.append(option);
    }
    picker.replaceChildren(fragment); picker.value = current ? String(current.id) : '';
  }

  function showError(message) {
    const error = $('#seat-preview-error'); error.textContent = message; error.hidden = false;
    viewer?.dispose(); viewer = null; stage.replaceChildren();
    $$('.seat-preview-tools button').forEach(button => { button.disabled = true; });
  }

  function showSeat() {
    const value = seat(slots[active]), view = pose(value);
    $$('[data-preview-slot]').forEach(button => {
      const candidate = seat(slots[button.dataset.previewSlot]);
      button.textContent = `Seat ${button.dataset.previewSlot}${candidate ? ': ' + label(candidate) : ''}`;
      button.disabled = !candidate; button.setAttribute('aria-pressed', String(button.dataset.previewSlot === active));
    });
    if (!view) { showError('Seat preview unavailable for this seat. Return to the seat map to choose another.'); return; }
    updateDetails();
    $('#seat-preview-error').hidden = true;
    try {
      if (!viewer) viewer = new Venue3DViewer(stage, view.slug, 'seat');
      viewer.setSeatPose(view, yaw);
      $$('.seat-preview-tools button').forEach(button => { button.disabled = false; });
    } catch (error) {
      showError('The 3D preview could not load. You can still book using the seat map.');
    }
  }

  function close() { dialog.close(); }
  dialog.addEventListener('close', () => {
    viewer?.dispose(); viewer = null; stage.replaceChildren();
    // Polling rebuilds summary buttons, so locate its replacement before restoring focus.
    const replacement = document.querySelector(`[data-seat-preview="${slots.A}"]`);
    const candidates = [opener, replacement, $('.tier-tab[aria-pressed="true"]'), $('#list-view')];
    const target = candidates.find(node => node?.isConnected && !node.disabled && node.getClientRects().length);
    target?.focus();
  });
  $$('[data-preview-close]').forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('click', action => { if (action.target === dialog) close(); });
  openSeatPreview = trigger => {
    opener = trigger; slots = {A: Number(trigger.dataset.seatPreview), B: null}; active = 'A'; yaw = 0;
    dialog.showModal(); refreshPicker(); showSeat();
    dialog.querySelector('[data-preview-close]').focus();
  };
  picker.addEventListener('change', () => {
    slots.B = picker.value ? Number(picker.value) : null;
    active = slots.B ? 'B' : 'A'; yaw = 0; showSeat();
  });
  $$('[data-preview-slot]').forEach(button => button.addEventListener('click', () => {
    active = button.dataset.previewSlot; yaw = 0; showSeat();
  }));
  $$('[data-preview-look]').forEach(button => button.addEventListener('click', () => {
    yaw = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, yaw + Number(button.dataset.previewLook) * Math.PI / 12)); showSeat();
  }));
  $('[data-preview-reset]').addEventListener('click', () => { yaw = 0; showSeat(); });
  $('[data-preview-overview]').addEventListener('click', () => {
    const value = seat(slots[active]); if (viewer && pose(value)) viewer.setSeatOverview(pose(value));
  });
  updatePreviewActions();
  document.addEventListener('tg:seat-state', action => {
    event = action.detail.event;
    ownSeats = ownPreviewSeats(event, action.detail.expired ? null : booking);
    updatePreviewActions();
    const nextState = stateKey(event);
    if (nextState === previousState) return;
    previousState = nextState;
    if (!dialog.open) return;
    refreshPicker();
    if (!pose(seat(slots[active]))) showError('Seat preview unavailable for this seat. Return to the seat map to choose another.');
    else updateDetails();
  });
}
