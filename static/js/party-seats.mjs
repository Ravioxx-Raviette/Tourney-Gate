import {seatPreviewPose, previewCandidates, ownPreviewSeats} from './seat-layout.mjs';

/** Find a contiguous run in a modeled row/wing; never infer adjacency from IDs. */
export function findPartySeats(event, tierId, count, budget, booking = null) {
  const tier = event.tiers.find(t => t.id === tierId);
  if (!tier || !Number.isInteger(count) || count < 1 || count > Math.min(8,tier.max_per_order)
      || event.status !== 'upcoming' || event.start_at <= event.server_time
      || (budget !== null && (!Number.isSafeInteger(budget) || budget < 0))) return null;
  const total = tier.price * count;
  if (budget !== null && total > budget) return null;
  const seats = previewCandidates(event, ownPreviewSeats(event,booking)).filter(s => s.tier_id === tierId);
  const royal = tier.name.toLowerCase() === 'royal box', rowsPerSide = royal ? 1 : tier.name.toLowerCase() === 'noble stand' ? 4 : 10;
  const groups = [];
  for (const first of seats) {
    const run = Array.from({length:count},(_,i)=>seats.find(s => s.row === first.row && s.section === first.section && s.number === first.number+i));
    if (run.some(s=>!s)) continue;
    const pose=seatPreviewPose(event,tier,first);
    if(run.some(s=>seatPreviewPose(event,tier,s).segment!==pose.segment))continue;
    const row = first.row.charCodeAt(0)-65;
    groups.push({ids:run.map(s=>s.id),total,row:first.row,numbers:run.map(s=>s.number),
      score:(row%rowsPerSide)*100 + Math.abs((first.number+run.at(-1).number)/2-5.5),side:pose.label});
  }
  groups.sort((a,b)=>a.score-b.score || a.row.localeCompare(b.row) || a.numbers[0]-b.numbers[0]);
  return groups[0] || null;
}
