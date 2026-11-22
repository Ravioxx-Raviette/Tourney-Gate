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

// Coordinates aligned 1:1 with the 2D Illustrated Atlas landmarks (32%/33%, 73%/38%, 66%/73%, 23%/70%)
// when viewed top-down from STRATEGIC_CAM so 3D models literally rise out of & blend into their 2D drawings!
const VENUE_SPECS = [
  {
    id: 1,
    slug: 'silver-lance',
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
    badgeY: 2.45,
    parchmentColor: '#a67b45',
    camOffset: [-3.4, 10.8, 13.2],
  },
];

const OVERVIEW_CAM = { pos: [0.0, 27.5, 29.5], target: [0.0, 0.2, 0.8] };
const STRATEGIC_CAM = { pos: [0.0, 66.0, 0.08], target: [0.0, 0.0, 0.0] };
const BRIDGE_Z = 0.86;
const NORTH_BRIDGE_Z = -9.6;
const SOUTH_BRIDGE_Z = 10.6;

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
function terrainHeight(x, z) {
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
  const bmN = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, 0.20);
  const bmS = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, 0.20);
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

  // Fine organic terrain soil, grass blades, pebbles & rock grain
  for (let i = 0; i < 16000; i++) {
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
  for (const offset of [-1.25, 1.25]) {
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
    const snowMask = Math.min(1, Math.max(snowByHigh * (1 - smootherstep(0.24, 0.52, slope) * 0.72), snowCrown * 0.92));
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

  return { terrainMesh, terrainGeom: geom, baseHeights, river };
}

// Shared bridge transform & smooth arched road-surface height for any river crossing (Central, North & South)
function getBridgeMetrics(bz = BRIDGE_Z, span = 6.2, archRise = 0.22) {
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

  // Arched stone bridge roadway deck with curved undersides over the water & deep abutment roots in the banks
  const deckMesh = makeArchedStrip(
    -halfSpan - 0.55,
    halfSpan + 0.55,
    28,
    0.92,
    x => bm.deckTopY(x),
    x => {
      const ax = Math.abs(x);
      // Deep solid stone abutments rooted cleanly into both embankments beyond |x| > 2.2
      if (ax > 2.15) return -0.55;
      // Graceful triple-arch underside profile over the flowing river channel
      const centerArch = Math.max(0, Math.cos((x / 1.35) * Math.PI * 0.5)) * 0.28;
      const sideArch = Math.max(0, Math.cos(((ax - 1.75) / 0.65) * Math.PI * 0.5)) * 0.16;
      return bm.deckTopY(x) - 0.36 + centerArch + sideArch;
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
      const pierH = topY + 0.42;
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
  const roofCrimson = new THREE.MeshStandardMaterial({ color: 0x8f2731, roughness: 0.72 });
  for (const endX of [-halfSpan - 0.15, halfSpan + 0.15]) {
    const baseTop = bm.deckTopY(endX);
    for (const side of [-0.98, 0.98]) {
      const turretH = 1.45;
      const turretTop = baseTop + 1.12;
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, turretH, 10), stoneMat);
      turret.position.set(endX, turretTop - turretH / 2, side);
      turret.castShadow = true;
      bridge.add(turret);

      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.60, 10), roofCrimson);
      spire.position.set(endX, turretTop + 0.28, side);
      spire.castShadow = true;
      bridge.add(spire);
    }
  }

  // Two stone river piers supporting the central arch down to the riverbed
  for (const px of [-1.35, 1.35]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.42, 1.98), darkStone);
    leg.position.set(px, -0.22, 0);
    leg.castShadow = true;
    bridge.add(leg);
  }

  parent.add(bridge);

  // Add 2 smaller rustic stone-and-timber arched bridges on the North & South river reaches
  // so all 4 faction territories have spacious flanking crossings across River Willowmere!
  const timberRailMat = new THREE.MeshStandardMaterial({ color: 0x694a2d, roughness: 0.88 });
  const buildSmallerBridge = (bz, span) => {
    const sm = getBridgeMetrics(bz, span, 0.20);
    const sb = new THREE.Group();
    sb.position.set(sm.bx, 0, bz);
    sb.rotation.y = sm.rotY;
    const hs = sm.halfSpan;
    const halfW = 0.58;

    // Curved stone-and-timber deck rooted deeply into both banks
    const sDeck = makeArchedStrip(
      -hs - 0.45,
      hs + 0.45,
      20,
      halfW,
      x => sm.deckTopY(x),
      x => {
        const ax = Math.abs(x);
        if (ax > hs * 0.68) return -0.52;
        const arch = Math.max(0, Math.cos((x / (hs * 0.68)) * Math.PI * 0.5)) * 0.26;
        return sm.deckTopY(x) - 0.32 + arch;
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
        const postH = topY + 0.35;
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

    // Compact stone river piers underneath
    for (const px of [-hs * 0.44, hs * 0.44]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.32, halfW * 2 + 0.12), darkStone);
      leg.position.set(px, -0.24, 0);
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

  // ── A. 3 ROTATING MEDIEVAL WINDMILLS & ADJACENT STONE GRANARY BARNS ────────
  for (const wm of WINDMILL_COORDS) {
    const g = new THREE.Group();
    const y = terrainHeight(wm.x, wm.z);
    g.position.set(wm.x, y, wm.z);
    g.rotation.y = wm.rotY;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.56, 1.35, 12), plasterMat);
    base.position.y = 0.64;
    base.castShadow = true;
    g.add(base);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.52, 12), roofSlate);
    cap.position.y = 1.56;
    cap.castShadow = true;
    g.add(cap);

    // 4-blade rotating sail hub
    const hub = new THREE.Group();
    hub.position.set(0, 1.24, 0.42);
    for (let b = 0; b < 4; b++) {
      const armGroup = new THREE.Group();
      armGroup.rotation.z = (b * Math.PI) / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), timberMat);
      spar.position.y = 0.52;
      armGroup.add(spar);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.02), sailCloth);
      cloth.position.set(0.11, 0.62, 0.01);
      cloth.castShadow = true;
      armGroup.add(cloth);
      hub.add(armGroup);
    }
    g.add(hub);
    spinningSails.push({ hub, speed: 0.85 + Math.abs(wm.x) * 0.02 });
    country.add(g);

    // Cozy timber-and-stone medieval granary barn right beside each windmill (like the reference!)
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
      const gable = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.36, 4), roofTerracotta);
      gable.position.y = 0.60;
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

  // ── B. 5 MINIATURE MEDIEVAL VILLAGES / HAMLETS WITH COTTAGES, SMOKE & HAY ──
  const hamlets = [
    { cx: -8.4, cz: 4.0, houses: 4 },
    { cx: 6.6, cz: -5.8, houses: 4 },
    { cx: 21.4, cz: 2.2, houses: 4 },
    { cx: -21.2, cz: -2.4, houses: 3 },
    { cx: 2.4, cz: 15.0, houses: 3 },
  ];
  const smokeGeom = new THREE.SphereGeometry(0.12, 7, 6);
  hamlets.forEach((ham, hIdx) => {
    for (let i = 0; i < ham.houses; i++) {
      const ang = (i / ham.houses) * Math.PI * 2 + hIdx * 0.7;
      const dist = 0.75 + (i % 2) * 0.65;
      const hx = ham.cx + Math.cos(ang) * dist;
      const hz = ham.cz + Math.sin(ang) * dist;
      const hy = terrainHeight(hx, hz);
      if (hy < 0.25) continue;

      const house = new THREE.Group();
      house.position.set(hx, hy, hz);
      house.rotation.y = ang + 0.5;
      const w = 0.55 + (i % 2) * 0.16;
      const d = 0.44 + ((i + 1) % 2) * 0.14;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, d), plasterMat);
      body.position.y = 0.20;
      body.castShadow = true;
      house.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 0.36, 4), i % 2 === 0 ? roofTerracotta : roofSlate);
      roof.position.y = 0.58;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      house.add(roof);
      country.add(house);

      // Gentle rising hearth smoke wisps on one cottage per hamlet
      if (i === 0) {
        for (let p = 0; p < 3; p++) {
          const puff = new THREE.Mesh(smokeGeom, smokeMat.clone());
          puff.position.set(hx, hy + 0.75, hz);
          country.add(puff);
          chimneyPuffs.push({ mesh: puff, bx: hx, by: hy + 0.72, bz: hz, phase: hIdx * 1.1 + p * 0.33 });
        }
      }
    }
    // Golden haystacks beside each hamlet
    for (let k = 0; k < 2; k++) {
      const sx = ham.cx + (k === 0 ? 1.45 : -1.35);
      const sz = ham.cz + (k === 0 ? -0.9 : 1.0);
      const sy = terrainHeight(sx, sz);
      if (sy < 0.25) continue;
      const hay = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 10), hayMat);
      hay.position.set(sx, sy + 0.15, sz);
      hay.castShadow = true;
      country.add(hay);
    }
  });

  // ── C. 4 STONE FRONTIER WATCHTOWERS WITH SIGNAL BRAZIERS ───────────────────
  const watchtowers = [
    { x: -2.6, z: -15.6 },
    { x: 5.4, z: -16.2 },
    { x: -24.5, z: -11.5 },
    { x: 24.5, z: 9.8 },
  ];
  watchtowers.forEach((wt, idx) => {
    const g = new THREE.Group();
    const y = terrainHeight(wt.x, wt.z);
    g.position.set(wt.x, y, wt.z);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.76, 2.05, 0.76), stoneMat);
    shaft.position.y = 0.98;
    shaft.castShadow = true;
    g.add(shaft);

    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.28, 0.96), darkStone);
    crown.position.y = 2.06;
    crown.castShadow = true;
    g.add(crown);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.06, 1.00), goldMat);
    trim.position.y = 2.22;
    g.add(trim);

    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), emberMat);
    flame.position.y = 2.40;
    g.add(flame);
    towerFlames.push({ mesh: flame, phase: idx * 1.7 });

    country.add(g);
  });

  // ── D. FESTIVAL ENCAMPMENT PAVILIONS OUTSIDE ROYAL LISTS & KING'S GREEN ────
  const tentClusters = [
    { cx: -18.2, cz: -8.0, n: 5 },
    { cx: -10.8, cz: -14.8, n: 4 },
    { cx: 16.8, cz: 10.6, n: 5 },
    { cx: 21.2, cz: -5.5, n: 4 },
  ];
  tentClusters.forEach((cl, cIdx) => {
    for (let i = 0; i < cl.n; i++) {
      const ang = (i / cl.n) * Math.PI * 2 + cIdx;
      const r = 0.95 + (i % 2) * 0.55;
      const tx = cl.cx + Math.cos(ang) * r;
      const tz = cl.cz + Math.sin(ang) * r;
      const ty = terrainHeight(tx, tz);
      if (ty < 0.25) continue;

      const tent = new THREE.Group();
      tent.position.set(tx, ty, tz);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 10), sailCloth);
      base.position.y = 0.16;
      base.castShadow = true;
      tent.add(base);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.55, 10), tentColors[(i + cIdx) % tentColors.length]);
      top.position.y = 0.58;
      top.castShadow = true;
      tent.add(top);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), goldMat);
      finial.position.y = 0.88;
      tent.add(finial);
      country.add(tent);
    }
  });

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

  for (let b = 0; b < 2; b++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 1.25), timberMat);
    hull.position.y = 0.06;
    hull.castShadow = true;
    boat.add(hull);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 4), goldMat);
    prow.rotation.x = Math.PI / 2;
    prow.position.set(0, 0.10, 0.78);
    boat.add(prow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.98, 6), timberMat);
    mast.position.y = 0.56;
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.04), b === 0 ? sailCloth : tentColors[0]);
    sail.position.set(0, 0.62, 0.04);
    sail.castShadow = true;
    boat.add(sail);

    // Translucent trailing water wake behind each sailing river barge
    if (wakeTex) {
      const bargeWake = new THREE.Mesh(
        new THREE.PlaneGeometry(0.88, 1.85),
        new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0.46, depthWrite: false })
      );
      bargeWake.rotation.x = -Math.PI / 2;
      bargeWake.rotation.z = Math.PI;
      bargeWake.position.set(0, 0.01, -1.35);
      boat.add(bargeWake);
    }

    country.add(boat);
    // Keep Barge 0 strictly between North Bridge (-9.6) & Central Bridge (0.86),
    // and Barge 1 strictly between Central Bridge (0.86) & South Bridge (10.6) — zero bridge clipping!
    riverBoats.push(
      b === 0
        ? { mesh: boat, phase: 0.4, speed: 0.14, zMin: NORTH_BRIDGE_Z + 2.4, zMax: BRIDGE_Z - 3.3, baseOffset: 0.18 }
        : { mesh: boat, phase: 2.6, speed: 0.13, zMin: BRIDGE_Z + 3.8, zMax: SOUTH_BRIDGE_Z - 2.4, baseOffset: -0.18 }
    );
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
    driftingClouds,
    soaringEagles,
    birdFlock,
    roamingAnimals,
    riverSwans,
    butterflies,
    towerFlames,
    chimneyPuffs,
    reedInst,
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

    // Finer, crisper living green hedgerows around each field
    if (p.hedge) {
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

      // Lush rounded shade oak growing naturally out of one hedgerow corner (just like the reference!)
      if (p.crop === 'pasture' || p.seed > 0.55) {
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
  const bmCentral = getBridgeMetrics(BRIDGE_Z, 6.2, 0.22);
  const bmNorth = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, 0.20);
  const bmSouth = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, 0.20);
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
function buildLivingArmies(parent) {
  const armyGroup = new THREE.Group();
  const bmCentral = getBridgeMetrics(BRIDGE_Z, 6.2, 0.22);
  const bmNorth = getBridgeMetrics(NORTH_BRIDGE_Z, 4.9, 0.20);
  const bmSouth = getBridgeMetrics(SOUTH_BRIDGE_Z, 5.4, 0.20);
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

  // Tankier HP (~3.5x) & deliberate combat cadence so every clash becomes a long, cinematic battle!
  const UNIT_STATS = {
    swordsman: { hp: 210, dmg: 9,  range: 0.74, speed: 0.46, cd: 1.85, scale: 1.00 },
    knight:    { hp: 360, dmg: 14, range: 0.80, speed: 0.40, cd: 2.05, scale: 1.12 },
    archer:    { hp: 150, dmg: 7,  range: 3.60, speed: 0.44, cd: 2.85, scale: 0.95 },
    cavalry:   { hp: 290, dmg: 13, range: 0.96, speed: 0.78, cd: 1.90, scale: 1.06 },
    mage:      { hp: 165, dmg: 12, range: 3.90, speed: 0.42, cd: 3.30, scale: 1.02 },
    siege:     { hp: 620, dmg: 20, range: 1.15, speed: 0.28, cd: 3.10, scale: 1.00 },
    catapult:  { hp: 460, dmg: 22, range: 5.40, speed: 0.24, cd: 5.60, scale: 1.00 },
  };

  // Dedicated territory patrol waypoints per faction + frontier crossings across ALL 3 bridges!
  // Squads primarily roam their own homeland and occasionally patrol across the North/Central/South bridges.
  const TERRITORY_ZONES = {
    0: [ // Royal Lists (NW)
      [-16.8, -11.5], [-10.5, -13.5], [-4.8, -10.2], [-5.2, -5.2], [-15.8, -2.0], [-7.8, -1.2], [-4.0, NORTH_BRIDGE_Z],
    ],
    1: [ // Iron Colosseum (NE)
      [18.8, -10.5], [11.2, -12.6], [4.6, -10.0], [6.4, -4.6], [19.2, -1.2], [8.8, -0.8], [2.4, NORTH_BRIDGE_Z],
    ],
    2: [ // King's Green (SE)
      [16.8, 10.6], [14.5, 5.4], [8.4, 4.6], [5.8, 10.8], [10.8, 16.4], [6.8, 15.2], [5.4, SOUTH_BRIDGE_Z],
    ],
    3: [ // Great Hall (SW)
      [-21.2, 7.6], [-14.2, 2.8], [-9.2, 4.8], [-5.2, 7.4], [-9.6, 13.8], [-4.6, 11.4], [-1.2, SOUTH_BRIDGE_Z],
    ],
  };

  const FRONTIER_EXCURSIONS = {
    0: [[3.2, NORTH_BRIDGE_Z], [5.8, -7.2], [4.6, BRIDGE_Z], [-9.4, 3.6]], // North bridge -> NE, Central -> East, South border -> SW
    1: [[-4.2, NORTH_BRIDGE_Z], [-6.2, -6.5], [-3.8, BRIDGE_Z], [8.8, 4.8]], // North bridge -> NW, Central -> West, South border -> SE
    2: [[-1.6, SOUTH_BRIDGE_Z], [-4.8, 10.6], [-3.6, BRIDGE_Z], [8.6, -1.8]], // South bridge -> SW, Central -> West, North border -> NE
    3: [[5.8, SOUTH_BRIDGE_Z], [6.4, 10.2], [4.8, BRIDGE_Z], [-9.2, -1.6]], // South bridge -> SE, Central -> East, North border -> NW
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

  // Prevent units from ever wading underwater or clipping into venue plinths (allows crossing ALL 3 bridges!)
  const keepOnPassableLand = (x, z, prevX, prevZ) => {
    let nx = Math.max(-WORLD_W * 0.44, Math.min(WORLD_W * 0.44, x));
    let nz = Math.max(-14.2, Math.min(18.8, z));

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

  // Spawn point right outside each venue's terrace rim facing the central valley
  const getVenueSpawn = f => {
    const v = f.venue;
    const ang = Math.atan2(BRIDGE_Z - v.z, bx - v.x);
    return [v.x + Math.cos(ang) * (v.plateauR + 0.65), v.z + Math.sin(ang) * (v.plateauR + 0.65)];
  };

  // Deterministic pseudo-random for reproducible organic variety
  let aSeed = 8821;
  const aRand = () => {
    aSeed = (aSeed * 16807) % 2147483647;
    return (aSeed - 1) / 2147483646;
  };

  // ── INSTANCED MESH POOLS (SILKY 60FPS FOR ~456 LIVE UNITS + 520 FALLEN 30s CORPSES!) ─
  const MAX_PERSONS = 1050;
  const MAX_HORSES = 240;
  const MAX_SIEGE = 84;
  const MAX_BANNERS = 44;
  const MAX_ARROWS = 200;
  const MAX_MAGIC = 100;
  const MAX_BOULDERS = 44;
  const MAX_FX = 140;

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

  const weaponGeom = new THREE.BoxGeometry(0.015, 0.19, 0.015);
  weaponGeom.translate(0, 0.095, 0);
  const weaponInst = makeInst(weaponGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.72 }), MAX_PERSONS, false, true);

  const shieldGeom = new THREE.BoxGeometry(0.058, 0.088, 0.016);
  const shieldInst = makeInst(shieldGeom, stdWhite(0.68), MAX_PERSONS, false, true);

  // Knight Heavy Plate Armor (gleaming steel breastplate + broad shoulder pauldrons + crested helm plume!)
  const knightArmorGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.11, 0.105, 0.088), 0, 0.115, 0),            // steel breastplate cuirass
    partAt(new THREE.SphereGeometry(0.042, 7, 5), -0.068, 0.152, 0, 0, 0, 0, 1.05, 0.85, 1.0), // left pauldron
    partAt(new THREE.SphereGeometry(0.042, 7, 5),  0.068, 0.152, 0, 0, 0, 0, 1.05, 0.85, 1.0), // right pauldron
    partAt(new THREE.CylinderGeometry(0.044, 0.048, 0.075, 7), 0, 0.205, 0),  // steel great-helm visor
  ]);
  const knightArmorInst = makeInst(knightArmorGeom, plateArmorMat, 260, true, false);

  const knightPlumeGeom = mergeUnitGeoms([
    partAt(new THREE.BoxGeometry(0.018, 0.055, 0.085), 0, 0.265, -0.015, -0.25, 0, 0),
    partAt(new THREE.ConeGeometry(0.022, 0.065, 5), 0, 0.255, -0.055, -0.85, 0, 0),
  ]);
  const knightPlumeInst = makeInst(knightPlumeGeom, stdWhite(0.62), 260, false, true);

  // Unmistakable Archers: Vertical D-shaped Medieval Longbow + bowstring + nocked arrow + back quiver!
  const archerBowGeom = mergeUnitGeoms([
    partAt(new THREE.TorusGeometry(0.115, 0.013, 5, 10, Math.PI), 0, 0.135, 0.045, 0, -Math.PI / 2, -Math.PI / 2), // vertical curved yew longbow bowing forward (+Z)
    partAt(new THREE.CylinderGeometry(0.004, 0.004, 0.23, 4), 0, 0.135, 0.045),                                   // taut vertical bowstring connecting tips
    partAt(new THREE.CylinderGeometry(0.005, 0.006, 0.19, 4), 0, 0.135, 0.125, Math.PI / 2, 0, 0),                // nocked arrow shaft pointing forward (+Z)
    partAt(new THREE.ConeGeometry(0.013, 0.036, 4), 0, 0.135, 0.228, Math.PI / 2, 0, 0),                          // broadhead arrowhead tip
  ]);
  const archerBowInst = makeInst(archerBowGeom, new THREE.MeshStandardMaterial({ color: 0xc48b3b, roughness: 0.72 }), 260, false, false);

  const archerQuiverGeom = mergeUnitGeoms([
    partAt(new THREE.CylinderGeometry(0.024, 0.018, 0.13, 6), -0.028, 0.125, -0.052, 0.18, 0, 0.32),   // leather quiver
    partAt(new THREE.ConeGeometry(0.012, 0.04, 4), -0.045, 0.20, -0.056, 0.18, 0, 0.32),              // arrow fletchings
    partAt(new THREE.ConeGeometry(0.012, 0.04, 4), -0.032, 0.205, -0.044, 0.18, 0, 0.22),
  ]);
  const archerQuiverInst = makeInst(archerQuiverGeom, new THREE.MeshStandardMaterial({ color: 0x5d3d22, roughness: 0.90 }), 260, false, false);

  const mageOrbInst = makeInst(
    new THREE.SphereGeometry(0.036, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    180,
    false,
    true
  );

  // Miniature Cavalry Warhorses
  const horseBodyGeom = new THREE.BoxGeometry(0.10, 0.10, 0.24);
  const horseBodyInst = makeInst(horseBodyGeom, stdWhite(0.84), MAX_HORSES, true, true);
  const horseHeadGeom = new THREE.BoxGeometry(0.058, 0.09, 0.085);
  const horseHeadInst = makeInst(horseHeadGeom, stdWhite(0.84), MAX_HORSES, false, true);

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

  // Squad Regiment Banners (makes cohesive groups instantly readable from campaign height!)
  const banPoleGeom = new THREE.CylinderGeometry(0.012, 0.014, 0.62, 5);
  banPoleGeom.translate(0, 0.31, 0);
  const banPoleInst = makeInst(banPoleGeom, new THREE.MeshStandardMaterial({ color: 0x5c4124, roughness: 0.88 }), MAX_BANNERS);
  const banFlagGeom = new THREE.BoxGeometry(0.24, 0.16, 0.015);
  banFlagGeom.translate(0.12, 0, 0);
  const banFlagInst = makeInst(banFlagGeom, stdWhite(0.72), MAX_BANNERS, false, true);

  // Live Projectiles & Combat Sparks / Explosions
  const arrowGeom = new THREE.CylinderGeometry(0.008, 0.012, 0.24, 4);
  arrowGeom.rotateX(Math.PI / 2);
  const arrowInst = makeInst(arrowGeom, new THREE.MeshBasicMaterial({ color: 0xf7e39c }), MAX_ARROWS);
  const magicBoltInst = makeInst(new THREE.SphereGeometry(0.058, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MAGIC, false, true);
  const boulderInst = makeInst(new THREE.DodecahedronGeometry(0.088, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2b }), MAX_BOULDERS);
  const fxInst = makeInst(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }), MAX_FX, false, true);

  // ── BUILD 36 GRAND COHESIVE REGIMENTS (9 PER FACTION = 456 ACTIVE UNITS!) ───
  const squads = [];
  const units = [];
  const corpses = []; // Fallen bodies remain visibly on the map for 30.0 full seconds!
  const projectiles = [];
  const effects = [];

  const SQUAD_TEMPLATES = [
    { role: 'vanguard', members: ['swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','knight','knight'] },
    { role: 'heavy',    members: ['knight','knight','knight','knight','knight','knight','knight','knight','knight','knight','swordsman','swordsman','swordsman','swordsman'] },
    { role: 'ranged',   members: ['archer','archer','archer','archer','archer','archer','archer','archer','archer','archer','archer','archer','mage','mage','mage','mage'] },
    { role: 'cavalry',  members: ['cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry','cavalry'] },
    { role: 'skirmish', members: ['swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','archer','archer','archer','archer','archer','archer','mage','mage'] },
    { role: 'siege',    members: ['siege','siege','siege','catapult','catapult','catapult','swordsman','swordsman','swordsman','swordsman'] },
    { role: 'patrol',   members: ['swordsman','swordsman','swordsman','swordsman','swordsman','swordsman','knight','knight','archer','archer','archer','archer'] },
    { role: 'outrider', members: ['cavalry','cavalry','cavalry','cavalry','mage','mage','mage','mage'] },
    { role: 'bridge',   members: ['swordsman','swordsman','swordsman','swordsman','knight','knight','knight','knight','siege','siege','catapult','catapult'] },
  ];

  const pickSquadGoal = (faction, squad) => {
    // Roam around home territory (~56%), while ~44% march on grand border patrols across the 3 bridges!
    const roamHome = squad.role === 'bridge' ? aRand() < 0.25 : aRand() < 0.60;
    const pool = roamHome ? TERRITORY_ZONES[faction.id] : FRONTIER_EXCURSIONS[faction.id];
    const p = pool[Math.floor(aRand() * pool.length)];
    return [p[0] + (aRand() - 0.5) * 2.2, p[1] + (aRand() - 0.5) * 2.2];
  };

  const horseCoats = [0x6b3e22, 0x3f2a1d, 0x8c5c38, 0xd8d3c8, 0x2a2420];

  for (const fac of FACTIONS) {
    const [spX, spZ] = getVenueSpawn(fac);
    const homeZones = TERRITORY_ZONES[fac.id];
    SQUAD_TEMPLATES.forEach((tpl, sIdx) => {
      // Spread all 9 regiments organically across each faction's own homeland!
      const basePt = homeZones[sIdx % homeZones.length];
      const initialZone = sIdx < homeZones.length
        ? basePt
        : [spX + (aRand() - 0.5) * 3.2, spZ + (aRand() - 0.5) * 3.2];

      const [initX, initZ] = keepOnPassableLand(initialZone[0], initialZone[1], spX, spZ);
      const squad = {
        id: squads.length,
        team: fac.id,
        faction: fac,
        role: tpl.role,
        x: initX,
        z: initZ,
        heading: Math.atan2(BRIDGE_Z - initZ, bx - initX),
        goalX: initX,
        goalZ: initZ,
        retargetTimer: 4 + aRand() * 14,
        provokedBy: null,
        provokeTimer: 0,
        isCrossing: false,
        members: [],
      };
      const [gx, gz] = pickSquadGoal(fac, squad);
      squad.goalX = gx;
      squad.goalZ = gz;

      const cols = Math.ceil(Math.sqrt(tpl.members.length));
      const spacing = tpl.role === 'siege' ? 0.56 : tpl.role === 'cavalry' ? 0.42 : 0.28;
      tpl.members.forEach((type, mIdx) => {
        const colI = mIdx % cols;
        const rowI = Math.floor(mIdx / cols);
        const fx = (colI - (cols - 1) * 0.5) * spacing;
        const fz = (rowI - 1.0) * spacing;
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

  const killUnit = u => {
    if (!u.alive) return;
    u.alive = false;
    u.respawnWait = 5.5 + aRand() * 4.5; // Fresh reinforcement respawns at home venue shortly!
    // Leave fallen body visibly on the battlefield for 30 FULL SECONDS before despawning!
    if (corpses.length >= 520) corpses.shift();
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
      maxAge: 30.0,
    });
  };

  const provokeVictim = (victim, attacker) => {
    if (!victim || !victim.alive || !attacker || !attacker.alive || victim.team === attacker.team) return;
    victim.provokedBy = attacker;
    victim.provokeTimer = 16.0;
    // Alert the victim's entire squad so the whole regiment rallies to retaliate against the attacker!
    victim.squad.provokedBy = attacker;
    victim.squad.provokeTimer = 16.0;
  };

  const applyDamage = (target, dmg, splash = 0, attackerTeam = -1, attacker = null) => {
    if (splash > 0) {
      const rSq = splash * splash;
      for (const other of units) {
        if (!other.alive || other.team === attackerTeam) continue;
        const dx = other.x - target.x;
        const dz = other.z - target.z;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          const falloff = 1 - Math.sqrt(dSq) / (splash * 1.25);
          other.hp -= dmg * Math.max(0.35, falloff);
          if (other.hp <= 0) killUnit(other);
          else provokeVictim(other, attacker);
        }
      }
      return;
    }
    if (!target || !target.alive) return;
    target.hp -= dmg;
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
    // 0. Rebuild fast spatial grid for alive units
    grid.clear();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const k = cellKey(Math.floor(u.x / CELL_SZ), Math.floor(u.z / CELL_SZ));
      let bucket = grid.get(k);
      if (!bucket) { bucket = []; grid.set(k, bucket); }
      bucket.push(u);
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

      const [spX, spZ] = getVenueSpawn(sq.faction);
      if (aliveCount === 0) {
        sq.x = spX;
        sq.z = spZ;
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
          const [ux, uz] = keepOnPassableLand(spX + u.formX, spZ + u.formZ, spX, spZ);
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
            const [ux, uz] = keepOnPassableLand(spX + (aRand() - 0.5) * 1.2, spZ + (aRand() - 0.5) * 1.2, spX, spZ);
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
          sq.retargetTimer = 22 + aRand() * 18;
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
        const spd = sq.role === 'cavalry' || sq.role === 'outrider' ? 0.62 : sq.role === 'siege' ? 0.26 : 0.40;
        const step = Math.min(dLen, spd * dt);
        const [nx, nz] = keepOnPassableLand(sq.x + (dX / dLen) * step, sq.z + (dZ / dLen) * step, sq.x, sq.z);
        sq.x = nx;
        sq.z = nz;
        sq.heading = Math.atan2(dX, dZ);
      }
    }

    // 2. Individual Unit AI: Patrol Territory, Cross Bridges in Column, & Retaliate When Provoked!
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

      // Close-proximity spatial-grid enemy search (fast O(1) cell lookup!)
      const aggroR = u.type === 'catapult' ? 5.6 : (u.type === 'archer' || u.type === 'mage') ? 3.95 : 2.15;
      let best = null;
      let bestDistSq = aggroR * aggroR;
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

      // If no enemy is right next to us, check if we (or our squad) were PROVOKED by an attacker!
      const provoker = (u.provokedBy && u.provokedBy.alive)
        ? u.provokedBy
        : (u.squad.provokedBy && u.squad.provokedBy.alive ? u.squad.provokedBy : null);
      if (!best && provoker) {
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

        if (dist <= st.range) {
          shouldMove = false;
          if (u.cd <= 0) {
            u.cd = st.cd * (0.85 + aRand() * 0.30);
            u.swing = 1.0;
            if (u.type === 'archer') {
              if (projectiles.length < MAX_ARROWS + MAX_MAGIC + MAX_BOULDERS) {
                projectiles.push({
                  kind: 'arrow',
                  team: u.team,
                  attacker: u,
                  sx: u.x, sy: armyGroundY(u.x, u.z) + 0.18, sz: u.z,
                  tx: best.x + (aRand() - 0.5) * 0.25, ty: armyGroundY(best.x, best.z) + 0.12, tz: best.z + (aRand() - 0.5) * 0.25,
                  arc: 0.75 + dist * 0.14,
                  t: 0, dur: Math.max(0.65, dist / 4.2),
                  dmg: st.dmg, target: best, color: 0xf7e39c,
                });
              }
            } else if (u.type === 'mage') {
              projectiles.push({
                kind: 'magic',
                team: u.team,
                attacker: u,
                sx: u.x, sy: armyGroundY(u.x, u.z) + 0.22, sz: u.z,
                tx: best.x, ty: armyGroundY(best.x, best.z) + 0.14, tz: best.z,
                arc: 0.45 + dist * 0.06,
                t: 0, dur: Math.max(0.75, dist / 3.4),
                dmg: st.dmg, splash: 0.75, target: best, color: u.faction.magic,
              });
            } else if (u.type === 'catapult') {
              u.armPitch = 1.25;
              projectiles.push({
                kind: 'boulder',
                team: u.team,
                attacker: u,
                sx: u.x, sy: armyGroundY(u.x, u.z) + 0.34, sz: u.z,
                tx: best.x + (aRand() - 0.5) * 0.45, ty: armyGroundY(best.x, best.z) + 0.06, tz: best.z + (aRand() - 0.5) * 0.45,
                arc: 2.2 + dist * 0.22,
                t: 0, dur: Math.max(1.45, dist / 2.8),
                dmg: st.dmg, splash: 1.45, target: best, color: 0xff7e24,
              });
            } else {
              // Close-quarters melee clash (provokes victim & victim's squad!)
              applyDamage(best, st.dmg, u.type === 'siege' ? 0.85 : 0, u.team, u);
              if (aRand() > 0.38) {
                spawnFX((u.x + best.x) * 0.5, armyGroundY(u.x, u.z) + 0.16, (u.z + best.z) * 0.5, u.type === 'siege' ? 0xffae42 : 0xfff0b0, u.type === 'siege' ? 0.85 : 0.42, 0.36);
              }
            }
          }
        } else if (u.type !== 'catapult' || best === provoker) {
          // Charge directly toward close enemy OR provoked attacker (routing over nearest bridge if across river!)
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
          const [nx, nz] = keepOnPassableLand(u.x + (dx / d) * step, u.z + (dz / d) * step, u.x, u.z);
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

    // 5. Render All Live Units + All 30-Second Fallen Bodies Into GPU InstancedMeshes!
    let pC = 0, hC = 0, wC = 0, shC = 0, orbC = 0, horseC = 0, ramC = 0, catC = 0, knC = 0, archC = 0;

    for (const u of units) {
      if (!u.alive) continue;
      const gy = armyGroundY(u.x, u.z);
      const st = UNIT_STATS[u.type];
      const bob = Math.abs(Math.sin(u.stridePhase)) * (u.type === 'cavalry' ? 0.032 : 0.018);

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

      const riderLift = u.type === 'cavalry' ? 0.13 : 0;
      const sinH = Math.sin(u.heading);
      const cosH = Math.cos(u.heading);

      // Cavalry warhorse mount
      if (u.type === 'cavalry' && horseC < MAX_HORSES) {
        dummy.position.set(u.x, gy + 0.10 + bob, u.z);
        dummy.rotation.set(Math.sin(u.stridePhase) * 0.08, u.heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        horseBodyInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(u.horseCoat);
        horseBodyInst.setColorAt(horseC, cTmp);

        dummy.position.set(u.x + sinH * 0.13, gy + 0.18 + bob, u.z + cosH * 0.13);
        dummy.rotation.set(0.28, u.heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        horseHeadInst.setMatrixAt(horseC, dummy.matrix);
        horseHeadInst.setColorAt(horseC, cTmp);
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
        headInst.setColorAt(hC, u.type === 'knight' ? cHelm : u.type === 'archer' ? cHood : u.type === 'mage' ? cTmp : cSkin);
        pC++;
        hC++;

        // Armored Knight Plate Breastplate, Broad Pauldrons, Steel Great Helm & Faction Plume!
        if (u.type === 'knight' && knC < 260) {
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
        if (u.type === 'archer' && archC < 260) {
          dummy.position.set(u.x, gy + bob, u.z);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(sc * (1 + u.swing * 0.12));
          dummy.updateMatrix();
          archerBowInst.setMatrixAt(archC, dummy.matrix);
          archerQuiverInst.setMatrixAt(archC, dummy.matrix);
          archC++;
        }

        // Right-hand Weapon (Sword, Broadsword, Lance, or Arcane Staff — Archers use dedicated Longbow!)
        if (u.type !== 'archer' && wC < MAX_PERSONS) {
          const rx = cosH * 0.055 * sc;
          const rz = -sinH * 0.055 * sc;
          const slashPitch = u.type === 'cavalry' ? 1.05 : 0.25 + Math.sin(u.swing * Math.PI) * 1.15;
          dummy.position.set(u.x + rx, gy + riderLift + bob + 0.11 * sc, u.z + rz);
          dummy.rotation.set(slashPitch, u.heading, 0);
          dummy.scale.set(u.type === 'knight' ? 1.35 : 1, u.type === 'cavalry' ? 1.85 : u.type === 'mage' ? 1.35 : u.type === 'knight' ? 1.22 : 1.0, 1);
          dummy.updateMatrix();
          weaponInst.setMatrixAt(wC, dummy.matrix);
          weaponInst.setColorAt(wC, u.type === 'mage' ? cWood : cSteel);
          wC++;
        }

        // Left-hand Faction Shield (Swordsmen, Knights, Cavalry)
        if ((u.type === 'swordsman' || u.type === 'knight' || u.type === 'cavalry') && shC < MAX_PERSONS) {
          const lx = -cosH * 0.062 * sc + sinH * 0.03;
          const lz = sinH * 0.062 * sc + cosH * 0.03;
          dummy.position.set(u.x + lx, gy + riderLift + bob + 0.105 * sc, u.z + lz);
          dummy.rotation.set(0, u.heading, 0);
          dummy.scale.setScalar(u.type === 'knight' ? 1.32 : 0.95);
          dummy.updateMatrix();
          shieldInst.setMatrixAt(shC, dummy.matrix);
          cTmp.setHex(u.faction.accent);
          shieldInst.setColorAt(shC, cTmp);
          shC++;
        }

        // Glowing Arcane Staff Orb for Mages
        if (u.type === 'mage' && orbC < 180) {
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

    // 6. Advance & Render Fallen Bodies (Remain Visibly on Battlefield for 30 Full Seconds!)
    for (let i = corpses.length - 1; i >= 0; i--) {
      const cp = corpses[i];
      cp.age += dt;
      if (cp.age >= cp.maxAge) {
        corpses.splice(i, 1);
        continue;
      }
      const fadeOut = cp.age > 27.5 ? 1 - (cp.age - 27.5) / 2.5 : 1.0;
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
        dummy.position.set(cp.x + 0.10 * cp.fallSide, cp.y + 0.045 - sinkY, cp.z);
        dummy.rotation.set(0, cp.rotY, cp.fallSide * Math.PI * 0.48);
        dummy.scale.setScalar(0.95 * fadeOut);
        dummy.updateMatrix();
        horseBodyInst.setMatrixAt(horseC, dummy.matrix);
        cTmp.setHex(cp.horseCoat).lerp(cDeadTint, 0.45);
        horseBodyInst.setColorAt(horseC, cTmp);
        horseHeadInst.setMatrixAt(horseC, dummy.matrix);
        horseHeadInst.setColorAt(horseC, cTmp);
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

    // 7. Render Cohesive Squad Regiment Banners Fluttering Gently Above Each Group
    let bC = 0;
    for (const sq of squads) {
      if (bC >= MAX_BANNERS) break;
      const by = armyGroundY(sq.x, sq.z);
      dummy.position.set(sq.x, by, sq.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      banPoleInst.setMatrixAt(bC, dummy.matrix);

      dummy.position.set(sq.x, by + 0.51, sq.z);
      dummy.rotation.set(0, sq.heading + Math.sin(t * 3.8 + sq.id) * 0.22, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      banFlagInst.setMatrixAt(bC, dummy.matrix);
      cTmp.setHex(sq.faction.primary);
      banFlagInst.setColorAt(bC, cTmp);
      bC++;
    }

    bodyInst.count = pC;
    headInst.count = hC;
    weaponInst.count = wC;
    shieldInst.count = shC;
    knightArmorInst.count = knC;
    knightPlumeInst.count = knC;
    archerBowInst.count = archC;
    archerQuiverInst.count = archC;
    mageOrbInst.count = orbC;
    horseBodyInst.count = horseC;
    horseHeadInst.count = horseC;
    ramHullInst.count = ramC;
    ramTrimInst.count = ramC;
    ramBeamInst.count = ramC;
    catBaseInst.count = catC;
    catTrimInst.count = catC;
    catArmInst.count = catC;
    banPoleInst.count = bC;
    banFlagInst.count = bC;

    for (const inst of [
      bodyInst, headInst, weaponInst, shieldInst,
      knightArmorInst, knightPlumeInst, archerBowInst, archerQuiverInst,
      mageOrbInst, horseBodyInst, horseHeadInst,
      ramHullInst, ramTrimInst, ramBeamInst,
      catBaseInst, catTrimInst, catArmInst,
      banPoleInst, banFlagInst,
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

  // Swept-back obsidian horns + glowing amber eyes
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

  // 7. Roaming Chaos State Machine: Patrols ALL of the Realm & Dives on Random Troops!
  const state = {
    x: -7.5,
    y: 9.2,
    z: -7.0,
    heading: 0.75,
    bank: 0,
    pitch: 0,
    speed: 4.8,
    mode: 'roam', // 'roam' -> 'dive' -> 'strafe' -> 'climb'
    timer: 2.6,   // First raid starts quickly so user sees dragon chaos right away!
    goalX: 5.0,
    goalZ: 2.0,
    targetUnit: null,
    breathTick: 0,
    damageTick: 0,
    jawOpen: 0,
    wingPhase: 0,
  };

  const pickRandomRoamPoint = () => {
    // Roam all around the entire 68x52 realm (mountains, river, farms, all 4 territories!)
    const px = (dRand() - 0.5) * 48;
    const pz = (dRand() - 0.5) * 36;
    return [px, pz];
  };

  const pickRandomTargetTroop = () => {
    if (!armies?.units?.length) return null;
    // Sample 12 random alive units across ALL 4 teams so attacks are genuinely random & map-wide!
    let best = null;
    for (let k = 0; k < 14; k++) {
      const idx = Math.floor(dRand() * armies.units.length);
      const u = armies.units[idx];
      if (u && u.alive) {
        best = u;
        // Prefer targets not right on top of the dragon so it makes a dramatic swoop!
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

    // Mode transitions
    if (state.mode === 'roam') {
      const distGoal = Math.hypot(state.goalX - state.x, state.goalZ - state.z);
      if (distGoal < 4.5) {
        const [rx, rz] = pickRandomRoamPoint();
        state.goalX = rx;
        state.goalZ = rz;
      }
      if (state.timer <= 0) {
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
        state.mode = 'climb';
        state.timer = 2.6 + dRand() * 1.0;
        const [rx, rz] = pickRandomRoamPoint();
        state.goalX = rx;
        state.goalZ = rz;
      }
    } else if (state.mode === 'climb') {
      if (state.timer <= 0) {
        state.mode = 'roam';
        state.timer = 4.2 + dRand() * 3.8;
      }
    }

    // Smooth steering toward current flight goal
    const desiredHeading = Math.atan2(state.goalX - state.x, state.goalZ - state.z);
    let diffH = desiredHeading - state.heading;
    while (diffH > Math.PI) diffH -= Math.PI * 2;
    while (diffH < -Math.PI) diffH += Math.PI * 2;

    const maxTurn = state.mode === 'strafe' ? 1.55 : state.mode === 'dive' ? 1.85 : 1.15;
    const turnStep = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diffH));
    state.heading += turnStep;

    // Flight speed & target altitude per mode (always clears mountain peaks cleanly!)
    const groundHere = Math.max(0.2, terrainHeight(state.x, state.z));
    const targetSpeed = state.mode === 'dive' ? 6.8 : state.mode === 'strafe' ? 4.2 : state.mode === 'climb' ? 5.6 : 4.9;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.5);

    const desiredAlt = state.mode === 'strafe'
      ? groundHere + 2.85
      : state.mode === 'dive'
        ? Math.max(groundHere + 3.2, 4.4)
        : Math.max(groundHere + 4.2, 9.2 + Math.sin(t * 0.65) * 1.1);

    const prevY = state.y;
    state.y += (desiredAlt - state.y) * Math.min(1, dt * (state.mode === 'dive' ? 2.4 : 1.5));
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;

    // Keep smoothly inside campaign realm bounds
    state.x = Math.max(-29, Math.min(29, state.x));
    state.z = Math.max(-21, Math.min(21, state.z));

    // Aerodynamic banking into turns & dive/climb pitch
    const targetBank = Math.max(-0.68, Math.min(0.68, -diffH * 0.72));
    state.bank += (targetBank - state.bank) * Math.min(1, dt * 3.8);
    const vy = (state.y - prevY) / Math.max(0.008, dt);
    const targetPitch = Math.max(-0.42, Math.min(0.45, -vy * 0.085));
    state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 4.0);

    // Apply transform to Dragon Root
    dragonRoot.position.set(state.x, state.y, state.z);
    dragonRoot.rotation.order = 'YXZ';
    dragonRoot.rotation.set(state.pitch, state.heading, state.bank);

    // Wingbeat cadence: fast & powerful when climbing/strafing, gliding sweep when diving!
    const wingSpeed = state.mode === 'climb' ? 7.6 : state.mode === 'strafe' ? 6.4 : state.mode === 'dive' ? 3.2 : 5.1;
    const wingAmp = state.mode === 'dive' ? 0.24 : state.mode === 'climb' ? 0.68 : 0.54;
    state.wingPhase += dt * wingSpeed;
    const flapIn = Math.sin(state.wingPhase) * wingAmp;
    const flapOut = Math.sin(state.wingPhase - 0.72) * (wingAmp * 0.85);
    leftWing.inner.rotation.z = -flapIn;
    rightWing.inner.rotation.z = flapIn;
    leftWing.outer.rotation.z = -flapOut - 0.14;
    rightWing.outer.rotation.z = flapOut + 0.14;
    // Subtle vertical body bob counter-phased to wingbeats
    dragonRoot.position.y += -Math.sin(state.wingPhase) * 0.12;

    // Articulated neck, jaw & fiery throat glow when breathing fire!
    const breathing = state.mode === 'strafe';
    state.jawOpen += ((breathing ? 0.62 : 0.08) - state.jawOpen) * Math.min(1, dt * 7.5);
    jawGroup.rotation.x = state.jawOpen;
    neckGroup.rotation.x = breathing ? 0.42 : state.mode === 'dive' ? 0.22 : Math.sin(t * 1.8) * 0.05;
    neckGroup.rotation.y = Math.max(-0.35, Math.min(0.35, diffH * 0.35));
    throatGlow.scale.setScalar(breathing ? 1.35 + Math.sin(t * 28) * 0.22 : 0.65);
    dragonLight.intensity = breathing ? 5.8 + Math.sin(t * 26) * 1.4 : 0.0;

    // Sinuous travelling-wave tail animation
    for (let i = 0; i < tailSegs.length; i++) {
      tailSegs[i].rotation.y = Math.sin(t * 5.2 - i * 0.78) * (0.14 + i * 0.03) - diffH * 0.12;
      tailSegs[i].rotation.x = Math.cos(t * 3.6 - i * 0.65) * 0.07;
    }

    // Terrain-hugging shadow directly below the dragon
    const shY = Math.max(0.02, terrainHeight(state.x, state.z)) + 0.08;
    const alt = Math.max(1, state.y - shY);
    const shScale = 0.72 + Math.min(1.4, alt * 0.085);
    dragonShadow.position.set(state.x, shY, state.z);
    dragonShadow.rotation.z = -state.heading;
    dragonShadow.scale.setScalar(shScale);
    dragonShadow.material.opacity = Math.max(0.18, 0.76 - alt * 0.038);

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

// ── 4. GLOWING TERRITORY ZONE OF CONTROL & VOLUMETRIC SUNBEAM (IMAGE 3) ──────
function createTerritoryRingMesh(spec) {
  const group = new THREE.Group();
  const radius = spec.zoneR;
  const segR = 14;
  const segA = 64;

  // Build terrain-conforming translucent crimson disc (Rome II Zone of Control!)
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let ri = 0; ri <= segR; ri++) {
    const rFrac = ri / segR;
    const r = radius * rFrac;
    for (let ai = 0; ai <= segA; ai++) {
      const theta = (ai / segA) * Math.PI * 2;
      // Subtle organic Rome II border waviness
      const wave = 1 + Math.sin(theta * 5 + spec.id) * 0.045 + Math.cos(theta * 3 - spec.id) * 0.03;
      const wx = spec.x + Math.cos(theta) * r * wave;
      const wz = spec.z + Math.sin(theta) * r * wave;
      const wy = Math.max(-0.08, terrainHeight(wx, wz)) + 0.09;
      vertices.push(wx, wy, wz);
      uvs.push(rFrac, ai / segA);
    }
  }

  for (let ri = 0; ri < segR; ri++) {
    for (let ai = 0; ai < segA; ai++) {
      const a = ri * (segA + 1) + ai;
      const b = a + 1;
      const c = (ri + 1) * (segA + 1) + ai;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const discGeom = new THREE.BufferGeometry();
  discGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  discGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  discGeom.setIndex(indices);
  discGeom.computeVertexNormals();

  const discMat = new THREE.MeshBasicMaterial({
    color: 0xa8202c,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const discMesh = new THREE.Mesh(discGeom, discMat);
  group.add(discMesh);

  // Crisp glowing crimson-gold perimeter ring hugging terrain
  const borderPts = [];
  for (let ai = 0; ai <= segA; ai++) {
    const theta = (ai / segA) * Math.PI * 2;
    const wave = 1 + Math.sin(theta * 5 + spec.id) * 0.045 + Math.cos(theta * 3 - spec.id) * 0.03;
    const wx = spec.x + Math.cos(theta) * radius * wave;
    const wz = spec.z + Math.sin(theta) * radius * wave;
    const wy = Math.max(-0.05, terrainHeight(wx, wz)) + 0.14;
    borderPts.push(new THREE.Vector3(wx, wy, wz));
  }
  const borderCurve = new THREE.CatmullRomCurve3(borderPts, true);
  const borderGeom = new THREE.TubeGeometry(borderCurve, 96, 0.11, 6, true);
  const borderMat = new THREE.MeshBasicMaterial({
    color: 0xd93842,
    transparent: true,
    opacity: 0.92,
  });
  const borderMesh = new THREE.Mesh(borderGeom, borderMat);
  group.add(borderMesh);

  // Subtle golden inner highlight ring right around the citadel plateau
  const innerPts = [];
  for (let ai = 0; ai <= 48; ai++) {
    const theta = (ai / 48) * Math.PI * 2;
    const wx = spec.x + Math.cos(theta) * (spec.plateauR + 0.25);
    const wz = spec.z + Math.sin(theta) * (spec.plateauR + 0.25);
    const wy = terrainHeight(wx, wz) + 0.13;
    innerPts.push(new THREE.Vector3(wx, wy, wz));
  }
  const innerLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(innerPts),
    new THREE.LineBasicMaterial({ color: 0xf0d58c, transparent: true, opacity: 0.78 })
  );
  group.add(innerLine);

  // Dramatic Rome II-style soft golden sunbeam cone descending onto selected venue (Image 3!)
  const beamGeom = new THREE.ConeGeometry(4.2, 13.5, 24, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xf7e6b2,
    transparent: true,
    opacity: 0.095,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.set(spec.x, spec.plateauH + 6.4, spec.z);
  beam.rotation.z = -0.18;
  beam.rotation.x = 0.08;
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
  const zoomInBtn = document.getElementById('atlas-zoom-in');
  const zoomOutBtn = document.getElementById('atlas-zoom-out');
  const resetBtn = document.getElementById('atlas-reset');

  if (!stageWrapper || !stageEl) return;

  // Verify WebGL availability gracefully before switching off 2D SVG fallback
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (_err) {
    return; // Leave 2D SVG fallback visible
  }

  stageWrapper.classList.add('has-3d-toggle', 'is-3d-ready');
  window.TG?.atlas?.set3DActive?.(true);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16293d);
  scene.fog = new THREE.FogExp2(0x1b3044, 0.0115);

  const width = Math.max(stageEl.clientWidth, 320);
  const height = Math.max(stageEl.clientHeight, 320);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 220);
  camera.position.set(...OVERVIEW_CAM.pos);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stageEl.appendChild(renderer.domElement);

  // CSS2DRenderer overlay for crisp Rome II floating settlement nameplates
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'atlas-css2d-layer';
  stageEl.appendChild(labelRenderer.domElement);

  // OrbitControls clamped to campaign-map angles (cannot flip upside down or clip under terrain)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...OVERVIEW_CAM.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.enableZoom = false; // Handled via smooth custom damped wheel zoom below
  controls.minPolarAngle = 0.01;
  controls.maxPolarAngle = Math.PI * 0.405;
  controls.minDistance = 10.5;
  controls.maxDistance = 68.0;
  controls.update();

  // Dramatic Golden Campaign Lighting
  const hemi = new THREE.HemisphereLight(0xeef2f7, 0x2a3b2a, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe9be, 1.85);
  sun.position.set(22, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  const { routeEntries } = buildCampaignRoutes(detailGroup);
  const armies = buildLivingArmies(detailGroup);
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
  let strategicMode = false; // true = 2D Illustrated Strategic Atlas, false = 3D Campaign Map
  let manualStrategic = false;
  let strategicBlend = 0; // continuous 0..1 frame-synchronized crossfade
  let blendTween = null;
  let webglPaused = false;
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

    // 3D terrain, river & models physically rise out of / fold back into the 2D illustrated footprints!
    const reliefY = 0.03 + relief * 0.97;
    terrain.terrainMesh.scale.y = reliefY;
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
    scene.fog.density = 0.0115 * (1 - smoothstep(0.1, 0.85, strategicBlend) * 0.78);
  }
  applyStrategicBlend(0);

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

  // Responsive ResizeObserver
  const handleResize = () => {
    const w = Math.max(stageEl.clientWidth, 260);
    const h = Math.max(stageEl.clientHeight, 260);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
  };
  if ('ResizeObserver' in window) {
    new ResizeObserver(handleResize).observe(stageEl);
  }
  window.addEventListener('resize', handleResize);

  // Pause rendering when scrolled off-screen to save GPU
  let isVisible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      isVisible = entries[0].isIntersecting;
    }, { threshold: 0.04 }).observe(stageEl);
  }

  // ── 8. ANIMATION LOOP ──────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    if (!isVisible || document.hidden || webglPaused) return;

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

    // Clamp pan target inside campaign borders
    controls.target.x = Math.max(-18, Math.min(18, controls.target.x));
    controls.target.z = Math.max(-14, Math.min(14, controls.target.z));
    controls.target.y = Math.max(0, Math.min(2.2, controls.target.y));

    // Continuous zoom-out preview blend near max distance -> smoothly morphs into 2D Strategic Atlas!
    const camDist = camera.position.distanceTo(controls.target);
    if (!activeTween && !blendTween && !strategicMode) {
      if (camDist >= 47.0) {
        setStrategicView(true, { manual: false, animateCam: true });
      } else if (camDist > 38.5) {
        const preBlend = smoothstep(38.5, 47.2, camDist) * 0.36;
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

      // Gentle breathing pulse on active Territory Zone of Control & sunbeam
      if (selectedVenueId && venueNodes.has(selectedVenueId)) {
        const { territory } = venueNodes.get(selectedVenueId);
        territory.discMat.opacity = 0.24 + Math.sin(t * 2.6) * 0.06;
        territory.borderMat.opacity = 0.84 + Math.sin(t * 2.6) * 0.12;
        territory.beamMat.opacity = 0.08 + Math.sin(t * 1.9) * 0.025;
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

      // Sail river barges smoothly along their own North/South river reaches with graceful U-turns
      // (stays strictly in deep open water, never clips the bridge, piers, docks, or riverbanks!)
      for (const rb of countryside.riverBoats) {
        const boatPosAt = ang => {
          const u = 0.5 - 0.5 * Math.cos(ang);
          const z = rb.zMin + u * (rb.zMax - rb.zMin);
          const lane = rb.baseOffset + Math.sin(ang) * 0.24;
          const x = riverCenterX(z) + lane;
          return [x, z];
        };
        const ang = t * rb.speed + rb.phase;
        const [bx, bz] = boatPosAt(ang);
        const [px, pz] = boatPosAt(ang - 0.02);
        const [nx, nz] = boatPosAt(ang + 0.02);
        rb.mesh.position.set(bx, -0.14 + Math.sin(t * 2.4 + rb.phase * 3) * 0.02, bz);
        rb.mesh.rotation.y = Math.atan2(nx - px, nz - pz);
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

      // Live Total War miniature army battle simulation (4 venue teams, 7 unit classes, 30s corpses!)
      if (armies) {
        armies.update(dt, t);
      }

      // Roaming Chaos Dragon soaring across the realm & torching random troops!
      if (dragon) {
        dragon.update(dt, t);
      }
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAtlas3D);
} else {
  mountAtlas3D();
}
