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
    x: 9.6,
    z: 10.4,
    scale: 0.245,
    rotY: -0.10,
    plateauR: 5.0,
    plateauH: 1.18,
    zoneR: 6.2,
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
    zoneR: 6.2,
    badgeY: 2.45,
    parchmentColor: '#a67b45',
    camOffset: [-3.4, 10.8, 13.2],
  },
];

const OVERVIEW_CAM = { pos: [0.0, 27.5, 29.5], target: [0.0, 0.2, 0.8] };
const STRATEGIC_CAM = { pos: [0.0, 66.0, 0.08], target: [0.0, 0.0, 0.0] };
const BRIDGE_Z = 0.86;

function riverCenterX(z) {
  return Math.sin(z * 0.115) * 2.55 + Math.cos(z * 0.055) * 0.65;
}

function riverHalfWidth(z) {
  return 1.85 + Math.sin(z * 0.17 + 0.8) * 0.32;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Deterministic multi-octave terrain height matching hills, Alpine northern peaks,
// winding river valley, and flat elevated citadel plateaus for each of the 4 venues.
function terrainHeight(x, z) {
  // Base rolling campaign hills
  let h = 0.55
    + Math.sin(x * 0.13 + 0.4) * Math.cos(z * 0.12 - 0.3) * 0.62
    + Math.sin(x * 0.24 - z * 0.19) * 0.28
    + Math.cos(x * 0.39 + z * 0.33) * 0.11;

  // Dramatic Rome II-style northern alpine mountains & distant outer ridges
  const northEdge = smoothstep(-13.5, -24.5, z);
  const alpinePeaks = (Math.abs(Math.sin(x * 0.19 + 0.7)) * 2.4
    + Math.abs(Math.cos(x * 0.37 - z * 0.22)) * 1.45
    + 1.35) * northEdge;
  h += alpinePeaks;

  const sideRidge = smoothstep(23.5, 33.5, Math.abs(x)) * (1.1 + Math.abs(Math.sin(z * 0.24)) * 1.35);
  const southBluff = smoothstep(17.5, 25.5, z) * (0.55 + Math.abs(Math.cos(x * 0.21)) * 0.75);
  h += sideRidge + southBluff;

  // Gentle carving for the winding North-South River
  const rx = riverCenterX(z);
  const rDist = Math.abs(x - rx);
  const rw = riverHalfWidth(z);
  const riverFactor = 1 - smoothstep(rw * 0.55, rw * 2.35, rDist);
  h = h * (1 - riverFactor) + (-0.72) * riverFactor;

  // Slightly raised dry bridge abutments on both banks at z = BRIDGE_Z
  const bDist = Math.hypot((x - rx) * 0.42, z - BRIDGE_Z);
  if (rDist > rw * 0.92 && bDist < 3.6) {
    const ab = 1 - smoothstep(1.2, 3.6, bDist);
    h = Math.max(h, 0.38 * ab);
  }

  // Smooth elevated citadel plateaus so our exact 3D venue models sit 100% flush!
  for (const v of VENUE_SPECS) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d < v.plateauR + 4.4) {
      const flat = 1 - smoothstep(v.plateauR, v.plateauR + 4.4, d);
      h = h * (1 - flat) + v.plateauH * flat;
    }
  }

  return h;
}

// ── 2. PROCEDURAL ROME II PATCHWORK FARMLAND & TERRAIN DETAIL TEXTURE ────────
function createCampaignTerrainTexture() {
  const W = 1024;
  const H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Neutral sunlit base so Three.js vertexColors multiply cleanly without darkening
  ctx.fillStyle = '#e7e5da';
  ctx.fillRect(0, 0, W, H);

  let seed = 7331;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const toU = x => ((x + WORLD_W / 2) / WORLD_W) * W;
  const toV = z => ((z + WORLD_D / 2) / WORLD_D) * H;

  // Draw Rome II-style patchwork medieval farmland plots & plowed furrows across the lowland valleys
  const farmZones = [
    { cx: -6.5, cz: -2.2, count: 14, spread: 4.8 },
    { cx: 6.8, cz: -1.5, count: 14, spread: 4.8 },
    { cx: -6.2, cz: 5.5, count: 12, spread: 4.5 },
    { cx: 6.6, cz: 5.8, count: 12, spread: 4.5 },
    { cx: -19.5, cz: 0.8, count: 10, spread: 4.4 },
    { cx: 19.5, cz: 1.2, count: 10, spread: 4.4 },
  ];

  for (const zone of farmZones) {
    for (let i = 0; i < zone.count; i++) {
      const fx = zone.cx + (rand() - 0.5) * zone.spread * 2;
      const fz = zone.cz + (rand() - 0.5) * zone.spread * 2;
      if (Math.abs(fx - riverCenterX(fz)) < riverHalfWidth(fz) + 2.1) continue;
      if (terrainHeight(fx, fz) > 1.75) continue;

      const u = toU(fx);
      const v = toV(fz);
      const fw = 22 + rand() * 34;
      const fh = 16 + rand() * 26;
      const angle = (rand() - 0.5) * 0.55;

      ctx.save();
      ctx.translate(u, v);
      ctx.rotate(angle);
      // Alternating golden wheat, fresh pasture, and tilled earth tones
      const palettes = ['#f2e4b0', '#dce8b5', '#cfc493', '#e8d79b', '#c9d9a4'];
      ctx.fillStyle = palettes[Math.floor(rand() * palettes.length)];
      ctx.fillRect(-fw / 2, -fh / 2, fw, fh);

      // Plowed furrow rows inside each field
      ctx.strokeStyle = 'rgba(72, 62, 34, 0.22)';
      ctx.lineWidth = 1;
      for (let fy = -fh / 2 + 3; fy < fh / 2; fy += 4) {
        ctx.beginPath();
        ctx.moveTo(-fw / 2 + 2, fy);
        ctx.lineTo(fw / 2 - 2, fy);
        ctx.stroke();
      }

      // Dark green hedgerow border framing the plot
      ctx.strokeStyle = 'rgba(42, 66, 30, 0.42)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    }
  }

  // Fine organic terrain soil, grass & alpine rock grain
  for (let i = 0; i < 9000; i++) {
    const px = rand() * W;
    const py = rand() * H;
    const sz = 1 + rand() * 2.8;
    const alpha = 0.03 + rand() * 0.06;
    ctx.fillStyle = rand() > 0.48 ? `rgba(52, 46, 30, ${alpha})` : `rgba(255, 252, 240, ${alpha})`;
    ctx.fillRect(px, py, sz, sz);
  }

  // Subtle sunlit sandy shore shading along the winding river banks
  ctx.save();
  ctx.beginPath();
  for (let z = -WORLD_D / 2; z <= WORLD_D / 2; z += 0.5) {
    const u = toU(riverCenterX(z));
    const v = toV(z);
    if (z === -WORLD_D / 2) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  }
  ctx.strokeStyle = 'rgba(222, 200, 148, 0.45)';
  ctx.lineWidth = 68;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ── 3. BUILD TERRAIN, WAR-ROOM FRAME, RIVER, BRIDGE, FORESTS & COUNTRYSIDE ───
function buildCampaignTerrain(scene) {
  const segX = 128;
  const segZ = 96;
  const geom = new THREE.PlaneGeometry(WORLD_W, WORLD_D, segX, segZ);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const baseHeights = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    baseHeights[i] = h;

    const rx = riverCenterX(z);
    const rDist = Math.abs(x - rx);
    const rw = riverHalfWidth(z);

    // Rich Rome II patchwork terrain palette (lush olive plains, warm farmland patches, alpine stone & snow)
    const patch = Math.sin(x * 0.45) * Math.sin(z * 0.45);
    if (h < -0.15) {
      c.setHex(0x6e6246);
    } else if (rDist < rw + 1.15 && h < 0.45) {
      c.setHex(0xc2ac7c);
    } else if (h > 3.15) {
      c.setHex(0xe8edf0);
    } else if (h > 2.2) {
      c.setHex(0x747b74);
    } else if (h > 1.55) {
      c.setHex(0x526b42);
    } else if (patch > 0.32 && Math.abs(x) < 23 && Math.abs(z) < 19) {
      c.setHex(0x9ea055);
    } else if (patch < -0.25) {
      c.setHex(0x557644);
    } else {
      c.setHex(0x6c8a50);
    }

    // Subtle stone-earth clearing directly under each venue plateau
    for (const v of VENUE_SPECS) {
      const d = Math.hypot(x - v.x, z - v.z);
      if (d < v.plateauR + 0.65) {
        const blend = 1 - smoothstep(v.plateauR - 0.8, v.plateauR + 0.65, d);
        c.lerp(new THREE.Color(0x968c70), blend * 0.55);
      }
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const terrainTex = createCampaignTerrainTexture();
  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.04,
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

  // Winding Reflective Water Ribbon at y = -0.18
  const waterGeom = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 48, 36);
  waterGeom.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x26627e,
    roughness: 0.18,
    metalness: 0.42,
    transparent: true,
    opacity: 0.90,
  });
  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.position.y = -0.18;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  return { terrainMesh, terrainGeom: geom, baseHeights, waterMesh };
}

function buildCentralBridge(parent) {
  const bridge = new THREE.Group();
  const bx = riverCenterX(BRIDGE_Z);
  bridge.position.set(bx, 0, BRIDGE_Z);
  // Align perpendicular to local river tangent
  const dx = riverCenterX(BRIDGE_Z + 0.5) - riverCenterX(BRIDGE_Z - 0.5);
  bridge.rotation.y = -Math.atan2(dx, 1.0);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb7ac94, roughness: 0.84, metalness: 0.06 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x6c6558, roughness: 0.88, metalness: 0.08 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.72 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff771a, emissiveIntensity: 1.6 });

  const span = 6.2;
  // Slightly arched stone bridge deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.34, 1.85), stoneMat);
  deck.position.y = 0.48;
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);

  // Twin side stone parapets + gilded finials
  for (const side of [-0.84, 0.84]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(span + 0.3, 0.34, 0.16), darkStone);
    rail.position.set(0, 0.78, side);
    rail.castShadow = true;
    bridge.add(rail);

    for (const px of [-span / 2, 0, span / 2]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.36), darkStone);
      pier.position.set(px, 0.34, side);
      pier.castShadow = true;
      bridge.add(pier);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.40), brassMat);
      cap.position.set(px, 1.00, side);
      bridge.add(cap);

      if (px === 0) {
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), emberMat);
        flame.position.set(px, 1.15, side);
        bridge.add(flame);
      }
    }
  }

  // Twin stone bridge gatehouse turrets flanking the West & East entrances
  const roofCrimson = new THREE.MeshStandardMaterial({ color: 0x8f2731, roughness: 0.72 });
  for (const endX of [-span / 2 - 0.1, span / 2 + 0.1]) {
    for (const side of [-0.95, 0.95]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.45, 8), stoneMat);
      turret.position.set(endX, 0.86, side);
      turret.castShadow = true;
      bridge.add(turret);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.62, 8), roofCrimson);
      spire.position.set(endX, 1.88, side);
      spire.castShadow = true;
      bridge.add(spire);
    }
  }

  // Two stone river piers supporting the central arch
  for (const px of [-1.4, 1.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 1.95), darkStone);
    leg.position.set(px, -0.08, 0);
    leg.castShadow = true;
    bridge.add(leg);
  }

  parent.add(bridge);
  return bridge;
}

// Living Medieval Countryside: Windmills, Villages, Watchtowers, Festival Tents, Docks,
// River Barges, Alpine Boulders, Drifting Clouds & Soaring Eagles!
function buildLivingCountryside(parent) {
  const country = new THREE.Group();
  const spinningSails = [];
  const riverBoats = [];
  const driftingClouds = [];
  const soaringEagles = [];
  const towerFlames = [];

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
  const tentColors = [
    new THREE.MeshStandardMaterial({ color: 0x992a35, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x265278, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x2c6345, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0xc99c3c, roughness: 0.68 }),
  ];

  // ── A. 3 ROTATING MEDIEVAL WINDMILLS ON SCENIC HILLCRESTS ──────────────────
  const windmillCoords = [
    { x: -5.4, z: -1.6, rotY: 0.65 },
    { x: 6.6, z: 2.8, rotY: -0.85 },
    { x: -22.2, z: -0.6, rotY: 0.35 },
  ];
  for (const wm of windmillCoords) {
    const g = new THREE.Group();
    const y = terrainHeight(wm.x, wm.z);
    g.position.set(wm.x, y, wm.z);
    g.rotation.y = wm.rotY;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.56, 1.35, 8), plasterMat);
    base.position.y = 0.64;
    base.castShadow = true;
    g.add(base);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.52, 8), roofSlate);
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
  }

  // ── B. 5 MINIATURE MEDIEVAL VILLAGES / HAMLETS WITH COTTAGES & HAYSTACKS ───
  const hamlets = [
    { cx: -8.4, cz: 4.0, houses: 4 },
    { cx: 6.6, cz: -5.8, houses: 4 },
    { cx: 21.4, cz: 2.2, houses: 4 },
    { cx: -21.2, cz: -2.4, houses: 3 },
    { cx: 2.4, cz: 15.0, houses: 3 },
  ];
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
    }
    // Golden haystacks beside each hamlet
    for (let k = 0; k < 2; k++) {
      const sx = ham.cx + (k === 0 ? 1.45 : -1.35);
      const sz = ham.cz + (k === 0 ? -0.9 : 1.0);
      const sy = terrainHeight(sx, sz);
      if (sy < 0.25) continue;
      const hay = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 7), hayMat);
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
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 8), sailCloth);
      base.position.y = 0.16;
      base.castShadow = true;
      tent.add(base);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.55, 8), tentColors[(i + cIdx) % tentColors.length]);
      top.position.y = 0.58;
      top.castShadow = true;
      tent.add(top);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), goldMat);
      finial.position.y = 0.88;
      tent.add(finial);
      country.add(tent);
    }
  });

  // ── E. RIVERSIDE WOODEN DOCKS & 2 ANIMATED SAILING RIVER BARGES ────────────
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
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.46, 5), timberMat);
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
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.98, 5), timberMat);
    mast.position.y = 0.56;
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.04), b === 0 ? sailCloth : tentColors[0]);
    sail.position.set(0, 0.62, 0.04);
    sail.castShadow = true;
    boat.add(sail);
    country.add(boat);
    riverBoats.push({ mesh: boat, dir: b === 0 ? 1 : -1, phase: b * 0.5, zMin: -21, zMax: 21 });
  }

  // ── F. INSTANCED CRAGGY ALPINE ROCKS & RIVERBANK BOULDERS (~120) ───────────
  let rSeed = 4049;
  const rRand = () => {
    rSeed = (rSeed * 16807) % 2147483647;
    return (rSeed - 1) / 2147483646;
  };
  const rockPts = [];
  for (let a = 0; a < 500 && rockPts.length < 120; a++) {
    const rx = (rRand() - 0.5) * (WORLD_W - 4);
    const rz = (rRand() - 0.5) * (WORLD_D - 4);
    const ry = terrainHeight(rx, rz);
    const nearMountain = ry > 1.75;
    const nearBank = Math.abs(Math.abs(rx - riverCenterX(rz)) - riverHalfWidth(rz)) < 1.0 && ry > -0.15;
    if (!nearMountain && !nearBank) continue;
    let clear = true;
    for (const v of VENUE_SPECS) {
      if (Math.hypot(rx - v.x, rz - v.z) < v.plateauR + 1.1) { clear = false; break; }
    }
    if (!clear) continue;
    rockPts.push({ x: rx, y: ry, z: rz, s: nearMountain ? 0.45 + rRand() * 0.85 : 0.22 + rRand() * 0.34, r: rRand() * 6.28 });
  }
  const rockGeom = new THREE.DodecahedronGeometry(0.55, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x767972, roughness: 0.92, flatShading: true });
  const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, rockPts.length);
  rockInst.castShadow = true;
  const rDummy = new THREE.Object3D();
  rockPts.forEach((p, idx) => {
    rDummy.position.set(p.x, p.y + p.s * 0.18, p.z);
    rDummy.scale.set(p.s * 1.2, p.s * 0.72, p.s);
    rDummy.rotation.set(p.r * 0.3, p.r, p.r * 0.2);
    rDummy.updateMatrix();
    rockInst.setMatrixAt(idx, rDummy.matrix);
  });
  rockInst.instanceMatrix.needsUpdate = true;
  country.add(rockInst);

  // ── G. HIGH-ALTITUDE DRIFTING CAMPAIGN CLOUDS & SOARING VALLEY EAGLES ──────
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff8ec, transparent: true, opacity: 0.22, depthWrite: false });
  const cloudSeeds = [
    { x: -18, y: 12.5, z: -15, s: 1.35, speed: 0.38 },
    { x: 6, y: 13.2, z: -18, s: 1.55, speed: 0.30 },
    { x: 22, y: 12.0, z: -6, s: 1.25, speed: 0.42 },
    { x: -10, y: 12.8, z: 12, s: 1.40, speed: 0.34 },
  ];
  for (const cs of cloudSeeds) {
    const cl = new THREE.Group();
    for (const [ox, oz, rad] of [[-1.6, 0, 1.5], [0, -0.35, 2.0], [1.7, 0.2, 1.45], [0.4, 0.65, 1.3]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 6), cloudMat);
      puff.position.set(ox, 0, oz);
      puff.scale.set(1.25, 0.32, 0.92);
      cl.add(puff);
    }
    cl.position.set(cs.x, cs.y, cs.z);
    cl.scale.setScalar(cs.s);
    country.add(cl);
    driftingClouds.push({ mesh: cl, speed: cs.speed });
  }

  const eagleMat = new THREE.MeshBasicMaterial({ color: 0x2a231c, side: THREE.DoubleSide });
  for (let e = 0; e < 2; e++) {
    const bird = new THREE.Group();
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.14), eagleMat);
    lw.position.x = -0.20;
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.14), eagleMat);
    rw.position.x = 0.20;
    bird.add(lw, rw);
    country.add(bird);
    soaringEagles.push({ mesh: bird, lw, rw, cx: e === 0 ? -4 : 9, cz: e === 0 ? -9 : 4, r: 5.5 + e * 1.8, y: 7.4 + e * 1.1, speed: 0.26 + e * 0.07, phase: e * 2.5 });
  }

  parent.add(country);
  return { country, spinningSails, riverBoats, driftingClouds, soaringEagles, towerFlames };
}

function buildForests(parent) {
  const forestGroup = new THREE.Group();
  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const positions = [];
  for (let attempt = 0; attempt < 1100 && positions.length < 340; attempt++) {
    const x = (rand() - 0.5) * (WORLD_W - 6);
    const z = (rand() - 0.5) * (WORLD_D - 5);
    const h = terrainHeight(x, z);
    if (h < 0.25 || h > 2.45) continue;

    // Keep clear of winding river & bridge
    const rx = riverCenterX(z);
    if (Math.abs(x - rx) < riverHalfWidth(z) + 1.8) continue;
    if (Math.hypot(x - riverCenterX(BRIDGE_Z), z - BRIDGE_Z) < 4.5) continue;

    // Keep clear of all 4 venue plateaus & approach roads
    let blocked = false;
    for (const v of VENUE_SPECS) {
      if (Math.hypot(x - v.x, z - v.z) < v.plateauR + 1.55) {
        blocked = true;
        break;
      }
      // Approximate road corridor from venue to bridge
      const bx = riverCenterX(BRIDGE_Z);
      const vx = bx - v.x;
      const vz = BRIDGE_Z - v.z;
      const lenSq = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - v.x) * vx + (z - v.z) * vz) / lenSq));
      const projX = v.x + t * vx;
      const projZ = v.z + t * vz;
      if (Math.hypot(x - projX, z - projZ) < 1.55) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    positions.push({
      x,
      y: h,
      z,
      s: 0.65 + rand() * 0.62,
      pine: z < 3 || rand() > 0.35,
    });
  }

  const trunks = positions.length;
  const trunkGeom = new THREE.CylinderGeometry(0.06, 0.10, 0.42, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3522, roughness: 0.92 });
  const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, trunks);

  const pines = positions.filter(p => p.pine);
  const oaks = positions.filter(p => !p.pine);

  const pineGeom = new THREE.ConeGeometry(0.42, 1.25, 6);
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2d4b2d, roughness: 0.88, flatShading: true });
  const pineMesh = new THREE.InstancedMesh(pineGeom, pineMat, pines.length);
  pineMesh.castShadow = true;

  const oakGeom = new THREE.DodecahedronGeometry(0.46, 0);
  const oakMat = new THREE.MeshStandardMaterial({ color: 0x4a6b35, roughness: 0.88, flatShading: true });
  const oakMesh = new THREE.InstancedMesh(oakGeom, oakMat, oaks.length);
  oakMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  positions.forEach((p, idx) => {
    dummy.position.set(p.x, p.y + 0.18 * p.s, p.z);
    dummy.scale.setScalar(p.s);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(idx, dummy.matrix);
  });
  pines.forEach((p, idx) => {
    dummy.position.set(p.x, p.y + 0.86 * p.s, p.z);
    dummy.scale.set(p.s, p.s * 1.08, p.s);
    dummy.rotation.set(0, idx * 0.7, 0);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(idx, dummy.matrix);
  });
  oaks.forEach((p, idx) => {
    dummy.position.set(p.x, p.y + 0.64 * p.s, p.z);
    dummy.scale.set(p.s * 1.15, p.s * 0.88, p.s * 1.15);
    dummy.rotation.set(0, idx * 0.9, 0);
    dummy.updateMatrix();
    oakMesh.setMatrixAt(idx, dummy.matrix);
  });

  trunkMesh.instanceMatrix.needsUpdate = true;
  pineMesh.instanceMatrix.needsUpdate = true;
  oakMesh.instanceMatrix.needsUpdate = true;

  forestGroup.add(trunkMesh, pineMesh, oakMesh);
  parent.add(forestGroup);
  return forestGroup;
}

// Animated dashed 3D trade/travel routes connecting all 4 venues via the central bridge
function buildCampaignRoutes(parent) {
  const routesGroup = new THREE.Group();
  const bx = riverCenterX(BRIDGE_Z);
  const routeEntries = [];

  for (const v of VENUE_SPECS) {
    // Route from venue plateau edge -> mid bend -> bridge abutment -> bridge center
    const bankSign = v.x < bx ? -1 : 1;
    const rawPts = [
      new THREE.Vector3(v.x + bankSign * -2.2, 0, v.z + (v.z < BRIDGE_Z ? 1.8 : -1.8)),
      new THREE.Vector3((v.x + bx) * 0.56, 0, (v.z + BRIDGE_Z) * 0.52 + (v.z < 0 ? -0.9 : 0.9)),
      new THREE.Vector3(bx + bankSign * 3.25, 0, BRIDGE_Z),
      new THREE.Vector3(bx, 0, BRIDGE_Z),
    ];

    const curve = new THREE.CatmullRomCurve3(rawPts);
    const sampled = curve.getPoints(44).map(pt => {
      const distBridge = Math.hypot(pt.x - bx, pt.z - BRIDGE_Z);
      const y = distBridge < 3.1 ? 0.72 : terrainHeight(pt.x, pt.z) + 0.12;
      return new THREE.Vector3(pt.x, y, pt.z);
    });
    const terrainCurve = new THREE.CatmullRomCurve3(sampled);

    // Subtle dirt roadbed ribbon hugging the hills
    const roadGeom = new THREE.TubeGeometry(terrainCurve, 44, 0.16, 4, false);
    roadGeom.scale(1, 0.25, 1);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0xb9a06f, roughness: 0.96, metalness: 0.02 });
    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.position.y = 0.02;
    routesGroup.add(roadMesh);

    // Dashed golden Rome II travel route line hovering slightly above roadbed
    const linePts = terrainCurve.getPoints(56).map(p => new THREE.Vector3(p.x, p.y + 0.12, p.z));
    const lineGeom = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xe6c873,
      dashSize: 0.55,
      gapSize: 0.42,
      transparent: true,
      opacity: 0.78,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    line.computeLineDistances();
    routesGroup.add(line);

    // Animated golden travel pips gliding smoothly along each route (classic Total War trade movement!)
    const pipGeom = new THREE.SphereGeometry(0.14, 8, 8);
    const pipMat = new THREE.MeshBasicMaterial({ color: 0xf7e097, transparent: true, opacity: 0.92 });
    const pips = [];
    for (let k = 0; k < 4; k++) {
      const pip = new THREE.Mesh(pipGeom, pipMat);
      routesGroup.add(pip);
      pips.push({ mesh: pip, offset: k / 4 });
    }

    routeEntries.push({ venueId: v.id, curve: terrainCurve, line, lineMat, roadMesh, pips, pipMat });
  }

  parent.add(routesGroup);
  return { routesGroup, routeEntries };
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
  const terrain = buildCampaignTerrain(worldGroup);
  const detailGroup = new THREE.Group();
  worldGroup.add(detailGroup);

  buildCentralBridge(detailGroup);
  buildForests(detailGroup);
  const countryside = buildLivingCountryside(detailGroup);
  const { routeEntries } = buildCampaignRoutes(detailGroup);

  // Mount the EXACT 4 3D architectural venue models from venue3d.js onto their campaign plateaus!
  const venueNodes = new Map();
  const rayTargets = [];
  const allAnimatedPennants = [];
  const allAnimatedEmbers = [];

  const terraceStone = new THREE.MeshStandardMaterial({ color: 0xa99c80, roughness: 0.86, metalness: 0.05 });
  const terraceRim = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.42, metalness: 0.65 });

  for (const spec of VENUE_SPECS) {
    const holder = new THREE.Group();
    holder.position.set(spec.x, spec.plateauH, spec.z);

    // Subtle stone citadel terrace pad grounding the miniature cleanly on the hill
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(spec.plateauR - 0.15, spec.plateauR + 0.55, 0.36, 28), terraceStone);
    pad.position.y = -0.14;
    pad.receiveShadow = true;
    holder.add(pad);

    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(spec.plateauR - 0.12, 0.055, 6, 36), terraceRim);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.05;
    holder.add(rimRing);

    // Instantiate the EXACT 3D venue model from venue3d.js!
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
      built.root.position.y = 0.06;
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

    // 3D terrain & models physically rise out of / fold back into the 2D illustrated footprints!
    const reliefY = 0.03 + relief * 0.97;
    terrain.terrainMesh.scale.y = reliefY;
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

    // Highlight connecting trade/travel routes for active venue
    for (const r of routeEntries) {
      const isSelected = selectedVenueId === r.venueId;
      const dim = selectedVenueId !== null && !isSelected;
      r.lineMat.color.setHex(isSelected ? 0xffe48f : 0xdcb963);
      r.lineMat.opacity = isSelected ? 0.98 : (dim ? 0.34 : 0.76);
      r.pipMat.opacity = isSelected ? 1.0 : (dim ? 0.25 : 0.85);
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
        <span class="atlas-3d-tooltip-cta">${selectedVenueId === venueId ? 'Selected · Viewing in Herald’s Desk' : 'Left-click to zoom & inspect events'}</span>
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
    selectedVenueId = venueId;
    refreshBadges();
    focusVenueCamera(venueId);
    window.TG?.atlas?.selectVenue?.(venueId, { source: '3d', focus: false });
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

  // Smooth exponentially-damped wheel zoom + auto-Strategic 2D Illustrated View at max zoom-out
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    activeTween = null;
    const delta = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 140 : e.deltaY;
    const clamped = Math.max(-140, Math.min(140, delta));
    const currentDist = zoomTargetDist ?? camera.position.distanceTo(controls.target);
    const factor = Math.exp(clamped * 0.00055);
    zoomTargetDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, currentDist * factor));
  }, { passive: false });

  // Scrolling wheel IN on the 2D Strategic Map swoops smoothly back into the 3D Campaign Map!
  mapPlaneEl?.addEventListener('wheel', e => {
    if (!strategicMode) return;
    if (e.deltaY < -10) {
      e.preventDefault();
      manualStrategic = false;
      setStrategicView(false, { manual: false, animateCam: true });
    }
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

    // 2. Animate Campaign Routes, Fluttering Venue Pennants, Flickering Embers & Territory Ring Pulse
    if (!reducedMotion.matches) {
      for (const r of routeEntries) {
        const speed = selectedVenueId === r.venueId ? 0.16 : 0.085;
        for (const pip of r.pips) {
          const u = (pip.offset + t * speed) % 1;
          const pt = r.curve.getPointAt(u);
          pip.mesh.position.set(pt.x, pt.y + 0.16, pt.z);
        }
      }

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

      // Gentle river water shimmer
      terrain.waterMesh.position.y = -0.18 + Math.sin(t * 1.4) * 0.015;

      // Spin medieval windmill sails
      for (const wm of countryside.spinningSails) {
        wm.hub.rotation.z = -t * wm.speed;
      }

      // Flicker frontier watchtower signal braziers
      for (const tf of countryside.towerFlames) {
        const p = 0.88 + Math.sin(t * 7.2 + tf.phase) * 0.16;
        tf.mesh.scale.set(p, p * 1.35, p);
      }

      // Sail river barges smoothly along the winding river channel
      for (const rb of countryside.riverBoats) {
        const span = rb.zMax - rb.zMin;
        const raw = ((t * 0.65 + rb.phase * span) % span);
        const bz = rb.dir > 0 ? rb.zMin + raw : rb.zMax - raw;
        const bx = riverCenterX(bz) + rb.dir * 0.35;
        const nextZ = bz + rb.dir * 0.5;
        const nextX = riverCenterX(nextZ) + rb.dir * 0.35;
        rb.mesh.position.set(bx, -0.14 + Math.sin(t * 2.4 + rb.phase * 6) * 0.025, bz);
        rb.mesh.rotation.y = Math.atan2(nextX - bx, nextZ - bz);
      }

      // Drift translucent campaign clouds softly across the realm
      for (const cl of countryside.driftingClouds) {
        cl.mesh.position.x += dt * cl.speed;
        if (cl.mesh.position.x > WORLD_W / 2 + 8) cl.mesh.position.x = -WORLD_W / 2 - 8;
      }

      // Circle soaring eagles high above the valleys
      for (const eg of countryside.soaringEagles) {
        const a = t * eg.speed + eg.phase;
        const ex = eg.cx + Math.cos(a) * eg.r;
        const ez = eg.cz + Math.sin(a) * eg.r;
        eg.mesh.position.set(ex, eg.y + Math.sin(t * 1.1 + eg.phase) * 0.25, ez);
        eg.mesh.rotation.y = -a;
        const flap = Math.sin(t * 5.2 + eg.phase) * 0.28;
        eg.lw.rotation.z = flap;
        eg.rw.rotation.z = -flap;
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
