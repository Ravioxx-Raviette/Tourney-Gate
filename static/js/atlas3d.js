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

// ── 1. CAMPAIGN GEOGRAPHY & VENUE DEFINITIONS ────────────────────────────────
const WORLD_W = 68;
const WORLD_D = 52;

// Exact official Tourney Gate faction icons (matching templates/base.html #i-swords, #i-shield, #i-bow, #i-cup)
const FACTION_ICON_PATHS = [
  ['m4 3 6 4 10 13m0-17-6 4L4 20M2 15l7 7m6 0 7-7M5 5l14 14M19 5 5 19'],                                   // 0: Red — Grand Melee (Crossed Swords)
  ['m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z', 'M12 6v11M8 11h8'],                                            // 1: Blue — Arena Games (Shield & Cross)
  ['M5 3c18 1 19 19 0 18L12 12Zm0 18L21 3M15 3h6v6'],                                                       // 2: Green — Archery (Bow & Arrow)
  ['M6 3h12v5a6 6 0 0 1-12 0ZM12 14v7m-5 0h10M6 5H2v3a4 4 0 0 0 5 4m11-7h4v3a4 4 0 0 1-5 4'],              // 3: Orange — Feasts (Chalice Cup)
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

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
  pushEdgeRibbon(140, u => [-WORLD_W / 2 + u * WORLD_W,  WORLD_D / 2], true);
  pushEdgeRibbon(108, u => [-WORLD_W / 2, -WORLD_D / 2 + u * WORLD_D], true);
  pushEdgeRibbon(108, u => [ WORLD_W / 2, -WORLD_D / 2 + u * WORLD_D], false);

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

  return { terrainMesh, skirtMesh, terrainGeom: geom, baseHeights, river };
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
  ];
  const FACTION_ROOF_SHADES = [
    new THREE.Color(0x8f1f2b),
    new THREE.Color(0x1f4d87),
    new THREE.Color(0x216338),
    new THREE.Color(0xab6216),
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
    { cx: -5.6,  cz: -12.6, houses: 3 },  // North Bridge West hamlet
    { cx: -21.2, cz: -2.4,  houses: 4 },  // West Woods hamlet
    { cx: -23.8, cz: -7.6,  houses: 4 },  // Westwatch Valley hamlet
    { cx: -12.4, cz: -2.2,  houses: 3 },  // Silverlance South Meadow
    // East Bank — Blue (NE)
    { cx: 6.6,   cz: -5.8,  houses: 5 },  // East Bank north village
    { cx: 12.4,  cz: -12.8, houses: 4 },  // Alpine Foothills village
    { cx: 22.8,  cz: -8.6,  houses: 4 },  // East Ridge hamlet
    { cx: 21.4,  cz: 2.2,   houses: 5 },  // Old Orchard hamlet
    // East Bank — Green (SE)
    { cx: 17.8,  cz: 14.8,  houses: 4 },  // Greenwood Meadow village
    { cx: 11.4,  cz: 16.4,  houses: 4 },  // Willowmere East hamlet
    { cx: 23.2,  cz: 8.6,   houses: 4 },  // King's Timberland village
    { cx: 6.4,   cz: 14.8,  houses: 3 },  // South Bridge East hamlet
    // West Bank — Orange (SW)
    { cx: -8.4,  cz: 4.0,   houses: 5 },  // West King's Road village
    { cx: -14.8, cz: 15.8,  houses: 4 },  // Great Hall South hamlet
    { cx: -25.4, cz: 6.2,   houses: 4 },  // Far West Hearth hamlet
    { cx: -21.6, cz: 11.4,  houses: 4 },  // Hearthstone Valley village
    { cx: -8.2,  cz: 14.8,  houses: 4 },  // South-West Meadows hamlet
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
    { x: -5.4,  z: -14.0, rotY: 0.10, scale: 0.92 }, // Northmarch Bastion (NW)
    { x: 18.6,  z: -12.6, rotY: -0.35, scale: 1.04 }, // Frostpeak Keep (NE)
    { x: 24.0,  z: -2.0,  rotY: -1.15, scale: 0.95 }, // Eastcrest Hold (NE)
    { x: 21.0,  z: 13.8,  rotY: -2.20, scale: 1.02 }, // Greenwood Citadel (SE)
    { x: -23.2, z: 14.0,  rotY: 0.95, scale: 1.04 }, // Hearthstone Keep (SW)
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
      [1.76, 0.72, 0.22, 0, 0.48,  0.82],
      [0.22, 0.72, 1.76, -0.82, 0.48, 0],
      [0.22, 0.72, 1.76,  0.82, 0.48, 0],
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
    { x: -2.6,  z: -15.6, rotY: 0.20 },
    { x: 5.4,   z: -16.2, rotY: -0.25 },
    { x: -24.5, z: -11.5, rotY: 0.65 },
    { x: 24.5,  z: 9.8,   rotY: -1.85 },
    { x: -24.2, z: 10.6,  rotY: 1.15 },
    { x: 24.4,  z: -9.8,  rotY: -0.75 },
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
    { cx: -18.2, cz: -8.0,  n: 5 }, // Red NW
    { cx: -10.8, cz: -14.8, n: 4 }, // Red NW
    { cx: 16.8,  cz: 10.6,  n: 5 }, // Green SE
    { cx: 21.2,  cz: -5.5,  n: 4 }, // Blue NE
    { cx: -21.2, cz: 7.4,   n: 4 }, // Orange SW
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
    { id: 0, name: 'Royal Lists',    primary: '#b52430', hex: 0xb52430, accent: '#f4ead0', trim: '#d4af37', pattern: 'cross' },
    { id: 1, name: 'Iron Colosseum', primary: '#24599c', hex: 0x24599c, accent: '#efe5c8', trim: '#d4af37', pattern: 'stripes' },
    { id: 2, name: 'King’s Green',   primary: '#267a44', hex: 0x267a44, accent: '#f2e8cc', trim: '#d8b44c', pattern: 'chevron' },
    { id: 3, name: 'Great Hall',     primary: '#cf8722', hex: 0xcf8722, accent: '#7a1f2d', trim: '#f2d374', pattern: 'bands' },
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
    { team: 0, dir: 1,  z: -15.2, lane: 0.34 },
    { team: 2, dir: -1, z: 14.8,  lane: -0.34 },
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
    navalShotInst.instanceMatrix.needsUpdate = true;

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
    navalFxInst.instanceMatrix.needsUpdate = true;
    if (navalFxInst.instanceColor) navalFxInst.instanceColor.needsUpdate = true;
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
  reedPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y, p.z);
    rDummy.scale.set(p.s * 1.35, p.s, p.s * 1.35);
    rDummy.rotation.set(0.08, p.rot, 0.06);
    rDummy.updateMatrix();
    reedInst.setMatrixAt(idx, rDummy.matrix);
    reedCol.setHex(idx % 3 === 0 ? 0x5c7c3e : idx % 3 === 1 ? 0x6f8d49 : 0x89964f);
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
  shrubPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y + p.s * 0.11, p.z);
    rDummy.scale.set(p.s * 1.35, p.s * (p.flower ? 0.48 : 0.78), p.s * 1.25);
    rDummy.rotation.set(0, p.rot, 0);
    rDummy.updateMatrix();
    shrubInst.setMatrixAt(idx, rDummy.matrix);
    if (p.flower) {
      sCol.setHex(idx % 3 === 0 ? 0xe5c85c : idx % 3 === 1 ? 0xd9a05b : 0xb59ad1);
    } else {
      sCol.setHex(idx % 3 === 0 ? 0x456b34 : idx % 3 === 1 ? 0x567b3e : 0x3b5c2f);
    }
    shrubInst.setColorAt(idx, sCol);
  });
  shrubInst.instanceMatrix.needsUpdate = true;
  if (shrubInst.instanceColor) shrubInst.instanceColor.needsUpdate = true;
  country.add(shrubInst);

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
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3522, roughness: 0.92 });
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

  positions.forEach((p, idx) => {
    dummy.position.set(p.x, p.y + 0.20 * p.s, p.z);
    dummy.scale.setScalar(p.s);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(idx, dummy.matrix);
  });
  pines.forEach((p, idx) => {
    const tint = pinePalette[Math.floor(p.shade * pinePalette.length) % pinePalette.length];
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
  oaks.forEach((p, idx) => {
    const tint = oakPalette[Math.floor(p.shade * oakPalette.length) % oakPalette.length];
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
  pineLowerMesh.instanceMatrix.needsUpdate = true;
  pineUpperMesh.instanceMatrix.needsUpdate = true;
  oakMainMesh.instanceMatrix.needsUpdate = true;
  oakCrownMesh.instanceMatrix.needsUpdate = true;
  if (pineLowerMesh.instanceColor) pineLowerMesh.instanceColor.needsUpdate = true;
  if (pineUpperMesh.instanceColor) pineUpperMesh.instanceColor.needsUpdate = true;
  if (oakMainMesh.instanceColor) oakMainMesh.instanceColor.needsUpdate = true;
  if (oakCrownMesh.instanceColor) oakCrownMesh.instanceColor.needsUpdate = true;

  forestGroup.add(trunkMesh, pineLowerMesh, pineUpperMesh, oakMainMesh, oakCrownMesh);
  parent.add(forestGroup);
  return forestGroup;
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
      { bx: 52, lean:  -4, h: 98, w: 7, col: '#4e8034', tip: '#96c456' },
      { bx: 64, lean:   3, h: 104, w: 8, col: '#619440', tip: '#b0da6c' },
      { bx: 78, lean:  10, h: 92, w: 7, col: '#4f8236', tip: '#98c658' },
      { bx: 92, lean:  16, h: 78, w: 6, col: '#5a8e3d', tip: '#a4cf62' },
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
    const gPalette = [0xcce69a, 0xb8d984, 0xd8edaa, 0xa8cf74, 0xe0f0b4];
    grassTuftPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.08, p.s, p.s * 1.08);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      grassInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(gPalette[Math.floor(p.shade * gPalette.length) % gPalette.length]);
      grassInst.setColorAt(idx, col);
    });
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    farmGroup.add(grassInst);
  }

  if (flowerPts.length) {
    const flGeom = new THREE.OctahedronGeometry(0.032, 0);
    const flMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, emissive: 0x241f14, emissiveIntensity: 0.18 });
    const flInst = new THREE.InstancedMesh(flGeom, flMat, flowerPts.length);
    const flColors = [0xffe066, 0xfff8eb, 0x8cc8ff, 0xf2a6d8]; // buttercups, daisies, cornflowers, wild rose
    flowerPts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.2, p.s * 0.75, p.s * 1.2);
      dummy.rotation.set(0, idx * 1.3, 0);
      dummy.updateMatrix();
      flInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(flColors[p.kind % flColors.length]);
      flInst.setColorAt(idx, col);
    });
    flInst.instanceMatrix.needsUpdate = true;
    if (flInst.instanceColor) flInst.instanceColor.needsUpdate = true;
    farmGroup.add(flInst);
  }

  parent.add(farmGroup);
  return { farmGroup, windUniform, roamingSheep };
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
  const owner = new Int8Array(CELLS);    // -1 unplayable/water, 0..3 faction id
  const initialOwner = new Int8Array(CELLS);
  const captureTeam = new Int8Array(CELLS);
  const captureProg = new Float32Array(CELLS);
  const contested = new Uint8Array(CELLS);
  const battleHeat = new Float32Array(CELLS);
  const presence = new Uint16Array(CELLS * 4);
  const cellWorldX = new Float32Array(CELLS);
  const cellWorldZ = new Float32Array(CELLS);

  let totalPlayable = 0;
  const ownerCounts = [0, 0, 0, 0];
  const lostHomelandCounts = [0, 0, 0, 0];

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

      // Protect only each house's immediate keep center (r < 3.1) so no faction can ever be permanently erased
      for (let tm = 0; tm < 4; tm++) {
        const v = VENUE_SPECS[tm];
        if (Math.hypot(wx - v.x, wz - v.z) < 3.15) {
          homeCore[idx] = tm;
          break;
        }
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
  ];
  const BORDER_RGB = [
    [255, 108, 118],
    [116, 186, 255],
    [104, 240, 152],
    [255, 196, 88],
  ];

  let enabled = false;
  let dirty = true;
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

  function update(dt, t, units) {
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

      // Stamp every alive unit's influence into its local 3x3 territory cells
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive) continue;
        const c0 = Math.floor((u.x + WORLD_W * 0.5) / CELL_W);
        const r0 = Math.floor((u.z + WORLD_D * 0.5) / CELL_D);
        const weight = (u.type === 'knight' || u.type === 'cavalry' || u.type === 'siege') ? 2 : 1;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r0 + dr;
          if (rr < 0 || rr >= ROWS) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c0 + dc;
            if (cc < 0 || cc >= COLS) continue;
            const idx = rr * COLS + cc;
            if (!playable[idx]) continue;
            const w = (dr === 0 && dc === 0) ? weight * 2 : weight;
            presence[idx * 4 + u.team] += w;
          }
        }
      }

      let hasContested = false;
      for (let idx = 0; idx < CELLS; idx++) {
        if (!playable[idx]) continue;
        const base = idx * 4;
        let presentTeams = 0;
        let soleTeam = -1;
        let soleStrength = 0;
        for (let tm = 0; tm < 4; tm++) {
          const cnt = presence[base + tm];
          if (cnt > 0) {
            presentTeams++;
            soleTeam = tm;
            soleStrength = cnt;
          }
        }

        if (presentTeams === 1) {
          // Uncontested occupation! If this cell belongs to another group and isn't their inner keep sanctuary, claim it!
          if (owner[idx] !== soleTeam && homeCore[idx] === -1) {
            if (captureTeam[idx] !== soleTeam) {
              captureTeam[idx] = soleTeam;
              captureProg[idx] = 0;
            }
            const rate = 0.62 + Math.min(5, soleStrength) * 0.24;
            captureProg[idx] += stepDt * rate;
            dirty = true;
            if (captureProg[idx] >= 1.0) {
              const prev = owner[idx];
              if (prev >= 0) ownerCounts[prev]--;
              if (initialOwner[idx] >= 0) {
                if (prev === initialOwner[idx] && soleTeam !== initialOwner[idx]) lostHomelandCounts[initialOwner[idx]]++;
                else if (prev !== initialOwner[idx] && soleTeam === initialOwner[idx]) lostHomelandCounts[initialOwner[idx]] = Math.max(0, lostHomelandCounts[initialOwner[idx]] - 1);
              }
              owner[idx] = soleTeam;
              ownerCounts[soleTeam]++;
              captureProg[idx] = 0;
              captureTeam[idx] = -1;
            }
          } else if (owner[idx] === soleTeam && captureProg[idx] > 0) {
            captureProg[idx] = Math.max(0, captureProg[idx] - stepDt * 0.9);
            if (captureProg[idx] === 0) captureTeam[idx] = -1;
            dirty = true;
          }
        } else if (presentTeams >= 2) {
          // Active battlefront competition — territory cannot flip until one faction clears the other out!
          contested[idx] = 1;
          battleHeat[idx] = Math.min(28.0, battleHeat[idx] + stepDt * 3.4);
          hasContested = true;
        } else if (captureProg[idx] > 0) {
          // Gently decay unfinished partial captures when troops leave
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

  // Pick a spread-out enemy-owned territory coordinate matching the squad's assigned map theater
  // so battles erupt simultaneously across far-left, far-right, far-north, far-south, AND flanks — NOT just the center!
  function pickAttackTarget(teamId, squad) {
    const mySide = VENUE_SPECS[teamId].x < 0 ? -1 : 1;
    const theater = squad.theater || 'outer-bank';
    const isNorthHome = VENUE_SPECS[teamId].z < 0;

    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;

    for (let k = 0; k < 42; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] === teamId || owner[idx] < 0 || homeCore[idx] >= 0) continue;
      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      const onMyBank = (wx < riverCenterX(wz) ? -1 : 1) === mySide;
      const absX = Math.abs(wx);
      const centerDist = Math.hypot(wx, wz - BRIDGE_Z);
      const base = idx * 4;
      const enemyHere = presence[base + owner[idx]] || 0;

      let score = tRand() * 12;

      if (theater === 'outer-bank') {
        // Fight across the wide open far-left / far-right flanks of our own riverbank (zero bridge bottleneck!)
        if (onMyBank) score += 28;
        if (absX > 14.5) score += 18;
        else if (absX > 9.5) score += 8;
        if (centerDist < 9.5) score -= 24;
      } else if (theater === 'mid-bank') {
        // Contest farms, woods & borderlands up and down our entire riverbank
        if (onMyBank) score += 26;
        if (absX > 8.5) score += 10;
        if (centerDist < 8.5) score -= 18;
      } else if (theater === 'flank-bridge') {
        // Cross the Northern Marches (North Bridge) or Southern Meadows (South Bridge) to attack the far side!
        if (!onMyBank) score += 22;
        if (isNorthHome && wz < -5.0) score += 22;
        else if (!isNorthHome && wz > 7.0) score += 22;
        if (absX > 11.0) score += 10;
        if (centerDist < 8.5) score -= 20;
      } else {
        // Free-roaming deep raiders: hunt undefended enemy territory ANYWHERE on the map!
        if (enemyHere === 0) score += 16;
        if (absX > 13.0 || Math.abs(wz) > 10.0) score += 12;
      }

      if (squad.role === 'cavalry' || squad.role === 'outrider') {
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
  // (avoids enemies & center choke point so reinforcements deploy across the whole realm!)
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
      // Stay outside the solid venue architecture rim
      let insideVenue = false;
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        const v = VENUE_SPECS[vi];
        if (Math.hypot(wx - v.x, wz - v.z) < v.plateauR + 0.55) {
          insideVenue = true;
          break;
        }
      }
      if (insideVenue) continue;

      // Never spawn directly on top of active enemies (avoid instant center meat-grinder!)
      const base = idx * 4;
      let enemiesHere = 0;
      for (let tm = 0; tm < 4; tm++) {
        if (tm !== teamId) enemiesHere += presence[base + tm];
      }

      let score = tRand() * 14 - enemiesHere * 26;
      const centerDist = Math.hypot(wx, wz - BRIDGE_Z);
      if (centerDist < 9.0) score -= 18;
      if (Math.abs(wx) > 11.0) score += 8;

      if (preferX !== null && preferZ !== null) {
        // Reinforcing an active squad: prefer a safe owned cell in the same region of the map
        const dSquad = Math.hypot(wx - preferX, wz - preferZ);
        score -= Math.min(24, dSquad * 0.65);
        if (dSquad < 3.0) score -= 6; // slight standoff so reinforcements march in cleanly
      } else {
        // Fresh squad deployment: spread widely across the entire owned realm!
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
    // Safe outer-flank fallback around the faction's home venue (facing outward/flank, NOT the middle!)
    const ang = tRand() * Math.PI * 2;
    return [venue.x + Math.cos(ang) * (venue.plateauR + 1.1), venue.z + Math.sin(ang) * (venue.plateauR + 1.1)];
  }

  // Pick a homeland cell that was lost to an enemy OR is currently being invaded,
  // preferring frontier lost-homeland cells so factions methodically retake their default territory!
  function pickDefenseTarget(teamId) {
    let bestX = null;
    let bestZ = null;
    let bestScore = -1e9;
    for (let k = 0; k < 44; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx]) continue;
      const isLostHomeland = initialOwner[idx] === teamId && owner[idx] !== teamId;
      const base = idx * 4;
      let invaders = 0;
      for (let tm = 0; tm < 4; tm++) {
        if (tm !== teamId) invaders += presence[base + tm];
      }
      const isInvaded = owner[idx] === teamId && invaders > 0;
      if (!isLostHomeland && !isInvaded) continue;

      // Prefer frontier lost homeland cells bordering our currently held land so reconquest advances cleanly
      const r = Math.floor(idx / COLS);
      const c = idx - r * COLS;
      const bordersUs =
        (r > 0 && owner[idx - COLS] === teamId) ||
        (r < ROWS - 1 && owner[idx + COLS] === teamId) ||
        (c > 0 && owner[idx - 1] === teamId) ||
        (c < COLS - 1 && owner[idx + 1] === teamId);

      const score = (isInvaded ? 24 : 18) + (bordersUs ? 12 : 0) + invaders * 3 + tRand() * 8;
      if (score > bestScore) {
        bestScore = score;
        bestX = cellWorldX[idx];
        bestZ = cellWorldZ[idx];
      }
    }
    return bestX !== null ? [bestX, bestZ] : null;
  }

  // Pick a strategic frontier edge spot owned by teamId where battles occur frequently for builders to erect barricades/towers!
  function pickFortifySpot(teamId, existingStructures = []) {
    let best = null;
    let bestScore = -1e9;
    for (let k = 0; k < 56; k++) {
      const idx = Math.floor(tRand() * CELLS);
      if (!playable[idx] || owner[idx] !== teamId || homeCore[idx] >= 0) continue;
      const r = Math.floor(idx / COLS);
      const c = idx - r * COLS;
      if (r < 2 || r > ROWS - 3 || c < 2 || c > COLS - 3) continue;

      // Check if on/near an enemy border (1-2 cells from enemy-owned territory) or high battle heat
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

      const wx = cellWorldX[idx];
      const wz = cellWorldZ[idx];
      // Keep well clear of venues, riverbanks, and bridge approaches
      if (Math.abs(wx - riverCenterX(wz)) < riverHalfWidth(wz) + 1.35) continue;
      let blocked = false;
      for (let vi = 0; vi < VENUE_SPECS.length; vi++) {
        const v = VENUE_SPECS[vi];
        if (Math.hypot(wx - v.x, wz - v.z) < v.plateauR + 1.75) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const bz of [NORTH_BRIDGE_Z, BRIDGE_Z, SOUTH_BRIDGE_Z]) {
        if (Math.abs(wz - bz) < 2.2 && Math.abs(wx - riverCenterX(bz)) < 5.6) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let si = 0; si < existingStructures.length; si++) {
        const s = existingStructures[si];
        if (Math.hypot(wx - s.x, wz - s.z) < 3.1) { blocked = true; break; }
      }
      if (blocked) continue;

      // Prefer cells with few/no immediate enemies so builders can erect fortifications safely
      const base = idx * 4;
      let enemiesHere = 0;
      for (let tm = 0; tm < 4; tm++) if (tm !== teamId) enemiesHere += presence[base + tm];
      if (enemiesHere > 4) continue;

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

  function getShares() {
    const denom = Math.max(1, totalPlayable);
    return ownerCounts.map(c => (c / denom) * 100);
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
    // Check immediate 3x3 neighbor if landmark sits right on an unplayable ridge/bank cell
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

  return {
    overlayMesh,
    update,
    setEnabled,
    isEnabled: () => enabled,
    getShares,
    getOwnerAt,
    getLostHomelandCount: tm => lostHomelandCounts[tm] || 0,
    pickAttackTarget,
    pickDefenseTarget,
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

  // Slow-paced, tanky Total War combat cadence (scaled dynamically by REALM_TIDE power shifts!)
  const UNIT_STATS = {
    swordsman: { hp: 265, dmg: 9,  range: 0.74, speed: 0.44, cd: 2.65, scale: 1.00 },
    knight:    { hp: 450, dmg: 14, range: 0.80, speed: 0.38, cd: 2.90, scale: 1.12 },
    archer:    { hp: 195, dmg: 7,  range: 3.60, speed: 0.42, cd: 3.85, scale: 0.95 },
    cavalry:   { hp: 360, dmg: 13, range: 0.96, speed: 0.74, cd: 2.75, scale: 1.06 },
    mage:      { hp: 210, dmg: 12, range: 3.90, speed: 0.40, cd: 4.40, scale: 1.02 },
    siege:     { hp: 760, dmg: 20, range: 1.15, speed: 0.27, cd: 4.25, scale: 1.00 },
    catapult:  { hp: 560, dmg: 22, range: 5.40, speed: 0.23, cd: 7.20, scale: 1.00 },
    builder:   { hp: 235, dmg: 6,  range: 0.72, speed: 0.44, cd: 2.35, scale: 0.98 },
  };

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

  // Prevent units from ever wading underwater or clipping into venue plinths (allows full map-wide roaming & all 3 bridges!)
  const keepOnPassableLand = (x, z, prevX, prevZ) => {
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

    // Keep outside the solid inner architecture of the 4 venues
    for (const v of VENUE_SPECS) {
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

  // ── INSTANCED MESH POOLS (SILKY 60FPS FOR 1,180 LIVE TROOPS + FORTIFICATIONS + 750 CORPSES!) ─
  const MAX_PERSONS = 2250;
  const MAX_SWORDSMEN = 760;
  const MAX_KNIGHTS = 320;
  const MAX_ARCHERS = 320;
  const MAX_MAGES = 64;
  const MAX_BUILDERS = 64;
  const MAX_HORSES = 280;
  const MAX_SIEGE = 48;
  const MAX_BARRICADES = 32;
  const MAX_TOWERS = 20;
  const MAX_BANNERS = 68;
  const MAX_ARROWS = 380;
  const MAX_MAGIC = 48;
  const MAX_BOULDERS = 32;
  const MAX_FX = 240;

  const initWhite = new THREE.Color(0xffffff);
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
    partAt(new THREE.BoxGeometry(0.036, 0.026, 0.052),  0.052, 0.146, 0, 0, 0, -0.22), // right steel spaulder
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
    partAt(new THREE.SphereGeometry(0.042, 7, 5),  0.068, 0.152, 0, 0, 0, 0, 1.05, 0.85, 1.0), // right pauldron
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

  const mageOrbInst = makeInst(
    new THREE.SphereGeometry(0.036, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
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
    partAt(new THREE.ConeGeometry(0.012, 0.034, 4),  0.018, 0.195, 0.175, -0.15, 0, -0.15),      // right ear
    partAt(new THREE.CylinderGeometry(0.014, 0.008, 0.15, 5), 0, -0.01, -0.18, -0.45, 0, 0),     // flowing tail
    // 4 galloping legs
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), -0.038, -0.06,  0.095, -0.26, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5),  0.038, -0.06,  0.095,  0.22, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5), -0.038, -0.06, -0.095,  0.24, 0, 0),
    partAt(new THREE.CylinderGeometry(0.015, 0.011, 0.135, 5),  0.038, -0.06, -0.095, -0.22, 0, 0),
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
    partAt(new THREE.SphereGeometry(0.034, 6, 5),  0.058, 0.148, 0),                             // right rider pauldron
    // Couched jousting lance with conical hand vamplate guard!
    partAt(new THREE.CylinderGeometry(0.008, 0.013, 0.44, 5), 0.068, 0.115, 0.16, Math.PI / 2, 0, 0),
    partAt(new THREE.ConeGeometry(0.026, 0.055, 6), 0.068, 0.115, 0.06, -Math.PI / 2, 0, 0),     // vamplate hand guard
    partAt(new THREE.ConeGeometry(0.016, 0.055, 5), 0.068, 0.115, 0.40, Math.PI / 2, 0, 0),      // steel lance tip
  ]);
  const cavalryGearInst = makeInst(cavalryGearGeom, plateArmorMat, MAX_HORSES, false, false);

  // Fluttering Faction Lance Pennon right behind the cavalry lance tip!
  const cavalryPennonGeom = partAt(new THREE.BoxGeometry(0.010, 0.048, 0.11), 0.068, 0.088, 0.30);
  const cavalryPennonInst = makeInst(cavalryPennonGeom, stdWhite(0.65), MAX_HORSES, false, true);

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
    partAt(new THREE.BoxGeometry(0.28, 0.24, 0.036),  0.30, 0.26, 0.085),
  ]);
  const barricadeTrimInst = makeInst(barricadeTrimGeom, stdWhite(0.68), MAX_BARRICADES, false, true);

  // Fortification #2: Elevated Medieval Timber Archer Watchtower (platform at y=0.90 where 2 archers climb & shoot!)
  const towerWoodGeom = mergeUnitGeoms([
    // 4 heavy corner timber stanchion posts
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), -0.34, 0.59, -0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085),  0.34, 0.59, -0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085), -0.34, 0.59,  0.34),
    partAt(new THREE.BoxGeometry(0.085, 1.18, 0.085),  0.34, 0.59,  0.34),
    // Diagonal X-bracing struts on all 4 lower faces
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45,  0.34, 0, 0,  0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45,  0.34, 0, 0, -0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, -0.34, 0, 0,  0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), 0, 0.45, -0.34, 0, 0, -0.72),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045),  0.34, 0.45, 0,  0.72, 0, 0),
    partAt(new THREE.BoxGeometry(0.045, 0.92, 0.045), -0.34, 0.45, 0, -0.72, 0, 0),
    // Elevated wooden battlement floor deck (y = 0.88)
    partAt(new THREE.BoxGeometry(0.92, 0.085, 0.92), 0, 0.88, 0),
    // 4-sided timber parapet walls protecting garrisoned archers
    partAt(new THREE.BoxGeometry(0.94, 0.24, 0.07), 0, 1.04,  0.42),
    partAt(new THREE.BoxGeometry(0.94, 0.24, 0.07), 0, 1.04, -0.42),
    partAt(new THREE.BoxGeometry(0.07, 0.24, 0.86),  0.42, 1.04, 0),
    partAt(new THREE.BoxGeometry(0.07, 0.24, 0.86), -0.42, 1.04, 0),
    // Wooden climbing ladder leaning up the rear face (-Z)
    partAt(new THREE.BoxGeometry(0.032, 0.98, 0.032), -0.12, 0.45, -0.46, 0.18, 0, 0),
    partAt(new THREE.BoxGeometry(0.032, 0.98, 0.032),  0.12, 0.45, -0.46, 0.18, 0, 0),
    ...[0.16, 0.34, 0.52, 0.70].map(ry => partAt(new THREE.BoxGeometry(0.24, 0.024, 0.028), 0, ry, -0.50 + ry * 0.16)),
  ]);
  const towerWoodInst = makeInst(towerWoodGeom, new THREE.MeshStandardMaterial({ color: 0x7b5633, roughness: 0.88 }), MAX_TOWERS, true, false);

  const towerTrimGeom = mergeUnitGeoms([
    // Faction-colored heraldic parapet banners & corner crenellation shields on all 4 sides
    partAt(new THREE.BoxGeometry(0.46, 0.26, 0.038), 0, 0.96,  0.465),
    partAt(new THREE.BoxGeometry(0.46, 0.26, 0.038), 0, 0.96, -0.465),
    partAt(new THREE.BoxGeometry(0.038, 0.26, 0.46),  0.465, 0.96, 0),
    partAt(new THREE.BoxGeometry(0.038, 0.26, 0.46), -0.465, 0.96, 0),
  ]);
  const towerTrimInst = makeInst(towerTrimGeom, stdWhite(0.66), MAX_TOWERS, false, true);

  // Detailed Armored Siege Battering Ram (4 spoked wheels + timber A-frame roof shed + side shields + spiked iron ram head!)
  const ramHullGeom = mergeUnitGeoms([
    // Heavy timber wheeled base frame
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.62), 0, 0.06, 0),
    // 4 heavy wooden siege wheels
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, -0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10),  0.19, 0.085, -0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085,  0.20, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10),  0.19, 0.085,  0.20, 0, 0, Math.PI / 2),
    // Twin sloped armored timber mantlet roof panels + ridge beam
    partAt(new THREE.BoxGeometry(0.27, 0.045, 0.66), -0.11, 0.24, 0, 0, 0,  0.66),
    partAt(new THREE.BoxGeometry(0.27, 0.045, 0.66),  0.11, 0.24, 0, 0, 0, -0.66),
    partAt(new THREE.BoxGeometry(0.07, 0.06, 0.68), 0, 0.34, 0),
    // 4 vertical corner timber support posts
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), -0.16, 0.16, -0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04),  0.16, 0.16, -0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04), -0.16, 0.16,  0.26),
    partAt(new THREE.BoxGeometry(0.04, 0.22, 0.04),  0.16, 0.16,  0.26),
  ]);
  const ramHullInst = makeInst(ramHullGeom, new THREE.MeshStandardMaterial({ color: 0x735232, roughness: 0.88 }), MAX_SIEGE, true, false);

  const ramTrimGeom = mergeUnitGeoms([
    // Faction-colored armored side mantlet shields & iron roof bands
    partAt(new THREE.BoxGeometry(0.03, 0.14, 0.50), -0.185, 0.18, 0),
    partAt(new THREE.BoxGeometry(0.03, 0.14, 0.50),  0.185, 0.18, 0),
    partAt(new THREE.BoxGeometry(0.32, 0.03, 0.06), 0, 0.35, -0.18),
    partAt(new THREE.BoxGeometry(0.32, 0.03, 0.06), 0, 0.35,  0.18),
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
    partAt(new THREE.BoxGeometry(0.06, 0.07, 0.58),  0.14, 0.08, 0),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.08), 0, 0.08, -0.22),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.08), 0, 0.08,  0.22),
    partAt(new THREE.BoxGeometry(0.34, 0.06, 0.09), 0, 0.08,  0.00),
    // 4 sturdy wooden wheels
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085, -0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10),  0.19, 0.085, -0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10), -0.19, 0.085,  0.19, 0, 0, Math.PI / 2),
    partAt(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 10),  0.19, 0.085,  0.19, 0, 0, Math.PI / 2),
    // Twin upright A-frame torsion stanchions + angled braces + top crossbar!
    partAt(new THREE.BoxGeometry(0.05, 0.30, 0.055), -0.14, 0.24, 0.06),
    partAt(new THREE.BoxGeometry(0.05, 0.30, 0.055),  0.14, 0.24, 0.06),
    partAt(new THREE.BoxGeometry(0.045, 0.32, 0.045), -0.14, 0.22, -0.07, 0.45, 0, 0),
    partAt(new THREE.BoxGeometry(0.045, 0.32, 0.045),  0.14, 0.22, -0.07, 0.45, 0, 0),
    partAt(new THREE.BoxGeometry(0.36, 0.055, 0.065), 0, 0.38, 0.06),
    // Coiled torsion rope drum
    partAt(new THREE.CylinderGeometry(0.042, 0.042, 0.30, 8), 0, 0.13, 0.02, 0, 0, Math.PI / 2),
  ]);
  const catBaseInst = makeInst(catBaseGeom, new THREE.MeshStandardMaterial({ color: 0x7b5835, roughness: 0.88 }), MAX_SIEGE, true, false);

  const catTrimGeom = mergeUnitGeoms([
    // Faction-colored heraldic side shield plates on the catapult sled
    partAt(new THREE.BoxGeometry(0.025, 0.11, 0.26), -0.178, 0.16, -0.02),
    partAt(new THREE.BoxGeometry(0.025, 0.11, 0.26),  0.178, 0.16, -0.02),
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
  const banFlagInsts = [0, 1, 2, 3].map(tid => {
    const flagMat = new THREE.MeshStandardMaterial({
      map: createTeamFlagTexture(tid),
      roughness: 0.66,
      metalness: 0.06,
    });
    return makeInst(banFlagGeom, flagMat, Math.ceil(MAX_BANNERS / 4) + 8, false, false);
  });

  // Live Projectiles & Combat Sparks / Explosions
  const arrowGeom = new THREE.CylinderGeometry(0.008, 0.012, 0.24, 4);
  arrowGeom.rotateX(Math.PI / 2);
  const arrowInst = makeInst(arrowGeom, new THREE.MeshBasicMaterial({ color: 0xf7e39c }), MAX_ARROWS);
  const magicBoltInst = makeInst(new THREE.SphereGeometry(0.058, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MAGIC, false, true);
  const boulderInst = makeInst(new THREE.DodecahedronGeometry(0.088, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2b }), MAX_BOULDERS);
  const fxInst = makeInst(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }), MAX_FX, false, true);

  // ── BUILD 52 GRAND COHESIVE REGIMENTS (13 PER FACTION = 1,120 LIVE TROOPS!) ─
  // Balanced medieval proportions: heavy melee core (swordsmen, knights, cavalry),
  // strong archer volleys, rare mages (2 per faction), 1 battering ram pushed by melee troops,
  // and 3 catapults per artillery battery with melee/archer escort!
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
    { role: 'vanguard', theater: 'outer-bank',   members: packMembers([['swordsman', 20], ['knight', 6]]) },
    { role: 'vanguard', theater: 'mid-bank',     members: packMembers([['swordsman', 20], ['knight', 6]]) },
    { role: 'vanguard', theater: 'flank-bridge', members: packMembers([['swordsman', 18], ['knight', 6]]) },
    { role: 'heavy',    theater: 'outer-bank',   members: packMembers([['knight', 14], ['swordsman', 8]]) },
    { role: 'heavy',    theater: 'flank-bridge', members: packMembers([['knight', 14], ['swordsman', 8]]) },
    { role: 'patrol',   theater: 'mid-bank',     members: packMembers([['swordsman', 22], ['knight', 4]]) },
    { role: 'ranged',   theater: 'outer-bank',   members: packMembers([['archer', 18], ['swordsman', 4]]) },
    { role: 'ranged',   theater: 'mid-bank',     members: packMembers([['archer', 18], ['swordsman', 4]]) },
    { role: 'ranged',   theater: 'flank-bridge', members: packMembers([['archer', 16], ['swordsman', 4], ['mage', 1]]) },
    { role: 'cavalry',  theater: 'outer-bank',   members: packMembers([['cavalry', 18]]) },
    { role: 'outrider', theater: 'deep-raider',  members: packMembers([['cavalry', 16], ['mage', 1]]) },
    // 1 Siege Battering Ram pushed & escorted closely by 18 melee troops!
    { role: 'siege',    theater: 'mid-bank',     members: packMembers([['siege', 1], ['swordsman', 14], ['knight', 4]]) },
    // 3 Catapults per battery guarded by a melee & archer screen!
    { role: 'catapult', theater: 'flank-bridge', members: packMembers([['catapult', 3], ['swordsman', 10], ['archer', 2]]) },
    // Combat Engineer Company: 5 Builders + 10 Swordsmen escort building frontier barricades & archer watchtowers!
    { role: 'engineer', theater: 'mid-bank',     members: packMembers([['builder', 5], ['swordsman', 10]]) },
  ];

  // Live Player/Faction Frontier Fortifications (Barricades & Archer Watchtowers)
  const structures = [];
  const facBuildCd = [2.5, 4.0, 5.5, 7.0]; // staggered initial fortification starts!
  const MAX_FAC_BARRICADES = 6;
  const MAX_FAC_TOWERS = 3;

  const pickSquadGoal = (faction, squad) => {
    // Engineers patrol frontier battle edges & damaged friendly fortifications!
    if (squad.role === 'engineer') {
      const dmgStruct = structures.find(s => s.team === faction.id && (s.buildProg < 1 || s.hp < s.maxHp * 0.95));
      if (dmgStruct) return [dmgStruct.x, dmgStruct.z];
      const spot = territory?.pickFortifySpot?.(faction.id, structures);
      if (spot) return [spot.x, spot.z];
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
      const dynDef = territory.pickDefenseTarget(faction.id);
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
        members: [],
      };
      const [gx, gz] = pickSquadGoal(fac, squad);
      squad.goalX = gx;
      squad.goalZ = gz;
      squad.heading = Math.atan2(gx - initX, gz - initZ);

      const cols = Math.ceil(Math.sqrt(tpl.members.length));
      const spacing = tpl.role === 'cavalry' || tpl.role === 'outrider' ? 0.40 : 0.27;
      let catIdx = 0;
      let escortIdx = 0;
      tpl.members.forEach((type, mIdx) => {
        let fx = 0;
        let fz = 0;
        if (tpl.role === 'siege') {
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

  const spawnFX = (x, y, z, colorHex, maxScale, duration) => {
    if (effects.length >= MAX_FX) effects.shift();
    effects.push({ x, y, z, color: colorHex, maxScale, age: 0, duration });
  };

  const aliveByTeam = [295, 295, 295, 295];
  const totalByTeam = [0, 0, 0, 0];
  const effTeamPower = [1.46, 0.98, 0.70, 1.06];
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
    // Balanced Siege Counter-System: Catapults (6.5x) & Battering Rams (7.5x) demolish towers & barricades,
    // while regular infantry (0.55x) & arrows (0.18x) chip away much slower!
    const mult = attackerType === 'siege' ? 7.5
      : attackerType === 'catapult' ? 6.5
      : attackerType === 'mage' ? 1.25
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
    if (!u.alive) return;
    releaseArcherFromTower(u);
    u.alive = false;
    // Surging factions reinforce swiftly while weakened factions take longer — unless they hit Last-Stand (<45%)!
    const pwr = effTeamPower[u.team] || 1.0;
    const aliveFrac = aliveByTeam[u.team] / Math.max(1, totalByTeam[u.team]);
    const baseWait = aliveFrac < 0.45 ? 3.8 : pwr > 1.20 ? 4.4 : pwr < 0.84 ? 10.2 : 6.8;
    u.respawnWait = baseWait + aRand() * 4.5;
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
      horseCoat: u.horseCoat,
      age: 0,
      maxAge: 22.0,
    });
  };

  const provokeVictim = (victim, attacker) => {
    if (!victim || !victim.alive || !attacker || !attacker.alive || victim.team === attacker.team) return;
    victim.provokedBy = attacker;
    victim.provokeTimer = 8.0;
    // Only rally the entire squad if the attacker is actually fighting near the squad's own front
    // (prevents a stray reinforcement getting hit near the middle from pulling a far-left/right regiment off its flank!)
    const sqDist = Math.hypot(attacker.x - victim.squad.x, attacker.z - victim.squad.z);
    if (sqDist < 7.5) {
      victim.squad.provokedBy = attacker;
      victim.squad.provokeTimer = 7.5;
    }
  };

  const applyDamage = (target, dmg, splash = 0, attackerTeam = -1, attacker = null) => {
    const atkType = attacker?.type || 'swordsman';
    if (splash > 0) {
      const rSq = splash * splash;
      // Fast O(1) spatial-grid splash lookup instead of scanning all 1,180 units!
      const cx0 = Math.floor(target.x / CELL_SZ);
      const cz0 = Math.floor(target.z / CELL_SZ);
      const cellRad = Math.ceil(splash / CELL_SZ);
      for (let gx = cx0 - cellRad; gx <= cx0 + cellRad; gx++) {
        for (let gz = cz0 - cellRad; gz <= cz0 + cellRad; gz++) {
          const bucket = grid.get(cellKey(gx, gz));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const other = bucket[b];
            if (!other.alive || other.team === attackerTeam) continue;
            const dx = other.x - target.x;
            const dz = other.z - target.z;
            const dSq = dx * dx + dz * dz;
            if (dSq <= rSq) {
              const falloff = 1 - Math.sqrt(dSq) / (splash * 1.25);
              const coverMult = other.garrisonTower ? 0.35 : 1.0;
              other.hp -= dmg * Math.max(0.35, falloff) * coverMult;
              if (other.hp <= 0) killUnit(other);
              else provokeVictim(other, attacker);
            }
          }
        }
      }
      // Catapult boulders & siege splash also smash nearby enemy barricades & watchtowers!
      for (let si = structures.length - 1; si >= 0; si--) {
        const s = structures[si];
        if (!s.alive || s.team === attackerTeam) continue;
        const sd = Math.hypot(s.x - target.x, s.z - target.z);
        if (sd <= splash + 0.95) {
          damageStructure(s, dmg, atkType, attacker);
        }
      }
      return;
    }
    if (!target || !target.alive) return;
    if (target.isStructure) {
      damageStructure(target, dmg, atkType, attacker);
      return;
    }
    const coverMult = target.garrisonTower ? 0.35 : 1.0;
    target.hp -= dmg * coverMult;
    if (target.hp <= 0) killUnit(target);
    else provokeVictim(target, attacker);
  };

  // Fast 2D spatial grid hash so 456+ units search nearby enemies in <0.3ms per frame!
  const CELL_SZ = 3.0;
  const grid = new Map();
  const cellKey = (cx, cz) => ((cx + 64) << 8) | (cz + 64);

  // Reusable scratch transforms & colors (ZERO allocations per frame!)
  const dummy = new THREE.Object3D();
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

    // Rebuild fast spatial grid & count live forces per faction
    grid.clear();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      aliveByTeam[u.team]++;
      const k = cellKey(Math.floor(u.x / CELL_SZ), Math.floor(u.z / CELL_SZ));
      let bucket = grid.get(k);
      if (!bucket) { bucket = []; grid.set(k, bucket); }
      bucket.push(u);
    }
    // Automatic Heroic Last-Stand rubber-band if any team dips below 48% alive (no team can ever be wiped out!)
    for (let tm = 0; tm < 4; tm++) {
      const frac = aliveByTeam[tm] / Math.max(1, totalByTeam[tm]);
      const lastStand = frac < 0.48 ? (0.48 - frac) * 1.65 : 0;
      effTeamPower[tm] = Math.min(1.72, REALM_TIDE.power[tm] + lastStand);
    }

    // 1. Update Squad Rally Movement, Provocation Retaliation, 3-Bridge Crossing & Respawning
    for (const sq of squads) {
      let aliveCount = 0;
      let sumX = 0;
      let sumZ = 0;
      for (const u of sq.members) {
        if (u.alive) {
          aliveCount++;
          sumX += u.x;
          sumZ += u.z;
        } else {
          u.respawnWait -= dt;
        }
      }

      if (aliveCount === 0) {
        // Deploy the refreshed regiment anywhere across its faction's currently owned territory (far left, right, north, or south!)
        const [spX, spZ] = getTerritorySpawn(sq.faction);
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
      } else {
        for (const u of sq.members) {
          if (!u.alive && u.respawnWait <= 0) {
            const st = UNIT_STATS[u.type];
            u.alive = true;
            u.hp = st.hp;
            u.provokedBy = null;
            u.provokeTimer = 0;
            // Spawn reinforcements at a safe owned territory spot in the squad's own sector of the map!
            const [rX, rZ] = getTerritorySpawn(sq.faction, sq.x, sq.z);
            const [ux, uz] = keepOnPassableLand(rX + (aRand() - 0.5) * 1.4, rZ + (aRand() - 0.5) * 1.4, rX, rZ);
            u.x = ux;
            u.z = uz;
            u.cd = aRand() * st.cd;
          }
        }
      }

      // If provoked by an enemy attack, rally the entire squad straight toward whoever attacked them!
      if (sq.provokeTimer > 0) {
        sq.provokeTimer -= dt;
        if (!sq.provokedBy || !sq.provokedBy.alive || sq.provokeTimer <= 0) {
          sq.provokedBy = null;
          sq.provokeTimer = 0;
        } else {
          sq.goalX = sq.provokedBy.x;
          sq.goalZ = sq.provokedBy.z;
        }
      } else {
        sq.retargetTimer -= dt;
        const goalDist = Math.hypot(sq.goalX - sq.x, sq.goalZ - sq.z);
        if (goalDist < 2.2 || sq.retargetTimer <= 0) {
          const [gx, gz] = pickSquadGoal(sq.faction, sq);
          sq.goalX = gx;
          sq.goalZ = gz;
          sq.retargetTimer = 14 + aRand() * 12;
        }
      }

      // Clean 3-bridge crossing state machine (lines up on bridge centerline first -> marches straight across!)
      const nav = steerAcrossRiver(sq.x, sq.z, sq.goalX, sq.goalZ);
      sq.isCrossing = nav.crossing;

      // Only gently re-center banner on centroid when NOT actively crossing a bridge (never pull back off bridge!)
      if (!sq.isCrossing && aliveCount > 0) {
        sq.x += (sumX / aliveCount - sq.x) * Math.min(1, dt * 0.9);
        sq.z += (sumZ / aliveCount - sq.z) * Math.min(1, dt * 0.9);
      }

      const dX = nav.x - sq.x;
      const dZ = nav.z - sq.z;
      const dLen = Math.hypot(dX, dZ);
      if (dLen > 0.22) {
        const spd = (sq.role === 'cavalry' || sq.role === 'outrider') ? 0.62 : (sq.role === 'siege' || sq.role === 'catapult') ? 0.27 : 0.40;
        const step = Math.min(dLen, spd * dt);
        const [nx, nz] = keepOnPassableLand(sq.x + (dX / dLen) * step, sq.z + (dZ / dLen) * step, sq.x, sq.z);
        sq.x = nx;
        sq.z = nz;
        sq.heading = Math.atan2(dX, dZ);
      }
    }

    // 1B. Manage Faction Fortification Cooldowns & Spawn New Barricade/Watchtower Sites on High-Heat Frontier Edges!
    for (let tm = 0; tm < 4; tm++) {
      facBuildCd[tm] = Math.max(0, facBuildCd[tm] - dt);
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
        if (underConstruction === 0 && (barCount < MAX_FAC_BARRICADES || towCount < MAX_FAC_TOWERS)) {
          const spot = territory.pickFortifySpot(tm, structures);
          if (spot) {
            const wantTower = towCount < MAX_FAC_TOWERS && (barCount >= towCount * 2 || barCount >= MAX_FAC_BARRICADES);
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
              hp: maxHp * 0.25,
              maxHp,
              buildProg: 0.12,
              garrison: kind === 'tower' ? [null, null] : null,
            };
            structures.push(sObj);
            facBuildCd[tm] = 11.0 + aRand() * 7.0;
            // Send this faction's Engineer Company straight to the new construction site!
            const engSq = squads.find(sq => sq.team === tm && sq.role === 'engineer');
            if (engSq) {
              engSq.goalX = spot.x;
              engSq.goalZ = spot.z;
              engSq.retargetTimer = 18.0;
            }
          } else {
            facBuildCd[tm] = 4.0;
          }
        } else {
          facBuildCd[tm] = 5.0;
        }
      }
    }

    // 2. Individual Unit AI: Builders Fortify & Repair, Archers Climb Watchtowers, Siege Smashes Defenses!
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const st = UNIT_STATS[u.type];
      u.cd = Math.max(0, u.cd - dt);
      u.swing = Math.max(0, u.swing - dt * 1.85);
      if (u.provokeTimer > 0) {
        u.provokeTimer -= dt;
        if (!u.provokedBy || !u.provokedBy.alive || u.provokeTimer <= 0) {
          u.provokedBy = null;
          u.provokeTimer = 0;
        }
      }
      if (u.type === 'catapult') {
        u.armPitch += (-0.25 - u.armPitch) * Math.min(1, dt * 2.0);
      }

      // 2A. BUILDER UNIT AI: Construct new frontier barricades/towers & repair damaged friendly structures!
      if (u.type === 'builder') {
        let workTarget = null;
        let bestWorkDist = 22.0;
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || s.team !== u.team) continue;
          if (s.buildProg >= 1 && s.hp >= s.maxHp - 1) continue;
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
            if (workTarget.buildProg < 1) {
              workTarget.buildProg = Math.min(1, workTarget.buildProg + dt * 0.22);
              workTarget.hp = Math.min(workTarget.maxHp, workTarget.hp + workTarget.maxHp * dt * 0.18);
            } else {
              workTarget.hp = Math.min(workTarget.maxHp, workTarget.hp + dt * 36.0);
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
          if (!tw.alive || tw.team !== u.team) {
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
                  if (o.team === u.team) continue;
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
      const aggroR = u.type === 'catapult' ? 6.2 : (u.type === 'archer' || u.type === 'mage') ? 3.95 : 2.15;
      let best = null;
      let bestDistSq = aggroR * aggroR;

      // SIEGE & CATAPULT PRIORITY: Actively hunt and demolish enemy Watchtowers & Barricades!
      if (u.type === 'catapult' || u.type === 'siege') {
        const structScanR = u.type === 'catapult' ? 12.5 : 10.5;
        let bestStruct = null;
        let bestStructDSq = structScanR * structScanR;
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || s.team === u.team) continue;
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

      if (!best) {
        const cx0 = Math.floor(u.x / CELL_SZ);
        const cz0 = Math.floor(u.z / CELL_SZ);
        const cellRad = Math.ceil(aggroR / CELL_SZ);
        for (let gx = cx0 - cellRad; gx <= cx0 + cellRad; gx++) {
          for (let gz = cz0 - cellRad; gz <= cz0 + cellRad; gz++) {
            const bucket = grid.get(cellKey(gx, gz));
            if (!bucket) continue;
            for (let b = 0; b < bucket.length; b++) {
              const o = bucket[b];
              if (o.team === u.team) continue;
              // Ground melee cannot strike archers elevated atop a watchtower — they must smash the tower first!
              if (o.garrisonTower && u.type !== 'archer' && u.type !== 'mage' && u.type !== 'catapult') continue;
              const dx = o.x - u.x;
              const dz = o.z - u.z;
              const dSq = dx * dx + dz * dz;
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                best = o;
              }
            }
          }
        }
      }

      // Check if an enemy Barricade or Watchtower is directly blocking this melee unit's path!
      if (!best && u.type !== 'archer' && u.type !== 'mage') {
        for (let si = 0; si < structures.length; si++) {
          const s = structures[si];
          if (!s.alive || s.team === u.team) continue;
          const dSq = (s.x - u.x) * (s.x - u.x) + (s.z - u.z) * (s.z - u.z);
          if (dSq < 2.25 * 2.25) {
            best = s;
            bestDistSq = dSq;
            break;
          }
        }
      }

      // If no enemy is right next to us, check if we (or our squad) were PROVOKED by an attacker!
      const provoker = (u.provokedBy && u.provokedBy.alive)
        ? u.provokedBy
        : (u.squad.provokedBy && u.squad.provokedBy.alive ? u.squad.provokedBy : null);
      if (!best && provoker && (!provoker.garrisonTower || u.type === 'archer' || u.type === 'mage' || u.type === 'catapult')) {
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
        const effRange = best.isStructure ? Math.max(st.range, u.type === 'siege' ? 1.45 : u.type === 'catapult' ? 6.0 : 1.15) : st.range;

        if (dist <= effRange) {
          shouldMove = false;
          if (u.cd <= 0) {
            const teamPwr = effTeamPower[u.team] || 1.0;
            const scaledDmg = st.dmg * teamPwr;
            u.cd = st.cd * (0.88 + aRand() * 0.28);
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
                  dmg: scaledDmg, target: best, color: 0xf7e39c,
                });
              }
            } else if (u.type === 'mage') {
              projectiles.push({
                kind: 'magic',
                team: u.team,
                attacker: u,
                sx: u.x, sy: armyGroundY(u.x, u.z) + 0.22, sz: u.z,
                tx: best.x, ty: armyGroundY(best.x, best.z) + 0.14, tz: best.z,
                arc: 0.48 + dist * 0.06,
                t: 0, dur: Math.max(0.92, dist / 2.8),
                dmg: scaledDmg, splash: 0.75, target: best, color: u.faction.magic,
              });
            } else if (u.type === 'catapult') {
              u.armPitch = 1.25;
              projectiles.push({
                kind: 'boulder',
                team: u.team,
                attacker: u,
                sx: u.x, sy: armyGroundY(u.x, u.z) + 0.34, sz: u.z,
                tx: best.x + (aRand() - 0.5) * 0.38, ty: armyGroundY(best.x, best.z) + (best.isStructure ? 0.42 : 0.06), tz: best.z + (aRand() - 0.5) * 0.38,
                arc: 2.3 + dist * 0.22,
                t: 0, dur: Math.max(1.75, dist / 2.3),
                dmg: scaledDmg, splash: 1.45, target: best, color: 0xff7e24,
              });
            } else {
              // Close-quarters melee / battering ram slam (battering rams devastate fortifications!)
              applyDamage(best, scaledDmg, u.type === 'siege' && !best.isStructure ? 0.85 : 0, u.team, u);
              if (aRand() > 0.38) {
                spawnFX((u.x + best.x) * 0.5, armyGroundY(u.x, u.z) + 0.16, (u.z + best.z) * 0.5, u.type === 'siege' ? 0xffae42 : 0xfff0b0, u.type === 'siege' ? 0.95 : 0.42, 0.36);
              }
            }
          }
        } else if (u.type !== 'catapult' || best === provoker || best.isStructure) {
          // Charge directly toward close enemy, provoked attacker, or enemy tower/barricade!
          moveToX = best.x;
          moveToZ = best.z;
        }
      }

      if (shouldMove) {
        const uNav = steerAcrossRiver(u.x, u.z, moveToX, moveToZ);
        const dx = uNav.x - u.x;
        const dz = uNav.z - u.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const step = Math.min(d, st.speed * dt);
          let [nx, nz] = keepOnPassableLand(u.x + (dx / d) * step, u.z + (dz / d) * step, u.x, u.z);
          // Physical Enemy Barricade Collision: completed enemy barricades block enemy melee & cavalry!
          for (let si = 0; si < structures.length; si++) {
            const s = structures[si];
            if (!s.alive || s.team === u.team || s.buildProg < 0.5) continue;
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
          u.stridePhase += dt * (u.type === 'cavalry' ? 5.0 : 3.8);
        }
      }
    }

    // 3. Advance Flying Projectiles (Arrows, Arcane Spells, Catapult Boulders — provoke victims on hit!)
    let arrowC = 0, magicC = 0, boulderC = 0;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.t += dt / pr.dur;
      if (pr.t >= 1) {
        if (pr.kind === 'boulder') {
          applyDamage({ x: pr.tx, z: pr.tz }, pr.dmg, pr.splash, pr.team, pr.attacker);
          spawnFX(pr.tx, pr.ty + 0.14, pr.tz, 0xff7722, 2.35, 0.85);
          spawnFX(pr.tx, pr.ty + 0.30, pr.tz, 0xffe082, 1.45, 0.58);
        } else if (pr.kind === 'magic') {
          applyDamage({ x: pr.tx, z: pr.tz }, pr.dmg, pr.splash, pr.team, pr.attacker);
          spawnFX(pr.tx, pr.ty + 0.12, pr.tz, pr.color, 1.35, 0.56);
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

      if (pr.kind === 'arrow' && arrowC < MAX_ARROWS) {
        const p2 = Math.min(1, p + 0.04);
        const nx = pr.sx + (pr.tx - pr.sx) * p2;
        const nz = pr.sz + (pr.tz - pr.sz) * p2;
        const ny = pr.sy + (pr.ty - pr.sy) * p2 + Math.sin(p2 * Math.PI) * pr.arc;
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(1);
        dummy.lookAt(nx, ny, nz);
        dummy.updateMatrix();
        arrowInst.setMatrixAt(arrowC++, dummy.matrix);
      } else if (pr.kind === 'magic' && magicC < MAX_MAGIC) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.9 + Math.sin(t * 18 + i) * 0.25);
        dummy.updateMatrix();
        magicBoltInst.setMatrixAt(magicC, dummy.matrix);
        cTmp.setHex(pr.color);
        magicBoltInst.setColorAt(magicC, cTmp);
        magicC++;
      } else if (pr.kind === 'boulder' && boulderC < MAX_BOULDERS) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(t * 7 + i, t * 5, 0);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        boulderInst.setMatrixAt(boulderC++, dummy.matrix);
      }
    }
    arrowInst.count = arrowC;
    magicBoltInst.count = magicC;
    boulderInst.count = boulderC;
    arrowInst.instanceMatrix.needsUpdate = true;
    magicBoltInst.instanceMatrix.needsUpdate = true;
    if (magicBoltInst.instanceColor) magicBoltInst.instanceColor.needsUpdate = true;
    boulderInst.instanceMatrix.needsUpdate = true;

    // 4. Advance Combat Impact Sparks, Magic Bursts & Catapult Explosions
    let fxC = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      fx.age += dt;
      if (fx.age >= fx.duration) {
        effects.splice(i, 1);
        continue;
      }
      if (fxC < MAX_FX) {
        const frac = fx.age / fx.duration;
        const sc = fx.maxScale * (0.35 + Math.sin(frac * Math.PI) * 0.85);
        dummy.position.set(fx.x, fx.y + frac * 0.25, fx.z);
        dummy.rotation.set(frac * 3, frac * 2, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        fxInst.setMatrixAt(fxC, dummy.matrix);
        cTmp.setHex(fx.color);
        fxInst.setColorAt(fxC, cTmp);
        fxC++;
      }
    }
    fxInst.count = fxC;
    fxInst.instanceMatrix.needsUpdate = true;
    if (fxInst.instanceColor) fxInst.instanceColor.needsUpdate = true;

    // 5. Render All Live Units, Detailed Armor/Cavalry/Builders, Fortifications & 30-Second Fallen Bodies!
    let pC = 0, hC = 0, wC = 0, shC = 0, orbC = 0, horseC = 0, ramC = 0, catC = 0, knC = 0, archC = 0;
    let swC = 0, cavC = 0, bldC = 0;

    for (const u of units) {
      if (!u.alive) continue;
      const baseGy = armyGroundY(u.x, u.z);
      const gy = u.garrisonTower ? armyGroundY(u.garrisonTower.x, u.garrisonTower.z) + 0.90 : baseGy;
      const st = UNIT_STATS[u.type];
      const bob = u.garrisonTower ? 0 : Math.abs(Math.sin(u.stridePhase)) * (u.type === 'cavalry' ? 0.032 : 0.018);

      if (u.type === 'siege') {
        if (ramC < MAX_SIEGE) {
          dummy.position.set(u.x, gy, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          ramHullInst.setMatrixAt(ramC, dummy.matrix);
          ramTrimInst.setMatrixAt(ramC, dummy.matrix);
          cTmp.setHex(u.faction.primary);
          ramTrimInst.setColorAt(ramC, cTmp);

          const lunge = Math.sin(u.swing * Math.PI) * 0.18;
          dummy.position.set(u.x + Math.sin(u.heading) * (0.14 + lunge), gy + 0.14, u.z + Math.cos(u.heading) * (0.14 + lunge));
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
          dummy.position.set(u.x, gy, u.z);
          dummy.rotation.set(0, u.heading, 0);
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

      const riderLift = u.type === 'cavalry' ? 0.15 : 0;
      const sinH = Math.sin(u.heading);
      const cosH = Math.cos(u.heading);

      // Detailed Sculpted Medieval Warhorse + Heraldic Caparison Barding!
      if (u.type === 'cavalry' && horseC < MAX_HORSES) {
        dummy.position.set(u.x, gy + 0.12 + bob, u.z);
        dummy.rotation.set(Math.sin(u.stridePhase) * 0.085, u.heading, 0);
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

      // Humanoid body & head
      if (pC < MAX_PERSONS) {
        const sc = st.scale;
        dummy.position.set(u.x, gy + riderLift + bob, u.z);
        dummy.rotation.set(0, u.heading, 0);
        dummy.scale.set(u.type === 'knight' ? sc * 1.15 : sc, sc, u.type === 'knight' ? sc * 1.15 : sc);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(pC, dummy.matrix);
        if (u.type === 'knight') {
          cTmp.setHex(u.faction.primary).lerp(cSteel, 0.35);
        } else if (u.type === 'mage') {
          cMagic.setHex(u.faction.magic);
          cTmp.setHex(u.faction.primary).lerp(cMagic, 0.28);
        } else if (u.type === 'archer') {
          cTmp.setHex(u.faction.primary).lerp(cHood, 0.38);
        } else if (u.type === 'builder') {
          cTmp.setHex(u.faction.primary).lerp(cWood, 0.35);
        } else {
          cTmp.setHex(u.faction.primary);
        }
        bodyInst.setColorAt(pC, cTmp);

        // Head / Helmet / Hood
        dummy.position.set(u.x, gy + riderLift + bob + 0.185 * sc, u.z);
        dummy.rotation.set(0, u.heading, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        headInst.setMatrixAt(hC, dummy.matrix);
        headInst.setColorAt(hC, u.type === 'knight' || u.type === 'cavalry' ? cHelm : u.type === 'archer' ? cHood : u.type === 'mage' ? cTmp : cSkin);
        pC++;
        hC++;

        // Detailed Swordsman Steel Kettle-Helm, Shoulder Spaulders & Leather Cross-Harness!
        if (u.type === 'swordsman' && swC < MAX_SWORDSMEN) {
          dummy.position.set(u.x, gy + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          swordsmanHelmInst.setMatrixAt(swC, dummy.matrix);
          swordsmanTrimInst.setMatrixAt(swC, dummy.matrix);
          swC++;
        }

        // Detailed Cavalry Rider Visored Sallet Helm, Couched Jousting Lance & Faction Pennon!
        if (u.type === 'cavalry' && cavC < MAX_HORSES) {
          dummy.position.set(u.x, gy + riderLift + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          cavalryGearInst.setMatrixAt(cavC, dummy.matrix);
          cavalryPennonInst.setMatrixAt(cavC, dummy.matrix);
          cTmp.setHex(u.faction.accent);
          cavalryPennonInst.setColorAt(cavC, cTmp);
          cavC++;
        }

        // Combat Engineer / Builder Cap, Apron, Satchel & Swinging Carpenter Mallet!
        if (u.type === 'builder' && bldC < MAX_BUILDERS) {
          dummy.position.set(u.x, gy + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          builderGearInst.setMatrixAt(bldC, dummy.matrix);

          const rx = cosH * 0.058 * sc;
          const rz = -sinH * 0.058 * sc;
          const hammerPitch = 0.25 + Math.sin(u.swing * Math.PI) * 1.45;
          dummy.position.set(u.x + rx, gy + bob + 0.115 * sc, u.z + rz);
          dummy.rotation.set(hammerPitch, u.heading, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          builderHammerInst.setMatrixAt(bldC, dummy.matrix);
          bldC++;
        }

        // Armored Knight Plate Breastplate, Broad Pauldrons, Steel Great Helm & Faction Plume!
        if (u.type === 'knight' && knC < MAX_KNIGHTS) {
          dummy.position.set(u.x, gy + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
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

        // Right-hand Weapon (Detailed Crossguard Broadsword or Arcane Staff — Cavalry/Archers/Builders use dedicated gear!)
        if (u.type !== 'archer' && u.type !== 'cavalry' && u.type !== 'builder' && wC < MAX_PERSONS) {
          const rx = cosH * 0.055 * sc;
          const rz = -sinH * 0.055 * sc;
          const slashPitch = 0.25 + Math.sin(u.swing * Math.PI) * 1.15;
          dummy.position.set(u.x + rx, gy + riderLift + bob + 0.11 * sc, u.z + rz);
          dummy.rotation.set(slashPitch, u.heading, 0);
          dummy.scale.set(u.type === 'knight' ? 1.32 : 1.05, u.type === 'mage' ? 1.35 : u.type === 'knight' ? 1.22 : 1.05, 1.05);
          dummy.updateMatrix();
          weaponInst.setMatrixAt(wC, dummy.matrix);
          weaponInst.setColorAt(wC, u.type === 'mage' ? cWood : cSteel);
          wC++;
        }

        // Left-hand Detailed Medieval Heater Shield (Swordsmen, Knights, Cavalry)
        if ((u.type === 'swordsman' || u.type === 'knight' || u.type === 'cavalry') && shC < MAX_PERSONS) {
          const lx = -cosH * 0.064 * sc + sinH * 0.032;
          const lz = sinH * 0.064 * sc + cosH * 0.032;
          dummy.position.set(u.x + lx, gy + riderLift + bob + 0.105 * sc, u.z + lz);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(u.type === 'knight' ? 1.28 : 1.02);
          dummy.updateMatrix();
          shieldInst.setMatrixAt(shC, dummy.matrix);
          cTmp.setHex(u.faction.accent);
          shieldInst.setColorAt(shC, cTmp);
          shC++;
        }

        // Glowing Arcane Staff Orb for Mages
        if (u.type === 'mage' && orbC < MAX_MAGES) {
          const rx = cosH * 0.055 * sc + sinH * 0.06;
          const rz = -sinH * 0.055 * sc + cosH * 0.06;
          dummy.position.set(u.x + rx, gy + bob + 0.35 * sc, u.z + rz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.85 + u.swing * 0.75 + Math.sin(t * 8 + pC) * 0.15);
          dummy.updateMatrix();
          mageOrbInst.setMatrixAt(orbC, dummy.matrix);
          cTmp.setHex(u.faction.magic);
          mageOrbInst.setColorAt(orbC, cTmp);
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

      if (cp.type === 'cavalry' && horseC < MAX_HORSES) {
        dummy.position.set(cp.x + 0.10 * cp.fallSide, cp.y + 0.055 - sinkY, cp.z);
        dummy.rotation.set(0, cp.rotY, cp.fallSide * Math.PI * 0.48);
        dummy.scale.setScalar(0.95 * fadeOut);
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

    // 7. Render Cohesive Squad Regiment Banners with Official Faction Emblems Above Each Group
    let bC = 0;
    const teamBanCounts = [0, 0, 0, 0];
    for (const sq of squads) {
      if (bC >= MAX_BANNERS) break;
      const by = armyGroundY(sq.x, sq.z);
      dummy.position.set(sq.x, by, sq.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      banPoleInst.setMatrixAt(bC, dummy.matrix);

      const tid = sq.team & 3;
      const tIdx = teamBanCounts[tid];
      if (tIdx < banFlagInsts[tid].instanceMatrix.count) {
        dummy.position.set(sq.x, by + 0.56, sq.z);
        dummy.rotation.set(0, sq.heading + Math.sin(t * 3.8 + sq.id) * 0.22, 0);
        // Surging factions fly prouder, larger banners while besieged factions fly tighter rallying standards!
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
    mageOrbInst.count = orbC;
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
    for (let tid = 0; tid < 4; tid++) banFlagInsts[tid].count = teamBanCounts[tid];

    for (const inst of [
      bodyInst, headInst, weaponInst, shieldInst,
      swordsmanHelmInst, swordsmanTrimInst,
      knightArmorInst, knightPlumeInst, archerBowInst, archerQuiverInst,
      mageOrbInst, builderGearInst, builderHammerInst,
      horseBodyInst, horseBardingInst, cavalryGearInst, cavalryPennonInst,
      barricadeWoodInst, barricadeTrimInst, towerWoodInst, towerTrimInst,
      ramHullInst, ramTrimInst, ramBeamInst,
      catBaseInst, catTrimInst, catArmInst,
      banPoleInst, ...banFlagInsts,
    ]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  // Dragonfire chaos hook: scorches ALL 4 factions equally, scatters survivors & leaves 30-second corpses!
  function applyDragonBlast(bx, bz, radius, dmg, dragonY = 3.5) {
    const rSq = radius * radius;
    let hits = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const dx = u.x - bx;
      const dz = u.z - bz;
      const dSq = dx * dx + dz * dz;
      if (dSq <= rSq) {
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
  return { armyGroup, update, units, squads, corpses, applyDragonBlast };
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
    [-1.70, 0.72, -0.55, 1.35, 1.45, 1.55,  0.14, true],
    [ 1.70, 0.72, -0.55, 1.35, 1.45, 1.55, -0.14, false],
    [-1.18, 1.68, -0.75, 1.35, 1.05, 1.65,  0.36, false],
    [ 1.18, 1.68, -0.75, 1.35, 1.05, 1.65, -0.36, true],
    [ 0.00, 2.08, -0.92, 1.95, 0.95, 1.85,  0.03, true],
    [-2.55, 0.18, -0.10, 1.30, 0.95, 1.35,  0.22, false],
    [ 2.55, 0.18, -0.10, 1.30, 0.95, 1.35, -0.20, true],
    [ 0.00, 0.95, -1.78, 2.05, 1.35, 1.25,  0.00, true],
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
    [ 0.00, 0.08, -0.22, 1.85, 0.58, 1.35], // deep central hoard pile inside the cave mouth
    [-0.92, 0.06,  0.26, 1.15, 0.44, 0.96], // west flanking gold dune
    [ 0.94, 0.06,  0.28, 1.18, 0.46, 0.98], // east flanking gold dune
    [ 0.02, 0.02,  1.15, 1.75, 0.24, 1.32], // wide golden coin carpet right beneath the sleeping dragon!
    [-0.78, 0.02,  1.32, 0.88, 0.26, 0.78], // outer left treasure spill
    [ 0.86, 0.02,  1.24, 0.92, 0.28, 0.82], // outer right treasure spill
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
    [ 0.58, 0.24, 0.12, -0.35], [ 0.68, 0.24, 0.19, -0.32], [ 0.62, 0.24, 0.28, -0.40],
    [ 0.63, 0.30, 0.18, -0.36], [ 0.70, 0.30, 0.24, -0.28], [ 0.65, 0.36, 0.20, -0.34],
    // Scattered loose bullion bars near nest apron
    [-1.18, 0.12, 0.92, 0.85], [-1.06, 0.12, 1.04, 1.45], [-1.12, 0.18, 0.98, 1.12],
    [ 1.15, 0.12, 0.88, -0.95], [ 1.24, 0.12, 1.00, -0.45], [ 0.18, 0.22, -0.15, 0.55],
    [-0.14, 0.25, -0.28, -0.72], [ 0.04, 0.31, -0.22, 0.14],
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
  addTreasureChest(-0.96, 0.14,  0.52,  0.52, true,  0.06);
  addTreasureChest( 0.98, 0.16,  0.40, -0.68, true, -0.05);
  addTreasureChest(-0.34, 0.24, -0.26,  0.24, false, 0.14);

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
  addRoyalCrown( 0.24, 0.38, -0.14,  0.18, -0.22);
  addRoyalCrown(-0.84, 0.24,  1.06,  0.34,  0.28);

  // 5 Gilded Chalices / Goblets (some upright, some tipped on their sides in the coins!)
  const gobletSpecs = [
    [-0.46, 0.28, 0.42, 0, 0],
    [ 0.52, 0.28, 0.48, 0, 0],
    [ 1.06, 0.16, 1.12, 1.48, 0.4],
    [-0.22, 0.20, 1.56, 1.52, -0.8],
    [ 0.72, 0.22, -0.18, 0, 0],
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
    [-0.92, 0.46, 0.52], [ 0.96, 0.48, 0.40], [ 0.00, 0.46, -0.18], [ 0.42, 0.82, 0.10],
    [-0.56, 0.42, 0.16], [ 0.64, 0.42, 0.20], [-0.40, 0.24, 1.24], [ 0.68, 0.26, 1.18],
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
function mountAtlas3D() {
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
  stageEl.dataset.atlas3dMounted = '1';

  // Verify WebGL availability gracefully before switching off 2D SVG fallback
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (_err) {
    delete stageEl.dataset.atlas3dMounted;
    return; // Leave 2D SVG fallback visible
  }

  stageWrapper.classList.add('has-3d-toggle', 'is-3d-ready');
  window.TG?.atlas?.set3DActive?.(false);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
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

  // CSS2DRenderer overlay for crisp Rome II floating settlement nameplates
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'atlas-css2d-layer';
  stageEl.appendChild(labelRenderer.domElement);

  // OrbitControls clamped to campaign-map angles (cannot flip upside down or clip under terrain)
  const controls = new OrbitControls(camera, renderer.domElement);
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
  buildForests(detailGroup, farmPlots);
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
    scene.add(badgeObj);

    badgeEl.addEventListener('pointerenter', e => {
      setHoveredVenue(spec.id, e.clientX, e.clientY);
    });
    badgeEl.addEventListener('pointermove', e => {
      if (hoveredVenueId === spec.id) positionTooltip(e.clientX, e.clientY);
    });
    badgeEl.addEventListener('pointerleave', () => {
      if (hoveredVenueId === spec.id) setHoveredVenue(null);
    });
    badgeEl.addEventListener('click', e => {
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

  function updateModePill() {
    if (!modePill) return;
    modePill.setAttribute('aria-pressed', String(strategicMode));
    if (strategicMode) {
      modePill.innerHTML = '<span>2D STRATEGIC MAP</span><small>⇄ 3D</small>';
      modePill.title = 'Switch to 3D Campaign Map';
    } else {
      modePill.innerHTML = '<span>3D CAMPAIGN MAP</span><small>⇄ 2D</small>';
      modePill.title = 'Switch to 2D Illustrated Strategic Map';
    }
  }

  // Silky frame-synchronized 3D ⇄ 2D Illustrated Strategic Map transition
  function setStrategicView(enabled, { manual = false, animateCam = true } = {}) {
    const next = Boolean(enabled);
    strategicMode = next;
    if (manual) manualStrategic = next;
    setHoveredVenue(null);

    if (strategicBtn) {
      strategicBtn.setAttribute('aria-pressed', String(strategicMode));
      strategicBtn.textContent = strategicMode ? '3D Map View' : 'Strategic View';
    }
    updateModePill();
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

    atlasApi.onChange(({ selected, reason }) => {
      const changed = selected !== selectedVenueId;
      selectedVenueId = selected || null;
      refreshBadges();
      if (reason !== '3d' && reason !== 'poll' && changed && !strategicMode) {
        focusVenueCamera(selectedVenueId);
      }
    });
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

  renderer.domElement.addEventListener('pointerdown', e => {
    dragMoved = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    activeTween = null;
    zoomTargetDist = null;
    stageEl.classList.add('is-dragging');
  });

  renderer.domElement.addEventListener('pointermove', e => {
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

  renderer.domElement.addEventListener('pointerleave', () => {
    pointerDownPos = null;
    stageEl.classList.remove('is-dragging');
    setHoveredVenue(null);
  });

  window.addEventListener('pointerup', () => {
    pointerDownPos = null;
    stageEl.classList.remove('is-dragging');
  });

  renderer.domElement.addEventListener('click', e => {
    if (dragMoved || strategicMode) return;
    const hitId = pickVenueAt(e.clientX, e.clientY);
    if (hitId) {
      selectVenueFrom3D(hitId);
    }
  });

  // Capture ALL mousewheel scrolling anywhere inside the map frame (3D canvas, floating badges,
  // HUD pill, or 2D Strategic Atlas) so the page NEVER scrolls while hovering over the map!
  stageWrapper.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 140 : e.deltaY;
    if (Math.abs(delta) < 1) return;

    if (strategicMode) {
      // Scrolling IN while on the 2D Strategic Map glides smoothly back into the 3D Campaign Map
      if (delta < 0 && !blendTween) {
        manualStrategic = false;
        setStrategicView(false, { manual: false, animateCam: true });
      }
      return;
    }

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
  updateModePill();
  modePill?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    setStrategicView(!strategicMode, { manual: true, animateCam: true });
  });

  strategicBtn?.addEventListener('click', () => {
    setStrategicView(!strategicMode, { manual: true, animateCam: true });
  });

  zoomInBtn?.addEventListener('click', () => {
    if (strategicMode) return;
    activeTween = null;
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    zoomTargetDist = Math.max(controls.minDistance, currentDist * 0.78);
  });

  zoomOutBtn?.addEventListener('click', () => {
    if (strategicMode) return;
    activeTween = null;
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    zoomTargetDist = Math.min(controls.maxDistance, currentDist * 1.26);
  });

  resetBtn?.addEventListener('click', () => {
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
    if (active) isVisible = true;
    handleResize();
    requestAnimationFrame(handleResize);
  };

  const toggleFullscreen = async () => {
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

  fullscreenBtn?.addEventListener('click', e => {
    e.preventDefault();
    toggleFullscreen();
  });
  const terrPctEls = [0, 1, 2, 3].map(i => territoryBarEl?.querySelector(`[data-terr-pct="${i}"]`) || null);
  const terrBarEls = [0, 1, 2, 3].map(i => territoryBarEl?.querySelector(`[data-terr-bar="${i}"]`) || null);
  let terrHudAccum = 0;

  const updateTerritoryHud = () => {
    if (!territorySystem.isEnabled() || !territoryBarEl) return;
    const shares = territorySystem.getShares();
    const rounded = shares.map(v => Math.round(v));
    const diff = 100 - rounded.reduce((a, b) => a + b, 0);
    if (diff !== 0) {
      let maxIdx = 0;
      for (let i = 1; i < 4; i++) if (shares[i] > shares[maxIdx]) maxIdx = i;
      rounded[maxIdx] += diff;
    }
    for (let i = 0; i < 4; i++) {
      if (terrPctEls[i]) terrPctEls[i].textContent = `${rounded[i]}%`;
      if (terrBarEls[i]) terrBarEls[i].style.width = `${shares[i].toFixed(1)}%`;
    }
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

  territoryHudBtn?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    setTerritoryMode(!territorySystem.isEnabled());
  });
  fullscreenHudBtn?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen();
  });
  cinematicHudBtn?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    setCinematicClean(!cinematicClean);
  });
  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cssFullscreen) {
      cssFullscreen = false;
      syncFullscreenState();
    } else if ((e.key === 'h' || e.key === 'H') && isFullscreenActive()) {
      setCinematicClean(!cinematicClean);
    } else if ((e.key === 't' || e.key === 'T') && !strategicMode && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      setTerritoryMode(!territorySystem.isEnabled());
    }
  });

  // Responsive ResizeObserver
  const handleResize = () => {
    const w = Math.max(stageEl.clientWidth, 260);
    const h = Math.max(stageEl.clientHeight, 260);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
  };
  const resizeObs = 'ResizeObserver' in window ? new ResizeObserver(handleResize) : null;
  resizeObs?.observe(stageEl);
  window.addEventListener('resize', handleResize);

  // Pause rendering when scrolled off-screen to save GPU (always stays active in fullscreen!)
  let isVisible = true;
  const visObs = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        isVisible = entries[0].isIntersecting || isFullscreenActive();
      }, { threshold: 0.02 })
    : null;
  visObs?.observe(stageEl);

  // Graceful WebGL context recovery & clean teardown on page refresh (prevents refresh lag/hang!)
  let contextLost = false;
  let rafId = 0;
  let disposed = false;

  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    contextLost = true;
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    handleResize();
  }, false);

  const cleanupWebGL = () => {
    if (disposed) return;
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    resizeObs?.disconnect();
    visObs?.disconnect();
    controls.dispose();
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          if (m.bumpMap) m.bumpMap.dispose();
          if (m.normalMap) m.normalMap.dispose();
          m.dispose();
        }
      }
    });
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (_e) {}
  };
  window.addEventListener('pagehide', cleanupWebGL, { once: true });
  window.addEventListener('beforeunload', cleanupWebGL, { once: true });

  // ── 8. ANIMATION LOOP ──────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let shadowFrameTick = 0;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    if ((!isVisible && !isFullscreenActive()) || document.hidden || webglPaused || contextLost) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // 1. Camera Tween (quartic ease-in-out for 3D↔2D swoops, cubic ease-out for venue focus)
    if (activeTween) {
      const p = Math.min(1, (performance.now() - activeTween.startTime) / activeTween.duration);
      const ease = activeTween.easeMode === 'inout' ? easeInOutQuart(p) : 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(activeTween.fromPos, activeTween.toPos, ease);
      controls.target.lerpVectors(activeTween.fromTarget, activeTween.toTarget, ease);
      if (p >= 1) activeTween = null;
    } else if (zoomTargetDist !== null) {
      zoomOffset.copy(camera.position).sub(controls.target);
      const cur = zoomOffset.length();
      const next = cur + (zoomTargetDist - cur) * Math.min(1, dt * 11);
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
      const bp = Math.min(1, (performance.now() - blendTween.startTime) / blendTween.duration);
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

    controls.update();

    // Clamp pan target inside campaign borders (wider cinematic pan range in Fullscreen!)
    const panX = isFullscreenActive() ? 24 : 18;
    const panZ = isFullscreenActive() ? 18 : 14;
    controls.target.x = Math.max(-panX, Math.min(panX, controls.target.x));
    controls.target.z = Math.max(-panZ, Math.min(panZ, controls.target.z));
    controls.target.y = Math.max(0, Math.min(2.2, controls.target.y));

    // Continuous zoom-out preview blend near max distance -> allows wide panoramic 3D view before morphing into 2D Strategic Atlas!
    const camDist = camera.position.distanceTo(controls.target);
    if (!activeTween && !blendTween && !strategicMode) {
      if (camDist >= 72.0) {
        setStrategicView(true, { manual: false, animateCam: true });
      } else if (camDist > 62.0) {
        const preBlend = smoothstep(62.0, 72.2, camDist) * 0.36;
        applyStrategicBlend(preBlend);
      } else if (strategicBlend > 0) {
        applyStrategicBlend(Math.max(0, strategicBlend - dt * 3.5));
      }
    }

    // 2. Animate Fluttering Venue Pennants, Flickering Embers & Territory Ring Pulse
    if (!reducedMotion.matches) {
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

      // Live Total War miniature army battle simulation (4 venue teams, 8 unit classes, fortifications, 30s corpses!)
      if (armies) {
        armies.update(dt, t);
        territorySystem.update(dt, t, armies.units);
        countryside.syncTerritoryColors?.(territorySystem, dt, t);
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
    }

    // Re-bake dynamic shadow map every 2nd frame (~30Hz shadow pass -> cuts GPU vertex cost in half with identical visuals!)
    if ((++shadowFrameTick & 1) === 0) {
      renderer.shadowMap.needsUpdate = true;
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  animate();
}

// Defer WebGL initialization by one paint frame so browser refreshes never freeze the page UI!
const scheduleMount = () => requestAnimationFrame(() => mountAtlas3D());
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
} else {
  scheduleMount();
}
