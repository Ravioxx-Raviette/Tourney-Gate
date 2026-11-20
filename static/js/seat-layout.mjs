/** Shared coordinates for the Royal Lists model and numbered-seat previews. */
export function royalSeatPosition(kind, row, number) {
  const perSide = {royal: 1, noble: 4, commoner: 10}[kind];
  if (!perSide || !/^[A-Z]$/.test(row) || !Number.isInteger(number) || number < 1 || number > 10) return null;
  const index = row.charCodeAt(0) - 65;
  if (index >= perSide * 2) return null;
  const side = index < perSide ? -1 : 1, r = index % perSide, s = number - 1;
  const rotY = side < 0 ? 0 : Math.PI;
  if (kind === 'royal') return {x: -6.3 + s * 1.4, y: 0.92, z: side * 4.3, rotY};
  if (kind === 'noble') return {
    x: s < 5 ? -7.65 + s * 1.62 : 1.17 + (s - 5) * 1.62,
    y: 1.88 + (r + 1) * 0.38 + 0.11,
    z: side * (5.1 + 0.18 + ((7.45 - 5.1 - 0.18) / 4) * (r + 0.5)), rotY,
  };
  return {
    x: s < 5 ? -9.3 + s * 1.85 : 1.9 + (s - 5) * 1.85,
    y: 3.68 + (r + 1) * 0.37 + 0.175,
    z: side * (7.7 + 0.16 + ((12.3 - 7.7 - 0.16) / 10) * (r + 0.5)), rotY,
  };
}

export function seatPreviewPose(event, tier, seat) {
  if (!event || !tier || !seat || event.venue !== 'The Royal Lists' || event.layout_type !== 'stands'
      || !['Joust', 'Grand Melee'].includes(event.category) || tier.kind !== 'seated'
      || seat.tier_id !== tier.id || seat.status === 'retired') return null;
  const kind = {'royal box': 'royal', 'noble stand': 'noble', "commoner's bench": 'commoner'}[tier.name.toLowerCase().replaceAll('’', "'")];
  const section = {royal: 'Royal', noble: 'Noble', commoner: 'Bench'}[kind];
  if (!kind || seat.section !== section) return null;
  const p = royalSeatPosition(kind, seat.row, seat.number);
  return p ? {slug: event.category === 'Joust' ? 'silver-lance' : 'five-banners',
    position: [p.x, p.y + 0.75, p.z], target: [0, 1, 0], fov: 60} : null;
}

export function previewCandidates(event, ownSeats = new Set()) {
  return (event.seats || []).filter(seat => (seat.status === 'available' || (seat.status === 'held' && ownSeats.has(seat.id)))
    && seatPreviewPose(event, event.tiers.find(tier => tier.id === seat.tier_id), seat));
}

export function ownPreviewSeats(event, booking) {
  if (!booking || booking.status !== 'pending' || booking.expires_at <= event.server_time
      || event.status !== 'upcoming') return new Set();
  const ids = new Set(booking.items.filter(item => item.seat_id).map(item => item.seat_id));
  return new Set((event.seats || []).filter(seat => seat.status === 'held' && ids.has(seat.id)).map(seat => seat.id));
}
