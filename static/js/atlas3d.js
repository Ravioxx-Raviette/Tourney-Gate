/**
 * Tourney Gate — Interactive 3D Campaign Map (Total War: ROME II inspired)
 * Built with local offline Three.js r160, OrbitControls, and CSS2DRenderer.
 * Mounts the exact 3D architectural models from venue3d.js onto a stylized
 * procedural 3D terrain with winding river, bridge, forests, animated routes,
 * glowing territory rings, Rome II hover tooltips, and Strategic Parchment View.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/CSS2DRenderer.js';
import { VENUE_BUILDERS } from './venue3d.js';
import { effectiveMotion, campaignShortcut, createFrameLoop } from './atlas-runtime.mjs';
import { createAtlasDiagnostics } from './atlas-perf.mjs';
import { batchStaticMeshes, ReusableSpatialGrid, trackInstanceUploads, createLabelUpdater } from './atlas-optimize.mjs';

// ── 1. CAMPAIGN GEOGRAPHY & VENUE DEFINITIONS ────────────────────────────────
const WORLD_W = 68;
const WORLD_D = 52;

// Exact official Tourney Gate faction icons (matching templates/base.html #i-swords, #i-shield, #i-bow, #i-cup)
const FACTION_ICON_PATHS = [
  ['m4 3 6 4 10 13m0-17-6 4L4 20M2 15l7 7m6 0 7-7M5 5l14 14M19 5 5 19'],                                   // 0: Red — Grand Melee (Crossed Swords)
  ['m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z', 'M12 6v11M8 11h8'],                                            // 1: Blue — Arena Games (Shield & Cross)
  ['M5 3c18 1 19 19 0 18L12 12Zm0 18L21 3M15 3h6v6'],                                                       // 2: Green — Archery (Bow & Arrow)
  ['M6 3h12v5a6 6 0 0 1-12 0ZM12 14v7m-5 0h10M6 5H2v3a4 4 0 0 0 5 4m11-7h4v3a4 4 0 0 1-5 4'],              // 3: Orange — Feasts (Chalice Cup)
  ['M12 3C7.6 3 4.5 6.2 4.5 10.2c0 2.3 1.1 4.2 2.8 5.4V18.5h9.4v-2.9c1.7-1.2 2.8-3.1 2.8-5.4C19.5 6.2 16.4 3 12 3Z', 'M9 10.5a1.2 1.2 0 1 0 .01 0M15 10.5a1.2 1.2 0 1 0 .01 0M9.8 18.5v-2.4M12 18.5v-2.4M14.2 18.5v-2.4'], // 4: Undead — Cursed Skull
];

function drawFactionEmblemIcon(ctx, teamId, cx, cy, size, strokeColor, lineWidth = 2.1, shadowColor = null) {
  const paths = FACTION_ICON_PATHS[teamId] || FACTION_ICON_PATHS[0];
  const sc = size / 24;
  const drawPaths = () => {
    for (const d of paths) {
      ctx.stroke(new Path2D(d));
    }
  };
  ctx.save();
  ctx.translate(cx - size * 0.5, cy - size * 0.5);
  ctx.scale(sc, sc);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (shadowColor) {
    ctx.save();
    ctx.translate(0.55, 0.7);
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = lineWidth + 0.45;
    drawPaths();
    ctx.restore();
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  drawPaths();
  ctx.restore();
}

const TEAM_FLAG_PALETTES = [
  { bg: '#b82230', dark: '#7c141e', trim: '#e8c468', icon: '#fff8e8' }, // 0: Red — Royal Lists (Grand Melee)
  { bg: '#225ba0', dark: '#13396b', trim: '#e6c46a', icon: '#f2f8ff' }, // 1: Blue — Iron Colosseum (Arena Games)
  { bg: '#257d45', dark: '#154f2a', trim: '#e6c66a', icon: '#f4fff6' }, // 2: Green — King's Green (Archery)
  { bg: '#cf7b1c', dark: '#8c4c0b', trim: '#f4d982', icon: '#fffaf0' }, // 3: Orange — Great Hall (Feasts)
  { bg: '#2c153b', dark: '#13081c', trim: '#6effa4', icon: '#e8ffe8' }, // 4: Undead — Necrotic Skull Horde
];

function createTeamFlagTexture(teamId) {
  const pal = TEAM_FLAG_PALETTES[teamId] || TEAM_FLAG_PALETTES[0];
  const W = 256;
  const H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // Rich woven banner cloth gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.bg);
  grad.addColorStop(0.55, pal.bg);
  grad.addColorStop(1, pal.dark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle horizontal heraldic cloth sheen & weave lines
  ctx.fillStyle = 'rgba(255, 248, 224, 0.08)';
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(0, H - 20, W, 20);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let y = 16; y < H; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Hoist-side dark sleeve & gilt trim border
  ctx.fillStyle = pal.dark;
  ctx.fillRect(0, 0, 14, H);
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 7;
  ctx.strokeRect(10, 8, W - 18, H - 16);
  ctx.strokeStyle = 'rgba(255, 244, 210, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 16, W - 34, H - 32);

  // Subtle circular medallion halo behind the official emblem so it pops from campaign altitude
  const cx = W * 0.52;
  const cy = H * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fill();
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // Official team icon centered crisply on the flag
  drawFactionEmblemIcon(ctx, teamId, cx, cy, 82, pal.icon, 2.25, 'rgba(18, 10, 4, 0.52)');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Coordinates aligned 1:1 with the 2D Illustrated Atlas landmarks (32%/33%, 73%/38%, 66%/73%, 23%/70%)
// when viewed top-down from STRATEGIC_CAM so 3D models literally rise out of & blend into their 2D drawings!
const VENUE_SPECS = [
  {
    id: 1,
    slug: 'five-banners',
    name: 'The Royal Lists',
    region: 'Silverlance Grounds',
    faction: 'West Bank · Crown Tilts',
    emblem: '⚔',
    x: -10.8,
    z: -7.7,
    scale: 0.215,
    rotY: 0.14,
    plateauR: 5.4,
    plateauH: 1.28,
    footX: 5.15,
    footZ: 3.70,
    zoneR: 6.7,
    badgeY: 2.55,
    parchmentColor: '#4c7154',
    camOffset: [-3.5, 11.2, 13.8],
  },
  {
    id: 2,
    slug: 'iron-colosseum',
    name: 'The Iron Colosseum',
    region: 'Arena District',
    faction: 'East Bank · Iron Pit',
    emblem: '🛡',
    x: 13.8,
    z: -5.5,
    scale: 0.235,
    rotY: -0.18,
    plateauR: 5.4,
    plateauH: 1.38,
    footX: 4.95,
    footZ: 3.75,
    zoneR: 6.8,
    badgeY: 2.65,
    parchmentColor: '#3f5c73',
    camOffset: [3.6, 11.4, 14.0],
  },
  {
    id: 3,
    slug: 'kings-mark',
    name: 'The King’s Green',
    region: 'Royal Gardens',
    faction: 'East Bank · Longbow Range',
    emblem: '🏹',
    x: 10.6,
    z: 10.4,
    scale: 0.245,
    rotY: -0.10,
    plateauR: 4.4,
    plateauH: 1.18,
    footX: 3.90,
    footZ: 2.60,
    zoneR: 5.8,
    badgeY: 2.35,
    parchmentColor: '#697a49',
    camOffset: [3.2, 10.6, 13.2],
  },
  {
    id: 4,
    slug: 'victors-feast',
    name: 'The Great Hall',
    region: 'Castle Courtyard',
    faction: 'West Bank · Royal Hearth',
    emblem: '🏆',
    x: -16.2,
    z: 9.1,
    scale: 0.255,
    rotY: 0.12,
    plateauR: 5.0,
    plateauH: 1.24,
    footX: 3.95,
    footZ: 2.55,
    zoneR: 6.2,
    badgeY: 2.85,
    parchmentColor: '#a67b45',
    camOffset: [-3.4, 10.8, 13.2],
  },
];

const OVERVIEW_CAM = { pos: [0.0, 27.5, 29.5], target: [0.0, 0.2, 0.8] };
const STRATEGIC_CAM = { pos: [0.0, 66.0, 0.08], target: [0.0, 0.0, 0.0] };
const BRIDGE_Z = 0.86;
const NORTH_BRIDGE_Z = -9.6;
const SOUTH_BRIDGE_Z = 10.6;
const CENTRAL_ARCH_RISE = 0.72;
const SIDE_ARCH_RISE = 0.70;
// Left alpine summit dragon cave lair & naturally carved mountain perching shelf
const DRAGON_LAIR = { x: -19.8, z: -20.2, rotY: 0.34, shelfH: 5.95 };

// Dynamic Shifting Tide-of-War Momentum shared across ALL 4 land armies & river naval fleets!
// Creates asymmetric power gaps so different teams surge & retreat over time, while no team ever completely loses.
const REALM_TIDE = {
  power: [1.46, 0.98, 0.70, 1.06],
  target: [1.46, 0.98, 0.70, 1.06],
  ascendant: 0,
  besieged: 2,
  shiftTimer: 26.0,
};

function riverCenterX(z) {
  return Math.sin(z * 0.115) * 2.05 + Math.cos(z * 0.055) * 0.52;
}

function riverHalfWidth(z) {
  return 1.68 + Math.sin(z * 0.17 + 0.8) * 0.24 + Math.cos(z * 0.09 - 0.4) * 0.10;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Quintic smootherstep for silky C2-continuous hills, valleys, and plateaus
function smootherstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Deterministic 2D smooth value noise & fBm for organic natural landscapes
function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2D(x, z, octaves = 4) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    val += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.48;
  }
  return val;
}

function ridgedFbm2D(x, z, octaves = 3) {
  let val = 0;
  let amp = 0.55;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq) * 2 - 1);
    val += amp * n * n;
    freq *= 2.08;
    amp *= 0.46;
  }
  return val;
}

// Smooth, organic multi-octave terrain height with rolling meadows, terraced foothills,
// alpine northern mountains, winding carved river valley, and seamless citadel plateaus.
function rawTerrainHeight(x, z) {
  // Smooth organic rolling hills (layered fBm + gentle broad swells)
  let h = 0.56
    + fbm2D(x * 0.062 + 2.1, z * 0.062 - 1.4, 4) * 1.05
    + Math.sin(x * 0.085 + 0.4) * Math.cos(z * 0.08 - 0.3) * 0.42
    + fbm2D(x * 0.16 - 5.3, z * 0.16 + 3.7, 2) * 0.16;

  // Grand, towering Total War–scale northern alpine mountain range with glacial ridges & river gorge pass
  const rxNorth = riverCenterX(z);
  const rDistNorth = Math.abs(x - rxNorth);
  const rwNorth = riverHalfWidth(z);
  const gorgePass = 0.22 + 0.78 * smootherstep(rwNorth * 1.15, rwNorth * 4.4, rDistNorth);

  const northEdge = smootherstep(-10.8, -23.8, z);
  const northSummit = smootherstep(-14.2, -24.4, z);
  const alpineRidge = ridgedFbm2D(x * 0.088 + 1.3, z * 0.088 - 0.8, 4);
  const sharpSpire = Math.pow(Math.max(0, ridgedFbm2D(x * 0.14 - 2.1, z * 0.14 + 1.7, 3)), 1.65);
  const alpinePeaks = (alpineRidge * 5.2 + sharpSpire * 3.2 + 1.45 + fbm2D(x * 0.18, z * 0.18, 2) * 0.55)
    * northEdge * gorgePass;
  // Twin flanking NW & NE towering alpine massifs framing the upper valley
  const cornerMassif = smootherstep(16.5, 30.0, Math.abs(x)) * northSummit
    * (1.35 + ridgedFbm2D(x * 0.11 + 3.4, z * 0.11 - 2.2, 3) * 2.5);
  h += alpinePeaks + cornerMassif;

  // Grand sculpted East & West frontier mountain spurs (kept cleanly past the farmland valleys)
  const sideMask = smootherstep(26.2, 33.4, Math.abs(x));
  const sideRidge = sideMask * (1.55 + ridgedFbm2D(x * 0.095, z * 0.105 + 4.1, 4) * 4.4);
  const southMask = smootherstep(18.5, 25.4, z) * smootherstep(rwNorth * 1.2, rwNorth * 4.2, rDistNorth);
  const southBluff = southMask * (0.75 + ridgedFbm2D(x * 0.11 - 2.4, z * 0.11, 3) * 2.1);
  h += sideRidge + southBluff;

  // Soft diorama edge taper right at the outer 1.2 units so peaks nestle cleanly inside the gold table frame
  const edgeTaperX = 1 - smootherstep(WORLD_W * 0.5 - 1.4, WORLD_W * 0.5, Math.abs(x)) * 0.45;
  const edgeTaperZ = 1 - smootherstep(WORLD_D * 0.5 - 1.4, WORLD_D * 0.5, Math.abs(z)) * 0.45;
  if (h > 1.2) {
    h = 1.2 + (h - 1.2) * edgeTaperX * edgeTaperZ;
  }

  // Naturally carve a smooth rocky mountain shelf right into the left alpine cliff for the Dragon's cave nest!
  const dlNx = DRAGON_LAIR.x + Math.sin(DRAGON_LAIR.rotY) * 1.15;
  const dlNz = DRAGON_LAIR.z + Math.cos(DRAGON_LAIR.rotY) * 1.15;
  const dlDist = Math.hypot(x - dlNx, z - dlNz);
  if (dlDist < 4.4) {
    const shelfFlat = 1 - smootherstep(1.85, 4.4, dlDist);
    h = h * (1 - shelfFlat) + DRAGON_LAIR.shelfH * shelfFlat;
  }

  // Silky quintic elevated citadel plateaus applied BEFORE river carving so no plateau
  // collar can ever fill in or block the navigable river channel!
  for (const v of VENUE_SPECS) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d < v.plateauR + 4.8) {
      const flat = 1 - smootherstep(v.plateauR - 0.1, v.plateauR + 4.8, d);
      h = h * (1 - flat) + v.plateauH * flat;
    }
  }

  // Smooth river valley carving LAST so the entire winding channel stays deep open water
  const rx = riverCenterX(z);
  const rDist = Math.abs(x - rx);
  const rw = riverHalfWidth(z);
  const valleyFade = 1 - smootherstep(rw * 1.05, rw * 2.65, rDist);
  h = h * (1 - valleyFade * 0.35) + 0.22 * (valleyFade * 0.35);
  const channelCut = 1 - smootherstep(rw * 0.52, rw * 1.92, rDist);
  const bedDepth = -0.82 + fbm2D(x * 0.32, z * 0.25, 2) * 0.06;
  h = h * (1 - channelCut) + bedDepth * channelCut;

  // Gently sculpted grassy-stone bridgehead embankments at Central, North & South crossings
  // (smooth in both X and Z so all three arched bridges meet both hillsides flush with zero step!)
  for (const [bz, maxDz, maxR, targetH] of [
    [BRIDGE_Z, 4.2, 6.4, 0.44],
    [NORTH_BRIDGE_Z, 3.2, 5.2, 0.42],
    [SOUTH_BRIDGE_Z, 3.2, 5.4, 0.42],
  ]) {
    const dzBridge = Math.abs(z - bz);
    if (dzBridge < maxDz && rDist < maxR) {
      const alongZ = 1 - smootherstep(0.95, maxDz, dzBridge);
      const outFromWater = smootherstep(rw * 0.90, rw * 1.42, rDist);
      const fadeIntoHills = 1 - smootherstep(maxR * 0.50, maxR, rDist);
      const abBlend = alongZ * outFromWater * fadeIntoHills;
      h = h * (1 - abBlend) + targetH * abBlend;
    }
  }

  return h;
}

// Pre-baked 256x200 bilinear terrain height LUT (~60x faster than 25-octave noise per query!)
const H_LUT_W = 256;
const H_LUT_H = 200;
const H_MIN_X = -WORLD_W * 0.5 - 2.0;
const H_MAX_X = WORLD_W * 0.5 + 2.0;
const H_MIN_Z = -WORLD_D * 0.5 - 2.0;
const H_MAX_Z = WORLD_D * 0.5 + 2.0;
const H_INV_DX = (H_LUT_W - 1) / (H_MAX_X - H_MIN_X);
const H_INV_DZ = (H_LUT_H - 1) / (H_MAX_Z - H_MIN_Z);
let terrainLUT = null;

function ensureTerrainLUT() {
  if (terrainLUT) return;
  terrainLUT = new Float32Array(H_LUT_W * H_LUT_H);
  const dx = (H_MAX_X - H_MIN_X) / (H_LUT_W - 1);
  const dz = (H_MAX_Z - H_MIN_Z) / (H_LUT_H - 1);
  for (let rz = 0; rz < H_LUT_H; rz++) {
    const z = H_MIN_Z + rz * dz;
    const rowOff = rz * H_LUT_W;
    for (let cx = 0; cx < H_LUT_W; cx++) {
      terrainLUT[rowOff + cx] = rawTerrainHeight(H_MIN_X + cx * dx, z);
    }
  }
}

function terrainHeight(x, z) {
  if (!terrainLUT) ensureTerrainLUT();
  const gx = (x - H_MIN_X) * H_INV_DX;
  const gz = (z - H_MIN_Z) * H_INV_DZ;
  if (gx < 0 || gx >= H_LUT_W - 1 || gz < 0 || gz >= H_LUT_H - 1) {
    return rawTerrainHeight(x, z);
  }
  const ix = gx | 0;
  const iz = gz | 0;
  const fx = gx - ix;
  const fz = gz - iz;
  const i00 = iz * H_LUT_W + ix;
  const h00 = terrainLUT[i00];
  const h10 = terrainLUT[i00 + 1];
  const h01 = terrainLUT[i00 + H_LUT_W];
  const h11 = terrainLUT[i00 + H_LUT_W + 1];
  return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
}

// Soft organic pastoral contour: rounded-quad superellipse + gentle natural hillside waviness
// (gives the classic English countryside patchwork look from the reference — curved, never a rigid box!)
function organicPlotScale(p, theta) {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const superR = Math.pow(Math.pow(c, 2.6) + Math.pow(s, 2.6), -1 / 2.6);
  const wave = 1
    + p.w1 * Math.sin(theta * 2 + p.ph1)
    + p.w2 * Math.cos(theta * 3 + p.ph2)
    + p.w3 * Math.sin(theta + p.ph3);
  return superR * wave;
}

// Returns normalized radial distance (< 1 means inside the organic hedgerowed field)
function organicPlotDist(p, lx, lz) {
  const nx = lx / (p.w * 0.5);
  const nz = lz / (p.d * 0.5);
  const r = Math.hypot(nx, nz);
  if (r < 1e-4) return 0;
  const theta = Math.atan2(nz, nx);
  return r / organicPlotScale(p, theta);
}

// Shared windmill coordinates placed in wide-open scenic valleys (well clear of the central bridge & roads!)
const WINDMILL_COORDS = [
  { x: -6.2, z: 13.4, rotY: 0.45, barnDx: 1.10, barnDz: -0.55 },
  { x: 18.8, z: 3.6, rotY: -0.75, barnDx: 1.05, barnDz: 0.65 },
  { x: -22.8, z: 2.2, rotY: 0.35, barnDx: 1.05, barnDz: -0.55 },
];

// Exact real architectural gate/entrance anchors flush outside each 3D venue model (zero overlap inside buildings/lawns!)
const VENUE_ROAD_ANCHORS = {
  // 1. Royal Lists: South Royal Gatehouse (world box Z <= -4.39)
  1: { gate: [-10.34, -4.36], mid: [-7.2, -2.0] },
  // 2. Iron Colosseum: West Cardinal Entry Plaza (world box X >= 9.24)
  2: { gate: [9.20, -6.30], mid: [7.6, -4.8] },
  // 3. King's Green (Archery): West Entrance Edge outside lawn curb (world box X >= 7.43)
  3: { gate: [7.38, 10.35], mid: [6.35, 8.6] },
  // 4. Great Hall (Feast): South Grand Entrance Vestibule oak doors (world box Z <= 11.00)
  4: { gate: [-15.97, 11.08], approach: [-13.6, 11.65], junction: [-11.2, 10.75], mid: [-7.0, 6.2] },
};

// Shared royal highway spline helper connecting each venue's exact outer gate cleanly to the Central Bridge!
function getRoyalHighwayCurve2D(v) {
  const bx = riverCenterX(BRIDGE_Z);
  const dx = riverCenterX(BRIDGE_Z + 0.5) - riverCenterX(BRIDGE_Z - 0.5);
  const rotY = -Math.atan2(dx, 1.0);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const bankSign = v.x < bx ? -1 : 1;
  const apLx = bankSign * 3.65;
  const apX = bx + apLx * cos;
  const apZ = BRIDGE_Z - apLx * sin;

  const a = VENUE_ROAD_ANCHORS[v.id];
  const pts = [new THREE.Vector3(a.gate[0], 0, a.gate[1])];
  if (a.approach) pts.push(new THREE.Vector3(a.approach[0], 0, a.approach[1]));
  if (a.junction) pts.push(new THREE.Vector3(a.junction[0], 0, a.junction[1]));
  if (v.id === 3) {
    // Clean single approach stem before splitting smoothly to Central Bridge & South Bridge
    pts.push(new THREE.Vector3(6.45, 0, 10.35));
  }
  pts.push(new THREE.Vector3(a.mid[0], 0, a.mid[1]));
  pts.push(new THREE.Vector3(apX, 0, apZ));
  pts.push(new THREE.Vector3(bx, 0, BRIDGE_Z));
  return new THREE.CatmullRomCurve3(pts);
}

// Clean non-redundant flanking bridge connectors linking the 4 venues across North & South bridges!
let _cachedBridgeRoads = null;
function getSideBridgeRoadPaths() {
  if (_cachedBridgeRoads) return _cachedBridgeRoads;
  const bmN = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, SIDE_ARCH_RISE);
  const bmS = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, SIDE_ARCH_RISE);
  const [nwX, nwZ] = bmN.toWorld(-bmN.halfSpan - 0.75, 0);
  const [neX, neZ] = bmN.toWorld(bmN.halfSpan + 0.75, 0);
  const [swX, swZ] = bmS.toWorld(-bmS.halfSpan - 0.75, 0);
  const [seX, seZ] = bmS.toWorld(bmS.halfSpan + 0.75, 0);

  // Snap east end of North Bridge road cleanly onto Iron Colosseum's royal approach (zero redundant double entry!)
  const r2Join = getRoyalHighwayCurve2D(VENUE_SPECS[1]).getPointAt(0.18);

  _cachedBridgeRoads = [
    // North Bridge Road: Royal Lists East Horse Gate (-5.98, -8.37) -> North Bridge -> joins Iron Colosseum West Plaza approach
    [
      [-5.98, -8.37],
      [nwX, nwZ],
      [bmN.bx, NORTH_BRIDGE_Z],
      [neX, neZ],
      [5.4, -8.4],
      [r2Join.x, r2Join.z],
    ],
    // South Bridge Road: Branches off Great Hall road junction (-11.2, 10.75) -> South Bridge -> joins King's Green West approach (6.45, 10.35)
    [
      [-11.2, 10.75],
      [-7.4, 11.15],
      [-3.8, 11.05],
      [swX, swZ],
      [bmS.bx, SOUTH_BRIDGE_Z],
      [seX, seZ],
      [6.45, 10.35],
    ],
  ];
  return _cachedBridgeRoads;
}

// Keep road network clean and uncluttered — no redundant crossing farm tracks!
const FARM_ROAD_SPECS = [];

let _cachedFarmRoads = null;
function getResolvedFarmRoadPaths() {
  if (_cachedFarmRoads) return _cachedFarmRoads;
  const venueById = new Map(VENUE_SPECS.map(v => [v.id, v]));
  _cachedFarmRoads = FARM_ROAD_SPECS.map(spec => {
    const royal = getRoyalHighwayCurve2D(venueById.get(spec.venueId));
    // Exact junction point ON the royal highway centerline + tiny overlap along tangent for seamless T-join
    const jPt = royal.getPointAt(spec.branchT);
    return [[jPt.x, jPt.z], ...spec.waypoints];
  });
  return _cachedFarmRoads;
}

// Connected pastoral hedgerow farmsteads clustered right around each of the 3 windmills
// (all positioned cleanly away from the central stone bridge and approach roads!)
function generateFarmPlots() {
  let seed = 7331;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const curated = [
    // ── Windmill 1 Estate (-6.2, 13.4, Southern Willowmere Meadows — 14+ units south of bridge) ──
    { cx: -3.2, cz: 13.8, w: 3.1, d: 2.3, angle: 0.08, crop: 'wheat', wmIdx: 0, hedge: true },
    { cx: -6.3, cz: 16.0, w: 2.9, d: 2.1, angle: 0.05, crop: 'plowed', wmIdx: 0, hedge: true },
    { cx: -9.1, cz: 13.8, w: 2.8, d: 2.2, angle: -0.06, crop: 'pasture', wmIdx: 0, hedge: true },
    { cx: -3.4, cz: 16.3, w: 2.8, d: 2.0, angle: 0.10, crop: 'wheat', wmIdx: 0, hedge: true },
    { cx: -9.2, cz: 16.2, w: 2.5, d: 1.9, angle: -0.08, crop: 'pumpkin', wmIdx: 0, hedge: true },

    // ── Windmill 2 Estate (18.8, 3.6, Eastern Farmlands & Old Orchard — 18+ units east of bridge) ─
    { cx: 16.0, cz: 3.6, w: 3.1, d: 2.3, angle: -0.10, crop: 'wheat', wmIdx: 1, hedge: true },
    { cx: 18.8, cz: 1.1, w: 2.8, d: 2.0, angle: -0.12, crop: 'plowed', wmIdx: 1, hedge: true },
    { cx: 18.8, cz: 6.2, w: 2.8, d: 2.2, angle: 0.08, crop: 'pasture', wmIdx: 1, hedge: true },
    { cx: 15.9, cz: 1.2, w: 2.7, d: 2.0, angle: -0.14, crop: 'wheat', wmIdx: 1, hedge: true },
    { cx: 21.8, cz: 5.8, w: 2.7, d: 2.0, angle: 0.12, crop: 'vineyard', wmIdx: 1, hedge: true },
    { cx: 22.0, cz: 8.2, w: 2.5, d: 1.9, angle: 0.08, crop: 'cabbage', wmIdx: 1, hedge: true },

    // ── Windmill 3 Estate (-22.8, 2.2, Western Rolling Farmlands — 23+ units west of bridge) ────
    { cx: -25.8, cz: 2.1, w: 3.2, d: 2.4, angle: 0.08, crop: 'wheat', wmIdx: 2, hedge: true },
    { cx: -22.9, cz: 4.9, w: 2.9, d: 2.1, angle: 0.05, crop: 'plowed', wmIdx: 2, hedge: true },
    { cx: -19.8, cz: 1.9, w: 2.7, d: 2.1, angle: -0.08, crop: 'pasture', wmIdx: 2, hedge: true },
    { cx: -25.8, cz: -0.5, w: 2.9, d: 2.1, angle: 0.12, crop: 'wheat', wmIdx: 2, hedge: true },
    { cx: -25.8, cz: 4.8, w: 2.5, d: 1.9, angle: -0.10, crop: 'lavender', wmIdx: 2, hedge: true },

    // ── Northern Valley Outlying Patch (12+ units north of bridge, beside northern river bend) ──
    { cx: 4.4, cz: -11.4, w: 2.9, d: 2.1, angle: -0.12, crop: 'wheat', wmIdx: -1, hedge: true },
    { cx: 4.5, cz: -13.9, w: 2.6, d: 1.9, angle: -0.08, crop: 'plowed', wmIdx: -1, hedge: true },
  ];

  const plots = [];
  for (const cfg of curated) {
    const h = terrainHeight(cfg.cx, cfg.cz);
    if (h < 0.18) continue;
    const wm = cfg.wmIdx >= 0 ? WINDMILL_COORDS[cfg.wmIdx] : null;
    // Point each field's cart-lane gateway naturally toward its home windmill (or center of valley)
    let gateAngle = rand() * Math.PI * 2;
    if (wm) {
      const dx = wm.x - cfg.cx;
      const dz = wm.z - cfg.cz;
      const cos = Math.cos(-cfg.angle);
      const sin = Math.sin(-cfg.angle);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      gateAngle = Math.atan2(lz / (cfg.d * 0.5), lx / (cfg.w * 0.5));
    }
    plots.push({
      cx: cfg.cx,
      cz: cfg.cz,
      w: cfg.w,
      d: cfg.d,
      rad: Math.max(cfg.w, cfg.d) * 0.58,
      angle: cfg.angle,
      crop: cfg.crop,
      wmIdx: cfg.wmIdx,
      hedge: cfg.hedge,
      gateAngle,
      w1: 0.055 + rand() * 0.045,
      w2: 0.030 + rand() * 0.032,
      w3: 0.025 + rand() * 0.028,
      ph1: rand() * Math.PI * 2,
      ph2: rand() * Math.PI * 2,
      ph3: rand() * Math.PI * 2,
      curveBend: (rand() - 0.5) * 0.24,
      seed: rand(),
    });
  }

  return plots;
}

// ── 2. PROCEDURAL PAINTERLY TERRAIN ALBEDO & MICRO-RELIEF BUMP TEXTURES ──────
function createCampaignTerrainTextures(farmPlots) {
  const W = 1536;
  const H = 1152;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Matching micro-relief bump map for subtle furrow, stone, and grass texture under sunlight
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W;
  bumpCanvas.height = H;
  const bctx = bumpCanvas.getContext('2d');

  // Neutral sunlit warm base so Three.js vertexColors multiply cleanly without darkening
  ctx.fillStyle = '#ece9df';
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, W, H);

  let seed = 8191;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const toU = x => ((x + WORLD_W / 2) / WORLD_W) * W;
  const toV = z => ((z + WORLD_D / 2) / WORLD_D) * H;
  const pxPerX = W / WORLD_W;
  const pxPerZ = H / WORLD_D;

  // Soft painterly biome blotches across meadows, groves, and ridges for natural smoothness
  for (let i = 0; i < 240; i++) {
    const px = rand() * W;
    const py = rand() * H;
    const rad = 34 + rand() * 92;
    const g = ctx.createRadialGradient(px, py, 2, px, py, rad);
    const tone = rand();
    if (tone < 0.34) {
      g.addColorStop(0, 'rgba(218, 226, 184, 0.22)');
    } else if (tone < 0.68) {
      g.addColorStop(0, 'rgba(244, 232, 192, 0.20)');
    } else {
      g.addColorStop(0, 'rgba(176, 194, 150, 0.18)');
    }
    g.addColorStop(1, 'rgba(236, 233, 223, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Trace smooth organic closed contour for each natural hillside field
  const traceOrganicPlot = (c2d, p, rx, rz, scaleMul = 1) => {
    const steps = 40;
    c2d.beginPath();
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * Math.PI * 2;
      const sc = organicPlotScale(p, th) * scaleMul;
      const px = Math.cos(th) * rx * sc;
      const py = Math.sin(th) * rz * sc;
      if (i === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.closePath();
  };

  // Paint soft-edged organic tilled earth, sunlit wheat base, fresh grazing pasture & curved furrows
  const soilByCrop = {
    wheat: ['rgba(222, 198, 122, 0.72)', 'rgba(198, 178, 112, 0.30)'],
    plowed: ['rgba(164, 124, 90, 0.86)', 'rgba(154, 122, 88, 0.32)'],
    pasture: ['rgba(182, 214, 134, 0.68)', 'rgba(170, 200, 128, 0.24)'],
    vineyard: ['rgba(176, 154, 112, 0.66)', 'rgba(162, 144, 108, 0.26)'],
    lavender: ['rgba(154, 136, 104, 0.64)', 'rgba(146, 130, 100, 0.24)'],
    cabbage: ['rgba(134, 110, 76, 0.74)', 'rgba(128, 106, 74, 0.28)'],
    pumpkin: ['rgba(126, 100, 68, 0.76)', 'rgba(122, 98, 66, 0.28)'],
  };

  for (const p of farmPlots) {
    const u = toU(p.cx);
    const v = toV(p.cz);
    const rx = p.w * 0.5 * pxPerX;
    const rz = p.d * 0.5 * pxPerZ;
    const [innerSoil, outerSoil] = soilByCrop[p.crop] || ['rgba(156, 134, 92, 0.6)', 'rgba(150, 130, 90, 0.25)'];

    ctx.save();
    ctx.translate(u, v);
    ctx.rotate(p.angle);

    traceOrganicPlot(ctx, p, rx, rz, 1.08);
    ctx.fillStyle = outerSoil;
    ctx.fill();

    traceOrganicPlot(ctx, p, rx, rz, 0.98);
    ctx.fillStyle = innerSoil;
    ctx.fill();

    // Gently curved contour plow ridges inside tilled & planted fields (extra rich on 'plowed' like the image!)
    if (p.crop !== 'pasture') {
      ctx.clip();
      const rowStep = p.crop === 'plowed' ? 6.0 : p.crop === 'vineyard' ? 9.5 : 6.4;
      const maxR = Math.max(rx, rz) * 1.35;
      for (let fy = -maxR; fy <= maxR; fy += rowStep) {
        if (p.crop === 'plowed') {
          // Alternating warm sunlit brown soil ridges & darker furrow troughs just like the reference image!
          ctx.strokeStyle = 'rgba(218, 178, 142, 0.52)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-maxR, fy - 1.2);
          ctx.quadraticCurveTo(0, fy - 1.2 + p.curveBend * rz * 0.9, maxR, fy - 1.2);
          ctx.stroke();
        }
        ctx.strokeStyle = p.crop === 'plowed' ? 'rgba(92, 62, 42, 0.42)' : 'rgba(74, 58, 34, 0.20)';
        ctx.lineWidth = p.crop === 'plowed' ? 1.8 : 1.3;
        ctx.beginPath();
        ctx.moveTo(-maxR, fy);
        ctx.quadraticCurveTo(0, fy + p.curveBend * rz * 0.9, maxR, fy);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (p.crop !== 'pasture') {
      bctx.save();
      bctx.translate(u, v);
      bctx.rotate(p.angle);
      traceOrganicPlot(bctx, p, rx, rz, 0.98);
      bctx.clip();
      const rowStep = p.crop === 'plowed' ? 6.0 : p.crop === 'vineyard' ? 9.5 : 6.4;
      const maxR = Math.max(rx, rz) * 1.35;
      bctx.strokeStyle = p.crop === 'plowed' ? 'rgba(210, 210, 210, 0.72)' : 'rgba(165, 165, 165, 0.48)';
      bctx.lineWidth = p.crop === 'plowed' ? 2.4 : 1.7;
      for (let fy = -maxR; fy <= maxR; fy += rowStep) {
        bctx.beginPath();
        bctx.moveTo(-maxR, fy);
        bctx.quadraticCurveTo(0, fy + p.curveBend * rz * 0.9, maxR, fy);
        bctx.stroke();
      }
      bctx.restore();
    }
  }

  // Soft curved sandy-earth farmyard & dirt cart lanes linking each windmill directly into its nearby fields!
  for (let wIdx = 0; wIdx < WINDMILL_COORDS.length; wIdx++) {
    const wm = WINDMILL_COORDS[wIdx];
    const wu = toU(wm.x);
    const wv = toV(wm.z);
    // Warm packed-earth farmyard around each windmill & granary barn
    const ydGrad = ctx.createRadialGradient(wu, wv, 4, wu, wv, 36);
    ydGrad.addColorStop(0, 'rgba(206, 184, 138, 0.72)');
    ydGrad.addColorStop(0.65, 'rgba(196, 174, 130, 0.42)');
    ydGrad.addColorStop(1, 'rgba(196, 174, 130, 0)');
    ctx.fillStyle = ydGrad;
    ctx.beginPath();
    ctx.arc(wu, wv, 36, 0, Math.PI * 2);
    ctx.fill();

    // Gently curving dirt cart tracks from the windmill yard to each field gateway
    for (const p of farmPlots) {
      if (p.wmIdx !== wIdx) continue;
      const sc = organicPlotScale(p, p.gateAngle);
      const glx = Math.cos(p.gateAngle) * p.w * 0.5 * sc;
      const glz = Math.sin(p.gateAngle) * p.d * 0.5 * sc;
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      const gx = p.cx + glx * cos - glz * sin;
      const gz = p.cz + glx * sin + glz * cos;
      const gu = toU(gx);
      const gv = toV(gz);
      const midU = (wu + gu) * 0.5 + (gv - wv) * 0.14;
      const midV = (wv + gv) * 0.5 - (gu - wu) * 0.14;

      ctx.save();
      ctx.strokeStyle = 'rgba(198, 176, 132, 0.62)';
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(wu, wv);
      ctx.quadraticCurveTo(midU, midV, gu, gv);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(148, 124, 86, 0.25)';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Paint soft feathered earthy roadbeds & venue entry aprons under ALL roads (Royal, North/South Bridges & Farm Roads)
  // so every 3D road blends seamlessly into the grassy hills with zero sharp edges!
  const paintSoftTerrainRoad = (sampledPts, outerW, innerW, junctionStart = false) => {
    ctx.save();
    ctx.beginPath();
    sampledPts.forEach((pt, i) => {
      const u = toU(pt.x);
      const v = toV(pt.z);
      if (i === 0) ctx.moveTo(u, v);
      else ctx.lineTo(u, v);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(154, 138, 96, 0.32)';
    ctx.lineWidth = outerW;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(204, 184, 138, 0.52)';
    ctx.lineWidth = innerW;
    ctx.stroke();
    if (junctionStart && sampledPts.length) {
      const ju = toU(sampledPts[0].x);
      const jv = toV(sampledPts[0].z);
      const jg = ctx.createRadialGradient(ju, jv, 2, ju, jv, outerW * 0.65);
      jg.addColorStop(0, 'rgba(202, 182, 136, 0.62)');
      jg.addColorStop(1, 'rgba(202, 182, 136, 0)');
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.arc(ju, jv, outerW * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    bctx.save();
    bctx.beginPath();
    sampledPts.forEach((pt, i) => {
      const u = toU(pt.x);
      const v = toV(pt.z);
      if (i === 0) bctx.moveTo(u, v);
      else bctx.lineTo(u, v);
    });
    bctx.lineCap = 'round';
    bctx.lineJoin = 'round';
    bctx.strokeStyle = 'rgba(112, 112, 112, 0.35)';
    bctx.lineWidth = innerW;
    bctx.stroke();
    bctx.restore();
  };

  for (const v of VENUE_SPECS) {
    paintSoftTerrainRoad(getRoyalHighwayCurve2D(v).getPoints(48), 22, 13, false);
  }
  for (const pts of getSideBridgeRoadPaths()) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    paintSoftTerrainRoad(curve.getPoints(52), 18, 10.5, false);
  }
  for (const pts of getResolvedFarmRoadPaths()) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    paintSoftTerrainRoad(curve.getPoints(44), 15, 8.8, true);
  }

  // Fine organic terrain soil, grass blades, pebbles & rock grain (fast startup on page refresh)
  for (let i = 0; i < 4500; i++) {
    const px = rand() * W;
    const py = rand() * H;
    const sz = 1 + rand() * 3.0;
    const alpha = 0.025 + rand() * 0.05;
    ctx.fillStyle = rand() > 0.48 ? `rgba(56, 50, 34, ${alpha})` : `rgba(255, 252, 240, ${alpha})`;
    ctx.fillRect(px, py, sz, sz);
    const bVal = rand() > 0.5 ? 148 : 108;
    bctx.fillStyle = `rgba(${bVal}, ${bVal}, ${bVal}, 0.25)`;
    bctx.fillRect(px, py, sz + 0.6, sz + 0.6);
  }

  // Soft sunlit sandy & pebbled shore shading along the winding riverbanks
  ctx.save();
  ctx.beginPath();
  for (let z = -WORLD_D / 2; z <= WORLD_D / 2; z += 0.35) {
    const u = toU(riverCenterX(z));
    const v = toV(z);
    if (z === -WORLD_D / 2) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  }
  ctx.strokeStyle = 'rgba(226, 206, 158, 0.34)';
  ctx.lineWidth = 122;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(182, 166, 128, 0.40)';
  ctx.lineWidth = 84;
  ctx.stroke();
  ctx.restore();

  // Scattered riverbank pebbles painted along the wet shore
  for (let i = 0; i < 1400; i++) {
    const z = (rand() - 0.5) * WORLD_D;
    const side = rand() > 0.5 ? 1 : -1;
    const rw = riverHalfWidth(z);
    const x = riverCenterX(z) + side * (rw * (0.75 + rand() * 0.65));
    const u = toU(x);
    const v = toV(z);
    const r = 1.0 + rand() * 2.1;
    ctx.fillStyle = rand() > 0.45 ? 'rgba(122, 112, 92, 0.32)' : 'rgba(232, 220, 190, 0.34)';
    ctx.beginPath();
    ctx.arc(u, v, r, 0, Math.PI * 2);
    ctx.fill();
    bctx.fillStyle = 'rgba(190, 190, 190, 0.45)';
    bctx.beginPath();
    bctx.arc(u, v, r, 0, Math.PI * 2);
    bctx.fill();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 4;

  return { map, bumpMap };
}

// ── 2B. PROCEDURAL SEAMLESS FLOWING RIVER TEXTURES (ALBEDO, NORMAL & FOAM) ───
function createFlowingWaterTextures() {
  const S = 512;

  // 1. River Albedo Map: shallower emerald-turquoise banks -> deep sapphire-teal center + subtle flow streaks
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = S;
  colorCanvas.height = S;
  const cctx = colorCanvas.getContext('2d');

  const bankGrad = cctx.createLinearGradient(0, 0, S, 0);
  bankGrad.addColorStop(0.00, '#5a9496');
  bankGrad.addColorStop(0.11, '#3d7d8e');
  bankGrad.addColorStop(0.28, '#235e7c');
  bankGrad.addColorStop(0.50, '#194d6b');
  bankGrad.addColorStop(0.72, '#235e7c');
  bankGrad.addColorStop(0.89, '#3d7d8e');
  bankGrad.addColorStop(1.00, '#5a9496');
  cctx.fillStyle = bankGrad;
  cctx.fillRect(0, 0, S, S);

  // Seamless periodic current streamlines along V (vertical axis wraps cleanly mod S)
  let wSeed = 2027;
  const wrand = () => {
    wSeed = (wSeed * 16807) % 2147483647;
    return (wSeed - 1) / 2147483646;
  };
  for (let i = 0; i < 160; i++) {
    const x = (0.08 + wrand() * 0.84) * S;
    const y = wrand() * S;
    const len = 36 + wrand() * 95;
    const w = 1.6 + wrand() * 4.5;
    const bright = wrand() > 0.35;
    const col = bright ? `rgba(176, 224, 232, ${0.06 + wrand() * 0.10})` : `rgba(10, 42, 62, ${0.08 + wrand() * 0.12})`;
    cctx.strokeStyle = col;
    cctx.lineWidth = w;
    cctx.lineCap = 'round';
    for (const dy of [-S, 0, S]) {
      cctx.beginPath();
      cctx.moveTo(x, y + dy);
      cctx.bezierCurveTo(x + (wrand() - 0.5) * 14, y + dy + len * 0.35, x + (wrand() - 0.5) * 14, y + dy + len * 0.7, x, y + dy + len);
      cctx.stroke();
    }
  }

  // Delicate shoreline foam wisps near U=0.05 and U=0.95
  for (let i = 0; i < 90; i++) {
    const side = i % 2 === 0 ? 0.04 + wrand() * 0.08 : 0.88 + wrand() * 0.08;
    const x = side * S;
    const y = wrand() * S;
    const len = 18 + wrand() * 48;
    cctx.strokeStyle = `rgba(232, 246, 248, ${0.14 + wrand() * 0.16})`;
    cctx.lineWidth = 1.4 + wrand() * 2.2;
    cctx.lineCap = 'round';
    for (const dy of [-S, 0, S]) {
      cctx.beginPath();
      cctx.moveTo(x, y + dy);
      cctx.lineTo(x + (wrand() - 0.5) * 6, y + dy + len);
      cctx.stroke();
    }
  }

  // 2. Mathematical Seamless Tangent-Space Water Normal Map (periodic on U & V for live sunlight glints!)
  const NS = 256;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = NS;
  normalCanvas.height = NS;
  const nctx = normalCanvas.getContext('2d');
  const nImg = nctx.createImageData(NS, NS);
  const nd = nImg.data;
  const TWO_PI = Math.PI * 2;

  const waveH = (u, v) => {
    const a = u * TWO_PI;
    const b = v * TWO_PI;
    return Math.sin(a * 4 + b * 2) * 0.28
      + Math.cos(a * 6 - b * 3 + 1.1) * 0.22
      + Math.sin(a * 10 + b * 5 + 2.4) * 0.15
      + Math.cos(a * 3 + b * 7 - 0.6) * 0.18
      + Math.sin(a * 14 - b * 8 + 0.9) * 0.09
      + Math.cos(a * 8 + b * 12 + 1.7) * 0.08;
  };

  const eps = 1 / NS;
  const strength = 2.35;
  for (let py = 0; py < NS; py++) {
    const v = py / NS;
    for (let px = 0; px < NS; px++) {
      const u = px / NS;
      const hx = (waveH(u + eps, v) - waveH(u - eps, v)) * strength;
      const hy = (waveH(u, v + eps) - waveH(u, v - eps)) * strength;
      let nx = -hx;
      let ny = -hy;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const idx = (py * NS + px) * 4;
      nd[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      nd[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nd[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nd[idx + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);

  // 3. Secondary Flowing Whitewater Shimmer & Current Streak Overlay Map
  const foamCanvas = document.createElement('canvas');
  foamCanvas.width = S;
  foamCanvas.height = S;
  const fctx = foamCanvas.getContext('2d');
  fctx.clearRect(0, 0, S, S);

  for (let i = 0; i < 140; i++) {
    const edgeBias = wrand();
    const uNorm = edgeBias < 0.32 ? 0.05 + wrand() * 0.11
      : edgeBias < 0.64 ? 0.84 + wrand() * 0.11
        : 0.20 + wrand() * 0.60;
    const x = uNorm * S;
    const y = wrand() * S;
    const len = edgeBias < 0.64 ? 22 + wrand() * 54 : 38 + wrand() * 88;
    const alpha = edgeBias < 0.64 ? 0.24 + wrand() * 0.24 : 0.10 + wrand() * 0.16;
    fctx.strokeStyle = `rgba(242, 250, 252, ${alpha})`;
    fctx.lineWidth = edgeBias < 0.64 ? 1.8 + wrand() * 2.4 : 1.1 + wrand() * 1.8;
    fctx.lineCap = 'round';
    for (const dy of [-S, 0, S]) {
      fctx.beginPath();
      fctx.moveTo(x, y + dy);
      fctx.quadraticCurveTo(x + (wrand() - 0.5) * 10, y + dy + len * 0.5, x + (wrand() - 0.5) * 5, y + dy + len);
      fctx.stroke();
    }
  }

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.wrapS = THREE.ClampToEdgeWrapping;
  colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.repeat.set(1, 5.5);
  colorTex.anisotropy = 8;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(2.2, 13.0);
  normalTex.anisotropy = 4;

  const foamTex = new THREE.CanvasTexture(foamCanvas);
  foamTex.colorSpace = THREE.SRGBColorSpace;
  foamTex.wrapS = THREE.ClampToEdgeWrapping;
  foamTex.wrapT = THREE.RepeatWrapping;
  foamTex.repeat.set(1, 6.8);
  foamTex.anisotropy = 4;

  return { colorTex, normalTex, foamTex };
}

function buildFlowingRiver(parent) {
  const waterGroup = new THREE.Group();
  const { colorTex, normalTex, foamTex } = createFlowingWaterTextures();

  // Build curved UV-mapped ribbon geometry strictly following riverCenterX(z) so UV.y flows around every bend!
  const makeRiverRibbon = (widthMul, yOffset) => {
    const stepsZ = 210;
    const stepsU = 14;
    const positions = [];
    const uvs = [];
    const indices = [];
    let arcLen = 0;
    let prevX = riverCenterX(-WORLD_D / 2);
    let prevZ = -WORLD_D / 2;

    for (let iz = 0; iz <= stepsZ; iz++) {
      const z = -WORLD_D / 2 + (iz / stepsZ) * WORLD_D;
      const cx = riverCenterX(z);
      if (iz > 0) {
        arcLen += Math.hypot(cx - prevX, z - prevZ);
      }
      prevX = cx;
      prevZ = z;

      // Local perpendicular across the river channel for clean cross-sections
      const dxdz = (riverCenterX(z + 0.25) - riverCenterX(z - 0.25)) / 0.5;
      const invN = 1 / Math.hypot(1, dxdz);
      const nx = invN;
      const nz = -dxdz * invN;
      const hw = riverHalfWidth(z) * widthMul;

      for (let iu = 0; iu <= stepsU; iu++) {
        const u = iu / stepsU;
        const offset = (u * 2 - 1) * hw;
        const px = cx + nx * offset;
        const pz = z + nz * offset;
        // Subtle gentle surface crown in the center of the current
        const crown = Math.sin(u * Math.PI) * 0.015;
        positions.push(px, yOffset + crown, pz);
        uvs.push(u, arcLen / 10.5);
      }
    }

    const row = stepsU + 1;
    for (let iz = 0; iz < stepsZ; iz++) {
      for (let iu = 0; iu < stepsU; iu++) {
        const a = iz * row + iu;
        const b = a + 1;
        const c = (iz + 1) * row + iu;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  // Primary reflective flowing river surface
  const waterGeom = makeRiverRibbon(1.36, -0.18);
  const waterMat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.14,
    metalness: 0.36,
    transparent: true,
    opacity: 0.92,
  });
  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.receiveShadow = true;
  waterGroup.add(waterMesh);

  // Secondary counter-speed flowing current shimmer & bank foam overlay
  const foamGeom = makeRiverRibbon(1.16, -0.155);
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const foamMesh = new THREE.Mesh(foamGeom, foamMat);
  waterGroup.add(foamMesh);

  // Animated V-shaped whitewater wakes behind the two stone bridge piers & northern alpine rapids
  const wakeCanvas = document.createElement('canvas');
  wakeCanvas.width = 128;
  wakeCanvas.height = 256;
  const wk = wakeCanvas.getContext('2d');
  wk.clearRect(0, 0, 128, 256);
  const wg = wk.createLinearGradient(0, 0, 0, 256);
  wg.addColorStop(0, 'rgba(244, 252, 255, 0.85)');
  wg.addColorStop(0.45, 'rgba(225, 245, 250, 0.42)');
  wg.addColorStop(1, 'rgba(225, 245, 250, 0)');
  wk.strokeStyle = wg;
  wk.lineCap = 'round';
  wk.lineWidth = 10;
  wk.beginPath();
  wk.moveTo(64, 10);
  wk.quadraticCurveTo(38, 120, 14, 245);
  wk.moveTo(64, 10);
  wk.quadraticCurveTo(90, 120, 114, 245);
  wk.stroke();
  wk.lineWidth = 4;
  wk.beginPath();
  wk.moveTo(64, 18);
  wk.lineTo(64, 175);
  wk.stroke();

  const wakeTex = new THREE.CanvasTexture(wakeCanvas);
  wakeTex.colorSpace = THREE.SRGBColorSpace;
  const wakeMat = new THREE.MeshBasicMaterial({
    map: wakeTex,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  const pierWakes = [];
  const bx = riverCenterX(BRIDGE_Z);
  for (const offset of [-1.62, 1.62]) {
    const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.7), wakeMat.clone());
    wMesh.rotation.x = -Math.PI / 2;
    wMesh.position.set(bx + offset, -0.145, BRIDGE_Z + 1.95);
    waterGroup.add(wMesh);
    pierWakes.push({ mesh: wMesh, baseZ: BRIDGE_Z + 1.95, phase: offset });
  }

  // Northern headwater rapids foam strips where river descends out of the alpine valley
  const rapidsWakes = [];
  for (const rz of [-22.5, -19.2, -16.0]) {
    const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(riverHalfWidth(rz) * 1.15, 3.4), wakeMat.clone());
    rMesh.rotation.x = -Math.PI / 2;
    const dx = riverCenterX(rz + 0.5) - riverCenterX(rz - 0.5);
    rMesh.rotation.z = -Math.atan2(dx, 1.0);
    rMesh.position.set(riverCenterX(rz), -0.145, rz);
    rMesh.material.opacity = 0.42;
    waterGroup.add(rMesh);
    rapidsWakes.push({ mesh: rMesh, phase: rz * 0.4 });
  }

  parent.add(waterGroup);
  return { waterGroup, waterMesh, foamMesh, colorTex, normalTex, foamTex, pierWakes, rapidsWakes, wakeTex };
}

// ── 3. BUILD SMOOTH REALISTIC TERRAIN, WAR-ROOM FRAME & FLOWING RIVER ────────
function buildCampaignTerrain(scene, farmPlots) {
  const segX = 192;
  const segZ = 144;
  const geom = new THREE.PlaneGeometry(WORLD_W, WORLD_D, segX, segZ);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const baseHeights = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    baseHeights[i] = h;
  }

  // Compute smooth vertex normals FIRST so we can drive realistic slope-aware rock & snow blending!
  geom.computeVertexNormals();
  const norm = geom.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  // Natural continuous biome palette (zero hard threshold banding!)
  const cRiverBed = new THREE.Color(0x454a3d);
  const cWetBank = new THREE.Color(0x9a8b67);
  const cSandShore = new THREE.Color(0xcab98b);
  const cLushMeadow = new THREE.Color(0x638248);
  const cSunlitMeadow = new THREE.Color(0x7e9855);
  const cGoldenField = new THREE.Color(0xa6a45b);
  const cFoothill = new THREE.Color(0x4b663d);
  const cCliffRock = new THREE.Color(0x6e736b);
  const cDarkSlate = new THREE.Color(0x565c59);
  const cSnow = new THREE.Color(0xeef2f5);
  const cTerrace = new THREE.Color(0x9e9376);
  const c = new THREE.Color();
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = baseHeights[i];
    const ny = norm.getY(i);
    const slope = Math.max(0, 1 - ny);

    const rx = riverCenterX(z);
    const rDist = Math.abs(x - rx);
    const rw = riverHalfWidth(z);

    // Smooth fBm grass & pasture richness variation
    const nGrass = fbm2D(x * 0.14 + 3.1, z * 0.14 - 2.7, 3) * 0.5 + 0.5;
    const nField = fbm2D(x * 0.11 - 4.2, z * 0.11 + 5.1, 2) * 0.5 + 0.5;

    // 1. Base meadow grass smoothly blended across organic sunlit & lush zones
    c.copy(cLushMeadow).lerp(cSunlitMeadow, smootherstep(0.28, 0.78, nGrass));

    // 2. Warm golden farmland valleys in interior lowlands
    const interiorMask = (1 - smootherstep(18, 26, Math.abs(x))) * (1 - smootherstep(14, 21, Math.abs(z)));
    const fieldBlend = smootherstep(0.56, 0.84, nField) * interiorMask * (1 - smootherstep(1.15, 1.85, h));
    c.lerp(cGoldenField, fieldBlend * 0.65);

    // 3. Deeper woodland moss on rising mountain foothills
    const foothillBlend = smootherstep(1.35, 3.0, h);
    c.lerp(cFoothill, foothillBlend * 0.72);

    // 4. Stratified alpine granite & dark slate rock on steep cliff faces & towering ridges
    const rockByHeight = smootherstep(2.55, 4.45, h);
    const rockBySlope = smootherstep(0.055, 0.24, slope) * smootherstep(0.95, 2.2, h);
    const rockBlend = Math.min(1, Math.max(rockByHeight * 0.94, rockBySlope * 0.96));
    const strata = Math.sin(h * 3.6 + nGrass * 2.4) * 0.5 + 0.5;
    tmp.copy(cCliffRock).lerp(cDarkSlate, smootherstep(0.14, 0.38, slope) * 0.75 + strata * 0.22);
    c.lerp(tmp, rockBlend);

    // 5. Gleaming snow-capped alpine peaks & wind-swept glacial ridges (steep sheer faces remain dark rock!)
    const snowByHigh = smootherstep(4.2, 6.2, h + (nGrass - 0.5) * 0.95);
    const snowCrown = smootherstep(6.0, 8.2, h);
    let snowMask = Math.min(1, Math.max(snowByHigh * (1 - smootherstep(0.24, 0.52, slope) * 0.72), snowCrown * 0.92));
    // Warm volcanic dragon cave shelf melts snow organically into natural dark alpine granite right around the nest!
    const lairD = Math.hypot(x - (DRAGON_LAIR.x + 0.4), z - (DRAGON_LAIR.z + 1.1));
    if (lairD < 4.2) {
      const melt = 1 - smootherstep(1.6, 4.2, lairD);
      snowMask *= (1 - melt * 0.92);
      c.lerp(cDarkSlate, melt * 0.62);
    }
    c.lerp(cSnow, snowMask);

    // 6. Smooth sandy shore -> wet gravel -> mossy submerged riverbed
    const shoreBand = (1 - smootherstep(rw * 0.72, rw + 1.55, rDist)) * (1 - smootherstep(0.15, 0.62, h));
    c.lerp(cSandShore, shoreBand * 0.72);
    const wetBand = 1 - smootherstep(-0.24, 0.14, h);
    c.lerp(cWetBank, wetBand * 0.65);
    const bedBand = 1 - smootherstep(-0.62, -0.14, h);
    c.lerp(cRiverBed, bedBand * 0.85);

    // 7. Ultra-soft organic grassy-earth blend directly under each venue (no circular pad!)
    for (const v of VENUE_SPECS) {
      const d = Math.hypot(x - v.x, z - v.z);
      const organicR = v.plateauR * (0.72 + (nGrass - 0.5) * 0.28);
      if (d < organicR + 1.4) {
        const blend = 1 - smootherstep(organicR * 0.35, organicR + 1.4, d);
        c.lerp(cSunlitMeadow, blend * 0.34);
      }
    }

    // 8. Gentle natural ambient occlusion in valleys and steep hillside creases
    const ao = 0.88 + 0.12 * ny * smootherstep(-0.6, 1.8, h);
    c.multiplyScalar(ao);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const baseColors = new Float32Array(colors);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  geom.setAttribute('color', colorAttr);

  // Live Undead Terrain Corruption: smoothly darkens meadow grass & earth into cursed ashen-violet & necrotic moss!
  const updateCorruption = territorySys => {
    if (!territorySys?.sampleUndeadCorruption) return;
    const arr = colorAttr.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const h = baseHeights[i];
      const br = baseColors[i3];
      const bg = baseColors[i3 + 1];
      const bb = baseColors[i3 + 2];
      if (h > 4.8) {
        arr[i3] = br;
        arr[i3 + 1] = bg;
        arr[i3 + 2] = bb;
        continue;
      }
      const corr = territorySys.sampleUndeadCorruption(pos.getX(i), pos.getZ(i));
      if (corr <= 0.005) {
        arr[i3] = br;
        arr[i3 + 1] = bg;
        arr[i3 + 2] = bb;
      } else {
        const highFade = h > 3.2 ? (1 - (h - 3.2) / 1.6) : 1.0;
        const k = Math.min(1, corr * 0.94 * highFade);
        // Dark cursed violet-ash soil with subtle eerie necrotic green moss variation in lowlands
        const mossTint = h < 0.85 ? 0.28 : 0.08;
        const tr = 0.145 * (1 - mossTint) + 0.105 * mossTint;
        const tg = 0.092 * (1 - mossTint) + 0.215 * mossTint;
        const tb = 0.205 * (1 - mossTint) + 0.155 * mossTint;
        arr[i3] = br + (tr - br) * k;
        arr[i3 + 1] = bg + (tg - bg) * k;
        arr[i3 + 2] = bb + (tb - bb) * k;
      }
    }
    colorAttr.needsUpdate = true;
  };

  const { map: terrainTex, bumpMap: terrainBump } = createCampaignTerrainTextures(farmPlots);
  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex,
    bumpMap: terrainBump,
    bumpScale: 0.11,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.03,
    flatShading: false,
  });
  const terrainMesh = new THREE.Mesh(geom, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // Solid 4-Sided Terrain-Conforming Diorama Cross-Section Skirt Wall
  // Seals ALL 4 outer edges (especially the towering Northern alpine mountains from the back POV!)
  // cleanly down into the war-room wooden table base so there is ZERO hollow gap from any camera angle!
  const skirtPos = [];
  const skirtCol = [];
  const skirtIdx = [];
  const skirtBottomY = -1.72;
  const cSubsoil = new THREE.Color(0x4a453d);
  const cBedrock = new THREE.Color(0x28313b);
  const cSkirtTop = new THREE.Color();
  const cSkirtBot = new THREE.Color();

  const pushEdgeRibbon = (steps, samplePt, flipWinding) => {
    const baseV = skirtPos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const [ex, ez] = samplePt(u);
      const topH = terrainHeight(ex, ez) + 0.03;
      // Match surface hue at the top edge (snow / alpine slate / meadow grass / sandy bank)
      if (topH > 4.4) cSkirtTop.copy(cSnow).lerp(cCliffRock, 0.35);
      else if (topH > 2.1) cSkirtTop.copy(cCliffRock);
      else if (topH > 0.15) cSkirtTop.copy(cFoothill).lerp(cSubsoil, 0.55);
      else cSkirtTop.copy(cRiverBed);
      cSkirtBot.copy(cBedrock);

      skirtPos.push(ex, topH, ez);
      skirtCol.push(cSkirtTop.r, cSkirtTop.g, cSkirtTop.b);
      skirtPos.push(ex, skirtBottomY, ez);
      skirtCol.push(cSkirtBot.r, cSkirtBot.g, cSkirtBot.b);

      if (i < steps) {
        const a = baseV + i * 2;
        const b = a + 1;
        const c2 = a + 2;
        const d = a + 3;
        if (flipWinding) {
          skirtIdx.push(a, c2, b, b, c2, d);
        } else {
          skirtIdx.push(a, b, c2, b, d, c2);
        }
      }
    }
  };
  // North back edge (-Z), South front edge (+Z), West edge (-X), East edge (+X)
  pushEdgeRibbon(140, u => [-WORLD_W / 2 + u * WORLD_W, -WORLD_D / 2], false);
  pushEdgeRibbon(140, u => [-WORLD_W / 2 + u * WORLD_W, WORLD_D / 2], true);
  pushEdgeRibbon(108, u => [-WORLD_W / 2, -WORLD_D / 2 + u * WORLD_D], true);
  pushEdgeRibbon(108, u => [WORLD_W / 2, -WORLD_D / 2 + u * WORLD_D], false);

  const skirtGeom = new THREE.BufferGeometry();
  skirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
  skirtGeom.setAttribute('color', new THREE.Float32BufferAttribute(skirtCol, 3));
  skirtGeom.setIndex(skirtIdx);
  skirtGeom.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
  skirtMesh.receiveShadow = true;
  scene.add(skirtMesh);

  // Cut-glass translucent river water end-caps at North & South borders so the river cross-section looks solid!
  const waterCapMat = new THREE.MeshStandardMaterial({
    color: 0x26658c,
    roughness: 0.28,
    metalness: 0.12,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  for (const capZ of [-WORLD_D / 2 + 0.02, WORLD_D / 2 - 0.02]) {
    const rxC = riverCenterX(capZ);
    const rwC = riverHalfWidth(capZ) * 1.15;
    const wCap = new THREE.Mesh(new THREE.PlaneGeometry(rwC * 2, 0.92), waterCapMat);
    wCap.position.set(rxC, -0.56, capZ);
    scene.add(wCap);
  }

  // Ornate Dark-Lapis & Antique-Gold War-Room Table Border Frame around the 68×52 realm
  const frameWood = new THREE.MeshStandardMaterial({ color: 0x132238, roughness: 0.65, metalness: 0.18 });
  const frameGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.34, metalness: 0.72 });
  const skirtH = 2.6;
  const skirtT = 0.85;
  const addBar = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
  };
  addBar(WORLD_W + skirtT * 2, skirtH, skirtT, frameWood, 0, -0.45, -WORLD_D / 2 - skirtT / 2);
  addBar(WORLD_W + skirtT * 2, skirtH, skirtT, frameWood, 0, -0.45, WORLD_D / 2 + skirtT / 2);
  addBar(skirtT, skirtH, WORLD_D, frameWood, -WORLD_W / 2 - skirtT / 2, -0.45, 0);
  addBar(skirtT, skirtH, WORLD_D, frameWood, WORLD_W / 2 + skirtT / 2, -0.45, 0);
  addBar(WORLD_W + skirtT * 2 + 0.15, 0.16, 0.24, frameGold, 0, 0.92, -WORLD_D / 2 - skirtT / 2);
  addBar(WORLD_W + skirtT * 2 + 0.15, 0.16, 0.24, frameGold, 0, 0.92, WORLD_D / 2 + skirtT / 2);
  addBar(0.24, 0.16, WORLD_D + skirtT * 2 + 0.15, frameGold, -WORLD_W / 2 - skirtT / 2, 0.92, 0);
  addBar(0.24, 0.16, WORLD_D + skirtT * 2 + 0.15, frameGold, WORLD_W / 2 + skirtT / 2, 0.92, 0);

  // Flowing, sunlit UV-mapped winding river with normal ripples, foam & bridge pier wakes!
  const river = buildFlowingRiver(scene);

  return { terrainMesh, skirtMesh, terrainGeom: geom, baseHeights, river, updateCorruption };
}

// Shared bridge transform & smooth arched road-surface height for any river crossing (Central, North & South)
function getBridgeMetrics(bz = BRIDGE_Z, span = 6.2, archRise = CENTRAL_ARCH_RISE) {
  const bx = riverCenterX(bz);
  const dx = riverCenterX(bz + 0.5) - riverCenterX(bz - 0.5);
  const rotY = -Math.atan2(dx, 1.0);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const halfSpan = span / 2;
  const toWorld = (lx, lz = 0) => [bx + lx * cos + lz * sin, bz - lx * sin + lz * cos];
  const [wlx, wlz] = toWorld(-halfSpan - 0.25, 0);
  const [elx, elz] = toWorld(halfSpan + 0.25, 0);
  const endL = Math.max(0.28, terrainHeight(wlx, wlz));
  const endR = Math.max(0.28, terrainHeight(elx, elz));
  const deckTopY = lx => {
    const t = Math.max(-1, Math.min(1, lx / (halfSpan + 0.35)));
    const base = endL * (1 - (t + 1) * 0.5) + endR * ((t + 1) * 0.5);
    const crown = Math.cos(t * Math.PI * 0.5);
    return base + archRise * crown * crown;
  };
  return { bx, bz, rotY, cos, sin, span, halfSpan, endL, endR, toWorld, deckTopY };
}

function buildCentralBridge(parent) {
  const bridge = new THREE.Group();
  const bm = getBridgeMetrics();
  bridge.position.set(bm.bx, 0, BRIDGE_Z);
  bridge.rotation.y = bm.rotY;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xbcb096, roughness: 0.84, metalness: 0.05 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x6f6759, roughness: 0.88, metalness: 0.07 });
  const cobbleMat = new THREE.MeshStandardMaterial({ color: 0xc4b48f, roughness: 0.90, metalness: 0.03 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.72 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff771a, emissiveIntensity: 1.6 });

  const span = bm.span;
  const halfSpan = bm.halfSpan;

  // Helper to build a smoothly arched masonry extrusion along local X (zero flat-slab step!)
  const makeArchedStrip = (x0, x1, segs, halfW, topFn, botFn, mat) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= segs; i++) {
      const x = x0 + (i / segs) * (x1 - x0);
      const y = topFn(x);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let i = segs; i >= 0; i--) {
      const x = x0 + (i / segs) * (x1 - x0);
      shape.lineTo(x, botFn(x));
    }
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: halfW * 2, bevelEnabled: false });
    geom.translate(0, 0, -halfW);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // High-arched stone bridge roadway deck with wide vaulted ship archway over the water & deep bank abutments!
  const deckMesh = makeArchedStrip(
    -halfSpan - 0.55,
    halfSpan + 0.55,
    36,
    0.92,
    x => bm.deckTopY(x),
    x => {
      const ax = Math.abs(x);
      // Deep solid stone abutments rooted cleanly into both embankments beyond the navigable channel
      if (ax > 2.35) return -0.55;
      // Gentle medieval stone arch leaving just enough snug clearance for passing river ships!
      const ribThick = 0.16 + smootherstep(1.15, 2.35, ax) * 0.36;
      return bm.deckTopY(x) - ribThick;
    },
    stoneMat
  );
  bridge.add(deckMesh);

  // Flared stone-and-earth approach aprons at West & East ends tapering gently below terrain to blend seamlessly!
  for (const dir of [-1, 1]) {
    const xStart = dir * (halfSpan + 0.25);
    const xEnd = dir * (halfSpan + 1.45);
    const x0 = Math.min(xStart, xEnd);
    const x1 = Math.max(xStart, xEnd);
    const apron = makeArchedStrip(
      x0,
      x1,
      8,
      1.04,
      x => {
        const frac = (Math.abs(x) - (halfSpan + 0.25)) / 1.20;
        const t = Math.max(0, Math.min(1, frac));
        const endH = dir < 0 ? bm.endL : bm.endR;
        return endH + 0.015 * (1 - t) - 0.14 * t * t;
      },
      () => -0.45,
      cobbleMat
    );
    bridge.add(apron);
  }

  // Twin smoothly curved stone parapets following the arch + deep-rooted piers & gilded finials
  for (const side of [-0.86, 0.86]) {
    const rail = makeArchedStrip(
      -halfSpan - 0.45,
      halfSpan + 0.45,
      24,
      0.085,
      x => bm.deckTopY(x) + 0.28 * (1 - smootherstep(halfSpan - 0.1, halfSpan + 0.45, Math.abs(x)) * 0.65),
      x => bm.deckTopY(x) - 0.14,
      darkStone
    );
    rail.position.z = side;
    bridge.add(rail);

    for (const px of [-halfSpan, 0, halfSpan]) {
      const topY = bm.deckTopY(px) + 0.34;
      // Keep center keystone pillar seated ON the arch parapet (never hanging down into the ship archway!)
      const pierH = px === 0 ? 0.52 : topY + 0.42;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.42, pierH, 0.36), darkStone);
      pier.position.set(px, topY - pierH / 2, side);
      pier.castShadow = true;
      bridge.add(pier);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.40), brassMat);
      cap.position.set(px, topY + 0.04, side);
      bridge.add(cap);

      if (px === 0) {
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), emberMat);
        flame.position.set(px, topY + 0.19, side);
        bridge.add(flame);
      }
    }
  }

  // Twin stone bridge gatehouse turrets flanking West & East entrances, grounded firmly into the hillsides
  const roofTimberBrown = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.78 });
  for (const endX of [-halfSpan - 0.15, halfSpan + 0.15]) {
    const baseTop = bm.deckTopY(endX);
    for (const side of [-0.98, 0.98]) {
      const turretH = 1.45;
      const turretTop = baseTop + 1.12;
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, turretH, 10), stoneMat);
      turret.position.set(endX, turretTop - turretH / 2, side);
      turret.castShadow = true;
      bridge.add(turret);

      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.60, 10), roofTimberBrown);
      spire.position.set(endX, turretTop + 0.28, side);
      spire.castShadow = true;
      bridge.add(spire);
    }
  }

  // Two flanking stone river piers framing a wide 2.9-unit central navigation archway for passing ships!
  for (const px of [-1.72, 1.72]) {
    const legTop = bm.deckTopY(px) - 0.12;
    const legH = legTop + 0.72;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.52, legH, 1.98), darkStone);
    leg.position.set(px, legTop - legH / 2, 0);
    leg.castShadow = true;
    bridge.add(leg);
  }

  parent.add(bridge);

  // Add 2 smaller high-arched stone-and-timber bridges on the North & South river reaches
  // with wide vaulted central archways so ships sail smoothly right underneath all 3 bridges!
  const timberRailMat = new THREE.MeshStandardMaterial({ color: 0x694a2d, roughness: 0.88 });
  const buildSmallerBridge = (bz, span) => {
    const sm = getBridgeMetrics(bz, span, SIDE_ARCH_RISE);
    const sb = new THREE.Group();
    sb.position.set(sm.bx, 0, bz);
    sb.rotation.y = sm.rotY;
    const hs = sm.halfSpan;
    const halfW = 0.58;

    // Soaring arched stone-and-timber deck with wide vaulted clearance over the river channel
    const sDeck = makeArchedStrip(
      -hs - 0.45,
      hs + 0.45,
      28,
      halfW,
      x => sm.deckTopY(x),
      x => {
        const ax = Math.abs(x);
        if (ax > hs * 0.78) return -0.52;
        const ribThick = 0.14 + smootherstep(hs * 0.42, hs * 0.78, ax) * 0.32;
        return sm.deckTopY(x) - ribThick;
      },
      stoneMat
    );
    sb.add(sDeck);

    // Flared cobble-earth approach ramps blending seamlessly into both riverbanks
    for (const dir of [-1, 1]) {
      const xStart = dir * (hs + 0.20);
      const xEnd = dir * (hs + 1.15);
      const apron = makeArchedStrip(
        Math.min(xStart, xEnd),
        Math.max(xStart, xEnd),
        6,
        halfW + 0.12,
        x => {
          const frac = (Math.abs(x) - (hs + 0.20)) / 0.95;
          const t = Math.max(0, Math.min(1, frac));
          const endH = dir < 0 ? sm.endL : sm.endR;
          return endH + 0.012 * (1 - t) - 0.12 * t * t;
        },
        () => -0.45,
        cobbleMat
      );
      sb.add(apron);
    }

    // Low rustic stone-and-timber side railings + small corner posts & warm bridge lanterns
    for (const side of [-(halfW - 0.06), halfW - 0.06]) {
      const rail = makeArchedStrip(
        -hs - 0.35,
        hs + 0.35,
        18,
        0.06,
        x => sm.deckTopY(x) + 0.20 * (1 - smootherstep(hs - 0.1, hs + 0.35, Math.abs(x)) * 0.6),
        x => sm.deckTopY(x) - 0.10,
        timberRailMat
      );
      rail.position.z = side;
      sb.add(rail);

      for (const px of [-hs, 0, hs]) {
        const topY = sm.deckTopY(px) + 0.26;
        // Center crown post stays cleanly on the parapet so the ship archway underneath is wide open!
        const postH = px === 0 ? 0.38 : topY + 0.35;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, postH, 0.24), darkStone);
        post.position.set(px, topY - postH / 2, side);
        post.castShadow = true;
        sb.add(post);
        if (px === 0) {
          const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), emberMat);
          lantern.position.set(px, topY + 0.09, side);
          sb.add(lantern);
        }
      }
    }

    // Flanking stone bank piers set cleanly wide of the central ship archway!
    for (const px of [-hs * 0.66, hs * 0.66]) {
      const legTop = sm.deckTopY(px) - 0.12;
      const legH = legTop + 0.68;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.38, legH, halfW * 2 + 0.12), darkStone);
      leg.position.set(px, legTop - legH / 2, 0);
      leg.castShadow = true;
      sb.add(leg);
    }
    parent.add(sb);
  };

  buildSmallerBridge(NORTH_BRIDGE_Z, 4.9);
  buildSmallerBridge(SOUTH_BRIDGE_Z, 5.4);

  return bridge;
}

// Living Medieval Countryside: Windmills, Villages with Chimney Smoke, Watchtowers,
// Festival Tents, Docks, River Barges with Wakes, Sculpted Boulders, Swaying River Reeds,
// Meadow Shrubs & Wildflowers, Drifting Clouds & Soaring Eagles!
function buildLivingCountryside(parent, wakeTex) {
  const country = new THREE.Group();
  const spinningSails = [];
  const riverBoats = [];
  const driftingClouds = [];
  const soaringEagles = [];
  const towerFlames = [];
  const chimneyPuffs = [];

  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xeee5cf, roughness: 0.88 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x573b24, roughness: 0.85 });
  const roofTerracotta = new THREE.MeshStandardMaterial({ color: 0x9b4732, roughness: 0.82 });
  const roofSlate = new THREE.MeshStandardMaterial({ color: 0x455666, roughness: 0.80 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9d9685, roughness: 0.86 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x676258, roughness: 0.88 });
  const sailCloth = new THREE.MeshStandardMaterial({ color: 0xf6eed8, roughness: 0.78, side: THREE.DoubleSide });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4b563, roughness: 0.94 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.36, metalness: 0.70 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6b1a, emissiveIntensity: 1.7 });
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xf2ede4, transparent: true, opacity: 0.28, depthWrite: false });
  const tentColors = [
    new THREE.MeshStandardMaterial({ color: 0x992a35, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x265278, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x2c6345, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0xc99c3c, roughness: 0.68 }),
  ];

  // Dynamic territory-colored landmark registry (houses, barns & mini castles update roofs as territory shifts!)
  const dynamicStructures = [];
  const castleFlags = [];
  const FACTION_ROOF_COLORS = [
    new THREE.Color(0xb22836), // 0: Red (Royal Lists)
    new THREE.Color(0x2860a6), // 1: Blue (Iron Colosseum)
    new THREE.Color(0x2b7d48), // 2: Green (King's Green)
    new THREE.Color(0xd17c1e), // 3: Orange (Great Hall)
    new THREE.Color(0x4a2261), // 4: Undead Cursed Blight
    new THREE.Color(0x7c8087), // 5: Neutral Unclaimed Grey Wasteland
  ];
  const FACTION_ROOF_SHADES = [
    new THREE.Color(0x8f1f2b),
    new THREE.Color(0x1f4d87),
    new THREE.Color(0x216338),
    new THREE.Color(0xab6216),
    new THREE.Color(0x321445),
    new THREE.Color(0x61656c),
  ];
  const windowGlowMat = new THREE.MeshStandardMaterial({ color: 0xffd782, emissive: 0xff9d2e, emissiveIntensity: 0.72, roughness: 0.35 });
  const millStoneMat = new THREE.MeshStandardMaterial({ color: 0x87837a, roughness: 0.90 });
  const keepStoneMat = new THREE.MeshStandardMaterial({ color: 0x9b968a, roughness: 0.88 });
  const keepDarkStone = new THREE.MeshStandardMaterial({ color: 0x736f66, roughness: 0.90 });
  const brassCapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.36, metalness: 0.68 });

  const makeDynamicRoofMat = (wx, wz, shadeIdx = 0) => {
    const startTm = (wx < riverCenterX(wz))
      ? (Math.hypot(wx - VENUE_SPECS[0].x, wz - VENUE_SPECS[0].z) <= Math.hypot(wx - VENUE_SPECS[3].x, wz - VENUE_SPECS[3].z) ? 0 : 3)
      : (Math.hypot(wx - VENUE_SPECS[1].x, wz - VENUE_SPECS[1].z) <= Math.hypot(wx - VENUE_SPECS[2].x, wz - VENUE_SPECS[2].z) ? 1 : 2);
    const palette = shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
    const mat = new THREE.MeshStandardMaterial({ color: palette[startTm].clone(), roughness: 0.76 });
    dynamicStructures.push({ x: wx, z: wz, mat, shadeIdx, curTeam: startTm, targetColor: palette[startTm].clone() });
    return mat;
  };

  // ── A. 3 DETAILED ROTATING MEDIEVAL WINDMILLS & GRANARY BARNS ──────────────
  // Shaft projects cleanly forward (z = +0.66, y = 1.48) with slight upward tilt so sails NEVER phase through the body!
  for (const wm of WINDMILL_COORDS) {
    const g = new THREE.Group();
    const y = terrainHeight(wm.x, wm.z);
    g.position.set(wm.x, y, wm.z);
    g.rotation.y = wm.rotY;

    // Octagonal dressed-stone foundation plinth
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.32, 8), millStoneMat);
    plinth.position.y = 0.14;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    // Tapered lime-plaster tower body with horizontal timber reinforcement rings
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, 1.38, 12), plasterMat);
    base.position.y = 0.96;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    for (const ry of [0.34, 1.24, 1.60]) {
      const rRad = 0.54 - ((ry - 0.27) / 1.38) * 0.18 + 0.025;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rRad, rRad, 0.055, 12), timberMat);
      ring.position.y = ry;
      g.add(ring);
    }

    // Wrap-around elevated timber gallery balcony (y = 0.76) with 8 support posts & railing
    const galleryDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.06, 12), timberMat);
    galleryDeck.position.y = 0.76;
    galleryDeck.castShadow = true;
    g.add(galleryDeck);
    const galleryRail = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.024, 6, 16), timberMat);
    galleryRail.rotation.x = Math.PI / 2;
    galleryRail.position.y = 0.94;
    g.add(galleryRail);
    for (let p = 0; p < 8; p++) {
      const pa = (p / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.22, 0.036), timberMat);
      post.position.set(Math.cos(pa) * 0.58, 0.85, Math.sin(pa) * 0.58);
      g.add(post);
    }

    // Arched oak mill doorway & warm glowing mullioned windows
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.09), timberMat);
    doorFrame.position.set(0, 0.36, 0.54);
    g.add(doorFrame);
    for (const [wa, wy] of [[0.9, 1.12], [-0.9, 1.12], [Math.PI, 1.35]]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.06), windowGlowMat);
      const rW = 0.43;
      win.position.set(Math.sin(wa) * rW, wy, Math.cos(wa) * rW);
      win.rotation.y = wa;
      g.add(win);
    }

    // Shingled rotating dome cap (faction-colored!) + brass spire finial
    const capMat = makeDynamicRoofMat(wm.x, wm.z, 1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.54, 12), capMat);
    cap.position.y = 1.90;
    cap.castShadow = true;
    g.add(cap);
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), brassCapMat);
    finial.position.y = 2.20;
    g.add(finial);

    // Rear wooden tail-pole steering beam bracing down from the cap
    const tailPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.030, 1.65, 6), timberMat);
    tailPole.position.set(0, 1.05, -0.78);
    tailPole.rotation.x = -0.62;
    g.add(tailPole);

    // Projecting front windshaft housing & axle (extends cleanly past balcony & stone plinth -> ZERO sail phasing!)
    const shaftBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.42), timberMat);
    shaftBox.position.set(0, 1.54, 0.46);
    g.add(shaftBox);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.24, 8), timberMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, 1.54, 0.64);
    g.add(axle);

    // 4-blade detailed latticed sail hub mounted cleanly at z = +0.72, y = 1.54 (angled slightly outward!)
    const hub = new THREE.Group();
    hub.position.set(0, 1.54, 0.72);
    hub.rotation.x = -0.08;
    const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), brassCapMat);
    hub.add(hubCap);
    for (let b = 0; b < 4; b++) {
      const armGroup = new THREE.Group();
      armGroup.rotation.z = (b * Math.PI) / 2;
      // Main wooden sail stock
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.048, 1.12, 0.048), timberMat);
      spar.position.y = 0.56;
      spar.castShadow = true;
      armGroup.add(spar);
      // Outer lattice rail & 5 horizontal timber sail ribs
      const outerRail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.84, 0.022), timberMat);
      outerRail.position.set(0.25, 0.68, 0.01);
      armGroup.add(outerRail);
      for (const ry of [0.30, 0.48, 0.66, 0.84, 1.02]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.024), timberMat);
        slat.position.set(0.13, ry, 0.01);
        armGroup.add(slat);
      }
      // Cream canvas sail cloth stretched along the lattice frame
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.014), sailCloth);
      cloth.position.set(0.13, 0.67, 0.018);
      cloth.castShadow = true;
      armGroup.add(cloth);
      hub.add(armGroup);
    }
    g.add(hub);
    spinningSails.push({ hub, speed: 0.82 + Math.abs(wm.x) * 0.018 });
    country.add(g);

    // Cozy timber-and-stone medieval granary barn right beside each windmill (dynamic faction roof!)
    const bx = wm.x + wm.barnDx;
    const bz = wm.z + wm.barnDz;
    const by = terrainHeight(bx, bz);
    if (by > 0.18) {
      const barn = new THREE.Group();
      barn.position.set(bx, by, bz);
      barn.rotation.y = wm.rotY - 0.55;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.44, 0.56), plasterMat);
      walls.position.y = 0.21;
      walls.castShadow = true;
      walls.receiveShadow = true;
      barn.add(walls);
      const gable = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.38, 4), makeDynamicRoofMat(bx, bz, 0));
      gable.position.y = 0.61;
      gable.rotation.y = Math.PI / 4;
      gable.scale.set(1.15, 1, 0.72);
      gable.castShadow = true;
      barn.add(gable);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.30, 0.04), timberMat);
      door.position.set(0, 0.15, 0.28);
      barn.add(door);
      country.add(barn);
    }
  }

  // ── B. 18 BALANCED MEDIEVAL VILLAGES / HAMLETS (INSTANCED FOR ZERO LAG + DYNAMIC TERRITORY ROOFS!) ─
  const hamlets = [
    // West Bank — Red (NW)
    { cx: -17.8, cz: -12.2, houses: 4 },  // Northern Silverlance village
    { cx: -5.6, cz: -12.6, houses: 3 },  // North Bridge West hamlet
    { cx: -21.2, cz: -2.4, houses: 4 },  // West Woods hamlet
    { cx: -23.8, cz: -7.6, houses: 4 },  // Westwatch Valley hamlet
    { cx: -12.4, cz: -2.2, houses: 3 },  // Silverlance South Meadow
    // East Bank — Blue (NE)
    { cx: 6.6, cz: -5.8, houses: 5 },  // East Bank north village
    { cx: 12.4, cz: -12.8, houses: 4 },  // Alpine Foothills village
    { cx: 22.8, cz: -8.6, houses: 4 },  // East Ridge hamlet
    { cx: 21.4, cz: 2.2, houses: 5 },  // Old Orchard hamlet
    // East Bank — Green (SE)
    { cx: 17.8, cz: 14.8, houses: 4 },  // Greenwood Meadow village
    { cx: 11.4, cz: 16.4, houses: 4 },  // Willowmere East hamlet
    { cx: 23.2, cz: 8.6, houses: 4 },  // King's Timberland village
    { cx: 6.4, cz: 14.8, houses: 3 },  // South Bridge East hamlet
    // West Bank — Orange (SW)
    { cx: -8.4, cz: 4.0, houses: 5 },  // West King's Road village
    { cx: -14.8, cz: 15.8, houses: 4 },  // Great Hall South hamlet
    { cx: -25.4, cz: 6.2, houses: 4 },  // Far West Hearth hamlet
    { cx: -21.6, cz: 11.4, houses: 4 },  // Hearthstone Valley village
    { cx: -8.2, cz: 14.8, houses: 4 },  // South-West Meadows hamlet
  ];
  const smokeGeom = new THREE.SphereGeometry(0.12, 6, 5);
  const houseSpecs = [];
  const haySpecs = [];

  hamlets.forEach((ham, hIdx) => {
    for (let i = 0; i < ham.houses; i++) {
      const ang = (i / ham.houses) * Math.PI * 2 + hIdx * 0.7;
      const dist = 0.75 + (i % 2) * 0.72;
      const hx = ham.cx + Math.cos(ang) * dist;
      const hz = ham.cz + Math.sin(ang) * dist;
      const hy = terrainHeight(hx, hz);
      if (hy < 0.25 || hy > 3.2) continue;
      if (Math.abs(hx - riverCenterX(hz)) < riverHalfWidth(hz) + 1.0) continue;
      let tooCloseVenue = false;
      for (const v of VENUE_SPECS) {
        if (Math.hypot(hx - v.x, hz - v.z) < v.plateauR + 1.1) { tooCloseVenue = true; break; }
      }
      if (tooCloseVenue) continue;

      const w = 0.56 + (i % 2) * 0.18;
      const d = 0.45 + ((i + 1) % 2) * 0.14;
      const startTm = (hx < riverCenterX(hz))
        ? (Math.hypot(hx - VENUE_SPECS[0].x, hz - VENUE_SPECS[0].z) <= Math.hypot(hx - VENUE_SPECS[3].x, hz - VENUE_SPECS[3].z) ? 0 : 3)
        : (Math.hypot(hx - VENUE_SPECS[1].x, hz - VENUE_SPECS[1].z) <= Math.hypot(hx - VENUE_SPECS[2].x, hz - VENUE_SPECS[2].z) ? 1 : 2);
      houseSpecs.push({ x: hx, y: hy, z: hz, rotY: ang + 0.5, w, d, shadeIdx: i % 2, curTeam: startTm });

      // Gentle rising hearth smoke wisps on one cottage per hamlet (every other hamlet for light GPU cost)
      if (i === 0 && hIdx % 2 === 0) {
        for (let p = 0; p < 2; p++) {
          const puff = new THREE.Mesh(smokeGeom, smokeMat);
          puff.position.set(hx, hy + 0.82, hz);
          country.add(puff);
          chimneyPuffs.push({ mesh: puff, bx: hx, by: hy + 0.80, bz: hz, phase: hIdx * 1.1 + p * 0.5 });
        }
      }
    }
    for (let k = 0; k < 2; k++) {
      const sx = ham.cx + (k === 0 ? 1.50 : -1.40);
      const sz = ham.cz + (k === 0 ? -0.95 : 1.05);
      const sy = terrainHeight(sx, sz);
      if (sy < 0.25 || sy > 3.2) continue;
      haySpecs.push({ x: sx, y: sy, z: sz });
    }
  });

  // Render ALL ~48 village cottages in just 6 GPU InstancedMeshes (6 draw calls instead of 300+!)
  const hDummy = new THREE.Object3D();
  const hCol = new THREE.Color();
  const dynHouseInstRecords = [];
  let dynHouseRoofInst = null;
  if (houseSpecs.length) {
    const hFndInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.10, 1), millStoneMat, houseSpecs.length);
    const hBodyInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.42, 1), plasterMat, houseSpecs.length);
    const hDoorInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.24, 0.03), timberMat, houseSpecs.length);
    const hWinInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.03), windowGlowMat, houseSpecs.length);
    const hChimInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.34, 0.11), millStoneMat, houseSpecs.length);
    const roofGeom = new THREE.ConeGeometry(0.80, 0.38, 4);
    roofGeom.rotateY(Math.PI / 4);
    dynHouseRoofInst = new THREE.InstancedMesh(roofGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 }), houseSpecs.length);
    hBodyInst.castShadow = true;
    hBodyInst.receiveShadow = true;
    dynHouseRoofInst.castShadow = true;

    houseSpecs.forEach((hs, idx) => {
      const cos = Math.cos(hs.rotY);
      const sin = Math.sin(hs.rotY);
      const toW = (lx, ly, lz) => [hs.x + lx * cos + lz * sin, hs.y + ly, hs.z - lx * sin + lz * cos];

      hDummy.position.set(hs.x, hs.y + 0.04, hs.z);
      hDummy.rotation.set(0, hs.rotY, 0);
      hDummy.scale.set(hs.w + 0.05, 1, hs.d + 0.05);
      hDummy.updateMatrix();
      hFndInst.setMatrixAt(idx, hDummy.matrix);

      hDummy.position.set(hs.x, hs.y + 0.26, hs.z);
      hDummy.scale.set(hs.w, 1, hs.d);
      hDummy.updateMatrix();
      hBodyInst.setMatrixAt(idx, hDummy.matrix);

      const [dx0, dy0, dz0] = toW(-hs.w * 0.16, 0.19, hs.d * 0.5 + 0.008);
      hDummy.position.set(dx0, dy0, dz0);
      hDummy.scale.set(1, 1, 1);
      hDummy.updateMatrix();
      hDoorInst.setMatrixAt(idx, hDummy.matrix);

      const [wx0, wy0, wz0] = toW(hs.w * 0.18, 0.28, hs.d * 0.5 + 0.008);
      hDummy.position.set(wx0, wy0, wz0);
      hDummy.updateMatrix();
      hWinInst.setMatrixAt(idx, hDummy.matrix);

      const [cx0, cy0, cz0] = toW(hs.w * 0.26, 0.64, -hs.d * 0.15);
      hDummy.position.set(cx0, cy0, cz0);
      hDummy.updateMatrix();
      hChimInst.setMatrixAt(idx, hDummy.matrix);

      const rScale = Math.max(hs.w, hs.d);
      hDummy.position.set(hs.x, hs.y + 0.65, hs.z);
      hDummy.scale.set(rScale, 1, rScale);
      hDummy.updateMatrix();
      dynHouseRoofInst.setMatrixAt(idx, hDummy.matrix);

      const pal = hs.shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
      const curCol = pal[hs.curTeam].clone();
      dynHouseRoofInst.setColorAt(idx, curCol);
      dynHouseInstRecords.push({ idx, x: hs.x, z: hs.z, shadeIdx: hs.shadeIdx, curTeam: hs.curTeam, color: curCol, targetColor: curCol.clone() });
    });

    for (const inst of [hFndInst, hBodyInst, hDoorInst, hWinInst, hChimInst, dynHouseRoofInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      country.add(inst);
    }
  }
  if (haySpecs.length) {
    const hayInst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.34, 8), hayMat, haySpecs.length);
    haySpecs.forEach((hp, idx) => {
      hDummy.position.set(hp.x, hp.y + 0.15, hp.z);
      hDummy.rotation.set(0, idx, 0);
      hDummy.scale.setScalar(1);
      hDummy.updateMatrix();
      hayInst.setMatrixAt(idx, hDummy.matrix);
    });
    hayInst.instanceMatrix.needsUpdate = true;
    country.add(hayInst);
  }

  // ── B2. 6 MEDIEVAL MINI CASTLES / FRONTIER STONE KEEPS (DYNAMIC FACTION ROOFS & BANNERS!) ─
  const miniCastles = [
    { x: -21.8, z: -10.8, rotY: 0.45, scale: 1.04 }, // Westwatch Keep (NW)
    { x: -5.4, z: -14.0, rotY: 0.10, scale: 0.92 }, // Northmarch Bastion (NW)
    { x: 18.6, z: -12.6, rotY: -0.35, scale: 1.04 }, // Frostpeak Keep (NE)
    { x: 24.0, z: -2.0, rotY: -1.15, scale: 0.95 }, // Eastcrest Hold (NE)
    { x: 21.0, z: 13.8, rotY: -2.20, scale: 1.02 }, // Greenwood Citadel (SE)
    { x: -23.2, z: 14.0, rotY: 0.95, scale: 1.04 }, // Hearthstone Keep (SW)
  ];
  miniCastles.forEach((mc, mIdx) => {
    const cy = terrainHeight(mc.x, mc.z);
    if (cy < 0.25) return;
    const cg = new THREE.Group();
    cg.position.set(mc.x, cy, mc.z);
    cg.rotation.y = mc.rotY;
    cg.scale.setScalar(mc.scale);

    const castleRoofMat = makeDynamicRoofMat(mc.x, mc.z, 0);
    const castleBannerMat = makeDynamicRoofMat(mc.x, mc.z, 0);

    // Dressed stone foundation plinth & outer crenellated curtain wall
    const cPlinth = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.26, 2.05), keepDarkStone);
    cPlinth.position.y = 0.08;
    cPlinth.receiveShadow = true;
    cg.add(cPlinth);

    // 4 Curtain wall segments + merlon battlements
    const wallSpecs = [
      [1.76, 0.72, 0.22, 0, 0.48, -0.82],
      [1.76, 0.72, 0.22, 0, 0.48, 0.82],
      [0.22, 0.72, 1.76, -0.82, 0.48, 0],
      [0.22, 0.72, 1.76, 0.82, 0.48, 0],
    ];
    for (const [ww, wh, wd, wx0, wy0, wz0] of wallSpecs) {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), keepStoneMat);
      wMesh.position.set(wx0, wy0, wz0);
      wMesh.castShadow = true;
      wMesh.receiveShadow = true;
      cg.add(wMesh);
    }
    // Crenellations along north & south walls
    for (const mz of [-0.82, 0.82]) {
      for (const mx of [-0.52, -0.18, 0.18, 0.52]) {
        const mer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.24), keepStoneMat);
        mer.position.set(mx, 0.90, mz);
        cg.add(mer);
      }
    }

    // Timber-and-iron arched Gatehouse portal on the front (+Z) wall
    const gateArch = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.16), keepDarkStone);
    gateArch.position.set(0, 0.40, 0.88);
    cg.add(gateArch);
    const gateDoor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.38, 0.08), timberMat);
    gateDoor.position.set(0, 0.34, 0.94);
    cg.add(gateDoor);

    // 4 Corner cylindrical watch turrets with dynamic territory-colored conical roofs!
    for (const [tx, tz] of [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]]) {
      const tur = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.24, 9), keepStoneMat);
      tur.position.set(tx, 0.74, tz);
      tur.castShadow = true;
      cg.add(tur);
      const tCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.12, 9), keepDarkStone);
      tCollar.position.set(tx, 1.32, tz);
      cg.add(tCollar);
      const tRoof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.56, 9), castleRoofMat);
      tRoof.position.set(tx, 1.64, tz);
      tRoof.castShadow = true;
      cg.add(tRoof);
    }

    // Central Elevated Stone Keep + warm glowing windows + pitched territory-colored roof & fluttering banner!
    const keepBody = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.68, 0.92), keepStoneMat);
    keepBody.position.y = 0.96;
    keepBody.castShadow = true;
    keepBody.receiveShadow = true;
    cg.add(keepBody);
    const keepRim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 1.02), keepDarkStone);
    keepRim.position.y = 1.78;
    cg.add(keepRim);
    for (const [wx0, wz0, rY] of [[0, 0.47, 0], [0, -0.47, Math.PI], [0.47, 0, Math.PI / 2], [-0.47, 0, -Math.PI / 2]]) {
      const kWin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.04), windowGlowMat);
      kWin.position.set(wx0, 1.36, wz0);
      kWin.rotation.y = rY;
      cg.add(kWin);
    }
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.72, 4), castleRoofMat);
    keepRoof.position.y = 2.20;
    keepRoof.rotation.y = Math.PI / 4;
    keepRoof.castShadow = true;
    cg.add(keepRoof);

    // Tall brass flagpole + fluttering territory-colored keep banner!
    const fPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.95, 6), brassCapMat);
    fPole.position.y = 2.86;
    cg.add(fPole);
    const fCloth = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.02), castleBannerMat);
    fCloth.position.set(0.24, 3.16, 0);
    cg.add(fCloth);
    castleFlags.push({ mesh: fCloth, phase: mIdx * 1.3 });

    country.add(cg);
  });

  // Smoothly update every house, barn, windmill & mini-castle roof color when territory ownership shifts!
  let dynColorAccum = 0;
  function syncTerritoryColors(territorySys, dt, t) {
    for (const cf of castleFlags) {
      cf.mesh.rotation.y = Math.sin(t * 3.4 + cf.phase) * 0.28;
    }
    if (!territorySys?.getOwnerAt) return;
    dynColorAccum += dt;
    const checkOwners = dynColorAccum >= 0.45;
    if (checkOwners) dynColorAccum = 0;
    const blend = Math.min(1, dt * 2.8);

    for (let i = 0; i < dynamicStructures.length; i++) {
      const ds = dynamicStructures[i];
      if (checkOwners) {
        const own = territorySys.getOwnerAt(ds.x, ds.z);
        if (own >= 0 && own !== ds.curTeam) {
          ds.curTeam = own;
          const pal = ds.shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
          ds.targetColor.copy(pal[own]);
        }
      }
      ds.mat.color.lerp(ds.targetColor, blend);
    }

    if (dynHouseRoofInst && dynHouseInstRecords.length) {
      let roofDirty = false;
      for (let i = 0; i < dynHouseInstRecords.length; i++) {
        const rec = dynHouseInstRecords[i];
        if (checkOwners) {
          const own = territorySys.getOwnerAt(rec.x, rec.z);
          if (own >= 0 && own !== rec.curTeam) {
            rec.curTeam = own;
            const pal = rec.shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
            rec.targetColor.copy(pal[own]);
          }
        }
        if (Math.abs(rec.color.r - rec.targetColor.r) + Math.abs(rec.color.g - rec.targetColor.g) + Math.abs(rec.color.b - rec.targetColor.b) > 0.004) {
          rec.color.lerp(rec.targetColor, blend);
          dynHouseRoofInst.setColorAt(rec.idx, rec.color);
          roofDirty = true;
        }
      }
      if (roofDirty && dynHouseRoofInst.instanceColor) {
        dynHouseRoofInst.instanceColor.needsUpdate = true;
      }
    }
    if (dynTentTopInst && dynTentInstRecords.length) {
      let tentDirty = false;
      for (let i = 0; i < dynTentInstRecords.length; i++) {
        const rec = dynTentInstRecords[i];
        if (checkOwners) {
          const own = territorySys.getOwnerAt(rec.x, rec.z);
          if (own >= 0 && own !== rec.curTeam) {
            rec.curTeam = own;
            const pal = rec.shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
            rec.targetColor.copy(pal[own]);
          }
        }
        if (Math.abs(rec.color.r - rec.targetColor.r) + Math.abs(rec.color.g - rec.targetColor.g) + Math.abs(rec.color.b - rec.targetColor.b) > 0.004) {
          rec.color.lerp(rec.targetColor, blend);
          dynTentTopInst.setColorAt(rec.idx, rec.color);
          tentDirty = true;
        }
      }
      if (tentDirty && dynTentTopInst.instanceColor) {
        dynTentTopInst.instanceColor.needsUpdate = true;
      }
    }
  }

  // ── C. 6 DETAILED MEDIEVAL STONE SIGNAL BEACONS WITH IRON BRAZIERS, MERLONS & BANNERS ─
  const watchtowers = [
    { x: -2.6, z: -15.6, rotY: 0.20 },
    { x: 5.4, z: -16.2, rotY: -0.25 },
    { x: -24.5, z: -11.5, rotY: 0.65 },
    { x: 24.5, z: 9.8, rotY: -1.85 },
    { x: -24.2, z: 10.6, rotY: 1.15 },
    { x: 24.4, z: -9.8, rotY: -0.75 },
  ];
  const ironBrazierMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.48, metalness: 0.72 });
  const coalBedMat = new THREE.MeshStandardMaterial({ color: 0xff4d12, emissive: 0xff3b00, emissiveIntensity: 1.5, roughness: 0.65 });
  const innerFlameMat = new THREE.MeshBasicMaterial({ color: 0xfff099 });

  watchtowers.forEach((wt, idx) => {
    const g = new THREE.Group();
    const y = terrainHeight(wt.x, wt.z);
    if (y < 0.25) return;
    g.position.set(wt.x, y, wt.z);
    g.rotation.y = wt.rotY;

    // Stepped octagonal masonry foundation plinth
    const fndBot = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.86, 0.28, 8), darkStone);
    fndBot.position.y = 0.12;
    fndBot.receiveShadow = true;
    g.add(fndBot);
    const fndMid = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.72, 0.24, 8), stoneMat);
    fndMid.position.y = 0.36;
    g.add(fndMid);

    // Tapered stone beacon shaft with 4 corner stone buttress pilasters
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 1.92, 8), stoneMat);
    shaft.position.y = 1.40;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * Math.PI * 2 + Math.PI / 4;
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.84, 0.14), darkStone);
      pil.position.set(Math.cos(a) * 0.47, 1.34, Math.sin(a) * 0.47);
      pil.rotation.y = -a;
      g.add(pil);
    }

    // Arched oak entrance door, warm watch-chamber window & stone belt molding
    const bDoor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.40, 0.08), timberMat);
    bDoor.position.set(0, 0.64, 0.53);
    g.add(bDoor);
    const bWin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.06), windowGlowMat);
    bWin.position.set(0, 1.56, 0.48);
    g.add(bWin);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.52, 0.12, 8), darkStone);
    belt.position.y = 2.24;
    g.add(belt);

    // Overhanging corbeled battlement crown + 8 individual stone crenellation merlons + antique-gold trim
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.58, 0.28, 8), darkStone);
    crown.position.y = 2.42;
    crown.castShadow = true;
    g.add(crown);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.055, 8), goldMat);
    trim.position.y = 2.57;
    g.add(trim);
    for (let m = 0; m < 8; m++) {
      const ma = (m / 8) * Math.PI * 2;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.14), stoneMat);
      merlon.position.set(Math.sin(ma) * 0.60, 2.68, Math.cos(ma) * 0.60);
      merlon.rotation.y = ma;
      g.add(merlon);
    }

    // Wrought-iron caged fire brazier tripod + glowing coal bed + dual-layer dancing beacon flame!
    const brazierBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.20, 0.24, 8), ironBrazierMat);
    brazierBowl.position.y = 2.78;
    g.add(brazierBowl);
    for (let l = 0; l < 4; l++) {
      const la = (l / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), ironBrazierMat);
      leg.position.set(Math.cos(la) * 0.24, 2.72, Math.sin(la) * 0.24);
      g.add(leg);
    }
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.10, 8), coalBedMat);
    coals.position.y = 2.90;
    g.add(coals);

    // Outer flickering fire + bright incandescent flame core
    const flameGroup = new THREE.Group();
    flameGroup.position.y = 3.06;
    const outerFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), emberMat);
    outerFlame.scale.set(0.95, 1.45, 0.95);
    flameGroup.add(outerFlame);
    const innerFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), innerFlameMat);
    innerFlame.position.y = -0.02;
    innerFlame.scale.set(0.85, 1.35, 0.85);
    flameGroup.add(innerFlame);
    g.add(flameGroup);
    towerFlames.push({ mesh: flameGroup, phase: idx * 1.7 });

    // Territory-colored hanging heraldic beacon banner on the front masonry face!
    const bannerMat = makeDynamicRoofMat(wt.x, wt.z, 0);
    const bRod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.05), goldMat);
    bRod.position.set(0, 2.12, 0.56);
    g.add(bRod);
    const bBanner = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.03), bannerMat);
    bBanner.position.set(0, 1.80, 0.56);
    g.add(bBanner);

    // Rising signal smoke wisp from the lit beacon fire
    const bPuff = new THREE.Mesh(smokeGeom, smokeMat);
    bPuff.position.set(wt.x, y + 3.45, wt.z);
    country.add(bPuff);
    chimneyPuffs.push({ mesh: bPuff, bx: wt.x, by: y + 3.35, bz: wt.z, phase: idx * 0.73 });

    country.add(g);
  });

  // ── D. FESTIVAL ENCAMPMENT PAVILIONS (INSTANCED + DYNAMICALLY MATCHING THEIR TERRITORY COLOR!) ─
  const tentClusters = [
    { cx: -18.2, cz: -8.0, n: 5 }, // Red NW
    { cx: -10.8, cz: -14.8, n: 4 }, // Red NW
    { cx: 16.8, cz: 10.6, n: 5 }, // Green SE
    { cx: 21.2, cz: -5.5, n: 4 }, // Blue NE
    { cx: -21.2, cz: 7.4, n: 4 }, // Orange SW
  ];
  const tentSpecs = [];
  tentClusters.forEach((cl, cIdx) => {
    for (let i = 0; i < cl.n; i++) {
      const ang = (i / cl.n) * Math.PI * 2 + cIdx;
      const r = 0.95 + (i % 2) * 0.55;
      const tx = cl.cx + Math.cos(ang) * r;
      const tz = cl.cz + Math.sin(ang) * r;
      const ty = terrainHeight(tx, tz);
      if (ty < 0.25) continue;
      const startTm = (tx < riverCenterX(tz))
        ? (Math.hypot(tx - VENUE_SPECS[0].x, tz - VENUE_SPECS[0].z) <= Math.hypot(tx - VENUE_SPECS[3].x, tz - VENUE_SPECS[3].z) ? 0 : 3)
        : (Math.hypot(tx - VENUE_SPECS[1].x, tz - VENUE_SPECS[1].z) <= Math.hypot(tx - VENUE_SPECS[2].x, tz - VENUE_SPECS[2].z) ? 1 : 2);
      tentSpecs.push({ x: tx, y: ty, z: tz, shadeIdx: i % 2, curTeam: startTm });
    }
  });
  const dynTentInstRecords = [];
  let dynTentTopInst = null;
  if (tentSpecs.length) {
    const tBaseInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 10), sailCloth, tentSpecs.length);
    dynTentTopInst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.45, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74 }), tentSpecs.length);
    const tFinialInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 6), goldMat, tentSpecs.length);
    tBaseInst.castShadow = true;
    dynTentTopInst.castShadow = true;

    tentSpecs.forEach((ts, idx) => {
      hDummy.position.set(ts.x, ts.y + 0.16, ts.z);
      hDummy.rotation.set(0, 0, 0);
      hDummy.scale.setScalar(1);
      hDummy.updateMatrix();
      tBaseInst.setMatrixAt(idx, hDummy.matrix);

      hDummy.position.set(ts.x, ts.y + 0.58, ts.z);
      hDummy.updateMatrix();
      dynTentTopInst.setMatrixAt(idx, hDummy.matrix);

      hDummy.position.set(ts.x, ts.y + 0.88, ts.z);
      hDummy.updateMatrix();
      tFinialInst.setMatrixAt(idx, hDummy.matrix);

      const pal = ts.shadeIdx === 1 ? FACTION_ROOF_SHADES : FACTION_ROOF_COLORS;
      const curCol = pal[ts.curTeam].clone();
      dynTentTopInst.setColorAt(idx, curCol);
      dynTentInstRecords.push({ idx, x: ts.x, z: ts.z, shadeIdx: ts.shadeIdx, curTeam: ts.curTeam, color: curCol, targetColor: curCol.clone() });
    });

    for (const inst of [tBaseInst, dynTentTopInst, tFinialInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      country.add(inst);
    }
  }

  // ── E. RIVERSIDE WOODEN DOCKS & 2 ANIMATED SAILING RIVER BARGES WITH WAKES ─
  for (const dockZ of [-6.5, 7.2]) {
    const bankSign = dockZ < 0 ? -1 : 1;
    const dx = riverCenterX(dockZ) + bankSign * (riverHalfWidth(dockZ) + 0.15);
    const dock = new THREE.Group();
    dock.position.set(dx, -0.02, dockZ);
    const planks = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.10, 0.72), timberMat);
    planks.position.set(-bankSign * 0.35, 0.12, 0);
    planks.castShadow = true;
    dock.add(planks);
    for (const px of [-0.9, -0.3, 0.25]) {
      for (const pz of [-0.30, 0.30]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.46, 6), timberMat);
        post.position.set(px * bankSign, 0.06, pz);
        dock.add(post);
      }
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.24), hayMat);
    crate.position.set(-bankSign * 0.4, 0.26, 0.12);
    dock.add(crate);
    country.add(dock);
  }

  // 4-Faction Naval Fleet Heraldry (matches the exact 4 fighting venue teams!)
  const SHIP_FACTIONS = [
    { id: 0, name: 'Royal Lists', primary: '#b52430', hex: 0xb52430, accent: '#f4ead0', trim: '#d4af37', pattern: 'cross' },
    { id: 1, name: 'Iron Colosseum', primary: '#24599c', hex: 0x24599c, accent: '#efe5c8', trim: '#d4af37', pattern: 'stripes' },
    { id: 2, name: 'King’s Green', primary: '#267a44', hex: 0x267a44, accent: '#f2e8cc', trim: '#d8b44c', pattern: 'chevron' },
    { id: 3, name: 'Great Hall', primary: '#cf8722', hex: 0xcf8722, accent: '#7a1f2d', trim: '#f2d374', pattern: 'bands' },
  ];

  const createShipSailTexture = fac => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');

    // Warm woven medieval canvas sail cloth
    const sailGrad = ctx.createLinearGradient(0, 0, 0, S);
    sailGrad.addColorStop(0, '#fbf3dc');
    sailGrad.addColorStop(0.55, '#f4e7c6');
    sailGrad.addColorStop(1, '#e7d5ac');
    ctx.fillStyle = sailGrad;
    ctx.fillRect(0, 0, S, S);

    // Subtle horizontal stitched sailcloth panel seams
    ctx.strokeStyle = 'rgba(92, 68, 42, 0.16)';
    ctx.lineWidth = 1.6;
    for (let y = 38; y < S - 24; y += 36) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }

    // Faction-colored top, bottom & side heraldic sail trim bands
    ctx.fillStyle = fac.primary;
    ctx.fillRect(0, 0, S, 24);
    ctx.fillRect(0, S - 24, S, 24);
    ctx.fillRect(0, 0, 14, S);
    ctx.fillRect(S - 14, 0, 14, S);

    // Gilt heraldic border & circular sail medallion framing the official team icon
    ctx.strokeStyle = fac.trim;
    ctx.lineWidth = 4.5;
    ctx.strokeRect(14, 24, S - 28, S - 48);

    const cx = S * 0.5;
    const cy = S * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 250, 236, 0.55)';
    ctx.fill();
    ctx.strokeStyle = fac.primary;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 71, 0, Math.PI * 2);
    ctx.strokeStyle = fac.trim;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Large, crisp official team emblem icon centered on the main sail
    drawFactionEmblemIcon(ctx, fac.id, cx, cy, 118, fac.primary, 2.25, 'rgba(65, 42, 16, 0.22)');

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  const shipFactionVisuals = SHIP_FACTIONS.map(fac => ({
    fac,
    sailMat: new THREE.MeshStandardMaterial({ map: createShipSailTexture(fac), roughness: 0.76, side: THREE.DoubleSide }),
    clothMat: new THREE.MeshStandardMaterial({ color: fac.hex, roughness: 0.68, side: THREE.DoubleSide }),
    shieldMat: new THREE.MeshStandardMaterial({ color: fac.hex, roughness: 0.72 }),
  }));

  // Shared curved boat hull extrusion (pointed bow at +Z, tapered stern at -Z)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.84);
  hullShape.quadraticCurveTo(0.32, 0.44, 0.30, -0.05);
  hullShape.quadraticCurveTo(0.28, -0.52, 0.17, -0.74);
  hullShape.lineTo(-0.17, -0.74);
  hullShape.quadraticCurveTo(-0.28, -0.52, -0.30, -0.05);
  hullShape.quadraticCurveTo(-0.32, 0.44, 0, 0.84);
  const hullGeom = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.20,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  hullGeom.rotateX(Math.PI / 2);
  const deckGeom = new THREE.ExtrudeGeometry(hullShape, { depth: 0.03, bevelEnabled: false });
  deckGeom.rotateX(Math.PI / 2);

  // Curved wind-billowed square sail geometry
  const makeBillowSailGeom = (w, h, puff) => {
    const g = new THREE.PlaneGeometry(w, h, 10, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) / w) + 0.5;
      const v = (p.getY(i) / h) + 0.5;
      const bulge = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * puff;
      p.setZ(i, bulge);
    }
    g.computeVertexNormals();
    return g;
  };
  const mainSailGeom = makeBillowSailGeom(0.76, 0.62, 0.16);
  const topSailGeom = makeBillowSailGeom(0.46, 0.24, 0.09);

  const deckOakMat = new THREE.MeshStandardMaterial({ color: 0x9c7648, roughness: 0.86 });
  const darkHullMat = new THREE.MeshStandardMaterial({ color: 0x462d1a, roughness: 0.86 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb99e6d, roughness: 0.92 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6f4b28, roughness: 0.88 });

  // GPU-instanced naval cannon shots & water-splash / battle-fire impact bursts!
  const MAX_NAVAL_SHOTS = 36;
  const navalShotInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.068, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffa638 }),
    MAX_NAVAL_SHOTS
  );
  navalShotInst.frustumCulled = false;
  navalShotInst.count = 0;
  const flushNavalShots=trackInstanceUploads(navalShotInst);
  country.add(navalShotInst);

  const MAX_NAVAL_FX = 56;
  const navalFxInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.18, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.80, depthWrite: false }),
    MAX_NAVAL_FX
  );
  navalFxInst.frustumCulled = false;
  navalFxInst.setColorAt(0, new THREE.Color(0xffffff));
  navalFxInst.count = 0;
  const flushNavalFx=trackInstanceUploads(navalFxInst);
  country.add(navalFxInst);

  const navalShots = [];
  const navalFx = [];
  let nSeed = 44711;
  const nRand = () => {
    nSeed = (nSeed * 16807) % 2147483647;
    return (nSeed - 1) / 2147483646;
  };

  // Spawn 2 well-spaced scenic faction ships (rotating randomly across all 4 houses on respawn -> smooth, jam-free river!)
  const initShipConfigs = [
    { team: 0, dir: 1, z: -15.2, lane: 0.34 },
    { team: 2, dir: -1, z: 14.8, lane: -0.34 },
  ];

  for (let b = 0; b < initShipConfigs.length; b++) {
    const cfg = initShipConfigs[b];
    const vis = shipFactionVisuals[cfg.team];
    const boat = new THREE.Group();
    const shipBody = new THREE.Group();
    // Refined river-galley scale (top mast y ≈ 0.90) so ships fit snugly under all 3 gentle bridge arches!
    shipBody.scale.setScalar(0.68);
    boat.add(shipBody);

    // 1. Curved planked hull + wooden deck + raised bow & stern castles
    const hullMesh = new THREE.Mesh(hullGeom, darkHullMat);
    hullMesh.position.y = 0.20;
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    shipBody.add(hullMesh);

    const deckMesh = new THREE.Mesh(deckGeom, deckOakMat);
    deckMesh.scale.set(0.84, 0.86, 1);
    deckMesh.position.y = 0.235;
    deckMesh.receiveShadow = true;
    shipBody.add(deckMesh);

    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.085, 1.12), timberMat);
      rail.position.set(sgn * 0.27, 0.26, -0.02);
      shipBody.add(rail);
    }

    const sternDeck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.42), timberMat);
    sternDeck.position.set(0, 0.30, -0.52);
    sternDeck.castShadow = true;
    shipBody.add(sternDeck);

    const sternRail = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.06, 0.46), goldMat);
    sternRail.position.set(0, 0.42, -0.52);
    shipBody.add(sternRail);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.26), vis.clothMat);
    cabinRoof.position.set(0, 0.46, -0.56);
    shipBody.add(cabinRoof);

    const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.20, 5), darkHullMat);
    lanternPost.position.set(0, 0.54, -0.71);
    shipBody.add(lanternPost);
    const sternLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), emberMat);
    sternLantern.position.set(0, 0.64, -0.71);
    shipBody.add(sternLantern);

    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.16), darkHullMat);
    rudder.position.set(0, 0.06, -0.78);
    shipBody.add(rudder);

    const foreDeck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.30), timberMat);
    foreDeck.position.set(0, 0.28, 0.54);
    foreDeck.castShadow = true;
    shipBody.add(foreDeck);

    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.032, 0.62, 6), timberMat);
    bowsprit.rotation.x = Math.PI * 0.36;
    bowsprit.position.set(0, 0.38, 0.94);
    bowsprit.castShadow = true;
    shipBody.add(bowsprit);

    const figurehead = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.20, 6), goldMat);
    figurehead.rotation.x = Math.PI * 0.38;
    figurehead.position.set(0, 0.30, 0.88);
    shipBody.add(figurehead);

    // 2. Heraldic Round War-Shields lining port & starboard bulwarks
    const factionShieldMeshes = [];
    for (const sgn of [-1, 1]) {
      for (let s = 0; s < 5; s++) {
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.022, 8), s % 2 === 0 ? vis.shieldMat : goldMat);
        sh.rotation.z = Math.PI / 2;
        sh.position.set(sgn * 0.305, 0.26, -0.26 + s * 0.17);
        shipBody.add(sh);
        if (s % 2 === 0) factionShieldMeshes.push(sh);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), goldMat);
        boss.position.set(sgn * 0.32, 0.26, -0.26 + s * 0.17);
        shipBody.add(boss);
      }
    }

    // 3. Deck Cargo
    for (const [cx, cz] of [[-0.10, 0.26], [0.09, 0.28], [0.0, -0.20]]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 7), barrelMat);
      barrel.position.set(cx, 0.29, cz);
      shipBody.add(barrel);
    }

    // 4. Mast, Crow's Nest, Yardarms & Billowing Faction Sails
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.040, 1.32, 8), timberMat);
    mast.position.set(0, 0.84, 0.04);
    mast.castShadow = true;
    shipBody.add(mast);

    const crowsNest = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.082, 0.11, 8), timberMat);
    crowsNest.position.set(0, 1.18, 0.04);
    crowsNest.castShadow = true;
    shipBody.add(crowsNest);

    const yardMain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.86, 6), timberMat);
    yardMain.rotation.z = Math.PI / 2;
    yardMain.position.set(0, 1.00, 0.08);
    shipBody.add(yardMain);

    const yardBot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.78, 6), timberMat);
    yardBot.rotation.z = Math.PI / 2;
    yardBot.position.set(0, 0.40, 0.08);
    shipBody.add(yardBot);

    const yardTop = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.52, 6), timberMat);
    yardTop.rotation.z = Math.PI / 2;
    yardTop.position.set(0, 1.38, 0.07);
    shipBody.add(yardTop);

    const mainSail = new THREE.Mesh(mainSailGeom, vis.sailMat);
    mainSail.position.set(0, 0.70, 0.09);
    mainSail.castShadow = true;
    shipBody.add(mainSail);

    const topSail = new THREE.Mesh(topSailGeom, sailCloth);
    topSail.position.set(0, 1.26, 0.08);
    topSail.castShadow = true;
    shipBody.add(topSail);

    const addRope = (p1, p2) => {
      const v1 = new THREE.Vector3(...p1);
      const v2 = new THREE.Vector3(...p2);
      const len = v1.distanceTo(v2);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), ropeMat);
      r.position.copy(v1).add(v2).multiplyScalar(0.5);
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
      shipBody.add(r);
    };
    addRope([0, 1.44, 0.04], [0, 0.46, 1.15]);
    addRope([0, 1.42, 0.04], [0, 0.44, -0.68]);
    addRope([0, 1.18, 0.04], [-0.27, 0.28, -0.10]);
    addRope([0, 1.18, 0.04], [0.27, 0.28, -0.10]);
    addRope([0, 1.18, 0.04], [-0.27, 0.28, 0.18]);
    addRope([0, 1.18, 0.04], [0.27, 0.28, 0.18]);

    const pennantGroup = new THREE.Group();
    pennantGroup.position.set(0, 1.48, 0.04);
    const penShape = new THREE.Shape();
    penShape.moveTo(0, 0.05); penShape.lineTo(0.42, 0.03); penShape.lineTo(0.32, 0);
    penShape.lineTo(0.42, -0.03); penShape.lineTo(0, -0.05); penShape.closePath();
    const penGeom = new THREE.ShapeGeometry(penShape);
    penGeom.rotateY(Math.PI / 2);
    const penMesh = new THREE.Mesh(penGeom, vis.clothMat);
    pennantGroup.add(penMesh);
    shipBody.add(pennantGroup);

    // 5. Animated Rowing Oars
    const oars = [];
    for (const sgn of [-1, 1]) {
      for (let o = 0; o < 4; o++) {
        const oarPivot = new THREE.Group();
        oarPivot.position.set(sgn * 0.27, 0.16, -0.22 + o * 0.18);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.46, 4), deckOakMat);
        shaft.rotation.z = sgn * (Math.PI * 0.36);
        shaft.position.set(sgn * 0.20, -0.09, 0);
        oarPivot.add(shaft);
        shipBody.add(oarPivot);
        oars.push({ pivot: oarPivot, sgn, idx: o });
      }
    }

    let wakeMesh = null;
    if (wakeTex) {
      wakeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 1.65),
        new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0.44, depthWrite: false })
      );
      wakeMesh.rotation.x = -Math.PI / 2;
      wakeMesh.rotation.z = Math.PI;
      wakeMesh.position.set(0, 0.01, -1.25);
      boat.add(wakeMesh);
    }

    country.add(boat);
    riverBoats.push({
      id: b,
      mesh: boat,
      body: shipBody,
      pennant: pennantGroup,
      penMesh,
      cabinRoof,
      mainSail,
      factionShieldMeshes,
      wakeMesh,
      oars,
      team: cfg.team,
      dir: cfg.dir,
      z: cfg.z,
      x: riverCenterX(cfg.z) + cfg.lane,
      lane: cfg.lane,
      baseOffset: cfg.lane,
      speed: 0.64 + b * 0.04,
      phase: b * 1.65,
      state: 'sailing', // 'sailing' | 'fighting' | 'sinking' | 'respawning'
      hp: Math.round((265 + nRand() * 65) * (0.84 + REALM_TIDE.power[cfg.team] * 0.18)),
      maxHp: 340,
      cd: 1.0 + nRand() * 1.2,
      sinkT: 0,
      sinkSide: b % 2 === 0 ? 1 : -1,
      respawnWait: 0,
      opponent: null,
    });
  }

  // Helper to re-skin a ship to any of the 4 fighting factions on random respawn!
  const applyShipFaction = (rb, teamId) => {
    const vis = shipFactionVisuals[teamId % shipFactionVisuals.length];
    rb.team = teamId;
    rb.mainSail.material = vis.sailMat;
    rb.cabinRoof.material = vis.clothMat;
    rb.penMesh.material = vis.clothMat;
    for (const sm of rb.factionShieldMeshes) sm.material = vis.shieldMat;
  };

  const spawnNavalFX = (x, y, z, colorHex, maxScale, duration) => {
    if (navalFx.length >= MAX_NAVAL_FX) navalFx.shift();
    navalFx.push({ x, y, z, color: colorHex, maxScale, age: 0, duration });
  };

  const navalDummy = new THREE.Object3D();
  const navalCol = new THREE.Color();

  // Live 4-Faction Naval Simulation: Strict Single-Ship Bridge Semaphore (First-Come, First-Served!)
  // Only ONE ship may pass under any bridge at a time; others wait cleanly OUTSIDE until it exits.
  // Open-water naval battles happen only when both ships are well clear of all 3 bridges!
  const BRIDGE_ZS = [NORTH_BRIDGE_Z, BRIDGE_Z, SOUTH_BRIDGE_Z];
  const bridgeOwner = [null, null, null];
  let navalDuelCd = 14.0;

  function updateShips(dt, t) {
    navalDuelCd = Math.max(0, navalDuelCd - dt);

    // 0. Update First-Come, First-Served Single-Ship Bridge Locks (prevents ANY two ships from ever meeting under a bridge!)
    for (let bi = 0; bi < BRIDGE_ZS.length; bi++) {
      const bz = BRIDGE_ZS[bi];
      const holder = bridgeOwner[bi];
      if (holder) {
        const clearedFarSide = (holder.z - bz) * holder.dir > 2.65;
        const leftZone = Math.abs(holder.z - bz) > 4.8;
        if (holder.state !== 'sailing' || clearedFarSide || leftZone) {
          bridgeOwner[bi] = null;
        }
      }
      if (!bridgeOwner[bi]) {
        // Award bridge right-of-way strictly to whichever sailing ship arrived closest first!
        let winner = null;
        let bestDist = 4.6;
        for (const rb of riverBoats) {
          if (rb.state !== 'sailing') continue;
          const dist = Math.abs(rb.z - bz);
          const headingToward = (bz - rb.z) * rb.dir > 0;
          const insideBridge = dist < 2.2;
          if ((headingToward || insideBridge) && dist < bestDist) {
            bestDist = dist;
            winner = rb;
          }
        }
        if (winner) bridgeOwner[bi] = winner;
      }
    }

    // 1. Open-Water Broadside Rival Encounters (ONLY when BOTH ships are well outside all 3 bridges!)
    for (let i = 0; i < riverBoats.length; i++) {
      const a = riverBoats[i];
      if (a.state === 'sinking' || a.state === 'respawning') continue;

      // Drop invalid opponent
      if (a.opponent && (a.opponent.state === 'sinking' || a.opponent.state === 'respawning' || a.opponent.team === a.team || Math.hypot(a.x - a.opponent.x, a.z - a.opponent.z) > 4.2)) {
        a.opponent = null;
        if (a.state === 'fighting') a.state = 'sailing';
      }

      const aNearBridge = BRIDGE_ZS.some(bz => Math.abs(a.z - bz) < 3.4) || bridgeOwner.includes(a);
      if (navalDuelCd <= 0 && !a.opponent && !aNearBridge && Math.abs(a.z) < 19.5) {
        for (let j = i + 1; j < riverBoats.length; j++) {
          const b = riverBoats[j];
          if (b.state !== 'sailing' || b.team === a.team) continue;
          const bNearBridge = BRIDGE_ZS.some(bz => Math.abs(b.z - bz) < 3.4) || bridgeOwner.includes(b);
          if (bNearBridge || Math.abs(b.z) > 19.5) continue;
          const dist = Math.hypot(a.x - b.x, a.z - b.z);
          if (dist < 2.65) {
            navalDuelCd = 28.0 + nRand() * 22.0;
            if (nRand() < 0.52) {
              a.state = 'fighting';
              b.state = 'fighting';
              a.opponent = b;
              b.opponent = a;
              const aOnWest = a.lane !== b.lane ? a.lane < b.lane : a.id < b.id;
              a.fightSide = aOnWest ? -1 : 1;
              b.fightSide = aOnWest ? 1 : -1;
              a.baseOffset = a.fightSide * 0.56;
              b.baseOffset = b.fightSide * 0.56;
            }
            break;
          }
        }
      }
    }

    // 2. Advance every ship: VIP single-ship bridge passage, clean outside waiting, open-water combat, sinking & respawning!
    for (const rb of riverBoats) {
      if (rb.state === 'respawning') {
        rb.respawnWait -= dt;
        rb.mesh.visible = false;
        if (rb.respawnWait <= 0) {
          const nextDir = nRand() > 0.5 ? 1 : -1;
          const spawnZ = nextDir > 0 ? -24.6 : 24.6;
          // Wait briefly if another ship is right at the same river entrance
          const entranceBusy = riverBoats.some(o => o !== rb && o.state !== 'respawning' && Math.abs(o.z - spawnZ) < 6.0);
          if (entranceBusy) {
            rb.respawnWait = 1.5;
            continue;
          }
          const nextTeam = Math.floor(nRand() * SHIP_FACTIONS.length);
          applyShipFaction(rb, nextTeam);
          rb.dir = nextDir;
          rb.z = spawnZ;
          rb.baseOffset = nextDir > 0 ? 0.42 : -0.42;
          rb.lane = rb.baseOffset;
          rb.laneVel = 0;
          rb.curSpeed = rb.speed;
          rb.fightSide = 0;
          rb.x = riverCenterX(rb.z) + rb.lane;
          const pwr = REALM_TIDE.power[nextTeam] || 1.0;
          rb.hp = Math.round((265 + nRand() * 75) * (0.84 + pwr * 0.18));
          rb.maxHp = rb.hp;
          rb.cd = 1.2 + nRand() * 1.0;
          rb.sinkT = 0;
          rb.sinkSide = nRand() > 0.5 ? 1 : -1;
          rb.opponent = null;
          rb.state = 'sailing';
          if (rb.wakeMesh) rb.wakeMesh.visible = true;
        }
        continue;
      }

      if (rb.state === 'sinking') {
        rb.sinkT += dt;
        const frac = Math.min(1, rb.sinkT / 7.2);
        const sinkY = -0.14 - frac * frac * 1.25;
        rb.mesh.position.set(rb.x, sinkY, rb.z);
        rb.body.rotation.z = rb.sinkSide * frac * 1.18 + Math.sin(t * 3.5 + rb.phase) * 0.07 * (1 - frac);
        rb.body.rotation.x = frac * 0.58;
        if (rb.wakeMesh) rb.wakeMesh.visible = false;
        if (frac < 0.85 && nRand() < dt * 4.2) {
          spawnNavalFX(rb.x + (nRand() - 0.5) * 0.45, -0.05, rb.z + (nRand() - 0.5) * 0.55, nRand() > 0.45 ? 0xdff2f5 : 0xff7b24, 0.72, 0.72);
        }
        if (rb.sinkT >= 7.2) {
          rb.state = 'respawning';
          rb.respawnWait = 3.5 + nRand() * 4.2;
          rb.mesh.visible = false;
          rb.body.rotation.set(0, 0, 0);
        }
        continue;
      }

      const isFighting = rb.state === 'fighting' && rb.opponent && rb.opponent.state === 'fighting';
      if (rb.state === 'fighting' && !isFighting) {
        rb.state = 'sailing';
        rb.opponent = null;
        rb.baseOffset = rb.dir > 0 ? 0.42 : -0.42;
      }

      const maxSafeLane = Math.max(0.56, riverHalfWidth(rb.z) - 0.48);
      let targetSpeed = isFighting ? 0.03 : rb.speed;
      let targetLane = isFighting
        ? (rb.fightSide || (rb.id < rb.opponent.id ? -1 : 1)) * Math.min(0.56, maxSafeLane)
        : (rb.dir > 0 ? 0.44 : -0.44);

      if (!isFighting) {
        const myBridgeIdx = bridgeOwner.indexOf(rb);
        if (myBridgeIdx >= 0) {
          // This ship arrived first and owns the bridge lock: glide straight through the center arch at full speed!
          const bz = BRIDGE_ZS[myBridgeIdx];
          const pull = 1 - smootherstep(1.2, 4.4, Math.abs(rb.z - bz));
          targetSpeed = rb.speed;
          targetLane = targetLane * (1 - pull);
        } else {
          // Check if we are approaching a bridge currently occupied by another ship -> WAIT cleanly OUTSIDE!
          let waitingAtBridge = false;
          for (let bi = 0; bi < BRIDGE_ZS.length; bi++) {
            const holder = bridgeOwner[bi];
            if (!holder || holder === rb) continue;
            const bz = BRIDGE_ZS[bi];
            const distToB = (bz - rb.z) * rb.dir; // positive if bridge is ahead of us
            if (distToB > 1.8 && distToB < 6.0) {
              waitingAtBridge = true;
              // Smoothly halt at safe distance outside the bridge mouth (~3.8 units away) so the passing ship exits cleanly!
              targetSpeed = distToB <= 4.1 ? 0 : rb.speed * smoothstep(4.1, 5.8, distToB);
              targetLane = (rb.dir > 0 ? 1 : -1) * Math.min(0.52, maxSafeLane);
              break;
            }
          }

          if (!waitingAtBridge) {
            // Open water navigation: keep natural opposite right-hand passing lanes (+0.44 / -0.44)
            // and gently center under any unoccupied bridge as we approach
            let freePull = 0;
            for (const bz of BRIDGE_ZS) {
              freePull = Math.max(freePull, 1 - smootherstep(1.2, 4.0, Math.abs(rb.z - bz)));
            }
            targetLane = targetLane * (1 - freePull);
          }
        }
      } else if (rb.opponent) {
        // Keep dueling ships gently abeam of one another AND well clear of all 3 bridges!
        const opp = rb.opponent;
        let driftZ = Math.max(-0.18, Math.min(0.18, (opp.z - rb.z) * 0.25));
        for (const bz of BRIDGE_ZS) {
          if (Math.abs(rb.z - bz) < 3.4) {
            driftZ += (rb.z >= bz ? 1 : -1) * 0.38;
          }
        }
        rb.z += driftZ * dt;
      }

      // Smooth speed & lateral lane damping (zero snapping, zero micro-jitter!)
      if (rb.curSpeed === undefined) rb.curSpeed = targetSpeed;
      rb.curSpeed += (targetSpeed - rb.curSpeed) * Math.min(1, dt * 4.5);
      rb.z += rb.dir * rb.curSpeed * dt;

      const clampedTargetLane = Math.max(-maxSafeLane, Math.min(maxSafeLane, targetLane));
      const prevLane = rb.lane;
      rb.lane += (clampedTargetLane - rb.lane) * Math.min(1, dt * 2.8);
      rb.laneVel = dt > 1e-4 ? (rb.lane - prevLane) / dt : 0;
      rb.x = riverCenterX(rb.z) + rb.lane;

      // Slow-paced cinematic broadside cannon volleys scaled by current Tide-of-War faction power!
      if (isFighting) {
        rb.cd -= dt;
        if (rb.cd <= 0) {
          rb.cd = 2.05 + nRand() * 1.10;
          const opp = rb.opponent;
          const pwr = REALM_TIDE.power[rb.team] || 1.0;
          if (navalShots.length < MAX_NAVAL_SHOTS) {
            navalShots.push({
              sx: rb.x, sy: 0.14, sz: rb.z,
              tx: opp.x + (nRand() - 0.5) * 0.18, ty: 0.10, tz: opp.z + (nRand() - 0.5) * 0.28,
              t: 0, dur: 0.72,
              dmg: (13 + nRand() * 8) * pwr,
              target: opp,
            });
          }
          spawnNavalFX((rb.x + opp.x) * 0.5, 0.16, (rb.z + opp.z) * 0.5, 0xffe4a0, 0.42, 0.36);
        }
      }

      if (Math.abs(rb.z) > 25.0) {
        rb.state = 'respawning';
        rb.respawnWait = 2.0 + nRand() * 3.5;
        rb.mesh.visible = false;
        continue;
      }
    }

    // 2B. Gentle Open-Water Lateral Separation (NEVER nudges a ship currently passing under a bridge!)
    const minHullX = 0.80;
    const minHullZ = 1.40;
    for (let i = 0; i < riverBoats.length; i++) {
      const a = riverBoats[i];
      if (a.state === 'respawning' || a.state === 'sinking' || bridgeOwner.includes(a)) continue;
      for (let j = i + 1; j < riverBoats.length; j++) {
        const b = riverBoats[j];
        if (b.state === 'respawning' || b.state === 'sinking' || bridgeOwner.includes(b)) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const nx = dx / minHullX;
        const nz = dz / minHullZ;
        const eDist = Math.hypot(nx, nz);
        if (eDist < 1.0) {
          const overlap = 1.0 - eDist;
          const sepSign = Math.abs(dx) > 0.02 ? (dx > 0 ? 1 : -1) : (a.id < b.id ? 1 : -1);
          const maxPush = Math.min(overlap * 0.38, dt * 0.95);
          const maxA = Math.max(0.56, riverHalfWidth(a.z) - 0.46);
          const maxB = Math.max(0.56, riverHalfWidth(b.z) - 0.46);
          a.lane = Math.max(-maxA, Math.min(maxA, a.lane - sepSign * maxPush));
          b.lane = Math.max(-maxB, Math.min(maxB, b.lane + sepSign * maxPush));
          a.x = riverCenterX(a.z) + a.lane;
          b.x = riverCenterX(b.z) + b.lane;
        }
      }
    }

    // 2C. Apply final resolved ship transforms, rock-steady river-tangent headings & sailing animations
    for (const rb of riverBoats) {
      if (rb.state === 'respawning' || rb.state === 'sinking') continue;
      const isFighting = rb.state === 'fighting' && rb.opponent;
      const isWaiting = (rb.curSpeed || 0) < 0.08 && !isFighting;
      const edgeFade = smoothstep(25.1, 22.8, Math.abs(rb.z));
      rb.mesh.visible = edgeFade > 0.02;
      rb.mesh.scale.setScalar(Math.max(0.01, edgeFade));
      rb.mesh.position.set(rb.x, -0.14 + Math.sin(t * 2.4 + rb.phase * 4) * 0.02, rb.z);

      const lookStep = 0.95 * rb.dir;
      const tanX = riverCenterX(rb.z + lookStep) - riverCenterX(rb.z);
      const riverYaw = Math.atan2(tanX, lookStep);
      const helmYaw = Math.max(-0.22, Math.min(0.22, (rb.laneVel || 0) * 0.32 * rb.dir));
      const targetH = riverYaw + helmYaw;
      let hDiff = targetH - rb.mesh.rotation.y;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      rb.mesh.rotation.y += hDiff * Math.min(1, dt * 4.5);

      rb.body.rotation.z = Math.sin(t * 2.0 + rb.phase * 2) * (isFighting ? 0.10 : 0.05);
      rb.body.rotation.x = Math.cos(t * 1.7 + rb.phase) * 0.03;
      rb.pennant.rotation.y = Math.sin(t * 4.8 + rb.phase) * 0.24;
      rb.mainSail.scale.z = isWaiting ? 0.80 : (0.92 + Math.sin(t * 2.3 + rb.phase) * 0.14);
      for (const oar of rb.oars) {
        const strokeRate = isWaiting ? 0.7 : isFighting ? 1.8 : 3.4;
        const stroke = t * strokeRate + rb.phase + oar.idx * 0.18;
        oar.pivot.rotation.y = Math.sin(stroke) * (isWaiting ? 0.10 : 0.32) * oar.sgn;
        oar.pivot.rotation.z = Math.cos(stroke) * (isWaiting ? 0.05 : 0.12) * oar.sgn;
      }
    }

    // 3. Advance flying naval broadside cannonballs & apply ship damage / sinking!
    let sC = 0;
    for (let i = navalShots.length - 1; i >= 0; i--) {
      const sh = navalShots[i];
      sh.t += dt / sh.dur;
      if (sh.t >= 1) {
        const tgt = sh.target;
        if (tgt && (tgt.state === 'sailing' || tgt.state === 'fighting')) {
          tgt.hp -= sh.dmg;
          spawnNavalFX(sh.tx, 0.18, sh.tz, 0xff701a, 0.88, 0.48);
          spawnNavalFX(sh.tx, 0.04, sh.tz, 0xe8f6f8, 0.65, 0.42);
          if (tgt.hp <= 0) {
            tgt.state = 'sinking';
            tgt.sinkT = 0;
            if (tgt.opponent) {
              tgt.opponent.opponent = null;
              tgt.opponent.state = 'sailing';
              tgt.opponent.baseOffset = tgt.opponent.dir > 0 ? 0.30 : -0.30;
            }
            tgt.opponent = null;
            // Big explosion & water splash as the losing ship begins sinking!
            spawnNavalFX(tgt.x, 0.26, tgt.z, 0xff5a12, 1.55, 0.85);
            spawnNavalFX(tgt.x, 0.08, tgt.z, 0xffffff, 1.35, 0.78);
          }
        }
        navalShots.splice(i, 1);
        continue;
      }
      if (sC < MAX_NAVAL_SHOTS) {
        const p = sh.t;
        const x = sh.sx + (sh.tx - sh.sx) * p;
        const z = sh.sz + (sh.tz - sh.sz) * p;
        const y = sh.sy + (sh.ty - sh.sy) * p + Math.sin(p * Math.PI) * 0.68;
        navalDummy.position.set(x, y, z);
        navalDummy.rotation.set(0, 0, 0);
        navalDummy.scale.setScalar(1);
        navalDummy.updateMatrix();
        navalShotInst.setMatrixAt(sC++, navalDummy.matrix);
      }
    }
    navalShotInst.count = sC;
    flushNavalShots();

    // 4. Advance naval fire-bursts & water splash FX
    let fxC = 0;
    for (let i = navalFx.length - 1; i >= 0; i--) {
      const fx = navalFx[i];
      fx.age += dt;
      if (fx.age >= fx.duration) {
        navalFx.splice(i, 1);
        continue;
      }
      if (fxC < MAX_NAVAL_FX) {
        const frac = fx.age / fx.duration;
        const sc = fx.maxScale * (0.35 + Math.sin(frac * Math.PI) * 0.85);
        navalDummy.position.set(fx.x, fx.y + frac * 0.24, fx.z);
        navalDummy.rotation.set(frac * 3, frac * 2, 0);
        navalDummy.scale.setScalar(sc);
        navalDummy.updateMatrix();
        navalFxInst.setMatrixAt(fxC, navalDummy.matrix);
        navalCol.setHex(fx.color);
        navalFxInst.setColorAt(fxC, navalCol);
        fxC++;
      }
    }
    navalFxInst.count = fxC;
    flushNavalFx();
  }

  // ── F. SMOOTHLY SCULPTED ORGANIC BOULDERS & RIVERBANK STONES (~165) ────────
  let rSeed = 4049;
  const rRand = () => {
    rSeed = (rSeed * 16807) % 2147483647;
    return (rSeed - 1) / 2147483646;
  };
  const rockPts = [];
  for (let a = 0; a < 750 && rockPts.length < 165; a++) {
    const rx = (rRand() - 0.5) * (WORLD_W - 4);
    const rz = (rRand() - 0.5) * (WORLD_D - 4);
    const ry = terrainHeight(rx, rz);
    const rDist = Math.abs(rx - riverCenterX(rz));
    const rw = riverHalfWidth(rz);
    const nearMountain = ry > 1.72;
    const nearBank = rDist > rw * 0.96 && rDist < rw + 1.15 && ry > -0.16 && ry < 0.65;
    if (!nearMountain && !nearBank) continue;
    let clear = true;
    for (const v of VENUE_SPECS) {
      if (Math.hypot(rx - v.x, rz - v.z) < v.plateauR + 1.15) { clear = false; break; }
    }
    if (!clear) continue;
    rockPts.push({
      x: rx,
      y: ry,
      z: rz,
      s: nearMountain ? 0.45 + rRand() * 0.92 : 0.18 + rRand() * 0.34,
      r: rRand() * 6.28,
      nearBank,
    });
  }
  // Smooth organic sculpted boulder geometry (subdivided icosahedron perturbed with smooth trig noise)
  const rockGeom = new THREE.IcosahedronGeometry(0.55, 2);
  const rPos = rockGeom.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const n = 1 + Math.sin(vx * 5.2 + vy * 3.8) * 0.14 + Math.cos(vz * 4.7 - vx * 3.1) * 0.11;
    rPos.setXYZ(i, vx * n, vy * n, vz * n);
  }
  rockGeom.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.90, metalness: 0.04, flatShading: false });
  const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, rockPts.length);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  const rDummy = new THREE.Object3D();
  const rCol = new THREE.Color();
  rockPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y + p.s * 0.12, p.z);
    rDummy.scale.set(p.s * (1.1 + (idx % 3) * 0.12), p.s * 0.66, p.s * (0.9 + ((idx + 1) % 3) * 0.12));
    rDummy.rotation.set(p.r * 0.25, p.r, p.r * 0.18);
    rDummy.updateMatrix();
    rockInst.setMatrixAt(idx, rDummy.matrix);
    if (p.nearBank) {
      rCol.setHex(idx % 2 === 0 ? 0x828473 : 0x958d78);
    } else {
      rCol.setHex(idx % 3 === 0 ? 0x707570 : idx % 3 === 1 ? 0x81857e : 0x626766);
    }
    rockInst.setColorAt(idx, rCol);
  });
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  country.add(rockInst);

  // ── F2. SWAYING RIVERSIDE REEDS / CATTAILS & MEADOW SHRUBS / WILDFLOWERS ───
  const reedPts = [];
  for (let a = 0; a < 900 && reedPts.length < 250; a++) {
    const rz = (rRand() - 0.5) * (WORLD_D - 5);
    if (Math.abs(rz - BRIDGE_Z) < 2.2) continue;
    const side = rRand() > 0.5 ? 1 : -1;
    const rw = riverHalfWidth(rz);
    const rx = riverCenterX(rz) + side * (rw * (0.94 + rRand() * 0.34));
    const ry = terrainHeight(rx, rz);
    if (ry < -0.22 || ry > 0.38) continue;
    reedPts.push({ x: rx, y: Math.max(-0.16, ry), z: rz, s: 0.65 + rRand() * 0.65, rot: rRand() * Math.PI * 2 });
  }
  const reedGeom = new THREE.ConeGeometry(0.08, 0.52, 5);
  reedGeom.translate(0, 0.26, 0);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.90 });
  const reedInst = new THREE.InstancedMesh(reedGeom, reedMat, reedPts.length);
  const reedCol = new THREE.Color();
  const reedBaseHex = [];
  reedPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y, p.z);
    rDummy.scale.set(p.s * 1.35, p.s, p.s * 1.35);
    rDummy.rotation.set(0.08, p.rot, 0.06);
    rDummy.updateMatrix();
    reedInst.setMatrixAt(idx, rDummy.matrix);
    const hex = idx % 3 === 0 ? 0x5c7c3e : idx % 3 === 1 ? 0x6f8d49 : 0x89964f;
    reedBaseHex.push(hex);
    reedCol.setHex(hex);
    reedInst.setColorAt(idx, reedCol);
  });
  reedInst.instanceMatrix.needsUpdate = true;
  if (reedInst.instanceColor) reedInst.instanceColor.needsUpdate = true;
  country.add(reedInst);

  // Lush meadow shrubs & golden/lavender wildflower tufts across the rolling plains
  const shrubPts = [];
  for (let a = 0; a < 900 && shrubPts.length < 240; a++) {
    const sx = (rRand() - 0.5) * (WORLD_W - 6);
    const sz = (rRand() - 0.5) * (WORLD_D - 5);
    const sy = terrainHeight(sx, sz);
    if (sy < 0.22 || sy > 1.85) continue;
    if (Math.abs(sx - riverCenterX(sz)) < riverHalfWidth(sz) + 1.45) continue;
    let blocked = false;
    for (const v of VENUE_SPECS) {
      if (Math.hypot(sx - v.x, sz - v.z) < v.plateauR + 1.1) { blocked = true; break; }
    }
    if (blocked) continue;
    shrubPts.push({ x: sx, y: sy, z: sz, s: 0.45 + rRand() * 0.55, flower: rRand() > 0.72, rot: rRand() * 6.28 });
  }
  const shrubGeom = new THREE.IcosahedronGeometry(0.24, 1);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.90 });
  const shrubInst = new THREE.InstancedMesh(shrubGeom, shrubMat, shrubPts.length);
  shrubInst.receiveShadow = true;
  const sCol = new THREE.Color();
  const shrubBaseHex = [];
  shrubPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y + p.s * 0.11, p.z);
    rDummy.scale.set(p.s * 1.35, p.s * (p.flower ? 0.48 : 0.78), p.s * 1.25);
    rDummy.rotation.set(0, p.rot, 0);
    rDummy.updateMatrix();
    shrubInst.setMatrixAt(idx, rDummy.matrix);
    const hex = p.flower
      ? (idx % 3 === 0 ? 0xe5c85c : idx % 3 === 1 ? 0xd9a05b : 0xb59ad1)
      : (idx % 3 === 0 ? 0x456b34 : idx % 3 === 1 ? 0x567b3e : 0x3b5c2f);
    shrubBaseHex.push(hex);
    sCol.setHex(hex);
    shrubInst.setColorAt(idx, sCol);
  });
  shrubInst.instanceMatrix.needsUpdate = true;
  if (shrubInst.instanceColor) shrubInst.instanceColor.needsUpdate = true;
  country.add(shrubInst);

  const cCorruptShrub = new THREE.Color(0x2b173c);
  const cCorruptReed = new THREE.Color(0x274033);
  const cCorruptBloom = new THREE.Color(0x5cff9a);
  const updateCountrysideCorruption = territorySys => {
    if (!territorySys?.sampleUndeadCorruption) return;
    for (let idx = 0; idx < reedPts.length; idx++) {
      const p = reedPts[idx];
      const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
      reedCol.setHex(reedBaseHex[idx]);
      if (corr > 0.01) reedCol.lerp(idx % 2 === 0 ? cCorruptReed : cCorruptShrub, Math.min(1, corr * 0.92));
      reedInst.setColorAt(idx, reedCol);
    }
    if (reedInst.instanceColor) reedInst.instanceColor.needsUpdate = true;
    for (let idx = 0; idx < shrubPts.length; idx++) {
      const p = shrubPts[idx];
      const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
      sCol.setHex(shrubBaseHex[idx]);
      if (corr > 0.01) sCol.lerp(p.flower ? cCorruptBloom : (idx % 3 === 0 ? cCorruptReed : cCorruptShrub), Math.min(1, corr * 0.90));
      shrubInst.setColorAt(idx, sCol);
    }
    if (shrubInst.instanceColor) shrubInst.instanceColor.needsUpdate = true;
  };

  // ── G. DETAILED VOLUMETRIC MULTI-LAYERED CAMPAIGN CLOUDS & ALPINE MIST ─────
  // Procedural 256×256 frothy billowing cloud-puff texture for feathery cumulus fringes & wisps
  const wispCanvas = document.createElement('canvas');
  wispCanvas.width = 256;
  wispCanvas.height = 256;
  const wctx = wispCanvas.getContext('2d');
  wctx.clearRect(0, 0, 256, 256);
  const drawPuffBlob = (cx, cy, rad, r, g, b, a) => {
    const gr = wctx.createRadialGradient(cx, cy, rad * 0.08, cx, cy, rad);
    gr.addColorStop(0.0, `rgba(${r},${g},${b},${a})`);
    gr.addColorStop(0.45, `rgba(${r},${g},${b},${a * 0.55})`);
    gr.addColorStop(0.78, `rgba(${r - 12},${g - 8},${b},${a * 0.18})`);
    gr.addColorStop(1.0, `rgba(${r - 16},${g - 10},${b},0)`);
    wctx.fillStyle = gr;
    wctx.beginPath();
    wctx.arc(cx, cy, rad, 0, Math.PI * 2);
    wctx.fill();
  };
  // Layered cauliflower cloud puffs (cool lavender-slate belly -> warm sunlit cream highlights)
  drawPuffBlob(128, 146, 98, 198, 210, 224, 0.34);
  drawPuffBlob(86, 134, 72, 232, 232, 228, 0.38);
  drawPuffBlob(170, 136, 70, 234, 232, 226, 0.36);
  drawPuffBlob(126, 114, 78, 255, 250, 238, 0.48);
  drawPuffBlob(96, 106, 54, 255, 252, 244, 0.44);
  drawPuffBlob(154, 108, 52, 255, 251, 240, 0.42);
  drawPuffBlob(128, 86, 44, 255, 253, 248, 0.44);
  const cloudWispTex = new THREE.CanvasTexture(wispCanvas);
  cloudWispTex.colorSpace = THREE.SRGBColorSpace;

  // Four shaded cumulus depth strata: cool shadow base, soft pearl lower billow, ivory mid-deck, gilded crowns
  const cloudBaseMat = new THREE.MeshStandardMaterial({
    color: 0xaabbd0,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const cloudLowerMat = new THREE.MeshStandardMaterial({
    color: 0xdce2e8,
    roughness: 0.94,
    metalness: 0,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const cloudMidMat = new THREE.MeshStandardMaterial({
    color: 0xf7f1e3,
    roughness: 0.91,
    metalness: 0,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const cloudCrownMat = new THREE.MeshStandardMaterial({
    color: 0xfffdf4,
    emissive: 0xffebd0,
    emissiveIntensity: 0.16,
    roughness: 0.86,
    metalness: 0,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const cloudWispMat = new THREE.MeshBasicMaterial({
    map: cloudWispTex,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mistMat = new THREE.MeshBasicMaterial({
    map: cloudWispTex,
    color: 0xe6eff6,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Rich multi-harmonic organic cauliflower puff geometry (subdivided icosahedron with natural billowing!)
  const puffGeom = new THREE.IcosahedronGeometry(1.0, 2);
  const pPos = puffGeom.attributes.position;
  for (let i = 0; i < pPos.count; i++) {
    const vx = pPos.getX(i), vy = pPos.getY(i), vz = pPos.getZ(i);
    const n = 1
      + Math.sin(vx * 3.8 + vz * 3.1) * 0.12
      + Math.cos(vy * 4.7 - vx * 2.9) * 0.10
      + Math.sin(vz * 5.6 + vy * 3.4) * 0.06;
    pPos.setXYZ(i, vx * n, vy * n, vz * n);
  }
  puffGeom.computeVertexNormals();
  const wispPlaneGeom = new THREE.PlaneGeometry(5.8, 4.2);
  wispPlaneGeom.rotateX(-Math.PI / 2);
  const vertWispGeom = new THREE.PlaneGeometry(3.4, 2.2);

  const cloudSeeds = [
    { x: -20, y: 15.2, z: -17, s: 1.48, speed: 0.36, type: 'cumulus', phase: 0.2 },
    { x: 5, y: 16.0, z: -20, s: 1.75, speed: 0.28, type: 'cumulus', phase: 1.6 },
    { x: 22, y: 14.8, z: -7, s: 1.38, speed: 0.40, type: 'cumulus', phase: 3.1 },
    { x: -11, y: 14.6, z: 12, s: 1.48, speed: 0.32, type: 'cumulus', phase: 4.5 },
    { x: 16, y: 15.2, z: 14, s: 1.30, speed: 0.35, type: 'cumulus', phase: 5.4 },
    { x: -6, y: 17.4, z: -11, s: 1.55, speed: 0.46, type: 'cirrus', phase: 2.2 },
    { x: 26, y: 17.0, z: -18, s: 1.68, speed: 0.42, type: 'cirrus', phase: 0.9 },
    // Gentle low alpine mountain mist veils drifting across the northern snow-peak saddles
    { x: -12, y: 8.6, z: -20.5, s: 1.55, speed: 0.22, type: 'mist', phase: 1.1 },
    { x: 10, y: 9.1, z: -21.2, s: 1.65, speed: 0.19, type: 'mist', phase: 3.7 },
  ];

  for (const cs of cloudSeeds) {
    const cl = new THREE.Group();
    if (cs.type === 'cumulus') {
      // Feathered translucent mist halo + soft trailing wisps along cloud skirt
      for (const [ox, oy, oz, sx, sz, rot] of [
        [0, -0.38, 0, 1.52, 1.24, 0.0],
        [-2.3, -0.26, 0.35, 0.85, 0.65, 0.24],
        [2.4, -0.24, -0.25, 0.88, 0.62, -0.18],
      ]) {
        const halo = new THREE.Mesh(wispPlaneGeom, cloudWispMat);
        halo.position.set(ox, oy, oz);
        halo.scale.set(sx, 1, sz);
        halo.rotation.y = rot;
        cl.add(halo);
      }

      // 1. Cool flat shadowed cumulus base
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-2.05, -0.26, 0.18, 1.55, 0.32, 1.12],
        [-0.35, -0.30, -0.18, 2.15, 0.35, 1.42],
        [1.55, -0.24, 0.22, 1.58, 0.32, 1.10],
        [0.45, -0.28, 0.78, 1.42, 0.28, 0.98],
        [-1.15, -0.25, 0.72, 1.25, 0.28, 0.90],
      ]) {
        const m = new THREE.Mesh(puffGeom, cloudBaseMat);
        m.position.set(ox, oy, oz);
        m.scale.set(sx, sy, sz);
        cl.add(m);
      }

      // 2. Soft pearl-grey lower billowing shoulder puffs
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-2.45, -0.04, -0.10, 1.18, 0.44, 0.92],
        [-1.35, 0.02, 0.65, 1.15, 0.46, 0.88],
        [1.95, -0.02, -0.35, 1.12, 0.45, 0.88],
        [2.35, -0.06, 0.32, 0.96, 0.38, 0.78],
        [0.15, -0.02, -0.88, 1.28, 0.46, 0.90],
      ]) {
        const m = new THREE.Mesh(puffGeom, cloudLowerMat);
        m.position.set(ox, oy, oz);
        m.scale.set(sx, sy, sz);
        cl.add(m);
      }

      // 3. Creamy billowing mid-cloud body lobes
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-1.95, 0.12, -0.06, 1.26, 0.56, 1.00],
        [-0.85, 0.24, 0.14, 1.64, 0.72, 1.28],
        [0.52, 0.22, -0.26, 1.62, 0.70, 1.22],
        [1.72, 0.10, 0.16, 1.20, 0.52, 0.95],
        [-0.12, 0.14, 0.80, 1.24, 0.54, 0.94],
        [1.06, 0.10, 0.64, 1.08, 0.46, 0.88],
      ]) {
        const m = new THREE.Mesh(puffGeom, cloudMidMat);
        m.position.set(ox, oy, oz);
        m.scale.set(sx, sy, sz);
        cl.add(m);
      }

      // 4. Warm golden-sunlit upper cumulus turret crowns + frothy soft edge cards!
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-0.68, 0.58, -0.04, 1.16, 0.68, 0.96],
        [0.28, 0.74, -0.18, 1.32, 0.78, 1.06],
        [0.85, 0.50, 0.18, 0.96, 0.54, 0.86],
        [-1.48, 0.40, 0.06, 0.88, 0.48, 0.78],
        [0.05, 0.94, -0.10, 0.78, 0.54, 0.72],
      ]) {
        const m = new THREE.Mesh(puffGeom, cloudCrownMat);
        m.position.set(ox, oy, oz);
        m.scale.set(sx, sy, sz);
        cl.add(m);
      }
      for (const [ox, oy, oz, ry] of [[-0.5, 0.35, 0.1, 0.25], [0.6, 0.42, -0.1, -0.35]]) {
        const vc = new THREE.Mesh(vertWispGeom, cloudWispMat);
        vc.position.set(ox, oy, oz);
        vc.rotation.y = ry;
        cl.add(vc);
      }
    } else if (cs.type === 'cirrus') {
      // High-altitude wispy streaky alpine cirrus veils
      for (const [ox, oz, sx, sz, rot] of [
        [-2.0, -0.25, 1.35, 0.38, 0.14],
        [0.1, 0.08, 1.85, 0.46, -0.05],
        [2.2, 0.32, 1.25, 0.34, 0.11],
        [-0.6, 0.55, 1.10, 0.28, -0.08],
      ]) {
        const w = new THREE.Mesh(wispPlaneGeom, cloudWispMat);
        w.position.set(ox, 0, oz);
        w.scale.set(sx, 1, sz);
        w.rotation.y = rot;
        cl.add(w);
      }
    } else {
      // Soft mountain-hugging alpine mist ribbon
      for (const [ox, oz, sx, sz] of [[-1.5, 0, 1.5, 0.85], [0.8, 0.3, 1.7, 0.92], [2.4, -0.2, 1.2, 0.72]]) {
        const m = new THREE.Mesh(wispPlaneGeom, mistMat);
        m.position.set(ox, 0, oz);
        m.scale.set(sx, 1, sz);
        cl.add(m);
      }
    }
    cl.position.set(cs.x, cs.y, cs.z);
    cl.scale.setScalar(cs.s);
    country.add(cl);
    driftingClouds.push({ mesh: cl, speed: cs.speed, baseY: cs.y, phase: cs.phase });
  }

  // ── H. LIVING ROAMING WILDLIFE: EAGLES, BIRD FLOCKS, FOREST DEER, HORSES, RIVER SWANS & BUTTERFLIES! ─
  const eagleMat = new THREE.MeshBasicMaterial({ color: 0x2a231c, side: THREE.DoubleSide });
  const hawkMat = new THREE.MeshBasicMaterial({ color: 0x453528, side: THREE.DoubleSide });
  const eagleConfigs = [
    { cx: -4, cz: -9, r: 5.5, y: 7.6, speed: 0.26, phase: 0.0, mat: eagleMat, s: 1.0 },
    { cx: 9, cz: 4, r: 7.2, y: 8.6, speed: 0.33, phase: 2.5, mat: eagleMat, s: 1.0 },
    { cx: -14, cz: -17, r: 6.4, y: 11.4, speed: 0.24, phase: 1.2, mat: hawkMat, s: 1.12 },
    { cx: 15, cz: -16, r: 6.8, y: 11.8, speed: -0.22, phase: 4.1, mat: hawkMat, s: 1.08 },
  ];
  for (const ec of eagleConfigs) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 5), ec.mat);
    body.rotation.x = Math.PI / 2;
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.14), ec.mat);
    lw.position.x = -0.21;
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.14), ec.mat);
    rw.position.x = 0.21;
    bird.add(body, lw, rw);
    bird.scale.setScalar(ec.s);
    country.add(bird);
    soaringEagles.push({ mesh: bird, lw, rw, ...ec });
  }

  // Graceful V-flock of 8 white/slate valley swallows gliding across the river basin
  const birdFlock = [];
  const swallowMat = new THREE.MeshBasicMaterial({ color: 0xf4f2eb, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Group();
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.08), swallowMat);
    lw.position.x = -0.10;
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.08), swallowMat);
    rw.position.x = 0.10;
    b.add(lw, rw);
    country.add(b);
    const rank = Math.floor((i + 1) / 2);
    const side = i % 2 === 0 ? 1 : -1;
    birdFlock.push({
      mesh: b,
      lw,
      rw,
      offX: i === 0 ? 0 : side * rank * 0.55,
      offZ: -rank * 0.48,
      offY: (i % 3 - 1) * 0.16,
      phase: i * 0.85,
    });
  }

  // Roaming Woodland Deer Herds (antlered stags & does meandering peacefully through clearings)
  const roamingAnimals = [];
  const deerCoat = new THREE.MeshStandardMaterial({ color: 0x9c6b42, roughness: 0.88 });
  const deerBelly = new THREE.MeshStandardMaterial({ color: 0xd9c29e, roughness: 0.90 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0x4b3826, roughness: 0.92 });
  const makeDeer = isStag => {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.30), deerCoat);
    torso.position.y = 0.21;
    torso.castShadow = true;
    g.add(torso);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.08), deerCoat);
    neck.position.set(0, 0.30, 0.13);
    neck.rotation.x = 0.25;
    g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.11), deerCoat);
    head.position.set(0, 0.37, 0.18);
    g.add(head);
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), deerBelly);
    rump.position.set(0, 0.22, -0.15);
    g.add(rump);
    for (const [lx, lz] of [[-0.045, 0.10], [0.045, 0.10], [-0.045, -0.10], [0.045, -0.10]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.17, 4), antlerMat);
      leg.position.set(lx, 0.085, lz);
      g.add(leg);
    }
    if (isStag) {
      for (const sgn of [-1, 1]) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 4), antlerMat);
        ant.position.set(sgn * 0.04, 0.44, 0.17);
        ant.rotation.z = -sgn * 0.42;
        g.add(ant);
      }
    }
    return { group: g, head };
  };

  // 2 woodland herds + 3 roaming chestnut/dapple horses in the northwestern meadow
  const deerPaths = [
    { cx: -14.2, cz: -1.8, rx: 2.3, rz: 1.8, speed: 0.18, phase: 0.0, stag: true },
    { cx: -13.6, cz: -1.2, rx: 2.0, rz: 1.5, speed: 0.16, phase: 1.9, stag: false },
    { cx: -14.8, cz: -2.3, rx: 1.8, rz: 1.4, speed: 0.17, phase: 3.8, stag: false },
    { cx: 11.4, cz: -12.6, rx: 2.4, rz: 1.6, speed: 0.15, phase: 0.8, stag: true },
    { cx: 12.1, cz: -12.0, rx: 2.0, rz: 1.5, speed: 0.14, phase: 2.9, stag: false },
    { cx: 10.6, cz: -13.1, rx: 1.7, rz: 1.3, speed: 0.16, phase: 4.7, stag: false },
  ];
  for (const dp of deerPaths) {
    const { group, head } = makeDeer(dp.stag);
    country.add(group);
    roamingAnimals.push({ mesh: group, head, ...dp, kind: 'deer' });
  }

  // 3 Roaming Medieval Horses near Silverlance Grounds (chestnut, bay, and dapple grey)
  const horseCoats = [
    new THREE.MeshStandardMaterial({ color: 0x734124, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: 0xc9c6be, roughness: 0.86 }),
  ];
  const horsePaths = [
    { cx: -17.2, cz: -12.8, rx: 2.2, rz: 1.6, speed: 0.21, phase: 0.5 },
    { cx: -16.4, cz: -12.2, rx: 1.9, rz: 1.5, speed: 0.19, phase: 2.6 },
    { cx: -18.0, cz: -13.2, rx: 2.4, rz: 1.4, speed: 0.17, phase: 4.4 },
  ];
  horsePaths.forEach((hp, idx) => {
    const coat = horseCoats[idx % horseCoats.length];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.38), coat);
    body.position.y = 0.26;
    body.castShadow = true;
    g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.11), coat);
    neck.position.set(0, 0.36, 0.17);
    neck.rotation.x = 0.34;
    g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.14), coat);
    head.position.set(0, 0.43, 0.23);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), antlerMat);
    tail.position.set(0, 0.23, -0.21);
    tail.rotation.x = -0.28;
    g.add(tail);
    for (const [lx, lz] of [[-0.06, 0.13], [0.06, 0.13], [-0.06, -0.13], [0.06, -0.13]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.21, 5), antlerMat);
      leg.position.set(lx, 0.105, lz);
      g.add(leg);
    }
    country.add(g);
    roamingAnimals.push({ mesh: g, head, ...hp, kind: 'horse' });
  });

  // 4 Graceful White River Swans gliding smoothly along calm reaches of River Willowmere
  const riverSwans = [];
  const swanWhite = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.72 });
  const swanBill = new THREE.MeshStandardMaterial({ color: 0xe3842b, roughness: 0.70 });
  const swanConfigs = [
    { zMin: -16.8, zMax: NORTH_BRIDGE_Z - 2.0, offset: -0.48, speed: 0.15, phase: 0.4 },
    { zMin: -16.2, zMax: NORTH_BRIDGE_Z - 2.2, offset: -0.22, speed: 0.15, phase: 0.65 },
    { zMin: SOUTH_BRIDGE_Z + 2.2, zMax: 18.2, offset: 0.46, speed: 0.14, phase: 2.1 },
    { zMin: SOUTH_BRIDGE_Z + 2.4, zMax: 17.8, offset: 0.20, speed: 0.14, phase: 2.38 },
  ];
  for (const sc of swanConfigs) {
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), swanWhite);
    body.scale.set(0.85, 0.68, 1.35);
    body.position.y = 0.05;
    s.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.030, 0.17, 6), swanWhite);
    neck.position.set(0, 0.14, 0.10);
    neck.rotation.x = 0.22;
    s.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), swanWhite);
    head.position.set(0, 0.22, 0.13);
    s.add(head);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 5), swanBill);
    bill.rotation.x = Math.PI / 2;
    bill.position.set(0, 0.21, 0.17);
    s.add(bill);
    country.add(s);
    riverSwans.push({ mesh: s, ...sc });
  }

  // 14 Delicate Fluttering Butterflies dancing over the golden wheat fields & wildflowers
  const butterflies = [];
  const bflyMats = [
    new THREE.MeshBasicMaterial({ color: 0xffe26a, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0xaad8ff, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: 0xfff5d6, side: THREE.DoubleSide }),
  ];
  const bflyCenters = [
    [-3.4, 14.0], [-6.2, 15.6], [-9.0, 14.0],
    [16.2, 3.4], [18.8, 1.4], [19.0, 6.0],
    [-25.2, 2.2], [-22.6, 4.6], [-19.6, 2.0],
    [4.4, -11.4], [-4.8, 2.5], [5.8, -1.8],
    [11.8, -11.8], [-14.0, -1.5],
  ];
  bflyCenters.forEach(([bx0, bz0], idx) => {
    const bf = new THREE.Group();
    const mat = bflyMats[idx % bflyMats.length];
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.065), mat);
    lw.position.x = -0.042;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.065), mat);
    rw.position.x = 0.042;
    bf.add(lw, rw);
    country.add(bf);
    butterflies.push({
      mesh: bf,
      lw,
      rw,
      cx: bx0,
      cz: bz0,
      r: 0.75 + (idx % 3) * 0.35,
      speed: 0.85 + (idx % 4) * 0.22,
      phase: idx * 1.37,
    });
  });

  parent.add(country);
  return {
    country,
    spinningSails,
    riverBoats,
    updateShips,
    driftingClouds,
    soaringEagles,
    birdFlock,
    roamingAnimals,
    riverSwans,
    butterflies,
    towerFlames,
    chimneyPuffs,
    reedInst,
    syncTerritoryColors,
    updateCorruption: updateCountrysideCorruption,
  };
}

function buildForests(parent, farmPlots = []) {
  const forestGroup = new THREE.Group();
  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const positions = [];
  for (let attempt = 0; attempt < 2400 && positions.length < 440; attempt++) {
    const x = (rand() - 0.5) * (WORLD_W - 6);
    const z = (rand() - 0.5) * (WORLD_D - 5);
    const h = terrainHeight(x, z);
    if (h < 0.22 || h > 2.55) continue;

    // Natural woodland grove clustering via fBm so forests form rich groves with sunlit clearings!
    const grove = fbm2D(x * 0.12 + 7.4, z * 0.12 - 3.9, 2);
    if (grove < -0.14 && rand() > 0.22) continue;

    // Keep clear of winding river & all 3 bridges
    const rx = riverCenterX(z);
    if (Math.abs(x - rx) < riverHalfWidth(z) + 1.65) continue;
    if (Math.hypot(x - riverCenterX(BRIDGE_Z), z - BRIDGE_Z) < 4.6) continue;
    if (Math.hypot(x - riverCenterX(NORTH_BRIDGE_Z), z - NORTH_BRIDGE_Z) < 3.6) continue;
    if (Math.hypot(x - riverCenterX(SOUTH_BRIDGE_Z), z - SOUTH_BRIDGE_Z) < 3.8) continue;

    // Keep clear of all 4 venue plateaus, approach roads, farm roads & planted 3D crop fields
    let blocked = false;
    for (const fp of farmPlots) {
      if (Math.hypot(x - fp.cx, z - fp.cz) < fp.rad + 0.55) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const road of [...getResolvedFarmRoadPaths(), ...getSideBridgeRoadPaths()]) {
      for (let s = 0; s < road.length - 1; s++) {
        const [ax, az] = road[s];
        const [bx0, bz0] = road[s + 1];
        const vx = bx0 - ax;
        const vz = bz0 - az;
        const lenSq = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / lenSq));
        if (Math.hypot(x - (ax + t * vx), z - (az + t * vz)) < 1.05) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) continue;
    for (const v of VENUE_SPECS) {
      if (Math.hypot(x - v.x, z - v.z) < v.plateauR + 1.65) {
        blocked = true;
        break;
      }
      const bx = riverCenterX(BRIDGE_Z);
      const vx = bx - v.x;
      const vz = BRIDGE_Z - v.z;
      const lenSq = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - v.x) * vx + (z - v.z) * vz) / lenSq));
      const projX = v.x + t * vx;
      const projZ = v.z + t * vz;
      if (Math.hypot(x - projX, z - projZ) < 1.65) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    positions.push({
      x,
      y: h,
      z,
      s: 0.62 + rand() * 0.68,
      pine: z < 1.5 || h > 1.35 || rand() > 0.42,
      shade: rand(),
    });
  }

  const trunks = positions.length;
  const trunkGeom = new THREE.CylinderGeometry(0.055, 0.105, 0.48, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, trunks);

  const pines = positions.filter(p => p.pine);
  const oaks = positions.filter(p => !p.pine);

  // Multi-tiered smooth pine trees (lower + upper bough tiers) with natural per-tree green variation
  const pineLowerGeom = new THREE.ConeGeometry(0.46, 0.82, 9);
  const pineUpperGeom = new THREE.ConeGeometry(0.32, 0.78, 9);
  const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, flatShading: false });
  const pineLowerMesh = new THREE.InstancedMesh(pineLowerGeom, pineMat, pines.length);
  const pineUpperMesh = new THREE.InstancedMesh(pineUpperGeom, pineMat, pines.length);
  pineLowerMesh.castShadow = true;
  pineUpperMesh.castShadow = true;
  pineLowerMesh.receiveShadow = true;

  // Smooth organic broadleaf oaks (main canopy + secondary offset lobe) with rich natural foliage hues
  const oakGeom = new THREE.IcosahedronGeometry(0.45, 2);
  const oPos = oakGeom.attributes.position;
  for (let i = 0; i < oPos.count; i++) {
    const vx = oPos.getX(i);
    const vy = oPos.getY(i);
    const vz = oPos.getZ(i);
    const bump = 1 + Math.sin(vx * 7 + vy * 5) * 0.11 + Math.cos(vz * 6 - vx * 4) * 0.09;
    oPos.setXYZ(i, vx * bump, vy * bump * 0.82, vz * bump);
  }
  oakGeom.computeVertexNormals();
  const oakMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, flatShading: false });
  const oakMainMesh = new THREE.InstancedMesh(oakGeom, oakMat, oaks.length);
  const oakCrownMesh = new THREE.InstancedMesh(oakGeom, oakMat, oaks.length);
  oakMainMesh.castShadow = true;
  oakMainMesh.receiveShadow = true;
  oakCrownMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const pinePalette = [0x264428, 0x2e5030, 0x375b34, 0x223b26];
  const oakPalette = [0x456b34, 0x567b3c, 0x678842, 0x3d5e31, 0x7b8944];

  const trunkBaseCol = new THREE.Color(0x4b3522);
  positions.forEach((p, idx) => {
    dummy.position.set(p.x, p.y + 0.20 * p.s, p.z);
    dummy.scale.setScalar(p.s);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(idx, dummy.matrix);
    trunkMesh.setColorAt(idx, trunkBaseCol);
  });
  const pineBaseHex = [];
  pines.forEach((p, idx) => {
    const tint = pinePalette[Math.floor(p.shade * pinePalette.length) % pinePalette.length];
    pineBaseHex.push(tint);
    col.setHex(tint);

    dummy.position.set(p.x, p.y + 0.66 * p.s, p.z);
    dummy.scale.set(p.s, p.s * 1.05, p.s);
    dummy.rotation.set(0, idx * 0.7, 0);
    dummy.updateMatrix();
    pineLowerMesh.setMatrixAt(idx, dummy.matrix);
    pineLowerMesh.setColorAt(idx, col);

    dummy.position.set(p.x, p.y + 1.12 * p.s, p.z);
    dummy.scale.set(p.s * 0.92, p.s * 1.08, p.s * 0.92);
    dummy.rotation.set(0, idx * 0.7 + 0.5, 0);
    dummy.updateMatrix();
    pineUpperMesh.setMatrixAt(idx, dummy.matrix);
    col.offsetHSL(0.006, 0.02, 0.03);
    pineUpperMesh.setColorAt(idx, col);
  });
  const oakBaseHex = [];
  oaks.forEach((p, idx) => {
    const tint = oakPalette[Math.floor(p.shade * oakPalette.length) % oakPalette.length];
    oakBaseHex.push(tint);
    col.setHex(tint);

    dummy.position.set(p.x, p.y + 0.62 * p.s, p.z);
    dummy.scale.set(p.s * 1.12, p.s * 0.95, p.s * 1.12);
    dummy.rotation.set(0, idx * 0.9, 0);
    dummy.updateMatrix();
    oakMainMesh.setMatrixAt(idx, dummy.matrix);
    oakMainMesh.setColorAt(idx, col);

    const ang = idx * 1.7;
    dummy.position.set(p.x + Math.cos(ang) * 0.22 * p.s, p.y + 0.80 * p.s, p.z + Math.sin(ang) * 0.22 * p.s);
    dummy.scale.set(p.s * 0.72, p.s * 0.68, p.s * 0.72);
    dummy.rotation.set(0, idx * 1.3, 0);
    dummy.updateMatrix();
    oakCrownMesh.setMatrixAt(idx, dummy.matrix);
    col.offsetHSL(0.01, 0.03, 0.045);
    oakCrownMesh.setColorAt(idx, col);
  });

  trunkMesh.instanceMatrix.needsUpdate = true;
  if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
  pineLowerMesh.instanceMatrix.needsUpdate = true;
  pineUpperMesh.instanceMatrix.needsUpdate = true;
  oakMainMesh.instanceMatrix.needsUpdate = true;
  oakCrownMesh.instanceMatrix.needsUpdate = true;
  if (pineLowerMesh.instanceColor) pineLowerMesh.instanceColor.needsUpdate = true;
  if (pineUpperMesh.instanceColor) pineUpperMesh.instanceColor.needsUpdate = true;
  if (oakMainMesh.instanceColor) oakMainMesh.instanceColor.needsUpdate = true;
  if (oakCrownMesh.instanceColor) oakCrownMesh.instanceColor.needsUpdate = true;

  // Dynamic Undead Forest Corruption: pines & oaks wither into dark cursed plum-violet & dead necrotic teal!
  const cDeadTrunk = new THREE.Color(0x1c1524);
  const cCorruptPineA = new THREE.Color(0x271538);
  const cCorruptPineB = new THREE.Color(0x1e352b);
  const cCorruptOakA = new THREE.Color(0x36184c);
  const cCorruptOakB = new THREE.Color(0x254233);
  const updateCorruption = territorySys => {
    if (!territorySys?.sampleUndeadCorruption) return;
    for (let idx = 0; idx < positions.length; idx++) {
      const p = positions[idx];
      const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
      col.copy(trunkBaseCol);
      if (corr > 0.01) col.lerp(cDeadTrunk, Math.min(1, corr * 0.92));
      trunkMesh.setColorAt(idx, col);
    }
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    for (let idx = 0; idx < pines.length; idx++) {
      const p = pines[idx];
      const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
      col.setHex(pineBaseHex[idx]);
      if (corr > 0.01) col.lerp(idx % 3 === 0 ? cCorruptPineB : cCorruptPineA, Math.min(1, corr * 0.94));
      pineLowerMesh.setColorAt(idx, col);
      col.offsetHSL(0.006, 0.02, 0.03);
      pineUpperMesh.setColorAt(idx, col);
    }
    if (pineLowerMesh.instanceColor) pineLowerMesh.instanceColor.needsUpdate = true;
    if (pineUpperMesh.instanceColor) pineUpperMesh.instanceColor.needsUpdate = true;
    for (let idx = 0; idx < oaks.length; idx++) {
      const p = oaks[idx];
      const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
      col.setHex(oakBaseHex[idx]);
      if (corr > 0.01) col.lerp(idx % 3 === 0 ? cCorruptOakB : cCorruptOakA, Math.min(1, corr * 0.94));
      oakMainMesh.setColorAt(idx, col);
      col.offsetHSL(0.01, 0.03, 0.045);
      oakCrownMesh.setColorAt(idx, col);
    }
    if (oakMainMesh.instanceColor) oakMainMesh.instanceColor.needsUpdate = true;
    if (oakCrownMesh.instanceColor) oakCrownMesh.instanceColor.needsUpdate = true;
  };

  forestGroup.add(trunkMesh, pineLowerMesh, pineUpperMesh, oakMainMesh, oakCrownMesh);
  parent.add(forestGroup);
  return { forestGroup, updateCorruption };
}

// Procedural alpha-cutout multi-stalk golden wheat clump texture (curving stalks, leaves, braided grain ears & awns!)
function createWheatClumpTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  // 13 layered gracefully arching wheat stalks fanning naturally from base
  const stalks = [
    { x0: 0.44, bend: -0.34, h: 0.72, w: 3.4, tone: 0 },
    { x0: 0.56, bend: 0.35, h: 0.70, w: 3.4, tone: 0 },
    { x0: 0.36, bend: -0.26, h: 0.80, w: 3.6, tone: 1 },
    { x0: 0.64, bend: 0.28, h: 0.79, w: 3.6, tone: 1 },
    { x0: 0.48, bend: -0.18, h: 0.86, w: 3.8, tone: 1 },
    { x0: 0.52, bend: 0.19, h: 0.88, w: 3.8, tone: 1 },
    { x0: 0.30, bend: -0.22, h: 0.68, w: 3.2, tone: 0 },
    { x0: 0.70, bend: 0.22, h: 0.67, w: 3.2, tone: 0 },
    { x0: 0.42, bend: -0.11, h: 0.92, w: 4.0, tone: 2 },
    { x0: 0.58, bend: 0.12, h: 0.91, w: 4.0, tone: 2 },
    { x0: 0.50, bend: -0.04, h: 0.95, w: 4.2, tone: 2 },
    { x0: 0.46, bend: 0.06, h: 0.84, w: 3.6, tone: 2 },
    { x0: 0.54, bend: -0.08, h: 0.82, w: 3.6, tone: 1 },
  ];

  for (const st of stalks) {
    const bx = st.x0 * S;
    const by = S - 2;
    const tipX = (st.x0 + st.bend) * S;
    const tipY = (1 - st.h) * S + 18;
    const ctrlX = (st.x0 + st.bend * 0.32) * S;
    const ctrlY = (1 - st.h * 0.56) * S;

    // Pure golden-yellow sunlit wheat stem gradient (zero dark brown/black!)
    const stemGrad = ctx.createLinearGradient(bx, by, tipX, tipY);
    stemGrad.addColorStop(0.0, st.tone === 0 ? '#cfa536' : '#dbb23e');
    stemGrad.addColorStop(0.45, st.tone === 2 ? '#efd056' : '#e4c14a');
    stemGrad.addColorStop(1.0, st.tone === 2 ? '#ffe678' : '#f7da66');
    ctx.strokeStyle = stemGrad;
    ctx.lineWidth = st.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    ctx.stroke();

    // Slender drooping golden wheat leaf blade off the lower-mid stem
    const lx = (bx + ctrlX) * 0.5;
    const ly = (by + ctrlY) * 0.5;
    const side = st.bend >= 0 ? 1 : -1;
    ctx.strokeStyle = st.tone === 0 ? '#dfb944' : '#edc952';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(lx + side * 22, ly - 18, lx + side * 36, ly + 10);
    ctx.stroke();

    // Braided golden wheat ear (6 overlapping angled grain kernels + delicate sunlit awns/whiskers!)
    const dx = tipX - ctrlX;
    const dy = tipY - ctrlY;
    const earAng = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(earAng);
    const grainLight = st.tone === 2 ? '#ffef96' : st.tone === 1 ? '#fde47c' : '#f4d362';
    const grainDark = st.tone === 2 ? '#efd054' : '#e2be44';
    for (let k = -3; k <= 3; k++) {
      const gx = k * 5.2;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = sgn > 0 ? grainLight : grainDark;
        ctx.beginPath();
        ctx.ellipse(gx, sgn * 3.1, 5.2, 2.7, sgn * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Delicate golden wheat awns (whiskers) radiating slightly from the ear tip
    ctx.strokeStyle = 'rgba(255, 242, 174, 0.85)';
    ctx.lineWidth = 1.05;
    for (let w = -2; w <= 2; w++) {
      ctx.beginPath();
      ctx.moveTo(14, w * 2.2);
      ctx.lineTo(28 + Math.abs(w) * 2, w * 4.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pad zero-alpha transparent pixels with warm golden RGB so WebGL mipmaps NEVER bleed black edges!
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) {
      d[i] = 242;
      d[i + 1] = 208;
      d[i + 2] = 88;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Procedural alpha-cutout feathery purple lavender / flax tuft texture
function createLavenderClumpTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const stems = [-0.30, -0.22, -0.14, -0.07, 0.0, 0.08, 0.16, 0.24, 0.31];
  stems.forEach((bend, idx) => {
    const bx = (0.5 + bend * 0.35) * S;
    const by = S - 2;
    const h = 0.64 + (1 - Math.abs(bend)) * 0.26 + (idx % 2) * 0.05;
    const tx = (0.5 + bend) * S;
    const ty = (1 - h) * S + 16;
    ctx.strokeStyle = idx % 2 === 0 ? '#5c744c' : '#6c845a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + tx) * 0.5, (by + ty) * 0.52, tx, ty + 28);
    ctx.stroke();

    // Clustered purple-violet florets along the top spike
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const fx = tx + (bx - tx) * t * 0.22 + (k % 2 === 0 ? -3 : 3);
      const fy = ty + t * 44;
      ctx.fillStyle = k < 2 ? '#b494e3' : k < 5 ? '#8c69bf' : '#6b4d9a';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 5.6 - t * 1.4, 4.2, 0.2 * (k % 2 ? 1 : -1), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 3-plane crossed & gently splayed tuft geometry so wheat/lavender looks lush & volumetric from every angle!
function createCrossedTuftGeometry(width, height) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const planes = 3;

  for (let p = 0; p < planes; p++) {
    const ang = (p / planes) * Math.PI;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const baseIdx = p * 6;
    const hw = width * 0.5;
    // 2 vertical tiers (base, mid, splayed top) so wind bends the upper stalks smoothly!
    const tiers = [
      { y: -0.02, v: 0.0, wMul: 0.85, lean: 0.0 },
      { y: height * 0.50, v: 0.5, wMul: 1.02, lean: 0.025 },
      { y: height, v: 1.0, wMul: 1.18, lean: 0.065 },
    ];
    for (const tr of tiers) {
      const lx = hw * tr.wMul;
      const ox = -sa * tr.lean;
      const oz = ca * tr.lean;
      positions.push(
        -lx * ca + ox, tr.y, -lx * sa + oz,
        lx * ca + ox, tr.y, lx * sa + oz
      );
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, tr.v, 1, tr.v);
    }
    // Emit both front & back windings as FrontSide triangles so BOTH sides keep upward (0,1,0) sunlit normals (zero dark/black backfaces!)
    indices.push(
      baseIdx + 0, baseIdx + 1, baseIdx + 2,
      baseIdx + 1, baseIdx + 3, baseIdx + 2,
      baseIdx + 2, baseIdx + 3, baseIdx + 4,
      baseIdx + 3, baseIdx + 5, baseIdx + 4,
      baseIdx + 0, baseIdx + 2, baseIdx + 1,
      baseIdx + 1, baseIdx + 2, baseIdx + 3,
      baseIdx + 2, baseIdx + 4, baseIdx + 3,
      baseIdx + 3, baseIdx + 4, baseIdx + 5
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

// Attach smooth GPU rolling wind-wave shader to instanced crop materials (roots stay anchored, tips ripple!)
function attachCropWindShader(mat, windUniform, amp = 0.085) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uWindTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 tgInstPos = instanceMatrix * vec4(transformed, 1.0);
          float tgBend = uv.y * uv.y;
          float tgWave = sin(uWindTime * 2.1 + tgInstPos.x * 0.45 + tgInstPos.z * 0.36)
                       + 0.45 * cos(uWindTime * 3.0 + tgInstPos.x * 0.85 - tgInstPos.z * 0.62);
          transformed.x += tgWave * ${amp.toFixed(4)} * tgBend;
          transformed.z += tgWave * ${(amp * 0.65).toFixed(4)} * tgBend;
        #endif`
      );
  };
}

// 3D Natural Organic Agricultural Fields: Sweeping Wind-Rippled Golden Wheat Meadows,
// Feathered Lavender Slopes, Curved Hillside Vineyards, Cottage Gardens & Bundled Harvest Sheaves!
function build3DFarms(parent, farmPlots) {
  const farmGroup = new THREE.Group();
  const windUniform = { value: 0 };

  let fSeed = 5153;
  const fRand = () => {
    fSeed = (fSeed * 16807) % 2147483647;
    return (fSeed - 1) / 2147483646;
  };

  const wheatPts = [];
  const sproutPts = [];
  const sheepPts = [];
  const hedgePts = [];
  const hedgeTreePts = [];
  const gatePostPts = [];
  const pasturePostPts = [];
  const pastureRailPts = [];
  const lavenderPts = [];
  const vineHedgePts = [];
  const vinePostPts = [];
  const cabbagePts = [];
  const pumpkinPts = [];
  const pumpkinLeafPts = [];
  const sheafPts = [];

  for (const p of farmPlots) {
    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);
    const toWorld = (lx, lz) => [p.cx + lx * cos - lz * sin, p.cz + lx * sin + lz * cos];
    const maxX = p.w * 0.64;
    const maxZ = p.d * 0.64;

    if (p.crop === 'wheat') {
      // Finer, smaller-scale golden wheat tufts packed ~2.7x denser inside the exact same fields!
      const step = 0.145;
      for (let lz = -maxZ; lz <= maxZ; lz += step) {
        for (let lx = -maxX; lx <= maxX; lx += step) {
          const jx = lx + (fRand() - 0.5) * 0.12;
          const jz = lz + (fRand() - 0.5) * 0.12;
          const dNorm = organicPlotDist(p, jx, jz);
          if (dNorm > 0.94) continue;
          if (dNorm > 0.82 && fRand() > (0.96 - dNorm) / 0.14) continue;

          const [wx, wz] = toWorld(jx, jz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;

          const edgeTaper = 1 - smootherstep(0.76, 0.95, dNorm) * 0.26;
          const fieldRipple = fbm2D(wx * 0.45, wz * 0.45, 2) * 0.5 + 0.5;
          wheatPts.push({
            x: wx,
            y: wy,
            z: wz,
            s: (0.85 + fRand() * 0.38) * edgeTaper,
            rot: fRand() * Math.PI * 2,
            shade: fieldRipple * 0.65 + fRand() * 0.35,
          });
        }
      }
      // Fine bundled golden wheat shocks resting naturally near the cart-lane gateway
      const shockAngle = p.gateAngle + 0.45;
      const sr = organicPlotScale(p, shockAngle) * 0.72;
      const sx0 = Math.cos(shockAngle) * p.w * 0.5 * sr;
      const sz0 = Math.sin(shockAngle) * p.d * 0.5 * sr;
      for (let k = 0; k < 3; k++) {
        const [sx, sz] = toWorld(sx0 + (k - 1) * 0.22, sz0 + (k % 2 ? 0.12 : -0.10));
        const sy = terrainHeight(sx, sz);
        if (sy > 0.20) sheafPts.push({ x: sx, y: sy, z: sz, s: 0.80 + fRand() * 0.25 });
      }
    } else if (p.crop === 'plowed') {
      // Freshly plowed terracotta-brown furrow ridges with denser fine rows of young green shoots
      const rowStep = 0.19;
      const colStep = 0.16;
      for (let lz = -maxZ; lz <= maxZ; lz += rowStep) {
        for (let lx = -maxX; lx <= maxX; lx += colStep) {
          const curveZ = lz + p.curveBend * (1 - (lx / maxX) * (lx / maxX)) * (p.d * 0.42);
          const jx = lx + (fRand() - 0.5) * 0.06;
          const jz = curveZ + (fRand() - 0.5) * 0.035;
          if (organicPlotDist(p, jx, jz) > 0.89) continue;
          if (fRand() > 0.72) continue;
          const [wx, wz] = toWorld(jx, jz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;
          sproutPts.push({ x: wx, y: wy, z: wz, s: 0.70 + fRand() * 0.42, rot: fRand() * 6.28, shade: fRand() });
        }
      }
    } else if (p.crop === 'pasture') {
      // Lush emerald grazing meadow with 5-7 animated wandering grazing sheep!
      const count = 5 + Math.floor(fRand() * 3);
      for (let k = 0; k < count; k++) {
        const a = fRand() * Math.PI * 2;
        const rr = (0.14 + fRand() * 0.42) * organicPlotScale(p, a);
        const [wx, wz] = toWorld(Math.cos(a) * p.w * 0.5 * rr, Math.sin(a) * p.d * 0.5 * rr);
        const wy = terrainHeight(wx, wz);
        if (wy > 0.18) {
          sheepPts.push({
            x: wx,
            y: wy,
            z: wz,
            rot: fRand() * Math.PI * 2,
            s: 0.78 + fRand() * 0.26,
            roamR: 0.24 + fRand() * 0.22,
            speed: 0.18 + fRand() * 0.14,
            phase: fRand() * Math.PI * 2,
          });
        }
      }
    } else if (p.crop === 'lavender') {
      const rowStep = 0.20;
      const colStep = 0.15;
      for (let lz = -maxZ; lz <= maxZ; lz += rowStep) {
        for (let lx = -maxX; lx <= maxX; lx += colStep) {
          const curveZ = lz + p.curveBend * (1 - (lx / maxX) * (lx / maxX)) * (p.d * 0.45);
          const jx = lx + (fRand() - 0.5) * 0.06;
          const jz = curveZ + (fRand() - 0.5) * 0.04;
          if (organicPlotDist(p, jx, jz) > 0.90) continue;
          const [wx, wz] = toWorld(jx, jz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;
          lavenderPts.push({ x: wx, y: wy, z: wz, s: 0.82 + fRand() * 0.34, rot: fRand() * 6.28, shade: fRand() });
        }
      }
    } else if (p.crop === 'vineyard') {
      const rowStep = 0.28;
      const segLen = 0.20;
      for (let lz = -maxZ; lz <= maxZ; lz += rowStep) {
        let prevIn = false;
        let lastPost = 0;
        for (let lx = -maxX; lx <= maxX; lx += segLen) {
          const curveZ = lz + p.curveBend * (1 - (lx / maxX) * (lx / maxX)) * (p.d * 0.42);
          if (organicPlotDist(p, lx, curveZ) > 0.89) {
            prevIn = false;
            continue;
          }
          const [wx, wz] = toWorld(lx, curveZ);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) { prevIn = false; continue; }
          if (!prevIn || lastPost >= 3) {
            vinePostPts.push({ x: wx, y: wy, z: wz });
            lastPost = 0;
          } else {
            lastPost++;
          }
          vineHedgePts.push({ x: wx, y: wy, z: wz, s: 0.82 + fRand() * 0.32, rot: fRand() * 6.28, shade: fRand() });
          prevIn = true;
        }
      }
    } else if (p.crop === 'cabbage') {
      const step = 0.18;
      for (let lz = -maxZ; lz <= maxZ; lz += step) {
        for (let lx = -maxX; lx <= maxX; lx += step) {
          const jx = lx + (fRand() - 0.5) * 0.06;
          const jz = lz + (fRand() - 0.5) * 0.06;
          if (organicPlotDist(p, jx, jz) > 0.89) continue;
          const [wx, wz] = toWorld(jx, jz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;
          cabbagePts.push({ x: wx, y: wy, z: wz, s: 0.78 + fRand() * 0.38, rot: fRand() * 6.28, shade: fRand() });
        }
      }
    } else if (p.crop === 'pumpkin') {
      const step = 0.24;
      for (let lz = -maxZ; lz <= maxZ; lz += step) {
        for (let lx = -maxX; lx <= maxX; lx += step) {
          const jx = lx + (fRand() - 0.5) * 0.12;
          const jz = lz + (fRand() - 0.5) * 0.12;
          if (organicPlotDist(p, jx, jz) > 0.89) continue;
          const [wx, wz] = toWorld(jx, jz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;
          pumpkinLeafPts.push({ x: wx, y: wy, z: wz, s: 0.82 + fRand() * 0.42, rot: fRand() * 6.28 });
          if (fRand() > 0.22) {
            const [px, pz] = toWorld(jx + (fRand() - 0.5) * 0.10, jz + (fRand() - 0.5) * 0.10);
            const py = terrainHeight(px, pz);
            pumpkinPts.push({ x: px, y: py, z: pz, s: 0.78 + fRand() * 0.42, shade: fRand() });
          }
        }
      }
    }

    // Rustic wooden split-rail fences around livestock pastures (NOT bushes!),
    // and living green hedgerows around crop fields!
    if (p.hedge) {
      if (p.crop === 'pasture') {
        const fenceSteps = 26;
        const gateHalfArc = 0.36;
        const pts = [];
        for (let i = 0; i < fenceSteps; i++) {
          const th = (i / fenceSteps) * Math.PI * 2;
          const dAng = Math.atan2(Math.sin(th - p.gateAngle), Math.cos(th - p.gateAngle));
          const sc = organicPlotScale(p, th) * 1.01;
          const [wx, wz] = toWorld(Math.cos(th) * p.w * 0.5 * sc, Math.sin(th) * p.d * 0.5 * sc);
          const wy = terrainHeight(wx, wz);
          const inGate = Math.abs(dAng) < gateHalfArc;
          pts.push({ x: wx, y: wy, z: wz, valid: wy >= 0.18 && !inGate, isGateEdge: wy >= 0.18 && Math.abs(Math.abs(dAng) - gateHalfArc) < 0.24 });
        }
        for (let i = 0; i < fenceSteps; i++) {
          const cur = pts[i];
          const nxt = pts[(i + 1) % fenceSteps];
          if (cur.valid) {
            pasturePostPts.push({ x: cur.x, y: cur.y, z: cur.z, tall: cur.isGateEdge });
            if (nxt.valid) {
              const dx = nxt.x - cur.x;
              const dz = nxt.z - cur.z;
              const len = Math.hypot(dx, dz);
              if (len > 0.08 && len < 1.2) {
                pastureRailPts.push({
                  x: (cur.x + nxt.x) * 0.5,
                  y: (cur.y + nxt.y) * 0.5,
                  z: (cur.z + nxt.z) * 0.5,
                  len,
                  yaw: Math.atan2(dx, dz),
                });
              }
            }
          }
        }
      } else {
        const perimSteps = 54;
        const gateHalfArc = 0.34;
        for (let i = 0; i < perimSteps; i++) {
          const th = (i / perimSteps) * Math.PI * 2;
          const dAng = Math.atan2(Math.sin(th - p.gateAngle), Math.cos(th - p.gateAngle));
          const sc = organicPlotScale(p, th) * 1.02;
          const lx = Math.cos(th) * p.w * 0.5 * sc;
          const lz = Math.sin(th) * p.d * 0.5 * sc;
          const [wx, wz] = toWorld(lx, lz);
          const wy = terrainHeight(wx, wz);
          if (wy < 0.18) continue;

          if (Math.abs(dAng) < gateHalfArc) {
            // Place twin rustic wooden gateposts framing the cart-lane opening
            if (Math.abs(Math.abs(dAng) - gateHalfArc) < 0.16) {
              gatePostPts.push({ x: wx, y: wy, z: wz });
            }
            continue;
          }
          hedgePts.push({
            x: wx + (fRand() - 0.5) * 0.06,
            y: wy,
            z: wz + (fRand() - 0.5) * 0.06,
            sx: 0.82 + fRand() * 0.42,
            sy: 0.70 + fRand() * 0.52,
            rot: fRand() * 6.28,
            shade: fRand(),
          });
        }

        // Lush rounded shade oak growing naturally out of one hedgerow corner
        if (p.seed > 0.55) {
          const treeAng = p.gateAngle + Math.PI * (0.72 + (p.seed - 0.5) * 0.4);
          const sc = organicPlotScale(p, treeAng) * 1.02;
          const [tx, tz] = toWorld(Math.cos(treeAng) * p.w * 0.5 * sc, Math.sin(treeAng) * p.d * 0.5 * sc);
          const ty = terrainHeight(tx, tz);
          if (ty > 0.20) {
            hedgeTreePts.push({ x: tx, y: ty, z: tz, s: 0.68 + fRand() * 0.34, shade: fRand() });
          }
        }
      }
    }
  }

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // 1. SWEEPING WIND-RIPPLED 3D GOLDEN WHEAT MEADOWS (Pure sunlit golden yellow, zero dark/black!)
  if (wheatPts.length) {
    const wheatTex = createWheatClumpTexture();
    const wheatGeom = createCrossedTuftGeometry(0.28, 0.26);
    const wheatMat = new THREE.MeshStandardMaterial({
      map: wheatTex,
      alphaTest: 0.32,
      side: THREE.FrontSide,
      emissive: 0x5c440c,
      emissiveIntensity: 0.20,
      roughness: 0.84,
      metalness: 0.0,
    });
    attachCropWindShader(wheatMat, windUniform, 0.055);

    const wheatInst = new THREE.InstancedMesh(wheatGeom, wheatMat, wheatPts.length);
    const wheatPalette = [0xfff6d4, 0xffeb9e, 0xfbe082, 0xfff0b2, 0xf6d66e];
    wheatPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.05, p.s, p.s * 1.05);
      dummy.rotation.set((p.shade - 0.5) * 0.14, p.rot, (0.5 - p.shade) * 0.14);
      dummy.updateMatrix();
      wheatInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(wheatPalette[Math.floor(p.shade * wheatPalette.length) % wheatPalette.length]);
      wheatInst.setColorAt(idx, col);
    });
    wheatInst.instanceMatrix.needsUpdate = true;
    if (wheatInst.instanceColor) wheatInst.instanceColor.needsUpdate = true;
    farmGroup.add(wheatInst);
  }

  // 2. FEATHERY WIND-RIPPLED ROYAL LAVENDER SLOPES (Fine dense rows)
  if (lavenderPts.length) {
    const lavTex = createLavenderClumpTexture();
    const lavGeom = createCrossedTuftGeometry(0.22, 0.21);
    const lavMat = new THREE.MeshStandardMaterial({
      map: lavTex,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.88,
    });
    attachCropWindShader(lavMat, windUniform, 0.036);

    const lavInst = new THREE.InstancedMesh(lavGeom, lavMat, lavenderPts.length);
    const lavPalette = [0xf7efff, 0xe8d8ff, 0xdfd0f5, 0xffffff];
    lavenderPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      lavInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(lavPalette[Math.floor(p.shade * lavPalette.length) % lavPalette.length]);
      lavInst.setColorAt(idx, col);
    });
    lavInst.instanceMatrix.needsUpdate = true;
    if (lavInst.instanceColor) lavInst.instanceColor.needsUpdate = true;
    farmGroup.add(lavInst);
  }

  // 3. CURVED HILLSIDE VINEYARDS (FINE LEAFY BUSHES + SLENDER TRELLIS STAKES)
  if (vineHedgePts.length) {
    const vineGeom = new THREE.IcosahedronGeometry(0.115, 1);
    const vineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    const vineInst = new THREE.InstancedMesh(vineGeom, vineMat, vineHedgePts.length);
    vineInst.castShadow = true;
    vineInst.receiveShadow = true;
    const vinePalette = [0x3b6331, 0x477338, 0x2f5429, 0x527d3e];
    vineHedgePts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.095 * p.s, p.z);
      dummy.scale.set(p.s * 1.12, p.s * 0.90, p.s * 0.80);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      vineInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(vinePalette[Math.floor(p.shade * vinePalette.length) % vinePalette.length]);
      vineInst.setColorAt(idx, col);
    });
    vineInst.instanceMatrix.needsUpdate = true;
    if (vineInst.instanceColor) vineInst.instanceColor.needsUpdate = true;
    farmGroup.add(vineInst);
  }
  if (vinePostPts.length) {
    const postGeom = new THREE.CylinderGeometry(0.012, 0.016, 0.22, 5);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a422b, roughness: 0.92 });
    const postInst = new THREE.InstancedMesh(postGeom, postMat, vinePostPts.length);
    vinePostPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.10, p.z);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx, dummy.matrix);
    });
    postInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(postInst);
  }

  // 4. ORGANIC COTTAGE GARDEN CABBAGES & GREENS (Fine dense miniature heads)
  if (cabbagePts.length) {
    const cabGeom = new THREE.IcosahedronGeometry(0.060, 1);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
    const cabInst = new THREE.InstancedMesh(cabGeom, cabMat, cabbagePts.length);
    const cabPalette = [0x5e8f4b, 0x6ea356, 0x4e7c42, 0x7aad60];
    cabbagePts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.036 * p.s, p.z);
      dummy.scale.set(p.s * 1.12, p.s * 0.72, p.s * 1.12);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      cabInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(cabPalette[Math.floor(p.shade * cabPalette.length) % cabPalette.length]);
      cabInst.setColorAt(idx, col);
    });
    cabInst.instanceMatrix.needsUpdate = true;
    if (cabInst.instanceColor) cabInst.instanceColor.needsUpdate = true;
    farmGroup.add(cabInst);
  }

  // 5. ORGANIC AUTUMN PUMPKINS & LEAFY VINES (Fine miniature scale)
  if (pumpkinLeafPts.length) {
    const leafGeom = new THREE.IcosahedronGeometry(0.082, 1);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x446e34, roughness: 0.90 });
    const leafInst = new THREE.InstancedMesh(leafGeom, leafMat, pumpkinLeafPts.length);
    pumpkinLeafPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.022, p.z);
      dummy.scale.set(p.s * 1.25, p.s * 0.34, p.s * 1.15);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      leafInst.setMatrixAt(idx, dummy.matrix);
    });
    leafInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(leafInst);
  }
  if (pumpkinPts.length) {
    const pumpGeom = new THREE.SphereGeometry(0.055, 8, 6);
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
    const pumpInst = new THREE.InstancedMesh(pumpGeom, pumpMat, pumpkinPts.length);
    pumpInst.castShadow = true;
    const pumpPalette = [0xde7422, 0xe8862e, 0xc9601a, 0xeb9834];
    pumpkinPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.042 * p.s, p.z);
      dummy.scale.set(p.s * 1.12, p.s * 0.78, p.s * 1.12);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.updateMatrix();
      pumpInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(pumpPalette[Math.floor(p.shade * pumpPalette.length) % pumpPalette.length]);
      pumpInst.setColorAt(idx, col);
    });
    pumpInst.instanceMatrix.needsUpdate = true;
    if (pumpInst.instanceColor) pumpInst.instanceColor.needsUpdate = true;
    farmGroup.add(pumpInst);
  }

  // 6. BUNDLED GOLDEN HARVEST WHEAT SHOCKS (FINE SCALE WITH ROPE WAIST TIE!)
  if (sheafPts.length) {
    const sheafGeom = new THREE.CylinderGeometry(0.06, 0.14, 0.22, 9);
    const sheafMat = new THREE.MeshStandardMaterial({ color: 0xdec062, roughness: 0.92 });
    const sheafInst = new THREE.InstancedMesh(sheafGeom, sheafMat, sheafPts.length);
    sheafInst.castShadow = true;

    const bandGeom = new THREE.TorusGeometry(0.095, 0.013, 5, 10);
    bandGeom.rotateX(Math.PI / 2);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x7a5c32, roughness: 0.95 });
    const bandInst = new THREE.InstancedMesh(bandGeom, bandMat, sheafPts.length);

    sheafPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.105 * p.s, p.z);
      dummy.scale.setScalar(p.s);
      dummy.rotation.set(0, idx * 1.2, 0);
      dummy.updateMatrix();
      sheafInst.setMatrixAt(idx, dummy.matrix);
      dummy.position.set(p.x, p.y + 0.12 * p.s, p.z);
      dummy.updateMatrix();
      bandInst.setMatrixAt(idx, dummy.matrix);
    });
    sheafInst.instanceMatrix.needsUpdate = true;
    bandInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(sheafInst, bandInst);
  }

  // 7. ORGANIC LIVING ENGLISH-COUNTRYSIDE GREEN HEDGEROWS, GATEPOSTS & SHADE OAKS
  if (hedgePts.length) {
    const hedgeGeom = new THREE.IcosahedronGeometry(0.135, 1);
    const hPos = hedgeGeom.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      const vx = hPos.getX(i), vy = hPos.getY(i), vz = hPos.getZ(i);
      const n = 1 + Math.sin(vx * 16 + vy * 10) * 0.12 + Math.cos(vz * 14 - vx * 8) * 0.10;
      hPos.setXYZ(i, vx * n, vy * n, vz * n);
    }
    hedgeGeom.computeVertexNormals();
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.89, flatShading: false });
    const hedgeInst = new THREE.InstancedMesh(hedgeGeom, hedgeMat, hedgePts.length);
    hedgeInst.castShadow = true;
    hedgeInst.receiveShadow = true;
    const hedgePalette = [0x3c6630, 0x4b7738, 0x355c2b, 0x57833f, 0x426f34];
    hedgePts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.08 * p.sy, p.z);
      dummy.scale.set(p.sx * 1.12, p.sy * 0.84, p.sx * 1.04);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      hedgeInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(hedgePalette[Math.floor(p.shade * hedgePalette.length) % hedgePalette.length]);
      hedgeInst.setColorAt(idx, col);
    });
    hedgeInst.instanceMatrix.needsUpdate = true;
    if (hedgeInst.instanceColor) hedgeInst.instanceColor.needsUpdate = true;
    farmGroup.add(hedgeInst);
  }

  if (pasturePostPts.length) {
    const fPostMat = new THREE.MeshStandardMaterial({ color: 0x6f4e2e, roughness: 0.90 });
    const fPostGeom = new THREE.BoxGeometry(0.052, 0.28, 0.052);
    const fPostInst = new THREE.InstancedMesh(fPostGeom, fPostMat, pasturePostPts.length);
    fPostInst.castShadow = true;
    pasturePostPts.forEach((p, idx) => {
      const hScale = p.tall ? 1.25 : 1.0;
      dummy.position.set(p.x, p.y + 0.13 * hScale, p.z);
      dummy.scale.set(p.tall ? 1.15 : 1, hScale, p.tall ? 1.15 : 1);
      dummy.rotation.set(0, idx * 0.5, 0);
      dummy.updateMatrix();
      fPostInst.setMatrixAt(idx, dummy.matrix);
    });
    fPostInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(fPostInst);
  }

  if (pastureRailPts.length) {
    const fRailMat = new THREE.MeshStandardMaterial({ color: 0x856039, roughness: 0.88 });
    const fRailGeom = new THREE.BoxGeometry(0.030, 0.036, 1.0);
    // Twin horizontal split-timber rails (lower & upper) connecting every pasture fence post!
    const fRailInst = new THREE.InstancedMesh(fRailGeom, fRailMat, pastureRailPts.length * 2);
    fRailInst.castShadow = true;
    let rIdx = 0;
    for (const r of pastureRailPts) {
      for (const ry of [0.10, 0.20]) {
        dummy.position.set(r.x, r.y + ry, r.z);
        dummy.rotation.set(0, r.yaw, 0);
        dummy.scale.set(1, 1, r.len + 0.03);
        dummy.updateMatrix();
        fRailInst.setMatrixAt(rIdx++, dummy.matrix);
      }
    }
    fRailInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(fRailInst);
  }

  if (gatePostPts.length) {
    const gpGeom = new THREE.BoxGeometry(0.055, 0.28, 0.055);
    const gpMat = new THREE.MeshStandardMaterial({ color: 0x6b4d2f, roughness: 0.92 });
    const gpInst = new THREE.InstancedMesh(gpGeom, gpMat, gatePostPts.length);
    gatePostPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.13, p.z);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      gpInst.setMatrixAt(idx, dummy.matrix);
    });
    gpInst.instanceMatrix.needsUpdate = true;
    farmGroup.add(gpInst);
  }

  if (hedgeTreePts.length) {
    const htTrunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.42, 7),
      new THREE.MeshStandardMaterial({ color: 0x543c24, roughness: 0.92 }),
      hedgeTreePts.length
    );
    const htCanopyGeom = new THREE.IcosahedronGeometry(0.42, 2);
    const htMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
    const htCanopy = new THREE.InstancedMesh(htCanopyGeom, htMat, hedgeTreePts.length);
    htCanopy.castShadow = true;
    htCanopy.receiveShadow = true;
    const oakTints = [0x4c7838, 0x5d8842, 0x3f6831];
    hedgeTreePts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 0.18 * p.s, p.z);
      dummy.scale.setScalar(p.s);
      dummy.rotation.set(0, idx, 0);
      dummy.updateMatrix();
      htTrunk.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(p.x, p.y + 0.56 * p.s, p.z);
      dummy.scale.set(p.s * 1.12, p.s * 0.92, p.s * 1.12);
      dummy.updateMatrix();
      htCanopy.setMatrixAt(idx, dummy.matrix);
      col.setHex(oakTints[idx % oakTints.length]);
      htCanopy.setColorAt(idx, col);
    });
    htTrunk.instanceMatrix.needsUpdate = true;
    htCanopy.instanceMatrix.needsUpdate = true;
    if (htCanopy.instanceColor) htCanopy.instanceColor.needsUpdate = true;
    farmGroup.add(htTrunk, htCanopy);
  }

  // 8. YOUNG GREEN CROP SPROUTS ALONG FRESHLY PLOWED BROWN FURROWS (Fine dense shoots)
  if (sproutPts.length) {
    const spGeom = new THREE.ConeGeometry(0.028, 0.095, 5);
    spGeom.translate(0, 0.042, 0);
    const spMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    const spInst = new THREE.InstancedMesh(spGeom, spMat, sproutPts.length);
    const spPalette = [0x6e9c46, 0x7eae52, 0x5e8a3c];
    sproutPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.12, p.s, p.s * 1.12);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      spInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(spPalette[idx % spPalette.length]);
      spInst.setColorAt(idx, col);
    });
    spInst.instanceMatrix.needsUpdate = true;
    if (spInst.instanceColor) spInst.instanceColor.needsUpdate = true;
    farmGroup.add(spInst);
  }

  // 9. LIVE ROAMING GRAZING SHEEP INSIDE LUSH GREEN PASTURE ENCLOSURES
  const roamingSheep = [];
  if (sheepPts.length) {
    const fleeceGeom = new THREE.IcosahedronGeometry(0.075, 1);
    const fleeceMat = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.94 });
    const headGeom = new THREE.SphereGeometry(0.036, 6, 5);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x3b342e, roughness: 0.90 });

    for (const p of sheepPts) {
      const sh = new THREE.Group();
      const body = new THREE.Mesh(fleeceGeom, fleeceMat);
      body.scale.set(1.30, 0.90, 0.94);
      body.position.y = 0.068;
      body.castShadow = true;
      sh.add(body);
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.set(0.088, 0.064, 0);
      sh.add(head);
      sh.scale.setScalar(p.s);
      sh.position.set(p.x, p.y, p.z);
      farmGroup.add(sh);
      roamingSheep.push({ mesh: sh, head, cx: p.x, cz: p.z, r: p.roamR, speed: p.speed, phase: p.phase });
    }
  }

  // 10. LUSH SWAYING 3D MEADOW GRASS TUFTS & WILDFLOWERS ACROSS OPEN VALLEYS (2 GPU Instanced Draw Calls!)
  const createMeadowGrassTexture = () => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    // Zero-alpha green RGB padding so mipmaps NEVER turn dark/black!
    ctx.clearRect(0, 0, S, S);
    const blades = [
      { bx: 24, lean: -18, h: 68, w: 6, col: '#4a7a32', tip: '#8cb850' },
      { bx: 38, lean: -10, h: 86, w: 7, col: '#588a3a', tip: '#a0cc5e' },
      { bx: 52, lean: -4, h: 98, w: 7, col: '#4e8034', tip: '#96c456' },
      { bx: 64, lean: 3, h: 104, w: 8, col: '#619440', tip: '#b0da6c' },
      { bx: 78, lean: 10, h: 92, w: 7, col: '#4f8236', tip: '#98c658' },
      { bx: 92, lean: 16, h: 78, w: 6, col: '#5a8e3d', tip: '#a4cf62' },
      { bx: 104, lean: 22, h: 62, w: 5, col: '#487630', tip: '#88b44c' },
    ];
    for (const bl of blades) {
      const grad = ctx.createLinearGradient(bl.bx, S, bl.bx + bl.lean, S - bl.h);
      grad.addColorStop(0, '#365e24');
      grad.addColorStop(0.55, bl.col);
      grad.addColorStop(1, bl.tip);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bl.bx - bl.w * 0.5, S);
      ctx.quadraticCurveTo(bl.bx + bl.lean * 0.4 - bl.w * 0.25, S - bl.h * 0.55, bl.bx + bl.lean, S - bl.h);
      ctx.quadraticCurveTo(bl.bx + bl.lean * 0.4 + bl.w * 0.35, S - bl.h * 0.55, bl.bx + bl.w * 0.5, S);
      ctx.closePath();
      ctx.fill();
    }
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) { d[i] = 92; d[i + 1] = 142; d[i + 2] = 60; }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // Pre-sample royal highway & bridge-connector road points so grass tufts stay cleanly off dirt/cobble roads
  const roadAvoidPts = [];
  for (const v of VENUE_SPECS) {
    for (const pt of getRoyalHighwayCurve2D(v).getPoints(26)) roadAvoidPts.push([pt.x, pt.z]);
  }
  for (const path of getSideBridgeRoadPaths()) {
    const curve = new THREE.CatmullRomCurve3(path.map(([px, pz]) => new THREE.Vector3(px, 0, pz)));
    for (const pt of curve.getPoints(22)) roadAvoidPts.push([pt.x, pt.z]);
  }

  const grassTuftPts = [];
  const flowerPts = [];
  const grassAttempts = 5400;
  for (let a = 0; a < grassAttempts && grassTuftPts.length < 2200; a++) {
    const gx = (fRand() - 0.5) * (WORLD_W - 6.0);
    const gz = -15.2 + fRand() * 36.2;
    const gh = terrainHeight(gx, gz);
    if (gh < 0.26 || gh > 2.25) continue;
    // Stay clear of River Willowmere & sandy waterline
    if (Math.abs(gx - riverCenterX(gz)) < riverHalfWidth(gz) + 0.95) continue;
    // Stay clear of venue architecture footprints
    let skip = false;
    for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
      const v = VENUE_SPECS[vi];
      if (Math.hypot(gx - v.x, gz - v.z) < v.plateauR + 0.35) { skip = true; break; }
    }
    if (skip) continue;
    // Stay outside cultivated crop plots so meadows frame the fields organically
    for (let fi = 0; fi < farmPlots.length; fi++) {
      const fp = farmPlots[fi];
      if (Math.hypot(gx - fp.cx, gz - fp.cz) < Math.max(fp.w, fp.d) * 0.62) { skip = true; break; }
    }
    if (skip) continue;
    // Stay off main dirt/cobble road corridors
    for (let ri = 0; ri < roadAvoidPts.length; ri++) {
      const rdx = gx - roadAvoidPts[ri][0];
      const rdz = gz - roadAvoidPts[ri][1];
      if (rdx * rdx + rdz * rdz < 1.15) { skip = true; break; }
    }
    if (skip) continue;

    // Clump grass naturally using fbm2D so lush grassy glades & meadows feel organic
    const clump = fbm2D(gx * 0.26 + 3.1, gz * 0.26 - 1.9, 2);
    if (clump < -0.18 && fRand() > 0.30) continue;

    const shade = fRand();
    grassTuftPts.push({ x: gx, y: gh - 0.01, z: gz, s: 0.56 + fRand() * 0.46, rot: fRand() * Math.PI * 2, shade });
    if (flowerPts.length < 480 && clump > 0.05 && fRand() < 0.24) {
      flowerPts.push({ x: gx + (fRand() - 0.5) * 0.18, y: gh + 0.028, z: gz + (fRand() - 0.5) * 0.18, s: 0.62 + fRand() * 0.42, kind: Math.floor(fRand() * 4) });
    }
  }

  let grassInstRef = null;
  const grassBaseHex = [];
  if (grassTuftPts.length) {
    const gTex = createMeadowGrassTexture();
    const gGeom = createCrossedTuftGeometry(0.145, 0.12);
    const gMat = new THREE.MeshStandardMaterial({
      map: gTex,
      alphaTest: 0.30,
      side: THREE.FrontSide,
      roughness: 0.86,
      metalness: 0.0,
    });
    attachCropWindShader(gMat, windUniform, 0.028);
    const grassInst = new THREE.InstancedMesh(gGeom, gMat, grassTuftPts.length);
    grassInstRef = grassInst;
    const gPalette = [0xcce69a, 0xb8d984, 0xd8edaa, 0xa8cf74, 0xe0f0b4];
    grassTuftPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.08, p.s, p.s * 1.08);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      grassInst.setMatrixAt(idx, dummy.matrix);
      const hex = gPalette[Math.floor(p.shade * gPalette.length) % gPalette.length];
      grassBaseHex.push(hex);
      col.setHex(hex);
      grassInst.setColorAt(idx, col);
    });
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    farmGroup.add(grassInst);
  }

  let flInstRef = null;
  const flBaseHex = [];
  if (flowerPts.length) {
    const flGeom = new THREE.OctahedronGeometry(0.032, 0);
    const flMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, emissive: 0x241f14, emissiveIntensity: 0.18 });
    const flInst = new THREE.InstancedMesh(flGeom, flMat, flowerPts.length);
    flInstRef = flInst;
    const flColors = [0xffe066, 0xfff8eb, 0x8cc8ff, 0xf2a6d8]; // buttercups, daisies, cornflowers, wild rose
    flowerPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.2, p.s * 0.75, p.s * 1.2);
      dummy.rotation.set(0, idx * 1.3, 0);
      dummy.updateMatrix();
      flInst.setMatrixAt(idx, dummy.matrix);
      const hex = flColors[p.kind % flColors.length];
      flBaseHex.push(hex);
      col.setHex(hex);
      flInst.setColorAt(idx, col);
    });
    flInst.instanceMatrix.needsUpdate = true;
    if (flInst.instanceColor) flInst.instanceColor.needsUpdate = true;
    farmGroup.add(flInst);
  }

  const cCorruptGrassA = new THREE.Color(0x3a244f);
  const cCorruptGrassB = new THREE.Color(0x2f5440);
  const cCorruptFlA = new THREE.Color(0x66ff9e);
  const cCorruptFlB = new THREE.Color(0x8c3dd4);
  const updateCorruption = territorySys => {
    if (!territorySys?.sampleUndeadCorruption) return;
    if (grassInstRef) {
      for (let idx = 0; idx < grassTuftPts.length; idx++) {
        const p = grassTuftPts[idx];
        const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
        col.setHex(grassBaseHex[idx]);
        if (corr > 0.01) col.lerp(idx % 3 === 0 ? cCorruptGrassB : cCorruptGrassA, Math.min(1, corr * 0.94));
        grassInstRef.setColorAt(idx, col);
      }
      if (grassInstRef.instanceColor) grassInstRef.instanceColor.needsUpdate = true;
    }
    if (flInstRef) {
      for (let idx = 0; idx < flowerPts.length; idx++) {
        const p = flowerPts[idx];
        const corr = territorySys.sampleUndeadCorruption(p.x, p.z);
        col.setHex(flBaseHex[idx]);
        if (corr > 0.01) col.lerp(idx % 2 === 0 ? cCorruptFlA : cCorruptFlB, Math.min(1, corr * 0.92));
        flInstRef.setColorAt(idx, col);
      }
      if (flInstRef.instanceColor) flInstRef.instanceColor.needsUpdate = true;
    }
  };

  parent.add(farmGroup);
  return { farmGroup, windUniform, roamingSheep, updateCorruption };
}

// Procedural alpha-feathered packed-earth & weathered cobble road texture (melts smoothly into grass!)
function createNaturalRoadTexture(isRoyal = true) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  // Horizontal alpha-feathered profile across U (0..1): grassy-earth blend edges -> warm road center
  const baseGrad = ctx.createLinearGradient(0, 0, S, 0);
  if (isRoyal) {
    baseGrad.addColorStop(0.00, 'rgba(148, 136, 94, 0)');
    baseGrad.addColorStop(0.14, 'rgba(176, 158, 114, 0.42)');
    baseGrad.addColorStop(0.26, 'rgba(208, 188, 140, 0.90)');
    baseGrad.addColorStop(0.50, 'rgba(218, 200, 152, 0.95)');
    baseGrad.addColorStop(0.74, 'rgba(208, 188, 140, 0.90)');
    baseGrad.addColorStop(0.86, 'rgba(176, 158, 114, 0.42)');
    baseGrad.addColorStop(1.00, 'rgba(148, 136, 94, 0)');
  } else {
    baseGrad.addColorStop(0.00, 'rgba(142, 128, 88, 0)');
    baseGrad.addColorStop(0.16, 'rgba(166, 146, 102, 0.38)');
    baseGrad.addColorStop(0.30, 'rgba(194, 172, 124, 0.84)');
    baseGrad.addColorStop(0.50, 'rgba(204, 184, 136, 0.88)');
    baseGrad.addColorStop(0.70, 'rgba(194, 172, 124, 0.84)');
    baseGrad.addColorStop(0.84, 'rgba(166, 146, 102, 0.38)');
    baseGrad.addColorStop(1.00, 'rgba(142, 128, 88, 0)');
  }
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, S, S);

  // Faint darkened cart-wheel ruts running seamlessly along V
  for (const rx of [0.35, 0.65]) {
    const rg = ctx.createLinearGradient((rx - 0.08) * S, 0, (rx + 0.08) * S, 0);
    rg.addColorStop(0, 'rgba(110, 90, 56, 0)');
    rg.addColorStop(0.5, 'rgba(110, 90, 56, 0.24)');
    rg.addColorStop(1, 'rgba(110, 90, 56, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect((rx - 0.08) * S, 0, 0.16 * S, S);
  }

  // Subtle organic gravel pebbles & weathered stone flecks (tiled cleanly mod S)
  let rSeed = isRoyal ? 3137 : 6143;
  const rRand = () => {
    rSeed = (rSeed * 16807) % 2147483647;
    return (rSeed - 1) / 2147483646;
  };
  for (let i = 0; i < 620; i++) {
    const uNorm = 0.16 + rRand() * 0.68;
    const x = uNorm * S;
    const y = rRand() * S;
    const edgeFade = Math.min(1, (uNorm - 0.14) / 0.14, (0.86 - uNorm) / 0.14);
    const rad = 1.0 + rRand() * (isRoyal ? 2.8 : 2.1);
    ctx.fillStyle = rRand() > 0.45
      ? `rgba(240, 228, 194, ${(0.18 * edgeFade).toFixed(3)})`
      : `rgba(118, 98, 66, ${(0.22 * edgeFade).toFixed(3)})`;
    for (const dy of [-S, 0, S]) {
      ctx.beginPath();
      ctx.arc(x, y + dy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Smooth alpha-feathered roadbeds hugging the hills & gliding seamlessly over ALL 3 arched bridges!
function buildCampaignRoutes(parent) {
  const routesGroup = new THREE.Group();
  const bmCentral = getBridgeMetrics(BRIDGE_Z, 6.2, CENTRAL_ARCH_RISE);
  const bmNorth = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, SIDE_ARCH_RISE);
  const bmSouth = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, SIDE_ARCH_RISE);
  const ALL_BRIDGES = [
    { ...bmCentral, halfW: 0.94 },
    { ...bmNorth, halfW: 0.62 },
    { ...bmSouth, halfW: 0.62 },
  ];
  const routeEntries = [];

  const royalRoadTex = createNaturalRoadTexture(true);
  const countryRoadTex = createNaturalRoadTexture(false);

  const roadMat = new THREE.MeshStandardMaterial({
    map: royalRoadTex,
    transparent: true,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const farmRoadMat = new THREE.MeshStandardMaterial({
    map: countryRoadTex,
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  // Helper to build a UV-mapped, alpha-feathered terrain-hugging road ribbon along any CatmullRomCurve3
  const buildRoadRibbonMesh = (terrainCurve, segs, halfW, mat, heightFn) => {
    const rVerts = [];
    const rUvs = [];
    const rIndices = [];
    let dist = 0;
    let prevPt = terrainCurve.getPointAt(0);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const pt = terrainCurve.getPointAt(u);
      if (i > 0) dist += pt.distanceTo(prevPt);
      prevPt = pt;
      const tan = terrainCurve.getTangentAt(u);
      const nx = -tan.z;
      const nz = tan.x;
      const len = Math.hypot(nx, nz) || 1;
      const px = (nx / len) * halfW;
      const pz = (nz / len) * halfW;
      const ly = heightFn(pt.x - px, pt.z - pz);
      const ry = heightFn(pt.x + px, pt.z + pz);
      rVerts.push(pt.x - px, ly, pt.z - pz, pt.x + px, ry, pt.z + pz);
      const vCoord = dist * 0.45;
      rUvs.push(0, vCoord, 1, vCoord);
      if (i < segs) {
        const a = i * 2;
        rIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(rVerts, 3));
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
    roadGeom.setIndex(rIndices);
    roadGeom.computeVertexNormals();
    const mesh = new THREE.Mesh(roadGeom, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  };

  // Blend road surface smoothly from terrain onto ANY of the 3 arched bridge decks (Central, North & South)!
  const roadSurfaceY = (wx, wz, lift = 0.048) => {
    const terrY = terrainHeight(wx, wz) + lift;
    let bestMix = 0;
    let bestArchY = terrY;
    for (const b of ALL_BRIDGES) {
      const dx = wx - b.bx;
      const dz = wz - b.bz;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      const onX = 1 - smootherstep(b.halfSpan + 0.15, b.halfSpan + 1.05, Math.abs(lx));
      const onZ = 1 - smootherstep(b.halfW + 0.05, b.halfW + 0.72, Math.abs(lz));
      const mix = onX * onZ;
      if (mix > bestMix) {
        bestMix = mix;
        bestArchY = b.deckTopY(lx) + 0.028;
      }
    }
    return terrY * (1 - bestMix) + bestArchY * bestMix;
  };

  for (const v of VENUE_SPECS) {
    const curve = getRoyalHighwayCurve2D(v);
    const sampled = curve.getPoints(68).map(pt => new THREE.Vector3(pt.x, roadSurfaceY(pt.x, pt.z, 0.048), pt.z));
    const terrainCurve = new THREE.CatmullRomCurve3(sampled);

    // Soft-feathered royal highway ribbon connecting each venue entrance cleanly to the Central Bridge
    const roadMesh = buildRoadRibbonMesh(terrainCurve, 84, 0.50, roadMat, (x, z) => roadSurfaceY(x, z, 0.052));
    routesGroup.add(roadMesh);

    routeEntries.push({ venueId: v.id, curve: terrainCurve, roadMesh });
  }

  // Flanking scenic roads linking Royal Lists <-> North Bridge <-> Iron Colosseum & Great Hall <-> South Bridge <-> King's Green!
  for (const pts of getSideBridgeRoadPaths()) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const sampled = curve.getPoints(64).map(pt => new THREE.Vector3(pt.x, roadSurfaceY(pt.x, pt.z, 0.045), pt.z));
    const bridgeRoadCurve = new THREE.CatmullRomCurve3(sampled);
    const laneMesh = buildRoadRibbonMesh(bridgeRoadCurve, 76, 0.42, farmRoadMat, (x, z) => roadSurfaceY(x, z, 0.048));
    routesGroup.add(laneMesh);
  }

  // Secondary winding packed-earth farm roads anchored EXACTLY onto the royal highways!
  for (const pts of getResolvedFarmRoadPaths()) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const sampled = curve.getPoints(56).map(pt => new THREE.Vector3(pt.x, roadSurfaceY(pt.x, pt.z, 0.044), pt.z));
    const farmCurve = new THREE.CatmullRomCurve3(sampled);
    const laneMesh = buildRoadRibbonMesh(farmCurve, 64, 0.36, farmRoadMat, (x, z) => roadSurfaceY(x, z, 0.046));
    routesGroup.add(laneMesh);
  }

  parent.add(routesGroup);
  return { routesGroup, routeEntries };
}

// ── 3B. LIVING TOTAL WAR MINIATURE ARMIES: 4 VENUE FACTIONS, SQUADS, 7 UNIT CLASSES,
//        PROJECTILES, 30-SECOND FALLEN BODIES & CONTINUOUS RESPAWNING! ─────────────
// ── 3C-BIS. DYNAMIC REALM TERRITORY CONTROL SYSTEM & TOGGLEABLE MAP OVERLAY ──
function buildTerritorySystem(parent) {
  const COLS = 56;
  const ROWS = 44;
  const CELLS = COLS * ROWS;
  const CELL_W = WORLD_W / COLS;
  const CELL_D = WORLD_D / ROWS;

  const playable = new Uint8Array(CELLS);
  const homeCore = new Int8Array(CELLS); // 0..3 if inside home keep sanctuary, -1 if contestable
  const owner = new Int8Array(CELLS);    // -1 unplayable/water, 0..3 faction id, 4 Undead Blight, 5 Neutral Grey Wasteland
  const initialOwner = new Int8Array(CELLS);
  const captureTeam = new Int8Array(CELLS);
  const captureProg = new Float32Array(CELLS);
  const contested = new Uint8Array(CELLS);
  const battleHeat = new Float32Array(CELLS);
  const presence = new Uint16Array(CELLS * 5); // 0..3 living houses + 4 Undead horde
  const heroClaim = new Int8Array(CELLS);      // -1 none, 0..3 Radiant Hero purifying & reclaiming this cell!
  const cellWorldX = new Float32Array(CELLS);
  const cellWorldZ = new Float32Array(CELLS);

  let totalPlayable = 0;
  const ownerCounts = [0, 0, 0, 0, 0, 0]; // 0..3 houses, 4 Undead, 5 Neutral Grey
  const lostHomelandCounts = [0, 0, 0, 0];
  const venueCoreCells = [[], [], [], []]; // All playable cells under each of the 4 Event Venues!

  const cellToWorld = (c, r) => [
    -WORLD_W * 0.5 + (c + 0.5) * CELL_W,
    -WORLD_D * 0.5 + (r + 0.5) * CELL_D,
  ];

  // Initialize playable land mask & starting 4-house territory borders (split along River Willowmere!)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const [wx, wz] = cellToWorld(c, r);
      cellWorldX[idx] = wx;
      cellWorldZ[idx] = wz;
      homeCore[idx] = -1;
      captureTeam[idx] = -1;
      owner[idx] = -1;
      initialOwner[idx] = -1;

      const rx = riverCenterX(wz);
      const rw = riverHalfWidth(wz) + 0.18;
      const h = terrainHeight(wx, wz);
      const inBounds = Math.abs(wx) <= 29.8 && wz >= -15.4 && wz <= 20.4;
      const isLand = inBounds && Math.abs(wx - rx) > rw && h < 3.65;
      if (!isLand) continue;

      playable[idx] = 1;
      totalPlayable++;

      // Protect only each house's immediate keep center in civil war (and track all cells under each Event Venue so Undead/Heroes can claim them!)
      for (let tm = 0; tm < 4; tm++) {
        const v = VENUE_SPECS[tm];
        const dv = Math.hypot(wx - v.x, wz - v.z);
        if (dv < 3.15) homeCore[idx] = tm;
        if (dv <= v.plateauR + 0.45) venueCoreCells[tm].push(idx);
      }

      // Starting border follows natural West/East riverbanks & North/South valleys
      const onWest = wx < rx;
      let startTm = 0;
      if (onWest) {
        const d0 = Math.hypot(wx - VENUE_SPECS[0].x, wz - VENUE_SPECS[0].z);
        const d3 = Math.hypot(wx - VENUE_SPECS[3].x, wz - VENUE_SPECS[3].z);
        startTm = d0 <= d3 ? 0 : 3;
      } else {
        const d1 = Math.hypot(wx - VENUE_SPECS[1].x, wz - VENUE_SPECS[1].z);
        const d2 = Math.hypot(wx - VENUE_SPECS[2].x, wz - VENUE_SPECS[2].z);
        startTm = d1 <= d2 ? 1 : 2;
      }
      owner[idx] = startTm;
      initialOwner[idx] = startTm;
      ownerCounts[startTm]++;
    }
  }

  // Terrain-conforming translucent highlight mesh hugging every hill, meadow, road & plateau!
  const segX = 112;
  const segZ = 88;
  const overlayGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, segX, segZ);
  overlayGeo.rotateX(-Math.PI / 2);
  const posAttr = overlayGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, terrainHeight(vx, vz) + 0.085);
  }
  overlayGeo.computeVertexNormals();

  // Procedural offscreen CanvasTexture (4px per territory cell -> crisp fills + bold frontier borders!)
  const SCALE = 4;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = COLS * SCALE;
  texCanvas.height = ROWS * SCALE;
  const ctx = texCanvas.getContext('2d');
  const territoryTex = new THREE.CanvasTexture(texCanvas);
  territoryTex.colorSpace = THREE.SRGBColorSpace;
  territoryTex.minFilter = THREE.LinearFilter;
  territoryTex.magFilter = THREE.LinearFilter;
  territoryTex.wrapS = THREE.ClampToEdgeWrapping;
  territoryTex.wrapT = THREE.ClampToEdgeWrapping;

  const overlayMat = new THREE.MeshBasicMaterial({
    map: territoryTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
  overlayMesh.visible = false;
  overlayMesh.renderOrder = 3;
  parent.add(overlayMesh);

  const FILL_RGB = [
    [224, 46, 62],   // 0: Red (Royal Lists)
    [42, 120, 224],  // 1: Blue (Iron Colosseum)
    [42, 168, 92],   // 2: Green (King's Green)
    [238, 138, 30],  // 3: Orange (Great Hall)
    [92, 34, 126],   // 4: Undead Blight (cursed violet-black)
    [126, 132, 140], // 5: Neutral Unclaimed Grey Wasteland
  ];
  const BORDER_RGB = [
    [255, 108, 118],
    [116, 186, 255],
    [104, 240, 152],
    [255, 196, 88],
    [116, 255, 164], // Eerie glowing necrotic green frontier!
    [194, 200, 208], // Weathered neutral slate border!
  ];

  let enabled = false;
  let dirty = true;
  let corruptionVersion = 0;
  let tickAccum = 0;
  let redrawAccum = 0;
  let currentOpacity = 0;
  let tSeed = 51923;
  const tRand = () => {
    tSeed = (tSeed * 16807) % 2147483647;
    return (tSeed - 1) / 2147483646;
  };

  function redrawTexture(t) {
    ctx.clearRect(0, 0, texCanvas.width, texCanvas.height);
    const pulse = 0.55 + Math.sin(t * 5.2) * 0.35;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const own = owner[idx];
        if (own < 0) continue;

        const px = c * SCALE;
        const py = r * SCALE;
        const [fr, fg, fb] = FILL_RGB[own];
        const [br, bg, bb] = BORDER_RGB[own];

        // Translucent faction fill (slightly stronger while an enemy is actively capturing it!)
        ctx.fillStyle = `rgba(${fr},${fg},${fb},0.36)`;
        ctx.fillRect(px, py, SCALE, SCALE);

        // Partial uncontested capture wash preview
        if (captureProg[idx] > 0.08 && captureTeam[idx] >= 0 && captureTeam[idx] !== own) {
          const [cr, cg, cb] = FILL_RGB[captureTeam[idx]];
          const a = Math.min(0.45, captureProg[idx] * 0.44);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(2)})`;
          ctx.fillRect(px, py, SCALE, SCALE);
        }

        // Contested frontline golden skirmish highlight when 2+ factions clash here!
        if (contested[idx]) {
          ctx.fillStyle = `rgba(255,232,145,${(0.28 * pulse).toFixed(2)})`;
          ctx.fillRect(px, py, SCALE, SCALE);
        }

        // Crisp glowing frontier border along edges meeting another faction or riverbank/frontier
        const nTop = r > 0 ? owner[idx - COLS] : -1;
        const nBot = r < ROWS - 1 ? owner[idx + COLS] : -1;
        const nLeft = c > 0 ? owner[idx - 1] : -1;
        const nRight = c < COLS - 1 ? owner[idx + 1] : -1;
        const isEnemyEdge = (nTop >= 0 && nTop !== own) || (nBot >= 0 && nBot !== own) || (nLeft >= 0 && nLeft !== own) || (nRight >= 0 && nRight !== own);

        if (nTop !== own || nBot !== own || nLeft !== own || nRight !== own) {
          const edgeAlpha = isEnemyEdge ? 0.96 : 0.62;
          const bw = isEnemyEdge ? 2 : 1;
          ctx.fillStyle = `rgba(${br},${bg},${bb},${edgeAlpha})`;
          if (nTop !== own) ctx.fillRect(px, py, SCALE, bw);
          if (nBot !== own) ctx.fillRect(px, py + SCALE - bw, SCALE, bw);
          if (nLeft !== own) ctx.fillRect(px, py, bw, SCALE);
          if (nRight !== own) ctx.fillRect(px + SCALE - bw, py, bw, SCALE);
        }
      }
    }
    territoryTex.needsUpdate = true;
    dirty = false;
  }

  redrawTexture(0);

  function update(dt, t, units, peaceTreaty = false, invState = null) {
    // Smooth visibility fade when toggling Territory Mode ON / OFF
    const targetOp = enabled ? 0.94 : 0.0;
    if (Math.abs(currentOpacity - targetOp) > 0.005) {
      currentOpacity += (targetOp - currentOpacity) * Math.min(1, dt * 8.5);
      overlayMat.opacity = currentOpacity;
      overlayMesh.visible = currentOpacity > 0.01;
    } else {
      currentOpacity = targetOp;
      overlayMat.opacity = targetOp;
      overlayMesh.visible = enabled;
    }

    // Run territory ownership simulation continuously (even when overlay is hidden!) at ~6 Hz
    tickAccum += dt;
    if (tickAccum >= 0.16 && units && units.length) {
      const stepDt = tickAccum;
      tickAccum = 0;

      presence.fill(0);
      contested.fill(0);
      heroClaim.fill(-1);

      const invPhase = invState?.phase || 'idle';
      const invWave = invPhase === 'active' ? (invState.wave || 0) : 0;
      const allLivingDead = (invPhase === 'reign') || (invPhase === 'active' && invWave >= 3 && (invState.livingAliveCount || 0) === 0);
      const w3Overtime = invPhase === 'active' && invWave >= 3 && (invState.waveRemaining || 0) <= 0.1;
      const undeadSpeedMult = allLivingDead ? 5.2 : invWave >= 3 ? (w3Overtime ? 3.8 : 2.55) : invWave === 2 ? 1.55 : 0.85;

      // Track live Event Venue perimeter contact: Undead MUST physically touch the venue AND have ZERO living defenders near it to claim it!
      const venueLivingNear = [0, 0, 0, 0];
      const venueUndeadContact = [0, 0, 0, 0];
      const venueHeroContact = [false, false, false, false];

      // Stamp every alive unit's influence into its local territory cells
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.insideVenue) continue;
        const c0 = Math.floor((u.x + WORLD_W * 0.5) / CELL_W);
        const r0 = Math.floor((u.z + WORLD_D * 0.5) / CELL_D);
        const isHero = u.type === 'hero';
        const rad = (isHero || (u.team === 4 && (allLivingDead || u.type === 'skarbrand'))) ? 2 : 1;
        const weight = isHero
          ? 20
          : u.team === 4
            ? (u.type === 'skarbrand' ? 22 : u.type === 'undead_champion' ? 5 : 3)
            : ((u.type === 'knight' || u.type === 'cavalry' || u.type === 'siege' || u.type === 'king') ? 2 : 1);
        for (let dr = -rad; dr <= rad; dr++) {
          const rr = r0 + dr;
          if (rr < 0 || rr >= ROWS) continue;
          for (let dc = -rad; dc <= rad; dc++) {
            const cc = c0 + dc;
            if (cc < 0 || cc >= COLS) continue;
            const idx = rr * COLS + cc;
            if (!playable[idx]) continue;
            // Do not let Undead passively bleed into Event Venue core cells without direct undefended contact!
            if (u.team === 4 && homeCore[idx] >= 0) continue;
            const w = (dr === 0 && dc === 0) ? weight * 2 : weight;
            presence[idx * 5 + u.team] += w;
            // Each Radiant Hero can ONLY reclaim cells whose default starting territory matches their own house color!
            if (isHero && initialOwner[idx] === u.team) heroClaim[idx] = u.team;
          }
        }
        // Check proximity to the 4 Event Venues
        for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
          const v = VENUE_SPECS[vi];
          const dvx = u.x - v.x;
          const dvz = u.z - v.z;
          const dSq = dvx * dvx + dvz * dvz;
          if (isHero) {
            if (vi === u.team && dSq <= (v.plateauR + 3.0) * (v.plateauR + 3.0)) venueHeroContact[vi] = true;
          } else if (u.team < 4) {
            // Any living defender near the Event Place blocks Undead from claiming it!
            const guardR = v.plateauR + 3.5;
            if (dSq <= guardR * guardR) venueLivingNear[vi]++;
          } else if (u.team === 4) {
            // Undead must get in DIRECT physical contact with the Event Place walls!
            const contactR = v.plateauR + 0.85;
            if (dSq <= contactR * contactR) venueUndeadContact[vi] += (u.type === 'skarbrand' ? 6 : 1);
          }
        }
      }

      // Apply Event Venue core presence ONLY when directly contacted & undefended (or reclaimed by its own Radiant Hero!)
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        const vCells = venueCoreCells[vi];
        if (venueHeroContact[vi]) {
          for (let ci = 0; ci < vCells.length; ci++) {
            const cIdx = vCells[ci];
            presence[cIdx * 5 + vi] += 24;
            if (initialOwner[cIdx] === vi) heroClaim[cIdx] = vi;
          }
        } else if (venueUndeadContact[vi] > 0 && venueLivingNear[vi] === 0) {
          const siegeWeight = Math.min(8, venueUndeadContact[vi]);
          for (let ci = 0; ci < vCells.length; ci++) {
            presence[vCells[ci] * 5 + 4] += siegeWeight;
          }
        }
      }

      let hasContested = false;
      for (let idx = 0; idx < CELLS; idx++) {
        if (!playable[idx]) continue;
        const base = idx * 5;
        let livingTeams = 0;
        let soleLiving = -1;
        let soleLivingStr = 0;
        for (let tm = 0; tm < 4; tm++) {
          const cnt = presence[base + tm];
          if (cnt > 0) {
            livingTeams++;
            if (cnt > soleLivingStr) {
              soleLiving = tm;
              soleLivingStr = cnt;
            }
          }
        }
        const undeadStr = presence[base + 4];
        const hasUndead = undeadStr > 0;
        const hasLiving = livingTeams > 0;
        const hTeam = heroClaim[idx];

        // Radiant Heroes purify & reclaim ONLY their own house's default starting territory (initialOwner[idx] === hTeam)!
        const inHeroesPhase = invState?.phase === 'heroes';
        const isContestedCell = hTeam >= 0 ? false : ((hasUndead && hasLiving) || (!peaceTreaty && livingTeams >= 2));
        let claimant = -1;
        let claimStrength = 0;
        if (hTeam >= 0 && initialOwner[idx] === hTeam) {
          if (owner[idx] === 4 || owner[idx] === 5) {
            claimant = hTeam;
            claimStrength = 12;
          } else {
            claimant = owner[idx];
            claimStrength = 12;
          }
        } else if (!isContestedCell) {
          if (hasUndead) {
            claimant = 4;
            claimStrength = undeadStr;
          } else if (hasLiving) {
            if (inHeroesPhase) {
              // During the 4 Heroes reclamation phase, NO hero can ever claim another color's default territory!
              if (initialOwner[idx] === soleLiving && (owner[idx] === 4 || owner[idx] === 5)) {
                claimant = soleLiving;
                claimStrength = soleLivingStr;
              }
            } else if (peaceTreaty && owner[idx] >= 0 && owner[idx] < 4) {
              // During Peace Treaty, living houses NEVER steal territory from each other (only retake Undead 4 or Neutral Grey 5!)
              claimant = owner[idx];
              claimStrength = soleLivingStr;
            } else {
              claimant = soleLiving;
              claimStrength = soleLivingStr;
            }
          }
        }

        if (claimant >= 0) {
          // Normal civil war protects each house's immediate keep sanctuary, BUT Undead (4) can overrun keeps up to 95%+ & Heroes/houses can always reclaim them!
          const allowCoreCapture = homeCore[idx] === -1 || claimant === 4 || owner[idx] === 4 || owner[idx] === 5 || hTeam >= 0;
          if (owner[idx] !== claimant && allowCoreCapture) {
            if (captureTeam[idx] !== claimant) {
              captureTeam[idx] = claimant;
              captureProg[idx] = 0;
            }
            const neutralBonus = owner[idx] === 5 ? 2.15 : 1.0;
            const heroBonus = hTeam >= 0 ? 2.85 : 1.0;
            const venueSiegeSlow = (claimant === 4 && homeCore[idx] >= 0) ? 0.36 : 1.0;
            const undeadBonus = claimant === 4 ? undeadSpeedMult : 1.0;
            const rate = (0.64 + Math.min(6, claimStrength) * 0.26) * neutralBonus * undeadBonus * heroBonus * venueSiegeSlow;
            captureProg[idx] += stepDt * rate;
            dirty = true;
            if (captureProg[idx] >= 1.0) {
              const prev = owner[idx];
              if (prev >= 0 && prev < 6) ownerCounts[prev]--;
              if (initialOwner[idx] >= 0) {
                if (prev === initialOwner[idx] && claimant !== initialOwner[idx]) lostHomelandCounts[initialOwner[idx]]++;
                else if (prev !== initialOwner[idx] && claimant === initialOwner[idx]) lostHomelandCounts[initialOwner[idx]] = Math.max(0, lostHomelandCounts[initialOwner[idx]] - 1);
              }
              owner[idx] = claimant;
              ownerCounts[claimant]++;
              if (prev === 4 || claimant === 4) corruptionVersion++;
              captureProg[idx] = 0;
              captureTeam[idx] = -1;
            }
          } else if (owner[idx] === claimant && captureProg[idx] > 0) {
            captureProg[idx] = Math.max(0, captureProg[idx] - stepDt * 0.9);
            if (captureProg[idx] === 0) captureTeam[idx] = -1;
            dirty = true;
          }
        } else if (isContestedCell) {
          contested[idx] = 1;
          battleHeat[idx] = Math.min(28.0, battleHeat[idx] + stepDt * 3.4);
          hasContested = true;
        } else if (captureProg[idx] > 0) {
          captureProg[idx] = Math.max(0, captureProg[idx] - stepDt * 0.25);
          if (captureProg[idx] === 0) captureTeam[idx] = -1;
          dirty = true;
        }
        if (battleHeat[idx] > 0.01 && !contested[idx]) {
          battleHeat[idx] *= 0.9965;
        }
      }

      redrawAccum += stepDt;
      if (enabled && (dirty || (hasContested && redrawAccum >= 0.32))) {
        redrawAccum = 0;
        redrawTexture(t);
      }
    }
  }

  // Pick a spread-out enemy-owned (or unclaimed Neutral Grey!) territory coordinate matching the squad's theater
  function pickAttackTarget(teamId, squad) {
    const mySide = VENUE_SPECS[teamId].x < 0 ? -1 : 1;
    const theater = squad.theater || 'outer-bank';
    const isNorthHome = VENUE_SPECS[teamId].z < 0;
    const hasNeutralLand = ownerCounts[5] > 10;

    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;

    for (let k = 0; k < 44; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] === teamId || owner[idx] < 0 || homeCore[idx] >= 0) continue;
      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      const onMyBank = (wx < riverCenterX(wz) ? -1 : 1) === mySide;
      const absX = Math.abs(wx);
      const centerDist = Math.hypot(wx, wz - BRIDGE_Z);
      const base = idx * 5;
      const own = owner[idx];
      const enemyHere = own < 5 ? (presence[base + own] || 0) : 0;

      let score = tRand() * 12;
      // Strongly prioritize reclaiming Unclaimed Neutral Grey Wastelands after an Undead Invasion!
      if (own === 5 && hasNeutralLand) {
        score += onMyBank ? 36 : 22;
        if (initialOwner[idx] === teamId) score += 20;
      }

      if (theater === 'outer-bank') {
        if (onMyBank) score += 28;
        if (absX > 14.5) score += 18;
        else if (absX > 9.5) score += 8;
        if (centerDist < 9.5) score -= 24;
      } else if (theater === 'mid-bank') {
        if (onMyBank) score += 26;
        if (absX > 8.5) score += 10;
        if (centerDist < 8.5) score -= 18;
      } else if (theater === 'flank-bridge') {
        if (!onMyBank) score += 22;
        if (isNorthHome && wz < -5.0) score += 22;
        else if (!isNorthHome && wz > 7.0) score += 22;
        if (absX > 11.0) score += 10;
        if (centerDist < 8.5) score -= 20;
      } else {
        if (enemyHere === 0) score += 16;
        if (absX > 13.0 || Math.abs(wz) > 10.0) score += 12;
      }

      if (squad.role === 'cavalry' || squad.role === 'outrider' || squad.role === 'king') {
        if (enemyHere === 0) score += 10;
        score += absX * 0.25;
      }

      if (score > bestScore) {
        bestScore = score;
        bestX = wx;
        bestZ = wz;
      }
    }

    if (bestX !== null) return [bestX, bestZ];
    return null;
  }

  // Pick a safe spawn location spread across ANY part of a faction's currently owned territory
  function pickTerritorySpawn(teamId, preferX = null, preferZ = null) {
    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;
    const venue = VENUE_SPECS[teamId];

    for (let k = 0; k < 38; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] !== teamId) continue;
      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      let insideVenue = false;
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        const v = VENUE_SPECS[vi];
        if (Math.hypot(wx - v.x, wz - v.z) < v.plateauR + 0.55) {
          insideVenue = true;
          break;
        }
      }
      if (insideVenue) continue;

      const base = idx * 5;
      let enemiesHere = presence[base + 4] * 2;
      for (let tm = 0; tm < 4; tm++) {
        if (tm !== teamId) enemiesHere += presence[base + tm];
      }

      let score = tRand() * 14 - enemiesHere * 26;
      const centerDist = Math.hypot(wx, wz - BRIDGE_Z);
      if (centerDist < 9.0) score -= 18;
      if (Math.abs(wx) > 11.0) score += 8;

      if (preferX !== null && preferZ !== null) {
        const dSquad = Math.hypot(wx - preferX, wz - preferZ);
        score -= Math.min(24, dSquad * 0.65);
        if (dSquad < 3.0) score -= 6;
      } else {
        const dHome = Math.hypot(wx - venue.x, wz - venue.z);
        if (dHome > 4.5 && dHome < 20.0) score += 6;
      }

      if (score > bestScore) {
        bestScore = score;
        bestX = wx;
        bestZ = wz;
      }
    }

    if (bestX !== null) return [bestX, bestZ];
    const ang = tRand() * Math.PI * 2;
    return [venue.x + Math.cos(ang) * (venue.plateauR + 1.1), venue.z + Math.sin(ang) * (venue.plateauR + 1.1)];
  }

  // Pick a homeland cell lost to an enemy/undead OR currently being invaded
  function pickDefenseTarget(teamId, peaceTreaty = false) {
    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;
    for (let k = 0; k < 48; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx]) continue;
      const own = owner[idx];
      const base = idx * 5;
      const undeadHere = presence[base + 4];
      let invaders = undeadHere * 2;
      if (!peaceTreaty) {
        for (let tm = 0; tm < 4; tm++) {
          if (tm !== teamId) invaders += presence[base + tm];
        }
      }
      const isUndeadBlight = own === 4 && (initialOwner[idx] === teamId || (cellWorldX[idx] < 0) === (VENUE_SPECS[teamId].x < 0));
      const isLostHomeland = !peaceTreaty && initialOwner[idx] === teamId && own !== teamId;
      const isInvaded = (own === teamId || (peaceTreaty && own === 4)) && invaders > 0;
      if (!isLostHomeland && !isInvaded && !isUndeadBlight) continue;

      const r = Math.floor(idx / COLS);
      const c = idx - r * COLS;
      const bordersUs =
        (r > 0 && owner[idx - COLS] === teamId) ||
        (r < ROWS - 1 && owner[idx + COLS] === teamId) ||
        (c > 0 && owner[idx - 1] === teamId) ||
        (c < COLS - 1 && owner[idx + 1] === teamId);

      const score = (isInvaded ? 28 : 18) + (isUndeadBlight ? 16 : 0) + (bordersUs ? 12 : 0) + invaders * 4 + tRand() * 8;
      if (score > bestScore) {
        bestScore = score;
        bestX = cellWorldX[idx];
        bestZ = cellWorldZ[idx];
      }
    }
    return bestX !== null ? [bestX, bestZ] : null;
  }

  // During the Undead Invasion Warning / Peace Treaty, rally each house to defend its outer borders facing the map edges!
  function pickEdgeDefenseTarget(teamId) {
    const venue = VENUE_SPECS[teamId];
    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;
    for (let k = 0; k < 44; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] !== teamId || homeCore[idx] >= 0) continue;
      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      const edgeProxX = Math.abs(wx) / 28.0;
      const edgeProxZ = (wz < 0 ? Math.abs(wz) / 14.5 : wz / 19.0);
      const edgeScore = Math.max(edgeProxX, edgeProxZ) * 32;
      const dHome = Math.hypot(wx - venue.x, wz - venue.z);
      const undeadBonus = presence[idx * 5 + 4] * 14;
      const score = edgeScore + undeadBonus - Math.max(0, dHome - 14) * 1.4 + tRand() * 10;
      if (score > bestScore) {
        bestScore = score;
        bestX = wx;
        bestZ = wz;
      }
    }
    return bestX !== null ? [bestX, bestZ] : [venue.x, venue.z];
  }

  // Determine who currently owns each of the 4 Event Venues (0..3 house, 4 Undead, 5 Neutral Grey)
  function getVenueOwner(venueIdx) {
    const vCells = venueCoreCells[venueIdx];
    if (!vCells || !vCells.length) return venueIdx;
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < vCells.length; i++) {
      const o = owner[vCells[i]];
      if (o >= 0 && o < 6) counts[o]++;
    }
    if (counts[4] >= vCells.length * 0.48) return 4;
    let best = venueIdx;
    let bestC = -1;
    for (let t = 0; t < 6; t++) {
      if (counts[t] > bestC) { bestC = counts[t]; best = t; }
    }
    return best;
  }

  // Guide Undead Hordes inward from the map edges to conquer ALL 4 living territories & Event Venues up to 95%+!
  // When spreadOut=true (everyone is dead — only Undead + Dragon left!), deterministically scan ALL unclaimed Event Venues
  // and remaining non-Undead cells so EVERY horde actively marches straight to an unclaimed territory and claims it!
  function pickUndeadTarget(squad, spreadOut = false, assignedGoals = null) {
    if (spreadOut) {
      // 1) Strongly prioritize any of the 4 Event Places not yet claimed by the Undead!
      let bestVenuePt = null;
      let bestVenueDist = 1e9;
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        if (getVenueOwner(vi) === 4) continue;
        const v = VENUE_SPECS[vi];
        const ang = Math.atan2(squad.z - v.z, squad.x - v.x);
        const vx = v.x + Math.cos(ang) * (v.plateauR + 0.55);
        const vz = v.z + Math.sin(ang) * (v.plateauR + 0.55);
        let alreadyTaken = false;
        if (assignedGoals) {
          for (let g = 0; g < assignedGoals.length; g++) {
            if (Math.hypot(assignedGoals[g][0] - v.x, assignedGoals[g][1] - v.z) < v.plateauR + 2.4) {
              alreadyTaken = true;
              break;
            }
          }
        }
        const d = Math.hypot(vx - squad.x, vz - squad.z) + (alreadyTaken ? 18 : 0);
        if (d < bestVenueDist) {
          bestVenueDist = d;
          bestVenuePt = [vx, vz];
        }
      }
      if (bestVenuePt && bestVenueDist < 26) return bestVenuePt;

      // 2) Deterministic full-grid scan of ALL remaining non-Undead cells (strongly preferring squad's OWN bank to prevent bridge jams!)
      const sqOnWest = squad.x < riverCenterX(squad.z);
      let bestX = null;
      let bestZ = null;
      let bestScore = -1e9;
      for (let idx = 0; idx < CELLS; idx++) {
        if (!playable[idx] || owner[idx] < 0 || owner[idx] === 4) continue;
        const wx = cellWorldX[idx];
        const wz = cellWorldZ[idx];
        // Clamp target gently onto reachable land right next to outer corners / venues
        const tx = Math.max(-28.6, Math.min(28.6, wx));
        const tz = Math.max(-14.3, Math.min(19.1, wz));
        const sameBank = (tx < riverCenterX(tz)) === sqOnWest;
        let assignedNear = 0;
        if (assignedGoals) {
          for (let g = 0; g < assignedGoals.length; g++) {
            const dg = Math.hypot(assignedGoals[g][0] - tx, assignedGoals[g][1] - tz);
            if (dg < 6.4) assignedNear += (6.4 - dg) * 4.8;
          }
        }
        const dSq = Math.hypot(tx - squad.x, tz - squad.z);
        const crowd = presence[idx * 5 + 4] * 1.6;
        const score = 60 + (sameBank ? 36 : 0) - dSq * 1.15 - assignedNear - crowd;
        if (score > bestScore) {
          bestScore = score;
          bestX = tx;
          bestZ = tz;
        }
      }
      if (bestX !== null) return [bestX, bestZ];
      if (bestVenuePt) return bestVenuePt;
      return [(tRand() - 0.5) * 34, (tRand() - 0.5) * 24];
    }

    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;
    for (let k = 0; k < 64; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] < 0 || owner[idx] === 4) continue;
      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      const dSq = Math.hypot(wx - squad.x, wz - squad.z);
      const score = 42 - dSq * 1.15 + tRand() * 14;
      if (score > bestScore) {
        bestScore = score;
        bestX = wx;
        bestZ = wz;
      }
    }
    if (bestX !== null) return [bestX, bestZ];
    return [(tRand() - 0.5) * 34, (tRand() - 0.5) * 24];
  }

  // Used only when the user clicks "Skip Wave" on Wave 3 to immediately advance to 95% Undead conquest & summon the 4 Heroes!
  function forceUndeadConquest95() {
    const targetCells = Math.ceil(totalPlayable * 0.96);
    if (ownerCounts[4] < targetCells) {
      for (let idx = 0; idx < CELLS && ownerCounts[4] < targetCells; idx++) {
        if (!playable[idx] || owner[idx] === 4) continue;
        const prev = owner[idx];
        if (prev >= 0 && prev < 6) ownerCounts[prev]--;
        if (initialOwner[idx] >= 0 && prev === initialOwner[idx]) lostHomelandCounts[initialOwner[idx]]++;
        owner[idx] = 4;
        ownerCounts[4]++;
        captureTeam[idx] = -1;
        captureProg[idx] = 0;
      }
      dirty = true;
      corruptionVersion++;
      redrawTexture(0);
    }
    return getUndeadShare();
  }

  // Guide each Radiant Hero STRICTLY to remaining Undead Blight inside THEIR OWN default starting territory (initialOwner === teamId)!
  function pickBlightTarget(teamId, heroX, heroZ) {
    // 1) Prioritize reclaiming this Hero's own house Event Venue if it is still Undead!
    if (getVenueOwner(teamId) === 4) {
      const v = VENUE_SPECS[teamId];
      const ang = Math.atan2(heroZ - v.z, heroX - v.x);
      return [v.x + Math.cos(ang) * (v.plateauR + 0.55), v.z + Math.sin(ang) * (v.plateauR + 0.55)];
    }
    // 2) Deterministic full-grid scan of ALL remaining blighted cells in this Hero's own default homeland!
    let bestX = null;
    let bestZ = null;
    let bestDist = 1e9;
    for (let idx = 0; idx < CELLS; idx++) {
      if (!playable[idx] || (owner[idx] !== 4 && owner[idx] !== 5) || initialOwner[idx] !== teamId) continue;
      const wx = Math.max(-28.6, Math.min(28.6, cellWorldX[idx]));
      const wz = Math.max(-14.3, Math.min(19.1, cellWorldZ[idx]));
      const d = Math.hypot(wx - heroX, wz - heroZ);
      if (d < bestDist) {
        bestDist = d;
        bestX = wx;
        bestZ = wz;
      }
    }
    return bestX !== null ? [bestX, bestZ] : null;
  }

  // Pick a strategic frontier spot for Builders to erect spiked barricades & archer watchtowers!
  // fortifyMode: 'normal' (civil war border) | 'edge' (Warning & Wave 1 outer borders) | 'bridge' (Wave 2 & 3 central bridge stronghold!)
  function pickFortifySpot(teamId, existingStructures = [], fortifyMode = 'normal') {
    const isTreatyMode = fortifyMode === 'edge' || fortifyMode === 'bridge';
    let best = null;
    let bestScore = -1e9;
    for (let k = 0; k < 68; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] !== teamId || homeCore[idx] >= 0) continue;
      const r = Math.floor(idx / COLS);
      const c = idx - r * COLS;
      if (r < 2 || r > ROWS - 3 || c < 2 || c > COLS - 3) continue;

      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      if (Math.abs(wx - riverCenterX(wz)) < riverHalfWidth(wz) + 1.35) continue;
      let blocked = false;
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        const v = VENUE_SPECS[vi];
        if (Math.hypot(wx - v.x, wz - v.z) < v.plateauR + 1.75) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const bz of [NORTH_BRIDGE_Z, BRIDGE_Z, SOUTH_BRIDGE_Z]) {
        if (Math.abs(wz - bz) < 2.1 && Math.abs(wx - riverCenterX(bz)) < 4.6) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let si = 0; si < existingStructures.length; si++) {
        const s = existingStructures[si];
        if (Math.hypot(wx - s.x, wz - s.z) < 2.85) { blocked = true; break; }
      }
      if (blocked) continue;

      const base = idx * 5;
      let enemiesHere = presence[base + 4] * 2;
      if (!isTreatyMode) {
        for (let tm = 0; tm < 4; tm++) if (tm !== teamId) enemiesHere += presence[base + tm];
      }
      if (enemiesHere > 4) continue;

      if (fortifyMode === 'bridge') {
        // Wave 2 & Wave 3: fortify a defensive ring right around the central bridgehead facing outward!
        const dBridge = Math.hypot(wx, wz - BRIDGE_Z);
        if (dBridge > 12.5) continue;
        const ringFit = 26 - Math.abs(dBridge - 6.8) * 3.4;
        const score = ringFit - enemiesHere * 3.5 + tRand() * 6.0;
        if (score > bestScore) {
          bestScore = score;
          best = { x: wx, z: wz, yaw: Math.atan2(wx, wz - BRIDGE_Z) };
        }
        continue;
      }

      if (fortifyMode === 'edge') {
        // Warning & Wave 1: fortify outer homeland perimeter facing outward toward the encroaching Undead map edges!
        const edgeX = Math.abs(wx) / 28.0;
        const edgeZ = wz < 0 ? Math.abs(wz) / 14.5 : wz / 19.0;
        const outerScore = Math.max(edgeX, edgeZ) * 28;
        let undeadDirX = 0, undeadDirZ = 0, undeadBorder = 0;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nIdx = (r + dr) * COLS + (c + dc);
            if (nIdx >= 0 && nIdx < CELLS && owner[nIdx] === 4) {
              undeadBorder++;
              undeadDirX += dc;
              undeadDirZ += dr;
            }
          }
        }
        const score = outerScore + undeadBorder * 4.5 - enemiesHere * 3.5 + tRand() * 6.0;
        if (score > bestScore) {
          bestScore = score;
          const yaw = (undeadDirX !== 0 || undeadDirZ !== 0)
            ? Math.atan2(undeadDirX, undeadDirZ)
            : Math.atan2(wx, wz);
          best = { x: wx, z: wz, yaw };
        }
        continue;
      }

      let enemyDirX = 0;
      let enemyDirZ = 0;
      let enemyBorder = 0;
      let localHeat = battleHeat[idx];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nIdx = (r + dr) * COLS + (c + dc);
          if (nIdx < 0 || nIdx >= CELLS) continue;
          localHeat = Math.max(localHeat, battleHeat[nIdx]);
          if (owner[nIdx] >= 0 && owner[nIdx] !== teamId) {
            enemyBorder++;
            enemyDirX += dc;
            enemyDirZ += dr;
          }
        }
      }
      if (enemyBorder === 0 && localHeat < 0.35) continue;

      const score = localHeat * 4.5 + Math.min(8, enemyBorder) * 3.2 - enemiesHere * 4.0 + tRand() * 6.0;
      if (score > bestScore) {
        bestScore = score;
        const yaw = (enemyDirX !== 0 || enemyDirZ !== 0)
          ? Math.atan2(enemyDirX, enemyDirZ)
          : Math.atan2(-wx, -wz);
        best = { x: wx, z: wz, yaw };
      }
    }
    return best;
  }

  // Restore all remaining Undead/Neutral cells back to each house's default starting homeland (used when 4 Heroes finish reclaiming!)
  function restoreUndeadToHomelands() {
    let restored = 0;
    for (let idx = 0; idx < CELLS; idx++) {
      if (!playable[idx]) continue;
      if (owner[idx] === 4 || owner[idx] === 5) {
        const prev = owner[idx];
        const home = initialOwner[idx];
        if (home >= 0 && home < 4) {
          if (prev >= 0 && prev < 6) ownerCounts[prev]--;
          owner[idx] = home;
          ownerCounts[home]++;
          lostHomelandCounts[home] = Math.max(0, lostHomelandCounts[home] - 1);
          restored++;
        }
      }
      if (captureTeam[idx] === 4) {
        captureTeam[idx] = -1;
        captureProg[idx] = 0;
      }
    }
    dirty = true;
    if (restored > 0) corruptionVersion++;
    redrawTexture(0);
    return restored;
  }

  // Convert all Undead-conquered land (owner === 4) into Unclaimed Neutral Grey Wasteland (owner === 5)!
  function convertUndeadToNeutral() {
    let converted = 0;
    for (let idx = 0; idx < CELLS; idx++) {
      if (!playable[idx]) continue;
      if (owner[idx] === 4) {
        owner[idx] = 5;
        converted++;
      }
      if (captureTeam[idx] === 4) {
        captureTeam[idx] = -1;
        captureProg[idx] = 0;
      }
    }
    ownerCounts[4] = 0;
    ownerCounts[5] += converted;
    dirty = true;
    if (converted > 0) corruptionVersion++;
    redrawTexture(0);
    return converted;
  }

  // Smooth 3x3 local Undead corruption sampler (0..1) used to darken 3D ground, grass, wildflowers, trees, reeds & shrubs!
  function sampleUndeadCorruption(wx, wz) {
    if (ownerCounts[4] === 0) return 0;
    const fc = (wx + WORLD_W * 0.5) / CELL_W - 0.5;
    const fr = (wz + WORLD_D * 0.5) / CELL_D - 0.5;
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    let sum = 0;
    let wSum = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r0 + dr;
      if (rr < 0 || rr >= ROWS) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c0 + dc;
        if (cc < 0 || cc >= COLS) continue;
        const idx = rr * COLS + cc;
        if (!playable[idx]) continue;
        const w = (dr === 0 && dc === 0) ? 4 : (dr === 0 || dc === 0) ? 2 : 1;
        wSum += w;
        if (owner[idx] === 4) sum += w;
      }
    }
    return wSum > 0 ? (sum / wSum) : 0;
  }

  function getShares() {
    const denom = Math.max(1, totalPlayable);
    return ownerCounts.map(c => (c / denom) * 100);
  }
  function getUndeadShare() {
    return (ownerCounts[4] / Math.max(1, totalPlayable)) * 100;
  }
  function getNeutralShare() {
    return (ownerCounts[5] / Math.max(1, totalPlayable)) * 100;
  }

  function setEnabled(flag) {
    enabled = Boolean(flag);
    if (enabled) redrawTexture(0);
  }

  function getOwnerAt(wx, wz) {
    const c = Math.floor((wx + WORLD_W * 0.5) / CELL_W);
    const r = Math.floor((wz + WORLD_D * 0.5) / CELL_D);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    const own = owner[r * COLS + c];
    if (own >= 0) return own;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const nOwn = owner[rr * COLS + cc];
          if (nOwn >= 0) return nOwn;
        }
      }
    }
    return -1;
  }

  function getInitialOwnerAt(wx, wz) {
    const c = Math.floor((wx + WORLD_W * 0.5) / CELL_W);
    const r = Math.floor((wz + WORLD_D * 0.5) / CELL_D);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    const init = initialOwner[r * COLS + c];
    if (init >= 0) return init;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const nInit = initialOwner[rr * COLS + cc];
          if (nInit >= 0) return nInit;
        }
      }
    }
    return -1;
  }

  return {
    overlayMesh,
    update,
    setEnabled,
    isEnabled: () => enabled,
    getShares,
    getUndeadShare,
    getNeutralShare,
    convertUndeadToNeutral,
    restoreUndeadToHomelands,
    forceUndeadConquest95,
    getVenueOwner,
    getOwnerAt,
    getInitialOwnerAt,
    sampleUndeadCorruption,
    getCorruptionVersion: () => corruptionVersion,
    getLostHomelandCount: tm => lostHomelandCounts[tm] || 0,
    pickAttackTarget,
    pickDefenseTarget,
    pickEdgeDefenseTarget,
    pickUndeadTarget,
    pickBlightTarget,
    pickTerritorySpawn,
    pickFortifySpot,
  };
}

function buildLivingArmies(parent, territory) {
  const armyGroup = new THREE.Group();
  const bmCentral = getBridgeMetrics(BRIDGE_Z, 6.2, CENTRAL_ARCH_RISE);
  const bmNorth = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, SIDE_ARCH_RISE);
  const bmSouth = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, SIDE_ARCH_RISE);
  const ALL_BRIDGES = [
    { ...bmNorth, halfW: 0.62 },
    { ...bmCentral, halfW: 0.94 },
    { ...bmSouth, halfW: 0.62 },
  ];
  const bx = bmCentral.bx;

  const FACTIONS = [
    { id: 0, venue: VENUE_SPECS[0], primary: 0xc22b38, accent: 0xf0e0b6, magic: 0xff5a5f, side: -1 }, // Silverlance Crimson (NW)
    { id: 1, venue: VENUE_SPECS[1], primary: 0x2662a6, accent: 0xebd070, magic: 0x54c6ff, side: 1 },  // Iron Colosseum Sapphire (NE)
    { id: 2, venue: VENUE_SPECS[2], primary: 0x2b8248, accent: 0xe6cb6c, magic: 0x6ef29e, side: 1 },  // King's Green Emerald (SE)
    { id: 3, venue: VENUE_SPECS[3], primary: 0xd48a24, accent: 0x7c2234, magic: 0xffc845, side: -1 }, // Great Hall Amber (SW)
  ];
  const UNDEAD_FACTION = { id: 4, venue: null, primary: 0x3b1b52, accent: 0x6dff9e, magic: 0x5eff96, side: 0 };

  // Global Undead Invasion Event State Machine:
  // 'idle' -> 'warning' (2:00 Peace Treaty + fortification prep) ->
  // 'active' across 3 epic escalating waves:
  //   Wave 1 (5:00 — 8 massive undead edge hordes, 4 houses defend borders & CAN respawn) ->
  //   Wave 2 (3:00 — all 12 undead hordes close in, 4 houses FULL RETREAT to the Central Bridge & defend it!) ->
  //   Wave 3 (1:00+ — SKARBRAND charges the bridge, 4 houses fight WITHOUT respawn & 4 Kings are killable! Undead push to 95%!) ->
  // 'heroes' (At >=95% Undead control: 4 Radiant Heroes are summoned at the Central Bridge — Undead do NOT focus them; Heroes slowly defeat ALL Undead & Skarbrand and reclaim the realm on their own!) ->
  // 'aftermath' (Heroes ascend, 4 Kings & living armies revive, civil war resumes!) -> 'idle'
  const UNDEAD_EVENT = {
    phase: 'idle',          // 'idle' | 'warning' | 'active' | 'reign' | 'heroes' | 'rebuild' | 'peace_era' | 'aftermath'
    wave: 0,                // 0 | 1 | 2 | 3
    timer: 1800.0 + Math.random() * 1800.0, // Rare world event: triggers every 30–60 minutes IRL (or manually anytime via button / U!)
    warningDur: 120.0,      // 2:00 Peace Treaty preparation & fortification window
    wave1Dur: 300.0,        // 5:00 Wave 1 outer-border siege
    wave2Dur: 180.0,        // 3:00 Wave 2 full retreat & united defense of the central bridge
    wave3Dur: 60.0,         // 1:00 Wave 3 Skarbrand final stand at the bridge (NO respawns & Kings mortal!)
    reignDur: 120.0,        // 2:00 Dark Undead Reign after reaching 95% so Undead spread across the whole map before Heroes spawn!
    rebuildDur: 120.0,      // 2:00 Gradual Human Repopulation after the 4 Heroes reclaim all land
    peaceEraDur: 60.0,      // 1:00 Peace Era once humans are restored before war continues!
    waveRemaining: 0,
    aftermathDur: 8.0,
    activeElapsed: 0,
    undeadShare: 0,
    bossAlive: false,
    undeadAliveCount: 0,
    livingAliveCount: 1180,
    heroClearTimer: 0,
    lastHeroBlight: 100,
    heroBlightStallTimer: 0,
  };
  const BRIDGE_DEFENSE_RADIUS = 10.5;
  const KING_W3_HP = 4800; // Tanky mortal Wave 3 King HP (with 0.55 sovereign plate mitigation -> ~8,700 EHP!)
  const distToCenterBridge = (x, z) => Math.hypot(x, z - BRIDGE_Z);
  const isPeaceTreaty = () => UNDEAD_EVENT.phase === 'warning' || UNDEAD_EVENT.phase === 'active' || UNDEAD_EVENT.phase === 'reign' || UNDEAD_EVENT.phase === 'heroes' || UNDEAD_EVENT.phase === 'rebuild' || UNDEAD_EVENT.phase === 'peace_era';
  const isBridgeLastStand = () => UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 2;
  const isNoLivingRespawn = () => (UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 3) || UNDEAD_EVENT.phase === 'reign' || UNDEAD_EVENT.phase === 'heroes';
  const isKingMortal = () => UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 3;
  const isUndeadReign = () => UNDEAD_EVENT.phase === 'reign';
  const isHeroesReclaiming = () => UNDEAD_EVENT.phase === 'heroes';
  const isRebuilding = () => UNDEAD_EVENT.phase === 'rebuild';
  const isPeaceEra = () => UNDEAD_EVENT.phase === 'peace_era';
  const isCalmAftermath = () => UNDEAD_EVENT.phase === 'rebuild' || UNDEAD_EVENT.phase === 'peace_era';
  const areEnemies = (tA, tB) => (isPeaceTreaty() ? ((tA === 4) !== (tB === 4)) : (tA !== tB));

  // Tight Central Bridge United Last-Stand Rally Zones (Wave 2 & Wave 3 — ALL 4 houses do a full retreat right onto & beside the central bridge!)
  const BRIDGE_LAST_STAND_ZONES = {
    0: [[-4.8, -1.2], [-3.6, 0.3], [-5.6, 0.5], [-2.8, -0.8]], // Red NW bridgehead
    1: [[4.2, -1.1], [3.2, 0.3], [5.2, 0.5], [2.5, -0.7]], // Blue NE bridgehead
    2: [[4.2, 3.8], [3.2, 2.3], [5.2, 2.6], [2.5, 3.4]], // Green SE bridgehead
    3: [[-4.8, 3.8], [-3.6, 2.3], [-5.6, 2.6], [-2.8, 3.4]], // Orange SW bridgehead
  };

  // 12 Undead Invasion Spawn Rifts distributed across ALL 4 outer edges of the map (North, South, West, East!)
  const UNDEAD_EDGE_SPAWNS = [
    [-21.5, -13.9], [-11.5, -13.9], [10.5, -13.9], [21.5, -13.9], // North Edge (NW & NE)
    [-28.3, -6.5], [-28.3, 5.5], [28.3, -6.5], [28.3, 5.5],   // Far West & Far East Edges
    [-19.5, 18.6], [-9.0, 18.6], [9.5, 18.6], [20.5, 18.6],  // South Edge (SW & SE)
  ];

  // Slow-paced, tanky Total War combat cadence (scaled dynamically by REALM_TIDE power shifts!)
  const UNIT_STATS = {
    swordsman: { hp: 265, dmg: 9, range: 0.38, speed: 0.46, cd: 2.25, scale: 1.00 },
    knight: { hp: 450, dmg: 14, range: 0.42, speed: 0.40, cd: 2.45, scale: 1.12 },
    archer: { hp: 195, dmg: 7, range: 3.60, speed: 0.42, cd: 3.85, scale: 0.95 },
    cavalry: { hp: 360, dmg: 13, range: 0.56, speed: 0.74, cd: 2.35, scale: 1.06 },
    king: { hp: 999999, dmg: 32, range: 0.66, speed: 0.76, cd: 2.05, scale: 1.44 }, // Immortal Mounted Faction King (Mortal & Tanky in Wave 3!)
    hero: { hp: 999999, dmg: 145, range: 0.98, speed: 1.05, cd: 1.12, scale: 1.55 }, // Summoned Radiant Realm Hero (95% Blight Reclamation!)
    mage: { hp: 390, dmg: 42, range: 5.35, speed: 0.44, cd: 3.20, scale: 1.18 }, // Rare Archmage (1 per faction!)
    siege: { hp: 760, dmg: 20, range: 0.85, speed: 0.27, cd: 3.85, scale: 1.00 },
    catapult: { hp: 560, dmg: 24, range: 5.55, speed: 0.23, cd: 6.40, scale: 1.00 },
    builder: { hp: 235, dmg: 6, range: 0.38, speed: 0.45, cd: 2.10, scale: 0.98 },
    undead_warrior: { hp: 270, dmg: 14, range: 0.40, speed: 0.54, cd: 1.95, scale: 1.08 }, // Relentless Skeleton Warrior
    undead_champion: { hp: 540, dmg: 24, range: 0.46, speed: 0.48, cd: 2.10, scale: 1.32 }, // Cursed Death Knight
    undead_necro: { hp: 280, dmg: 26, range: 4.65, speed: 0.46, cd: 2.95, scale: 1.18 }, // Spectral Necromancer
    skarbrand: { hp: 14500, dmg: 118, range: 1.45, speed: 0.64, cd: 1.75, scale: 1.00 }, // Wave 3 Boss: Skarbrand the Exiled One!
  };
  // Physical personal-space collision radii & masses for EVERY troop type (prevents any troop from phasing/stacking!)
  const UNIT_RAD = {
    swordsman: 0.145,
    knight: 0.165,
    builder: 0.145,
    archer: 0.140,
    mage: 0.175,
    cavalry: 0.220,
    king: 0.270,
    hero: 0.300,
    siege: 0.340,
    catapult: 0.360,
    undead_warrior: 0.145,
    undead_champion: 0.180,
    undead_necro: 0.165,
    skarbrand: 0.480,
  };
  const UNIT_MASS = {
    swordsman: 1.0,
    knight: 1.35,
    builder: 0.95,
    archer: 0.90,
    mage: 1.40,
    cavalry: 2.10,
    king: 5.00,
    hero: 14.0,
    siege: 6.50,
    catapult: 6.50,
    undead_warrior: 1.10,
    undead_champion: 1.90,
    undead_necro: 1.25,
    skarbrand: 22.0,
  };
  const IS_MELEE_RANK = { swordsman: true, knight: true, builder: true, cavalry: true, undead_warrior: true, undead_champion: true };

  // Spread-out map-wide tactical sectors across EVERY region of all 4 factions' territories
  // (NW woods/ridges, NE foothills/orchards, SE timberlands/meadows, SW farms/woods, plus all 3 bridges!)
  const TERRITORY_ZONES = {
    0: [ // Royal Lists (NW) — wide spread from far West woods & North Marches to West Bank & South border
      [-24.2, -11.8], [-17.5, -13.4], [-10.8, -13.6], [-4.8, -11.4],
      [-23.4, -4.6], [-16.5, -2.2], [-8.8, -1.5], [-4.5, -5.6], [-4.2, NORTH_BRIDGE_Z],
    ],
    1: [ // Iron Colosseum (NE) — wide spread from Northern Alpine foothills & Far East woods to East Bank
      [24.5, -11.2], [18.8, -13.2], [11.4, -13.4], [5.0, -11.2],
      [23.8, -2.6], [18.6, 1.2], [9.6, -1.2], [6.4, -5.0], [2.8, NORTH_BRIDGE_Z],
    ],
    2: [ // King's Green (SE) — wide spread from Old Orchard Farms & Far East forest to Willowmere South-East Meadows
      [23.6, 5.2], [22.4, 12.8], [16.8, 16.6], [10.4, 17.6],
      [14.2, 5.0], [8.2, 4.4], [5.8, 10.6], [6.6, 15.8], [5.6, SOUTH_BRIDGE_Z],
    ],
    3: [ // Great Hall (SW) — wide spread from Far West farms & Courtyard woods to Willowmere South-West Meadows
      [-25.4, 3.6], [-24.2, 12.2], [-18.4, 16.4], [-10.8, 17.4],
      [-14.6, 2.6], [-9.2, 4.8], [-5.4, 8.2], [-5.2, 14.4], [-1.4, SOUTH_BRIDGE_Z],
    ],
  };

  // Multi-front invasion targets spanning ALL 3 enemy territories (never clustered only in the center!)
  const FRONTIER_EXCURSIONS = {
    0: [ // Red invades SW Orange farms/meadows, NE Blue marches/hills, AND deep SE Green via North/South flanks
      [-21.5, 4.2], [-14.8, 12.8], [-8.6, 14.2], [-9.8, 3.8],
      [5.4, -11.4], [12.8, -12.6], [19.4, -10.8], [19.6, -1.8], [10.2, 6.4],
    ],
    1: [ // Blue invades SE Green orchards/meadows, NW Red marches/woods, AND deep SW Orange
      [21.4, 6.4], [15.4, 15.2], [9.2, 14.8], [9.2, 4.6],
      [-5.6, -11.4], [-14.2, -12.8], [-21.2, -9.8], [-17.4, -1.8], [-9.6, 6.2],
    ],
    2: [ // Green invades NE Blue farms/hills, SW Orange meadows/woods, AND deep NW Red
      [21.6, -2.4], [19.8, -10.4], [11.6, -11.8], [9.2, -2.2],
      [-5.6, 13.8], [-14.8, 15.6], [-22.4, 11.4], [-19.2, 3.2], [-11.8, -5.8],
    ],
    3: [ // Orange invades NW Red woods/ridges, SE Green meadows/orchards, AND deep NE Blue
      [-22.2, -3.6], [-19.4, -11.2], [-10.8, -12.4], [-9.4, -2.2],
      [6.4, 14.6], [14.6, 16.2], [21.6, 11.2], [19.4, 4.4], [12.4, -5.6],
    ],
  };

  const findNearestBridge = (x, z, targetX, targetZ) => {
    const midZ = (z + targetZ) * 0.5;
    let bestB = ALL_BRIDGES[1];
    let bestScore = Infinity;
    for (const b of ALL_BRIDGES) {
      const score = Math.abs(b.bz - midZ) + Math.abs(b.bz - z) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        bestB = b;
      }
    }
    return bestB;
  };

  // Ground height seamlessly following terrain OR any of the 3 arched bridges (North, Central, South)!
  const armyGroundY = (wx, wz) => {
    for (const b of ALL_BRIDGES) {
      const dx = wx - b.bx;
      const dz = wz - b.bz;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) < b.halfSpan + 0.85 && Math.abs(lz) < b.halfW + 0.14) {
        return b.deckTopY(lx) + 0.025;
      }
    }
    return terrainHeight(wx, wz);
  };

  // 3-stage local-axis bridge crossing helper: aligns strictly to bridge centerline first,
  // then marches straight across the span to the far bank so ZERO units ever snag on a riverbank!
  const steerAcrossRiver = (curX, curZ, tgtX, tgtZ) => {
    const curSide = curX < riverCenterX(curZ) ? -1 : 1;
    const tgtSide = tgtX < riverCenterX(tgtZ) ? -1 : 1;
    if (curSide === tgtSide) return { x: tgtX, z: tgtZ, crossing: false };
    const br = findNearestBridge(curX, curZ, tgtX, tgtZ);
    const dx = curX - br.bx;
    const dz = curZ - br.bz;
    const lx = dx * br.cos - dz * br.sin;
    const lz = dx * br.sin + dz * br.cos;
    // Stage 1: line up dead-center with the bridge approach apron before stepping onto the span
    if (Math.abs(lz) > 0.38 && curSide * lx > br.halfSpan * 0.65) {
      const [ex, ez] = br.toWorld(curSide * (br.halfSpan + 0.95), 0);
      return { x: ex, z: ez, crossing: true, onSpan: false };
    }
    // Stage 2: march straight across the arched span to the far-side exit apron
    const [fx, fz] = br.toWorld(tgtSide * (br.halfSpan + 1.45), 0);
    return { x: fx, z: fz, crossing: true, onSpan: Math.abs(lx) <= br.halfSpan + 1.1 };
  };

  // Prevent units from ever wading underwater or clipping into venue plinths (allowVenueId lets a retreating King ride inside his own Event Venue!)
  const keepOnPassableLand = (x, z, prevX, prevZ, allowVenueId = -1) => {
    let nx = Math.max(-29.2, Math.min(29.2, x));
    let nz = Math.max(-14.8, Math.min(19.6, z));

    let onBridge = false;
    for (const b of ALL_BRIDGES) {
      const dxB = nx - b.bx;
      const dzB = nz - b.bz;
      const lx = dxB * b.cos - dzB * b.sin;
      const lz = dxB * b.sin + dzB * b.cos;
      if (Math.abs(lx) < b.halfSpan + 1.45 && Math.abs(lz) < b.halfW + 0.14) {
        onBridge = true;
        break;
      }
    }

    if (!onBridge) {
      const rx = riverCenterX(nz);
      const safeW = riverHalfWidth(nz) + 0.45;
      if (Math.abs(nx - rx) < safeW) {
        const sgn = (prevX - riverCenterX(prevZ)) < 0 ? -1 : 1;
        nx = rx + sgn * safeW;
      }
    }

    // Keep outside the solid inner architecture of the 4 venues (unless explicitly entering own venue!)
    for (const v of VENUE_SPECS) {
      if (v.id === allowVenueId) continue;
      const vx = nx - v.x;
      const vz = nz - v.z;
      const d = Math.hypot(vx, vz);
      const minR = v.plateauR - 0.15;
      if (d < minR && d > 1e-4) {
        nx = v.x + (vx / d) * minR;
        nz = v.z + (vz / d) * minR;
      }
    }
    return [nx, nz];
  };

  // Sanctuary rally courtyard right outside each faction's home Event Venue where the King rests & replenishes companions!
  const getKingSanctuary = fac => {
    const v = fac.venue;
    const toCX = -v.x;
    const toCZ = -v.z;
    const len = Math.hypot(toCX, toCZ) || 1;
    const r = v.plateauR + 0.65;
    const sx = v.x + (toCX / len) * r;
    const sz = v.z + (toCZ / len) * r;
    return keepOnPassableLand(sx, sz, sx, sz);
  };

  // Spawn units across the ENTIRE territory owned by their faction (left, right, north, south — NEVER just facing the middle!)
  const getTerritorySpawn = (f, preferX = null, preferZ = null) => {
    if (territory?.pickTerritorySpawn) {
      return territory.pickTerritorySpawn(f.id, preferX, preferZ);
    }
    const zones = TERRITORY_ZONES[f.id];
    const p = zones[Math.floor(aRand() * zones.length)];
    return [p[0] + (aRand() - 0.5) * 2.0, p[1] + (aRand() - 0.5) * 2.0];
  };

  // Deterministic pseudo-random for reproducible organic variety
  let aSeed = 8821;
  const aRand = () => {
    aSeed = (aSeed * 16807) % 2147483647;
    return (aSeed - 1) / 2147483646;
  };

  // ── INSTANCED MESH POOLS (SILKY 60FPS FOR 1,220+ LIVING TROOPS + 840 UNDEAD LEGION + SKARBRAND BOSS!) ─
  const MAX_PERSONS = 3600;
  const MAX_SWORDSMEN = 760;
  const MAX_KNIGHTS = 320;
  const MAX_ARCHERS = 320;
  const MAX_MAGES = 16;
  const MAX_KINGS = 8;
  const MAX_BUILDERS = 64;
  const MAX_UNDEAD = 900;
  const MAX_HORSES = 280;
  const MAX_SIEGE = 48;
  const MAX_BARRICADES = 40;
  const MAX_TOWERS = 24;
  const MAX_BANNERS = 112;
  const MAX_ARROWS = 380;
  const MAX_MAGIC = 160;
  const MAX_BOULDERS = 36;
  const MAX_SLASH = 420;
  const MAX_FX = 720;

  const initWhite = new THREE.Color(0xffffff);
  const instanceFlushers=[];
  const makeInst = (geom, mat, max, cast = false, colored = false) => {
    const inst = new THREE.InstancedMesh(geom, mat, max);
    if (colored) {
      // Pre-allocate instanceColor before first WebGL draw so USE_INSTANCING_COLOR is always compiled cleanly!
      inst.setColorAt(0, initWhite);
      inst.instanceColor.needsUpdate = true;
    }
    inst.count = 0;
    inst.frustumCulled = false;
    inst.castShadow = cast;
    armyGroup.add(inst);
    instanceFlushers.push(trackInstanceUploads(inst));
    return inst;
  };

  // Helper to merge multiple BufferGeometries into one crisp multi-part instanced silhouette!
  const mergeUnitGeoms = list => {
    const posArr = [];
    const normArr = [];
    for (const raw of list) {
      const g = raw.index ? raw.toNonIndexed() : raw;
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { posArr.push(p[i]); normArr.push(n[i]); }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
    return merged;
  };
  const partAt = (g, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(tx, ty, tz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    g.applyMatrix4(m);
    return g;
  };

  const stdWhite = rough => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0.14 });
  const plateArmorMat = new THREE.MeshStandardMaterial({ color: 0xd5dce3, roughness: 0.28, metalness: 0.78 });
  const bodyGeom = new THREE.CylinderGeometry(0.036, 0.052, 0.155, 6);
  bodyGeom.translate(0, 0.08, 0);
  const bodyInst = makeInst(bodyGeom, stdWhite(0.76), MAX_PERSONS, true, true);

  const headGeom = new THREE.SphereGeometry(0.034, 6, 5);
  const headInst = makeInst(headGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 }), MAX_PERSONS, false, true);

  // Detailed Crossguard Medieval Broadsword (tapered steel blade + crossguard hilt + pommel)
  const weaponGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.016, 0.165, 0.008), 0, 0.115, 0),    // steel blade
    partAt(new THREE.ConeGeometry(0.011, 0.036, 4), 0, 0.212, 0),       // tapered sword tip
    partAt(new THREE.BoxGeometry(0.062, 0.013, 0.014), 0, 0.032, 0),    // horizontal crossguard
    partAt(new THREE.CylinderGeometry(0.008, 0.008, 0.034, 5), 0, 0.012, 0), // grip
    partAt(new THREE.SphereGeometry(0.013, 5, 4), 0, -0.008, 0),        // pommel
  ]);
  const weaponInst = makeInst(weaponGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.76 }), MAX_PERSONS, false, true);

  // Detailed Medieval Heater / Kite Shield (upper shield body + pointed lower heater taper + central boss)
  const shieldGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.072, 0.066, 0.016), 0, 0.022, 0),
    partAt(new THREE.ConeGeometry(0.044, 0.056, 4), 0, -0.038, 0, Math.PI, Math.PI / 4, 0, 1.15, 1.0, 0.36),
    partAt(new THREE.SphereGeometry(0.015, 6, 5), 0, 0.012, 0.011),     // raised shield boss
    partAt(new THREE.BoxGeometry(0.076, 0.012, 0.020), 0, 0.054, 0),    // reinforced top rim
  ]);
  const shieldInst = makeInst(shieldGeom, stdWhite(0.62), MAX_PERSONS, false, true);

  // Detailed Footman / Swordsman Armor: Steel Kettle-Helm with wide brim & dome + armored shoulder guards + chest straps!
  const swordsmanHelmGeom = mergeUnitGeoms([
    partAt(new THREE.ConeGeometry(0.066, 0.026, 8), 0, 0.210, 0),               // wide steel kettle-helm brim
    partAt(new THREE.SphereGeometry(0.042, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.212, 0), // steel helmet crown
    partAt(new THREE.BoxGeometry(0.010, 0.034, 0.014), 0, 0.194, 0.038),        // nasal guard
    partAt(new THREE.BoxGeometry(0.036, 0.026, 0.052), -0.052, 0.146, 0, 0, 0, 0.22),  // left steel spaulder
    partAt(new THREE.BoxGeometry(0.036, 0.026, 0.052), 0.052, 0.146, 0, 0, 0, -0.22), // right steel spaulder
    partAt(new THREE.CylinderGeometry(0.054, 0.058, 0.020, 7), 0, 0.088, 0),    // armored waist belt
  ]);
  const swordsmanHelmInst = makeInst(swordsmanHelmGeom, new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.42, metalness: 0.64 }), MAX_SWORDSMEN, false, false);

  // Detailed Swordsman Leather Harness & Surcoat Trim (faction-accent belt & tunic shoulder straps)
  const swordsmanTrimGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.095, 0.018, 0.082), 0, 0.088, 0),
    partAt(new THREE.BoxGeometry(0.020, 0.085, 0.080), 0, 0.125, 0, 0, 0, 0.42),
    partAt(new THREE.BoxGeometry(0.020, 0.085, 0.080), 0, 0.125, 0, 0, 0, -0.42),
  ]);
  const swordsmanTrimInst = makeInst(swordsmanTrimGeom, new THREE.MeshStandardMaterial({ color: 0x5c3c22, roughness: 0.86 }), MAX_SWORDSMEN, false, false);

  // Knight Heavy Plate Armor (gleaming steel breastplate + broad shoulder pauldrons + crested helm plume!)
  const knightArmorGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.11, 0.105, 0.088), 0, 0.115, 0),            // steel breastplate cuirass
    partAt(new THREE.SphereGeometry(0.042, 7, 5), -0.068, 0.152, 0, 0, 0, 0, 1.05, 0.85, 1.0), // left pauldron
    partAt(new THREE.SphereGeometry(0.042, 7, 5), 0.068, 0.152, 0, 0, 0, 0, 1.05, 0.85, 1.0), // right pauldron
    partAt(new THREE.CylinderGeometry(0.044, 0.048, 0.075, 7), 0, 0.205, 0),  // steel great-helm visor
  ]);
  const knightArmorInst = makeInst(knightArmorGeom, plateArmorMat, MAX_KNIGHTS, false, false);

  const knightPlumeGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.018, 0.055, 0.085), 0, 0.265, -0.015, -0.25, 0, 0),
    partAt(new THREE.ConeGeometry(0.022, 0.065, 5), 0, 0.255, -0.055, -0.85, 0, 0),
  ]);
  const knightPlumeInst = makeInst(knightPlumeGeom, stdWhite(0.62), MAX_KNIGHTS, false, true);

  // Unmistakable Archers: Vertical D-shaped Medieval Longbow + bowstring + nocked arrow + back quiver!
  const archerBowGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.115, 0.013, 5, 10, Math.PI), 0, 0.135, 0.045, 0, -Math.PI / 2, -Math.PI / 2), // vertical curved yew longbow bowing forward (+Z)
    partAt(new THREE.CylinderGeometry(0.004, 0.004, 0.23, 4), 0, 0.135, 0.045),                                   // taut vertical bowstring connecting tips
    partAt(new THREE.CylinderGeometry(0.005, 0.006, 0.19, 4), 0, 0.135, 0.125, Math.PI / 2, 0, 0),                // nocked arrow shaft pointing forward (+Z)
    partAt(new THREE.ConeGeometry(0.013, 0.036, 4), 0, 0.135, 0.228, Math.PI / 2, 0, 0),                          // broadhead arrowhead tip
  ]);
  const archerBowInst = makeInst(archerBowGeom, new THREE.MeshStandardMaterial({ color: 0xc48b3b, roughness: 0.72 }), MAX_ARCHERS, false, false);

  const archerQuiverGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.024, 0.018, 0.13, 6), -0.028, 0.125, -0.052, 0.18, 0, 0.32),   // leather quiver
    partAt(new THREE.ConeGeometry(0.012, 0.04, 4), -0.045, 0.20, -0.056, 0.18, 0, 0.32),              // arrow fletchings
    partAt(new THREE.ConeGeometry(0.012, 0.04, 4), -0.032, 0.205, -0.044, 0.18, 0, 0.22),
  ]);
  const archerQuiverInst = makeInst(archerQuiverGeom, new THREE.MeshStandardMaterial({ color: 0x5d3d22, roughness: 0.90 }), MAX_ARCHERS, false, false);

  // Legendary Rare Archmage Design (1 per faction!):
  // 1) Ornate flared Archmage robe skirt + sweeping mantle cloak + iconic tall curved pointed wizard hat!
  const mageRobeGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.048, 0.095, 0.135, 9), 0, 0.068, 0),                   // flared ceremonial robe hem
    partAt(new THREE.CylinderGeometry(0.062, 0.092, 0.175, 7, 1, false, -Math.PI * 0.62, Math.PI * 1.24), 0, 0.105, -0.025, 0.14, Math.PI, 0), // flowing wizard cloak behind back
    partAt(new THREE.ConeGeometry(0.088, 0.026, 10), 0, 0.214, 0),                             // wide pointed wizard hat brim
    partAt(new THREE.ConeGeometry(0.046, 0.125, 9), 0, 0.278, -0.008, -0.14, 0, 0),            // tall tapered wizard hat cone
    partAt(new THREE.ConeGeometry(0.022, 0.068, 7), 0, 0.348, -0.036, -0.68, 0, 0),            // curved drooping arcane hat tip
  ]);
  const mageRobeInst = makeInst(mageRobeGeom, stdWhite(0.68), MAX_MAGES, true, true);

  // 2) Gilded Archmage Trim (golden hatband & arcane star crest + crescent shoulder pauldrons + chest stole!)
  const mageGoldGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.046, 0.009, 5, 10), 0, 0.224, -0.002, Math.PI / 2 - 0.10, 0, 0), // golden wizard hatband
    partAt(new THREE.OctahedronGeometry(0.017), 0, 0.242, 0.042),                              // front star crest on hat
    partAt(new THREE.BoxGeometry(0.024, 0.125, 0.018), -0.024, 0.095, 0.056),                  // left gold ceremonial stole
    partAt(new THREE.BoxGeometry(0.024, 0.125, 0.018), 0.024, 0.095, 0.056),                  // right gold ceremonial stole
    partAt(new THREE.TorusGeometry(0.038, 0.011, 5, 8, Math.PI), -0.066, 0.158, 0, 0, Math.PI / 2, 0.35), // ornate left mantle pauldron
    partAt(new THREE.TorusGeometry(0.038, 0.011, 5, 8, Math.PI), 0.066, 0.158, 0, 0, Math.PI / 2, -0.35), // ornate right mantle pauldron
  ]);
  const mageGoldInst = makeInst(mageGoldGeom, new THREE.MeshStandardMaterial({ color: 0xe6be53, roughness: 0.30, metalness: 0.82 }), MAX_MAGES, false, false);

  // 3) Dedicated Sculpted Arcane Runestaff (animated separately during spellcasting!) with golden crescent orb cradle
  const mageStaffGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.011, 0.015, 0.34, 6), 0, 0.14, 0),                     // carved dark oak & bronze shaft
    partAt(new THREE.TorusGeometry(0.044, 0.009, 5, 10, Math.PI * 1.45), 0, 0.34, 0, 0, 0, -Math.PI * 0.22), // gilded crescent cradle
    partAt(new THREE.OctahedronGeometry(0.018), 0, 0.295, 0),                                  // rune collar below orb
  ]);
  const mageStaffInst = makeInst(mageStaffGeom, new THREE.MeshStandardMaterial({ color: 0xd4a438, roughness: 0.34, metalness: 0.78 }), MAX_MAGES, false, false);

  // 4) Levitating Pulsing Arcane Crystal Orb + Orbiting Ground/Shoulder Rune Halo!
  const mageOrbInst = makeInst(
    new THREE.OctahedronGeometry(0.046, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX_MAGES,
    false,
    true
  );
  const mageHaloGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.21, 0.012, 5, 18), 0, 0, 0, Math.PI / 2, 0, 0),           // glowing arcane sigil ring
    partAt(new THREE.OctahedronGeometry(0.026), 0.21, 0, 0),                                  // 4 orbiting rune nodes
    partAt(new THREE.OctahedronGeometry(0.026), -0.21, 0, 0),
    partAt(new THREE.OctahedronGeometry(0.026), 0, 0, 0.21),
    partAt(new THREE.OctahedronGeometry(0.026), 0, 0, -0.21),
  ]);
  const mageHaloInst = makeInst(
    mageHaloGeom,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false }),
    MAX_MAGES,
    false,
    true
  );

  // Detailed Medieval Warhorse (sculpted barrel torso, hindquarters, arched neck, head with ears & muzzle, tail, and 4 striding legs!)
  const horseBodyGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.058, 0.062, 0.24, 8), 0, 0.02, 0, Math.PI / 2, 0, 0),    // muscular torso barrel
    partAt(new THREE.SphereGeometry(0.062, 7, 6), 0, 0.025, 0.10),                               // chest
    partAt(new THREE.SphereGeometry(0.064, 7, 6), 0, 0.025, -0.105),                             // hindquarters
    partAt(new THREE.CylinderGeometry(0.032, 0.048, 0.145, 7), 0, 0.10, 0.145, 0.56, 0, 0),      // arched neck
    partAt(new THREE.BoxGeometry(0.050, 0.052, 0.115), 0, 0.152, 0.21, 0.42, 0, 0),              // sculpted horse head & muzzle
    partAt(new THREE.ConeGeometry(0.012, 0.034, 4), -0.018, 0.195, 0.175, -0.15, 0, 0.15),       // left ear
    partAt(new THREE.ConeGeometry(0.012, 0.034, 4), 0.018, 0.195, 0.175, -0.15, 0, -0.15),      // right ear
    partAt(new THREE.CylinderGeometry(0.014, 0.008, 0.15, 5), 0, -0.01, -0.18, -0.45, 0, 0),     // flowing tail
    // 4 galloping legs
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), -0.038, -0.06, 0.095, -0.26, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), 0.038, -0.06, 0.095, 0.22, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), -0.038, -0.06, -0.095, 0.24, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), 0.038, -0.06, -0.095, -0.22, 0, 0),
  ]);
  const horseBodyInst = makeInst(horseBodyGeom, stdWhite(0.80), MAX_HORSES, true, true);

  // Heraldic Medieval Warhorse Barding / Caparison Cloth + Saddle & Armored Chanfron (faction-colored!)
  const horseBardingGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.134, 0.088, 0.245), 0, 0.005, 0),                             // draped flank barding cloth
    partAt(new THREE.BoxGeometry(0.118, 0.075, 0.055), 0, 0.012, 0.145, -0.18, 0, 0),            // front chest caparison
    partAt(new THREE.BoxGeometry(0.086, 0.038, 0.11), 0, 0.082, -0.01),                          // high-backed war saddle
    partAt(new THREE.BoxGeometry(0.054, 0.016, 0.082), 0, 0.172, 0.215, 0.42, 0, 0),             // armored chanfron brow-plate
  ]);
  const horseBardingInst = makeInst(horseBardingGeom, stdWhite(0.64), MAX_HORSES, false, true);

  // Cavalry Rider Visored Sallet Helm, Shoulder Pauldrons & Long Conical Jousting Lance!
  const cavalryGearGeom = mergeUnitGeoms([
    partAt(new THREE.SphereGeometry(0.045, 7, 6), 0, 0.205, 0),                                  // steel sallet helmet
    partAt(new THREE.ConeGeometry(0.048, 0.045, 6), 0, 0.205, -0.032, -1.2, 0, 0),               // swept sallet tail
    partAt(new THREE.SphereGeometry(0.034, 6, 5), -0.058, 0.148, 0),                             // left rider pauldron
    partAt(new THREE.SphereGeometry(0.034, 6, 5), 0.058, 0.148, 0),                             // right rider pauldron
    // Couched jousting lance with conical hand vamplate guard!
    partAt(new THREE.CylinderGeometry(0.008, 0.013, 0.44, 5), 0.068, 0.115, 0.16, Math.PI / 2, 0, 0),
    partAt(new THREE.ConeGeometry(0.026, 0.055, 6), 0.068, 0.115, 0.06, -Math.PI / 2, 0, 0),     // vamplate hand guard
    partAt(new THREE.ConeGeometry(0.016, 0.055, 5), 0.068, 0.115, 0.40, Math.PI / 2, 0, 0),      // steel lance tip
  ]);
  const cavalryGearInst = makeInst(cavalryGearGeom, plateArmorMat, MAX_HORSES, false, false);

  // Fluttering Faction Lance Pennon right behind the cavalry lance tip!
  const cavalryPennonGeom = partAt(new THREE.BoxGeometry(0.010, 0.048, 0.11), 0.068, 0.088, 0.30);
  const cavalryPennonInst = makeInst(cavalryPennonGeom, stdWhite(0.65), MAX_HORSES, false, true);

  // ── GRAND UNKILLABLE FACTION KINGS (1 per house — White Armored Stallion, Crown, Cape & Royal Greatsword!) ─
  // 1) Majestic Pure-White Warhorse (1.38x grander stature than accompanying knight cavalry mounts!)
  const kingHorseGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.082, 0.086, 0.34, 9), 0, 0.03, 0, Math.PI / 2, 0, 0),      // massive barrel torso
    partAt(new THREE.SphereGeometry(0.088, 8, 6), 0, 0.036, 0.145),                                // broad chest
    partAt(new THREE.SphereGeometry(0.088, 8, 6), 0, 0.036, -0.15),                                // powerful hindquarters
    partAt(new THREE.CylinderGeometry(0.044, 0.068, 0.21, 8), 0, 0.148, 0.205, 0.52, 0, 0),        // proud arched neck
    partAt(new THREE.BoxGeometry(0.068, 0.072, 0.16), 0, 0.222, 0.295, 0.42, 0, 0),                // noble horse head
    partAt(new THREE.BoxGeometry(0.022, 0.16, 0.045), 0, 0.18, 0.165, 0.52, 0, 0),                 // flowing white mane crest
    partAt(new THREE.ConeGeometry(0.016, 0.044, 4), -0.024, 0.278, 0.248, -0.15, 0, 0.15),         // left ear
    partAt(new THREE.ConeGeometry(0.016, 0.044, 4), 0.024, 0.278, 0.248, -0.15, 0, -0.15),        // right ear
    partAt(new THREE.CylinderGeometry(0.020, 0.010, 0.24, 6), 0, -0.01, -0.255, -0.45, 0, 0),      // sweeping white tail
    // 4 tall striding white warhorse legs
    partAt(new THREE.CylinderGeometry(0.021, 0.015, 0.19, 6), -0.054, -0.082, 0.135, -0.26, 0, 0),
    partAt(new THREE.CylinderGeometry(0.021, 0.015, 0.19, 6), 0.054, -0.082, 0.135, 0.22, 0, 0),
    partAt(new THREE.CylinderGeometry(0.021, 0.015, 0.19, 6), -0.054, -0.082, -0.135, 0.24, 0, 0),
    partAt(new THREE.CylinderGeometry(0.021, 0.015, 0.19, 6), 0.054, -0.082, -0.135, -0.22, 0, 0),
  ]);
  const kingHorseInst = makeInst(kingHorseGeom, new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.52, metalness: 0.08 }), MAX_KINGS, true, false);

  // 2) Gleaming Silver-Steel Horse Plate Armor (armored chanfron, neck crinet, broad chest peytral & rear croupier!)
  const kingHorseArmorGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.078, 0.024, 0.145), 0, 0.256, 0.305, 0.42, 0, 0),               // steel chanfron brow armor
    partAt(new THREE.CylinderGeometry(0.052, 0.072, 0.16, 7), 0, 0.156, 0.215, 0.52, 0, 0),        // armored neck crinet plates
    partAt(new THREE.SphereGeometry(0.096, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.65), 0, 0.04, 0.185, Math.PI * 0.45, 0, 0), // chest peytral armor
    partAt(new THREE.BoxGeometry(0.185, 0.082, 0.15), 0, 0.068, -0.14),                            // rear croupier armor plates
    partAt(new THREE.BoxGeometry(0.125, 0.052, 0.155), 0, 0.115, -0.01),                           // high-backed armored war saddle
  ]);
  const kingHorseArmorInst = makeInst(kingHorseArmorGeom, new THREE.MeshStandardMaterial({ color: 0xe6ecf2, roughness: 0.22, metalness: 0.86 }), MAX_KINGS, false, false);

  // 3) Sweeping Faction-Colored Royal Caparison Skirt on the White Armored Stallion
  const kingBardingGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.192, 0.128, 0.35), 0, -0.008, 0),                               // long draped royal caparison flanks
    partAt(new THREE.BoxGeometry(0.168, 0.105, 0.075), 0, 0.004, 0.205, -0.18, 0, 0),              // front heraldic chest skirt
  ]);
  const kingBardingInst = makeInst(kingBardingGeom, stdWhite(0.58), MAX_KINGS, false, true);

  // 4) Towering Heroic Monarch Plate Armor (broad silver-steel cuirass, grand layered pauldrons & visored helm)
  const kingArmorGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.122, 0.125, 0.098), 0, 0.118, 0),                               // broad royal steel breastplate
    partAt(new THREE.SphereGeometry(0.048, 7, 5), -0.076, 0.162, 0, 0, 0, 0, 1.15, 0.88, 1.1),     // grand left pauldron
    partAt(new THREE.SphereGeometry(0.048, 7, 5), 0.076, 0.162, 0, 0, 0, 0, 1.15, 0.88, 1.1),     // grand right pauldron
    partAt(new THREE.CylinderGeometry(0.042, 0.046, 0.068, 8), 0, 0.206, 0),                       // noble royal steel helm
  ]);
  const kingArmorInst = makeInst(kingArmorGeom, new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.22, metalness: 0.88 }), MAX_KINGS, true, false);

  // 5) Sweeping Floor-Length Faction-Colored Royal Sovereign Cape billowing behind the King!
  const kingCapeGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.145, 0.22, 0.022), 0, 0.065, -0.095, 0.44, 0, 0),               // sweeping royal cloak
    partAt(new THREE.BoxGeometry(0.165, 0.042, 0.085), 0, 0.165, -0.025),                          // broad royal mantle collar
  ]);
  const kingCapeInst = makeInst(kingCapeGeom, stdWhite(0.62), MAX_KINGS, false, true);

  // 6) Gleaming 24k Golden Royal Crown (5-pointed monarch crown!), Golden Pauldron Trim & Horse Brow-Spike!
  const kingGoldGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.046, 0.011, 5, 10), 0, 0.244, 0, Math.PI / 2, 0, 0),          // royal golden crown circlet
    partAt(new THREE.ConeGeometry(0.011, 0.042, 4), 0.000, 0.270, 0.044),                        // front crown spire
    partAt(new THREE.ConeGeometry(0.010, 0.036, 4), 0.040, 0.266, 0.015),                        // right-front crown spire
    partAt(new THREE.ConeGeometry(0.010, 0.036, 4), -0.040, 0.266, 0.015),                        // left-front crown spire
    partAt(new THREE.ConeGeometry(0.010, 0.034, 4), 0.026, 0.264, -0.036),                        // right-back crown spire
    partAt(new THREE.ConeGeometry(0.010, 0.034, 4), -0.026, 0.264, -0.036),                        // left-back crown spire
    partAt(new THREE.BoxGeometry(0.128, 0.024, 0.104), 0, 0.072, 0),                               // royal golden waist belt
    partAt(new THREE.BoxGeometry(0.026, 0.115, 0.022), 0, 0.122, 0.050),                           // royal gold chest cross trim
    partAt(new THREE.BoxGeometry(0.082, 0.022, 0.022), 0, 0.138, 0.050),
  ]);
  const kingGoldInst = makeInst(kingGoldGeom, new THREE.MeshStandardMaterial({ color: 0xf4c842, roughness: 0.22, metalness: 0.90 }), MAX_KINGS, false, false);

  // 7) Massive Radiant Royal Greatsword (held in the King's right hand — huge overhead cleave!)
  const kingSwordGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.028, 0.275, 0.012), 0, 0.185, 0),                               // broad gleaming greatsword blade
    partAt(new THREE.ConeGeometry(0.020, 0.062, 4), 0, 0.352, 0),                                  // tapered greatsword tip
    partAt(new THREE.BoxGeometry(0.105, 0.022, 0.024), 0, 0.048, 0),                               // wide golden royal crossguard
    partAt(new THREE.CylinderGeometry(0.012, 0.012, 0.058, 6), 0, 0.015, 0),                       // grip
    partAt(new THREE.OctahedronGeometry(0.024), 0, -0.018, 0),                                     // royal pommel jewel
  ]);
  const kingSwordInst = makeInst(kingSwordGeom, new THREE.MeshStandardMaterial({ color: 0xffe484, emissive: 0x6b4c08, emissiveIntensity: 0.35, roughness: 0.22, metalness: 0.88 }), MAX_KINGS, false, false);

  // 8) Shimmering Golden Sovereign Aura Ring beneath the King's white armored warhorse
  const kingAuraGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.38, 0.018, 5, 22), 0, 0, 0, Math.PI / 2, 0, 0),
    partAt(new THREE.TorusGeometry(0.30, 0.010, 4, 18), 0, 0.005, 0, Math.PI / 2, 0, 0),
  ]);
  const kingAuraInst = makeInst(
    kingAuraGeom,
    new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.68, depthWrite: false }),
    MAX_KINGS,
    false,
    false
  );

  // 9) Floating Small Golden Crown Highlight above each King's head so every King is unmistakable from any angle!
  const createKingCrownTexture = teamId => {
    const pal = TEAM_FLAG_PALETTES[teamId] || TEAM_FLAG_PALETTES[0];
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');

    // Soft warm golden spotlight halo behind the crown
    const glow = ctx.createRadialGradient(S * 0.5, S * 0.52, 8, S * 0.5, S * 0.52, 58);
    glow.addColorStop(0, 'rgba(255, 232, 128, 0.85)');
    glow.addColorStop(0.45, 'rgba(244, 192, 56, 0.36)');
    glow.addColorStop(1, 'rgba(244, 192, 56, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);

    // Crisp gleaming golden 5-point royal crown (matching #i-crown silhouette!)
    ctx.save();
    ctx.translate(S * 0.5, S * 0.52);
    const crownGrad = ctx.createLinearGradient(0, -28, 0, 22);
    crownGrad.addColorStop(0, '#fff4ad');
    crownGrad.addColorStop(0.5, '#f6c844');
    crownGrad.addColorStop(1, '#c98a12');

    ctx.beginPath();
    ctx.moveTo(-30, -14);
    ctx.lineTo(-14, 2);
    ctx.lineTo(0, -24);
    ctx.lineTo(14, 2);
    ctx.lineTo(30, -14);
    ctx.lineTo(23, 20);
    ctx.lineTo(-23, 20);
    ctx.closePath();
    ctx.fillStyle = crownGrad;
    ctx.fill();
    ctx.lineWidth = 4.2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#472a05';
    ctx.stroke();

    // Base crown band
    ctx.fillStyle = '#e8b32a';
    ctx.strokeStyle = '#472a05';
    ctx.lineWidth = 3.2;
    ctx.fillRect(-23, 19, 46, 8);
    ctx.strokeRect(-23, 19, 46, 8);

    // Three golden tip pearls + faction-colored center royal jewel!
    for (const [px, py] of [[-30, -16], [0, -26], [30, -16]]) {
      ctx.beginPath();
      ctx.arc(px, py, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff5bd';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#472a05';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 9, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = pal.bg;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#fff3b8';
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const kingCrownSprites = [0, 1, 2, 3].map(tid => {
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createKingCrownTexture(tid),
        transparent: true,
        depthWrite: false,
        depthTest: true,
      })
    );
    spr.scale.set(0.46, 0.46, 1);
    spr.renderOrder = 14;
    spr.visible = false;
    armyGroup.add(spr);
    return spr;
  });

  // Combat Engineer / Builder Gear (wide-brimmed cap + leather carpenter apron + timber backpack + iron-headed mallet!)
  const builderGearGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.062, 0.068, 0.016, 8), 0, 0.205, 0),                     // wide worker cap brim
    partAt(new THREE.CylinderGeometry(0.038, 0.044, 0.032, 7), 0, 0.222, 0),                     // cap crown
    partAt(new THREE.BoxGeometry(0.082, 0.105, 0.022), 0, 0.085, 0.044),                         // heavy leather apron
    partAt(new THREE.BoxGeometry(0.084, 0.088, 0.052), 0, 0.118, -0.056),                        // timber/tool satchel backpack
  ]);
  const builderGearInst = makeInst(builderGearGeom, new THREE.MeshStandardMaterial({ color: 0x6b4728, roughness: 0.88 }), MAX_BUILDERS, false, false);

  const builderHammerGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 5), 0, 0.08, 0),                       // wooden handle
    partAt(new THREE.BoxGeometry(0.032, 0.034, 0.072), 0, 0.165, 0),                             // heavy iron mallet head
  ]);
  const builderHammerInst = makeInst(builderHammerGeom, new THREE.MeshStandardMaterial({ color: 0x5d646b, roughness: 0.45, metalness: 0.72 }), MAX_BUILDERS, false, false);

  // ── UNDEAD HORDE VISUALS (Horned Bone/Obsidian Armor + Glowing Necrotic Green Eyes + 3D Map Skull Warning!) ─
  const undeadArmorGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.115, 0.095, 0.088), 0, 0.115, 0),                               // jagged dark cursed rib-cuirass
    partAt(new THREE.ConeGeometry(0.036, 0.075, 5), -0.068, 0.165, 0, 0, 0, 0.65),                 // spiked left shoulder horn
    partAt(new THREE.ConeGeometry(0.036, 0.075, 5), 0.068, 0.165, 0, 0, 0, -0.65),                // spiked right shoulder horn
    partAt(new THREE.ConeGeometry(0.014, 0.062, 4), -0.032, 0.232, 0.01, -0.15, 0, 0.42),          // left skull horn
    partAt(new THREE.ConeGeometry(0.014, 0.062, 4), 0.032, 0.232, 0.01, -0.15, 0, -0.42),         // right skull horn
  ]);
  const undeadArmorInst = makeInst(undeadArmorGeom, new THREE.MeshStandardMaterial({ color: 0x241d2e, roughness: 0.56, metalness: 0.42 }), MAX_UNDEAD, false, false);

  const undeadGlowGeom = mergeUnitGeoms([
    partAt(new THREE.SphereGeometry(0.013, 5, 4), -0.015, 0.190, 0.031),                           // glowing necrotic left eye
    partAt(new THREE.SphereGeometry(0.013, 5, 4), 0.015, 0.190, 0.031),                           // glowing necrotic right eye
    partAt(new THREE.OctahedronGeometry(0.022), 0, 0.125, 0.048),                                  // cursed soul-gem on chest
  ]);
  const undeadGlowInst = makeInst(undeadGlowGeom, new THREE.MeshBasicMaterial({ color: 0x6dff9e }), MAX_UNDEAD, false, false);

  // 3D Map Skull Warning Sign & Edge Invasion Rift Beacons (clearly telegraphs Undead Invasion on the map!)
  const createInvasionSkullTexture = () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    const glow = ctx.createRadialGradient(S * 0.5, S * 0.5, 18, S * 0.5, S * 0.5, 120);
    glow.addColorStop(0, 'rgba(116, 255, 158, 0.72)');
    glow.addColorStop(0.45, 'rgba(98, 36, 138, 0.48)');
    glow.addColorStop(1, 'rgba(20, 8, 32, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.translate(S * 0.5, S * 0.5);
    // Crossed bones behind the skull
    ctx.strokeStyle = '#d4d9cf';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-66, -54); ctx.lineTo(66, 54);
    ctx.moveTo(66, -54); ctx.lineTo(-66, 54);
    ctx.stroke();
    ctx.strokeStyle = '#1c1224';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Gleaming cursed skull silhouette
    ctx.beginPath();
    ctx.moveTo(0, -68);
    ctx.bezierCurveTo(48, -68, 62, -32, 60, 4);
    ctx.bezierCurveTo(58, 28, 42, 40, 34, 46);
    ctx.lineTo(30, 74);
    ctx.lineTo(-30, 74);
    ctx.lineTo(-34, 46);
    ctx.bezierCurveTo(-42, 40, -58, 28, -60, 4);
    ctx.bezierCurveTo(-62, -32, -48, -68, 0, -68);
    ctx.closePath();
    const skGrad = ctx.createLinearGradient(0, -68, 0, 74);
    skGrad.addColorStop(0, '#f5faee');
    skGrad.addColorStop(0.65, '#d5ded0');
    skGrad.addColorStop(1, '#9ca89a');
    ctx.fillStyle = skGrad;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a0e24';
    ctx.stroke();

    // Glowing necrotic emerald eye sockets
    for (const ex of [-23, 23]) {
      ctx.beginPath();
      ctx.arc(ex, 2, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#120a1a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, 2, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6eff9e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, 2, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ebfff0';
      ctx.fill();
    }
    // Nasal cavity & teeth seams
    ctx.fillStyle = '#140b1c';
    ctx.beginPath();
    ctx.moveTo(0, 16); ctx.lineTo(-8, 34); ctx.lineTo(8, 34); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a0e24';
    ctx.lineWidth = 4.5;
    for (const tx of [-15, 0, 15]) {
      ctx.beginPath(); ctx.moveTo(tx, 52); ctx.lineTo(tx, 74); ctx.stroke();
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const invasionSkullTex = createInvasionSkullTexture();

  // 8 Clean 2D Blinking Skull Indicators positioned OUTSIDE all 4 map borders — automatically lifted just above nearby mountain peaks!
  const OUTSIDE_SKULL_SPOTS = [
    [-15.5, 9.8, -(WORLD_D * 0.5 + 2.6)], // North-West outside border (above alpine peaks!)
    [ 15.5, 9.8, -(WORLD_D * 0.5 + 2.6)], // North-East outside border (above alpine peaks!)
    [-(WORLD_W * 0.5 + 2.8), 3.4, -7.5],  // West-North outside border
    [-(WORLD_W * 0.5 + 2.8), 2.5,  8.5],  // West-South outside border
    [ (WORLD_W * 0.5 + 2.8), 3.4, -7.5],  // East-North outside border
    [ (WORLD_W * 0.5 + 2.8), 2.5,  8.5],  // East-South outside border
    [-15.5, 2.3,  (WORLD_D * 0.5 + 2.5)], // South-West outside border
    [ 15.5, 2.3,  (WORLD_D * 0.5 + 2.5)], // South-East outside border
  ];
  const edgeRiftMarkers = OUTSIDE_SKULL_SPOTS.map(([rx, minY, rz], idx) => {
    // Sample nearby border mountain ridge heights so the 2D skull ALWAYS floats cleanly just above the mountain!
    const bx = Math.max(-WORLD_W * 0.5 + 1.5, Math.min(WORLD_W * 0.5 - 1.5, rx));
    const bz = Math.max(-WORLD_D * 0.5 + 2.5, Math.min(WORLD_D * 0.5 - 1.5, rz));
    let localPeak = 0;
    for (let dx = -4; dx <= 4; dx += 2) {
      for (let dz = -4; dz <= 4; dz += 2) {
        localPeak = Math.max(localPeak, terrainHeight(
          Math.max(-WORLD_W * 0.5, Math.min(WORLD_W * 0.5, bx + dx)),
          Math.max(-WORLD_D * 0.5, Math.min(WORLD_D * 0.5, bz + dz))
        ));
      }
    }
    const ry = Math.max(minY, localPeak + 2.1);
    const skullMat = new THREE.SpriteMaterial({
      map: invasionSkullTex,
      color: 0x74ff9e,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(skullMat);
    sprite.position.set(rx, ry, rz);
    sprite.scale.set(3.2, 3.2, 1);
    sprite.visible = false;
    armyGroup.add(sprite);
    return { sprite, skullMat, baseY: ry, phase: idx * 0.45 };
  });

  // ── WAVE 3 BOSS MONSTER: SKARBRAND THE EXILED ONE (Sculpted Articulated Warhammer Daemon Titan!) ─
  function buildSkarbrandBoss() {
    const root = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x6e1316, roughness: 0.62, metalness: 0.14 });
    const darkFleshMat = new THREE.MeshStandardMaterial({ color: 0x3b0c10, roughness: 0.68, metalness: 0.12 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd69f3a, roughness: 0.28, metalness: 0.86 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x1d181a, roughness: 0.44, metalness: 0.35 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x151114, roughness: 0.88 });
    const wingMemMat = new THREE.MeshStandardMaterial({ color: 0x4a0c11, emissive: 0x260405, emissiveIntensity: 0.45, roughness: 0.72, side: THREE.DoubleSide });
    const axeIronMat = new THREE.MeshStandardMaterial({ color: 0x362d2b, roughness: 0.38, metalness: 0.78 });
    const axeFireMat = new THREE.MeshStandardMaterial({ color: 0xffa638, emissive: 0xff4c0a, emissiveIntensity: 2.1, roughness: 0.25 });
    const redEyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b14 });
    const cyanEyeMat = new THREE.MeshBasicMaterial({ color: 0x52ebff });

    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    // 1) Digitigrade Beast Legs & Brass-Shod Cloven Hooves
    for (const sgn of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.38, 8), darkFleshMat);
      thigh.position.set(sgn * 0.20, 0.48, 0.04);
      thigh.rotation.x = 0.28;
      thigh.castShadow = true;
      bodyPivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.08, 0.36, 7), skinMat);
      shin.position.set(sgn * 0.21, 0.22, -0.04);
      shin.rotation.x = -0.32;
      bodyPivot.add(shin);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.115, 0.11, 7), hornMat);
      hoof.position.set(sgn * 0.21, 0.055, 0.03);
      bodyPivot.add(hoof);
      const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.11), brassMat);
      shinGuard.position.set(sgn * 0.21, 0.24, 0.02);
      bodyPivot.add(shinGuard);
    }

    // 2) Hulking Muscular Daemon Torso, Brass Rib-Harness & Iconic Golden Skull Belt Buckle!
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.32, 9), skinMat);
    waist.position.set(0, 0.72, 0);
    waist.castShadow = true;
    bodyPivot.add(waist);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.48, 9), skinMat);
    chest.position.set(0, 1.06, 0.04);
    chest.scale.set(1.18, 1.0, 0.88);
    chest.castShadow = true;
    bodyPivot.add(chest);

    // Ornate Brass Khorne Chest Filigree & Giant Horned Skull Belt Buckle
    const beltBand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 10), brassMat);
    beltBand.position.set(0, 0.66, 0.01);
    bodyPivot.add(beltBand);
    const beltSkull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 6), brassMat);
    beltSkull.position.set(0, 0.66, 0.24);
    beltSkull.scale.set(1.0, 1.15, 0.72);
    bodyPivot.add(beltSkull);
    for (const sgn of [-1, 1]) {
      const bHorn = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.14, 5), brassMat);
      bHorn.position.set(sgn * 0.13, 0.72, 0.23);
      bHorn.rotation.z = -sgn * 0.65;
      bodyPivot.add(bHorn);
      const ribStrap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.042, 0.36), brassMat);
      ribStrap.position.set(sgn * 0.16, 0.96, 0.06);
      ribStrap.rotation.z = sgn * 0.32;
      bodyPivot.add(ribStrap);
    }
    const breastPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.12), brassMat);
    breastPlate.position.set(0, 1.14, 0.26);
    bodyPivot.add(breastPlate);

    // Ornate Golden-Brass Skull/Lion Shoulder Pauldron (Left) & Dark Spiked Collar (Right)
    const leftPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), brassMat);
    leftPauldron.position.set(-0.42, 1.24, 0.04);
    leftPauldron.scale.set(1.15, 0.92, 1.10);
    bodyPivot.add(leftPauldron);
    const rightPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), darkFleshMat);
    rightPauldron.position.set(0.42, 1.24, 0.04);
    bodyPivot.add(rightPauldron);
    const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.048, 6, 12), brassMat);
    collarRim.rotation.x = Math.PI / 2 - 0.15;
    collarRim.position.set(0, 1.32, 0.04);
    bodyPivot.add(collarRim);

    // 3) Ferocious Horned Daemon Head, Asymmetric Red & Cyan Glowing Eyes & Long Braided Dark Mane!
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.26), skinMat);
    head.position.set(0, 1.46, 0.10);
    bodyPivot.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.22), darkFleshMat);
    jaw.position.set(0, 1.35, 0.14);
    bodyPivot.add(jaw);
    // Signature asymmetric glowing eyes (fiery crimson left + ice-cyan scarred right!)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), redEyeMat);
    eyeL.position.set(-0.065, 1.48, 0.23);
    bodyPivot.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), cyanEyeMat);
    eyeR.position.set(0.065, 1.48, 0.23);
    bodyPivot.add(eyeR);
    // Cyan spirit-rage wisp trailing off his scarred cyan eye (just like Skarbrand's artwork!)
    const eyeWisp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.28, 5), cyanEyeMat);
    eyeWisp.position.set(0.18, 1.52, 0.18);
    eyeWisp.rotation.z = -1.25;
    eyeWisp.rotation.y = -0.35;
    bodyPivot.add(eyeWisp);

    // Massive upward-swept Daemon Horns (left horn tall & intact, right horn broken/scarred!)
    const hornL1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.44, 6), hornMat);
    hornL1.position.set(-0.16, 1.72, 0.06);
    hornL1.rotation.set(-0.22, 0, 0.42);
    bodyPivot.add(hornL1);
    const hornL2 = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.26, 6), hornMat);
    hornL2.position.set(-0.22, 1.96, 0.02);
    hornL2.rotation.set(-0.10, 0, -0.18);
    bodyPivot.add(hornL2);
    const hornR1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 6), hornMat); // iconic snapped horn!
    hornR1.position.set(0.15, 1.66, 0.06);
    hornR1.rotation.set(-0.20, 0, -0.45);
    bodyPivot.add(hornR1);

    // Long thick dark braided beard/mane draping down Skarbrand's chest
    const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.022, 0.56, 6), hairMat);
    braid.position.set(0.05, 1.06, 0.29);
    braid.rotation.set(0.14, 0, 0.22);
    bodyPivot.add(braid);

    // 4) Huge Tattered Shredded Daemon Wings (Articulated Left & Right Wing Pivots!)
    const makeTatteredWing = sgn => {
      const wg = new THREE.Group();
      wg.position.set(sgn * 0.24, 1.24, -0.18);
      // Heavy obsidian skeletal wing-arm rising & sweeping wide
      const bone1 = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.064, 0.92, 6), hornMat);
      bone1.position.set(sgn * 0.38, 0.36, -0.14);
      bone1.rotation.set(-0.22, 0, -sgn * 0.85);
      wg.add(bone1);
      const bone2 = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.048, 0.98, 6), hornMat);
      bone2.position.set(sgn * 1.05, 0.72, -0.28);
      bone2.rotation.set(-0.18, 0, -sgn * 1.18);
      wg.add(bone2);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.22, 5), hornMat);
      claw.position.set(sgn * 0.74, 0.76, -0.18);
      claw.rotation.z = -sgn * 0.25;
      wg.add(claw);
      // Shredded ragged dark-crimson wing membrane segments (torn gaps just like Skarbrand's ruined wings!)
      for (const [fx, fy, fw, fh, rz] of [
        [0.44, 0.14, 0.54, 0.68, -0.28],
        [0.92, 0.36, 0.62, 0.72, -0.45],
        [1.36, 0.58, 0.44, 0.46, -0.62],
      ]) {
        const mem = new THREE.Mesh(new THREE.ConeGeometry(fw * 0.55, fh, 3), wingMemMat);
        mem.position.set(sgn * fx, fy, -0.22);
        mem.rotation.set(0.18, sgn * 0.22, sgn * rz + Math.PI);
        mem.scale.set(1.2, 1.0, 0.12);
        wg.add(mem);
      }
      bodyPivot.add(wg);
      return wg;
    };
    const leftWing = makeTatteredWing(-1);
    const rightWing = makeTatteredWing(1);

    // 5) Twin Articulated Arms Wielding Legendary Blazing Khorne Great-Axes (Slaughter & Carnage!)
    const makeAxeArm = sgn => {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * 0.46, 1.18, 0.04);
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.44, 7), darkFleshMat);
      upperArm.position.set(sgn * 0.06, -0.18, 0.06);
      upperArm.rotation.x = -0.35;
      pivot.add(upperArm);
      const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.28, 7), brassMat);
      bracer.position.set(sgn * 0.08, -0.34, 0.24);
      bracer.rotation.x = Math.PI * 0.38;
      pivot.add(bracer);

      // Massive Daemon Great-Axe (brass-bound haft + jagged notched iron head + glowing molten-orange serrated edge!)
      const axeGroup = new THREE.Group();
      axeGroup.position.set(sgn * 0.08, -0.40, 0.36);
      axeGroup.rotation.x = 0.25;
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 1.18, 6), hornMat);
      haft.position.y = 0.32;
      axeGroup.add(haft);
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.065), brassMat);
      pommel.position.y = -0.28;
      axeGroup.add(pommel);
      const axeCollar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), brassMat);
      axeCollar.position.set(0, 0.78, 0);
      axeGroup.add(axeCollar);
      const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.46, 0.34), axeIronMat);
      axeBlade.position.set(0, 0.78, 0.18);
      axeGroup.add(axeBlade);
      // Glowing molten serrated axe cutting edge!
      const fireEdge = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.50, 0.11), axeFireMat);
      fireEdge.position.set(0, 0.78, 0.35);
      axeGroup.add(fireEdge);
      const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.24, 4), axeFireMat);
      topSpike.position.set(0, 1.06, 0.16);
      topSpike.rotation.x = 0.35;
      axeGroup.add(topSpike);
      pivot.add(axeGroup);
      bodyPivot.add(pivot);
      return pivot;
    };
    const leftArm = makeAxeArm(-1);
    const rightArm = makeAxeArm(1);

    // 6) Fiery Crimson-Orange Khorne Boss Ground Aura Ring
    const bossRing = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.86, 28),
      new THREE.MeshBasicMaterial({ color: 0xff4514, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })
    );
    bossRing.rotation.x = -Math.PI / 2;
    bossRing.position.y = 0.05;
    root.add(bossRing);

    // Subtle floating blazing Khorne boss crown/skull tag overhead so Skarbrand is instantly spotted!
    const bossTag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: invasionSkullTex, color: 0xff6b38, transparent: true, opacity: 0.92, depthWrite: false })
    );
    bossTag.position.set(0, 2.55, 0);
    bossTag.scale.set(0.92, 0.92, 1);
    root.add(bossTag);

    root.visible = false;
    armyGroup.add(root);
    return { root, bodyPivot, leftWing, rightWing, leftArm, rightArm, bossRing, bossTag };
  }
  const skarbrandModel = buildSkarbrandBoss();

  // ── 4 SUMMONED RADIANT HEROES (Summoned at Central Bridge when Undead reach 95% Control!) ──
  const heroStarTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 44);
    g.addColorStop(0, 'rgba(255, 250, 210, 1)');
    g.addColorStop(0.45, 'rgba(255, 216, 86, 0.85)');
    g.addColorStop(1, 'rgba(255, 190, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(48, 48, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff9d6';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? 30 : 11;
      const px = 48 + Math.cos(ang) * rad;
      const py = 48 + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  })();

  function buildLegendHeroModel(fac) {
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    const plateMat = new THREE.MeshStandardMaterial({ color: 0xe6ecf4, roughness: 0.24, metalness: 0.78 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4c84a, emissive: 0x5c3c00, emissiveIntensity: 0.35, roughness: 0.24, metalness: 0.85 });
    const capeMat = new THREE.MeshStandardMaterial({ color: fac.primary, roughness: 0.65, metalness: 0.10, side: THREE.DoubleSide });
    const wingMat = new THREE.MeshStandardMaterial({
      color: fac.magic, emissive: 0xffdf78, emissiveIntensity: 1.15,
      transparent: true, opacity: 0.72, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xfff8d8, emissive: fac.magic, emissiveIntensity: 1.55, roughness: 0.14, metalness: 0.72,
    });

    // Armored Paladin Boots & Greaves
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.44, 8), plateMat);
      leg.position.set(s * 0.11, 0.22, 0);
      bodyPivot.add(leg);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), goldMat);
      knee.position.set(s * 0.11, 0.27, 0.05);
      bodyPivot.add(knee);
    }

    // Heroic Sculpted Cuirass, Gold Pauldrons & Billowing Faction Cape
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.46, 10), plateMat);
    torso.position.set(0, 0.64, 0);
    bodyPivot.add(torso);
    const chestCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
    chestCrest.scale.set(1.0, 1.35, 0.55);
    chestCrest.position.set(0, 0.68, 0.16);
    bodyPivot.add(chestCrest);

    for (const s of [-1, 1]) {
      const pauld = new THREE.Mesh(new THREE.SphereGeometry(0.145, 9, 7), goldMat);
      pauld.scale.set(1.18, 0.85, 1.05);
      pauld.position.set(s * 0.25, 0.82, 0);
      bodyPivot.add(pauld);
    }

    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.68, 0.04), capeMat);
    cape.position.set(0, 0.50, -0.19);
    cape.rotation.x = 0.20;
    bodyPivot.add(cape);

    // Winged Radiant Paladin Helm + Aureole Halo
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), plateMat);
    helm.position.set(0, 1.00, 0.02);
    bodyPivot.add(helm);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.022, 6, 16), goldMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 1.07, 0.02);
    bodyPivot.add(crown);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.018, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe87a, transparent: true, opacity: 0.88 })
    );
    halo.position.set(0, 1.12, -0.10);
    bodyPivot.add(halo);

    // Twin Radiant Celestial Wings (so all 4 Heroes are unmistakably visible across the entire map!)
    const makeWing = side => {
      const piv = new THREE.Group();
      piv.position.set(side * 0.14, 0.84, -0.15);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.025), wingMat);
      upper.position.set(side * 0.34, 0.18, -0.05);
      upper.rotation.z = side * 0.42;
      piv.add(upper);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.20, 0.022), wingMat);
      lower.position.set(side * 0.24, -0.04, -0.04);
      lower.rotation.z = side * 0.15;
      piv.add(lower);
      bodyPivot.add(piv);
      return piv;
    };
    const leftWing = makeWing(-1);
    const rightWing = makeWing(1);

    // Articulated Right Sword Arm + Giant Glowing Radiant Runeblade Greatsword
    const swordArm = new THREE.Group();
    swordArm.position.set(0.27, 0.78, 0.04);
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.32, 7), plateMat);
    armMesh.position.set(0, -0.14, 0.04);
    swordArm.add(armMesh);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.06), goldMat);
    guard.position.set(0, -0.26, 0.16);
    swordArm.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.028, 1.05), bladeMat);
    blade.position.set(0, -0.26, 0.68);
    swordArm.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 4), bladeMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, -0.26, 1.30);
    swordArm.add(tip);
    bodyPivot.add(swordArm);

    // Left Shield Arm + Radiant Tower Shield
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.045), capeMat);
    shield.position.set(-0.27, 0.64, 0.15);
    shield.rotation.y = -0.35;
    bodyPivot.add(shield);
    const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.45, 0.03), goldMat);
    shieldRim.position.set(-0.27, 0.64, 0.13);
    shieldRim.rotation.y = -0.35;
    bodyPivot.add(shieldRim);

    // Pulsing Radiant Ground Aura Ring + Floating Golden Hero Star Beacon
    const heroRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.64, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    heroRing.rotation.x = -Math.PI / 2;
    heroRing.position.y = 0.055;
    root.add(heroRing);

    const heroTag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: heroStarTex, color: 0xfff0a8, transparent: true, opacity: 0.95, depthWrite: false })
    );
    heroTag.position.set(0, 1.72, 0);
    heroTag.scale.set(0.76, 0.76, 1);
    root.add(heroTag);

    root.visible = false;
    armyGroup.add(root);
    return { root, bodyPivot, leftWing, rightWing, swordArm, heroRing, heroTag };
  }
  const heroModels = FACTIONS.map(fac => buildLegendHeroModel(fac));

  // Fortification #1: Spiked Medieval Timber Palisade Barricade (7 sharpened stakes + cross-logs + 4 forward anti-cavalry spikes!)
  const barricadeWoodGeom = mergeUnitGeoms([
    // Vertical sharpened palisade wall logs
    ...[-0.54, -0.36, -0.18, 0, 0.18, 0.36, 0.54].flatMap(px => [
      partAt(new THREE.CylinderGeometry(0.055, 0.064, 0.44, 6), px, 0.22, 0),
      partAt(new THREE.ConeGeometry(0.055, 0.14, 6), px, 0.51, 0),
    ]),
    // Twin horizontal timber bracing logs
    partAt(new THREE.BoxGeometry(1.26, 0.065, 0.13), 0, 0.16, 0),
    partAt(new THREE.BoxGeometry(1.26, 0.065, 0.13), 0, 0.35, 0),
    // 4 angled forward anti-cavalry spikes (chevaux-de-frise!)
    ...[-0.42, -0.14, 0.14, 0.42].flatMap(px => [
      partAt(new THREE.CylinderGeometry(0.020, 0.030, 0.56, 5), px, 0.24, 0.22, 0.92, 0, 0),
      partAt(new THREE.ConeGeometry(0.022, 0.10, 5), px, 0.42, 0.46, 0.92, 0, 0),
    ]),
  ]);
  const barricadeWoodInst = makeInst(barricadeWoodGeom, new THREE.MeshStandardMaterial({ color: 0x704e2e, roughness: 0.90 }), MAX_BARRICADES, true, false);

  const barricadeTrimGeom = mergeUnitGeoms([
    // Twin faction-colored armored mantlet shields bolted to the barricade front
    partAt(new THREE.BoxGeometry(0.28, 0.24, 0.036), -0.30, 0.26, 0.085),
    partAt(new THREE.BoxGeometry(0.28, 0.24, 0.036), 0.30, 0.26, 0.085),
  ]);
  const barricadeTrimInst = makeInst(barricadeTrimGeom, stdWhite(0.68), MAX_BARRICADES, false, true);

  // Fortification #2: Elevated Medieval Timber Archer Watchtower (platform at y=0.90 where 2 archers climb & shoot!)
  const towerWoodGeom = mergeUnitGeoms([
    // 4 heavy corner timber stanchion posts
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), -0.34, 0.59, -0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), 0.34, 0.59, -0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), -0.34, 0.59, 0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), 0.34, 0.59, 0.34),
    // Diagonal X-bracing struts on all 4 lower faces
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, 0.34, 0, 0, 0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, 0.34, 0, 0, -0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, -0.34, 0, 0, 0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, -0.34, 0, 0, -0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0.34, 0.45, 0, 0.72, 0, 0),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), -0.34, 0.45, 0, -0.72, 0, 0),
    // Elevated wooden battlement floor deck (y = 0.88)
    partAt(new THREE.BoxGeometry(0.92, 0.085, 0.92), 0, 0.88, 0),
    // 4-sided timber parapet walls protecting garrisoned archers
    partAt(new THREE.BoxGeometry(0.94, 0.24, 0.07), 0, 1.04, 0.42),
    partAt(new THREE.BoxGeometry(0.94, 0.24, 0.07), 0, 1.04, -0.42),
    partAt(new THREE.BoxGeometry(0.07, 0.24, 0.86), 0.42, 1.04, 0),
    partAt(new THREE.BoxGeometry(0.07, 0.24, 0.86), -0.42, 1.04, 0),
    // Wooden climbing ladder leaning up the rear face (-Z)
    partAt(new THREE.BoxGeometry(0.032, 0.98, 0.032), -0.12, 0.45, -0.46, 0.18, 0, 0),
    partAt(new THREE.BoxGeometry(0.032, 0.98, 0.032), 0.12, 0.45, -0.46, 0.18, 0, 0),
    ...[0.16, 0.34, 0.52, 0.70].map(ry => partAt(new THREE.BoxGeometry(0.24, 0.024, 0.028), 0, ry, -0.50 + ry * 0.16)),
  ]);
  const towerWoodInst = makeInst(towerWoodGeom, new THREE.MeshStandardMaterial({ color: 0x7b5633, roughness: 0.88 }), MAX_TOWERS, true, false);

  const towerTrimGeom = mergeUnitGeoms([
    // Faction-colored heraldic parapet banners & corner crenellation shields on all 4 sides
    partAt(new THREE.BoxGeometry(0.46, 0.26, 0.038), 0, 0.96, 0.465),
    partAt(new THREE.BoxGeometry(0.46, 0.26, 0.038), 0, 0.96, -0.465),
    partAt(new THREE.BoxGeometry(0.038, 0.26, 0.46), 0.465, 0.96, 0),
    partAt(new THREE.BoxGeometry(0.038, 0.26, 0.46), -0.465, 0.96, 0),
  ]);
  const towerTrimInst = makeInst(towerTrimGeom, stdWhite(0.66), MAX_TOWERS, false, true);

  // Detailed Armored Siege Battering Ram (4 spoked wheels + timber A-frame roof shed + side shields + spiked iron ram head!)
  const ramHullGeom = mergeUnitGeoms([
    // Heavy timber wheeled base frame
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.62), 0, 0.06, 0),
    // 4 heavy wooden siege wheels
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, -0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), 0.19, 0.085, -0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, 0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), 0.19, 0.085, 0.20, 0, 0, Math.PI / 2),
    // Twin sloped armored timber mantlet roof panels + ridge beam
    partAt(new THREE.BoxGeometry(0.27, 0.045, 0.66), -0.11, 0.24, 0, 0, 0, 0.66),
    partAt(new THREE.BoxGeometry(0.27, 0.045, 0.66), 0.11, 0.24, 0, 0, 0, -0.66),
    partAt(new THREE.BoxGeometry(0.07, 0.06, 0.68), 0, 0.34, 0),
    // 4 vertical corner timber support posts
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), -0.16, 0.16, -0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), 0.16, 0.16, -0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), -0.16, 0.16, 0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), 0.16, 0.16, 0.26),
  ]);
  const ramHullInst = makeInst(ramHullGeom, new THREE.MeshStandardMaterial({ color: 0x735232, roughness: 0.88 }), MAX_SIEGE, true, false);

  const ramTrimGeom = mergeUnitGeoms([
    // Faction-colored armored side mantlet shields & iron roof bands
    partAt(new THREE.BoxGeometry(0.03, 0.14, 0.50), -0.185, 0.18, 0),
    partAt(new THREE.BoxGeometry(0.03, 0.14, 0.50), 0.185, 0.18, 0),
    partAt(new THREE.BoxGeometry(0.32, 0.03, 0.06), 0, 0.35, -0.18),
    partAt(new THREE.BoxGeometry(0.32, 0.03, 0.06), 0, 0.35, 0.18),
  ]);
  const ramTrimInst = makeInst(ramTrimGeom, stdWhite(0.68), MAX_SIEGE, false, true);

  const ramBeamGeom = mergeUnitGeoms([
    // Heavy iron-bound timber ram beam + flared horned bronze/iron ram head!
    partAt(new THREE.CylinderGeometry(0.038, 0.044, 0.68, 7), 0, 0, 0, Math.PI / 2, 0, 0),
    partAt(new THREE.ConeGeometry(0.072, 0.14, 6), 0, 0, 0.38, Math.PI / 2, 0, 0),
    partAt(new THREE.BoxGeometry(0.11, 0.07, 0.08), 0, 0.01, 0.30),
  ]);
  const ramBeamInst = makeInst(ramBeamGeom, new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.38, metalness: 0.76 }), MAX_SIEGE);

  // Detailed Medieval Catapult / Onager (4 spoked wheels + sled chassis + twin A-frame stanchions + torsion crossbar + cupped throwing arm!)
  const catBaseGeom = mergeUnitGeoms([
    // Twin heavy side sled rails & crossbeams
    partAt(new THREE.BoxGeometry(0.06, 0.07, 0.58), -0.14, 0.08, 0),
    partAt(new THREE.BoxGeometry(0.06, 0.07, 0.58), 0.14, 0.08, 0),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.08), 0, 0.08, -0.22),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.08), 0, 0.08, 0.22),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.09), 0, 0.08, 0.00),
    // 4 sturdy wooden wheels
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, -0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), 0.19, 0.085, -0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, 0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), 0.19, 0.085, 0.19, 0, 0, Math.PI / 2),
    // Twin upright A-frame torsion stanchions + angled braces + top crossbar!
    partAt(new THREE.BoxGeometry(0.05, 0.30, 0.055), -0.14, 0.24, 0.06),
    partAt(new THREE.BoxGeometry(0.05, 0.30, 0.055), 0.14, 0.24, 0.06),
    partAt(new THREE.BoxGeometry(0.045, 0.32, 0.045), -0.14, 0.22, -0.07, 0.45, 0, 0),
    partAt(new THREE.BoxGeometry(0.045, 0.32, 0.045), 0.14, 0.22, -0.07, 0.45, 0, 0),
    partAt(new THREE.BoxGeometry(0.36, 0.055, 0.065), 0, 0.38, 0.06),
    // Coiled torsion rope drum
    partAt(new THREE.CylinderGeometry(0.042, 0.042, 0.30, 8), 0, 0.13, 0.02, 0, 0, Math.PI / 2),
  ]);
  const catBaseInst = makeInst(catBaseGeom, new THREE.MeshStandardMaterial({ color: 0x7b5835, roughness: 0.88 }), MAX_SIEGE, true, false);

  const catTrimGeom = mergeUnitGeoms([
    // Faction-colored heraldic side shield plates on the catapult sled
    partAt(new THREE.BoxGeometry(0.025, 0.11, 0.26), -0.178, 0.16, -0.02),
    partAt(new THREE.BoxGeometry(0.025, 0.11, 0.26), 0.178, 0.16, -0.02),
  ]);
  const catTrimInst = makeInst(catTrimGeom, stdWhite(0.68), MAX_SIEGE, false, true);

  const catArmGeom = mergeUnitGeoms([
    // Long timber throwing beam + hollowed iron-banded stone cup/spoon + loaded stone!
    partAt(new THREE.BoxGeometry(0.044, 0.44, 0.044), 0, 0.20, 0),
    partAt(new THREE.CylinderGeometry(0.082, 0.055, 0.065, 8), 0, 0.42, -0.03, 0.35, 0, 0),
    partAt(new THREE.DodecahedronGeometry(0.058, 0), 0, 0.44, -0.04),
  ]);
  const catArmInst = makeInst(catArmGeom, new THREE.MeshStandardMaterial({ color: 0x624428, roughness: 0.85 }), MAX_SIEGE);

  // Squad Regiment Banners with each team's official emblem icon (4 textured instanced batches = 4 draw calls!)
  const banPoleGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.012, 0.015, 0.68, 5), 0, 0.34, 0),
    partAt(new THREE.OctahedronGeometry(0.028), 0, 0.70, 0),
  ]);
  const banPoleInst = makeInst(banPoleGeom, new THREE.MeshStandardMaterial({ color: 0x6b4b28, roughness: 0.78, metalness: 0.25 }), MAX_BANNERS);
  const banFlagGeom = new THREE.BoxGeometry(0.32, 0.20, 0.014);
  banFlagGeom.translate(0.16, 0, 0);
  const banFlagInsts = [0, 1, 2, 3, 4].map(tid => {
    const flagMat = new THREE.MeshStandardMaterial({
      map: createTeamFlagTexture(tid),
      roughness: 0.66,
      metalness: 0.06,
    });
    return makeInst(banFlagGeom, flagMat, Math.ceil(MAX_BANNERS / 4) + 8, false, false);
  });

  // Live Projectiles, Glowing Fireball Shells, Curved Steel Sword-Slash Arcs & Combat Explosions
  const arrowGeom = new THREE.CylinderGeometry(0.008, 0.012, 0.24, 4);
  arrowGeom.rotateX(Math.PI / 2);
  const arrowInst = makeInst(arrowGeom, new THREE.MeshBasicMaterial({ color: 0xf7e39c }), MAX_ARROWS);
  const magicBoltInst = makeInst(new THREE.OctahedronGeometry(0.095, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MAGIC, false, true);
  // Molten meteoric catapult pitch-rock core + outer roaring translucent flame shell!
  const boulderInst = makeInst(
    new THREE.DodecahedronGeometry(0.105, 1),
    new THREE.MeshStandardMaterial({ color: 0x3b180c, emissive: 0xff5a12, emissiveIntensity: 1.85, roughness: 0.65 }),
    MAX_BOULDERS
  );
  const fireballAuraGeom = mergeUnitGeoms([
    partAt(new THREE.IcosahedronGeometry(0.155, 1), 0, 0, 0),
    partAt(new THREE.ConeGeometry(0.12, 0.34, 6), 0, 0, -0.17, -Math.PI / 2, 0, 0), // streaking flame wake behind flying fireball/comet!
  ]);
  const fireballAuraInst = makeInst(
    fireballAuraGeom,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.56, depthWrite: false }),
    MAX_BOULDERS + MAX_MAGIC,
    false,
    true
  );
  // Visible gleaming curved steel sword-slash swoosh arc during melee cleaves!
  const slashArcGeom = new THREE.TorusGeometry(0.165, 0.017, 4, 10, Math.PI * 0.78);
  slashArcGeom.rotateX(Math.PI * 0.38);
  slashArcGeom.rotateZ(-Math.PI * 0.38);
  const slashArcInst = makeInst(
    slashArcGeom,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }),
    MAX_SLASH,
    false,
    true
  );
  const fxInst = makeInst(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.84, depthWrite: false }), MAX_FX, false, true);

  // ── BUILD 56 GRAND COHESIVE REGIMENTS (14 PER FACTION) ─────────────────────
  // Balanced medieval proportions: heavy melee core (swordsmen, knights, cavalry),
  // strong archer volleys, 1 ultra-rare powerful Archmage per faction (only 4 total!),
  // 1 battering ram pushed by melee troops, 3 catapults per artillery battery, & 5 builders!
  const squads = [];
  const units = [];
  const corpses = []; // Fallen bodies remain visibly on the map for 30.0 full seconds!
  const projectiles = [];
  const effects = [];

  const packMembers = spec => {
    const out = [];
    for (const [type, count] of spec) {
      for (let k = 0; k < count; k++) out.push(type);
    }
    return out;
  };

  const SQUAD_TEMPLATES = [
    { role: 'vanguard', theater: 'outer-bank', members: packMembers([['swordsman', 20], ['knight', 6]]) },
    { role: 'vanguard', theater: 'mid-bank', members: packMembers([['swordsman', 20], ['knight', 6]]) },
    { role: 'vanguard', theater: 'flank-bridge', members: packMembers([['swordsman', 18], ['knight', 6]]) },
    // Elite Royal Honor Guard escorting this faction's single rare legendary Archmage!
    { role: 'heavy', theater: 'outer-bank', members: packMembers([['knight', 14], ['swordsman', 8], ['mage', 1]]) },
    { role: 'heavy', theater: 'flank-bridge', members: packMembers([['knight', 14], ['swordsman', 8]]) },
    { role: 'patrol', theater: 'mid-bank', members: packMembers([['swordsman', 22], ['knight', 4]]) },
    { role: 'ranged', theater: 'outer-bank', members: packMembers([['archer', 18], ['swordsman', 4]]) },
    { role: 'ranged', theater: 'mid-bank', members: packMembers([['archer', 18], ['swordsman', 4]]) },
    { role: 'ranged', theater: 'flank-bridge', members: packMembers([['archer', 17], ['swordsman', 4]]) },
    { role: 'cavalry', theater: 'outer-bank', members: packMembers([['cavalry', 18]]) },
    { role: 'outrider', theater: 'deep-raider', members: packMembers([['cavalry', 17]]) },
    // Royal Sovereign Escort: 1 Immortal Crowned King on a White Armored Stallion flanked by 10 Knight Cavalries!
    { role: 'king', theater: 'mid-bank', members: packMembers([['king', 1], ['cavalry', 10]]) },
    // 1 Siege Battering Ram pushed & escorted closely by 18 melee troops!
    { role: 'siege', theater: 'mid-bank', members: packMembers([['siege', 1], ['swordsman', 14], ['knight', 4]]) },
    // 3 Catapults per battery guarded by a melee & archer screen!
    { role: 'catapult', theater: 'flank-bridge', members: packMembers([['catapult', 3], ['swordsman', 10], ['archer', 2]]) },
    // Combat Engineer Company: 5 Builders + 10 Swordsmen escort building frontier barricades & archer watchtowers!
    { role: 'engineer', theater: 'mid-bank', members: packMembers([['builder', 5], ['swordsman', 10]]) },
  ];

  // Live Player/Faction Frontier Fortifications (Barricades & Archer Watchtowers)
  const structures = [];
  const facBuildCd = [2.5, 4.0, 5.5, 7.0]; // staggered initial fortification starts!
  const MAX_FAC_BARRICADES = 6;
  const MAX_FAC_TOWERS = 3;

  // Well-spaced bank-locked patrol sectors across EVERY corner of West & East banks so the 20 Undead hordes
  // spread evenly across the entire realm during the 2-Minute Undead Reign & Heroes phase (ZERO bridge traffic jams!)
  const UNDEAD_REIGN_WEST = [
    [-25.5, -11.5], [-18.5, -12.8], [-9.2, -12.2], [-24.5, -4.5], [-16.8, -2.5], [-7.5, -4.2],
    [-25.8, 3.5], [-24.2, 12.5], [-18.0, 16.5], [-9.2, 16.2], [-14.2, 3.2], [-8.2, 7.5],
  ];
  const UNDEAD_REIGN_EAST = [
    [25.2, -10.8], [18.8, -12.6], [9.5, -12.0], [24.4, -2.8], [17.5, 1.2], [8.5, -4.0],
    [24.5, 5.5], [22.8, 13.2], [16.8, 16.8], [9.2, 16.4], [13.8, 4.8], [8.2, 8.5],
  ];
  const pickReignPatrolPoint = sq => {
    const bank = sq.reignBank || (sq.x < riverCenterX(sq.z) ? -1 : 1);
    const pool = bank < 0 ? UNDEAD_REIGN_WEST : UNDEAD_REIGN_EAST;
    const step = (sq.reignStep || 0);
    sq.reignStep = step + 1;
    // Rotate cleanly through distinct non-bridge sectors on this squad's own side of the river!
    const idx = ((sq.reignSlot || 0) + step * 3) % pool.length;
    const pt = pool[idx];
    return [pt[0] + (aRand() - 0.5) * 2.2, pt[1] + (aRand() - 0.5) * 2.2];
  };

  // Compute the live anchor point of a faction's main army so its King sticks closely with his own troops!
  const getFactionArmyAnchor = (teamId, nearBridge = false) => {
    let sx = 0, sz = 0, cnt = 0;
    let fallbackX = 0, fallbackZ = 0, fallbackCnt = 0;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.team !== teamId || s.role === 'king' || s.role === 'hero' || s.role === 'engineer') continue;
      let aCnt = 0;
      for (let m = 0; m < s.members.length; m++) {
        if (s.members[m].alive && !s.members[m].insideVenue) aCnt++;
      }
      if (aCnt === 0) continue;
      fallbackX += s.x * aCnt;
      fallbackZ += s.z * aCnt;
      fallbackCnt += aCnt;
      if (!nearBridge || distToCenterBridge(s.x, s.z) <= BRIDGE_DEFENSE_RADIUS + 2.0) {
        sx += s.x * aCnt;
        sz += s.z * aCnt;
        cnt += aCnt;
      }
    }
    if (cnt > 0) return [sx / cnt, sz / cnt];
    if (nearBridge) {
      const bZones = BRIDGE_LAST_STAND_ZONES[teamId] || [[0, BRIDGE_Z]];
      return [bZones[0][0], bZones[0][1]];
    }
    if (fallbackCnt > 0) return [fallbackX / fallbackCnt, fallbackZ / fallbackCnt];
    const v = FACTIONS[teamId].venue;
    return [v.x, v.z];
  };

  const pickSquadGoal = (faction, squad) => {
    // 4 Summoned Unkillable Radiant Heroes:
    // Each Hero focuses STRICTLY on their OWN default starting territory (hunting Undead there & reclaiming every cell of their own color first),
    // and only helps slay remaining Undead elsewhere once their own homeland is 100% purified (never claiming another house's color!).
    if (squad.role === 'hero') {
      const heroU = squad.members[0];
      const hx = heroU ? heroU.x : squad.x;
      const hz = heroU ? heroU.z : squad.z;
      const myVenue = FACTIONS[squad.team].venue;

      // 1) Hunt any Undead (or Skarbrand) currently inside THIS Hero's own default homeland territory!
      let bestHomeU = null;
      let bestHomeD = 1e9;
      for (let i = 0; i < units.length; i++) {
        const o = units[i];
        if (!o.alive || o.team !== 4) continue;
        if (territory?.getInitialOwnerAt?.(o.x, o.z) !== squad.team) continue;
        const d = Math.hypot(o.x - hx, o.z - hz) - (o.type === 'skarbrand' ? 6 : 0);
        if (d < bestHomeD) {
          bestHomeD = d;
          bestHomeU = o;
        }
      }
      if (bestHomeU) return [bestHomeU.x, bestHomeU.z];

      // 2) Reclaim ALL remaining blighted cells & Event Venue in THIS Hero's own default homeland!
      const blightPt = territory?.pickBlightTarget?.(squad.team, hx, hz);
      if (blightPt) return blightPt;

      // 3) Once THIS Hero's own homeland is 100% restored, assist in hunting any leftover Undead/Skarbrand elsewhere!
      let bestAnyU = null;
      let bestAnyD = 1e9;
      for (let i = 0; i < units.length; i++) {
        const o = units[i];
        if (!o.alive || o.team !== 4) continue;
        const d = Math.hypot(o.x - hx, o.z - hz) - (o.type === 'skarbrand' ? 8 : 0);
        if (d < bestAnyD) {
          bestAnyD = d;
          bestAnyU = o;
        }
      }
      if (bestAnyU) return [bestAnyU.x, bestAnyU.z];
      return [myVenue.x, myVenue.z];
    }

    // Undead hordes & Skarbrand:
    // - During 'heroes' phase: patrol & occupy their blighted territories (they do NOT chase or focus the 4 Heroes!)
    // - Once ALL living armies are dead (only Undead + Dragon left!): aggressively spread out to claim ALL remaining non-Undead land to 95%!
    // - Wave 2: half besiege the Central Bridge while half conquer abandoned outer lands!
    // - Wave 3: smash the Central Bridge defenders until dead, then fan out to conquer up to 95% map control!
    if (squad.team === 4) {
      if (isHeroesReclaiming()) {
        // Patrol spread-out sectors on their own bank so Undead occupy the entire map without piling onto bridges!
        return pickReignPatrolPoint(squad);
      }
      if (isUndeadReign()) {
        // During the 2-minute Undead Reign, spread all 20 hordes evenly across EVERY quadrant of their own bank (zero bridge jams!)
        if (squad.role === 'boss') {
          const bossPts = [[0, BRIDGE_Z], [-13, -7], [13, -7], [13, 9], [-13, 9]];
          const bp = bossPts[(squad.reignStep = (squad.reignStep || 0) + 1) % bossPts.length];
          return [bp[0] + (aRand() - 0.5) * 3.0, bp[1] + (aRand() - 0.5) * 3.0];
        }
        if ((UNDEAD_EVENT.undeadShare || 0) < 98.5 && aRand() < 0.45) {
          return territory?.pickUndeadTarget?.(squad, true) || pickReignPatrolPoint(squad);
        }
        return pickReignPatrolPoint(squad);
      }
      const livingAlive = UNDEAD_EVENT.livingAliveCount || 0;
      if (UNDEAD_EVENT.wave >= 3 && livingAlive === 0) {
        return territory?.pickUndeadTarget?.(squad, true) || [0, BRIDGE_Z];
      }
      if (squad.role === 'boss') {
        if (livingAlive > 0) return [(aRand() - 0.5) * 6.0, BRIDGE_Z + (aRand() - 0.5) * 4.5];
        return territory?.pickUndeadTarget?.(squad, true) || [0, BRIDGE_Z];
      }
      if (isBridgeLastStand() && livingAlive > 18 && aRand() < (UNDEAD_EVENT.wave >= 3 ? 0.58 : 0.44)) {
        return [(aRand() - 0.5) * 8.5, BRIDGE_Z + (aRand() - 0.5) * 6.0];
      }
      return territory?.pickUndeadTarget?.(squad, false) || [0, BRIDGE_Z];
    }

    // Faction Kings ALWAYS stick closely with their own living armies (never wandering off solo to get surrounded!)
    if (squad.role === 'king') {
      const [ax, az] = getFactionArmyAnchor(faction.id, isBridgeLastStand());
      return [ax + (aRand() - 0.5) * 1.4, az + (aRand() - 0.5) * 1.4];
    }

    // WAVE 2 & WAVE 3 UNITED BRIDGE LAST STAND:
    // ALL 4 living houses (including Engineers!) execute a FULL RETREAT to the Central Bridge & fortify/defend it!
    if (isBridgeLastStand()) {
      if (squad.role === 'engineer') {
        const dmgStruct = structures.find(s => s.team === faction.id && distToCenterBridge(s.x, s.z) <= 12.5 && (s.buildProg < 1 || s.hp < s.maxHp * 0.95));
        if (dmgStruct) return [dmgStruct.x, dmgStruct.z];
        const spot = territory?.pickFortifySpot?.(faction.id, structures, 'bridge');
        if (spot) return [spot.x, spot.z];
      }
      const bZones = BRIDGE_LAST_STAND_ZONES[faction.id] || [[0, BRIDGE_Z]];
      const bp = bZones[squad.id % bZones.length];
      return [bp[0] + (aRand() - 0.5) * 1.6, bp[1] + (aRand() - 0.5) * 1.6];
    }

    // Engineers patrol frontier battle edges & damaged friendly fortifications!
    if (squad.role === 'engineer') {
      const dmgStruct = structures.find(s => s.team === faction.id && (s.buildProg < 1 || s.hp < s.maxHp * 0.95));
      if (dmgStruct) return [dmgStruct.x, dmgStruct.z];
      const fMode = isPeaceTreaty() ? 'edge' : 'normal';
      const spot = territory?.pickFortifySpot?.(faction.id, structures, fMode);
      if (spot) return [spot.x, spot.z];
    }

    // POST-HEROES REBUILD & PEACE ERA:
    // All 4 houses patrol calmly inside their own restored homelands (no fighting until Peace Era ends!)
    if (isCalmAftermath()) {
      const homePool = TERRITORY_ZONES[faction.id];
      const hp = homePool[Math.floor(aRand() * homePool.length)];
      return [hp[0] + (aRand() - 0.5) * 2.4, hp[1] + (aRand() - 0.5) * 2.4];
    }

    // WARNING & WAVE 1 PEACE TREATY:
    // All 4 houses stop attacking each other and defend their own outer borders against the Undead!
    if (isPeaceTreaty()) {
      const def = territory?.pickDefenseTarget?.(faction.id, true);
      if (def) return [def[0] + (aRand() - 0.5) * 1.8, def[1] + (aRand() - 0.5) * 1.8];
      const edgeDef = territory?.pickEdgeDefenseTarget?.(faction.id);
      if (edgeDef) return [edgeDef[0] + (aRand() - 0.5) * 1.8, edgeDef[1] + (aRand() - 0.5) * 1.8];
    }

    // Dynamic territory-driven multi-front warfare + guaranteed Homeland Territory Reclamation:
    // Whenever a house has lost parts of its default homeland, dynamically rally regiments to retake it!
    const pwr = REALM_TIDE.power[faction.id] || 1.0;
    const lostCount = territory?.getLostHomelandCount?.(faction.id) || 0;
    const reclaimUrgency = lostCount > 18 ? 0.46 : lostCount > 6 ? 0.30 : 0.0;
    const defenseChance = Math.min(0.68, (pwr < 0.84 ? 0.40 : 0.22) + reclaimUrgency);
    const attackChance = Math.max(0.26, (pwr > 1.20 ? 0.74 : 0.62) - reclaimUrgency * 0.65);
    const roll = aRand();

    if (territory && roll < defenseChance) {
      const dynDef = territory.pickDefenseTarget(faction.id, false);
      if (dynDef) return [dynDef[0] + (aRand() - 0.5) * 1.6, dynDef[1] + (aRand() - 0.5) * 1.6];
    }
    if (territory && roll < defenseChance + attackChance) {
      const dynAttack = territory.pickAttackTarget(faction.id, squad);
      if (dynAttack) return [dynAttack[0] + (aRand() - 0.5) * 1.8, dynAttack[1] + (aRand() - 0.5) * 1.8];
    }

    const useOffense = roll < attackChance;
    const pool = useOffense ? FRONTIER_EXCURSIONS[faction.id] : TERRITORY_ZONES[faction.id];
    const p = pool[Math.floor(aRand() * pool.length)];
    return [p[0] + (aRand() - 0.5) * 2.6, p[1] + (aRand() - 0.5) * 2.6];
  };

  const horseCoats = [0x6b3e22, 0x3f2a1d, 0x8c5c38, 0xd8d3c8, 0x2a2420];

  for (const fac of FACTIONS) {
    const homeZones = TERRITORY_ZONES[fac.id];
    SQUAD_TEMPLATES.forEach((tpl, sIdx) => {
      // Spread all 13 grand regiments organically across EVERY corner of each faction's territory (left, right, north, south!)
      const basePt = homeZones[sIdx % homeZones.length];
      const [spX, spZ] = getTerritorySpawn(fac, basePt[0], basePt[1]);
      const [initX, initZ] = keepOnPassableLand(spX, spZ, basePt[0], basePt[1]);
      const squad = {
        id: squads.length,
        team: fac.id,
        faction: fac,
        role: tpl.role,
        theater: tpl.theater,
        x: initX,
        z: initZ,
        heading: aRand() * Math.PI * 2,
        goalX: initX,
        goalZ: initZ,
        retargetTimer: 4 + aRand() * 10,
        provokedBy: null,
        provokeTimer: 0,
        isCrossing: false,
        kingState: 'active', // 'active' | 'retreating' | 'resting' (used by role === 'king')
        kingRestTimer: 0,
        kingRestFxCd: 0,
        members: [],
      };
      const [gx, gz] = pickSquadGoal(fac, squad);
      squad.goalX = gx;
      squad.goalZ = gz;
      squad.heading = Math.atan2(gx - initX, gz - initZ);

      const cols = Math.ceil(Math.sqrt(tpl.members.length));
      const spacing = (tpl.role === 'cavalry' || tpl.role === 'outrider' || tpl.role === 'king') ? 0.42 : 0.27;
      let catIdx = 0;
      let escortIdx = 0;
      tpl.members.forEach((type, mIdx) => {
        let fx = 0;
        let fz = 0;
        if (tpl.role === 'king') {
          if (type === 'king') {
            // Immortal King rides proudly at the front apex of his Knight Cavalry wedge!
            fx = 0;
            fz = 0.56;
          } else {
            // 10 Knight Cavalries fanned symmetrically behind & flanking their King in a royal chevron!
            const side = escortIdx % 2 === 0 ? -1 : 1;
            const rank = Math.floor(escortIdx / 2);
            fx = side * (0.48 + rank * 0.28);
            fz = 0.14 - rank * 0.36;
            escortIdx++;
          }
        } else if (tpl.role === 'siege') {
          if (type === 'siege') {
            // Single battering ram at the center, surrounded & pushed by melee infantry!
            fx = 0;
            fz = 0.05;
          } else {
            // Arrange the 18 melee pushers & escorts tightly alongside, behind, and guarding the ram!
            const side = escortIdx % 2 === 0 ? -1 : 1;
            const rank = Math.floor(escortIdx / 2);
            if (rank < 4) {
              // Pushing closely along both flanks of the ram shed
              fx = side * (0.34 + (rank % 2) * 0.24);
              fz = -0.32 + Math.floor(rank / 2) * 0.34;
            } else {
              // Pushing behind & screening the rear/flanks
              const rearI = escortIdx - 8;
              const rCol = rearI % 5;
              const rRow = Math.floor(rearI / 5);
              fx = (rCol - 2.0) * 0.28;
              fz = -0.58 - rRow * 0.28;
            }
            escortIdx++;
          }
        } else if (tpl.role === 'catapult') {
          if (type === 'catapult') {
            // 3 catapults spaced cleanly side-by-side in an artillery line
            fx = (catIdx - 1) * 0.82;
            fz = -0.38;
            catIdx++;
          } else {
            // 12 melee/archer escorts screening the front of the 3-catapult battery
            const eCol = escortIdx % 6;
            const eRow = Math.floor(escortIdx / 6);
            fx = (eCol - 2.5) * 0.32;
            fz = 0.34 + eRow * 0.28;
            escortIdx++;
          }
        } else {
          const colI = mIdx % cols;
          const rowI = Math.floor(mIdx / cols);
          const rows = Math.ceil(tpl.members.length / cols);
          fx = (colI - (cols - 1) * 0.5) * spacing;
          fz = (rowI - (rows - 1) * 0.5) * spacing;
        }
        const [ux, uz] = keepOnPassableLand(initX + fx, initZ + fz, initX, initZ);
        const st = UNIT_STATS[type];
        const unit = {
          uid: units.length,
          squad,
          team: fac.id,
          faction: fac,
          type,
          hp: st.hp,
          maxHp: st.hp,
          x: ux,
          z: uz,
          heading: squad.heading,
          formX: fx,
          formZ: fz,
          alive: true,
          respawnWait: 0,
          cd: aRand() * st.cd,
          swing: 0,
          armPitch: -0.25,
          stridePhase: aRand() * 6.28,
          provokedBy: null,
          provokeTimer: 0,
          horseCoat: horseCoats[Math.floor(aRand() * horseCoats.length)],
        };
        squad.members.push(unit);
        units.push(unit);
      });
      squads.push(squad);
    });
  }

  // ── BUILD 20 MASSIVE EDGE-SPAWNING UNDEAD HORDES (12 HORDES IN WAVE 1 = 504 TROOPS, +8 IN WAVE 2 = 840 UNDEAD!) + SKARBRAND (WAVE 3!) ─
  const UNDEAD_SQUAD_SPECS = [
    // Wave 1: 12 full hordes pouring in simultaneously from ALL 12 edge rifts (504 Undead!)
    { edgeIdx: 0, waveTier: 1 }, { edgeIdx: 1, waveTier: 1 }, { edgeIdx: 2, waveTier: 1 }, { edgeIdx: 3, waveTier: 1 },
    { edgeIdx: 4, waveTier: 1 }, { edgeIdx: 5, waveTier: 1 }, { edgeIdx: 6, waveTier: 1 }, { edgeIdx: 7, waveTier: 1 },
    { edgeIdx: 8, waveTier: 1 }, { edgeIdx: 9, waveTier: 1 }, { edgeIdx: 10, waveTier: 1 }, { edgeIdx: 11, waveTier: 1 },
    // Wave 2: +8 huge reinforcement hordes surging across North, South, East & West borders (+336 -> 840 Undead total!)
    { edgeIdx: 0, waveTier: 2 }, { edgeIdx: 2, waveTier: 2 }, { edgeIdx: 4, waveTier: 2 }, { edgeIdx: 5, waveTier: 2 },
    { edgeIdx: 6, waveTier: 2 }, { edgeIdx: 7, waveTier: 2 }, { edgeIdx: 8, waveTier: 2 }, { edgeIdx: 11, waveTier: 2 },
  ];
  const undeadMembersTpl = packMembers([['undead_warrior', 30], ['undead_champion', 9], ['undead_necro', 3]]);
  const undeadSquads = [];
  UNDEAD_SQUAD_SPECS.forEach((spec, uIdx) => {
    const [ex, ez] = UNDEAD_EDGE_SPAWNS[spec.edgeIdx];
    const squad = {
      id: squads.length,
      team: 4,
      faction: UNDEAD_FACTION,
      role: 'undead',
      theater: 'undead-edge',
      edgeIdx: spec.edgeIdx,
      waveTier: spec.waveTier,
      x: ex,
      z: ez,
      heading: Math.atan2(-ex, -ez),
      goalX: 0,
      goalZ: 0,
      retargetTimer: 4 + uIdx,
      provokedBy: null,
      provokeTimer: 0,
      isCrossing: false,
      kingState: 'active',
      kingRestTimer: 0,
      kingRestFxCd: 0,
      members: [],
    };
    const cols = 7;
    undeadMembersTpl.forEach((type, mIdx) => {
      const colI = mIdx % cols;
      const rowI = Math.floor(mIdx / cols);
      const fx = (colI - 3.0) * 0.30;
      const fz = (rowI - 2.5) * 0.30;
      const st = UNIT_STATS[type];
      const unit = {
        uid: units.length,
        squad,
        team: 4,
        faction: UNDEAD_FACTION,
        type,
        hp: st.hp,
        maxHp: st.hp,
        x: ex + fx,
        z: ez + fz,
        heading: squad.heading,
        formX: fx,
        formZ: fz,
        alive: false,
        undeadDormant: true,
        respawnWait: 0,
        cd: aRand() * st.cd,
        swing: 0,
        armPitch: -0.25,
        stridePhase: aRand() * 6.28,
        provokedBy: null,
        provokeTimer: 0,
        horseCoat: horseCoats[0],
      };
      squad.members.push(unit);
      units.push(unit);
    });
    squads.push(squad);
    undeadSquads.push(squad);
  });

  // Wave 3 Boss Squad: SKARBRAND THE EXILED ONE!
  const skarbrandSquad = {
    id: squads.length,
    team: 4,
    faction: UNDEAD_FACTION,
    role: 'boss',
    theater: 'boss-rampage',
    edgeIdx: 1,
    waveTier: 3,
    x: -11.5,
    z: -13.8,
    heading: 0,
    goalX: 0,
    goalZ: 0,
    retargetTimer: 4,
    provokedBy: null,
    provokeTimer: 0,
    isCrossing: false,
    kingState: 'active',
    kingRestTimer: 0,
    kingRestFxCd: 0,
    members: [],
  };
  const skarbrandUnit = {
    uid: units.length,
    squad: skarbrandSquad,
    team: 4,
    faction: UNDEAD_FACTION,
    type: 'skarbrand',
    hp: UNIT_STATS.skarbrand.hp,
    maxHp: UNIT_STATS.skarbrand.hp,
    x: -11.5,
    z: -13.8,
    heading: 0,
    formX: 0,
    formZ: 0,
    alive: false,
    undeadDormant: true,
    respawnWait: 0,
    cd: 0.6,
    swing: 0,
    swingAlt: 1,
    armPitch: 0,
    stridePhase: 0,
    provokedBy: null,
    provokeTimer: 0,
    horseCoat: horseCoats[0],
  };
  skarbrandSquad.members.push(skarbrandUnit);
  units.push(skarbrandUnit);
  squads.push(skarbrandSquad);

  // ── 4 DORMANT RADIANT HEROES (Summoned at Central Bridge when Undead reach 95% Control!) ──
  const HERO_BRIDGE_SPAWNS = [
    [-2.4, BRIDGE_Z - 1.4], // Red Hero (NW bridgehead)
    [2.4, BRIDGE_Z - 1.4], // Blue Hero (NE bridgehead)
    [2.4, BRIDGE_Z + 1.4], // Green Hero (SE bridgehead)
    [-2.4, BRIDGE_Z + 1.4], // Orange Hero (SW bridgehead)
  ];
  const heroSquads = [];
  const heroUnits = [];
  FACTIONS.forEach((fac, hIdx) => {
    const [hx0, hz0] = HERO_BRIDGE_SPAWNS[hIdx];
    const hSq = {
      id: squads.length,
      team: fac.id,
      faction: fac,
      role: 'hero',
      theater: 'hero-reclaim',
      x: hx0,
      z: hz0,
      heading: 0,
      goalX: hx0,
      goalZ: hz0,
      retargetTimer: 1.0,
      provokedBy: null,
      provokeTimer: 0,
      isCrossing: false,
      kingState: 'active',
      kingRestTimer: 0,
      kingRestFxCd: 0,
      members: [],
    };
    const hUnit = {
      uid: units.length,
      squad: hSq,
      team: fac.id,
      faction: fac,
      type: 'hero',
      hp: UNIT_STATS.hero.hp,
      maxHp: UNIT_STATS.hero.hp,
      x: hx0,
      z: hz0,
      heading: 0,
      formX: 0,
      formZ: 0,
      alive: false,
      respawnWait: 0,
      cd: 0.4,
      swing: 0,
      armPitch: 0,
      stridePhase: 0,
      provokedBy: null,
      provokeTimer: 0,
      horseCoat: horseCoats[0],
    };
    hSq.members.push(hUnit);
    units.push(hUnit);
    squads.push(hSq);
    heroSquads.push(hSq);
    heroUnits.push(hUnit);
  });

  const spawnFX = (x, y, z, colorHex, maxScale, duration, vx = 0, vy = 0.42, vz = 0, grav = 0) => {
    if (effects.length >= MAX_FX) effects.shift();
    effects.push({ x, y, z, color: colorHex, maxScale, age: 0, duration, vx, vy, vz, grav });
  };

  const deployUndeadSquad = sq => {
    const [ex, ez] = UNDEAD_EDGE_SPAWNS[sq.edgeIdx];
    const [cx, cz] = keepOnPassableLand(ex, ez, ex, ez);
    sq.x = cx;
    sq.z = cz;
    sq.provokedBy = null;
    sq.provokeTimer = 0;
    const [gx, gz] = pickSquadGoal(UNDEAD_FACTION, sq);
    sq.goalX = gx;
    sq.goalZ = gz;
    sq.heading = Math.atan2(gx - cx, gz - cz);
    const gy = armyGroundY(cx, cz);
    spawnFX(cx, gy + 0.55, cz, 0x6eff9e, 2.8, 0.95, 0, 0.55, 0, 0);
    spawnFX(cx, gy + 0.40, cz, 0x5c2080, 2.2, 0.85, 0, 0.40, 0, 0);
    for (let m = 0; m < sq.members.length; m++) {
      const u = sq.members[m];
      const st = UNIT_STATS[u.type];
      u.alive = true;
      u.undeadDormant = false;
      u.insideVenue = false;
      u.hp = st.hp;
      u.provokedBy = null;
      u.provokeTimer = 0;
      const [ux, uz] = keepOnPassableLand(cx + u.formX, cz + u.formZ, cx, cz);
      u.x = ux;
      u.z = uz;
      u.heading = sq.heading;
      u.cd = aRand() * st.cd;
    }
  };

  // Trigger the 2-Minute Peace Treaty Preparation Announcement (clicking again while prepping unleashes Wave 1 immediately!)
  const startUndeadWarning = () => {
    if (UNDEAD_EVENT.phase === 'warning') {
      launchUndeadWave(1);
      return;
    }
    if (UNDEAD_EVENT.phase === 'active' || UNDEAD_EVENT.phase === 'heroes') return;
    UNDEAD_EVENT.phase = 'warning';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.timer = UNDEAD_EVENT.warningDur; // 120s (2 minutes!)
    UNDEAD_EVENT.activeElapsed = 0;
    UNDEAD_EVENT.undeadShare = 0;
    UNDEAD_EVENT.bossAlive = false;
    UNDEAD_EVENT.undeadAliveCount = 0;
    UNDEAD_EVENT.heroClearTimer = 0;
    // Enforce Peace Treaty: cancel inter-house provocations & rally all 4 houses to fortify outer borders!
    for (let i = 0; i < squads.length; i++) {
      const sq = squads[i];
      if (sq.team >= 4 || sq.role === 'hero') continue;
      sq.provokedBy = null;
      sq.provokeTimer = 0;
      sq.retargetTimer = 0.2;
      if (sq.role === 'king' && sq.kingState !== 'active') continue;
      const edgePt = territory?.pickEdgeDefenseTarget?.(sq.team);
      if (edgePt) {
        sq.goalX = edgePt[0];
        sq.goalZ = edgePt[1];
      }
    }
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.team < 4 && u.type !== 'hero') {
        u.provokedBy = null;
        u.provokeTimer = 0;
      }
    }
    for (let tm = 0; tm < 4; tm++) facBuildCd[tm] = Math.min(facBuildCd[tm], 0.8 + tm * 0.4);
  };

  // Escalate across 3 Epic Waves:
  // Wave 1 (5:00): 8 massive undead edge hordes (192 troops!) attack all 4 outer borders — 4 houses CAN respawn
  // Wave 2 (3:00): All 12 undead edge hordes (288 troops!) surge — ALL 4 HOUSES DO A FULL RETREAT TO THE CENTRAL BRIDGE!
  // Wave 3 (1:00+): SKARBRAND charges the central bridge + NO living respawns + 4 KINGS CAN BE KILLED (tanky!) until Undead reach 95%!
  const launchUndeadWave = waveNum => {
    UNDEAD_EVENT.phase = 'active';
    UNDEAD_EVENT.wave = waveNum;
    if (waveNum === 1) {
      UNDEAD_EVENT.activeElapsed = 0;
      UNDEAD_EVENT.waveRemaining = UNDEAD_EVENT.wave1Dur;
      effTeamPower[4] = 1.15;
      for (let s = 0; s < undeadSquads.length; s++) {
        if (undeadSquads[s].waveTier === 1) deployUndeadSquad(undeadSquads[s]);
      }
    } else if (waveNum === 2) {
      UNDEAD_EVENT.waveRemaining = UNDEAD_EVENT.wave2Dur;
      effTeamPower[4] = 1.52;
      for (let s = 0; s < undeadSquads.length; s++) {
        if (undeadSquads[s].waveTier === 2) deployUndeadSquad(undeadSquads[s]);
      }
      // FULL TACTICAL RETREAT ORDER: Disengage EVERY living regiment, King & soldier from the map edges and fall back to the Central Bridge!
      for (let i = 0; i < squads.length; i++) {
        const sq = squads[i];
        if (sq.team >= 4 || sq.role === 'hero') continue;
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        if (sq.role === 'king') {
          // Cancel any outer-venue retreat/rest so all 4 Kings immediately ride back WITH their armies to the Central Bridge!
          if (sq.kingState === 'resting') {
            const [exitX, exitZ] = getKingSanctuary(sq.faction);
            sq.x = exitX;
            sq.z = exitZ;
            for (const m of sq.members) {
              const st = UNIT_STATS[m.type];
              m.alive = true;
              m.insideVenue = false;
              m.hp = st.hp;
              const [ux, uz] = keepOnPassableLand(exitX + m.formX, exitZ + m.formZ, exitX, exitZ);
              m.x = ux;
              m.z = uz;
            }
          }
          sq.kingState = 'active';
          sq.kingRestTimer = 0;
          const bZones = BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]];
          sq.goalX = bZones[0][0];
          sq.goalZ = bZones[0][1];
          sq.retargetTimer = 3.5;
          continue;
        }
        const bZones = BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]];
        const bp = bZones[sq.id % bZones.length];
        sq.goalX = bp[0] + (aRand() - 0.5) * 1.4;
        sq.goalZ = bp[1] + (aRand() - 0.5) * 1.4;
        sq.retargetTimer = 24.0;
      }
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.team < 4 && u.type !== 'hero') {
          u.provokedBy = null;
          u.provokeTimer = 0;
          // Dismount archers from far outer watchtowers so they retreat to defend the Central Bridge!
          if (u.garrisonTower && distToCenterBridge(u.garrisonTower.x, u.garrisonTower.z) > 12.0) {
            releaseArcherFromTower(u);
          }
        }
      }
      for (let tm = 0; tm < 4; tm++) facBuildCd[tm] = Math.min(facBuildCd[tm], 1.0 + tm * 0.35);
    } else if (waveNum === 3) {
      UNDEAD_EVENT.waveRemaining = UNDEAD_EVENT.wave3Dur;
      effTeamPower[4] = 2.05;
      // Wave 3: ALL 4 KINGS become MORTAL (with massive tanky HP!) & immediately emerge if resting to stand at the Central Bridge!
      for (let i = 0; i < squads.length; i++) {
        const sq = squads[i];
        if (sq.team >= 4 || sq.role === 'hero') continue;
        if (sq.role === 'king') {
          if (sq.kingState !== 'active') {
            const [exitX, exitZ] = getKingSanctuary(sq.faction);
            sq.x = exitX;
            sq.z = exitZ;
            sq.kingState = 'active';
            sq.kingRestTimer = 0;
            for (const m of sq.members) {
              if (m.alive || m.type === 'king') {
                m.alive = true;
                m.insideVenue = false;
                const [ux, uz] = keepOnPassableLand(exitX + m.formX, exitZ + m.formZ, exitX, exitZ);
                m.x = ux;
                m.z = uz;
              }
            }
          }
          for (const m of sq.members) {
            if (m.type === 'king') {
              m.maxHp = KING_W3_HP;
              m.hp = KING_W3_HP;
            }
          }
        }
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        const bZones = BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]];
        const bp = bZones[sq.id % bZones.length];
        sq.goalX = bp[0] + (aRand() - 0.5) * 1.4;
        sq.goalZ = bp[1] + (aRand() - 0.5) * 1.4;
        sq.retargetTimer = 24.0;
      }

      // Unleash SKARBRAND THE EXILED ONE charging straight toward the Central Bridge final stand!
      const spIdx = aRand() > 0.5 ? 1 : 2;
      const [bx0, bz0] = UNDEAD_EDGE_SPAWNS[spIdx];
      const [cx, cz] = keepOnPassableLand(bx0, bz0, bx0, bz0);
      skarbrandSquad.edgeIdx = spIdx;
      skarbrandSquad.x = cx;
      skarbrandSquad.z = cz;
      skarbrandSquad.provokedBy = null;
      skarbrandSquad.provokeTimer = 0;
      skarbrandSquad.goalX = 0;
      skarbrandSquad.goalZ = BRIDGE_Z;
      skarbrandSquad.heading = Math.atan2(-cx, BRIDGE_Z - cz);

      skarbrandUnit.alive = true;
      skarbrandUnit.undeadDormant = false;
      skarbrandUnit.insideVenue = false;
      skarbrandUnit.hp = UNIT_STATS.skarbrand.hp;
      skarbrandUnit.maxHp = UNIT_STATS.skarbrand.hp;
      skarbrandUnit.x = cx;
      skarbrandUnit.z = cz;
      skarbrandUnit.heading = skarbrandSquad.heading;
      skarbrandUnit.cd = 0.5;
      UNDEAD_EVENT.bossAlive = true;

      // Drive Undead hordes inward toward the Central Bridge last stand!
      for (let s = 0; s < undeadSquads.length; s++) {
        const sq = undeadSquads[s];
        sq.goalX = (aRand() - 0.5) * 7.5;
        sq.goalZ = BRIDGE_Z + (aRand() - 0.5) * 5.5;
        sq.retargetTimer = 14.0;
      }

      const by = armyGroundY(cx, cz);
      spawnFX(cx, by + 0.85, cz, 0xff4514, 4.4, 1.25, 0, 0.75, 0, 0);
      spawnFX(cx, by + 1.15, cz, 0xffcf54, 2.8, 0.85, 0, 0.95, 0, 0);
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        spawnFX(cx, by + 0.5, cz, k % 2 === 0 ? 0xff4514 : 0xffaa2b, 1.1, 0.85, Math.cos(ang) * 2.2, 2.1, Math.sin(ang) * 2.2, 4.2);
      }
    }
  };

  // Once Undead conquer >= 95% of the map (after everyone is dead!), enter a 2-minute Undead Reign so the Undead
  // spread evenly across EVERY corner of BOTH West & East banks (without bottlenecking on the bridges!) before the 4 Heroes spawn!
  const startUndeadReign = () => {
    UNDEAD_EVENT.phase = 'reign';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.timer = UNDEAD_EVENT.reignDur; // 120.0s (2 minutes!)
    // Assign each of the 20 Undead hordes to a unique patrol slot on its own bank (keeping West/East balanced so ZERO bridge jams happen!)
    const westList = [];
    const eastList = [];
    for (let s = 0; s < undeadSquads.length; s++) {
      const sq = undeadSquads[s];
      sq.provokedBy = null;
      sq.provokeTimer = 0;
      if (sq.x < riverCenterX(sq.z)) westList.push(sq);
      else eastList.push(sq);
    }
    // Gently rebalance only if one bank has > 12 hordes (moving the closest squads to the opposite bank once)
    while (westList.length > 12) eastList.push(westList.pop());
    while (eastList.length > 12) westList.push(eastList.pop());
    westList.forEach((sq, idx) => {
      sq.reignBank = -1;
      sq.reignSlot = idx;
      sq.reignStep = 0;
      const [gx, gz] = pickReignPatrolPoint(sq);
      sq.goalX = gx;
      sq.goalZ = gz;
      sq.retargetTimer = 18.0 + (idx % 4) * 3.0;
    });
    eastList.forEach((sq, idx) => {
      sq.reignBank = 1;
      sq.reignSlot = idx;
      sq.reignStep = 0;
      const [gx, gz] = pickReignPatrolPoint(sq);
      sq.goalX = gx;
      sq.goalZ = gz;
      sq.retargetTimer = 18.0 + (idx % 4) * 3.0;
    });
    skarbrandSquad.reignStep = 0;
    skarbrandSquad.goalX = 0;
    skarbrandSquad.goalZ = BRIDGE_Z;
    skarbrandSquad.retargetTimer = 14.0;
  };

  // Once the 2-Minute Undead Reign ends, DO NOT despawn Undead — SUMMON 4 UNKILLABLE RADIANT HEROES at the Central Bridge!
  // Undead do NOT focus on the 4 Heroes; each Hero slowly hunts Undead & reclaims ONLY their own starting homeland color!
  const summonFourHeroes = () => {
    UNDEAD_EVENT.phase = 'heroes';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.heroClearTimer = 0;

    // Clear Undead provocations so they wander/occupy their blighted lands and NEVER gang up on the 4 Heroes!
    for (let i = 0; i < squads.length; i++) {
      const sq = squads[i];
      if (sq.team === 4) {
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        sq.retargetTimer = 1.5 + aRand() * 3.0;
      }
    }
    for (let i = 0; i < units.length; i++) {
      if (units[i].team === 4) {
        units[i].provokedBy = null;
        units[i].provokeTimer = 0;
      }
    }

    // Summon all 4 Radiant Heroes at the Central Bridge in pillars of golden light!
    for (let h = 0; h < heroUnits.length; h++) {
      const hu = heroUnits[h];
      const hSq = heroSquads[h];
      const [sx0, sz0] = HERO_BRIDGE_SPAWNS[h];
      const [cx, cz] = keepOnPassableLand(sx0, sz0, sx0, sz0);
      hSq.x = cx;
      hSq.z = cz;
      hSq.provokedBy = null;
      hSq.provokeTimer = 0;
      hu.x = cx;
      hu.z = cz;
      hu.alive = true;
      hu.insideVenue = false;
      hu.hp = UNIT_STATS.hero.hp;
      hu.maxHp = UNIT_STATS.hero.hp;
      hu.provokedBy = null;
      hu.provokeTimer = 0;
      hu.cd = 0.25;
      const [gx, gz] = pickSquadGoal(hu.faction, hSq);
      hSq.goalX = gx;
      hSq.goalZ = gz;
      hSq.heading = Math.atan2(gx - cx, gz - cz);
      hu.heading = hSq.heading;
      hSq.retargetTimer = 2.0;

      const hy = armyGroundY(cx, cz);
      spawnFX(cx, hy + 0.75, cz, 0xffe878, 3.8, 1.35, 0, 0.95, 0, 0);
      spawnFX(cx, hy + 1.05, cz, hu.faction.magic, 2.8, 1.05, 0, 1.15, 0, 0);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        spawnFX(cx, hy + 0.45, cz, k % 2 === 0 ? 0xffffff : 0xffe066, 0.95, 0.85, Math.cos(ang) * 1.9, 1.8, Math.sin(ang) * 1.9, 3.6);
      }
    }
  };

  // Once the 4 Radiant Heroes have defeated EVERY Undead & Skarbrand and reclaimed the realm, restore the 4 Kings & living armies!
  const completeHeroReclamation = () => {
    for (let h = 0; h < heroUnits.length; h++) {
      const hu = heroUnits[h];
      if (hu.alive) {
        const hy = armyGroundY(hu.x, hu.z);
        spawnFX(hu.x, hy + 0.95, hu.z, 0xffe878, 3.6, 1.15, 0, 1.25, 0, 0);
        spawnFX(hu.x, hy + 1.25, hu.z, 0xffffff, 2.4, 0.85, 0, 1.45, 0, 0);
      }
      hu.alive = false;
      heroModels[h].root.visible = false;
    }
    skarbrandUnit.alive = false;
    skarbrandUnit.undeadDormant = true;
    skarbrandModel.root.visible = false;
    UNDEAD_EVENT.bossAlive = false;
    UNDEAD_EVENT.undeadAliveCount = 0;
    for (let s = 0; s < undeadSquads.length; s++) {
      for (const u of undeadSquads[s].members) {
        u.alive = false;
        u.undeadDormant = true;
        u.provokedBy = null;
        u.provokeTimer = 0;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].team === 4) projectiles.splice(i, 1);
    }
    // Restore any tiny remaining blight cells back to their house's default homeland!
    territory?.restoreUndeadToHomelands?.();
    // Enter 2-Minute Human Repopulation ('rebuild') Phase: humans & Kings spawn little by little SPREAD ACROSS EVERY CORNER of each faction's territory!
    UNDEAD_EVENT.phase = 'rebuild';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.timer = UNDEAD_EVENT.rebuildDur; // 120.0s (2 minutes!)
    UNDEAD_EVENT.undeadShare = 0;

    // 12 distinct widely-spaced homeland spawn sectors per faction (far corners, woods, farms, meadows, ridges & riverbanks!)
    const REBUILD_HOMELAND_SPOTS = {
      0: [[-24.8, -11.8], [-18.2, -13.2], [-10.8, -13.2], [-5.0, -11.2], [-25.0, -5.2], [-17.5, -2.6], [-9.2, -1.8], [-5.2, -5.6], [-21.5, -8.5], [-13.5, -3.5], [-6.8, -8.8], [-23.8, -1.8]],
      1: [[24.8, -11.0], [18.8, -13.0], [11.4, -13.0], [5.2, -11.0], [24.2, -3.0], [18.6, 1.2], [9.6, -1.2], [6.4, -5.2], [21.2, -7.8], [13.8, -2.8], [7.2, -8.6], [24.5, 1.0]],
      2: [[24.0, 5.2], [22.8, 12.8], [16.8, 16.6], [10.4, 17.4], [14.4, 5.0], [8.4, 4.4], [6.0, 10.6], [6.8, 15.8], [20.5, 9.2], [12.2, 12.4], [19.8, 3.2], [14.5, 16.2]],
      3: [[-25.4, 3.6], [-24.2, 12.2], [-18.4, 16.4], [-10.8, 17.2], [-14.6, 2.6], [-9.2, 4.8], [-5.6, 8.4], [-5.4, 14.4], [-21.2, 8.5], [-13.4, 12.2], [-19.8, 2.2], [-14.8, 15.6]],
    };

    const facSqCounter = [0, 0, 0, 0];
    for (let i = 0; i < squads.length; i++) {
      const sq = squads[i];
      if (sq.team >= 4 || sq.role === 'hero') continue;
      sq.provokedBy = null;
      sq.provokeTimer = 0;
      sq.retargetTimer = 6.0 + aRand() * 8.0;
      const [exitX, exitZ] = getKingSanctuary(sq.faction);
      if (sq.role === 'king') {
        sq.kingState = 'active';
        sq.kingRestTimer = 0;
        sq.x = exitX;
        sq.z = exitZ;
        const [gx, gz] = pickSquadGoal(sq.faction, sq);
        sq.goalX = gx;
        sq.goalZ = gz;
        let kIdx = 0;
        for (const u of sq.members) {
          const st = UNIT_STATS[u.type];
          u.maxHp = st.hp;
          u.insideVenue = false;
          if (!u.alive) {
            // Each King emerges early (6..15s) and his 10 Knight Cavalries trickle out behind him little by little!
            u.respawnWait = u.type === 'king' ? (6.0 + sq.team * 2.5) : (10.0 + kIdx * 4.2 + aRand() * 6.0);
            kIdx++;
          } else {
            u.hp = st.hp;
          }
        }
        continue;
      }
      const sqIdx = facSqCounter[sq.team]++;
      const baseDelay = (sqIdx / 12) * 74.0; // Spread 12 regiments across ~0..74s of the 2:00 rebuild window
      const homeSpots = REBUILD_HOMELAND_SPOTS[sq.team] || TERRITORY_ZONES[sq.team];
      const zonePt = homeSpots[sqIdx % homeSpots.length];
      const [cleanRx, cleanRz] = keepOnPassableLand(
        zonePt[0] + (aRand() - 0.5) * 2.0,
        zonePt[1] + (aRand() - 0.5) * 2.0,
        zonePt[0],
        zonePt[1]
      );
      sq.rebuildX = cleanRx;
      sq.rebuildZ = cleanRz;
      let anyAlive = false;
      for (const u of sq.members) { if (u.alive) { anyAlive = true; break; } }
      if (!anyAlive) {
        sq.x = cleanRx;
        sq.z = cleanRz;
        const [gx, gz] = pickSquadGoal(sq.faction, sq);
        sq.goalX = gx;
        sq.goalZ = gz;
      }
      sq.members.forEach((u, mIdx) => {
        if (!u.alive) {
          u.respawnWait = Math.min(112.0, 2.0 + baseDelay + mIdx * 1.15 + aRand() * 12.0);
        }
      });
    }
  };

  // After the 2-minute Human Repopulation finishes, enter a 1-minute Peace Era before war resumes!
  const startPeaceEra = () => {
    // Ensure any remaining straggler humans & Kings have fully emerged across their whole territory for the Peace Era!
    for (let i = 0; i < squads.length; i++) {
      const sq = squads[i];
      if (sq.team >= 4 || sq.role === 'hero') continue;
      const [baseX, baseZ] = sq.role === 'king'
        ? getKingSanctuary(sq.faction)
        : (sq.rebuildX !== undefined ? [sq.rebuildX, sq.rebuildZ] : getTerritorySpawn(sq.faction));
      for (const u of sq.members) {
        if (!u.alive) {
          const st = UNIT_STATS[u.type];
          u.alive = true;
          u.insideVenue = false;
          u.maxHp = st.hp;
          u.hp = st.hp;
          u.provokedBy = null;
          u.provokeTimer = 0;
          const [ux, uz] = keepOnPassableLand(baseX + u.formX + (aRand() - 0.5) * 1.6, baseZ + u.formZ + (aRand() - 0.5) * 1.6, baseX, baseZ);
          u.x = ux;
          u.z = uz;
          u.cd = aRand() * st.cd;
        }
      }
      sq.provokedBy = null;
      sq.provokeTimer = 0;
      const [gx, gz] = pickSquadGoal(sq.faction, sq);
      sq.goalX = gx;
      sq.goalZ = gz;
      sq.retargetTimer = 8 + aRand() * 8;
    }
    UNDEAD_EVENT.phase = 'peace_era';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.timer = UNDEAD_EVENT.peaceEraDur; // 60.0s (1 minute!)
  };

  // Once the 1-minute Peace Era concludes, end the Peace Treaty so the 4-house war continues!
  const endPeaceEraToWar = () => {
    UNDEAD_EVENT.phase = 'aftermath';
    UNDEAD_EVENT.wave = 0;
    UNDEAD_EVENT.timer = UNDEAD_EVENT.aftermathDur;
    for (let i = 0; i < squads.length; i++) {
      const sq = squads[i];
      if (sq.team >= 4 || sq.role === 'hero') continue;
      sq.provokedBy = null;
      sq.provokeTimer = 0;
      sq.retargetTimer = 0.25;
    }
  };

  // Skip to the next Invasion phase/wave at any time (Prep -> W1 -> W2 -> W3 -> Reign -> Heroes -> Rebuild -> Peace Era -> War!)
  const skipInvasionWave = () => {
    if (UNDEAD_EVENT.phase === 'idle') {
      startUndeadWarning();
      return;
    }
    if (UNDEAD_EVENT.phase === 'warning') {
      launchUndeadWave(1);
      return;
    }
    if (UNDEAD_EVENT.phase === 'active') {
      if (UNDEAD_EVENT.wave === 1) {
        UNDEAD_EVENT.activeElapsed = UNDEAD_EVENT.wave1Dur;
        launchUndeadWave(2);
      } else if (UNDEAD_EVENT.wave === 2) {
        UNDEAD_EVENT.activeElapsed = UNDEAD_EVENT.wave1Dur + UNDEAD_EVENT.wave2Dur;
        launchUndeadWave(3);
      } else {
        // Skip Wave 3 -> Fall remaining living defenders, conquer 95% blight & enter the 2-Minute Undead Reign!
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (u.team < 4 && u.type !== 'hero' && u.alive) {
            releaseArcherFromTower(u);
            u.alive = false;
            u.insideVenue = false;
            u.respawnWait = 9999;
          }
        }
        UNDEAD_EVENT.livingAliveCount = 0;
        UNDEAD_EVENT.undeadShare = territory?.forceUndeadConquest95?.() || 95.0;
        startUndeadReign();
      }
      return;
    }
    if (UNDEAD_EVENT.phase === 'reign') {
      summonFourHeroes();
      return;
    }
    if (UNDEAD_EVENT.phase === 'heroes') {
      completeHeroReclamation();
      return;
    }
    if (UNDEAD_EVENT.phase === 'rebuild') {
      startPeaceEra();
      return;
    }
    if (UNDEAD_EVENT.phase === 'peace_era') {
      endPeaceEraToWar();
    }
  };

  const aliveByTeam = [295, 295, 295, 295, 0];
  const totalByTeam = [0, 0, 0, 0, 0];
  const effTeamPower = [1.46, 0.98, 0.70, 1.06, 1.25];
  for (const u of units) totalByTeam[u.team]++;

  const releaseArcherFromTower = u => {
    if (!u || !u.garrisonTower) return;
    const tw = u.garrisonTower;
    if (tw.garrison) {
      const idx = tw.garrison.indexOf(u);
      if (idx >= 0) tw.garrison[idx] = null;
    }
    u.garrisonTower = null;
    u.garrisonSlot = -1;
    u.garrisonIdle = 0;
  };

  const destroyStructure = s => {
    if (!s || !s.alive) return;
    s.alive = false;
    // Dismount any archers atop a falling watchtower back down to ground safely (with a small fall hit)
    if (s.garrison) {
      for (let g = 0; g < s.garrison.length; g++) {
        const arch = s.garrison[g];
        if (arch) {
          arch.garrisonTower = null;
          arch.garrisonSlot = -1;
          arch.garrisonIdle = 0;
          if (arch.alive) {
            arch.hp -= 35;
            if (arch.hp <= 0) killUnit(arch);
          }
          s.garrison[g] = null;
        }
      }
    }
    const gy = armyGroundY(s.x, s.z);
    spawnFX(s.x, gy + 0.35, s.z, 0xc28b48, s.kind === 'tower' ? 2.2 : 1.55, 0.78);
    spawnFX(s.x, gy + 0.55, s.z, 0xff7b24, s.kind === 'tower' ? 1.85 : 1.15, 0.62);
    const idx = structures.indexOf(s);
    if (idx >= 0) structures.splice(idx, 1);
  };

  const damageStructure = (s, baseDmg, attackerType, attacker = null) => {
    if (!s || !s.alive) return;
    const mult = attackerType === 'skarbrand' ? 8.5
      : attackerType === 'siege' ? 7.5
        : attackerType === 'catapult' ? 6.5
          : attackerType === 'undead_champion' ? 3.6
            : attackerType === 'undead_warrior' || attackerType === 'undead_necro' ? 2.4
              : attackerType === 'mage' ? 2.4
                : attackerType === 'archer' ? 0.18
                  : 0.55;
    s.hp -= baseDmg * mult;
    const gy = armyGroundY(s.x, s.z);
    if (attackerType === 'siege' || attackerType === 'catapult' || aRand() > 0.65) {
      spawnFX(s.x + (aRand() - 0.5) * 0.4, gy + (s.kind === 'tower' ? 0.65 : 0.28), s.z + (aRand() - 0.5) * 0.4, 0xd4a45c, attackerType === 'siege' || attackerType === 'catapult' ? 1.15 : 0.48, 0.42);
    }
    if (s.hp <= 0) {
      destroyStructure(s);
    }
  };

  const killUnit = u => {
    if (!u.alive || u.type === 'hero') return; // Summoned Radiant Heroes cannot be killed!
    if (u.type === 'king' && !isKingMortal()) return; // Faction Kings are unkillable except in Wave 3!
    releaseArcherFromTower(u);
    u.alive = false;
    if (u.type === 'king') {
      // Heroic Wave 3 Sovereign Fall!
      const ky = armyGroundY(u.x, u.z);
      if (kingCrownSprites[u.team & 3]) kingCrownSprites[u.team & 3].visible = false;
      spawnFX(u.x, ky + 0.55, u.z, 0xffe46b, 2.8, 0.95, 0, 0.72, 0, 0);
      spawnFX(u.x, ky + 0.42, u.z, u.faction.primary, 2.1, 0.78, 0, 0.55, 0, 0);
      u.respawnWait = 9999;
    } else if (u.type === 'skarbrand') {
      UNDEAD_EVENT.bossAlive = false;
      skarbrandModel.root.visible = false;
      const sy = armyGroundY(u.x, u.z);
      spawnFX(u.x, sy + 0.9, u.z, 0xff4514, 4.8, 1.35, 0, 0.85, 0, 0);
      spawnFX(u.x, sy + 1.2, u.z, 0xffe066, 2.8, 0.85, 0, 1.15, 0, 0);
      return;
    } else if (u.team === 4) {
      // Undead respawn during active waves, but NEVER respawn once the 4 Heroes are reclaiming the realm!
      u.respawnWait = isHeroesReclaiming() ? 99999 : ((UNDEAD_EVENT.wave >= 3 ? 1.5 : UNDEAD_EVENT.wave === 2 ? 2.1 : 3.2) + aRand() * 1.4);
      spawnFX(u.x, armyGroundY(u.x, u.z) + 0.18, u.z, 0x5eff96, 0.65, 0.42, 0, 0.55, 0, 0);
    } else {
      const pwr = effTeamPower[u.team] || 1.0;
      const aliveFrac = aliveByTeam[u.team] / Math.max(1, totalByTeam[u.team]);
      const baseWait = u.type === 'mage' ? 15.5 : (aliveFrac < 0.45 ? 3.8 : pwr > 1.20 ? 4.4 : pwr < 0.84 ? 10.2 : 6.8);
      u.respawnWait = baseWait + aRand() * 4.5;
    }
    // Leave fallen body visibly on the battlefield for 22 seconds before despawning (capped at 360 for silky 60fps!)
    if (corpses.length >= 360) corpses.shift();
    corpses.push({
      x: u.x,
      y: armyGroundY(u.x, u.z),
      z: u.z,
      rotY: u.heading + (aRand() - 0.5) * 1.4,
      fallSide: aRand() > 0.5 ? 1 : -1,
      type: u.type,
      team: u.team,
      faction: u.faction,
      horseCoat: u.type === 'king' ? 0xf5f5f2 : u.horseCoat,
      age: 0,
      maxAge: 22.0,
    });
  };

  const provokeVictim = (victim, attacker) => {
    if (!victim || !victim.alive || !attacker || !attacker.alive || !areEnemies(victim.team, attacker.team)) return;
    // Undead NEVER focus on or turn toward the 4 Summoned Radiant Heroes!
    if (victim.team === 4 && attacker.type === 'hero') return;
    // During Wave 2 & Wave 3 Full Retreat to the Central Bridge, NEVER provoke retreating living troops back toward outer edges!
    if (isBridgeLastStand() && victim.team < 4 && victim.type !== 'hero') {
      if (distToCenterBridge(victim.x, victim.z) > BRIDGE_DEFENSE_RADIUS || distToCenterBridge(attacker.x, attacker.z) > BRIDGE_DEFENSE_RADIUS + 0.5) {
        return;
      }
    }
    victim.provokedBy = attacker;
    victim.provokeTimer = 8.0;
    // Only rally the entire squad if the attacker is actually fighting near the squad's own front
    const sqDist = Math.hypot(attacker.x - victim.squad.x, attacker.z - victim.squad.z);
    if (sqDist < 7.5) {
      victim.squad.provokedBy = attacker;
      victim.squad.provokeTimer = 7.5;
    }
  };

  // Rock-paper-scissors balance: melee troops shred exposed archers, catapults & mages once they close the distance!
  const getMeleeVsRangedMult = (atkType, victimType) => {
    const isCavOrKing = atkType === 'cavalry' || atkType === 'king' || atkType === 'hero';
    const isFootMelee = atkType === 'swordsman' || atkType === 'knight' || atkType === 'builder' || atkType === 'siege' || atkType === 'undead_warrior' || atkType === 'undead_champion';
    if (!isCavOrKing && !isFootMelee) return 1.0;
    if (victimType === 'archer') return isCavOrKing ? 3.4 : 2.6;
    if (victimType === 'catapult') return isCavOrKing ? 3.4 : 3.0;
    if (victimType === 'mage' || victimType === 'undead_necro') return isCavOrKing ? 2.1 : 1.75;
    return 1.0;
  };

  const applyDamage = (target, dmg, splash = 0, attackerTeam = -1, attacker = null) => {
    const atkType = attacker?.type || 'swordsman';
    if (splash > 0) {
      const rSq = splash * splash;
      const cx0 = Math.floor(target.x / CELL_SZ);
      const cz0 = Math.floor(target.z / CELL_SZ);
      const cellRad = Math.ceil(splash / CELL_SZ);
      for (let gx = cx0 - cellRad; gx <= cx0 + cellRad; gx++) {
        for (let gz = cz0 - cellRad; gz <= cz0 + cellRad; gz++) {
          const bucket = grid.get(cellKey(gx, gz));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const other = bucket[b];
            if (!other.alive || !areEnemies(attackerTeam, other.team)) continue;
            const dx = other.x - target.x;
            const dz = other.z - target.z;
            const dSq = dx * dx + dz * dz;
            if (dSq <= rSq) {
              if (other.type === 'hero') continue; // Summoned Radiant Heroes shrug off stray splash!
              if (other.type === 'king') {
                if (!isKingMortal()) {
                  provokeVictim(other, attacker);
                  if (aRand() > 0.62) spawnFX(other.x, armyGroundY(other.x, other.z) + 0.38, other.z, 0xffe878, 0.72, 0.32, 0, 0.35, 0, 0);
                  continue;
                }
                const falloffK = 1 - Math.sqrt(dSq) / (splash * 1.25);
                other.hp -= dmg * Math.max(0.35, falloffK) * 0.55; // Heavy Sovereign Plate armor makes Wave 3 Kings take longer to kill!
                if (aRand() > 0.55) spawnFX(other.x, armyGroundY(other.x, other.z) + 0.38, other.z, 0xffe878, 0.72, 0.32, 0, 0.35, 0, 0);
                if (other.hp <= 0) killUnit(other);
                else provokeVictim(other, attacker);
                continue;
              }
              const falloff = 1 - Math.sqrt(dSq) / (splash * 1.25);
              const coverMult = other.garrisonTower ? 0.35 : 1.0;
              const counterMult = getMeleeVsRangedMult(atkType, other.type);
              other.hp -= dmg * Math.max(0.35, falloff) * coverMult * counterMult;
              if (other.hp <= 0) killUnit(other);
              else provokeVictim(other, attacker);
            }
          }
        }
      }
      for (let si = structures.length - 1; si >= 0; si--) {
        const s = structures[si];
        if (!s.alive || !areEnemies(attackerTeam, s.team)) continue;
        const sd = Math.hypot(s.x - target.x, s.z - target.z);
        if (sd <= splash + 0.95) {
          damageStructure(s, dmg, atkType, attacker);
        }
      }
      return;
    }
    if (!target || !target.alive) return;
    if (target.team !== undefined && !areEnemies(attackerTeam, target.team)) return;
    if (target.type === 'hero') return;
    if (target.type === 'king') {
      if (!isKingMortal()) {
        provokeVictim(target, attacker);
        if (aRand() > 0.68) spawnFX(target.x, armyGroundY(target.x, target.z) + 0.38, target.z, 0xffe878, 0.65, 0.30, 0, 0.32, 0, 0);
        return;
      }
      target.hp -= dmg * 0.55; // Heavy Sovereign Plate armor makes Wave 3 Kings noticeably longer to kill!
      if (aRand() > 0.62) spawnFX(target.x, armyGroundY(target.x, target.z) + 0.38, target.z, 0xffe878, 0.65, 0.30, 0, 0.32, 0, 0);
      if (target.hp <= 0) killUnit(target);
      else provokeVictim(target, attacker);
      return;
    }
    if (target.isStructure) {
      damageStructure(target, dmg, atkType, attacker);
      return;
    }
    const coverMult = target.garrisonTower ? 0.35 : 1.0;
    const counterMult = getMeleeVsRangedMult(atkType, target.type);
    target.hp -= dmg * coverMult * counterMult;
    if (target.hp <= 0) killUnit(target);
    else provokeVictim(target, attacker);
  };

  // Fast 2D spatial grid hash so 1,200+ units search nearby enemies in <0.3ms per frame!
  const CELL_SZ = 3.0;
  const grid = new ReusableSpatialGrid();
  const cellKey = (cx, cz) => ((cx + 64) << 8) | (cz + 64);
  // Ultra-fine spatial hash for ALL ground troops (zero phasing / zero stacking across every unit type!)
  const SEP_CELL = 0.76;
  const sepGrid = new ReusableSpatialGrid();
  const sepKey = (cx, cz) => ((cx + 128) << 9) | (cz + 128);
  const solidGroundUnits = [];
  const teamBanCounts = [0, 0, 0, 0, 0];

  // Reusable scratch transforms & colors (ZERO allocations per frame!)
  // YXZ order guarantees every local weapon pitch/roll/lunge aligns strictly to each unit's heading!
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const cTmp = new THREE.Color();
  const cMagic = new THREE.Color();
  const cSteel = new THREE.Color(0xcbd2da);
  const cDarkSteel = new THREE.Color(0x525860);
  const cWood = new THREE.Color(0x7c5834);
  const cHelm = new THREE.Color(0xd2d7dd);
  const cSkin = new THREE.Color(0xe6c49e);
  const cHood = new THREE.Color(0x3a4a36);
  const cDeadTint = new THREE.Color(0x3a322c);

  function update(dt, t) {
    // 0A. Advance 3-Wave Undead Invasion -> 95% Conquest -> 4 Radiant Heroes Reclamation State Machine!
    if (UNDEAD_EVENT.phase === 'idle') {
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) startUndeadWarning();
    } else if (UNDEAD_EVENT.phase === 'warning') {
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) launchUndeadWave(1);
    } else if (UNDEAD_EVENT.phase === 'active') {
      UNDEAD_EVENT.activeElapsed += dt;
      UNDEAD_EVENT.undeadShare = territory?.getUndeadShare?.() || 0;
      const w1End = UNDEAD_EVENT.wave1Dur;
      const w2End = w1End + UNDEAD_EVENT.wave2Dur;
      const w3End = w2End + UNDEAD_EVENT.wave3Dur;
      if (UNDEAD_EVENT.undeadShare >= 95.0 && (UNDEAD_EVENT.wave >= 3 && UNDEAD_EVENT.livingAliveCount === 0)) {
        // After everyone is dead & Undead reach 95%: begin the 2-Minute Undead Reign so they spread across the entire map!
        startUndeadReign();
      } else if (UNDEAD_EVENT.wave === 1) {
        UNDEAD_EVENT.waveRemaining = Math.max(0, w1End - UNDEAD_EVENT.activeElapsed);
        if (UNDEAD_EVENT.activeElapsed >= w1End) launchUndeadWave(2);
      } else if (UNDEAD_EVENT.wave === 2) {
        UNDEAD_EVENT.waveRemaining = Math.max(0, w2End - UNDEAD_EVENT.activeElapsed);
        if (UNDEAD_EVENT.activeElapsed >= w2End) launchUndeadWave(3);
      } else {
        UNDEAD_EVENT.waveRemaining = Math.max(0, w3End - UNDEAD_EVENT.activeElapsed);
        effTeamPower[4] = Math.min(2.55, 2.05 + (UNDEAD_EVENT.activeElapsed - w2End) * 0.015);
      }
    } else if (UNDEAD_EVENT.phase === 'reign') {
      UNDEAD_EVENT.undeadShare = territory?.getUndeadShare?.() || 0;
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) {
        summonFourHeroes();
      }
    } else if (UNDEAD_EVENT.phase === 'heroes') {
      UNDEAD_EVENT.undeadShare = territory?.getUndeadShare?.() || 0;
      // Keep all 4 Radiant Heroes 100% unkillable & count remaining Undead + Skarbrand
      for (let h = 0; h < heroUnits.length; h++) {
        heroUnits[h].hp = UNIT_STATS.hero.hp;
        heroUnits[h].maxHp = UNIT_STATS.hero.hp;
      }
      let uLeft = skarbrandUnit.alive ? 1 : 0;
      for (let s = 0; s < undeadSquads.length; s++) {
        const mems = undeadSquads[s].members;
        for (let m = 0; m < mems.length; m++) {
          if (mems[m].alive) uLeft++;
        }
      }
      UNDEAD_EVENT.undeadAliveCount = uLeft;
      if (uLeft === 0) {
        UNDEAD_EVENT.heroClearTimer += dt;
        // Wait until the 4 Heroes have killed ALL Undead AND reclaimed EVERY territory (<= 0.5% blight),
        // with only a 25s stall failsafe below 2% for any unreachable 1-pixel cliff sliver!
        if (UNDEAD_EVENT.undeadShare < UNDEAD_EVENT.lastHeroBlight - 0.15) {
          UNDEAD_EVENT.lastHeroBlight = UNDEAD_EVENT.undeadShare;
          UNDEAD_EVENT.heroBlightStallTimer = 0;
        } else {
          UNDEAD_EVENT.heroBlightStallTimer += dt;
        }
        if (UNDEAD_EVENT.undeadShare <= 0.5 || (UNDEAD_EVENT.undeadShare <= 2.0 && UNDEAD_EVENT.heroBlightStallTimer >= 25.0)) {
          completeHeroReclamation();
        }
      } else {
        UNDEAD_EVENT.heroClearTimer = 0;
        UNDEAD_EVENT.lastHeroBlight = UNDEAD_EVENT.undeadShare;
        UNDEAD_EVENT.heroBlightStallTimer = 0;
      }
    } else if (UNDEAD_EVENT.phase === 'rebuild') {
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) {
        startPeaceEra();
      }
    } else if (UNDEAD_EVENT.phase === 'peace_era') {
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) {
        endPeaceEraToWar();
      }
    } else if (UNDEAD_EVENT.phase === 'aftermath') {
      UNDEAD_EVENT.timer -= dt;
      if (UNDEAD_EVENT.timer <= 0) {
        UNDEAD_EVENT.phase = 'idle';
        UNDEAD_EVENT.timer = 1800.0 + Math.random() * 1800.0; // Rare event: 30–60 minutes IRL between invasions!
      }
    }

    // Slow-blinking 2D Skull Indicators outside all 4 borders of the map (necrotic green in Warning/W1-2 -> crimson in Wave 3!)
    const showRifts = UNDEAD_EVENT.phase === 'warning' || UNDEAD_EVENT.phase === 'active';
    const isBossWave = UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 3;
    for (let i = 0; i < edgeRiftMarkers.length; i++) {
      const em = edgeRiftMarkers[i];
      em.sprite.visible = showRifts;
      if (showRifts) {
        // Smooth, slow eerie blinking (~3-second cycle) + subtle float
        const blink = 0.5 + 0.5 * Math.sin(t * 2.0 + em.phase);
        em.skullMat.opacity = 0.16 + blink * 0.82;
        em.skullMat.color.setHex(isBossWave ? 0xff4d1a : 0x74ff9e);
        em.sprite.position.y = em.baseY + Math.sin(t * 1.6 + em.phase) * 0.25;
        const sc = 3.05 + blink * 0.45;
        em.sprite.scale.set(sc, sc, 1);
      }
    }

    // 0. Advance Dynamic Shifting Tide-of-War Power Gaps (ebb & flow across all 4 houses, never a permanent wipeout!)
    REALM_TIDE.shiftTimer -= dt;
    if (REALM_TIDE.shiftTimer <= 0) {
      REALM_TIDE.shiftTimer = 28.0 + aRand() * 14.0;
      // Rotate who surges next — favor an underdog or contested faction so momentum constantly swings!
      const prevAsc = REALM_TIDE.ascendant;
      const prevBes = REALM_TIDE.besieged;
      const nextAsc = aRand() < 0.62 ? prevBes : (prevAsc + 1 + Math.floor(aRand() * 3)) % 4;
      let nextBes = (nextAsc + 1 + Math.floor(aRand() * 3)) % 4;
      if (nextBes === prevBes) nextBes = (nextBes + 1) % 4;
      if (nextBes === nextAsc) nextBes = (nextAsc + 2) % 4;
      REALM_TIDE.ascendant = nextAsc;
      REALM_TIDE.besieged = nextBes;
      for (let tm = 0; tm < 4; tm++) {
        if (tm === nextAsc) REALM_TIDE.target[tm] = 1.44 + aRand() * 0.24;      // Surging / Winning
        else if (tm === nextBes) REALM_TIDE.target[tm] = 0.64 + aRand() * 0.12; // Besieged / Under Pressure
        else REALM_TIDE.target[tm] = 0.92 + aRand() * 0.24;                     // Contested
      }
    }
    for (let tm = 0; tm < 4; tm++) {
      REALM_TIDE.power[tm] += (REALM_TIDE.target[tm] - REALM_TIDE.power[tm]) * Math.min(1, dt * 0.24);
      aliveByTeam[tm] = 0;
    }
    aliveByTeam[4] = 0;

    // Rebuild fast spatial grid & fine all-troop collision hash (skip troops healing inside an Event Venue!)
    grid.clear();
    sepGrid.clear();
    solidGroundUnits.length = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.insideVenue) continue;
      aliveByTeam[u.team]++;
      const k = cellKey(Math.floor(u.x / CELL_SZ), Math.floor(u.z / CELL_SZ));
      grid.add(k,u);
      if (!u.garrisonTower && UNIT_RAD[u.type]) {
        solidGroundUnits.push(u);
        const sk = sepKey(Math.floor(u.x / SEP_CELL), Math.floor(u.z / SEP_CELL));
        sepGrid.add(sk,u);
      }
    }
    // Automatic Heroic Last-Stand rubber-band if any team dips below 48% alive (no team can ever be wiped out!)
    let livingNonHeroAlive = 0;
    for (let tm = 0; tm < 4; tm++) {
      const frac = aliveByTeam[tm] / Math.max(1, totalByTeam[tm]);
      const lastStand = frac < 0.48 ? (0.48 - frac) * 1.65 : 0;
      effTeamPower[tm] = Math.min(1.72, REALM_TIDE.power[tm] + lastStand);
      livingNonHeroAlive += aliveByTeam[tm];
    }
    if (isHeroesReclaiming()) livingNonHeroAlive = Math.max(0, livingNonHeroAlive - 4);
    UNDEAD_EVENT.livingAliveCount = livingNonHeroAlive;

    // 1. Update Squad Rally Movement, Provocation Retaliation, 3-Bridge Crossing & Respawning
    const blockLivingRespawns = isNoLivingRespawn();
    const heroesActive = isHeroesReclaiming();
    const reignActive = isUndeadReign();
    for (const sq of squads) {
      if (sq.role === 'hero' && !heroesActive) continue;
      if (sq.team === 4 && UNDEAD_EVENT.phase !== 'active' && !reignActive && !heroesActive) continue;
      if (sq.team === 4 && UNDEAD_EVENT.phase === 'active' && (sq.waveTier || 1) > UNDEAD_EVENT.wave) continue;
      if (sq.role === 'boss' && !skarbrandUnit.alive) continue;
      let aliveCount = 0;
      let sumX = 0;
      let sumZ = 0;
      let escortAlive = 0;
      let kingUnit = null;
      for (const u of sq.members) {
        if (u.type === 'king') kingUnit = u;
        if (u.alive) {
          aliveCount++;
          sumX += u.x;
          sumZ += u.z;
          if (u.type !== 'king') escortAlive++;
        } else if (sq.role !== 'king' && sq.role !== 'hero') {
          u.respawnWait -= dt;
        }
      }

      if (sq.role === 'hero') {
        const hu = sq.members[0];
        if (!hu || !hu.alive) continue;
        sq.x = hu.x;
        sq.z = hu.z;
        sq.retargetTimer -= dt;
        const goalDist = Math.hypot(sq.goalX - sq.x, sq.goalZ - sq.z);
        if (goalDist < 1.6 || sq.retargetTimer <= 0) {
          const [gx, gz] = pickSquadGoal(sq.faction, sq);
          sq.goalX = gx;
          sq.goalZ = gz;
          sq.retargetTimer = UNDEAD_EVENT.undeadAliveCount === 0 ? 1.6 : 2.6;
        }
        const nav = steerAcrossRiver(sq.x, sq.z, sq.goalX, sq.goalZ);
        sq.isCrossing = nav.crossing;
        sq.heading = Math.atan2(nav.x - sq.x, nav.z - sq.z);
        continue;
      }

      if (sq.role === 'king' && kingUnit) {
        // During the 2-Minute Rebuild phase, revive each house's King & his 10 Knight Cavalries little by little from his Event Venue!
        if (isRebuilding()) {
          const [exitX, exitZ] = getKingSanctuary(sq.faction);
          for (const u of sq.members) {
            if (!u.alive) {
              u.respawnWait -= dt;
              if (u.respawnWait <= 0) {
                const st = UNIT_STATS[u.type];
                u.alive = true;
                u.insideVenue = false;
                u.maxHp = st.hp;
                u.hp = st.hp;
                u.provokedBy = null;
                u.provokeTimer = 0;
                const [ux, uz] = keepOnPassableLand(exitX + u.formX + (aRand() - 0.5) * 0.8, exitZ + u.formZ + (aRand() - 0.5) * 0.8, exitX, exitZ);
                u.x = ux;
                u.z = uz;
                u.cd = aRand() * st.cd;
                spawnFX(ux, armyGroundY(ux, uz) + 0.32, uz, 0xffe46b, u.type === 'king' ? 1.85 : 0.72, 0.55, 0, 0.45, 0, 0);
                aliveCount++;
              }
            }
          }
          if (aliveCount === 0) continue;
        }
        // If King died in Wave 3, his squad stays fallen (or surviving knights fight on) until Heroes reclaim the realm!
        if (!kingUnit.alive) {
          if (aliveCount === 0) continue;
        } else {
          // During Wave 2 Bridge Defense, let fallen Knight Cavalry escort respawn at the bridgehead so the King isn't left solo!
          if (isBridgeLastStand() && !blockLivingRespawns) {
            const bZones = BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]];
            for (const u of sq.members) {
              if (u.type !== 'king' && !u.alive) {
                u.respawnWait -= dt;
                if (u.respawnWait <= 0) {
                  const st = UNIT_STATS[u.type];
                  u.alive = true;
                  u.insideVenue = false;
                  u.hp = st.hp;
                  u.provokedBy = null;
                  u.provokeTimer = 0;
                  const [ux, uz] = keepOnPassableLand(bZones[0][0] + (aRand() - 0.5) * 1.4, bZones[0][1] + (aRand() - 0.5) * 1.4, bZones[0][0], bZones[0][1]);
                  u.x = ux;
                  u.z = uz;
                  u.cd = aRand() * st.cd;
                }
              }
            }
          }
          // Immortal King Royal Escort State Machine (disabled during Bridge Last Stand / Mortal Wave 3 / Rebuild / Peace Era!)
          const venue = sq.faction.venue;
          const [exitX, exitZ] = getKingSanctuary(sq.faction);

          if (!isBridgeLastStand() && !isKingMortal() && !isCalmAftermath() && sq.kingState === 'active' && escortAlive <= 3) {
            sq.kingState = 'retreating';
            sq.provokedBy = null;
            sq.provokeTimer = 0;
            sq.goalX = venue.x;
            sq.goalZ = venue.z;
            for (const u of sq.members) {
              u.provokedBy = null;
              u.provokeTimer = 0;
            }
          }

          if (sq.kingState === 'retreating') {
            sq.provokedBy = null;
            sq.provokeTimer = 0;
            sq.goalX = venue.x;
            sq.goalZ = venue.z;
            const distInside = Math.hypot(kingUnit.x - venue.x, kingUnit.z - venue.z);
            if (distInside < Math.min(2.3, venue.plateauR * 0.48)) {
              sq.kingState = 'resting';
              sq.kingRestTimer = 30.0;
              sq.kingRestFxCd = 0.6;
              sq.x = venue.x;
              sq.z = venue.z;
              const vy = terrainHeight(venue.x, venue.z);
              spawnFX(venue.x, vy + 1.15, venue.z, 0xffe46b, 1.95, 0.72, 0, 0.55, 0, 0);
              for (const u of sq.members) {
                u.insideVenue = true;
                u.provokedBy = null;
                u.provokeTimer = 0;
                u.x = venue.x;
                u.z = venue.z;
              }
              sq.isCrossing = false;
              continue;
            }
          } else if (sq.kingState === 'resting') {
            sq.provokedBy = null;
            sq.provokeTimer = 0;
            sq.kingRestTimer -= dt;
            sq.kingRestFxCd -= dt;
            if (sq.kingRestFxCd <= 0) {
              sq.kingRestFxCd = 1.45;
              const vy = terrainHeight(venue.x, venue.z);
              spawnFX(
                venue.x + (aRand() - 0.5) * 1.6, vy + 1.45, venue.z + (aRand() - 0.5) * 1.6,
                0xffe67a, 0.78, 0.95, 0, 0.65, 0, -0.08
              );
            }
            if (sq.kingRestTimer <= 0) {
              const outHeading = Math.atan2(exitX - venue.x, exitZ - venue.z);
              const cosH = Math.cos(outHeading);
              const sinH = Math.sin(outHeading);
              const ey = armyGroundY(exitX, exitZ);
              spawnFX(exitX, ey + 0.42, exitZ, 0xffe46b, 2.35, 0.78, 0, 0.48, 0, 0);
              spawnFX(exitX, ey + 0.56, exitZ, 0xffffff, 1.45, 0.52, 0, 0.58, 0, 0);
              sq.x = exitX;
              sq.z = exitZ;
              sq.heading = outHeading;
              for (const u of sq.members) {
                const st = UNIT_STATS[u.type];
                if (!u.alive && blockLivingRespawns) continue;
                u.alive = true;
                u.insideVenue = false;
                u.hp = st.hp;
                u.provokedBy = null;
                u.provokeTimer = 0;
                const wx = exitX + u.formX * cosH + u.formZ * sinH;
                const wz = exitZ - u.formX * sinH + u.formZ * cosH;
                const [ux, uz] = keepOnPassableLand(wx, wz, exitX, exitZ);
                u.x = ux;
                u.z = uz;
                u.heading = outHeading;
                u.cd = aRand() * st.cd;
                spawnFX(ux, armyGroundY(ux, uz) + 0.28, uz, 0xffe066, 0.78, 0.45, 0, 0.45, 0, 0);
              }
              sq.kingState = 'active';
              const [gx, gz] = pickSquadGoal(sq.faction, sq);
              sq.goalX = gx;
              sq.goalZ = gz;
              sq.retargetTimer = 16 + aRand() * 10;
            }
            sq.isCrossing = false;
            continue;
          }
        }
      } else if (sq.role === 'boss') {
        // Skarbrand does not respawn individually — he rampages as a singular Wave 3 Titan!
      } else if (sq.team === 4) {
        // Undead Hordes reinforce from outer edges during Waves 1-3, but STOP respawning once the 4 Heroes are summoned!
        if (heroesActive) {
          if (aliveCount === 0) continue;
        } else if (aliveCount === 0) {
          const [ex, ez] = UNDEAD_EDGE_SPAWNS[sq.edgeIdx];
          const [cx, cz] = keepOnPassableLand(ex, ez, ex, ez);
          sq.x = cx;
          sq.z = cz;
          const [gx, gz] = pickSquadGoal(UNDEAD_FACTION, sq);
          sq.goalX = gx;
          sq.goalZ = gz;
          for (const u of sq.members) {
            const st = UNIT_STATS[u.type];
            u.alive = true;
            u.undeadDormant = false;
            u.hp = st.hp;
            u.provokedBy = null;
            u.provokeTimer = 0;
            const [ux, uz] = keepOnPassableLand(cx + u.formX, cz + u.formZ, cx, cz);
            u.x = ux;
            u.z = uz;
            u.cd = aRand() * st.cd;
          }
          aliveCount = sq.members.length;
        } else {
          for (const u of sq.members) {
            if (!u.alive && u.respawnWait <= 0) {
              const st = UNIT_STATS[u.type];
              u.alive = true;
              u.undeadDormant = false;
              u.hp = st.hp;
              u.provokedBy = null;
              u.provokeTimer = 0;
              const edgePt = UNDEAD_EDGE_SPAWNS[(sq.edgeIdx + Math.floor(aRand() * 2)) % UNDEAD_EDGE_SPAWNS.length];
              const [ux, uz] = keepOnPassableLand(edgePt[0] + (aRand() - 0.5) * 1.4, edgePt[1] + (aRand() - 0.5) * 1.4, edgePt[0], edgePt[1]);
              u.x = ux;
              u.z = uz;
              u.cd = aRand() * st.cd;
              spawnFX(ux, armyGroundY(ux, uz) + 0.22, uz, 0x6dff9e, 0.72, 0.42, 0, 0.45, 0, 0);
            }
          }
        }
      } else if (isRebuilding()) {
        // 2-Minute Human Repopulation: each regiment's soldiers emerge directly across its own spread-out homeland sector!
        const rBaseX = sq.rebuildX !== undefined ? sq.rebuildX : sq.x;
        const rBaseZ = sq.rebuildZ !== undefined ? sq.rebuildZ : sq.z;
        for (const u of sq.members) {
          if (!u.alive && u.respawnWait <= 0) {
            const st = UNIT_STATS[u.type];
            u.alive = true;
            u.insideVenue = false;
            u.hp = st.hp;
            u.provokedBy = null;
            u.provokeTimer = 0;
            const spawnCX = aliveCount === 0 ? rBaseX : sq.x;
            const spawnCZ = aliveCount === 0 ? rBaseZ : sq.z;
            const [ux, uz] = keepOnPassableLand(
              spawnCX + u.formX + (aRand() - 0.5) * 1.8,
              spawnCZ + u.formZ + (aRand() - 0.5) * 1.8,
              rBaseX,
              rBaseZ
            );
            u.x = ux;
            u.z = uz;
            u.cd = aRand() * st.cd;
            if (aliveCount === 0) {
              sq.x = ux;
              sq.z = uz;
            }
            if (aRand() > 0.45) spawnFX(ux, armyGroundY(ux, uz) + 0.24, uz, 0xffe896, 0.58, 0.42, 0, 0.35, 0, 0);
            aliveCount++;
          }
        }
        if (aliveCount === 0) continue;
      } else if (aliveCount === 0) {
        // Wave 3 & Heroes No-Respawn Rule: wiped living regiments stay fallen until Heroes reclaim the realm!
        if (blockLivingRespawns) continue;
        const bZones = isBridgeLastStand() ? (BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]]) : null;
        const [spX, spZ] = bZones ? bZones[sq.id % bZones.length] : getTerritorySpawn(sq.faction);
        const [cleanSpX, cleanSpZ] = keepOnPassableLand(spX, spZ, spX, spZ);
        sq.x = cleanSpX;
        sq.z = cleanSpZ;
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        const [gx, gz] = pickSquadGoal(sq.faction, sq);
        sq.goalX = gx;
        sq.goalZ = gz;
        for (const u of sq.members) {
          const st = UNIT_STATS[u.type];
          u.alive = true;
          u.hp = st.hp;
          u.provokedBy = null;
          u.provokeTimer = 0;
          const [ux, uz] = keepOnPassableLand(cleanSpX + u.formX, cleanSpZ + u.formZ, cleanSpX, cleanSpZ);
          u.x = ux;
          u.z = uz;
          u.cd = aRand() * st.cd;
        }
        aliveCount = sq.members.length;
      } else if (!blockLivingRespawns) {
        const bZones = isBridgeLastStand() ? (BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]]) : null;
        for (const u of sq.members) {
          if (!u.alive && u.respawnWait <= 0) {
            const st = UNIT_STATS[u.type];
            u.alive = true;
            u.hp = st.hp;
            u.provokedBy = null;
            u.provokeTimer = 0;
            const [rX, rZ] = bZones ? bZones[sq.id % bZones.length] : getTerritorySpawn(sq.faction, sq.x, sq.z);
            const [ux, uz] = keepOnPassableLand(rX + (aRand() - 0.5) * 1.4, rZ + (aRand() - 0.5) * 1.4, rX, rZ);
            u.x = ux;
            u.z = uz;
            u.cd = aRand() * st.cd;
          }
        }
      }

      // Wave 2 & Wave 3 Full Retreat Check: living squads outside the Central Bridge perimeter march straight back!
      const isSqBridgeRetreat = isBridgeLastStand() && sq.team < 4 && distToCenterBridge(sq.x, sq.z) > 9.5;
      const allLivingWipedSweep = sq.team === 4 && UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 3 && UNDEAD_EVENT.livingAliveCount === 0;
      if (isSqBridgeRetreat) {
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        if (sq.role === 'king') {
          const [ax, az] = getFactionArmyAnchor(sq.team, true);
          sq.goalX = ax;
          sq.goalZ = az;
        } else if (distToCenterBridge(sq.goalX, sq.goalZ) > 9.0) {
          const bZones = BRIDGE_LAST_STAND_ZONES[sq.team] || [[0, BRIDGE_Z]];
          const bp = bZones[sq.id % bZones.length];
          sq.goalX = bp[0];
          sq.goalZ = bp[1];
        }
      } else if (sq.role === 'king' && sq.kingState === 'retreating') {
        // Stay locked on the retreat route back to the home Event Venue!
      } else if (sq.role === 'king') {
        // Kings ALWAYS stay tightly anchored to their own faction's living army (never pulled off alone by Undead aggro!)
        sq.provokedBy = null;
        sq.provokeTimer = 0;
        sq.retargetTimer -= dt;
        if (sq.retargetTimer <= 0 || Math.hypot(sq.goalX - sq.x, sq.goalZ - sq.z) < 1.6) {
          const [ax, az] = getFactionArmyAnchor(sq.team, isBridgeLastStand());
          sq.goalX = ax;
          sq.goalZ = az;
          sq.retargetTimer = 3.2;
        }
      } else if (sq.provokeTimer > 0) {
        sq.provokeTimer -= dt;
        const outsideBridgeProv = isBridgeLastStand() && sq.team < 4 && sq.provokedBy && distToCenterBridge(sq.provokedBy.x, sq.provokedBy.z) > BRIDGE_DEFENSE_RADIUS + 0.5;
        if (!sq.provokedBy || !sq.provokedBy.alive || sq.provokeTimer <= 0 || outsideBridgeProv) {
          sq.provokedBy = null;
          sq.provokeTimer = 0;
        } else {
          sq.goalX = sq.provokedBy.x;
          sq.goalZ = sq.provokedBy.z;
        }
      } else {
        sq.retargetTimer -= dt;
        const goalDist = Math.hypot(sq.goalX - sq.x, sq.goalZ - sq.z);
        // When all 4 houses are dead (only Undead + Dragon left!), keep each Undead horde LOCKED onto its unclaimed target
        // until it arrives OR that target (or Event Venue) is actually claimed by the Undead — then immediately march to the next!
        let needSweepRetarget = false;
        if (allLivingWipedSweep) {
          let targetVenueUnclaimed = false;
          for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
            const v = VENUE_SPECS[vi];
            if (Math.hypot(sq.goalX - v.x, sq.goalZ - v.z) <= v.plateauR + 1.8) {
              if (territory?.getVenueOwner?.(vi) !== 4) targetVenueUnclaimed = true;
              break;
            }
          }
          const goalAlreadyClaimed = !targetVenueUnclaimed && territory?.getOwnerAt?.(sq.goalX, sq.goalZ) === 4;
          needSweepRetarget = goalAlreadyClaimed || goalDist < 1.8 || sq.retargetTimer <= 0;
        }
        if (allLivingWipedSweep ? needSweepRetarget : (goalDist < 2.2 || sq.retargetTimer <= 0)) {
          if (allLivingWipedSweep) {
            const assignedGoals = [];
            for (let os = 0; os < squads.length; os++) {
              const otherSq = squads[os];
              if (otherSq !== sq && otherSq.team === 4) assignedGoals.push([otherSq.goalX, otherSq.goalZ]);
            }
            const [gx, gz] = territory?.pickUndeadTarget?.(sq, true, assignedGoals) || [0, BRIDGE_Z];
            sq.goalX = gx;
            sq.goalZ = gz;
            sq.retargetTimer = 28.0; // Stay committed all the way across the map until the pocket is actually claimed!
          } else {
            const [gx, gz] = pickSquadGoal(sq.faction, sq);
            sq.goalX = gx;
            sq.goalZ = gz;
            sq.retargetTimer = (sq.team === 4 && UNDEAD_EVENT.wave >= 3) ? (7 + aRand() * 5) : (14 + aRand() * 12);
          }
        }
      }

      // Clean 3-bridge crossing state machine (lines up on bridge centerline first -> marches straight across!)
      const nav = steerAcrossRiver(sq.x, sq.z, sq.goalX, sq.goalZ);
      sq.isCrossing = nav.crossing;

      // Only gently re-center banner on centroid when NOT crossing a bridge and NOT executing a full bridge retreat!
      if (!sq.isCrossing && !isSqBridgeRetreat && aliveCount > 0) {
        const pullX = (sq.role === 'king' && kingUnit && kingUnit.alive) ? kingUnit.x : (sumX / aliveCount);
        const pullZ = (sq.role === 'king' && kingUnit && kingUnit.alive) ? kingUnit.z : (sumZ / aliveCount);
        sq.x += (pullX - sq.x) * Math.min(1, dt * 0.9);
        sq.z += (pullZ - sq.z) * Math.min(1, dt * 0.9);
      }

      const dX = nav.x - sq.x;
      const dZ = nav.z - sq.z;
      const dLen = Math.hypot(dX, dZ);
      if (dLen > 0.22) {
        const baseSpd = (sq.role === 'king' && sq.kingState === 'retreating') ? 0.78
          : sq.role === 'boss' ? ((allLivingWipedSweep || reignActive) ? 1.15 : 0.64)
            : sq.team === 4 ? (allLivingWipedSweep ? 1.02 : reignActive ? 0.88 : 0.52)
              : (sq.role === 'cavalry' || sq.role === 'outrider' || sq.role === 'king') ? 0.62
                : (sq.role === 'siege' || sq.role === 'catapult') ? 0.27 : 0.40;
        const spd = isSqBridgeRetreat ? baseSpd * 1.42 : baseSpd;
        const step = Math.min(dLen, spd * dt);
        const allowVid = (sq.role === 'king' && sq.kingState === 'retreating') ? sq.faction.venue.id : -1;
        const [nx, nz] = keepOnPassableLand(sq.x + (dX / dLen) * step, sq.z + (dZ / dLen) * step, sq.x, sq.z, allowVid);
        sq.x = nx;
        sq.z = nz;
        sq.heading = Math.atan2(dX, dZ);
      }
    }

    // 1B. Manage Faction Fortification Cooldowns & Spawn New Barricade/Watchtower Sites!
    // During Peace Treaty / Undead Warning, houses rush to erect extra archer watchtowers & barricades facing the map edges!
    const treatyBuildBoost = isPeaceTreaty();
    const effMaxBar = treatyBuildBoost ? 8 : MAX_FAC_BARRICADES;
    const effMaxTow = treatyBuildBoost ? 4 : MAX_FAC_TOWERS;
    for (let tm = 0; tm < 4; tm++) {
      facBuildCd[tm] = Math.max(0, facBuildCd[tm] - dt * (treatyBuildBoost ? 2.4 : 1.0));
      if (facBuildCd[tm] <= 0 && territory?.pickFortifySpot) {
        let barCount = 0;
        let towCount = 0;
        let underConstruction = 0;
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (s.team === tm) {
            if (s.kind === 'barricade') barCount++;
            else towCount++;
            if (s.buildProg < 1) underConstruction++;
          }
        }
        const maxConcurrent = treatyBuildBoost ? 2 : 1;
        if (underConstruction < maxConcurrent && (barCount < effMaxBar || towCount < effMaxTow)) {
          const fMode = isBridgeLastStand() ? 'bridge' : treatyBuildBoost ? 'edge' : 'normal';
          const spot = territory.pickFortifySpot(tm, structures, fMode);
          if (spot) {
            const wantTower = towCount < effMaxTow && (barCount >= towCount * 2 || barCount >= effMaxBar);
            const kind = wantTower ? 'tower' : 'barricade';
            const maxHp = kind === 'tower' ? 680 : 520;
            const sObj = {
              isStructure: true,
              alive: true,
              kind,
              team: tm,
              faction: FACTIONS[tm],
              x: spot.x,
              z: spot.z,
              yaw: spot.yaw,
              hp: maxHp * (treatyBuildBoost ? 0.42 : 0.25),
              maxHp,
              buildProg: treatyBuildBoost ? 0.28 : 0.12,
              garrison: kind === 'tower' ? [null, null] : null,
            };
            structures.push(sObj);
            facBuildCd[tm] = treatyBuildBoost ? (3.2 + aRand() * 2.2) : (11.0 + aRand() * 7.0);
            const engSq = squads.find(sq => sq.team === tm && sq.role === 'engineer');
            if (engSq) {
              engSq.goalX = spot.x;
              engSq.goalZ = spot.z;
              engSq.retargetTimer = 18.0;
            }
          } else {
            facBuildCd[tm] = 3.0;
          }
        } else {
          facBuildCd[tm] = treatyBuildBoost ? 2.2 : 5.0;
        }
      }
    }

    // 2. Individual Unit AI: Builders Fortify & Repair, Archers Climb Watchtowers, Siege Smashes Defenses!
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.insideVenue) continue;
      const st = UNIT_STATS[u.type];
      u.cd = Math.max(0, u.cd - dt);
      u.swing = Math.max(0, u.swing - dt * 1.55);
      if (u.provokeTimer > 0) {
        u.provokeTimer -= dt;
        if (!u.provokedBy || !u.provokedBy.alive || u.provokeTimer <= 0) {
          u.provokedBy = null;
          u.provokeTimer = 0;
        }
      }
      if (u.type === 'catapult') {
        u.armPitch += (-0.46 - u.armPitch) * Math.min(1, dt * 1.65);
      }

      // 2A. BUILDER UNIT AI: Construct new frontier barricades/towers & repair damaged friendly structures!
      if (u.type === 'builder') {
        let workTarget = null;
        let bestWorkDist = 22.0;
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || s.team !== u.team) continue;
          if (s.buildProg >= 1 && s.hp >= s.maxHp - 1) continue;
          // During Wave 2 & 3 Full Bridge Retreat, Builders ONLY work on defenses around the Central Bridge!
          if (isBridgeLastStand() && distToCenterBridge(s.x, s.z) > 12.5) continue;
          const d = Math.hypot(s.x - u.x, s.z - u.z);
          // Strongly prioritize unfinished constructions and badly damaged towers/barricades
          const scoreDist = d - (s.buildProg < 1 ? 6.0 : 0);
          if (scoreDist < bestWorkDist) {
            bestWorkDist = scoreDist;
            workTarget = s;
          }
        }
        if (workTarget) {
          const dx = workTarget.x - u.x;
          const dz = workTarget.z - u.z;
          const dist = Math.hypot(dx, dz);
          u.heading = Math.atan2(dx, dz);
          if (dist <= 1.25) {
            // Hammer away to build or repair the structure!
            if (u.cd <= 0) {
              u.cd = 0.72 + aRand() * 0.25;
              u.swing = 1.0;
              const gy = armyGroundY(workTarget.x, workTarget.z);
              spawnFX(workTarget.x + (aRand() - 0.5) * 0.45, gy + 0.32, workTarget.z + (aRand() - 0.5) * 0.45, 0xffe08a, 0.45, 0.34);
            }
            const bMult = isPeaceTreaty() ? 2.45 : 1.0;
            if (workTarget.buildProg < 1) {
              workTarget.buildProg = Math.min(1, workTarget.buildProg + dt * 0.22 * bMult);
              workTarget.hp = Math.min(workTarget.maxHp, workTarget.hp + workTarget.maxHp * dt * 0.18 * bMult);
            } else {
              workTarget.hp = Math.min(workTarget.maxHp, workTarget.hp + dt * 36.0 * bMult);
            }
            continue;
          } else {
            const bNav = steerAcrossRiver(u.x, u.z, workTarget.x, workTarget.z);
            const ndx = bNav.x - u.x;
            const ndz = bNav.z - u.z;
            const nd = Math.hypot(ndx, ndz);
            if (nd > 0.08) {
              const step = Math.min(nd, st.speed * dt);
              const [nx, nz] = keepOnPassableLand(u.x + (ndx / nd) * step, u.z + (ndz / nd) * step, u.x, u.z);
              u.x = nx;
              u.z = nz;
              u.heading = Math.atan2(ndx, ndz);
              u.stridePhase += dt * 4.0;
            }
            continue;
          }
        }
      }

      // 2B. ARCHER WATCHTOWER GARRISONING: Archers climb friendly completed towers for elevated long-range sniping!
      if (u.type === 'archer') {
        if (u.garrisonTower) {
          const tw = u.garrisonTower;
          if (!tw.alive || tw.team !== u.team || (isBridgeLastStand() && distToCenterBridge(tw.x, tw.z) > 12.5)) {
            releaseArcherFromTower(u);
          } else {
            const sideOff = u.garrisonSlot === 0 ? -0.17 : 0.17;
            u.x = tw.x + Math.cos(tw.yaw) * sideOff;
            u.z = tw.z - Math.sin(tw.yaw) * sideOff;
            // Elevated sniper range (6.2 units!) from atop the watchtower!
            const towerRange = 6.2;
            let bestTgt = null;
            let bestDSq = towerRange * towerRange;
            const cx0 = Math.floor(u.x / CELL_SZ);
            const cz0 = Math.floor(u.z / CELL_SZ);
            const cellRad = Math.ceil(towerRange / CELL_SZ);
            for (let gx = cx0 - cellRad; gx <= cx0 + cellRad; gx++) {
              for (let gz = cz0 - cellRad; gz <= cz0 + cellRad; gz++) {
                const bucket = grid.get(cellKey(gx, gz));
                if (!bucket) continue;
                for (let b = 0; b < bucket.length; b++) {
                  const o = bucket[b];
                  if (!areEnemies(u.team, o.team)) continue;
                  const dSq = (o.x - u.x) * (o.x - u.x) + (o.z - u.z) * (o.z - u.z);
                  if (dSq < bestDSq) { bestDSq = dSq; bestTgt = o; }
                }
              }
            }
            if (bestTgt) {
              u.garrisonIdle = 0;
              const dist = Math.sqrt(bestDSq);
              u.heading = Math.atan2(bestTgt.x - u.x, bestTgt.z - u.z);
              if (u.cd <= 0 && projectiles.length < MAX_ARROWS + MAX_MAGIC + MAX_BOULDERS) {
                const teamPwr = effTeamPower[u.team] || 1.0;
                u.cd = st.cd * 0.86 * (0.88 + aRand() * 0.25);
                u.swing = 1.0;
                projectiles.push({
                  kind: 'arrow',
                  team: u.team,
                  attacker: u,
                  sx: u.x, sy: armyGroundY(tw.x, tw.z) + 1.12, sz: u.z,
                  tx: bestTgt.x + (aRand() - 0.5) * 0.22, ty: armyGroundY(bestTgt.x, bestTgt.z) + 0.14, tz: bestTgt.z + (aRand() - 0.5) * 0.22,
                  arc: 0.55 + dist * 0.11,
                  t: 0, dur: Math.max(0.75, dist / 3.8),
                  dmg: st.dmg * 1.35 * teamPwr, target: bestTgt, color: 0xf7e39c,
                });
              }
            } else {
              u.garrisonIdle = (u.garrisonIdle || 0) + dt;
              if (u.garrisonIdle > 26.0) releaseArcherFromTower(u);
            }
            continue;
          }
        } else {
          // Look for a nearby completed friendly watchtower with an open archer slot!
          for (let si = 0; si < structures.length; si++) {
            const s = structures[si];
            if (!s.alive || s.team !== u.team || s.kind !== 'tower' || s.buildProg < 1 || !s.garrison) continue;
            if (isBridgeLastStand() && distToCenterBridge(s.x, s.z) > 12.5) continue;
            const slot = s.garrison[0] === null ? 0 : (s.garrison[1] === null ? 1 : -1);
            if (slot < 0) continue;
            const d = Math.hypot(s.x - u.x, s.z - u.z);
            if (d < 1.15) {
              s.garrison[slot] = u;
              u.garrisonTower = s;
              u.garrisonSlot = slot;
              u.garrisonIdle = 0;
              break;
            } else if (d < 6.4) {
              // Run over to climb the watchtower ladder!
              const step = Math.min(d, st.speed * dt);
              const [nx, nz] = keepOnPassableLand(u.x + ((s.x - u.x) / d) * step, u.z + ((s.z - u.z) / d) * step, u.x, u.z);
              u.x = nx;
              u.z = nz;
              u.heading = Math.atan2(s.x - u.x, s.z - u.z);
              u.stridePhase += dt * 4.0;
              break;
            }
          }
          if (u.garrisonTower) continue;
        }
      }

      // Close-proximity spatial-grid enemy search (fast O(1) cell lookup!)
      // Disengage cleanly from edge combat when retreating to a home venue, executing the Wave 2 & 3 Full Bridge Retreat, OR when a King rejoins his own army!
      const isKingRetreat = u.squad.role === 'king' && u.squad.kingState === 'retreating';
      const isKingResting = u.squad.role === 'king' && u.squad.kingState === 'resting';
      const isBridgeRetreating = isBridgeLastStand() && u.team < 4 && u.type !== 'hero' && distToCenterBridge(u.x, u.z) > BRIDGE_DEFENSE_RADIUS;
      const isKingRejoiningArmy = u.type === 'king' && !isKingRetreat && !isKingResting && Math.hypot(u.x - u.squad.goalX, u.z - u.squad.goalZ) > 3.4;
      u.kingChargeThrough = (u.type === 'king') && (isKingRetreat || isBridgeRetreating || isKingRejoiningArmy);
      const isHoldingBridge = isBridgeLastStand() && u.team < 4 && u.type !== 'hero' && !isBridgeRetreating;
      const skipCombat = isKingRetreat || isKingResting || isBridgeRetreating || isKingRejoiningArmy;
      const aggroR = u.type === 'hero' ? 11.5 : u.type === 'skarbrand' ? 9.5 : u.type === 'catapult' ? 6.4 : u.type === 'mage' ? 5.65 : u.type === 'undead_necro' ? 4.85 : u.type === 'archer' ? 3.95 : u.type === 'king' ? 2.15 : (u.team === 4 ? 3.4 : 2.25);
      let best = null;
      let bestDistSq = aggroR * aggroR;

      // SIEGE, CATAPULT, SKARBRAND & UNDEAD PRIORITY: Smash enemy Watchtowers & Barricades!
      if (!skipCombat && (u.type === 'catapult' || u.type === 'siege' || u.type === 'undead_champion' || u.type === 'skarbrand')) {
        const structScanR = u.type === 'catapult' ? 12.5 : u.type === 'siege' ? 10.5 : u.type === 'skarbrand' ? 7.5 : 5.5;
        let bestStruct = null;
        let bestStructDSq = structScanR * structScanR;
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || !areEnemies(u.team, s.team)) continue;
          const dSq = (s.x - u.x) * (s.x - u.x) + (s.z - u.z) * (s.z - u.z);
          if (dSq < bestStructDSq) {
            bestStructDSq = dSq;
            bestStruct = s;
          }
        }
        if (bestStruct) {
          best = bestStruct;
          bestDistSq = bestStructDSq;
        }
      }

      if (!best && !skipCombat) {
        const cx0 = Math.floor(u.x / CELL_SZ);
        const cz0 = Math.floor(u.z / CELL_SZ);
        const cellRad = Math.ceil(aggroR / CELL_SZ);
        const isRangedShooter = u.type === 'archer' || u.type === 'mage' || u.type === 'catapult' || u.type === 'undead_necro';
        for (let gx = cx0 - cellRad; gx <= cx0 + cellRad; gx++) {
          for (let gz = cz0 - cellRad; gz <= cz0 + cellRad; gz++) {
            const bucket = grid.get(cellKey(gx, gz));
            if (!bucket) continue;
            for (let b = 0; b < bucket.length; b++) {
              const o = bucket[b];
              if (!areEnemies(u.team, o.team)) continue;
              // Undead NEVER focus or target the 4 Summoned Radiant Heroes!
              if (u.team === 4 && o.type === 'hero') continue;
              // While a Hero's own default homeland still has blighted land, focus on enemies inside their own homeland (only cleaving outside enemies if right beside them!)
              if (u.type === 'hero' && territory?.getLostHomelandCount?.(u.team) > 0 && territory?.getInitialOwnerAt?.(o.x, o.z) !== u.team && ((o.x - u.x) * (o.x - u.x) + (o.z - u.z) * (o.z - u.z)) > 4.0 * 4.0) continue;
              // Wave 2 & 3 Bridge Defenders NEVER chase undead outside the Central Bridge perimeter!
              if (isHoldingBridge && !isRangedShooter && distToCenterBridge(o.x, o.z) > BRIDGE_DEFENSE_RADIUS + 1.0) continue;
              // Kings stay close to their own army instead of wandering away to chase distant enemies!
              if (u.type === 'king' && Math.hypot(o.x - u.squad.goalX, o.z - u.squad.goalZ) > 3.8) continue;
              // Ground melee cannot strike archers elevated atop a watchtower — they must smash the tower first!
              if (o.garrisonTower && !isRangedShooter) continue;
              // Prevent two immortal Kings from locking in an eternal solo duel if their Royal Guard has ridden on!
              if (u.type === 'king' && o.type === 'king' && Math.hypot(u.squad.x - u.x, u.squad.z - u.z) > 5.0) continue;
              const dx = o.x - u.x;
              const dz = o.z - u.z;
              const dSq = dx * dx + dz * dz + (u.type === 'king' && o.type === 'king' ? 0.25 : 0);
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                best = o;
              }
            }
          }
        }
      }

      // Check if an enemy Barricade or Watchtower is directly blocking this melee unit's path!
      if (!best && !skipCombat && u.type !== 'archer' && u.type !== 'mage' && u.type !== 'undead_necro' && u.type !== 'hero') {
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || !areEnemies(u.team, s.team)) continue;
          const dSq = (s.x - u.x) * (s.x - u.x) + (s.z - u.z) * (s.z - u.z);
          if (dSq < 2.25 * 2.25) {
            best = s;
            bestDistSq = dSq;
            break;
          }
        }
      }

      // If no enemy is right next to us, check if we (or our squad) were PROVOKED by an attacker!
      const provoker = (u.provokedBy && u.provokedBy.alive && areEnemies(u.team, u.provokedBy.team))
        ? u.provokedBy
        : (u.squad.provokedBy && u.squad.provokedBy.alive && areEnemies(u.team, u.squad.provokedBy.team) ? u.squad.provokedBy : null);
      const validProvoker = provoker
        && !(u.team === 4 && provoker.type === 'hero')
        && !(isHoldingBridge && distToCenterBridge(provoker.x, provoker.z) > BRIDGE_DEFENSE_RADIUS + 0.8);
      if (!best && !skipCombat && validProvoker && (!provoker.garrisonTower || u.type === 'archer' || u.type === 'mage' || u.type === 'catapult' || u.type === 'undead_necro')) {
        const pdx = provoker.x - u.x;
        const pdz = provoker.z - u.z;
        const pDistSq = pdx * pdx + pdz * pdz;
        if (pDistSq < 18 * 18) {
          best = provoker;
          bestDistSq = pDistSq;
        }
      }

      // Compress into a neat marching column when crossing any of the 3 bridges so everyone files across smoothly!
      const colScale = u.squad.isCrossing ? 0.24 : 1.0;
      const cosH = Math.cos(u.squad.heading);
      const sinH = Math.sin(u.squad.heading);
      const fx = u.formX * colScale;
      const fz = u.formZ * (u.squad.isCrossing ? 0.65 : 1.0);
      const formWorldX = u.squad.x + fx * cosH + fz * sinH;
      const formWorldZ = u.squad.z - fx * sinH + fz * cosH;

      let moveToX = formWorldX;
      let moveToZ = formWorldZ;
      let shouldMove = true;

      if (best) {
        const dist = Math.sqrt(bestDistSq);
        const dx = best.x - u.x;
        const dz = best.z - u.z;
        u.heading = Math.atan2(dx, dz);
        const isMeleeUnit = u.type !== 'archer' && u.type !== 'mage' && u.type !== 'catapult' && u.type !== 'undead_necro';
        const effRange = best.isStructure
          ? Math.max(st.range, u.type === 'siege' ? 1.28 : u.type === 'catapult' ? 6.0 : (best.kind === 'barricade' ? 1.12 : 0.92))
          : (isMeleeUnit ? Math.max(st.range, (UNIT_RAD[u.type] || 0.15) + (UNIT_RAD[best.type] || 0.15) + 0.09) : st.range);

        // Rear-rank melee check: a melee soldier behind an ally waits his turn (or flanks) until the front soldier dies!
        let blockedByFrontAlly = false;
        const myMeleeR = IS_MELEE_RANK[u.type] ? UNIT_RAD[u.type] : 0;
        if (myMeleeR && !best.isStructure && dist <= effRange + 0.35 && dist > 1e-4) {
          const dirX = dx / dist;
          const dirZ = dz / dist;
          const scx = Math.floor(u.x / SEP_CELL);
          const scz = Math.floor(u.z / SEP_CELL);
          for (let gx = scx - 1; gx <= scx + 1 && !blockedByFrontAlly; gx++) {
            for (let gz = scz - 1; gz <= scz + 1 && !blockedByFrontAlly; gz++) {
              const sb = sepGrid.get(sepKey(gx, gz));
              if (!sb) continue;
              for (let b = 0; b < sb.length; b++) {
                const ally = sb[b];
                if (ally === u || ally.team !== u.team || !ally.alive || ally.insideVenue || ally.garrisonTower) continue;
                const ax = ally.x - u.x;
                const az = ally.z - u.z;
                const fwd = ax * dirX + az * dirZ;
                if (fwd > 0.04 && fwd < dist) {
                  const lat = Math.abs(ax * (-dirZ) + az * dirX);
                  if (lat < (myMeleeR + (UNIT_RAD[ally.type] || 0.15)) * 0.88) {
                    blockedByFrontAlly = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (dist <= effRange && !blockedByFrontAlly) {
          shouldMove = false;
          // Catapults have a minimum firing distance (1.85) — helpless once melee troops rush their wheels!
          const catTooClose = u.type === 'catapult' && !best.isStructure && dist < 1.85;
          if (u.cd <= 0 && !catTooClose) {
            const teamPwr = effTeamPower[u.team] || 1.0;
            const scaledDmg = st.dmg * teamPwr;
            // Ground archers caught in point-blank melee panic (slower draw & much weaker close shots!)
            const archerCaughtInMelee = u.type === 'archer' && !u.garrisonTower && dist < 0.90;
            u.cd = st.cd * (archerCaughtInMelee ? 1.45 : 1.0) * (0.88 + aRand() * 0.28);
            u.swing = 1.0;
            if (u.type === 'archer') {
              if (projectiles.length < MAX_ARROWS + MAX_MAGIC + MAX_BOULDERS) {
                projectiles.push({
                  kind: 'arrow',
                  team: u.team,
                  attacker: u,
                  sx: u.x, sy: armyGroundY(u.x, u.z) + 0.18, sz: u.z,
                  tx: best.x + (aRand() - 0.5) * 0.25, ty: armyGroundY(best.x, best.z) + (best.garrisonTower ? 1.02 : 0.12), tz: best.z + (aRand() - 0.5) * 0.25,
                  arc: 0.78 + dist * 0.15,
                  t: 0, dur: Math.max(0.82, dist / 3.4),
                  dmg: scaledDmg * (archerCaughtInMelee ? 0.38 : 1.0), target: best, color: 0xf7e39c,
                });
              }
            } else if (u.type === 'mage' || u.type === 'undead_necro') {
              const castY = armyGroundY(u.x, u.z) + 0.42;
              const isNecro = u.type === 'undead_necro';
              spawnFX(u.x, castY, u.z, u.faction.magic, isNecro ? 0.88 : 1.05, 0.40, 0, 0.35, 0, 0);
              spawnFX(u.x, castY + 0.06, u.z, isNecro ? 0xc2ffd8 : 0xffffff, 0.52, 0.26, 0, 0.25, 0, 0);
              projectiles.push({
                kind: 'magic',
                team: u.team,
                attacker: u,
                sx: u.x, sy: castY, sz: u.z,
                tx: best.x, ty: armyGroundY(best.x, best.z) + 0.16, tz: best.z,
                arc: 0.72 + dist * 0.08,
                t: 0, dur: Math.max(0.88, dist / 3.1),
                trailCd: 0,
                dmg: scaledDmg, splash: isNecro ? 1.05 : 1.65, target: best, color: u.faction.magic,
              });
            } else if (u.type === 'catapult') {
              u.armPitch = 1.65;
              const launchY = armyGroundY(u.x, u.z) + 0.44;
              // Blazing pitch ignition flare & smoke puff right as the catapult fires!
              spawnFX(u.x, launchY, u.z, 0xffaa33, 1.05, 0.36, 0, 0.55, 0, 0);
              spawnFX(u.x, launchY + 0.10, u.z, 0x3b3530, 0.85, 0.55, 0, 0.65, 0, 0);
              projectiles.push({
                kind: 'boulder',
                team: u.team,
                attacker: u,
                sx: u.x, sy: launchY, sz: u.z,
                tx: best.x + (aRand() - 0.5) * 0.38, ty: armyGroundY(best.x, best.z) + (best.isStructure ? 0.42 : 0.06), tz: best.z + (aRand() - 0.5) * 0.38,
                arc: 2.45 + dist * 0.24,
                t: 0, dur: Math.max(1.75, dist / 2.35),
                trailCd: 0,
                dmg: scaledDmg, splash: 1.55, target: best, color: 0xff6e18,
              });
            } else {
              // Close-quarters melee / Skarbrand Khorne Fire Cleave / Radiant Hero Cleave / King royal cleave / cavalry lance / ram slam!
              if (u.type === 'skarbrand') u.swingAlt = -(u.swingAlt || 1);
              const meleeSplash = u.type === 'skarbrand' ? 2.45 : u.type === 'hero' ? 1.75 : u.type === 'king' ? 0.62 : (u.type === 'siege' && !best.isStructure ? 0.85 : 0);
              const vsRanged = best.type === 'archer' || best.type === 'catapult' || best.type === 'mage';
              applyDamage(best, scaledDmg, meleeSplash, u.team, u);
              const mx = (u.x + best.x) * 0.5;
              const mz = (u.z + best.z) * 0.5;
              const my = armyGroundY(mx, mz) + (u.type === 'skarbrand' ? 0.55 : u.type === 'hero' ? 0.45 : u.type === 'king' ? 0.34 : u.type === 'cavalry' ? 0.24 : 0.17);
              if (u.type === 'skarbrand') {
                // Colossal Fiery Khorne Dual-Axe Slam Shockwave!
                spawnFX(mx, my, mz, 0xff4012, 3.1, 0.68, 0, 0.55, 0, 0);
                spawnFX(mx, my + 0.12, mz, 0xffd252, 1.85, 0.44, 0, 0.72, 0, 0);
                for (let k = 0; k < 5; k++) {
                  const ang = (k / 5) * Math.PI * 2 + aRand() * 0.6;
                  spawnFX(mx, my, mz, k % 2 === 0 ? 0xff4514 : 0xffb838, 0.78, 0.55, Math.cos(ang) * 1.9, 1.65, Math.sin(ang) * 1.9, 4.2);
                }
              } else if (u.type === 'hero') {
                // Blazing Radiant Hero Purifying Cleave Shockwave!
                spawnFX(mx, my, mz, 0xffe878, 2.5, 0.58, 0, 0.58, 0, 0);
                spawnFX(mx, my + 0.10, mz, u.faction.magic, 1.85, 0.44, 0, 0.68, 0, 0);
                for (let k = 0; k < 4; k++) {
                  const ang = (k / 4) * Math.PI * 2 + aRand() * 0.6;
                  spawnFX(mx, my, mz, k % 2 === 0 ? 0xffffff : 0xffe46b, 0.68, 0.48, Math.cos(ang) * 1.5, 1.45, Math.sin(ang) * 1.5, 3.4);
                }
              } else if (u.type === 'king') {
                spawnFX(mx, my, mz, 0xffe46b, 1.12, 0.38, 0, 0.52, 0, 0);
                spawnFX(mx, my + 0.05, mz, 0xffffff, 0.58, 0.26, (aRand() - 0.5) * 0.85, 0.85, (aRand() - 0.5) * 0.85, 1.8);
              } else if (u.type === 'siege') {
                spawnFX(mx, my + 0.08, mz, 0xffae42, 1.15, 0.44, 0, 0.45, 0, 0);
                spawnFX(mx, my + 0.05, mz, 0xc79558, 0.72, 0.48, (aRand() - 0.5) * 0.9, 0.95, (aRand() - 0.5) * 0.9, 2.2);
              } else if (vsRanged) {
                // Bright close-quarters breakthrough hit spark when melee troops tear into exposed ranged units!
                spawnFX(mx, my, mz, 0xffc85a, u.type === 'cavalry' || u.type === 'knight' ? 0.72 : 0.58, 0.34, (aRand() - 0.5) * 0.75, 0.82, (aRand() - 0.5) * 0.75, 1.8);
              } else if (aRand() > 0.24) {
                spawnFX(mx, my, mz, u.type === 'knight' ? 0xfff6c4 : 0xffe49c, u.type === 'knight' || u.type === 'cavalry' ? 0.54 : 0.42, 0.30, (aRand() - 0.5) * 0.65, 0.75, (aRand() - 0.5) * 0.65, 1.8);
              }
            }
          }
        } else if (blockedByFrontAlly) {
          // Wait snugly right behind the ally in front (with a gentle flank drift to form natural battle lines!)
          const flankSide = (u.uid % 2 === 0 ? 1 : -1);
          const dirX = dx / Math.max(0.01, dist);
          const dirZ = dz / Math.max(0.01, dist);
          moveToX = best.x + (-dirZ) * flankSide * 0.36;
          moveToZ = best.z + dirX * flankSide * 0.36;
        } else if (u.type !== 'catapult' || best === provoker || best.isStructure) {
          // Charge directly toward close enemy, provoked attacker, or enemy tower/barricade!
          moveToX = best.x;
          moveToZ = best.z;
        }
      }

      if (shouldMove) {
        let moveTargetX = (isKingRetreat || isBridgeRetreating || isKingRejoiningArmy || u.type === 'hero') && !best ? u.squad.goalX : moveToX;
        let moveTargetZ = (isKingRetreat || isBridgeRetreating || isKingRejoiningArmy || u.type === 'hero') && !best ? u.squad.goalZ : moveToZ;
        if (isKingRetreat || isBridgeRetreating || isKingRejoiningArmy) {
          moveTargetX = u.squad.goalX;
          moveTargetZ = u.squad.goalZ;
        } else if (isHoldingBridge && distToCenterBridge(moveTargetX, moveTargetZ) > BRIDGE_DEFENSE_RADIUS) {
          // Keep bridge defenders anchored inside the Central Bridge perimeter (never chase enemies back toward map edges!)
          moveTargetX = u.squad.goalX;
          moveTargetZ = u.squad.goalZ;
        }
        const uNav = steerAcrossRiver(u.x, u.z, moveTargetX, moveTargetZ);
        const dx = uNav.x - u.x;
        const dz = uNav.z - u.z;
        const d = Math.hypot(dx, dz);
        if (d > (isKingResting ? 0.16 : 0.08)) {
          const allDeadUndeadBoost = u.team === 4 && ((UNDEAD_EVENT.phase === 'active' && UNDEAD_EVENT.wave >= 3 && UNDEAD_EVENT.livingAliveCount === 0) || isUndeadReign());
          const effSpeed = isKingRejoiningArmy ? st.speed * 1.48 : isBridgeRetreating ? st.speed * 1.40 : isKingRetreat ? st.speed * 1.24 : allDeadUndeadBoost ? st.speed * (isUndeadReign() ? 1.58 : 1.85) : st.speed;
          const step = Math.min(d, effSpeed * dt);
          const allowVid = isKingRetreat ? u.faction.venue.id : -1;
          let [nx, nz] = keepOnPassableLand(u.x + (dx / d) * step, u.z + (dz / d) * step, u.x, u.z, allowVid);
          // Physical Enemy Barricade Collision: completed enemy barricades block enemy melee & cavalry!
          for (let si = 0; si < structures.length; si++) {
            const s = structures[si];
            if (!s.alive || !areEnemies(u.team, s.team) || s.buildProg < 0.5) continue;
            const blockR = s.kind === 'barricade' ? 0.96 : 0.72;
            const bdx = nx - s.x;
            const bdz = nz - s.z;
            const bd = Math.hypot(bdx, bdz);
            if (bd < blockR && bd > 1e-4) {
              nx = s.x + (bdx / bd) * blockR;
              nz = s.z + (bdz / bd) * blockR;
            }
          }
          u.x = nx;
          u.z = nz;
          u.heading = Math.atan2(dx, dz);
          u.stridePhase += dt * ((u.type === 'cavalry' || u.type === 'king' || u.type === 'hero') ? 5.0 : 3.8);
        }
      }
    }

    // 2C. Solid Physical Non-Stacking & Anti-Phasing Separation across ALL Ground Troops!
    // Every troop type (Swordsmen, Knights, Archers, Archmages, Cavalry, Kings, Builders, Rams & Catapults)
    // physically occupies its own footprint so ZERO troops can phase through or stack on top of each other!
    for (let pass = 0; pass < 3; pass++) {
      sepGrid.clear();
      for (let i = 0; i < solidGroundUnits.length; i++) {
        const u = solidGroundUnits[i];
        if (!u.alive || u.insideVenue || u.garrisonTower) continue;
        const sk = sepKey(Math.floor(u.x / SEP_CELL), Math.floor(u.z / SEP_CELL));
        sepGrid.add(sk,u);
      }
      for (let i = 0; i < solidGroundUnits.length; i++) {
        const u = solidGroundUnits[i];
        if (!u.alive || u.insideVenue || u.garrisonTower) continue;
        const rU = UNIT_RAD[u.type] || 0.145;
        const mU = u.kingChargeThrough ? 65.0 : (UNIT_MASS[u.type] || 1.0);
        const scx = Math.floor(u.x / SEP_CELL);
        const scz = Math.floor(u.z / SEP_CELL);
        for (let gx = scx - 1; gx <= scx + 1; gx++) {
          for (let gz = scz - 1; gz <= scz + 1; gz++) {
            const sb = sepGrid.get(sepKey(gx, gz));
            if (!sb) continue;
            for (let b = 0; b < sb.length; b++) {
              const o = sb[b];
              if (u.uid >= o.uid || !o.alive || o.insideVenue || o.garrisonTower) continue;
              const rO = UNIT_RAD[o.type] || 0.145;
              const minD = rU + rO;
              let dx = o.x - u.x;
              let dz = o.z - u.z;
              const dSq = dx * dx + dz * dz;
              if (dSq >= minD * minD) continue;
              let d = Math.sqrt(dSq);
              if (d < 1e-4) {
                const ang = ((u.uid * 37 + o.uid * 17) & 255) * (Math.PI * 2 / 256);
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1;
              } else {
                dx /= d;
                dz /= d;
              }
              const bridgeSoft = (u.squad.isCrossing || o.squad.isCrossing) ? 0.50 : 0.90;
              const overlap = (minD - d) * bridgeSoft;
              const mO = o.kingChargeThrough ? 65.0 : (UNIT_MASS[o.type] || 1.0);
              const invSum = 1 / (mU + mO);
              const pushU = overlap * (mO * invSum);
              const pushO = overlap * (mU * invSum);
              const allowU = (u.squad.role === 'king' && u.squad.kingState === 'retreating') ? u.faction.venue.id : -1;
              const allowO = (o.squad.role === 'king' && o.squad.kingState === 'retreating') ? o.faction.venue.id : -1;
              const [ux2, uz2] = keepOnPassableLand(u.x - dx * pushU, u.z - dz * pushU, u.x, u.z, allowU);
              const [ox2, oz2] = keepOnPassableLand(o.x + dx * pushO, o.z + dz * pushO, o.x, o.z, allowO);
              u.x = ux2;
              u.z = uz2;
              o.x = ox2;
              o.z = oz2;
            }
          }
        }
      }
    }

    // 3. Advance Flying Projectiles (Arrows, Archmage Comets with Star Trails, Blazing Catapult Fireballs!)
    let arrowC = 0, magicC = 0, boulderC = 0, auraC = 0;
    const maxAura = MAX_BOULDERS + MAX_MAGIC;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.t += dt / pr.dur;
      if (pr.t >= 1) {
        if (pr.kind === 'boulder') {
          applyDamage({ x: pr.tx, z: pr.tz }, pr.dmg, pr.splash, pr.team, pr.attacker);
          // Spectacular multi-stage catapult fireball explosion (white flash + roaring fire dome + flying embers + billowing dark smoke!)
          spawnFX(pr.tx, pr.ty + 0.16, pr.tz, 0xfff4c2, 1.95, 0.38, 0, 0.45, 0, 0);
          spawnFX(pr.tx, pr.ty + 0.22, pr.tz, 0xff6a14, 3.05, 0.82, 0, 0.65, 0, 0);
          spawnFX(pr.tx, pr.ty + 0.38, pr.tz, 0xffb838, 2.15, 0.65, 0, 0.90, 0, 0);
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + aRand() * 0.6;
            const spd = 1.15 + aRand() * 1.45;
            spawnFX(
              pr.tx, pr.ty + 0.18, pr.tz,
              k % 2 === 0 ? 0xff5a12 : 0xffd152,
              0.68 + aRand() * 0.32,
              0.62 + aRand() * 0.28,
              Math.cos(ang) * spd, 1.65 + aRand() * 1.3, Math.sin(ang) * spd, 4.4
            );
          }
          for (let s = 0; s < 3; s++) {
            spawnFX(
              pr.tx + (aRand() - 0.5) * 0.48, pr.ty + 0.30, pr.tz + (aRand() - 0.5) * 0.48,
              0x2d2723, 1.45 + aRand() * 0.55, 1.25 + aRand() * 0.45,
              (aRand() - 0.5) * 0.35, 0.85 + aRand() * 0.45, (aRand() - 0.5) * 0.35, -0.15
            );
          }
        } else if (pr.kind === 'magic') {
          applyDamage({ x: pr.tx, z: pr.tz }, pr.dmg, pr.splash, pr.team, pr.attacker);
          // Devastating Archmage Arcane Nova detonation!
          spawnFX(pr.tx, pr.ty + 0.18, pr.tz, 0xffffff, 1.75, 0.36, 0, 0.30, 0, 0);
          spawnFX(pr.tx, pr.ty + 0.20, pr.tz, pr.color, 3.10, 0.78, 0, 0.45, 0, 0);
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + aRand() * 0.5;
            const spd = 1.4 + aRand() * 1.3;
            spawnFX(
              pr.tx, pr.ty + 0.22, pr.tz,
              k % 2 === 0 ? pr.color : 0xfff2c2,
              0.62 + aRand() * 0.28,
              0.56 + aRand() * 0.24,
              Math.cos(ang) * spd, 1.25 + aRand() * 0.95, Math.sin(ang) * spd, 2.4
            );
          }
        } else {
          applyDamage(pr.target, pr.dmg, 0, pr.team, pr.attacker);
        }
        projectiles.splice(i, 1);
        continue;
      }
      const p = pr.t;
      const x = pr.sx + (pr.tx - pr.sx) * p;
      const z = pr.sz + (pr.tz - pr.sz) * p;
      const y = pr.sy + (pr.ty - pr.sy) * p + Math.sin(p * Math.PI) * pr.arc;

      const p2 = Math.min(1, p + 0.04);
      const nx = pr.sx + (pr.tx - pr.sx) * p2;
      const nz = pr.sz + (pr.tz - pr.sz) * p2;
      const ny = pr.sy + (pr.ty - pr.sy) * p2 + Math.sin(p2 * Math.PI) * pr.arc;

      if (pr.kind === 'arrow' && arrowC < MAX_ARROWS) {
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(1);
        dummy.lookAt(nx, ny, nz);
        dummy.updateMatrix();
        arrowInst.setMatrixAt(arrowC++, dummy.matrix);
      } else if (pr.kind === 'magic' && magicC < MAX_MAGIC) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(t * 9 + i, t * 7, 0);
        dummy.scale.setScalar(1.0 + Math.sin(t * 20 + i) * 0.22);
        dummy.updateMatrix();
        magicBoltInst.setMatrixAt(magicC, dummy.matrix);
        cTmp.setHex(pr.color).lerp(initWhite, 0.35);
        magicBoltInst.setColorAt(magicC, cTmp);
        magicC++;
        if (auraC < maxAura) {
          dummy.position.set(x, y, z);
          dummy.scale.setScalar(1.12 + Math.sin(t * 24 + i) * 0.18);
          dummy.lookAt(nx, ny, nz);
          dummy.updateMatrix();
          fireballAuraInst.setMatrixAt(auraC, dummy.matrix);
          cTmp.setHex(pr.color);
          fireballAuraInst.setColorAt(auraC, cTmp);
          auraC++;
        }
        pr.trailCd = (pr.trailCd || 0) - dt;
        if (pr.trailCd <= 0) {
          pr.trailCd = 0.045;
          spawnFX(
            x + (aRand() - 0.5) * 0.09, y + (aRand() - 0.5) * 0.09, z + (aRand() - 0.5) * 0.09,
            aRand() > 0.35 ? pr.color : 0xffffff,
            0.46 + aRand() * 0.24, 0.36,
            (aRand() - 0.5) * 0.35, 0.22, (aRand() - 0.5) * 0.35, 0.3
          );
        }
      } else if (pr.kind === 'boulder' && boulderC < MAX_BOULDERS) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(t * 8.5 + i, t * 6.2, t * 4.5);
        dummy.scale.setScalar(1.05);
        dummy.updateMatrix();
        boulderInst.setMatrixAt(boulderC++, dummy.matrix);
        // Roaring outer translucent flame cone & halo trailing behind the flying catapult fireball!
        if (auraC < maxAura) {
          dummy.position.set(x, y, z);
          const fPulse = 1.05 + Math.sin(t * 28 + i * 2) * 0.18;
          dummy.scale.set(fPulse, fPulse, 1.28);
          dummy.lookAt(nx, ny, nz);
          dummy.updateMatrix();
          fireballAuraInst.setMatrixAt(auraC, dummy.matrix);
          cTmp.setHex(Math.sin(t * 32 + i) > 0 ? 0xff8c1a : 0xff4d0a);
          fireballAuraInst.setColorAt(auraC, cTmp);
          auraC++;
        }
        // Continuous blazing embers + dark charcoal smoke trail across the sky!
        pr.trailCd = (pr.trailCd || 0) - dt;
        if (pr.trailCd <= 0) {
          pr.trailCd = 0.055;
          spawnFX(
            x + (aRand() - 0.5) * 0.10, y + (aRand() - 0.5) * 0.10, z + (aRand() - 0.5) * 0.10,
            aRand() > 0.38 ? 0xff7b1c : 0xffd252,
            0.62 + aRand() * 0.26, 0.36,
            (aRand() - 0.5) * 0.30, 0.25, (aRand() - 0.5) * 0.30, 0.85
          );
          if (aRand() > 0.30) {
            spawnFX(
              x + (aRand() - 0.5) * 0.14, y + 0.05, z + (aRand() - 0.5) * 0.14,
              0x352f2b, 0.78 + aRand() * 0.32, 0.74,
              (aRand() - 0.5) * 0.22, 0.52, (aRand() - 0.5) * 0.22, -0.10
            );
          }
        }
      }
    }
    arrowInst.count = arrowC;
    magicBoltInst.count = magicC;
    boulderInst.count = boulderC;
    fireballAuraInst.count = auraC;

    // 4. Advance Combat Impact Sparks, Magic Bursts, Fireball Shrapnel & Billowing Smoke
    let fxC = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      fx.age += dt;
      if (fx.age >= fx.duration) {
        effects.splice(i, 1);
        continue;
      }
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.z += fx.vz * dt;
      fx.vy -= fx.grav * dt;
      if (fxC < MAX_FX) {
        const frac = fx.age / fx.duration;
        const sc = fx.maxScale * (0.28 + Math.sin(frac * Math.PI) * 0.92);
        dummy.position.set(fx.x, fx.y, fx.z);
        dummy.rotation.set(frac * 3.2, frac * 2.4, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        fxInst.setMatrixAt(fxC, dummy.matrix);
        cTmp.setHex(fx.color);
        fxInst.setColorAt(fxC, cTmp);
        fxC++;
      }
    }
    fxInst.count = fxC;

    // 5. Render All Live Units with True YXZ 3-Phase Attack Animations, Slash Arcs, Ornate Archmages, Immortal Kings & Siege Recoil!
    let pC = 0, hC = 0, wC = 0, shC = 0, orbC = 0, horseC = 0, ramC = 0, catC = 0, knC = 0, archC = 0;
    let swC = 0, cavC = 0, bldC = 0, slashC = 0, kingC = 0, udArmC = 0, udGlowC = 0;
    for (let tid = 0; tid < 4; tid++) {
      kingCrownSprites[tid].visible = false;
      heroModels[tid].root.visible = false;
    }
    skarbrandModel.root.visible = false;

    for (const u of units) {
      if (!u.alive || u.insideVenue) continue;
      const baseGy = armyGroundY(u.x, u.z);
      const gy = u.garrisonTower ? armyGroundY(u.garrisonTower.x, u.garrisonTower.z) + 0.90 : baseGy;
      const st = UNIT_STATS[u.type];
      const bob = u.garrisonTower ? 0 : Math.abs(Math.sin(u.stridePhase)) * (u.type === 'skarbrand' ? 0.085 : u.type === 'king' ? 0.042 : u.type === 'cavalry' ? 0.032 : 0.018);

      // 3-Phase Attack Progress p: 0 -> 0.30 wind-up | 0.30 -> 0.62 explosive strike | 0.62 -> 1.00 follow-through!
      const swP = u.swing > 0 ? (1 - u.swing) : 0;
      let atkWind = 0, atkStrike = 0, atkLunge = 0, atkYaw = 0, atkBodyPitch = 0;
      if (u.swing > 0) {
        if (swP < 0.30) {
          const w = swP / 0.30;
          atkWind = w;
          atkYaw = -0.46 * w;
          atkBodyPitch = -0.16 * w;
          atkLunge = -0.045 * w;
        } else if (swP < 0.62) {
          const s = (swP - 0.30) / 0.32;
          const sSnap = 1 - (1 - s) * (1 - s);
          atkWind = 1 - sSnap;
          atkStrike = sSnap;
          atkYaw = -0.46 + 1.02 * sSnap;
          atkBodyPitch = -0.16 + 0.44 * Math.sin(s * Math.PI);
          atkLunge = 0.125 * Math.sin(s * Math.PI);
        } else {
          const r = (swP - 0.62) / 0.38;
          atkStrike = 1 - r;
          atkYaw = 0.56 * (1 - r);
          atkBodyPitch = 0.14 * (1 - r);
          atkLunge = 0.03 * (1 - r);
        }
      }

      if (u.type === 'siege') {
        if (ramC < MAX_SIEGE) {
          const ramRecoil = u.swing > 0 ? (-0.09 * Math.sin(swP * Math.PI)) : 0;
          dummy.position.set(u.x, gy, u.z);
          dummy.rotation.set(ramRecoil, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          ramHullInst.setMatrixAt(ramC, dummy.matrix);
          ramTrimInst.setMatrixAt(ramC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          ramTrimInst.setColorAt(ramC, cTmp);

          // Heavy Battering Ram: deep rear draw-back -> explosive forward ram slam!
          let ramShift = 0.12;
          if (u.swing > 0) {
            if (swP < 0.38) ramShift = 0.12 - (swP / 0.38) * 0.32;
            else if (swP < 0.66) ramShift = -0.20 + Math.sin(((swP - 0.38) / 0.28) * Math.PI * 0.5) * 0.62;
            else ramShift = 0.42 - ((swP - 0.66) / 0.34) * 0.30;
          }
          dummy.position.set(u.x + Math.sin(u.heading) * ramShift, gy + 0.14, u.z + Math.cos(u.heading) * ramShift);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          ramBeamInst.setMatrixAt(ramC, dummy.matrix);
          ramC++;
        }
        continue;
      }
      if (u.type === 'catapult') {
        if (catC < MAX_SIEGE) {
          const catRock = Math.max(0, (u.armPitch + 0.2) * 0.085);
          dummy.position.set(u.x, gy, u.z);
          dummy.rotation.set(-catRock, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          catBaseInst.setMatrixAt(catC, dummy.matrix);
          catTrimInst.setMatrixAt(catC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          catTrimInst.setColorAt(catC, cTmp);

          dummy.position.set(u.x, gy + 0.13, u.z);
          dummy.rotation.set(u.armPitch, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          catArmInst.setMatrixAt(catC, dummy.matrix);
          catC++;
        }
        continue;
      }

      // Wave 3 Boss Monster: SKARBRAND THE EXILED ONE (Articulated Tattered Wings + Blazing Dual Great-Axes!)
      if (u.type === 'skarbrand') {
        const sinH = Math.sin(u.heading);
        const cosH = Math.cos(u.heading);
        const bx = u.x + sinH * (atkLunge * 2.2);
        const bz = u.z + cosH * (atkLunge * 2.2);
        skarbrandModel.root.visible = true;
        skarbrandModel.root.position.set(bx, gy + bob, bz);
        skarbrandModel.root.rotation.set(0, u.heading, 0);
        skarbrandModel.bodyPivot.rotation.set(atkBodyPitch * 1.15, atkYaw * (u.swingAlt || 1) * 0.9, 0);

        // Angry tattered daemon wing flare & beat
        const wingBeat = Math.sin(t * 4.2) * 0.16 + atkWind * 0.34 - atkStrike * 0.22;
        skarbrandModel.leftWing.rotation.set(0, 0.28 + wingBeat, wingBeat * 0.5);
        skarbrandModel.rightWing.rotation.set(0, -0.28 - wingBeat, -wingBeat * 0.5);

        // Twin Legendary Khorne Great-Axes (Slaughter & Carnage): violent overhead dual-axe slam!
        const alt = u.swingAlt || 1;
        const primaryPitch = u.swing > 0 ? (-2.15 * atkWind + 1.55 * atkStrike) : (-0.25 + Math.sin(t * 3.0) * 0.12);
        const offPitch = u.swing > 0 ? (-1.65 * atkWind + 1.25 * atkStrike) : (-0.18 - Math.sin(t * 3.0) * 0.12);
        skarbrandModel.leftArm.rotation.set(alt > 0 ? primaryPitch : offPitch, 0, -0.25 * atkWind + 0.35 * atkStrike);
        skarbrandModel.rightArm.rotation.set(alt > 0 ? offPitch : primaryPitch, 0, 0.25 * atkWind - 0.35 * atkStrike);

        // Fiery ground aura pulse & floating boss skull badge
        skarbrandModel.bossRing.rotation.z = t * 1.6;
        skarbrandModel.bossRing.scale.setScalar(1.0 + Math.sin(t * 5.2) * 0.12 + atkStrike * 0.28);
        skarbrandModel.bossTag.position.y = 2.58 + Math.sin(t * 3.4) * 0.10;

        // Colossal blazing fiery crimson-orange dual-axe slash arc during strike!
        if (u.swing > 0 && swP >= 0.28 && swP <= 0.66 && slashC < MAX_SLASH) {
          const arcFrac = (swP - 0.28) / 0.38;
          const arcSc = 3.15 * (0.68 + Math.sin(arcFrac * Math.PI) * 0.62);
          dummy.position.set(bx + sinH * 0.72, gy + 0.92, bz + cosH * 0.72);
          dummy.rotation.set(0.22 + arcFrac * 0.85, u.heading + alt * (0.72 - arcFrac * 1.44), alt * (-0.42 + arcFrac * 0.84));
          dummy.scale.setScalar(arcSc);
          dummy.updateMatrix();
          slashArcInst.setMatrixAt(slashC, dummy.matrix);
          cTmp.setHex(0xff5a18);
          slashArcInst.setColorAt(slashC, cTmp);
          slashC++;
        }
        continue;
      }

      // 4 Summoned Radiant Heroes (95% Undead Conquest Reclamation Champions!)
      if (u.type === 'hero') {
        const hm = heroModels[u.team & 3];
        if (hm) {
          const sinH = Math.sin(u.heading);
          const cosH = Math.cos(u.heading);
          const hx = u.x + sinH * (atkLunge * 1.85);
          const hz = u.z + cosH * (atkLunge * 1.85);
          hm.root.visible = true;
          hm.root.position.set(hx, gy + bob * 1.4, hz);
          hm.root.rotation.set(0, u.heading, 0);
          hm.bodyPivot.rotation.set(atkBodyPitch * 1.05, atkYaw * 0.95, 0);

          const wBeat = Math.sin(t * 4.8 + u.team * 1.4) * 0.14 + atkWind * 0.28;
          hm.leftWing.rotation.set(0, 0.22 + wBeat, wBeat * 0.45);
          hm.rightWing.rotation.set(0, -0.22 - wBeat, -wBeat * 0.45);

          const swPitch = u.swing > 0 ? (-1.95 * atkWind + 1.65 * atkStrike) : (-0.18 + Math.sin(t * 3.2 + u.team) * 0.08);
          hm.swordArm.rotation.set(swPitch, 0, -0.22 * atkWind + 0.32 * atkStrike);

          hm.heroRing.rotation.z = t * 2.1 + u.team;
          hm.heroRing.scale.setScalar(1.0 + Math.sin(t * 5.0 + u.team) * 0.12 + atkStrike * 0.25);
          hm.heroTag.position.y = 1.72 + Math.sin(t * 3.8 + u.team) * 0.08;

          if (u.swing > 0 && swP >= 0.28 && swP <= 0.66 && slashC < MAX_SLASH) {
            const arcFrac = (swP - 0.28) / 0.38;
            const arcSc = 2.45 * (0.68 + Math.sin(arcFrac * Math.PI) * 0.60);
            dummy.position.set(hx + sinH * 0.56, gy + 0.68, hz + cosH * 0.56);
            dummy.rotation.set(0.24 + arcFrac * 0.80, u.heading + (0.68 - arcFrac * 1.36), -0.38 + arcFrac * 0.76);
            dummy.scale.setScalar(arcSc);
            dummy.updateMatrix();
            slashArcInst.setMatrixAt(slashC, dummy.matrix);
            cTmp.setHex(0xffe878);
            slashArcInst.setColorAt(slashC, cTmp);
            slashC++;
          }
        }
        continue;
      }

      // Immortal Mounted Faction King on Grand Pure-White Armored Warhorse (towering above his Knight Cavalries!)
      if (u.type === 'king') {
        if (kingC < MAX_KINGS) {
          const sinH = Math.sin(u.heading);
          const cosH = Math.cos(u.heading);
          const sc = st.scale;
          const kLunge = atkLunge * 1.45;
          const kx = u.x + sinH * kLunge;
          const kz = u.z + cosH * kLunge;
          const rearPitch = u.swing > 0 ? (-0.28 * atkWind + 0.16 * atkStrike) : 0;
          const rearLift = u.swing > 0 ? (0.068 * atkWind) : 0;

          // 1) White Armored Stallion + Silver Plate Horse Armor + Faction Caparison Skirt
          dummy.position.set(kx, gy + 0.175 + bob + rearLift, kz);
          dummy.rotation.set(Math.sin(u.stridePhase) * 0.085 + rearPitch, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          kingHorseInst.setMatrixAt(kingC, dummy.matrix);
          kingHorseArmorInst.setMatrixAt(kingC, dummy.matrix);
          kingBardingInst.setMatrixAt(kingC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          kingBardingInst.setColorAt(kingC, cTmp);

          // 2) Towering Crowned Monarch Plate Armor, Golden 5-Pointed Crown & Billowing Royal Cape
          const kYaw = u.heading + atkYaw * 0.9;
          const kPitch = atkBodyPitch * 0.95;
          const kRiderY = gy + 0.245 + bob + rearLift;
          dummy.position.set(kx, kRiderY, kz);
          dummy.rotation.set(kPitch, kYaw, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          kingArmorInst.setMatrixAt(kingC, dummy.matrix);
          kingGoldInst.setMatrixAt(kingC, dummy.matrix);
          kingCapeInst.setMatrixAt(kingC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          kingCapeInst.setColorAt(kingC, cTmp);

          // 3) Massive Radiant Royal Greatsword (dramatic 3-phase overhead sovereign cleave!)
          const sinK = Math.sin(kYaw);
          const cosK = Math.cos(kYaw);
          const rx = cosK * 0.086 * sc + sinK * (0.055 * atkStrike);
          const rz = -sinK * 0.086 * sc + cosK * (0.055 * atkStrike);
          const kSwordPitch = u.swing > 0 ? (0.30 - 1.75 * atkWind + 1.68 * atkStrike) : 0.30;
          const kSwordRoll = u.swing > 0 ? (-0.62 * atkWind + 0.95 * atkStrike) : -0.14;
          dummy.position.set(kx + rx, kRiderY + (0.14 + 0.09 * atkWind) * sc, kz + rz);
          dummy.rotation.set(kSwordPitch, kYaw, kSwordRoll);
          dummy.scale.setScalar(sc * 1.12);
          dummy.updateMatrix();
          kingSwordInst.setMatrixAt(kingC, dummy.matrix);

          // Wide gleaming golden sovereign slash arc during cleave!
          if (u.swing > 0 && swP >= 0.30 && swP <= 0.65 && slashC < MAX_SLASH) {
            const arcFrac = (swP - 0.30) / 0.35;
            const arcSc = 1.92 * (0.68 + Math.sin(arcFrac * Math.PI) * 0.58);
            dummy.position.set(kx + sinH * 0.22 * sc, kRiderY + 0.16 * sc, kz + cosH * 0.22 * sc);
            dummy.rotation.set(0.24 + arcFrac * 0.78, u.heading + (0.62 - arcFrac * 1.24), -0.38 + arcFrac * 0.76);
            dummy.scale.setScalar(arcSc);
            dummy.updateMatrix();
            slashArcInst.setMatrixAt(slashC, dummy.matrix);
            cTmp.setHex(0xffe670);
            slashArcInst.setColorAt(slashC, cTmp);
            slashC++;
          }

          // 4) Shimmering Golden Sovereign Aura Ring beneath the White Stallion
          const isResting = u.squad.kingState === 'resting';
          const isRetreat = u.squad.kingState === 'retreating';
          dummy.position.set(kx, gy + 0.045, kz);
          dummy.rotation.set(0, t * (isResting ? 2.4 : 1.15) + kingC * 1.5, 0);
          dummy.scale.setScalar(1.0 + Math.sin(t * (isResting ? 6.5 : 3.8) + kingC) * (isResting ? 0.14 : 0.07) + atkStrike * 0.16);
          dummy.updateMatrix();
          kingAuraInst.setMatrixAt(kingC, dummy.matrix);

          // 5) Floating Small Golden Crown Highlight hovering above the King's head!
          const crownSpr = kingCrownSprites[u.team & 3];
          if (crownSpr) {
            const cBob = Math.sin(t * (isResting ? 5.2 : 3.4) + u.team * 1.4) * 0.045;
            const cPulse = 0.45 + Math.sin(t * (isResting ? 6.0 : 3.2) + u.team) * (isResting || isRetreat ? 0.065 : 0.032);
            crownSpr.position.set(kx, kRiderY + 0.66 + cBob, kz);
            crownSpr.scale.set(cPulse, cPulse, 1);
            crownSpr.visible = true;
          }
          kingC++;
        }
        continue;
      }

      const riderLift = u.type === 'cavalry' ? 0.15 : 0;
      const sinH = Math.sin(u.heading);
      const cosH = Math.cos(u.heading);
      const isMelee = u.type === 'swordsman' || u.type === 'knight' || u.type === 'builder' || u.type === 'undead_warrior' || u.type === 'undead_champion';
      const lungeF = isMelee ? atkLunge : (u.type === 'cavalry' ? atkLunge * 1.45 : 0);
      const ux = u.x + sinH * lungeF;
      const uz = u.z + cosH * lungeF;
      const bodyYaw = u.heading + (isMelee ? atkYaw : 0);
      const bodyPitch = isMelee ? atkBodyPitch : (u.type === 'cavalry' ? atkBodyPitch * 0.9 : 0);

      // Detailed Sculpted Medieval Warhorse + Heraldic Barding (rears & surges forward on lance charge!)
      if (u.type === 'cavalry' && horseC < MAX_HORSES) {
        const rearPitch = u.swing > 0 ? (-0.24 * atkWind + 0.16 * atkStrike) : 0;
        const rearLift = u.swing > 0 ? (0.045 * atkWind) : 0;
        dummy.position.set(ux, gy + 0.12 + bob + rearLift, uz);
        dummy.rotation.set(Math.sin(u.stridePhase) * 0.085 + rearPitch, u.heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        horseBodyInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(u.horseCoat);
        horseBodyInst.setColorAt(horseC, cTmp);

        horseBardingInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(u.faction.primary);
        horseBardingInst.setColorAt(horseC, cTmp);
        horseC++;
      }

      // Humanoid body & head (with torso lunge & twist during strikes!)
      if (pC < MAX_PERSONS) {
        const sc = st.scale;
        dummy.position.set(ux, gy + riderLift + bob, uz);
        dummy.rotation.set(bodyPitch, bodyYaw, 0);
        dummy.scale.set(u.type === 'knight' ? sc * 1.15 : sc, sc, u.type === 'knight' ? sc * 1.15 : sc);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(pC, dummy.matrix);
        if (u.type === 'knight') {
          cTmp.setHex(u.faction.primary).lerp(cSteel, 0.35);
        } else if (u.type === 'undead_warrior') {
          cTmp.setHex(0xd6ddd0); // Pale skeletal bone torso
        } else if (u.type === 'undead_champion') {
          cTmp.setHex(0x231d2b); // Obsidian Death Knight armor
        } else if (u.type === 'undead_necro') {
          cTmp.setHex(0x36194d); // Tattered necrotic violet robe
        } else if (u.type === 'mage') {
          cMagic.setHex(u.faction.magic);
          cTmp.setHex(u.faction.primary).lerp(cMagic, 0.25);
        } else if (u.type === 'archer') {
          cTmp.setHex(u.faction.primary).lerp(cHood, 0.38);
        } else if (u.type === 'builder') {
          cTmp.setHex(u.faction.primary).lerp(cWood, 0.35);
        } else {
          cTmp.setHex(u.faction.primary);
        }
        bodyInst.setColorAt(pC, cTmp);

        // Head / Helmet / Hood / Gleaming Bone Skull for Undead!
        const headFwd = Math.sin(bodyPitch) * 0.14 * sc;
        dummy.position.set(ux + sinH * headFwd, gy + riderLift + bob + 0.185 * sc, uz + cosH * headFwd);
        dummy.rotation.set(bodyPitch * 0.6, bodyYaw, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        headInst.setMatrixAt(hC, dummy.matrix);
        if (u.team === 4) {
          cTmp.setHex(0xf1f5e8); // Crisp pale bone-white skull!
          headInst.setColorAt(hC, cTmp);
        } else {
          headInst.setColorAt(hC, u.type === 'knight' || u.type === 'cavalry' ? cHelm : u.type === 'archer' ? cHood : cSkin);
        }
        pC++;
        hC++;

        // Undead Cursed Horned Armor + Eerie Glowing Necrotic Green Eyes!
        if (u.team === 4) {
          if ((u.type === 'undead_champion' || u.type === 'undead_necro') && udArmC < MAX_UNDEAD) {
            dummy.position.set(ux, gy + bob, uz);
            dummy.rotation.set(bodyPitch, bodyYaw, 0);
            dummy.scale.setScalar(sc);
            dummy.updateMatrix();
            undeadArmorInst.setMatrixAt(udArmC++, dummy.matrix);
          }
          if (udGlowC < MAX_UNDEAD) {
            dummy.position.set(ux, gy + bob, uz);
            dummy.rotation.set(bodyPitch, bodyYaw, 0);
            dummy.scale.setScalar(sc);
            dummy.updateMatrix();
            undeadGlowInst.setMatrixAt(udGlowC++, dummy.matrix);
          }
        }

        // Detailed Swordsman Steel Kettle-Helm, Shoulder Spaulders & Leather Cross-Harness!
        if (u.type === 'swordsman' && swC < MAX_SWORDSMEN) {
          dummy.position.set(ux, gy + bob, uz);
          dummy.rotation.set(bodyPitch, bodyYaw, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          swordsmanHelmInst.setMatrixAt(swC, dummy.matrix);
          swordsmanTrimInst.setMatrixAt(swC, dummy.matrix);
          swC++;
        }

        // Detailed Cavalry Rider Visored Sallet Helm, Couched Jousting Lance & Faction Pennon (with dramatic thrust!)
        if (u.type === 'cavalry' && cavC < MAX_HORSES) {
          const lanceThrust = u.swing > 0 ? (-0.08 * atkWind + 0.24 * atkStrike) : 0;
          const lancePitch = u.swing > 0 ? (-0.28 * atkWind + 0.18 * atkStrike) : 0;
          dummy.position.set(ux + sinH * lanceThrust, gy + riderLift + bob, uz + cosH * lanceThrust);
          dummy.rotation.set(bodyPitch + lancePitch, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          cavalryGearInst.setMatrixAt(cavC, dummy.matrix);
          cavalryPennonInst.setMatrixAt(cavC, dummy.matrix);
          cTmp.setHex(u.faction.accent);
          cavalryPennonInst.setColorAt(cavC, cTmp);
          cavC++;
        }

        // Combat Engineer / Builder Cap, Apron, Satchel & Overhead-Slamming Carpenter Mallet!
        if (u.type === 'builder' && bldC < MAX_BUILDERS) {
          dummy.position.set(ux, gy + bob, uz);
          dummy.rotation.set(bodyPitch, bodyYaw, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          builderGearInst.setMatrixAt(bldC, dummy.matrix);

          const rx = cosH * 0.062 * sc + sinH * (0.04 * atkStrike);
          const rz = -sinH * 0.062 * sc + cosH * (0.04 * atkStrike);
          const hammerPitch = u.swing > 0 ? (0.25 - 1.78 * atkWind + 1.65 * atkStrike) : 0.25;
          dummy.position.set(ux + rx, gy + bob + (0.125 + 0.06 * atkWind) * sc, uz + rz);
          dummy.rotation.set(hammerPitch, bodyYaw, -0.18 * atkWind + 0.18 * atkStrike);
          dummy.scale.setScalar(sc * 1.15);
          dummy.updateMatrix();
          builderHammerInst.setMatrixAt(bldC, dummy.matrix);
          bldC++;
        }

        // Armored Knight Plate Breastplate, Broad Pauldrons, Steel Great Helm & Faction Plume!
        if (u.type === 'knight' && knC < MAX_KNIGHTS) {
          dummy.position.set(ux, gy + bob, uz);
          dummy.rotation.set(bodyPitch, bodyYaw, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          knightArmorInst.setMatrixAt(knC, dummy.matrix);
          knightPlumeInst.setMatrixAt(knC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          knightPlumeInst.setColorAt(knC, cTmp);
          knC++;
        }

        // Unmistakable Archers: Curved Longbow + Bowstring + Nocked Arrow + Back Quiver!
        if (u.type === 'archer' && archC < MAX_ARCHERS) {
          dummy.position.set(u.x, gy + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(sc * (1 + u.swing * 0.12));
          dummy.updateMatrix();
          archerBowInst.setMatrixAt(archC, dummy.matrix);
          archerQuiverInst.setMatrixAt(archC, dummy.matrix);
          archC++;
        }

        // Right-hand Detailed Crossguard Broadsword (Swordsmen, Knights & Undead Warriors/Champions!)
        if ((u.type === 'swordsman' || u.type === 'knight' || u.type === 'undead_warrior' || u.type === 'undead_champion') && wC < MAX_PERSONS) {
          const sinB = Math.sin(bodyYaw);
          const cosB = Math.cos(bodyYaw);
          const rx = cosB * 0.066 * sc + sinB * (0.045 * atkStrike);
          const rz = -sinB * 0.066 * sc + cosB * (0.045 * atkStrike);
          const swordPitch = u.swing > 0 ? (0.28 - 1.65 * atkWind + 1.62 * atkStrike) : 0.28;
          const swordRoll = u.swing > 0 ? (-0.58 * atkWind + 0.88 * atkStrike) : -0.10;
          dummy.position.set(ux + rx, gy + bob + (0.12 + 0.08 * atkWind) * sc, uz + rz);
          dummy.rotation.set(swordPitch, bodyYaw, swordRoll);
          const isHeavyBlade = u.type === 'knight' || u.type === 'undead_champion';
          dummy.scale.set(isHeavyBlade ? 1.42 : 1.15, isHeavyBlade ? 1.38 : 1.15, 1.15);
          dummy.updateMatrix();
          weaponInst.setMatrixAt(wC, dummy.matrix);
          if (u.team === 4) {
            cTmp.setHex(u.type === 'undead_champion' ? 0x6dff9e : 0x5c6662);
            weaponInst.setColorAt(wC, cTmp);
          } else {
            weaponInst.setColorAt(wC, cSteel);
          }
          wC++;

          // Gleaming curved slash-swoosh arc flashing in front of the slashing blade (cursed green for Undead!)
          if (u.swing > 0 && swP >= 0.30 && swP <= 0.64 && slashC < MAX_SLASH) {
            const arcFrac = (swP - 0.30) / 0.34;
            const arcSc = (isHeavyBlade ? 1.35 : 1.05) * (0.65 + Math.sin(arcFrac * Math.PI) * 0.60);
            dummy.position.set(ux + sinH * 0.14 * sc, gy + bob + 0.16 * sc, uz + cosH * 0.14 * sc);
            dummy.rotation.set(0.25 + arcFrac * 0.75, u.heading + (0.55 - arcFrac * 1.1), -0.35 + arcFrac * 0.7);
            dummy.scale.setScalar(arcSc);
            dummy.updateMatrix();
            slashArcInst.setMatrixAt(slashC, dummy.matrix);
            cTmp.setHex(u.team === 4 ? 0x6dff9e : (u.type === 'knight' ? 0xfff5c0 : 0xeef6ff));
            slashArcInst.setColorAt(slashC, cTmp);
            slashC++;
          }
        }

        // Left-hand Detailed Medieval Heater Shield (braces forward & up on strike!)
        if ((u.type === 'swordsman' || u.type === 'knight' || u.type === 'cavalry' || u.type === 'undead_warrior' || u.type === 'undead_champion') && shC < MAX_PERSONS) {
          const shieldFwd = 0.036 + 0.045 * atkWind + 0.025 * atkStrike;
          const lx = -cosH * 0.068 * sc + sinH * shieldFwd;
          const lz = sinH * 0.068 * sc + cosH * shieldFwd;
          dummy.position.set(ux + lx, gy + riderLift + bob + (0.105 + 0.03 * atkWind) * sc, uz + lz);
          dummy.rotation.set(-0.18 * atkWind, bodyYaw + 0.24 * atkWind, 0);
          dummy.scale.setScalar(u.type === 'knight' || u.type === 'undead_champion' ? 1.28 : 1.04);
          dummy.updateMatrix();
          shieldInst.setMatrixAt(shC, dummy.matrix);
          cTmp.setHex(u.team === 4 ? 0x3b1b52 : u.faction.accent);
          shieldInst.setColorAt(shC, cTmp);
          shC++;
        }

        // Rare Ornate Archmage: Pointed Wizard Hat + Sweeping Cloak + Gold Trim + Casting Runestaff + Levitating Crystal + Rotating Rune Halo!
        if (u.type === 'mage' && orbC < MAX_MAGES) {
          const castLift = u.swing > 0 ? Math.sin(swP * Math.PI) : 0;
          const hoverBob = Math.sin(t * 3.4 + pC) * 0.016 + castLift * 0.04;
          dummy.position.set(u.x, gy + bob + hoverBob, u.z);
          dummy.rotation.set(-0.12 * castLift, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          mageRobeInst.setMatrixAt(orbC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          mageRobeInst.setColorAt(orbC, cTmp);
          mageGoldInst.setMatrixAt(orbC, dummy.matrix);

          // Animated Arcane Runestaff (lifts high & thrusts forward while channeling spell!)
          const staffPitch = 0.16 - 0.55 * castLift + 0.85 * atkStrike;
          const srx = cosH * 0.075 * sc + sinH * (0.04 + 0.08 * atkStrike);
          const srz = -sinH * 0.075 * sc + cosH * (0.04 + 0.08 * atkStrike);
          const staffY = gy + bob + hoverBob + (0.04 + 0.12 * castLift) * sc;
          dummy.position.set(u.x + srx, staffY, u.z + srz);
          dummy.rotation.set(staffPitch, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          mageStaffInst.setMatrixAt(orbC, dummy.matrix);

          // Levitating Pulsing Arcane Crystal Orb hovering inside the runestaff crescent!
          const orbReach = Math.sin(staffPitch) * 0.34 * sc;
          const orbUp = Math.cos(staffPitch) * 0.34 * sc;
          dummy.position.set(u.x + srx + sinH * orbReach, staffY + orbUp, u.z + srz + cosH * orbReach);
          dummy.rotation.set(t * 2.8, t * 4.2, 0);
          dummy.scale.setScalar((0.95 + castLift * 0.95 + Math.sin(t * 9 + orbC) * 0.16) * sc);
          dummy.updateMatrix();
          mageOrbInst.setMatrixAt(orbC, dummy.matrix);
          cTmp.setHex(u.faction.magic).lerp(initWhite, 0.30 + castLift * 0.45);
          mageOrbInst.setColorAt(orbC, cTmp);

          // Orbiting Glowing Arcane Rune Halo around the Archmage (spins faster & flares during spellcasting!)
          dummy.position.set(u.x, gy + 0.055 + castLift * 0.16, u.z);
          dummy.rotation.set(0, t * (1.8 + castLift * 4.5) + orbC * 1.5, 0);
          dummy.scale.setScalar((1.0 + castLift * 0.42 + Math.sin(t * 5 + orbC) * 0.08) * sc);
          dummy.updateMatrix();
          mageHaloInst.setMatrixAt(orbC, dummy.matrix);
          cTmp.setHex(u.faction.magic);
          mageHaloInst.setColorAt(orbC, cTmp);
          orbC++;
        }
      }
    }

    // 5B. Render Frontier Fortifications (Spiked Barricades & Timber Archer Watchtowers with Rising Construction Animation!)
    let barC = 0, towC = 0;
    for (let si = 0; si < structures.length; si++) {
      const s = structures[si];
      if (!s.alive) continue;
      const sy = armyGroundY(s.x, s.z);
      const hpRatio = Math.max(0.15, s.hp / s.maxHp);
      const dmgTilt = s.buildProg >= 1 ? (1 - hpRatio) * 0.16 : 0;
      const riseY = Math.max(0.18, s.buildProg);

      if (s.kind === 'barricade' && barC < MAX_BARRICADES) {
        dummy.position.set(s.x, sy, s.z);
        dummy.rotation.set(dmgTilt, s.yaw, 0);
        dummy.scale.set(1, riseY, 1);
        dummy.updateMatrix();
        barricadeWoodInst.setMatrixAt(barC, dummy.matrix);
        barricadeTrimInst.setMatrixAt(barC, dummy.matrix);
        cTmp.setHex(s.faction.primary);
        barricadeTrimInst.setColorAt(barC, cTmp);
        barC++;
      } else if (s.kind === 'tower' && towC < MAX_TOWERS) {
        dummy.position.set(s.x, sy, s.z);
        dummy.rotation.set(dmgTilt * 0.6, s.yaw, dmgTilt * 0.4);
        dummy.scale.set(1, riseY, 1);
        dummy.updateMatrix();
        towerWoodInst.setMatrixAt(towC, dummy.matrix);
        towerTrimInst.setMatrixAt(towC, dummy.matrix);
        cTmp.setHex(s.faction.primary);
        towerTrimInst.setColorAt(towC, cTmp);
        towC++;
      }
    }

    // 6. Advance & Render Fallen Bodies (Remain Visibly on Battlefield for 30 Full Seconds!)
    for (let i = corpses.length - 1; i >= 0; i--) {
      const cp = corpses[i];
      cp.age += dt;
      if (cp.age >= cp.maxAge) {
        corpses.splice(i, 1);
        continue;
      }
      const fadeOut = cp.age > cp.maxAge - 2.5 ? 1 - (cp.age - (cp.maxAge - 2.5)) / 2.5 : 1.0;
      const sinkY = (1 - fadeOut) * 0.09;

      if (cp.type === 'siege' && ramC < MAX_SIEGE) {
        dummy.position.set(cp.x, cp.y + 0.02 - sinkY, cp.z);
        dummy.rotation.set(0.28 * cp.fallSide, cp.rotY, 0.52 * cp.fallSide);
        dummy.scale.setScalar(0.92 * fadeOut);
        dummy.updateMatrix();
        ramHullInst.setMatrixAt(ramC, dummy.matrix);
        ramTrimInst.setMatrixAt(ramC, dummy.matrix);
        cTmp.setHex(cp.faction.primary).lerp(cDeadTint, 0.72);
        ramTrimInst.setColorAt(ramC, cTmp);
        dummy.position.set(cp.x, cp.y + 0.06 - sinkY, cp.z);
        dummy.updateMatrix();
        ramBeamInst.setMatrixAt(ramC, dummy.matrix);
        ramC++;
        continue;
      }
      if (cp.type === 'catapult' && catC < MAX_SIEGE) {
        dummy.position.set(cp.x, cp.y + 0.02 - sinkY, cp.z);
        dummy.rotation.set(0.24, cp.rotY, 0.58 * cp.fallSide);
        dummy.scale.setScalar(0.90 * fadeOut);
        dummy.updateMatrix();
        catBaseInst.setMatrixAt(catC, dummy.matrix);
        catTrimInst.setMatrixAt(catC, dummy.matrix);
        cTmp.setHex(cp.faction.primary).lerp(cDeadTint, 0.72);
        catTrimInst.setColorAt(catC, cTmp);
        dummy.rotation.set(1.3, cp.rotY, 0.58 * cp.fallSide);
        dummy.updateMatrix();
        catArmInst.setMatrixAt(catC, dummy.matrix);
        catC++;
        continue;
      }

      if ((cp.type === 'cavalry' || cp.type === 'king') && horseC < MAX_HORSES) {
        dummy.position.set(cp.x + 0.10 * cp.fallSide, cp.y + 0.055 - sinkY, cp.z);
        dummy.rotation.set(0, cp.rotY, cp.fallSide * Math.PI * 0.48);
        dummy.scale.setScalar((cp.type === 'king' ? 1.25 : 0.95) * fadeOut);
        dummy.updateMatrix();
        horseBodyInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(cp.horseCoat).lerp(cDeadTint, 0.45);
        horseBodyInst.setColorAt(horseC, cTmp);
        horseBardingInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(cp.faction.primary).lerp(cDeadTint, 0.52);
        horseBardingInst.setColorAt(horseC, cTmp);
        horseC++;
      }

      if (pC < MAX_PERSONS && hC < MAX_PERSONS) {
        const sc = (UNIT_STATS[cp.type]?.scale || 1) * fadeOut;
        dummy.position.set(cp.x, cp.y + 0.042 - sinkY, cp.z);
        dummy.rotation.set(Math.PI * 0.48 * cp.fallSide, cp.rotY, 0.15 * cp.fallSide);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(pC, dummy.matrix);
        cTmp.setHex(cp.faction.primary).lerp(cDeadTint, 0.46);
        bodyInst.setColorAt(pC, cTmp);

        const sinR = Math.sin(cp.rotY);
        const cosR = Math.cos(cp.rotY);
        dummy.position.set(cp.x + sinR * 0.15 * cp.fallSide, cp.y + 0.036 - sinkY, cp.z + cosR * 0.15 * cp.fallSide);
        dummy.rotation.set(0, cp.rotY, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        headInst.setMatrixAt(hC, dummy.matrix);
        headInst.setColorAt(hC, cDarkSteel);
        pC++;
        hC++;
      }
    }

    // 7. Render Cohesive Squad Regiment Banners with Official Faction Emblems Above Each Group (including Undead Skull Banners!)
    let bC = 0;
    teamBanCounts.fill(0);
    for (const sq of squads) {
      if (bC >= MAX_BANNERS) break;
      if (sq.role === 'boss' || sq.role === 'hero') continue;
      if (sq.team === 4) {
        if (UNDEAD_EVENT.phase !== 'active' && UNDEAD_EVENT.phase !== 'reign' && UNDEAD_EVENT.phase !== 'heroes') continue;
        if (UNDEAD_EVENT.phase === 'active' && (sq.waveTier || 1) > UNDEAD_EVENT.wave) continue;
        if (UNDEAD_EVENT.phase === 'heroes') {
          let anyUd = false;
          for (let m = 0; m < sq.members.length; m++) { if (sq.members[m].alive) { anyUd = true; break; } }
          if (!anyUd) continue;
        }
      }
      if (sq.team < 4 && (isNoLivingRespawn() || isRebuilding())) {
        // Hide squad banner if no living soldiers of this regiment are currently on the field!
        let anyAlive = false;
        for (let m = 0; m < sq.members.length; m++) { if (sq.members[m].alive) { anyAlive = true; break; } }
        if (!anyAlive) continue;
      }
      if (sq.role === 'king' && sq.kingState === 'resting') continue;
      const by = armyGroundY(sq.x, sq.z);
      dummy.position.set(sq.x, by, sq.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      banPoleInst.setMatrixAt(bC, dummy.matrix);

      const tid = Math.min(4, sq.team);
      const tIdx = teamBanCounts[tid];
      if (tIdx < banFlagInsts[tid].instanceMatrix.count) {
        dummy.position.set(sq.x, by + 0.56, sq.z);
        dummy.rotation.set(0, sq.heading + Math.sin(t * 3.8 + sq.id) * 0.22, 0);
        const banScale = 0.86 + Math.max(0, (effTeamPower[sq.team] || 1) - 0.62) * 0.42;
        dummy.scale.setScalar(banScale);
        dummy.updateMatrix();
        banFlagInsts[tid].setMatrixAt(tIdx, dummy.matrix);
        teamBanCounts[tid]++;
      }
      bC++;
    }

    bodyInst.count = pC;
    headInst.count = hC;
    weaponInst.count = wC;
    shieldInst.count = shC;
    swordsmanHelmInst.count = swC;
    swordsmanTrimInst.count = swC;
    knightArmorInst.count = knC;
    knightPlumeInst.count = knC;
    archerBowInst.count = archC;
    archerQuiverInst.count = archC;
    mageRobeInst.count = orbC;
    mageGoldInst.count = orbC;
    mageStaffInst.count = orbC;
    mageOrbInst.count = orbC;
    mageHaloInst.count = orbC;
    kingHorseInst.count = kingC;
    kingHorseArmorInst.count = kingC;
    kingBardingInst.count = kingC;
    kingArmorInst.count = kingC;
    kingCapeInst.count = kingC;
    kingGoldInst.count = kingC;
    kingSwordInst.count = kingC;
    kingAuraInst.count = kingC;
    undeadArmorInst.count = udArmC;
    undeadGlowInst.count = udGlowC;
    slashArcInst.count = slashC;
    builderGearInst.count = bldC;
    builderHammerInst.count = bldC;
    horseBodyInst.count = horseC;
    horseBardingInst.count = horseC;
    cavalryGearInst.count = cavC;
    cavalryPennonInst.count = cavC;
    barricadeWoodInst.count = barC;
    barricadeTrimInst.count = barC;
    towerWoodInst.count = towC;
    towerTrimInst.count = towC;
    ramHullInst.count = ramC;
    ramTrimInst.count = ramC;
    ramBeamInst.count = ramC;
    catBaseInst.count = catC;
    catTrimInst.count = catC;
    catArmInst.count = catC;
    banPoleInst.count = bC;
    for (let tid = 0; tid < 5; tid++) banFlagInsts[tid].count = teamBanCounts[tid];

    for(const flush of instanceFlushers)flush();
  }

  // Dragonfire chaos hook: scorches ALL 4 factions equally, scatters survivors & leaves 30-second corpses!
  function applyDragonBlast(bx, bz, radius, dmg, dragonY = 3.5) {
    const rSq = radius * radius;
    let hits = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.insideVenue) continue;
      const dx = u.x - bx;
      const dz = u.z - bz;
      const dSq = dx * dx + dz * dz;
      if (dSq <= rSq) {
        if (u.type === 'hero') {
          spawnFX(u.x, armyGroundY(u.x, u.z) + 0.55, u.z, 0xffe878, 1.15, 0.42, 0, 0.50, 0, 0);
          continue;
        }
        if (u.type === 'king') {
          if (!isKingMortal()) {
            // Immortal Faction Kings shrug off even scorching dragonfire behind a golden ward flash!
            spawnFX(u.x, armyGroundY(u.x, u.z) + 0.44, u.z, 0xffe878, 1.05, 0.42, 0, 0.45, 0, 0);
            continue;
          }
          u.hp -= dmg * 0.45;
          spawnFX(u.x, armyGroundY(u.x, u.z) + 0.44, u.z, 0xffe878, 1.05, 0.42, 0, 0.45, 0, 0);
          if (u.hp <= 0) killUnit(u);
          continue;
        }
        const d = Math.sqrt(dSq) || 0.01;
        const falloff = 1 - d / (radius * 1.25);
        u.hp -= dmg * Math.max(0.42, falloff);
        hits++;
        if (u.hp <= 0) {
          killUnit(u);
        } else {
          // Scatter panicked survivors outward from the scorching dragonfire blast!
          const push = (u.type === 'siege' || u.type === 'catapult') ? 0.14 : 0.45;
          const [nx, nz] = keepOnPassableLand(u.x + (dx / d) * push, u.z + (dz / d) * push, u.x, u.z);
          u.x = nx;
          u.z = nz;
        }
      } else if (dSq < 68 && (u.type === 'archer' || u.type === 'mage') && u.cd <= 0 && aRand() < 0.22) {
        // Nearby archers & mages fire desperate volleys upward into the sky at the attacking dragon!
        u.cd = UNIT_STATS[u.type].cd * 1.3;
        u.swing = 1.0;
        u.heading = Math.atan2(bx - u.x, bz - u.z);
        if (projectiles.length < MAX_ARROWS + MAX_MAGIC + MAX_BOULDERS) {
          projectiles.push({
            kind: u.type === 'mage' ? 'magic' : 'arrow',
            team: u.team,
            attacker: u,
            sx: u.x, sy: armyGroundY(u.x, u.z) + 0.20, sz: u.z,
            tx: bx + (aRand() - 0.5) * 1.2, ty: dragonY + (aRand() - 0.5) * 0.6, tz: bz + (aRand() - 0.5) * 1.2,
            arc: 1.2,
            t: 0, dur: 0.55,
            dmg: 0, splash: 0, target: null, color: u.type === 'mage' ? u.faction.magic : 0xf7e39c,
          });
        }
      }
    }
    const gy = armyGroundY(bx, bz);
    spawnFX(bx, gy + 0.18, bz, 0xff5a12, 1.85, 0.72);
    spawnFX(bx + (aRand() - 0.5) * 0.6, gy + 0.32, bz + (aRand() - 0.5) * 0.6, 0xffe066, 1.15, 0.52);
    return hits;
  }

  // Run one initial frame so armies & banners are posed cleanly on frame 0
  update(0.016, 0);
  parent.add(armyGroup);
  return {
    armyGroup,
    update,
    units,
    squads,
    corpses,
    applyDragonBlast,
    getInvasionState: () => UNDEAD_EVENT,
    isPeaceTreaty,
    triggerInvasion: startUndeadWarning,
    skipWave: skipInvasionWave,
  };
}

// ── 3E. ROAMING CHAOS DRAGON: SOARS ACROSS THE REALM & TORCHES RANDOM TROOPS! ─
function buildRoamingDragon(parent, armies) {
  const dragonLayer = new THREE.Group();
  const dragonRoot = new THREE.Group();
  dragonLayer.add(dragonRoot);

  let dSeed = 88421;
  const dRand = () => {
    dSeed = (dSeed * 16807) % 2147483647;
    return (dSeed - 1) / 2147483646;
  };

  // Volcanic Crimson-Obsidian Dragon Materials
  const scaleMat = new THREE.MeshStandardMaterial({ color: 0x7b1a1a, roughness: 0.46, metalness: 0.26 });
  const darkScaleMat = new THREE.MeshStandardMaterial({ color: 0x451416, roughness: 0.54, metalness: 0.28 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.62, metalness: 0.30 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x241d1b, roughness: 0.38, metalness: 0.36 });
  const membraneMat = new THREE.MeshStandardMaterial({
    color: 0xa62d1c,
    emissive: 0x3b0c05,
    emissiveIntensity: 0.38,
    roughness: 0.66,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdf4d, emissive: 0xffa200, emissiveIntensity: 2.3 });
  const mawMat = new THREE.MeshStandardMaterial({ color: 0xff6e1a, emissive: 0xff4500, emissiveIntensity: 2.2 });

  // 1. Armored Torso, Chest Keel & Dorsal Ridge Spines (local +Z is forward flight direction)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 9), scaleMat);
  chest.scale.set(0.86, 0.78, 1.65);
  chest.position.set(0, 0, 0.12);
  chest.castShadow = true;
  dragonRoot.add(chest);

  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.20, 1.25, 8), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, -0.14, 0.05);
  dragonRoot.add(belly);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), darkScaleMat);
  hips.scale.set(0.85, 0.78, 1.35);
  hips.position.set(0, -0.02, -0.58);
  hips.castShadow = true;
  dragonRoot.add(hips);

  // Dorsal spine crest plates along the back
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24 - i * 0.015, 4), hornMat);
    sp.position.set(0, 0.34 - i * 0.018, 0.55 - i * 0.24);
    sp.rotation.x = -0.35;
    dragonRoot.add(sp);
  }

  // Tucked clawed hind legs & talons
  for (const sgn of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.07, 0.48, 6), darkScaleMat);
    thigh.position.set(sgn * 0.26, -0.24, -0.55);
    thigh.rotation.set(0.55, 0, sgn * 0.22);
    dragonRoot.add(thigh);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 5), hornMat);
    foot.position.set(sgn * 0.28, -0.42, -0.74);
    foot.rotation.x = -Math.PI * 0.65;
    dragonRoot.add(foot);
  }

  // 2. Articulated Sinuous Neck, Fierce Horned Skull & Animated Fire-Breathing Jaw
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.08, 0.74);
  dragonRoot.add(neckGroup);

  const neckSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.56, 8), scaleMat);
  neckSeg1.rotation.x = Math.PI / 2 - 0.22;
  neckSeg1.position.set(0, 0.08, 0.24);
  neckSeg1.castShadow = true;
  neckGroup.add(neckSeg1);

  const neckSeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.48, 8), scaleMat);
  neckSeg2.rotation.x = Math.PI / 2 - 0.12;
  neckSeg2.position.set(0, 0.16, 0.66);
  neckSeg2.castShadow = true;
  neckGroup.add(neckSeg2);

  for (let i = 0; i < 3; i++) {
    const nSp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), hornMat);
    nSp.position.set(0, 0.24 + i * 0.04, 0.18 + i * 0.22);
    nSp.rotation.x = -0.45;
    neckGroup.add(nSp);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.20, 0.92);
  neckGroup.add(headGroup);

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.42), scaleMat);
  cranium.position.set(0, 0.04, 0.14);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.44), darkScaleMat);
  snout.position.set(0, 0.02, 0.46);
  snout.castShadow = true;
  headGroup.add(snout);

  // Swept-back obsidian horns + glowing amber eyes with closing scaly eyelids for sleeping!
  const dragonEyes = [];
  const dragonEyelids = [];
  for (const sgn of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.58, 6), hornMat);
    horn.position.set(sgn * 0.15, 0.20, -0.14);
    horn.rotation.set(-Math.PI * 0.36, 0, -sgn * 0.32);
    headGroup.add(horn);

    const cheekHorn = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.26, 5), hornMat);
    cheekHorn.position.set(sgn * 0.16, 0.02, -0.04);
    cheekHorn.rotation.set(-Math.PI * 0.42, 0, -sgn * 0.52);
    headGroup.add(cheekHorn);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), eyeMat);
    eye.position.set(sgn * 0.155, 0.08, 0.24);
    headGroup.add(eye);
    dragonEyes.push(eye);

    // Dark-scale eyelid cap that closes smoothly shut over the glowing eye while sleeping!
    const eyelid = new THREE.Mesh(new THREE.SphereGeometry(0.049, 6, 5), darkScaleMat);
    eyelid.position.set(sgn * 0.156, 0.088, 0.242);
    eyelid.scale.set(0.95, 0.25, 1.02);
    eyelid.visible = false;
    headGroup.add(eyelid);
    dragonEyelids.push(eyelid);
  }

  // Glowing molten throat interior + hinged lower jaw
  const throatGlow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), mawMat);
  throatGlow.position.set(0, -0.04, 0.46);
  headGroup.add(throatGlow);

  const jawGroup = new THREE.Group();
  jawGroup.position.set(0, -0.04, 0.18);
  const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.08, 0.48), bellyMat);
  lowerJaw.position.set(0, -0.04, 0.24);
  jawGroup.add(lowerJaw);
  headGroup.add(jawGroup);

  const mouthTip = new THREE.Object3D();
  mouthTip.position.set(0, -0.04, 0.68);
  headGroup.add(mouthTip);

  // Warm flickering dragonfire point light beneath the dragon's jaws!
  const dragonLight = new THREE.PointLight(0xff6b1a, 0, 14, 1.6);
  dragonLight.position.set(0, -0.25, 0.72);
  headGroup.add(dragonLight);

  // 3. Twin Giant Articulated Bat-Style Wings (Inner Wing + Hinged Sweeping Outer Wingtip!)
  const buildWingSide = sgn => {
    const inner = new THREE.Group();
    inner.position.set(sgn * 0.32, 0.18, 0.28);

    // Muscular wing arm bone (shoulder -> elbow)
    const humerus = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 1.15, 6), darkScaleMat);
    humerus.rotation.z = -sgn * (Math.PI / 2 - 0.14);
    humerus.position.set(sgn * 0.55, 0.08, 0.10);
    humerus.castShadow = true;
    inner.add(humerus);

    // Inner leathery scalloped wing membrane
    const innerShape = new THREE.Shape();
    innerShape.moveTo(0, 0.22);
    innerShape.lineTo(sgn * 1.12, 0.34);
    innerShape.lineTo(sgn * 1.05, -0.92);
    innerShape.quadraticCurveTo(sgn * 0.52, -0.58, 0, -0.82);
    innerShape.closePath();
    const innerGeom = new THREE.ShapeGeometry(innerShape);
    innerGeom.rotateX(Math.PI / 2);
    const innerMem = new THREE.Mesh(innerGeom, membraneMat);
    innerMem.castShadow = true;
    inner.add(innerMem);

    // Hinged outer wingtip (elbow -> wingtip with 3 radiating bony wing fingers!)
    const outer = new THREE.Group();
    outer.position.set(sgn * 1.10, 0.16, 0.18);
    inner.add(outer);

    const fingerClaw = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.24, 5), hornMat);
    fingerClaw.position.set(sgn * 0.04, 0.02, 0.18);
    fingerClaw.rotation.x = Math.PI / 2;
    outer.add(fingerClaw);

    const fingerTargets = [
      [sgn * 1.55, -0.18],
      [sgn * 1.28, -0.88],
      [sgn * 0.62, -1.16],
    ];
    for (const [fx, fz] of fingerTargets) {
      const len = Math.hypot(fx, fz);
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.042, len, 5), hornMat);
      spar.position.set(fx * 0.5, 0, fz * 0.5);
      spar.rotation.order = 'YXZ';
      spar.rotation.y = Math.atan2(fx, fz);
      spar.rotation.x = Math.PI / 2;
      outer.add(spar);
    }

    const outerShape = new THREE.Shape();
    outerShape.moveTo(0, 0.14);
    outerShape.lineTo(sgn * 1.55, -0.18);
    outerShape.quadraticCurveTo(sgn * 1.32, -0.50, sgn * 1.28, -0.88);
    outerShape.quadraticCurveTo(sgn * 0.90, -0.82, sgn * 0.62, -1.16);
    outerShape.quadraticCurveTo(sgn * 0.28, -0.88, -sgn * 0.05, -1.10);
    outerShape.closePath();
    const outerGeom = new THREE.ShapeGeometry(outerShape);
    outerGeom.rotateX(Math.PI / 2);
    const outerMem = new THREE.Mesh(outerGeom, membraneMat);
    outerMem.castShadow = true;
    outer.add(outerMem);

    dragonRoot.add(inner);
    return { inner, outer };
  };
  const leftWing = buildWingSide(-1);
  const rightWing = buildWingSide(1);

  // 4. Articulated 5-Segment Sinuous Barbed Tail
  const tailSegs = [];
  let tailParent = dragonRoot;
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, i === 0 ? -0.02 : 0, i === 0 ? -0.92 : -0.44);
    const rTop = 0.20 - i * 0.032;
    const rBot = Math.max(0.03, rTop - 0.035);
    const segMesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 0.48, 7), i % 2 === 0 ? scaleMat : darkScaleMat);
    segMesh.rotation.x = Math.PI / 2;
    segMesh.position.z = -0.22;
    segMesh.castShadow = true;
    pivot.add(segMesh);
    const tSpike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.14 - i * 0.015, 4), hornMat);
    tSpike.position.set(0, rTop + 0.04, -0.22);
    tSpike.rotation.x = -0.4;
    pivot.add(tSpike);
    if (i === 4) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 4), hornMat);
      barb.rotation.x = -Math.PI / 2;
      barb.scale.set(1.25, 1, 0.32);
      barb.position.set(0, 0, -0.52);
      pivot.add(barb);
    }
    tailParent.add(pivot);
    tailSegs.push(pivot);
    tailParent = pivot;
  }

  // Scale dragon grandly (~4.8 wingspan, ~4.2 length — terrifying above miniature armies!)
  dragonRoot.scale.setScalar(1.05);

  // 5. Soft Terrain-Hugging Shadow Disc Underneath the Soaring Dragon
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const sgr = sctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  sgr.addColorStop(0.0, 'rgba(12, 16, 22, 0.48)');
  sgr.addColorStop(0.55, 'rgba(12, 16, 22, 0.22)');
  sgr.addColorStop(1.0, 'rgba(12, 16, 22, 0)');
  sctx.fillStyle = sgr;
  sctx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const dragonShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 4.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.72, depthWrite: false })
  );
  dragonShadow.rotation.x = -Math.PI / 2;
  dragonShadow.renderOrder = 3;
  dragonLayer.add(dragonShadow);

  // 6. GPU-Instanced Blazing Dragonfire Stream & Lingering Battlefield Wildfires!
  const MAX_FIRE = 160;
  const fireGeom = new THREE.IcosahedronGeometry(0.24, 1);
  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fireInst = new THREE.InstancedMesh(fireGeom, fireMat, MAX_FIRE);
  fireInst.frustumCulled = false;
  fireInst.setColorAt(0, new THREE.Color(0xffffff));
  fireInst.count = 0;
  dragonLayer.add(fireInst);

  const MAX_GROUND_FIRE = 56;
  const gFireGeom = new THREE.ConeGeometry(0.26, 0.62, 6);
  gFireGeom.translate(0, 0.28, 0);
  const gFireMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gFireInst = new THREE.InstancedMesh(gFireGeom, gFireMat, MAX_GROUND_FIRE);
  gFireInst.frustumCulled = false;
  gFireInst.setColorAt(0, new THREE.Color(0xffffff));
  gFireInst.count = 0;
  dragonLayer.add(gFireInst);

  const fireParticles = [];
  const groundFires = [];

  // 6B. ORGANIC CLIFF-BLENDED MOUNTAIN DRAGON CAVE NEST ON THE LEFT ALPINE PEAK!
  // Carved directly into the terrain shelf & framed with sculpted alpine granite matching the mountain rock!
  const LAIR_X = DRAGON_LAIR.x;
  const LAIR_Z = DRAGON_LAIR.z;
  const LAIR_ROT = DRAGON_LAIR.rotY;
  const LAIR_Y = DRAGON_LAIR.shelfH;
  const NEST_X = LAIR_X + Math.sin(LAIR_ROT) * 1.25;
  const NEST_Z = LAIR_Z + Math.cos(LAIR_ROT) * 1.25;
  const NEST_Y = terrainHeight(NEST_X, NEST_Z) + 0.30;

  const lairGroup = new THREE.Group();
  lairGroup.position.set(LAIR_X, LAIR_Y, LAIR_Z);
  lairGroup.rotation.y = LAIR_ROT;

  // Perturbed organic alpine granite geometry matching the mountain cliffs (zero artificial blocks/cylinders!)
  const makeCragGeom = (rad, seedOff) => {
    const g = new THREE.IcosahedronGeometry(rad, 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const n = 1
        + Math.sin(vx * 3.8 + vy * 2.9 + seedOff) * 0.16
        + Math.cos(vz * 4.1 - vx * 3.2 - seedOff) * 0.12;
      pos.setXYZ(i, vx * n, vy * n, vz * n);
    }
    g.computeVertexNormals();
    return g;
  };
  const cragGeomA = makeCragGeom(0.95, 1.2);
  const cragGeomB = makeCragGeom(0.92, 4.7);

  // Match the exact alpine mountain rock & snow palette from buildCampaignTerrain()!
  const cliffRockMat = new THREE.MeshStandardMaterial({ color: 0x676d66, roughness: 0.90, metalness: 0.03 });
  const darkSlateMat = new THREE.MeshStandardMaterial({ color: 0x505653, roughness: 0.92, metalness: 0.04 });
  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.86, metalness: 0.02 });
  const caveVoidMat = new THREE.MeshBasicMaterial({ color: 0x0b090a });
  const caveEmberMat = new THREE.MeshBasicMaterial({ color: 0xd94812, transparent: true, opacity: 0.28, depthWrite: false });

  // Natural jagged cliff overhang & flanking mountain buttresses seamlessly merging into the alpine slope
  const cliffCrags = [
    [-1.70, 0.72, -0.55, 1.35, 1.45, 1.55, 0.14, true],
    [1.70, 0.72, -0.55, 1.35, 1.45, 1.55, -0.14, false],
    [-1.18, 1.68, -0.75, 1.35, 1.05, 1.65, 0.36, false],
    [1.18, 1.68, -0.75, 1.35, 1.05, 1.65, -0.36, true],
    [0.00, 2.08, -0.92, 1.95, 0.95, 1.85, 0.03, true],
    [-2.55, 0.18, -0.10, 1.30, 0.95, 1.35, 0.22, false],
    [2.55, 0.18, -0.10, 1.30, 0.95, 1.35, -0.20, true],
    [0.00, 0.95, -1.78, 2.05, 1.35, 1.25, 0.00, true],
  ];
  for (const [bx, by, bz, sx, sy, sz, rz, useA] of cliffCrags) {
    const rock = new THREE.Mesh(useA ? cragGeomA : cragGeomB, useA ? cliffRockMat : darkSlateMat);
    rock.position.set(bx, by, bz);
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(0.12, bx * 0.35, rz);
    rock.castShadow = true;
    rock.receiveShadow = true;
    lairGroup.add(rock);
  }

  // Snow drifts resting naturally across the upper & rear rocky overhang so even the back POV blends with the snowy summit!
  for (const [sx0, sy0, sz0, scx, scy, scz] of [
    [0.0, 2.66, -1.05, 1.85, 0.42, 1.45],
    [0.0, 1.88, -1.78, 1.90, 0.58, 1.20],
    [-1.55, 2.18, -0.85, 1.05, 0.32, 1.05],
    [1.52, 2.14, -0.88, 1.02, 0.30, 1.02],
  ]) {
    const drift = new THREE.Mesh(cragGeomA, snowCapMat);
    drift.position.set(sx0, sy0, sz0);
    drift.scale.set(scx, scy, scz);
    drift.receiveShadow = true;
    lairGroup.add(drift);
  }

  // Deep recessed shadow cavern mouth tucked naturally beneath the rocky alpine overhang
  const caveVoid = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.24, 1.9, 12, 1, false, 0, Math.PI), caveVoidMat);
  caveVoid.rotation.z = Math.PI / 2;
  caveVoid.rotation.y = Math.PI / 2;
  caveVoid.scale.set(1, 1.05, 1.1);
  caveVoid.position.set(0, 0.02, -0.82);
  lairGroup.add(caveVoid);
  const caveBack = new THREE.Mesh(new THREE.CircleGeometry(1.22, 12), caveVoidMat);
  caveBack.position.set(0, 0.78, -0.68);
  lairGroup.add(caveBack);

  // Subtle warm ember shimmer deep inside the cave mouth (atmospheric, never flashy)
  const caveEmberGlow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 10), caveEmberMat);
  caveEmberGlow.rotation.x = -Math.PI / 2;
  caveEmberGlow.position.set(0, 0.06, -0.52);
  lairGroup.add(caveEmberGlow);

  // ── 6C. DETAILED DRAGON'S TREASURE HOARD (GOLD MOUNDS, CHESTS, GEMS, CROWNS, GOBLETS & KNIGHT RELICS!) ─
  const hoardGoldMat = new THREE.MeshStandardMaterial({
    color: 0xf0be32,
    emissive: 0x5c3804,
    emissiveIntensity: 0.36,
    roughness: 0.24,
    metalness: 0.88,
  });
  const hoardBrightGold = new THREE.MeshStandardMaterial({
    color: 0xffd75e,
    emissive: 0x6b4506,
    emissiveIntensity: 0.44,
    roughness: 0.18,
    metalness: 0.92,
  });
  const chestWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.80, metalness: 0.08 });
  const chestIronMat = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.42, metalness: 0.78 });
  const relicSteelMat = new THREE.MeshStandardMaterial({ color: 0xd6dde6, roughness: 0.24, metalness: 0.86 });
  const relicCrimsonMat = new THREE.MeshStandardMaterial({ color: 0xb52432, roughness: 0.56, metalness: 0.18 });
  const rubyGemMat = new THREE.MeshStandardMaterial({ color: 0xff2248, emissive: 0x8a081e, emissiveIntensity: 0.65, roughness: 0.14, metalness: 0.25 });

  // 1. Sculpted Organic Golden Coin Mounds spilling from the cavern & forming the dragon's sleeping treasure bed!
  const coinMoundGeom = makeCragGeom(0.55, 7.3);
  const moundSpecs = [
    [0.00, 0.08, -0.22, 1.85, 0.58, 1.35], // deep central hoard pile inside the cave mouth
    [-0.92, 0.06, 0.26, 1.15, 0.44, 0.96], // west flanking gold dune
    [0.94, 0.06, 0.28, 1.18, 0.46, 0.98], // east flanking gold dune
    [0.02, 0.02, 1.15, 1.75, 0.24, 1.32], // wide golden coin carpet right beneath the sleeping dragon!
    [-0.78, 0.02, 1.32, 0.88, 0.26, 0.78], // outer left treasure spill
    [0.86, 0.02, 1.24, 0.92, 0.28, 0.82], // outer right treasure spill
  ];
  for (const [mx, my, mz, sx, sy, sz] of moundSpecs) {
    const mound = new THREE.Mesh(coinMoundGeom, hoardGoldMat);
    mound.position.set(mx, my, mz);
    mound.scale.set(sx, sy, sz);
    mound.rotation.y = mx * 1.4 + mz;
    mound.receiveShadow = true;
    lairGroup.add(mound);
  }

  // 2. 160 Instanced Scattered Gold Coins glinting across the cave floor & spilling down the rocky shelf (1 draw call!)
  const hDummy = new THREE.Object3D();
  const hCol = new THREE.Color();
  const coinGeom = new THREE.CylinderGeometry(0.052, 0.052, 0.015, 7);
  const coinCount = 160;
  const coinInst = new THREE.InstancedMesh(coinGeom, hoardBrightGold, coinCount);
  const coinPalette = [0xffdf6b, 0xf2c238, 0xffe88c, 0xdba320];
  for (let i = 0; i < coinCount; i++) {
    const a = dRand() * Math.PI * 2;
    const rad = Math.pow(dRand(), 0.65) * 1.65;
    const cx = Math.cos(a) * rad * 1.05;
    const cz = 0.58 + Math.sin(a) * rad * 0.92;
    // Slightly higher on the inner mound peaks, flat along the outer apron
    const moundLift = Math.max(0, 1 - Math.hypot(cx, cz + 0.12) / 1.45) * 0.28
      + Math.max(0, 1 - Math.hypot(cx, cz - 1.12) / 1.15) * 0.09;
    hDummy.position.set(cx, 0.05 + moundLift + dRand() * 0.03, cz);
    hDummy.rotation.set((dRand() - 0.5) * 0.75, dRand() * 6.28, (dRand() - 0.5) * 0.75);
    hDummy.scale.setScalar(0.72 + dRand() * 0.62);
    hDummy.updateMatrix();
    coinInst.setMatrixAt(i, hDummy.matrix);
    hCol.setHex(coinPalette[i % coinPalette.length]);
    coinInst.setColorAt(i, hCol);
  }
  coinInst.instanceMatrix.needsUpdate = true;
  if (coinInst.instanceColor) coinInst.instanceColor.needsUpdate = true;
  lairGroup.add(coinInst);

  // 3. 20 Instanced Stacked Gold Bullion Ingots piled in gleaming mini-pyramids (1 draw call!)
  const ingotGeom = new THREE.BoxGeometry(0.16, 0.058, 0.078);
  const ingotSpecs = [
    // West ingot stack
    [-0.62, 0.24, 0.16, 0.22], [-0.52, 0.24, 0.24, 0.28], [-0.58, 0.24, 0.08, 0.18],
    [-0.57, 0.30, 0.18, 0.25], [-0.49, 0.30, 0.12, 0.30], [-0.54, 0.36, 0.15, 0.22],
    // East ingot stack
    [0.58, 0.24, 0.12, -0.35], [0.68, 0.24, 0.19, -0.32], [0.62, 0.24, 0.28, -0.40],
    [0.63, 0.30, 0.18, -0.36], [0.70, 0.30, 0.24, -0.28], [0.65, 0.36, 0.20, -0.34],
    // Scattered loose bullion bars near nest apron
    [-1.18, 0.12, 0.92, 0.85], [-1.06, 0.12, 1.04, 1.45], [-1.12, 0.18, 0.98, 1.12],
    [1.15, 0.12, 0.88, -0.95], [1.24, 0.12, 1.00, -0.45], [0.18, 0.22, -0.15, 0.55],
    [-0.14, 0.25, -0.28, -0.72], [0.04, 0.31, -0.22, 0.14],
  ];
  const ingotInst = new THREE.InstancedMesh(ingotGeom, hoardBrightGold, ingotSpecs.length);
  ingotSpecs.forEach(([ix, iy, iz, ry], idx) => {
    hDummy.position.set(ix, iy, iz);
    hDummy.rotation.set(0, ry, 0);
    hDummy.scale.setScalar(1);
    hDummy.updateMatrix();
    ingotInst.setMatrixAt(idx, hDummy.matrix);
  });
  ingotInst.instanceMatrix.needsUpdate = true;
  lairGroup.add(ingotInst);

  // 4. 38 Instanced Sparkling Cut Gemstones (Rubies, Emeralds, Sapphires, Amethysts & Diamonds — 1 draw call!)
  const gemGeom = new THREE.OctahedronGeometry(0.068, 0);
  const gemMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x302418,
    emissiveIntensity: 0.45,
    roughness: 0.10,
    metalness: 0.32,
  });
  const gemColors = [0xff1f44, 0x1ee372, 0x2488ff, 0xc74dff, 0xfff8dc, 0xff941a];
  const gemCount = 38;
  const gemInst = new THREE.InstancedMesh(gemGeom, gemMat, gemCount);
  for (let i = 0; i < gemCount; i++) {
    const a = dRand() * Math.PI * 2;
    const rad = Math.pow(dRand(), 0.7) * 1.45;
    const gx = Math.cos(a) * rad * 1.05;
    const gz = 0.45 + Math.sin(a) * rad * 0.88;
    const lift = Math.max(0, 1 - Math.hypot(gx, gz + 0.15) / 1.4) * 0.30
      + Math.max(0, 1 - Math.hypot(gx, gz - 1.10) / 1.1) * 0.10;
    hDummy.position.set(gx, 0.09 + lift, gz);
    hDummy.rotation.set(dRand() * 3.1, dRand() * 6.28, dRand() * 3.1);
    hDummy.scale.set(0.85 + dRand() * 0.65, 1.15 + dRand() * 0.75, 0.85 + dRand() * 0.65);
    hDummy.updateMatrix();
    gemInst.setMatrixAt(i, hDummy.matrix);
    hCol.setHex(gemColors[i % gemColors.length]);
    gemInst.setColorAt(i, hCol);
  }
  gemInst.instanceMatrix.needsUpdate = true;
  if (gemInst.instanceColor) gemInst.instanceColor.needsUpdate = true;
  lairGroup.add(gemInst);

  // 5. 3 Detailed Iron-Bound Medieval Treasure Chests (2 Overflowing Open + 1 Half-Buried Closed!)
  const addTreasureChest = (cx, cy, cz, rotY, isOpen = true, tiltZ = 0) => {
    const cg = new THREE.Group();
    cg.position.set(cx, cy, cz);
    cg.rotation.set(0, rotY, tiltZ);

    // Timber chest base + dark iron corner strapping & brass lockplate
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.30), chestWoodMat);
    box.position.y = 0.12;
    box.castShadow = true;
    cg.add(box);
    for (const bx of [-0.19, 0.19]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.255, 0.315), chestIronMat);
      band.position.set(bx, 0.12, 0);
      cg.add(band);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.025), hoardBrightGold);
    lock.position.set(0, 0.17, 0.155);
    cg.add(lock);

    // Arched wooden chest lid (propped wide open to reveal overflowing gold & jewels, or closed!)
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.24, -0.15);
    lidPivot.rotation.x = isOpen ? -1.25 : 0;
    const lidCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 8, 1, false, 0, Math.PI), chestWoodMat);
    lidCyl.rotation.z = Math.PI / 2;
    lidCyl.position.set(0, 0, 0.15);
    lidPivot.add(lidCyl);
    for (const bx of [-0.19, 0.19]) {
      const lBand = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.045, 8, 1, false, 0, Math.PI), chestIronMat);
      lBand.rotation.z = Math.PI / 2;
      lBand.position.set(bx, 0, 0.15);
      lidPivot.add(lBand);
    }
    cg.add(lidPivot);

    if (isOpen) {
      // Overflowing gold coin mound & ruby jewel brimming out of the open chest!
      const brim = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), hoardBrightGold);
      brim.scale.set(1.02, 0.46, 0.68);
      brim.position.set(0, 0.24, 0.01);
      cg.add(brim);
      const cGem = new THREE.Mesh(gemGeom, rubyGemMat);
      cGem.position.set(0.04, 0.33, 0.03);
      cGem.scale.setScalar(1.1);
      cg.add(cGem);
    }
    lairGroup.add(cg);
  };
  addTreasureChest(-0.96, 0.14, 0.52, 0.52, true, 0.06);
  addTreasureChest(0.98, 0.16, 0.40, -0.68, true, -0.05);
  addTreasureChest(-0.34, 0.24, -0.26, 0.24, false, 0.14);

  // 6. Royal Crowns, Gold Goblets & Plundered Knight Trophies (Sword, Shield & Great-Helm!)
  const addRoyalCrown = (kx, ky, kz, tiltX = 0, tiltZ = 0) => {
    const cr = new THREE.Group();
    cr.position.set(kx, ky, kz);
    cr.rotation.set(tiltX, kx * 2.0, tiltZ);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.065, 10, 1, true), hoardBrightGold);
    cr.add(band);
    for (let s = 0; s < 6; s++) {
      const sa = (s / 6) * Math.PI * 2;
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 4), hoardBrightGold);
      tine.position.set(Math.cos(sa) * 0.105, 0.055, Math.sin(sa) * 0.105);
      cr.add(tine);
    }
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.032), rubyGemMat);
    jewel.position.set(0, 0.01, 0.11);
    cr.add(jewel);
    lairGroup.add(cr);
  };
  addRoyalCrown(0.24, 0.38, -0.14, 0.18, -0.22);
  addRoyalCrown(-0.84, 0.24, 1.06, 0.34, 0.28);

  // 5 Gilded Chalices / Goblets (some upright, some tipped on their sides in the coins!)
  const gobletSpecs = [
    [-0.46, 0.28, 0.42, 0, 0],
    [0.52, 0.28, 0.48, 0, 0],
    [1.06, 0.16, 1.12, 1.48, 0.4],
    [-0.22, 0.20, 1.56, 1.52, -0.8],
    [0.72, 0.22, -0.18, 0, 0],
  ];
  const cupGeom = new THREE.CylinderGeometry(0.055, 0.024, 0.085, 8);
  const stemGeom = new THREE.CylinderGeometry(0.014, 0.042, 0.075, 7);
  for (const [gx, gy, gz, rx, rz] of gobletSpecs) {
    const gob = new THREE.Group();
    gob.position.set(gx, gy, gz);
    gob.rotation.set(rx, gx * 3.1, rz);
    const stem = new THREE.Mesh(stemGeom, hoardBrightGold);
    stem.position.y = 0.038;
    gob.add(stem);
    const cup = new THREE.Mesh(cupGeom, hoardBrightGold);
    cup.position.y = 0.105;
    gob.add(cup);
    lairGroup.add(gob);
  }

  // Plundered Royal Broadsword thrust upright at an angle into the central gold hoard!
  const trophySword = new THREE.Group();
  trophySword.position.set(0.42, 0.36, 0.08);
  trophySword.rotation.set(0.24, 0.45, -0.32);
  const tsBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.62, 0.016), relicSteelMat);
  tsBlade.position.y = 0.18;
  trophySword.add(tsBlade);
  const tsGuard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.038, 0.042), hoardBrightGold);
  tsGuard.position.y = 0.48;
  trophySword.add(tsGuard);
  const tsGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.14, 6), relicCrimsonMat);
  tsGrip.position.y = 0.56;
  trophySword.add(tsGrip);
  const tsPommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.042), hoardBrightGold);
  tsPommel.position.y = 0.64;
  trophySword.add(tsPommel);
  lairGroup.add(trophySword);

  // Plundered Gilded Heater Shield leaning against the left granite cave wall & fallen Knight Great-Helm!
  const trophyShield = new THREE.Group();
  trophyShield.position.set(-1.18, 0.30, 0.14);
  trophyShield.rotation.set(-0.34, 0.62, 0.18);
  const tsPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.035), relicCrimsonMat);
  trophyShield.add(tsPlate);
  const tsRim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.024), hoardBrightGold);
  tsRim.position.z = -0.008;
  trophyShield.add(tsRim);
  const tsBoss = new THREE.Mesh(new THREE.SphereGeometry(0.068, 7, 6), hoardBrightGold);
  tsBoss.position.z = 0.025;
  trophyShield.add(tsBoss);
  lairGroup.add(trophyShield);

  const trophyHelm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.19, 8), relicSteelMat);
  trophyHelm.position.set(1.22, 0.14, 0.72);
  trophyHelm.rotation.set(0.45, -0.5, 0.62);
  lairGroup.add(trophyHelm);

  // 7. Subtle Animated Golden Shimmer Glints twinkling across the dragon's hoard!
  const hoardGlints = [];
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff7c2, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const glintGeom = new THREE.OctahedronGeometry(0.055, 0);
  const glintCoords = [
    [-0.92, 0.46, 0.52], [0.96, 0.48, 0.40], [0.00, 0.46, -0.18], [0.42, 0.82, 0.10],
    [-0.56, 0.42, 0.16], [0.64, 0.42, 0.20], [-0.40, 0.24, 1.24], [0.68, 0.26, 1.18],
  ];
  glintCoords.forEach(([gx, gy, gz], idx) => {
    const gl = new THREE.Mesh(glintGeom, glintMat.clone());
    gl.position.set(gx, gy, gz);
    lairGroup.add(gl);
    hoardGlints.push({ mesh: gl, phase: idx * 1.15 });
  });

  // Thin lazy mountain-cavern smoke wisps curling softly out from the overhang
  const lairSmokePuffs = [];
  const lairSmokeMat = new THREE.MeshBasicMaterial({ color: 0xcbd0d4, transparent: true, opacity: 0.16, depthWrite: false });
  for (let p = 0; p < 3; p++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), lairSmokeMat.clone());
    puff.position.set(0, 1.45, -0.1);
    lairGroup.add(puff);
    lairSmokePuffs.push({ mesh: puff, phase: p * 0.33 });
  }
  dragonLayer.add(lairGroup);

  // 7. Roaming Chaos & Mountain-Nest Resting State Machine!
  const state = {
    x: -7.5,
    y: 9.2,
    z: -7.0,
    heading: 0.75,
    bank: 0,
    pitch: 0,
    speed: 4.8,
    mode: 'roam', // 'roam' -> 'dive' -> 'strafe' -> 'climb' -> (every 2 raids) -> 'return_lair' -> 'land' -> 'sleep' -> 'takeoff'
    timer: 2.6,
    goalX: 5.0,
    goalZ: 2.0,
    targetUnit: null,
    raidsSinceRest: 0,
    breathTick: 0,
    damageTick: 0,
    jawOpen: 0,
    wingPhase: 0,
    sleepBlend: 0,
  };

  const pickRandomRoamPoint = () => {
    const px = (dRand() - 0.5) * 48;
    const pz = (dRand() - 0.5) * 36;
    return [px, pz];
  };

  const pickRandomTargetTroop = () => {
    if (!armies?.units?.length) return null;
    let best = null;
    for (let k = 0; k < 14; k++) {
      const idx = Math.floor(dRand() * armies.units.length);
      const u = armies.units[idx];
      if (u && u.alive) {
        best = u;
        if (Math.hypot(u.x - state.x, u.z - state.z) > 7.5) break;
      }
    }
    return best;
  };

  const dummy = new THREE.Object3D();
  const cCore = new THREE.Color(0xfff4a8);
  const cMid = new THREE.Color(0xff7414);
  const cHot = new THREE.Color(0xd6240c);
  const cSmoke = new THREE.Color(0x4a160c);
  const cTmp = new THREE.Color();
  const mouthWorld = new THREE.Vector3();

  function update(dt, t) {
    state.timer -= dt;

    // Animate cave ember pulse & lazy smoke rising from the left mountain lair
    const isSleeping = state.mode === 'sleep';
    caveEmberGlow.material.opacity = (isSleeping ? 0.65 : 0.32) + Math.sin(t * 2.8) * 0.16;
    for (const sp of lairSmokePuffs) {
      const cyc = (t * (isSleeping ? 0.24 : 0.16) + sp.phase) % 1;
      sp.mesh.position.set(
        Math.sin(t * 0.9 + sp.phase * 6) * 0.35 + cyc * 0.55,
        1.55 + cyc * 2.8,
        0.35 + cyc * 0.6
      );
      sp.mesh.scale.setScalar(0.5 + cyc * 1.5);
      sp.mesh.material.opacity = (1 - cyc) * (isSleeping ? 0.30 : 0.16);
    }

    // Mode transitions (includes periodic trips home to the left mountain cave nest to sleep & rest!)
    if (state.mode === 'roam') {
      const distGoal = Math.hypot(state.goalX - state.x, state.goalZ - state.z);
      if (distGoal < 4.5) {
        const [rx, rz] = pickRandomRoamPoint();
        state.goalX = rx;
        state.goalZ = rz;
      }
      if (state.timer <= 0) {
        if (state.raidsSinceRest >= 2) {
          state.mode = 'return_lair';
          state.goalX = NEST_X + Math.sin(LAIR_ROT) * 3.8;
          state.goalZ = NEST_Z + Math.cos(LAIR_ROT) * 3.8;
          state.timer = 16.0;
        } else {
          const prey = pickRandomTargetTroop();
          if (prey) {
            state.targetUnit = prey;
            state.goalX = prey.x;
            state.goalZ = prey.z;
            state.mode = 'dive';
            state.timer = 9.0;
          } else {
            state.timer = 3.0;
          }
        }
      }
    } else if (state.mode === 'dive') {
      if (state.targetUnit && state.targetUnit.alive) {
        state.goalX = state.targetUnit.x;
        state.goalZ = state.targetUnit.z;
      }
      const distPrey = Math.hypot(state.goalX - state.x, state.goalZ - state.z);
      if (distPrey < 6.2) {
        state.mode = 'strafe';
        state.timer = 3.2 + dRand() * 1.5;
        state.damageTick = 0;
      } else if (state.timer <= 0) {
        state.mode = 'roam';
        state.timer = 4.5;
      }
    } else if (state.mode === 'strafe') {
      if (state.targetUnit && state.targetUnit.alive) {
        state.goalX = state.targetUnit.x;
        state.goalZ = state.targetUnit.z;
      }
      if (state.timer <= 0) {
        state.raidsSinceRest++;
        state.mode = 'climb';
        state.timer = 2.6 + dRand() * 1.0;
        const [rx, rz] = pickRandomRoamPoint();
        state.goalX = rx;
        state.goalZ = rz;
      }
    } else if (state.mode === 'climb') {
      if (state.timer <= 0) {
        state.mode = 'roam';
        state.timer = 4.0 + dRand() * 3.4;
      }
    } else if (state.mode === 'return_lair') {
      const distLair = Math.hypot(NEST_X - state.x, NEST_Z - state.z);
      if (distLair < 5.2 || state.timer <= 0) {
        state.mode = 'land';
        state.timer = 4.5;
      }
    } else if (state.mode === 'land') {
      const distNest = Math.hypot(NEST_X - state.x, NEST_Z - state.z);
      if ((distNest < 0.35 && Math.abs(state.y - NEST_Y) < 0.25) || state.timer <= 0) {
        state.mode = 'sleep';
        state.raidsSinceRest = 0;
        // Long, peaceful slumber on the mountain cave shelf (26–38 seconds!)
        state.timer = 26.0 + dRand() * 12.0;
      }
    } else if (state.mode === 'sleep') {
      if (state.timer <= 0) {
        state.mode = 'takeoff';
        state.timer = 2.6;
        const [rx, rz] = pickRandomRoamPoint();
        state.goalX = rx;
        state.goalZ = rz;
      }
    } else if (state.mode === 'takeoff') {
      if (state.timer <= 0) {
        state.mode = 'roam';
        state.timer = 3.2 + dRand() * 2.5;
      }
    }

    // Smooth sleep posture blend (begins folding gently right as the dragon touches down!)
    const targetSleep = isSleeping ? 1 : (state.mode === 'land' ? 0.38 : 0);
    state.sleepBlend += (targetSleep - state.sleepBlend) * Math.min(1, dt * 1.9);

    let diffH = 0;
    if (state.mode === 'sleep') {
      // Settle belly flush and low onto the rocky cave shelf facing calmly out over the valley
      state.x += (NEST_X - state.x) * Math.min(1, dt * 2.4);
      state.z += (NEST_Z - state.z) * Math.min(1, dt * 2.4);
      state.y += (NEST_Y - state.y) * Math.min(1, dt * 2.4);
      let hDiff = LAIR_ROT - state.heading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      state.heading += hDiff * Math.min(1, dt * 2.0);
      state.bank += (0 - state.bank) * Math.min(1, dt * 3.5);
      state.pitch += (0.02 - state.pitch) * Math.min(1, dt * 3.5);
      state.speed = 0;
    } else if (state.mode === 'land') {
      // Smooth glide-descent straight onto the mountain shelf while squaring up toward the valley
      state.x += (NEST_X - state.x) * Math.min(1, dt * 1.45);
      state.z += (NEST_Z - state.z) * Math.min(1, dt * 1.45);
      state.y += (NEST_Y - state.y) * Math.min(1, dt * 1.55);
      let hDiff = LAIR_ROT - state.heading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      state.heading += hDiff * Math.min(1, dt * 1.8);
      state.bank += (0 - state.bank) * Math.min(1, dt * 3.2);
      state.pitch += (-0.18 - state.pitch) * Math.min(1, dt * 2.8);
      state.speed *= Math.max(0, 1 - dt * 2.2);
    } else {
      // Active Flight Steering (roam, dive, strafe, climb, return_lair, takeoff)
      const desiredHeading = Math.atan2(state.goalX - state.x, state.goalZ - state.z);
      diffH = desiredHeading - state.heading;
      while (diffH > Math.PI) diffH -= Math.PI * 2;
      while (diffH < -Math.PI) diffH += Math.PI * 2;

      const maxTurn = state.mode === 'strafe' ? 1.55 : state.mode === 'dive' ? 1.85 : 1.25;
      const turnStep = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diffH));
      state.heading += turnStep;

      const groundHere = Math.max(0.2, terrainHeight(state.x, state.z));
      const targetSpeed = state.mode === 'dive' ? 6.8 : state.mode === 'strafe' ? 4.2 : state.mode === 'takeoff' ? 5.2 : state.mode === 'climb' ? 5.6 : 5.0;
      state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.5);

      const desiredAlt = state.mode === 'strafe'
        ? groundHere + 2.85
        : state.mode === 'dive'
          ? Math.max(groundHere + 3.2, 4.4)
          : state.mode === 'return_lair'
            ? Math.max(groundHere + 2.8, NEST_Y + 2.4)
            : Math.max(groundHere + 4.2, 9.2 + Math.sin(t * 0.65) * 1.1);

      const prevY = state.y;
      state.y += (desiredAlt - state.y) * Math.min(1, dt * (state.mode === 'dive' ? 2.4 : 1.6));
      state.x += Math.sin(state.heading) * state.speed * dt;
      state.z += Math.cos(state.heading) * state.speed * dt;

      state.x = Math.max(-29, Math.min(29, state.x));
      state.z = Math.max(-23, Math.min(21, state.z));

      const targetBank = Math.max(-0.68, Math.min(0.68, -diffH * 0.72));
      state.bank += (targetBank - state.bank) * Math.min(1, dt * 3.8);
      const vy = (state.y - prevY) / Math.max(0.008, dt);
      const targetPitch = Math.max(-0.42, Math.min(0.45, -vy * 0.085));
      state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 4.0);
    }

    // Apply transform to Dragon Root with calm, slow sleeping chest-breath rise
    const sb = state.sleepBlend;
    const slowBreath = Math.sin(t * 0.85);
    dragonRoot.position.set(state.x, state.y + slowBreath * 0.022 * sb, state.z);
    dragonRoot.rotation.order = 'YXZ';
    dragonRoot.rotation.set(state.pitch, state.heading, state.bank);
    chest.scale.set(0.86 * (1 + slowBreath * 0.032 * sb), 0.78 * (1 + slowBreath * 0.048 * sb), 1.65);

    // Wingbeat cadence vs Natural Swept-Back Resting Mantle (folds BACK along the flanks, never forward!)
    const wingSpeed = state.mode === 'climb' || state.mode === 'takeoff' ? 7.8 : state.mode === 'land' ? 6.2 : state.mode === 'strafe' ? 6.4 : state.mode === 'dive' ? 3.2 : 5.1;
    const wingAmp = state.mode === 'dive' ? 0.24 : (state.mode === 'climb' || state.mode === 'takeoff') ? 0.68 : 0.54;
    state.wingPhase += dt * wingSpeed;
    const flyFlapIn = Math.sin(state.wingPhase) * wingAmp;
    const flyFlapOut = Math.sin(state.wingPhase - 0.72) * (wingAmp * 0.85);

    // In Three.js right-handed coords: left wing (-X) sweeps BACKWARD (-Z) with negative Y rot; right wing (+X) with positive Y rot!
    const restInZ = 0.26 + slowBreath * 0.025;   // gently arched over the shoulders like a folded dragon mantle
    const restOutZ = -0.52 - slowBreath * 0.02;  // outer wingtip drapes softly downward along the flank
    leftWing.inner.rotation.order = 'YXZ';
    rightWing.inner.rotation.order = 'YXZ';
    leftWing.inner.rotation.y = -1.16 * sb;
    rightWing.inner.rotation.y = 1.16 * sb;
    leftWing.inner.rotation.x = -0.10 * sb;
    rightWing.inner.rotation.x = -0.10 * sb;
    leftWing.inner.rotation.z = -flyFlapIn * (1 - sb) - restInZ * sb;
    rightWing.inner.rotation.z = flyFlapIn * (1 - sb) + restInZ * sb;

    leftWing.outer.rotation.order = 'YXZ';
    rightWing.outer.rotation.order = 'YXZ';
    leftWing.outer.rotation.y = -0.46 * sb;
    rightWing.outer.rotation.y = 0.46 * sb;
    leftWing.outer.rotation.z = (-flyFlapOut - 0.14) * (1 - sb) - restOutZ * sb;
    rightWing.outer.rotation.z = (flyFlapOut + 0.14) * (1 - sb) + restOutZ * sb;

    dragonRoot.position.y += -Math.sin(state.wingPhase) * 0.12 * (1 - sb);

    // Natural curled sleeping neck & head resting comfortably flat on the stone beside its shoulder!
    const breathing = state.mode === 'strafe';
    state.jawOpen += ((breathing ? 0.62 : isSleeping ? 0.01 : 0.08) - state.jawOpen) * Math.min(1, dt * 6.5);
    jawGroup.rotation.x = state.jawOpen;
    const targetNeckX = breathing ? 0.42 : (0.30 + slowBreath * 0.025) * sb + (state.mode === 'dive' ? 0.22 : Math.sin(t * 1.8) * 0.05) * (1 - sb);
    const targetNeckY = -0.46 * sb + Math.max(-0.35, Math.min(0.35, diffH * 0.35)) * (1 - sb);
    neckGroup.rotation.x += (targetNeckX - neckGroup.rotation.x) * Math.min(1, dt * 3.8);
    neckGroup.rotation.y += (targetNeckY - neckGroup.rotation.y) * Math.min(1, dt * 3.8);
    headGroup.rotation.x += (-0.26 * sb - headGroup.rotation.x) * Math.min(1, dt * 3.8);
    headGroup.rotation.y += (-0.32 * sb - headGroup.rotation.y) * Math.min(1, dt * 3.8);
    headGroup.rotation.z += (0.14 * sb - headGroup.rotation.z) * Math.min(1, dt * 3.8);

    eyeMat.emissiveIntensity = 2.3 * (1 - sb) + (0.24 + slowBreath * 0.08) * sb;
    throatGlow.scale.setScalar(breathing ? 1.35 + Math.sin(t * 28) * 0.22 : 0.55);
    dragonLight.intensity = breathing ? 5.8 + Math.sin(t * 26) * 1.4 : isSleeping ? 0.9 + slowBreath * 0.25 : 0.0;

    // Smooth curled sleeping tail wrapping naturally along its left flank on the rocky ledge
    for (let i = 0; i < tailSegs.length; i++) {
      const flyTailY = Math.sin(t * 5.2 - i * 0.78) * (0.14 + i * 0.03) - diffH * 0.12;
      const sleepTailY = 0.34 + slowBreath * 0.012;
      tailSegs[i].rotation.y = flyTailY * (1 - sb) + sleepTailY * sb;
      tailSegs[i].rotation.x = Math.cos(t * 3.6 - i * 0.65) * 0.07 * (1 - sb) - 0.03 * sb;
    }

    // Terrain-hugging shadow (fades out cleanly once nestled on the rocky cave shelf)
    const shY = Math.max(0.02, terrainHeight(state.x, state.z)) + 0.08;
    const alt = Math.max(1, state.y - shY);
    const shScale = 0.72 + Math.min(1.4, alt * 0.085);
    dragonShadow.position.set(state.x, shY, state.z);
    dragonShadow.rotation.z = -state.heading;
    dragonShadow.scale.setScalar(shScale);
    dragonShadow.material.opacity = Math.max(0.18, 0.76 - alt * 0.038) * (1 - sb * 0.92);

    // Emit blazing dragonfire torrent & deal splash chaos damage during strafe!
    if (breathing) {
      dragonRoot.updateMatrixWorld(true);
      mouthTip.getWorldPosition(mouthWorld);

      // Ground aim point right ahead of the dragon toward the target troops
      const aimX = state.x + Math.sin(state.heading) * 3.1;
      const aimZ = state.z + Math.cos(state.heading) * 3.1;
      const aimY = Math.max(0.12, terrainHeight(aimX, aimZ)) + 0.14;

      state.breathTick -= dt;
      if (state.breathTick <= 0) {
        state.breathTick = 0.028;
        for (let k = 0; k < 2; k++) {
          if (fireParticles.length >= MAX_FIRE) fireParticles.shift();
          const spread = 1.05;
          const tx = aimX + (dRand() - 0.5) * spread;
          const tz = aimZ + (dRand() - 0.5) * spread;
          const ty = aimY + (dRand() - 0.3) * 0.35;
          const dur = 0.42 + dRand() * 0.24;
          fireParticles.push({
            x: mouthWorld.x,
            y: mouthWorld.y,
            z: mouthWorld.z,
            vx: (tx - mouthWorld.x) / dur,
            vy: (ty - mouthWorld.y) / dur,
            vz: (tz - mouthWorld.z) / dur,
            age: 0,
            dur,
            baseS: 0.48 + dRand() * 0.45,
          });
        }
      }

      // Deal roaring dragonfire chaos damage to ANY troops in the blast zone & ignite lingering flames!
      state.damageTick -= dt;
      if (state.damageTick <= 0) {
        state.damageTick = 0.26;
        if (armies?.applyDragonBlast) {
          armies.applyDragonBlast(aimX, aimZ, 2.45, 52, state.y);
        }
        if (groundFires.length >= MAX_GROUND_FIRE) groundFires.shift();
        groundFires.push({
          x: aimX + (dRand() - 0.5) * 1.4,
          z: aimZ + (dRand() - 0.5) * 1.4,
          age: 0,
          maxAge: 4.2 + dRand() * 2.2,
          s: 0.85 + dRand() * 0.65,
          phase: dRand() * 6.28,
        });
      }
    }

    // Close the dragon's fiery golden eyes & scaly eyelids smoothly while sleeping on its hoard!
    const eyeOpen = Math.max(0, 1 - sb * 1.15);
    eyeMat.emissiveIntensity = 2.3 * eyeOpen * eyeOpen;
    for (let i = 0; i < dragonEyes.length; i++) {
      dragonEyes[i].scale.y = 0.08 + eyeOpen * 0.92;
      dragonEyes[i].visible = eyeOpen > 0.04;
      const lid = dragonEyelids[i];
      lid.visible = sb > 0.10;
      lid.scale.y = 0.25 + sb * 0.78;
      lid.position.y = 0.092 - sb * 0.012;
    }

    // Subtle twinkling specular shimmer across the dragon's treasure hoard
    for (let i = 0; i < hoardGlints.length; i++) {
      const gl = hoardGlints[i];
      const tw = Math.pow(Math.max(0, Math.sin(t * 2.4 + gl.phase)), 4);
      gl.mesh.scale.setScalar(0.25 + tw * 1.15);
      gl.mesh.rotation.y = t * 1.8 + gl.phase;
      gl.mesh.material.opacity = 0.08 + tw * 0.78;
    }

    // Advance & render flying dragonfire breath plumes
    let fC = 0;
    for (let i = fireParticles.length - 1; i >= 0; i--) {
      const fp = fireParticles[i];
      fp.age += dt;
      if (fp.age >= fp.dur) {
        fireParticles.splice(i, 1);
        continue;
      }
      fp.x += fp.vx * dt;
      fp.y += fp.vy * dt;
      fp.z += fp.vz * dt;
      // Billow upward gently once hitting ground level
      const gy = Math.max(0.05, terrainHeight(fp.x, fp.z)) + 0.15;
      if (fp.y < gy) {
        fp.y = gy;
        fp.vy = Math.abs(fp.vy) * 0.18 + 0.5;
        fp.vx *= 0.72;
        fp.vz *= 0.72;
      }
      if (fC < MAX_FIRE) {
        const frac = fp.age / fp.dur;
        const sc = fp.baseS * (0.55 + frac * 1.85) * (1 - Math.max(0, frac - 0.72) / 0.28);
        dummy.position.set(fp.x, fp.y, fp.z);
        dummy.rotation.set(frac * 5, frac * 4, 0);
        dummy.scale.setScalar(Math.max(0.01, sc));
        dummy.updateMatrix();
        fireInst.setMatrixAt(fC, dummy.matrix);
        if (frac < 0.30) cTmp.copy(cCore).lerp(cMid, frac / 0.30);
        else if (frac < 0.72) cTmp.copy(cMid).lerp(cHot, (frac - 0.30) / 0.42);
        else cTmp.copy(cHot).lerp(cSmoke, (frac - 0.72) / 0.28);
        fireInst.setColorAt(fC, cTmp);
        fC++;
      }
    }
    fireInst.count = fC;
    fireInst.instanceMatrix.needsUpdate = true;
    if (fireInst.instanceColor) fireInst.instanceColor.needsUpdate = true;

    // Advance & render flickering lingering ground flames left in the dragon's wake
    let gfC = 0;
    for (let i = groundFires.length - 1; i >= 0; i--) {
      const gf = groundFires[i];
      gf.age += dt;
      if (gf.age >= gf.maxAge) {
        groundFires.splice(i, 1);
        continue;
      }
      if (gfC < MAX_GROUND_FIRE) {
        const fade = gf.age > gf.maxAge - 1.2 ? (gf.maxAge - gf.age) / 1.2 : 1.0;
        const flicker = 0.82 + Math.sin(t * 16 + gf.phase) * 0.26;
        const gy = Math.max(0.02, terrainHeight(gf.x, gf.z));
        dummy.position.set(gf.x, gy, gf.z);
        dummy.rotation.set(Math.sin(t * 11 + gf.phase) * 0.14, gf.phase, Math.cos(t * 9 + gf.phase) * 0.14);
        dummy.scale.set(gf.s * fade, gf.s * flicker * fade, gf.s * fade);
        dummy.updateMatrix();
        gFireInst.setMatrixAt(gfC, dummy.matrix);
        cTmp.copy(cMid).lerp(cCore, 0.35 + Math.sin(t * 14 + gf.phase) * 0.30);
        gFireInst.setColorAt(gfC, cTmp);
        gfC++;
      }
    }
    gFireInst.count = gfC;
    gFireInst.instanceMatrix.needsUpdate = true;
    if (gFireInst.instanceColor) gFireInst.instanceColor.needsUpdate = true;
  }

  update(0.016, 0);
  parent.add(dragonLayer);
  return { dragonLayer, dragonRoot, state, update };
}

// ── 4. SUBTLE GILDED VENUE HIGHLIGHT & CENTERED SOFT SUNBEAM ────────────────
let _sharedBeamTex = null;
function getSoftBeamTexture() {
  if (_sharedBeamTex) return _sharedBeamTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  // Smooth vertical fade: invisible at top sky, gentle golden glow in middle, softly feathers out at ground!
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, 'rgba(255, 240, 190, 0.00)');
  g.addColorStop(0.32, 'rgba(255, 236, 178, 0.32)');
  g.addColorStop(0.74, 'rgba(255, 232, 166, 0.52)');
  g.addColorStop(0.94, 'rgba(255, 228, 156, 0.22)');
  g.addColorStop(1.00, 'rgba(255, 224, 148, 0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  _sharedBeamTex = new THREE.CanvasTexture(c);
  _sharedBeamTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedBeamTex;
}

function createTerritoryRingMesh(spec) {
  const group = new THREE.Group();
  // Compact, venue-hugging elliptical footprint (NEVER covers the venue interior or nearby bridges/trees!)
  const rx = (spec.footX || spec.plateauR) * 0.94;
  const rz = (spec.footZ || spec.plateauR) * 1.02;
  const segA = 64;

  // Hollow outer shimmer halo band (0.82R -> 1.00R ONLY — completely clear over the venue itself!)
  const vertices = [];
  const indices = [];
  for (let ri = 0; ri <= 1; ri++) {
    const scale = ri === 0 ? 0.84 : 1.0;
    for (let ai = 0; ai <= segA; ai++) {
      const theta = (ai / segA) * Math.PI * 2;
      const wx = spec.x + Math.cos(theta) * rx * scale;
      const wz = spec.z + Math.sin(theta) * rz * scale;
      const wy = Math.max(-0.05, terrainHeight(wx, wz)) + 0.07;
      vertices.push(wx, wy, wz);
    }
  }
  for (let ai = 0; ai < segA; ai++) {
    const a = ai;
    const b = ai + 1;
    const c = (segA + 1) + ai;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const discGeom = new THREE.BufferGeometry();
  discGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  discGeom.setIndex(indices);
  discGeom.computeVertexNormals();

  const discMat = new THREE.MeshBasicMaterial({
    color: 0xeed07d,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(discGeom, discMat));

  // Sleek, slender gilded-gold perimeter ring hugging the venue footprint cleanly (no harsh thick red ring!)
  const borderPts = [];
  for (let ai = 0; ai <= segA; ai++) {
    const theta = (ai / segA) * Math.PI * 2;
    const wx = spec.x + Math.cos(theta) * rx;
    const wz = spec.z + Math.sin(theta) * rz;
    const wy = Math.max(-0.04, terrainHeight(wx, wz)) + 0.09;
    borderPts.push(new THREE.Vector3(wx, wy, wz));
  }
  const borderCurve = new THREE.CatmullRomCurve3(borderPts, true);
  const borderGeom = new THREE.TubeGeometry(borderCurve, 72, 0.042, 6, true);
  const borderMat = new THREE.MeshBasicMaterial({
    color: 0xe6c469,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(borderGeom, borderMat));

  // Soft, centered vertical golden spotlight column directly above the venue center!
  const beamRadiusBot = Math.min(rx, rz) * 0.78;
  const beamRadiusTop = beamRadiusBot * 0.46;
  const beamGeom = new THREE.CylinderGeometry(beamRadiusTop, beamRadiusBot, 9.2, 28, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    map: getSoftBeamTexture(),
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.set(spec.x, spec.plateauH + 4.5, spec.z);
  beam.rotation.set(0, 0, 0);
  group.add(beam);

  group.visible = false;
  return { group, discMat, borderMat, beamMat };
}

// ── 5. MAIN 3D CAMPAIGN MAP CONTROLLER ───────────────────────────────────────
export function mountAtlas3D({ onMode = () => {}, onError = () => {} } = {}) {
  const stageWrapper = document.getElementById('atlas-map-stage');
  const stageEl = document.getElementById('atlas-3d-stage');
  const tooltipEl = document.getElementById('atlas-3d-tooltip');
  const modePill = document.getElementById('atlas-3d-mode-pill');
  const strategicBtn = document.getElementById('atlas-strategic');
  const fullscreenBtn = document.getElementById('atlas-fullscreen');
  const fullscreenHudBtn = document.getElementById('atlas-fullscreen-hud');
  const cinematicHudBtn = document.getElementById('atlas-cinematic-hud');
  const territoryHudBtn = document.getElementById('atlas-territory-hud');
  const territoryBarEl = document.getElementById('atlas-territory-bar');
  const zoomInBtn = document.getElementById('atlas-zoom-in');
  const zoomOutBtn = document.getElementById('atlas-zoom-out');
  const resetBtn = document.getElementById('atlas-reset');

  if (!stageWrapper || !stageEl || stageEl.dataset.atlas3dMounted === '1') return;
  const cleanups = [];
  const lifetime = new AbortController();
  let disposed = false, runtimePaused = true, loop;
  const listen = (target, type, fn, options = {}) => target?.addEventListener(type, fn,
    { ...(typeof options === 'boolean' ? {capture: options} : options), signal: lifetime.signal });
  const releaseResources = () => {
    if (disposed) return;
    disposed = true; loop?.dispose(); lifetime.abort();
    for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch (_) {} }
    stageEl.replaceChildren(); delete stageEl.dataset.atlas3dMounted;
    stageWrapper.classList.remove('is-blending','is-3d-ready');
    document.getElementById('atlas-map-plane').inert = false;
    window.TG?.atlas?.set3DActive(false);
  };
  stageEl.dataset.atlas3dMounted = '1';
  try {

  // Verify WebGL availability gracefully before switching off 2D SVG fallback
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (_err) {
    delete stageEl.dataset.atlas3dMounted;
    throw new Error('WebGL is unavailable. Use the illustrated atlas.');
  }

  stageWrapper.classList.add('has-3d-toggle', 'is-3d-ready');
  window.TG?.atlas?.set3DActive?.(false);

  cleanups.push(() => { renderer.dispose(); try { renderer.forceContextLoss(); } catch (_) {} });
  const reducedMotion = effectiveMotion();
  cleanups.push(() => reducedMotion.dispose());
  const scene = new THREE.Scene();
  cleanups.push(() => {
    const resources = new Set();
    scene.traverse(obj => {
      if (obj.geometry) resources.add(obj.geometry);
      for (const material of (Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [])) {
        resources.add(material);
        Object.values(material).forEach(value => { if (value?.isTexture) resources.add(value); });
        Object.values(material.uniforms || {}).forEach(uniform => { if (uniform.value?.isTexture) resources.add(uniform.value); });
      }
    });
    resources.forEach(resource => resource.dispose());
  });
  scene.background = new THREE.Color(0x16293d);
  scene.fog = new THREE.FogExp2(0x1b3044, 0.0068);

  const width = Math.max(stageEl.clientWidth, 320);
  const height = Math.max(stageEl.clientHeight, 320);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 220);
  camera.position.set(...STRATEGIC_CAM.pos);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  stageEl.appendChild(renderer.domElement);
  const diagnostics=createAtlasDiagnostics(renderer,document.getElementById('atlas'));
  if(diagnostics)cleanups.push(()=>diagnostics.dispose());

  // CSS2DRenderer overlay for crisp Rome II floating settlement nameplates
  const labelScene = new THREE.Scene();
  const labelRenderer = new CSS2DRenderer();
  const labels = createLabelUpdater(labelScene,camera,(scene,camera)=>labelRenderer.render(scene,camera));
  cleanups.push(()=>labelScene.clear());
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'atlas-css2d-layer';
  stageEl.appendChild(labelRenderer.domElement);

  // OrbitControls clamped to campaign-map angles (cannot flip upside down or clip under terrain)
  const controls = new OrbitControls(camera, renderer.domElement);
  cleanups.push(() => controls.dispose());
  controls.target.set(...STRATEGIC_CAM.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.enableZoom = false; // Handled via smooth custom damped wheel zoom below
  controls.minPolarAngle = 0.01;
  controls.maxPolarAngle = Math.PI * 0.405;
  controls.minDistance = 10.5;
  controls.maxDistance = 88.0;
  controls.update();

  // Dramatic Golden Campaign Lighting
  const hemi = new THREE.HemisphereLight(0xeef2f7, 0x2a3b2a, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe9be, 1.85);
  sun.position.set(22, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 6;
  sun.shadow.camera.far = 96;
  const sd = 34;
  sun.shadow.camera.left = -sd;
  sun.shadow.camera.right = sd;
  sun.shadow.camera.top = sd;
  sun.shadow.camera.bottom = -sd;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x8bb2d9, 0.55);
  rim.position.set(-24, 14, -18);
  scene.add(rim);

  // Build World Layers
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  const farmPlots = generateFarmPlots();
  const terrain = buildCampaignTerrain(worldGroup, farmPlots);
  const detailGroup = new THREE.Group();
  worldGroup.add(detailGroup);

  buildCentralBridge(detailGroup);
  const forests = buildForests(detailGroup, farmPlots);
  const farms = build3DFarms(detailGroup, farmPlots);
  const countryside = buildLivingCountryside(detailGroup, terrain.river.wakeTex);
  const territorySystem = buildTerritorySystem(worldGroup);
  const { routeEntries } = buildCampaignRoutes(detailGroup);
  const armies = buildLivingArmies(detailGroup, territorySystem);
  const dragon = buildRoamingDragon(detailGroup, armies);

  // Mount the EXACT 4 3D architectural venue models from venue3d.js onto their campaign plateaus!
  const venueNodes = new Map();
  const rayTargets = [];
  const allAnimatedPennants = [];
  const allAnimatedEmbers = [];

  for (const spec of VENUE_SPECS) {
    const holder = new THREE.Group();
    holder.position.set(spec.x, spec.plateauH, spec.z);

    // Instantiate the EXACT 3D venue model from venue3d.js directly on the natural grassy landscape (no grey disc!)
    const builder = VENUE_BUILDERS[spec.slug];
    let modelRoot = null;
    if (builder) {
      const built = builder();
      if (built.guidesGroup) built.guidesGroup.visible = false;
      // Hide only the rectangular dark plinth slab & 4 outer plinth strips directly under root
      built.root.children.forEach(child => {
        if (child.isMesh) child.visible = false;
      });
      batchStaticMeshes(built.root,[built.guidesGroup,built.roofGroup,...(built.animatedPennants||[]).map(p=>p.mesh),...(built.animatedEmbers||[]).map(p=>p.mesh)]);
      built.root.scale.setScalar(spec.scale);
      built.root.rotation.y = spec.rotY;
      built.root.position.y = 0.02;
      holder.add(built.root);
      modelRoot = built.root;

      if (built.animatedPennants) allAnimatedPennants.push(...built.animatedPennants);
      if (built.animatedEmbers) allAnimatedEmbers.push(...built.animatedEmbers);
    }

    // Invisible smooth pick collider cylinder directly on scene so clicking works in both 3D & Strategic views
    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.plateauR + 0.6, spec.plateauR + 0.6, 3.6, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickMesh.position.set(spec.x, spec.plateauH + 1.4, spec.z);
    pickMesh.userData.venueId = spec.id;
    scene.add(pickMesh);
    rayTargets.push(pickMesh);

    // Also tag visible venue meshes for direct raycasting
    if (modelRoot) {
      modelRoot.traverse(obj => {
        if (obj.isMesh) obj.userData.venueId = spec.id;
      });
    }

    detailGroup.add(holder);

    // Glowing Territory Boundary Ring + Golden Sunbeam (Image 3)
    const territory = createTerritoryRingMesh(spec);
    scene.add(territory.group);

    // Rome II Floating Nameplate via CSS2DRenderer
    const badgeEl = document.createElement('button');
    badgeEl.type = 'button';
    badgeEl.className = 'atlas-3d-badge';
    badgeEl.setAttribute('data-atlas3d-venue', String(spec.id));
    badgeEl.innerHTML = `<span class="atlas-3d-badge-emblem" aria-hidden="true">${spec.emblem}</span><span class="atlas-3d-badge-text"><span class="atlas-3d-badge-name">${spec.name}</span><span class="atlas-3d-badge-meta" data-badge-meta>Loading…</span></span>`;

    const badgeObj = new CSS2DObject(badgeEl);
    badgeObj.position.set(spec.x, spec.plateauH + spec.badgeY, spec.z);
    labelScene.add(badgeObj);

    listen(badgeEl, 'pointerenter', e => {
      setHoveredVenue(spec.id, e.clientX, e.clientY);
    });
    listen(badgeEl, 'pointermove', e => {
      if (hoveredVenueId === spec.id) positionTooltip(e.clientX, e.clientY);
    });
    listen(badgeEl, 'pointerleave', () => {
      if (hoveredVenueId === spec.id) setHoveredVenue(null);
    });
    listen(badgeEl, 'click', e => {
      e.preventDefault();
      e.stopPropagation();
      selectVenueFrom3D(spec.id);
    });

    venueNodes.set(spec.id, { spec, holder, modelRoot, territory, badgeEl, badgeObj });
  }

  // ── 6. STATE, LIVE DATA SYNC, TOOLTIP & CAMERA TWEENING ────────────────────
  const mapPlaneEl = document.getElementById('atlas-map-plane');
  const sky3DColor = new THREE.Color(0x16293d);
  const skyParchmentColor = new THREE.Color(0xf2e5c5);
  let selectedVenueId = null;
  let hoveredVenueId = null;
  let strategicMode = true; // Start on the 2D Illustrated Map first; click pill or scroll in for 3D Campaign Map!
  let manualStrategic = true;
  let strategicBlend = 1; // continuous 0..1 frame-synchronized crossfade
  let blendTween = null;
  let webglPaused = true;
  let activeTween = null;
  let zoomTargetDist = null;
  const zoomOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let pointerDownPos = null;
  let dragMoved = false;

  function easeInOutQuart(p) {
    return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2;
  }

  function applyStrategicBlend(b) {
    labels.invalidate();
    strategicBlend = Math.max(0, Math.min(1, b));
    // Relief factor: 0 = flat parchment, 1 = full 3D hills & extruded venue models!
    const relief = 1 - smoothstep(0.08, 0.88, strategicBlend);
    const modelPop = 0.06 + smoothstep(0.04, 0.84, relief) * 0.94;

    // 3D terrain, skirt, river & models physically rise out of / fold back into the 2D illustrated footprints!
    const reliefY = 0.03 + relief * 0.97;
    terrain.terrainMesh.scale.y = reliefY;
    if (terrain.skirtMesh) terrain.skirtMesh.scale.y = reliefY;
    terrain.river.waterGroup.scale.y = reliefY;
    detailGroup.scale.y = reliefY;
    for (const [, node] of venueNodes.entries()) {
      node.holder.position.y = node.spec.plateauH;
      const xz = 0.88 + modelPop * 0.12;
      node.holder.scale.set(xz, 0.25 + modelPop * 0.75, xz);
      node.badgeObj.position.y = node.spec.plateauH * reliefY + node.spec.badgeY * (0.35 + relief * 0.65);
    }

    // Extended mid-transition overlap so the rising 3D models visually blend RIGHT THROUGH their 2D ink drawings!
    const mapAlpha = smoothstep(0.10, 0.92, strategicBlend);
    const landmark2DAlpha = smoothstep(0.28, 0.86, strategicBlend);
    const stageAlpha = 1 - smoothstep(0.52, 0.98, strategicBlend);
    const labelAlpha = 1 - smoothstep(0.04, 0.30, strategicBlend);

    // Subtle matched perspective tilt & scale on the 2D parchment layer while blending
    const scale2D = 1 + (1 - mapAlpha) * 0.06;
    const tiltDeg = (1 - mapAlpha) * 14 * (strategicBlend > 0.01 && strategicBlend < 0.99 ? 1 : 0);

    stageWrapper.style.setProperty('--atlas-2d-opacity', mapAlpha.toFixed(4));
    stageWrapper.style.setProperty('--atlas-2d-landmarks', landmark2DAlpha.toFixed(4));
    stageWrapper.style.setProperty('--atlas-3d-opacity', stageAlpha.toFixed(4));
    stageWrapper.style.setProperty('--strategic-scale', scale2D.toFixed(4));
    stageWrapper.style.setProperty('--strategic-tilt', `${tiltDeg.toFixed(2)}deg`);
    labelRenderer.domElement.style.opacity = labelAlpha.toFixed(4);
    stageWrapper.classList.toggle('is-blending', strategicBlend > 0.001 && strategicBlend < 0.999);
    stageWrapper.classList.toggle('is-strategic', strategicBlend >= 0.52);
    mapPlaneEl.inert = !strategicMode;
    stageEl.inert = strategicMode;

    // Warm the 3D sky & fog toward parchment cream during crossfade so there is zero dark flash
    scene.background.copy(sky3DColor).lerp(skyParchmentColor, smoothstep(0.12, 0.82, strategicBlend));
    scene.fog.color.copy(scene.background);
    scene.fog.density = 0.0068 * (1 - smoothstep(0.1, 0.85, strategicBlend) * 0.78);
  }
  applyStrategicBlend(1);

  function getVenueStats(venueId) {
    const state = window.TG?.atlas?.getState?.() || { events: [], venues: [] };
    const list = state.events.filter(ev => ev.venue_id === venueId);
    const openTickets = list
      .filter(ev => ev.status === 'upcoming' && ev.start_at > ev.server_time)
      .reduce((sum, ev) => sum + (ev.available || 0), 0);
    return { count: list.length, openTickets };
  }

  function refreshBadges() {
    labels.invalidate();
    for (const [id, node] of venueNodes.entries()) {
      const { count } = getVenueStats(id);
      const meta = node.badgeEl.querySelector('[data-badge-meta]');
      if (meta) meta.textContent = `${count} gathering${count === 1 ? '' : 's'}`;
      node.badgeEl.classList.toggle('is-active', id === selectedVenueId);
      node.territory.group.visible = id === selectedVenueId;
    }
  }

  function positionTooltip(clientX, clientY) {
    if (!tooltipEl || tooltipEl.hidden) return;
    const rect = stageWrapper.getBoundingClientRect();
    let left = clientX - rect.left + 16;
    let top = clientY - rect.top - 14;
    const tw = tooltipEl.offsetWidth || 235;
    const th = tooltipEl.offsetHeight || 96;
    if (left + tw > rect.width - 10) left = clientX - rect.left - tw - 16;
    if (top + th > rect.height - 10) top = rect.height - th - 10;
    if (top < 10) top = 10;
    if (left < 10) left = 10;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function setHoveredVenue(venueId, clientX, clientY) {
    if (strategicMode) venueId = null;
    hoveredVenueId = venueId;
    stageEl.classList.toggle('is-pointer', Boolean(venueId));
    for (const [id, node] of venueNodes.entries()) {
      node.badgeEl.classList.toggle('is-hovered', id === venueId);
    }
    if (!tooltipEl) return;
    if (!venueId) {
      tooltipEl.hidden = true;
      return;
    }
    const node = venueNodes.get(venueId);
    if (!node) return;
    const { spec } = node;
    const { count, openTickets } = getVenueStats(venueId);
    tooltipEl.setAttribute('data-atlas3d-venue', String(venueId));
    tooltipEl.innerHTML = `
      <div class="atlas-3d-tooltip-head"><span>${spec.emblem} ${spec.name}</span><span>Realm</span></div>
      <div class="atlas-3d-tooltip-body">
        <span class="atlas-3d-tooltip-region">Region: ${spec.region}</span>
        <span class="atlas-3d-tooltip-stats">${count} gathering${count === 1 ? '' : 's'} · ${openTickets.toLocaleString()} tickets open</span>
        <span class="atlas-3d-tooltip-cta">${selectedVenueId === venueId ? 'Focused · Click again to unfocus' : 'Left-click to zoom & inspect events'}</span>
      </div>`;
    tooltipEl.hidden = false;
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      positionTooltip(clientX, clientY);
    }
  }

  function tweenCamera(targetPos, targetLook, duration = 820, easeMode = 'out') {
    zoomTargetDist = null;
    if (reducedMotion.matches) {
      camera.position.set(...targetPos);
      controls.target.set(...targetLook);
      controls.update();
      activeTween = null;
      return;
    }
    activeTween = {
      startTime: performance.now(),
      duration,
      easeMode,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...targetPos),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...targetLook),
    };
  }

  // Silky frame-synchronized 3D ⇄ 2D Illustrated Strategic Map transition
  function setStrategicView(enabled, { manual = false, animateCam = true } = {}) {
    const next = Boolean(enabled);
    strategicMode = next;

    if (manual) manualStrategic = next;
    setHoveredVenue(null);

    window.TG?.atlas?.set3DActive?.(!strategicMode);

    if (reducedMotion.matches) {
      blendTween = null;
      applyStrategicBlend(strategicMode ? 1 : 0);
      webglPaused = strategicMode;
      if (!strategicMode) {
        handleResize();
        refreshBadges();
        if (animateCam) {
          if (selectedVenueId && venueNodes.has(selectedVenueId)) {
            const s = venueNodes.get(selectedVenueId).spec;
            tweenCamera([s.x + s.camOffset[0], s.plateauH + s.camOffset[1], s.z + s.camOffset[2]], [s.x, s.plateauH + 0.5, s.z], 0);
          } else {
            tweenCamera(OVERVIEW_CAM.pos, OVERVIEW_CAM.target, 0);
          }
        }
      }
      return;
    }

    const dur = strategicMode ? 1120 : 1180;
    webglPaused = false;
    blendTween = {
      startTime: performance.now(),
      duration: dur,
      from: strategicBlend,
      to: strategicMode ? 1 : 0,
    };

    if (strategicMode) {
      if (animateCam) {
        tweenCamera(STRATEGIC_CAM.pos, STRATEGIC_CAM.target, dur, 'inout');
      }
    } else {
      handleResize();
      refreshBadges();
      // Start smoothly from high top-down strategic position if returning from full 2D
      if (strategicBlend > 0.92) {
        camera.position.set(...STRATEGIC_CAM.pos);
        controls.target.set(...STRATEGIC_CAM.target);
        controls.update();
      }
      if (animateCam) {
        if (selectedVenueId && venueNodes.has(selectedVenueId)) {
          const s = venueNodes.get(selectedVenueId).spec;
          tweenCamera([s.x + s.camOffset[0], s.plateauH + s.camOffset[1], s.z + s.camOffset[2]], [s.x, s.plateauH + 0.5, s.z], dur, 'inout');
        } else {
          tweenCamera(OVERVIEW_CAM.pos, OVERVIEW_CAM.target, dur, 'inout');
        }
      }
    }
  }

  function focusVenueCamera(venueId) {
    if (strategicMode) return;
    if (venueId && venueNodes.has(venueId)) {
      const s = venueNodes.get(venueId).spec;
      tweenCamera(
        [s.x + s.camOffset[0], s.plateauH + s.camOffset[1], s.z + s.camOffset[2]],
        [s.x, s.plateauH + 0.5, s.z],
        820
      );
    } else {
      tweenCamera(OVERVIEW_CAM.pos, OVERVIEW_CAM.target, 740);
    }
  }

  function selectVenueFrom3D(venueId) {
    // Clicking the already-focused venue again unfocuses it and smoothly returns to the full realm overview
    const nextId = selectedVenueId === venueId ? null : venueId;
    selectedVenueId = nextId;
    refreshBadges();
    focusVenueCamera(nextId);
    setHoveredVenue(null);
    window.TG?.atlas?.selectVenue?.(nextId, { source: '3d', focus: false });
  }

  // Subscribe to Herald's Desk / URL / live polling state changes
  const atlasApi = window.TG?.atlas;
  if (atlasApi) {
    const init = atlasApi.getState();
    selectedVenueId = init.selected || null;
    refreshBadges();
    if (selectedVenueId) focusVenueCamera(selectedVenueId);

    const unsubscribe = atlasApi.onChange(({ selected, reason }) => {
      const changed = selected !== selectedVenueId;
      selectedVenueId = selected || null;
      refreshBadges();
      if (reason !== '3d' && reason !== 'poll' && changed && !strategicMode) {
        focusVenueCamera(selectedVenueId);
      }
    });
    cleanups.push(unsubscribe);
  }

  // ── 7. POINTER RAYCASTING, SMOOTH SCROLL ZOOM & TOOLBAR CONTROLS ───────────
  function pickVenueAt(clientX, clientY) {
    if (strategicMode) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(rayTargets, false);
    return hits.length ? hits[0].object.userData.venueId : null;
  }

  listen(renderer.domElement, 'pointerdown', e => {
    dragMoved = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    activeTween = null;
    zoomTargetDist = null;
    stageEl.classList.add('is-dragging');
  });

  listen(renderer.domElement, 'pointermove', e => {
    if (pointerDownPos) {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) {
        dragMoved = true;
      }
      setHoveredVenue(null);
      return;
    }
    const hitId = pickVenueAt(e.clientX, e.clientY);
    if (hitId !== hoveredVenueId) {
      setHoveredVenue(hitId, e.clientX, e.clientY);
    } else if (hitId) {
      positionTooltip(e.clientX, e.clientY);
    }
  });

  listen(renderer.domElement, 'pointerleave', () => {
    pointerDownPos = null;
    stageEl.classList.remove('is-dragging');
    setHoveredVenue(null);
  });

  listen(window, 'pointerup', () => {
    pointerDownPos = null;
    stageEl.classList.remove('is-dragging');
  });

  listen(renderer.domElement, 'click', e => {
    if (dragMoved || strategicMode) return;
    const hitId = pickVenueAt(e.clientX, e.clientY);
    if (hitId) {
      selectVenueFrom3D(hitId);
    }
  });

  // Capture ALL mousewheel scrolling anywhere inside the map frame (3D canvas, floating badges,
  // HUD pill, or 2D Strategic Atlas) so the page NEVER scrolls while hovering over the map!
  listen(stageWrapper, 'wheel', e => {
    if (strategicMode) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 140 : e.deltaY;
    if (Math.abs(delta) < 1) return;

    // While transitioning into/out of 2D, consume scroll smoothly without jarring the camera
    if (blendTween) {
      if (delta < 0 && strategicMode) {
        manualStrategic = false;
        setStrategicView(false, { manual: false, animateCam: true });
      }
      return;
    }

    activeTween = null;
    const clamped = Math.max(-140, Math.min(140, delta));
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    const factor = Math.exp(clamped * 0.00055);
    zoomTargetDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, currentDist * factor));
  }, { passive: false });

  // Wire +, −, Reset view, Strategic View, and in-map 3D/2D pill toggle
  listen(zoomInBtn, 'click', () => {
    if (strategicMode) return;
    activeTween = null;
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    zoomTargetDist = Math.max(controls.minDistance, currentDist * 0.78);
  });

  listen(zoomOutBtn, 'click', () => {
    if (strategicMode) return;
    activeTween = null;
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    zoomTargetDist = Math.min(controls.maxDistance, currentDist * 1.26);
  });

  listen(resetBtn, 'click', () => {
    if (strategicMode) {
      // Reset 2D zoom & selection, staying cleanly synced
      selectedVenueId = null;
      refreshBadges();
      window.TG?.atlas?.selectVenue?.(null, { source: '3d', focus: false });
      return;
    }
    manualStrategic = false;
    selectedVenueId = null;
    refreshBadges();
    window.TG?.atlas?.selectVenue?.(null, { source: '3d', focus: false });
    tweenCamera(OVERVIEW_CAM.pos, OVERVIEW_CAM.target, 760);
  });

  // Cinematic Fullscreen Mode (Native Fullscreen API + seamless CSS fallback + Hide UI toggle!)
  let cssFullscreen = false;
  let cinematicClean = false;
  let fullscreenFocus = null, previousOverflow = null;
  const restoreFullscreen = () => {
    if (disposed && document.fullscreenElement === stageWrapper) document.exitFullscreen?.().catch(() => {});
    if (previousOverflow !== null) { document.body.style.overflow = previousOverflow; previousOverflow = null; }
    stageWrapper.classList.remove('is-fullscreen','is-css-fullscreen','is-cinematic-clean');
    fullscreenFocus?.focus({preventScroll:true}); fullscreenFocus = null;
  };
  cleanups.push(restoreFullscreen);

  const isFullscreenActive = () =>
    Boolean(
      document.fullscreenElement === stageWrapper ||
      document.webkitFullscreenElement === stageWrapper ||
      cssFullscreen
    );

  const setCinematicClean = enabled => {
    cinematicClean = Boolean(enabled) && isFullscreenActive();
    stageWrapper.classList.toggle('is-cinematic-clean', cinematicClean);
    if (cinematicHudBtn) {
      cinematicHudBtn.setAttribute('aria-pressed', String(cinematicClean));
      cinematicHudBtn.textContent = cinematicClean ? 'Show UI' : 'Hide UI';
    }
  };

  const syncFullscreenState = () => {
    if (disposed) return;
    const active = isFullscreenActive();
    stageWrapper.classList.toggle('is-fullscreen', active);
    stageWrapper.classList.toggle('is-css-fullscreen', cssFullscreen);
    if (fullscreenBtn) {
      fullscreenBtn.setAttribute('aria-pressed', String(active));
      fullscreenBtn.textContent = active ? '✕ Exit Fullscreen' : '⛶ Fullscreen';
    }
    if (fullscreenHudBtn) {
      fullscreenHudBtn.setAttribute('aria-pressed', String(active));
      fullscreenHudBtn.textContent = active ? '✕ Exit Fullscreen' : '⛶ Fullscreen';
    }
    if (cinematicHudBtn) {
      cinematicHudBtn.hidden = !active;
    }
    if (!active && cinematicClean) {
      setCinematicClean(false);
    }
    // Unlock closer eye-level cinematic zoom inside Fullscreen!
    controls.minDistance = active ? 5.2 : 10.5;
    if (active) {
      isVisible = true;
      if (previousOverflow === null) { fullscreenFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; stageWrapper.focus({preventScroll:true}); }
    } else restoreFullscreen();
    loop?.resume();
    handleResize();
    requestAnimationFrame(handleResize);
  };

  const toggleFullscreen = async () => {
    if (disposed) return;
    if (isFullscreenActive()) {
      if (document.fullscreenElement === stageWrapper && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_e) { cssFullscreen = false; }
      } else if (document.webkitFullscreenElement === stageWrapper && document.webkitExitFullscreen) {
        try { document.webkitExitFullscreen(); } catch (_e) { cssFullscreen = false; }
      } else {
        cssFullscreen = false;
      }
      syncFullscreenState();
      return;
    }

    const req = stageWrapper.requestFullscreen || stageWrapper.webkitRequestFullscreen;
    if (req) {
      try {
        await req.call(stageWrapper);
        syncFullscreenState();
        return;
      } catch (_err) {
        // Fall back to viewport-filling CSS fullscreen if browser policy blocks native fullscreen
      }
    }
    cssFullscreen = true;
    syncFullscreenState();
  };

  listen(fullscreenBtn, 'click', e => {
    e.preventDefault();
    toggleFullscreen();
  });
  const terrPctEls = [0, 1, 2, 3, 4, 5].map(i => territoryBarEl?.querySelector(`[data-terr-pct="${i}"]`) || null);
  const terrBarEls = [0, 1, 2, 3, 4, 5].map(i => territoryBarEl?.querySelector(`[data-terr-bar="${i}"]`) || null);
  const terrChip4 = territoryBarEl?.querySelector('[data-terr-chip="4"]') || null;
  const terrChip5 = territoryBarEl?.querySelector('[data-terr-chip="5"]') || null;
  const invasionHudBtn = document.getElementById('atlas-invasion-hud');
  const invasionBannerEl = document.getElementById('atlas-invasion-banner');
  const invasionTitleEl = document.getElementById('atlas-invasion-title');
  const invasionSubEl = document.getElementById('atlas-invasion-sub');
  const invasionBarEl = document.getElementById('atlas-invasion-bar');
  const invasionSkipBtn = document.getElementById('atlas-invasion-skip');
  const normalFogColor = scene.fog ? scene.fog.color.clone() : new THREE.Color(0x1b2b3d);
  const dreadFogColor = new THREE.Color(0x171426);
  const bossFogColor = new THREE.Color(0x2b1012);
  const normalSunInt = sun.intensity;
  let terrHudAccum = 0;
  let invHudAccum = 0;
  let corrSyncAccum = 0;
  let lastCorrVer = -1;

  const fmtMinSec = secs => {
    const total = Math.max(0, Math.ceil(secs));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  window.TG_TRIGGER_UNDEAD = () => armies?.triggerInvasion?.();
  window.TG_SKIP_WAVE = () => armies?.skipWave?.();

  const updateTerritoryHud = () => {
    if (!territorySystem.isEnabled() || !territoryBarEl) return;
    const shares = territorySystem.getShares();
    const rounded = shares.map(v => Math.round(v));
    const diff = 100 - rounded.reduce((a, b) => a + b, 0);
    if (diff !== 0) {
      let maxIdx = 0;
      for (let i = 1; i < shares.length; i++) if (shares[i] > shares[maxIdx]) maxIdx = i;
      rounded[maxIdx] += diff;
    }
    for (let i = 0; i < 6; i++) {
      if (terrPctEls[i]) terrPctEls[i].textContent = `${Math.max(0, rounded[i] || 0)}%`;
      if (terrBarEls[i]) terrBarEls[i].style.width = `${Math.max(0, shares[i] || 0).toFixed(1)}%`;
    }
    if (terrChip4) terrChip4.hidden = (shares[4] || 0) < 0.5;
    if (terrChip5) terrChip5.hidden = (shares[5] || 0) < 0.5;
  };

  const updateInvasionHud = dt => {
    const ev = armies?.getInvasionState?.();
    if (!ev) return;
    // Smooth eerie atmosphere shift (necrotic twilight during prep/Waves 1-2/Reign -> fiery Khorne crimson during Wave 3 Skarbrand!)
    const isBoss = ev.phase === 'active' && ev.wave >= 3;
    const dreadTarget = (ev.phase === 'warning' || ev.phase === 'active' || ev.phase === 'reign') ? 1 : 0;
    if (scene.fog) {
      scene.fog.color.lerp(isBoss ? bossFogColor : dreadTarget ? dreadFogColor : normalFogColor, Math.min(1, dt * 1.4));
    }
    sun.intensity += ((isBoss ? normalSunInt * 0.72 : dreadTarget ? normalSunInt * 0.80 : normalSunInt) - sun.intensity) * Math.min(1, dt * 1.4);

    invHudAccum += dt;
    if (invHudAccum < 0.25 || !invasionBannerEl) return;
    invHudAccum = 0;

    // Sync the 4 Event Place floating name cards: turn them cursed Undead purple-green whenever Undead claim that Event Place!
    for (const [vid, node] of venueNodes.entries()) {
      const vOwn = territorySystem.getVenueOwner(vid - 1);
      node.badgeEl.classList.toggle('is-undead-claimed', vOwn === 4);
    }

    if (ev.phase === 'idle') {
      invasionBannerEl.hidden = true;
      invasionBannerEl.classList.remove('is-aftermath', 'is-boss-wave', 'is-heroes-phase');
      if (invasionSkipBtn) invasionSkipBtn.hidden = true;
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'false');
        invasionHudBtn.textContent = '☠ Undead Invasion';
      }
    } else if (ev.phase === 'warning') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-aftermath', 'is-boss-wave', 'is-heroes-phase');
      const clockStr = fmtMinSec(ev.timer);
      if (invasionTitleEl) invasionTitleEl.textContent = `PEACE TREATY · UNDEAD ARRIVE IN ${clockStr}`;
      if (invasionSubEl) invasionSubEl.textContent = 'All 4 houses united — building archer watchtowers & barricades along borders';
      if (invasionBarEl) invasionBarEl.style.width = `${Math.min(100, ((ev.warningDur - ev.timer) / ev.warningDur) * 100).toFixed(1)}%`;
      if (invasionSkipBtn) {
        invasionSkipBtn.hidden = false;
        invasionSkipBtn.textContent = 'Start W1 ⏭';
      }
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = `☠ Prep ${clockStr} · Skip`;
      }
    } else if (ev.phase === 'active') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-aftermath', 'is-heroes-phase');
      invasionBannerEl.classList.toggle('is-boss-wave', isBoss);
      const pct = Math.min(100, ev.undeadShare || 0);
      const waveLeft = fmtMinSec(ev.waveRemaining || 0);
      const curWaveDur = ev.wave === 1 ? ev.wave1Dur : ev.wave === 2 ? ev.wave2Dur : ev.wave3Dur;
      const waveProg = ev.wave >= 3 && ((ev.waveRemaining || 0) <= 0.1 || (ev.livingAliveCount || 0) === 0)
        ? Math.min(100, (pct / 95.0) * 100)
        : Math.min(100, Math.max(0, ((curWaveDur - (ev.waveRemaining || 0)) / Math.max(1, curWaveDur)) * 100));
      if (ev.wave === 1) {
        if (invasionTitleEl) invasionTitleEl.textContent = `WAVE 1 / 3 · UNDEAD INVASION · ${waveLeft}`;
        if (invasionSubEl) invasionSubEl.textContent = `12 undead hordes (504 troops) attacking all borders · Undead hold ${pct.toFixed(0)}% / 95% (respawns ON)`;
        if (invasionSkipBtn) { invasionSkipBtn.hidden = false; invasionSkipBtn.textContent = 'Skip to W2 ⏭'; }
      } else if (ev.wave === 2) {
        if (invasionTitleEl) invasionTitleEl.textContent = `WAVE 2 / 3 · FULL RETREAT TO THE BRIDGE! · ${waveLeft}`;
        if (invasionSubEl) invasionSubEl.textContent = `All 4 houses & Kings falling back to defend the center bridge · 20 hordes / 840 undead (${pct.toFixed(0)}% / 95%)`;
        if (invasionSkipBtn) { invasionSkipBtn.hidden = false; invasionSkipBtn.textContent = 'Skip to W3 ⏭'; }
      } else if ((ev.livingAliveCount || 0) === 0) {
        if (invasionTitleEl) invasionTitleEl.textContent = `ALL HOUSES FALLEN · UNDEAD CLAIMING REALM · ${pct.toFixed(0)}% / 95%`;
        if (invasionSubEl) invasionSubEl.textContent = 'Only Undead & the Dragon remain — at 95%, 4 Unkillable Heroes spawn in the middle!';
        if (invasionSkipBtn) { invasionSkipBtn.hidden = false; invasionSkipBtn.textContent = 'Summon Heroes ⏭'; }
      } else if ((ev.waveRemaining || 0) > 0.1) {
        if (invasionTitleEl) invasionTitleEl.textContent = `WAVE 3 / 3 · SKARBRAND FINAL STAND · ${waveLeft}`;
        if (invasionSubEl) invasionSubEl.textContent = `NO RESPAWNS · 4 KINGS MORTAL! · Undead hold ${pct.toFixed(0)}% / 95%`;
        if (invasionSkipBtn) { invasionSkipBtn.hidden = false; invasionSkipBtn.textContent = 'Skip W3 ⏭'; }
      } else {
        if (invasionTitleEl) invasionTitleEl.textContent = `WAVE 3 / 3 · UNDEAD CONQUERING REALM · ${pct.toFixed(0)}% / 95%`;
        if (invasionSubEl) invasionSubEl.textContent = 'At 95% control, 4 Unkillable Radiant Heroes will spawn at the Central Bridge!';
        if (invasionSkipBtn) { invasionSkipBtn.hidden = false; invasionSkipBtn.textContent = 'Summon Heroes ⏭'; }
      }
      if (invasionBarEl) invasionBarEl.style.width = `${waveProg.toFixed(1)}%`;
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = ev.wave >= 3 && ((ev.waveRemaining || 0) <= 0.1 || (ev.livingAliveCount || 0) === 0)
          ? `☠ W3 · ${pct.toFixed(0)}% ⏭`
          : `☠ W${ev.wave} · ${waveLeft} ⏭`;
      }
    } else if (ev.phase === 'reign') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-aftermath', 'is-boss-wave', 'is-heroes-phase');
      const pct = Math.min(100, ev.undeadShare || 0);
      const reignLeft = fmtMinSec(ev.timer || 0);
      const reignProg = Math.min(100, Math.max(0, ((ev.reignDur - (ev.timer || 0)) / Math.max(1, ev.reignDur)) * 100));
      if (invasionTitleEl) invasionTitleEl.textContent = `☠ UNDEAD REIGN · 4 HEROES ARRIVE IN ${reignLeft}`;
      if (invasionSubEl) invasionSubEl.textContent = `Corruption spreads across the entire realm (${pct.toFixed(0)}% blighted) — Heroes awakening!`;
      if (invasionBarEl) invasionBarEl.style.width = `${reignProg.toFixed(1)}%`;
      if (invasionSkipBtn) {
        invasionSkipBtn.hidden = false;
        invasionSkipBtn.textContent = 'Summon Heroes ⏭';
      }
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = `☠ Reign ${reignLeft} ⏭`;
      }
    } else if (ev.phase === 'heroes') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-aftermath', 'is-boss-wave');
      invasionBannerEl.classList.add('is-heroes-phase');
      const pct = Math.min(100, ev.undeadShare || 0);
      const uLeft = ev.undeadAliveCount || 0;
      const bossNote = ev.bossAlive ? ' + SKARBRAND' : '';
      if (invasionTitleEl) invasionTitleEl.textContent = `⚔ 4 UNKILLABLE HEROES · ${uLeft} UNDEAD LEFT${bossNote}`;
      if (invasionSubEl) invasionSubEl.textContent = `Slowly killing all Undead & reclaiming every territory · ${pct.toFixed(1)}% blight left`;
      if (invasionBarEl) invasionBarEl.style.width = `${Math.max(4, Math.min(100, 100 - pct)).toFixed(1)}%`;
      if (invasionSkipBtn) {
        invasionSkipBtn.hidden = false;
        invasionSkipBtn.textContent = 'Finish ⏭';
      }
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = `⚔ Heroes · ${uLeft} left`;
      }
    } else if (ev.phase === 'rebuild') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-boss-wave', 'is-heroes-phase');
      invasionBannerEl.classList.add('is-aftermath');
      const rebLeft = fmtMinSec(ev.timer || 0);
      const rebProg = Math.min(100, Math.max(0, ((ev.rebuildDur - (ev.timer || 0)) / Math.max(1, ev.rebuildDur)) * 100));
      const liv = ev.livingAliveCount || 0;
      if (invasionTitleEl) invasionTitleEl.textContent = `✨ REALM REBUILDING · HUMANS RETURNING · ${rebLeft}`;
      if (invasionSubEl) invasionSubEl.textContent = `Houses repopulating little by little (${liv} living restored) — 1-min Peace Era next`;
      if (invasionBarEl) invasionBarEl.style.width = `${rebProg.toFixed(1)}%`;
      if (invasionSkipBtn) {
        invasionSkipBtn.hidden = false;
        invasionSkipBtn.textContent = 'Skip to Peace ⏭';
      }
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = `✨ Rebuild ${rebLeft} ⏭`;
      }
    } else if (ev.phase === 'peace_era') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-boss-wave', 'is-heroes-phase');
      invasionBannerEl.classList.add('is-aftermath');
      const pLeft = fmtMinSec(ev.timer || 0);
      const pProg = Math.min(100, Math.max(0, ((ev.peaceEraDur - (ev.timer || 0)) / Math.max(1, ev.peaceEraDur)) * 100));
      if (invasionTitleEl) invasionTitleEl.textContent = `🕊 PEACE ERA · WAR CONTINUES IN ${pLeft}`;
      if (invasionSubEl) invasionSubEl.textContent = 'All 4 houses fully restored — 1 minute of peace before hostilities resume!';
      if (invasionBarEl) invasionBarEl.style.width = `${pProg.toFixed(1)}%`;
      if (invasionSkipBtn) {
        invasionSkipBtn.hidden = false;
        invasionSkipBtn.textContent = 'Resume War ⏭';
      }
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'true');
        invasionHudBtn.textContent = `🕊 Peace ${pLeft} ⏭`;
      }
    } else if (ev.phase === 'aftermath') {
      invasionBannerEl.hidden = false;
      invasionBannerEl.classList.remove('is-boss-wave', 'is-heroes-phase');
      invasionBannerEl.classList.add('is-aftermath');
      if (invasionSkipBtn) invasionSkipBtn.hidden = true;
      if (invasionTitleEl) invasionTitleEl.textContent = '⚔ THE WAR CONTINUES · PEACE ERA ENDED';
      if (invasionSubEl) invasionSubEl.textContent = 'All 4 houses clash once more for dominion of the realm!';
      if (invasionBarEl) invasionBarEl.style.width = `${Math.max(0, (ev.timer / ev.aftermathDur) * 100).toFixed(1)}%`;
      if (invasionHudBtn) {
        invasionHudBtn.disabled = false;
        invasionHudBtn.setAttribute('aria-pressed', 'false');
        invasionHudBtn.textContent = '☠ Undead Invasion';
      }
    }
  };

  const triggerManualInvasion = () => {
    const ev = armies?.getInvasionState?.();
    if (ev && (ev.phase === 'warning' || ev.phase === 'active' || ev.phase === 'reign' || ev.phase === 'heroes' || ev.phase === 'rebuild' || ev.phase === 'peace_era')) {
      armies?.skipWave?.();
    } else {
      armies?.triggerInvasion?.();
    }
    invHudAccum = 1;
    updateInvasionHud(0.016);
  };
  const triggerSkipWave = () => {
    armies?.skipWave?.();
    invHudAccum = 1;
    updateInvasionHud(0.016);
  };

  const setTerritoryMode = on => {
    const active = Boolean(on);
    territorySystem.setEnabled(active);
    if (territoryHudBtn) {
      territoryHudBtn.setAttribute('aria-pressed', String(active));
      territoryHudBtn.textContent = active ? 'Territory: On' : 'Territory: Off';
    }
    if (territoryBarEl) {
      territoryBarEl.hidden = !active;
    }
    if (active) updateTerritoryHud();
  };

  listen(invasionHudBtn, 'click', e => {
    e.preventDefault();
    e.stopPropagation();
    triggerManualInvasion();
  });
  listen(invasionSkipBtn, 'click', e => {
    e.preventDefault();
    e.stopPropagation();
    triggerSkipWave();
  });
  listen(territoryHudBtn, 'click', e => {
    e.preventDefault();
    e.stopPropagation();
    setTerritoryMode(!territorySystem.isEnabled());
  });
  listen(fullscreenHudBtn, 'click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen();
  });
  listen(cinematicHudBtn, 'click', e => {
    e.preventDefault();
    e.stopPropagation();
    setCinematicClean(!cinematicClean);
  });
  // Fullscreen 3D Camera WASD Panning + Q/E Turning (camera-relative RTS flight, Hold Shift to boost!)
  const moveKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
  const clearMoveKeys = () => {
    moveKeys.w = moveKeys.a = moveKeys.s = moveKeys.d = moveKeys.q = moveKeys.e = moveKeys.shift = false;
  };
  const camPanFwd = new THREE.Vector3();
  const camPanRight = new THREE.Vector3();
  const camPanDelta = new THREE.Vector3();
  const camRotOffset = new THREE.Vector3();
  const camUpAxis = new THREE.Vector3(0, 1, 0);

  listen(document, 'fullscreenchange', () => {
    if (!isFullscreenActive()) clearMoveKeys();
    syncFullscreenState();
  });
  listen(document, 'webkitfullscreenchange', () => {
    if (!isFullscreenActive()) clearMoveKeys();
    syncFullscreenState();
  });
  listen(window, 'blur', clearMoveKeys);
  listen(window, 'keydown', e => {
    if (cssFullscreen && e.key === 'Tab') {
      const focusable = [...stageWrapper.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === stageWrapper)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === stageWrapper)) { e.preventDefault(); first?.focus(); }
      return;
    }
    const k = campaignShortcut(e, { focused: stageWrapper.contains(document.activeElement), fullscreen: isFullscreenActive(), strategic: strategicMode });
    if (!k) return;
    if (k === 'escape' && isFullscreenActive()) { e.preventDefault(); toggleFullscreen(); return; }
    if (k in moveKeys) { moveKeys[k] = true; e.preventDefault(); return; }
    if (k === 'h') setCinematicClean(!cinematicClean);
    else if (k === 't') setTerritoryMode(!territorySystem.isEnabled());
    else if (k === 'u') triggerManualInvasion();
    else if (k === 'n') triggerSkipWave();
  });
  listen(window, 'keyup', e => {
    const k = (e.key || '').toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'q' || k === 'e' || k === 'shift') {
      moveKeys[k] = false;
    }
  });

  // Responsive ResizeObserver
  const handleResize = () => {
    labels.invalidate();
    const w = Math.max(stageEl.clientWidth, 260);
    const h = Math.max(stageEl.clientHeight, 260);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
  };
  const resizeObs = 'ResizeObserver' in window ? new ResizeObserver(handleResize) : null;
  resizeObs?.observe(stageEl);
  listen(window, 'resize', handleResize);

  // Pause rendering when scrolled off-screen to save GPU (always stays active in fullscreen!)
  let isVisible = true;
  const visObs = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      isVisible = entries[0].isIntersecting || isFullscreenActive();
      if (isVisible) loop?.resume(); else loop?.pause();
    }, { threshold: 0.02 })
    : null;
  visObs?.observe(stageEl);

  let contextLost = false;
  cleanups.push(() => { resizeObs?.disconnect(); visObs?.disconnect(); });
  listen(renderer.domElement, 'webglcontextlost', e => {
    e.preventDefault();
    if (!disposed) { contextLost = true; onError(new Error('The 3D context was lost. You can try 3D again.')); }
  });
  // ── 8. ANIMATION LOOP ──────────────────────────────────────────────────────
  let simulationTime = 0;
  let shadowFrameTick = 0;

  function animate(dt) {
    diagnostics?.begin();
    if (diagnostics?.scenario === 'orbit' || diagnostics?.scenario === 'fullscreen') {
      const a=diagnostics.elapsed*.25,distance=38+Math.sin(diagnostics.elapsed*.18)*7;
      camera.position.set(Math.sin(a)*distance,27,Math.cos(a)*distance);controls.target.set(0,0,0);activeTween=null;zoomTargetDist=null;
    }
    if (!reducedMotion.matches && !strategicMode) simulationTime += dt;
    const t = simulationTime;
    // 1. Camera Tween (quartic ease-in-out for 3D↔2D swoops, cubic ease-out for venue focus)
    if (activeTween) {
      activeTween.elapsed = (activeTween.elapsed || 0) + dt * 1000;
      const p = Math.min(1, activeTween.elapsed / activeTween.duration);
      const ease = activeTween.easeMode === 'inout' ? easeInOutQuart(p) : 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(activeTween.fromPos, activeTween.toPos, ease);
      controls.target.lerpVectors(activeTween.fromTarget, activeTween.toTarget, ease);
      if (p >= 1) activeTween = null;
    } else if (zoomTargetDist !== null) {
      zoomOffset.copy(camera.position).sub(controls.target);
      const cur = zoomOffset.length();
      const next = reducedMotion.matches ? zoomTargetDist : cur + (zoomTargetDist - cur) * Math.min(1, dt * 11);
      if (Math.abs(zoomTargetDist - next) < 0.02) {
        zoomOffset.setLength(zoomTargetDist);
        zoomTargetDist = null;
      } else {
        zoomOffset.setLength(next);
      }
      camera.position.copy(controls.target).add(zoomOffset);
    }

    // 1b. Continuous 60fps 3D ⇄ 2D Illustrated Strategic Map Crossfade
    if (blendTween) {
      blendTween.elapsed = (blendTween.elapsed || 0) + dt * 1000;
      const bp = Math.min(1, blendTween.elapsed / blendTween.duration);
      const be = easeInOutQuart(bp);
      applyStrategicBlend(blendTween.from + (blendTween.to - blendTween.from) * be);
      if (bp >= 1) {
        blendTween = null;
        if (strategicMode && strategicBlend >= 0.999) {
          webglPaused = true;
          return;
        }
      }
    }

    // 1c. Smooth Fullscreen Q/E Camera Turning + WASD Panning (RTS flight, Shift to boost!)
    if (isFullscreenActive() && !strategicMode) {
      const turnIn = (moveKeys.q ? 1 : 0) - (moveKeys.e ? 1 : 0);
      if (turnIn !== 0) {
        activeTween = null;
        const turnSpeed = (moveKeys.shift ? 2.15 : 1.35) * dt;
        camRotOffset.subVectors(camera.position, controls.target);
        camRotOffset.applyAxisAngle(camUpAxis, turnIn * turnSpeed);
        camera.position.copy(controls.target).add(camRotOffset);
      }
      if (moveKeys.w || moveKeys.a || moveKeys.s || moveKeys.d) {
        const fwdIn = (moveKeys.w ? 1 : 0) - (moveKeys.s ? 1 : 0);
        const rightIn = (moveKeys.d ? 1 : 0) - (moveKeys.a ? 1 : 0);
        if (fwdIn !== 0 || rightIn !== 0) {
          activeTween = null;
          camPanFwd.subVectors(controls.target, camera.position);
          camPanFwd.y = 0;
          if (camPanFwd.lengthSq() < 1e-4) camPanFwd.set(0, 0, -1);
          else camPanFwd.normalize();
          camPanRight.set(-camPanFwd.z, 0, camPanFwd.x);

          camPanDelta.set(0, 0, 0);
          camPanDelta.addScaledVector(camPanFwd, fwdIn);
          camPanDelta.addScaledVector(camPanRight, rightIn);
          if (camPanDelta.lengthSq() > 1e-4) camPanDelta.normalize();

          const curDist = camera.position.distanceTo(controls.target);
          const panSpeed = Math.max(9.5, Math.min(34.0, curDist * 0.48)) * (moveKeys.shift ? 1.65 : 1.0);
          camPanDelta.multiplyScalar(panSpeed * dt);

          const prevX = controls.target.x;
          const prevZ = controls.target.z;
          const nextX = Math.max(-24, Math.min(24, prevX + camPanDelta.x));
          const nextZ = Math.max(-18, Math.min(18, prevZ + camPanDelta.z));
          const appliedX = nextX - prevX;
          const appliedZ = nextZ - prevZ;
          controls.target.x = nextX;
          controls.target.z = nextZ;
          camera.position.x += appliedX;
          camera.position.z += appliedZ;
        }
      }
    }

    controls.update();

    // Clamp pan target inside campaign borders (wider cinematic pan range in Fullscreen!)
    const panX = isFullscreenActive() ? 24 : 18;
    const panZ = isFullscreenActive() ? 18 : 14;
    controls.target.x = Math.max(-panX, Math.min(panX, controls.target.x));
    controls.target.z = Math.max(-panZ, Math.min(panZ, controls.target.z));
    controls.target.y = Math.max(0, Math.min(2.2, controls.target.y));

    // Mode changes are explicit: zooming never activates or hides the campaign.
    // 2. Animate Fluttering Venue Pennants, Flickering Embers & Territory Ring Pulse
    if (!reducedMotion.matches && !strategicMode) {
      for (const p of allAnimatedPennants) {
        p.mesh.rotation.y = p.baseRot + Math.sin(t * 2.2 + p.phase) * 0.16;
      }
      for (const e of allAnimatedEmbers) {
        const pulse = 0.9 + Math.sin(t * 6.5 + e.phase) * 0.14;
        e.mesh.scale.set(0.85 * pulse, 1.3 * pulse, 0.85 * pulse);
      }

      // Subtle breathing pulse on active gilded venue ring & centered soft spotlight
      if (selectedVenueId && venueNodes.has(selectedVenueId)) {
        const { territory } = venueNodes.get(selectedVenueId);
        territory.discMat.opacity = 0.085 + Math.sin(t * 2.2) * 0.025;
        territory.borderMat.opacity = 0.62 + Math.sin(t * 2.2) * 0.10;
        territory.beamMat.opacity = 0.13 + Math.sin(t * 1.8) * 0.03;
      }

      // Live flowing river current: scroll albedo, normal ripples & whitewater foam downstream!
      const rv = terrain.river;
      rv.colorTex.offset.y = -(t * 0.24) % 1;
      rv.normalTex.offset.y = -(t * 0.42) % 1;
      rv.normalTex.offset.x = Math.sin(t * 0.35) * 0.08;
      rv.foamTex.offset.y = -(t * 0.36) % 1;
      rv.foamMesh.material.opacity = 0.48 + Math.sin(t * 2.1) * 0.08;
      rv.waterMesh.position.y = Math.sin(t * 1.5) * 0.012;
      for (const pw of rv.pierWakes) {
        const pulse = 0.92 + Math.sin(t * 3.8 + pw.phase) * 0.12;
        pw.mesh.scale.set(1 + Math.sin(t * 2.9 + pw.phase) * 0.06, pulse, 1);
        pw.mesh.material.opacity = 0.46 + Math.sin(t * 4.2 + pw.phase) * 0.14;
      }
      for (const rw of rv.rapidsWakes) {
        rw.mesh.material.opacity = 0.30 + Math.sin(t * 3.4 + rw.phase) * 0.12;
      }

      // Rolling GPU wind waves across wheat & lavender meadows + gentle riverside reed breeze
      if (countryside.reedInst) {
        countryside.reedInst.position.x = Math.sin(t * 1.9) * 0.022;
      }
      if (farms?.windUniform) {
        farms.windUniform.value = t;
      }

      // Soft rising village hearth chimney smoke wisps
      for (const sm of countryside.chimneyPuffs) {
        const cycle = (t * 0.28 + sm.phase) % 1;
        sm.mesh.position.set(
          sm.bx + Math.sin(t * 1.2 + sm.phase * 5) * 0.12 + cycle * 0.35,
          sm.by + cycle * 1.35,
          sm.bz + Math.cos(t * 0.9 + sm.phase * 4) * 0.08
        );
        const s = 0.45 + cycle * 1.25;
        sm.mesh.scale.setScalar(s);
        sm.mesh.material.opacity = (1 - cycle) * 0.28;
      }

      // Spin medieval windmill sails
      for (const wm of countryside.spinningSails) {
        wm.hub.rotation.z = -t * wm.speed;
      }

      // Flicker frontier watchtower signal braziers
      for (const tf of countryside.towerFlames) {
        const p = 0.88 + Math.sin(t * 7.2 + tf.phase) * 0.16;
        tf.mesh.scale.set(p, p * 1.35, p);
      }

      // Live 4-Faction Naval Fleet Simulation: random spawning, bridge-arch passage, broadside duels & sinking!
      if (countryside.updateShips) {
        countryside.updateShips(dt, t);
      }

      // Drift multi-layered campaign clouds gently across the alpine skyline & valleys
      for (const cl of countryside.driftingClouds) {
        cl.mesh.position.x += dt * cl.speed;
        cl.mesh.position.y = cl.baseY + Math.sin(t * 0.45 + cl.phase) * 0.16;
        if (cl.mesh.position.x > WORLD_W / 2 + 10) cl.mesh.position.x = -WORLD_W / 2 - 10;
      }

      // Circle soaring eagles & alpine hawks high above the valleys and snow peaks
      for (const eg of countryside.soaringEagles) {
        const a = t * eg.speed + eg.phase;
        const ex = eg.cx + Math.cos(a) * eg.r;
        const ez = eg.cz + Math.sin(a) * eg.r;
        eg.mesh.position.set(ex, eg.y + Math.sin(t * 1.1 + eg.phase) * 0.25, ez);
        eg.mesh.rotation.y = eg.speed > 0 ? -a : -a + Math.PI;
        const flap = Math.sin(t * 5.2 + eg.phase) * 0.28;
        eg.lw.rotation.z = flap;
        eg.rw.rotation.z = -flap;
      }

      // Glide V-flock of valley swallows in a broad figure-8 sweep across the river basin
      if (countryside.birdFlock) {
        const fA = t * 0.22;
        const fx = Math.sin(fA) * 14.5;
        const fz = Math.sin(fA * 2) * 7.2 - 1.5;
        const nx = Math.sin(fA + 0.03) * 14.5;
        const nz = Math.sin((fA + 0.03) * 2) * 7.2 - 1.5;
        const heading = Math.atan2(nx - fx, nz - fz);
        const ch = Math.cos(heading), sh = Math.sin(heading);
        for (const sb of countryside.birdFlock) {
          const wx = fx + sb.offX * ch + sb.offZ * sh;
          const wz = fz - sb.offX * sh + sb.offZ * ch;
          sb.mesh.position.set(wx, 5.8 + sb.offY + Math.sin(t * 1.8 + sb.phase) * 0.18, wz);
          sb.mesh.rotation.y = heading;
          const fl = Math.sin(t * 9.5 + sb.phase) * 0.42;
          sb.lw.rotation.z = fl;
          sb.rw.rotation.z = -fl;
        }
      }

      // Roam forest deer herds & grazing horses smoothly across woodland clearings
      if (countryside.roamingAnimals) {
        for (const an of countryside.roamingAnimals) {
          const a = t * an.speed + an.phase;
          const x = an.cx + Math.cos(a) * an.rx + Math.sin(a * 2) * 0.35;
          const z = an.cz + Math.sin(a) * an.rz;
          const nx = an.cx + Math.cos(a + 0.04) * an.rx + Math.sin((a + 0.04) * 2) * 0.35;
          const nz = an.cz + Math.sin(a + 0.04) * an.rz;
          const y = terrainHeight(x, z);
          const stride = Math.abs(Math.sin(t * 4.2 + an.phase)) * 0.025;
          an.mesh.position.set(x, y + stride, z);
          an.mesh.rotation.y = Math.atan2(nx - x, nz - z);
          if (an.head) {
            const graze = Math.max(0, Math.sin(t * 0.9 + an.phase * 2));
            an.head.rotation.x = graze * 0.42;
          }
        }
      }

      // Glide white swans peacefully along calm stretches of River Willowmere
      if (countryside.riverSwans) {
        for (const sw of countryside.riverSwans) {
          const posAt = ang => {
            const u = 0.5 - 0.5 * Math.cos(ang);
            const z = sw.zMin + u * (sw.zMax - sw.zMin);
            const x = riverCenterX(z) + sw.offset + Math.sin(ang * 2) * 0.14;
            return [x, z];
          };
          const ang = t * sw.speed + sw.phase;
          const [sx, sz] = posAt(ang);
          const [px, pz] = posAt(ang - 0.02);
          const [nx, nz] = posAt(ang + 0.02);
          sw.mesh.position.set(sx, -0.165 + Math.sin(t * 2.6 + sw.phase) * 0.008, sz);
          sw.mesh.rotation.y = Math.atan2(nx - px, nz - pz);
        }
      }

      // Flutter delicate meadow butterflies in figure-8 paths over the wheat & wildflowers
      if (countryside.butterflies) {
        for (const bf of countryside.butterflies) {
          const a = t * bf.speed + bf.phase;
          const bx = bf.cx + Math.sin(a) * bf.r;
          const bz = bf.cz + Math.sin(a * 2) * bf.r * 0.55;
          const by = terrainHeight(bx, bz) + 0.34 + Math.sin(t * 2.8 + bf.phase) * 0.14;
          bf.mesh.position.set(bx, by, bz);
          bf.mesh.rotation.y = a;
          const fl = Math.sin(t * 16.0 + bf.phase) * 0.85;
          bf.lw.rotation.y = fl;
          bf.rw.rotation.y = -fl;
        }
      }

      // Slowly roam & graze sheep inside the green pasture enclosures
      if (farms?.roamingSheep) {
        for (const sh of farms.roamingSheep) {
          const a = t * sh.speed + sh.phase;
          const sx = sh.cx + Math.cos(a) * sh.r;
          const sz = sh.cz + Math.sin(a) * sh.r * 0.78;
          const nx = sh.cx + Math.cos(a + 0.05) * sh.r;
          const nz = sh.cz + Math.sin(a + 0.05) * sh.r * 0.78;
          const sy = terrainHeight(sx, sz);
          sh.mesh.position.set(sx, sy, sz);
          sh.mesh.rotation.y = Math.atan2(-(nz - sz), nx - sx);
          sh.head.position.y = 0.064 - Math.max(0, Math.sin(t * 1.1 + sh.phase)) * 0.028;
        }
      }

      const simulationStart=diagnostics?performance.now():0;
      // Live Total War miniature army battle simulation (4 venue teams + periodic Undead Invasion Event!)
      if (armies) {
        armies.update(dt, t);
        territorySystem.update(dt, t, armies.units, armies.isPeaceTreaty(), armies.getInvasionState());
        countryside.syncTerritoryColors?.(territorySystem, dt, t);
        // Smoothly corrupt/restore 3D ground, trees, grass, wildflowers, reeds & shrubs whenever Undead territory shifts!
        corrSyncAccum += dt;
        if (corrSyncAccum >= 0.45) {
          corrSyncAccum = 0;
          const curCorrVer = territorySystem.getCorruptionVersion?.() ?? 0;
          if (curCorrVer !== lastCorrVer) {
            lastCorrVer = curCorrVer;
            terrain.updateCorruption?.(territorySystem);
            forests.updateCorruption?.(territorySystem);
            farms.updateCorruption?.(territorySystem);
            countryside.updateCorruption?.(territorySystem);
          }
        }
        updateInvasionHud(dt);
        if (territorySystem.isEnabled()) {
          terrHudAccum += dt;
          if (terrHudAccum >= 0.45) {
            terrHudAccum = 0;
            updateTerritoryHud();
          }
        }
      }

      // Roaming Chaos Dragon soaring across the realm & torching random troops!
      if (dragon) {
        dragon.update(dt, t);
      }
      diagnostics?.recordSimulation(performance.now()-simulationStart);
    }

    // Re-bake dynamic shadow map every 2nd frame (~30Hz shadow pass -> cuts GPU vertex cost in half with identical visuals!)
    if ((++shadowFrameTick & 1) === 0) {
      renderer.shadowMap.needsUpdate = true;
    }

    if(diagnostics){
      diagnostics.time('render',()=>renderer.render(scene,camera));diagnostics.time('labels',()=>labels.render());
      diagnostics.end(renderer.info.render,{phase:armies.getInvasionState().phase,living:armies.units.filter(u=>u.alive&&!u.insideVenue).length});
    }else{renderer.render(scene,camera);labels.render();}
  }

  loop = createFrameLoop({ frame: animate, active: () => !disposed && !runtimePaused && !contextLost &&
    !document.hidden && (isVisible || isFullscreenActive()) && !webglPaused });
  const syncMotion = () => {
    controls.enableDamping = !reducedMotion.matches;
    clearMoveKeys();
    if (reducedMotion.matches) {
      if (activeTween) { camera.position.copy(activeTween.toPos); controls.target.copy(activeTween.toTarget); }
      activeTween = null; blendTween = null; zoomTargetDist = null;
      applyStrategicBlend(strategicMode ? 1 : 0);
    }
  };
  cleanups.push(reducedMotion.subscribe(syncMotion)); syncMotion();
  diagnostics?.registerInstances(scene);
  diagnostics?.configure({prepare:async scenario=>{
    if(reducedMotion.matches)throw Error('Turn off reduced motion to benchmark the live campaign.');
    if(scenario==='fullscreen'&&!isFullscreenActive())await toggleFullscreen();
    if(scenario==='invasion'){armies.triggerInvasion();armies.skipWave();armies.skipWave();armies.skipWave();invHudAccum=1;updateInvasionHud(0);}
    selectedVenueId=null;window.TG?.atlas?.selectVenue(null,{push:false,focus:false});activeTween=null;
    camera.position.set(...OVERVIEW_CAM.pos);controls.target.set(...OVERVIEW_CAM.target);controls.update();
  }});
  return {
    setMode(mode) {
      const next = mode !== '3d';
      if (!next && !strategicMode) return;
      setStrategicView(next, {manual:true, animateCam:true});
      if (next) {
        blendTween = null; activeTween = null; zoomTargetDist = null;
        applyStrategicBlend(1); webglPaused = true;
        if (isFullscreenActive()) toggleFullscreen();
      }
      onMode(mode);
    },
    pause() { runtimePaused = true; clearMoveKeys(); loop.pause(); },
    resume() { if (disposed) return; if(runtimePaused)diagnostics?.resetClock(); runtimePaused = false; loop.resume(); },
    dispose: releaseResources,
  };
  } catch (error) { releaseResources(); throw error; }
}
