// Event soundscapes, synthesized live with the Web Audio API: no recordings, no network.
// Realism comes from three things layered under every cue:
//   * a room reverb shaped for each venue (open field, stone arena, great hall),
//   * a crowd bed that murmurs, swells and settles instead of hissing steadily,
//   * physically modelled strings (Karplus-Strong) for the bowstring and the lute.
// Each venue model gets cues that match what happens there:
//   silver-lance   (joust)        hoof clops at the stations, charging hooves, lances splintering, cheers
//   five-banners   (grand melee)  sword clashes, shield blows, distant war cries, war drums
//   iron-colosseum (arena)        duelling blades in a stone bowl, a roaring crowd, the arena drum
//   kings-mark     (archery)      bowstrings, arrows in flight, target hits, birdsong, applause
//   victors-feast  (feast)        a lute, clinking goblets, a busy hall, toasts

const rand = (min, max) => min + Math.random() * (max - min);

const ROOMS = {
  'silver-lance':   {seconds: 1.4, decay: 3.2, wet: .16},  // open tilting field with grandstands
  'five-banners':   {seconds: 1.6, decay: 3.0, wet: .18},
  'iron-colosseum': {seconds: 2.6, decay: 2.2, wet: .30},  // stone bowl: long, bright echoes
  'kings-mark':     {seconds: 0.9, decay: 4.0, wet: .10},  // open green
  'victors-feast':  {seconds: 2.0, decay: 2.6, wet: .26},  // timbered great hall
};

/** Start the venue's cues on `ctx`, mixed into `out`. Returns a function that stops them. */
export function startSoundscape(ctx, out, slug) {
  // Older or test audio contexts may lack these nodes; the plain ambient bed still plays.
  if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createBuffer !== 'function') return () => {};
  const timers = new Set();
  let stopped = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms); timers.add(id); };
  const every = (fn, minMs, maxMs) => { const loop = () => { fn(); later(loop, rand(minMs, maxMs)); }; later(loop, rand(minMs * .3, minMs)); };
  const now = () => ctx.currentTime;
  const rate = ctx.sampleRate;

  // ---- shared sources ----
  const noise = (() => { const b = ctx.createBuffer(1, rate * 2, rate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  // Smooth random wobble (a few Hz) used to make crowds and wind rise and fall like real groups of people.
  const wobble = (() => {
    const b = ctx.createBuffer(1, rate * 8, rate), d = b.getChannelData(0);
    let v = 0, target = 0;
    for (let i = 0; i < d.length; i++) { if (i % Math.floor(rate / 4) === 0) target = Math.random() * 2 - 1; v += (target - v) * (6 / rate); d[i] = v; }
    return b;
  })();

  // ---- room: dry + reverb ----
  const room = ROOMS[slug] || ROOMS['silver-lance'];
  const bus = ctx.createGain(); bus.gain.value = 1.4;
  bus.connect(out);
  if (typeof ctx.createConvolver === 'function') {
    const length = Math.floor(rate * room.seconds), impulse = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, room.decay);
    }
    const verb = ctx.createConvolver(); verb.buffer = impulse;
    const wet = ctx.createGain(); wet.gain.value = room.wet;
    bus.connect(verb); verb.connect(wet); wet.connect(out);
  }
  // Stereo placement helper, so cues come from different spots around the listener.
  const place = (dest = bus) => {
    if (typeof ctx.createStereoPanner !== 'function') return dest;
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-.7, .7); pan.connect(dest); return pan;
  };

  // ---- building blocks ----
  function env(gain, t, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function noiseHit(t, {type = 'bandpass', freq = 1000, q = 1, peak = .3, attack = .004, decay = .2, sweepTo = null, dest = bus} = {}) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(freq, t); filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    const gain = ctx.createGain(); env(gain, t, peak, attack, decay);
    src.connect(filter); filter.connect(gain); gain.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + attack + decay + .05);
  }
  function tone(t, {type = 'sine', freq = 440, to = null, peak = .2, attack = .003, decay = .3, dest = bus} = {}) {
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const gain = ctx.createGain(); env(gain, t, peak, attack, decay);
    osc.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + attack + decay + .05);
  }
  // Karplus-Strong plucked string: a burst of noise recirculating through a short, damped delay line.
  const plucks = new Map();
  function pluckBuffer(freq, seconds, damping, brightness) {
    const key = `${Math.round(freq)}:${seconds}:${damping}:${brightness}`;
    if (plucks.has(key)) return plucks.get(key);
    const length = Math.floor(rate * seconds), period = Math.max(2, Math.round(rate / freq));
    const b = ctx.createBuffer(1, length, rate), d = b.getChannelData(0);
    for (let i = 0; i < period; i++) d[i] = (Math.random() * 2 - 1) * (1 - brightness) + (i < period / 2 ? brightness : -brightness);
    for (let i = period; i < length; i++) d[i] = damping * .5 * (d[i - period] + d[i - period - 1 >= 0 ? i - period - 1 : 0]);
    plucks.set(key, b); return b;
  }
  function pluck(t, freq, {peak = .25, seconds = 1.6, damping = .996, brightness = 0, lowpass = 4000, dest = bus} = {}) {
    const src = ctx.createBufferSource(); src.buffer = pluckBuffer(freq, seconds, damping, brightness);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowpass;
    const gain = ctx.createGain(); gain.gain.value = peak;
    src.connect(filter); filter.connect(gain); gain.connect(dest); src.start(t);
  }
  // A crowd that murmurs: several voice-band layers, each rising and falling on its own slow wobble.
  function crowdBed(level, bands = [[420, .9], [900, 1.2], [1900, 1.6]]) {
    bands.forEach(([freq, q], i) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = level * (1 - i * .25);
      const mod = ctx.createBufferSource(); mod.buffer = wobble; mod.loop = true; mod.playbackRate.value = rand(.7, 1.4);
      const depth = ctx.createGain(); depth.gain.value = level * .55;
      mod.connect(depth); depth.connect(gain.gain);
      src.connect(filter); filter.connect(gain); gain.connect(bus);
      src.start(0, Math.random()); mod.start(0, Math.random() * 7);
    });
  }
  function windBed(level) {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380;
    const gain = ctx.createGain(); gain.gain.value = level;
    const mod = ctx.createBufferSource(); mod.buffer = wobble; mod.loop = true; mod.playbackRate.value = .25;
    const depth = ctx.createGain(); depth.gain.value = level * .8; mod.connect(depth); depth.connect(gain.gain);
    src.connect(filter); filter.connect(gain); gain.connect(bus); src.start(); mod.start();
  }

  // ---- sounds ----
  function cheer(t, peak = .2, length = 2.6) {
    // A swell of many voices: formant bands rising together, plus a scatter of whoops.
    [[700, 1.1, 1], [1300, 1.4, .7], [2600, 2, .35]].forEach(([freq, q, share]) =>
      noiseHit(t, {freq, q, peak: peak * share, attack: .5, decay: length}));
    for (let v = 0; v < 5; v++) {
      const start = t + rand(.1, .6), osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const base = rand(280, 520); osc.frequency.setValueAtTime(base, start); osc.frequency.exponentialRampToValueAtTime(base * rand(1.3, 1.7), start + .35);
      osc.frequency.exponentialRampToValueAtTime(base * .9, start + 1.1);
      const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = rand(800, 1200); formant.Q.value = 5;
      const gain = ctx.createGain(); env(gain, start, peak * .05, .2, 1);
      osc.connect(formant); formant.connect(gain); gain.connect(place()); osc.start(start); osc.stop(start + 1.3);
    }
  }
  function clop(t, peak = .22, dest = bus) {
    // Hoof on packed earth: a hollow knock with a gritty click on top.
    tone(t, {freq: rand(420, 520), to: rand(260, 320), peak, decay: .06, dest});
    noiseHit(t, {freq: rand(900, 1300), q: 4, peak: peak * .9, decay: .05, dest});
    noiseHit(t, {type: 'highpass', freq: 3000, peak: peak * .35, decay: .015, dest});
  }
  function walkingHorse(t, steps = 8) {
    // The four-beat walk of a horse being led between the stations.
    const dest = place(), stride = rand(.48, .56);
    for (let s = 0; s < steps; s++) {
      const base = t + s * stride;
      clop(base, .16, dest); clop(base + stride * .5 + rand(-.03, .03), .12, dest);
    }
    if (Math.random() < .5) noiseHit(t + steps * stride * .6, {type: 'lowpass', freq: 600, q: .7, peak: .05, attack: .05, decay: .45, dest}); // a soft snort
  }
  function thud(t, peak) { tone(t, {freq: rand(70, 85), to: 40, peak, decay: .12}); noiseHit(t, {type: 'lowpass', freq: 500, peak: peak * .6, decay: .08}); }
  function gallop(t, seconds = 3.4) {
    // A charge down the lists: the three-beat canter grows as the rider nears, then fades.
    for (let s = 0; s < seconds; s += .4) {
      const near = Math.max(0, 1 - Math.abs(s / seconds - .62) * 1.5), peak = .04 + .32 * near;
      [0, .09, .17].forEach(o => thud(t + s + o + rand(-.01, .01), peak * rand(.8, 1)));
    }
  }
  function lanceSplinter(t) {
    thud(t, .45);
    for (let i = 0; i < 18; i++) noiseHit(t + rand(0, .14), {freq: rand(1400, 4200), q: rand(3, 8), peak: rand(.05, .14), decay: rand(.01, .04)}); // wood crackle
    noiseHit(t, {type: 'highpass', freq: 1800, peak: .2, decay: .2});
    [1180, 1710, 2490].forEach(freq => tone(t, {type: 'triangle', freq, peak: .025, decay: rand(.4, .7)}));          // armour ring
  }
  function swordClash(t, peak = .16, dest = bus) {
    noiseHit(t, {type: 'highpass', freq: 3500, peak: peak * 1.5, decay: .025, dest});
    const base = rand(1500, 2400);
    [1, 1.506, 2.08, 2.74, 3.41].forEach((ratio, i) => {
      tone(t, {freq: base * ratio, peak: peak / (i + 1.4), decay: rand(.6, 1.4), dest});
      tone(t, {freq: base * ratio * 1.004, peak: peak / (i + 2.4), decay: rand(.6, 1.2), dest}); // slight beating like real steel
    });
  }
  const shieldBlow = (t, peak = .3, dest = bus) => { tone(t, {freq: rand(110, 150), to: 60, peak, decay: .18, dest}); noiseHit(t, {freq: 700, q: 1.5, peak: peak * .7, decay: .09, dest}); };
  function warCry(t) {
    // Far-off shouting from a warband: heavily muffled so it reads as distance, not synth.
    const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 900; muffle.connect(place());
    for (let v = 0; v < 6; v++) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const base = rand(110, 170); osc.frequency.setValueAtTime(base, t); osc.frequency.linearRampToValueAtTime(base * 1.3, t + .4); osc.frequency.linearRampToValueAtTime(base * 1.05, t + 1.3);
      const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = rand(550, 800); formant.Q.value = 4;
      const gain = ctx.createGain(); env(gain, t + v * .05, .035, .25, 1.2);
      osc.connect(formant); formant.connect(gain); gain.connect(muffle); osc.start(t); osc.stop(t + 1.7);
    }
  }
  function drum(t, peak = .32) {
    tone(t, {freq: 72, to: 42, peak, decay: .5});
    tone(t, {freq: 145, to: 90, peak: peak * .3, decay: .18});
    noiseHit(t, {type: 'lowpass', freq: 400, peak: peak * .35, decay: .06});
  }
  function bowShot(t) {
    const dest = place();
    pluck(t, rand(105, 125), {peak: .28, seconds: .7, damping: .985, lowpass: 2600, dest});         // the bowstring
    noiseHit(t, {type: 'highpass', freq: 2200, peak: .08, decay: .02, dest});
    noiseHit(t + .04, {freq: 3400, q: 1.2, peak: .09, attack: .1, decay: .5, sweepTo: 600, dest}); // arrow in flight
    later(() => { const h = now(); tone(h, {freq: rand(150, 180), to: 75, peak: .22, decay: .1}); noiseHit(h, {freq: 230, q: 6, peak: .18, decay: .16}); }, rand(700, 950)); // into the straw target
  }
  function birdsong(t) {
    const dest = place(), base = rand(2800, 4300);
    for (let i = 0, n = Math.floor(rand(2, 6)); i < n; i++) tone(t + i * rand(.09, .16), {freq: base * rand(.95, 1.05), to: base * rand(1.15, 1.45), peak: .03, attack: .008, decay: .07, dest});
  }
  function applause(t, seconds = 2, peak = .07) {
    for (let i = 0; i < seconds * 45; i++) {
      const at = t + Math.pow(Math.random(), 1.6) * seconds; // dense at first, thinning out
      noiseHit(at, {freq: rand(900, 2400), q: rand(1, 2.5), peak: peak * rand(.4, 1), decay: rand(.012, .03)});
    }
  }
  const lydian = [146.8, 164.8, 185, 196, 220, 246.9, 277.2, 293.7]; // D
  let tuneStep = 0;
  function lute(t) {
    const patterns = [[0, 4, 7, 4, 2, 4], [3, 5, 7, 5, 4, 2], [0, 2, 4, 7, 6, 4]];
    const notes = patterns[tuneStep++ % patterns.length];
    notes.forEach((i, n) => pluck(t + n * .3 + rand(-.01, .015), lydian[i] * (i > 5 ? 1 : 2), {peak: .2, seconds: 1.5, damping: .995, lowpass: 2800}));
    pluck(t, lydian[0], {peak: .16, seconds: 2, damping: .997, lowpass: 1600}); // drone string
  }
  const clink = t => { const dest = place(); [2650, 3970, 5240].forEach(freq => tone(t, {freq: freq * rand(.97, 1.03), peak: .04, attack: .001, decay: rand(.5, 1), dest})); };

  // ---- schedules per venue ----
  const scenes = {
    'silver-lance'() {
      crowdBed(.035); windBed(.012);
      every(() => { const t = now(); gallop(t); later(() => { lanceSplinter(now()); cheer(now() + .15, .2); }, 3150); }, 10000, 15000);
      every(() => walkingHorse(now(), Math.floor(rand(6, 10))), 6000, 10000);
      every(() => swordClash(now(), .035), 6000, 11000);   // harness and armour jangling at the stations
    },
    'five-banners'() {
      crowdBed(.03); windBed(.012);
      every(() => { const t = now(), dest = place(); for (let i = 0, n = Math.floor(rand(3, 7)); i < n; i++) (Math.random() < .65 ? swordClash : shieldBlow)(t + i * rand(.2, .5), Math.random() < .65 ? .13 : .26, dest); }, 2500, 5000);
      every(() => warCry(now()), 8000, 14000);
      every(() => { const t = now(); for (let i = 0; i < 8; i++) drum(t + i * .55, i % 4 === 0 ? .3 : .17); }, 10000, 16000);
    },
    'iron-colosseum'() {
      crowdBed(.06, [[380, .8], [800, 1.1], [1700, 1.5]]);
      every(() => { const t = now(), dest = place(); for (let i = 0, n = Math.floor(rand(2, 5)); i < n; i++) swordClash(t + i * rand(.25, .55), .12, dest); }, 3000, 6000);
      every(() => cheer(now(), .3, 3.2), 9000, 15000);
      every(() => { const t = now(); [0, .5, 1, 1.25, 1.5].forEach(o => drum(t + o, .25)); }, 8000, 13000);
    },
    'kings-mark'() {
      windBed(.03); crowdBed(.012, [[500, 1], [1100, 1.4]]);
      every(() => { bowShot(now()); if (Math.random() < .55) later(() => applause(now(), 1.6, .05), 1400); }, 5000, 9000);
      every(() => birdsong(now()), 2500, 6500);
    },
    'victors-feast'() {
      crowdBed(.04, [[350, .8], [750, 1.1], [1500, 1.5]]);
      every(() => lute(now()), 2300, 2700);
      every(() => clink(now()), 2200, 5500);
      every(() => cheer(now(), .12, 1.6), 13000, 21000);                     // a toast is raised
    },
  };
  (scenes[slug] || scenes['silver-lance'])();
  return () => { stopped = true; timers.forEach(clearTimeout); timers.clear(); };
}
