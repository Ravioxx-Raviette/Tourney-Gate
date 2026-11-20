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
  let viewer = null, opener = null, active = 'A', slots = {A: null, B: null}, yaw = 0, pitch = 0, zoom = 1, overview = false;
  const resetLook = () => { yaw = 0; pitch = 0; zoom = 1; };
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
      viewer.setSeatPose(view, yaw, pitch, zoom); overview = false; stage.classList.remove('is-overview');
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
    opener = trigger; slots = {A: Number(trigger.dataset.seatPreview), B: null}; active = 'A'; resetLook();
    dialog.showModal(); refreshPicker(); showSeat();
    if(trigger.id==='party-preview' && viewer) $('[data-preview-overview]').click();
    dialog.querySelector('[data-preview-close]').focus();
  };
  picker.addEventListener('change', () => {
    slots.B = picker.value ? Number(picker.value) : null;
    active = slots.B ? 'B' : 'A'; resetLook(); showSeat();
  });
  $$('[data-preview-slot]').forEach(button => button.addEventListener('click', () => {
    active = button.dataset.previewSlot; resetLook(); showSeat();
  }));
  // Look around from the seat by dragging (or arrow keys); zoom with the buttons, wheel, or +/-.
  const clampLook = () => {
    yaw = Math.max(-Math.PI * .6, Math.min(Math.PI * .6, yaw));
    pitch = Math.max(-.45, Math.min(.45, pitch));
    zoom = Math.max(1, Math.min(3.5, zoom));
  };
  function applyLook() {
    const view = pose(seat(slots[active]));
    if (!viewer || !view || overview) return;
    clampLook(); viewer.setSeatPose(view, yaw, pitch, zoom);
  }
  function zoomBy(direction) {
    if (!viewer) return;
    if (overview) { viewer.dollyOverview(direction > 0 ? .8 : 1.25); return; }
    zoom *= direction > 0 ? 1.25 : .8; applyLook();
  }
  $$('[data-preview-zoom]').forEach(button => button.addEventListener('click', () => zoomBy(button.dataset.previewZoom === 'in' ? 1 : -1)));
  let drag = null;
  stage.tabIndex = 0;
  stage.addEventListener('pointerdown', action => {
    if (overview || !viewer || action.button !== 0) return;
    drag = {x: action.clientX, y: action.clientY, yaw, pitch};
    stage.setPointerCapture?.(action.pointerId); stage.classList.add('is-looking');
  });
  stage.addEventListener('pointermove', action => {
    if (!drag) return;
    // Scale by the field of view so the scene follows the pointer at any zoom level.
    const radiansPerPixel = (viewer.camera.fov * Math.PI / 180) / Math.max(1, stage.clientHeight);
    yaw = drag.yaw - (action.clientX - drag.x) * radiansPerPixel;
    pitch = drag.pitch + (action.clientY - drag.y) * radiansPerPixel;
    applyLook();
  });
  const endDrag = () => { drag = null; stage.classList.remove('is-looking'); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', action => {
    if (overview || !viewer) return;
    action.preventDefault(); zoom *= Math.exp(-Math.max(-120, Math.min(120, action.deltaY)) * .0025); applyLook();
  }, {passive: false});
  stage.addEventListener('keydown', action => {
    const step = Math.PI / 36, keys = {ArrowLeft: () => { yaw -= step; }, ArrowRight: () => { yaw += step; }, ArrowUp: () => { pitch += step; }, ArrowDown: () => { pitch -= step; }};
    if (keys[action.key] && !overview) { action.preventDefault(); keys[action.key](); applyLook(); }
    else if (action.key === '+' || action.key === '=') { action.preventDefault(); zoomBy(1); }
    else if (action.key === '-') { action.preventDefault(); zoomBy(-1); }
  });
  $('[data-preview-reset]').addEventListener('click', () => { resetLook(); showSeat(); });
  $('[data-preview-overview]').addEventListener('click', () => {
    const value = seat(slots[active]); if (viewer && pose(value)) { overview = true; stage.classList.add('is-overview'); } if (viewer && pose(value)) viewer.setSeatOverview(pose(value),(window.TG.partySuggestion||[]).map(id=>pose(seat(id))).filter(Boolean));
  });
  document.addEventListener('tg:party-highlight',()=>{if(viewer?.partyMarkers)viewer.partyMarkers.visible=false;});
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
