import {createVenuePeople,readPeoplePreference,writePeoplePreference} from './venue-people.mjs';
import {buildVenueLighting} from './venue-lighting.mjs';
import {buildVenueSurroundings,fitSurroundingsPreset,festivalLabelMaterial} from './venue-surroundings.mjs';
import {effectiveMotion} from './atlas-runtime.mjs';
import {atmosphereProfile, mountLivingVenue} from './living-venues.mjs';
import {royalSeatPosition} from './seat-layout.mjs';
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

/**
 * Modular 3D architectural venue renderer for Tourney Gate gatherings.
 * Each gathering registers a builder keyed by event slug.
 *
 * Coordinate convention for Silver Lance ("The Royal Lists"):
 * Direct 1:1 mapping from templates/venue_art.html viewBox="0 0 360 185":
 *   toX(svgX) = (svgX - 180) * 0.1
 *   toZ(svgY) = (svgY - 92.5) * 0.1
 *   +Y is vertical elevation above the tournament grounds.
 */

const MOTION = effectiveMotion();
const SVG_CX = 180;
const SVG_CY = 92.5;
const SVG_SCALE = 0.1;

const toX = x => (x - SVG_CX) * SVG_SCALE;
const toZ = y => (y - SVG_CY) * SVG_SCALE;

function makeMaterials() {
  return {
    ground: new THREE.MeshStandardMaterial({ color: 0x1e3327, roughness: 0.92, metalness: 0.04 }),
    plinthEdge: new THREE.MeshStandardMaterial({ color: 0xc9ae70, roughness: 0.36, metalness: 0.62 }),
    turf: new THREE.MeshStandardMaterial({ color: 0x35503a, roughness: 0.9, metalness: 0.02 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xa6926a, roughness: 0.94, metalness: 0.02 }),
    sandLane: new THREE.MeshStandardMaterial({ color: 0x958059, roughness: 0.96, metalness: 0.02 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xcdc4ad, roughness: 0.82, metalness: 0.05 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x9c9581, roughness: 0.86, metalness: 0.05 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x5c432c, roughness: 0.78, metalness: 0.06 }),
    timberLight: new THREE.MeshStandardMaterial({ color: 0x7c5c3d, roughness: 0.76, metalness: 0.06 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xe3c786, roughness: 0.3, metalness: 0.72 }),
    brassBright: new THREE.MeshStandardMaterial({ color: 0xf1d99d, roughness: 0.24, metalness: 0.78, emissive: 0x3c2d0d, emissiveIntensity: 0.28 }),
    wine: new THREE.MeshStandardMaterial({ color: 0x7d3038, roughness: 0.72, metalness: 0.08 }),
    nobleGreen: new THREE.MeshStandardMaterial({ color: 0x2f543d, roughness: 0.74, metalness: 0.06 }),
    benchOak: new THREE.MeshStandardMaterial({ color: 0x9b7a52, roughness: 0.78, metalness: 0.05 }),
    creamCloth: new THREE.MeshStandardMaterial({ color: 0xe8ddc2, roughness: 0.72, metalness: 0.05 }),
    guideLine: new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.34 }),
    guideRing: new THREE.MeshBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
    highlightMat: new THREE.MeshBasicMaterial({ color: 0xf3d790, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  };
}

function addBox(parent, w, h, d, mat, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Renders an exact count of individual miniature seats in two InstancedMesh draw calls
 * (seat cushions + backrests), preserving crisp architectural performance.
 */
function addInstancedSeatGroup(parent, seats, seatMat, backMat, scale = 1) {
  if (!seats.length) return;
  const seatGeom = new THREE.BoxGeometry(0.145 * scale, 0.085 * scale, 0.14 * scale);
  const backGeom = new THREE.BoxGeometry(0.145 * scale, 0.155 * scale, 0.042 * scale);
  const seatMesh = new THREE.InstancedMesh(seatGeom, seatMat, seats.length);
  const backMesh = new THREE.InstancedMesh(backGeom, backMat || seatMat, seats.length);
  seatMesh.receiveShadow = true;
  backMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const backOffset = new THREE.Vector3();
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.rotY || 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    seatMesh.setMatrixAt(i, dummy.matrix);

    backOffset.set(0, 0.055 * scale, -0.058 * scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rotY || 0);
    dummy.position.set(s.x + backOffset.x, s.y + backOffset.y, s.z + backOffset.z);
    dummy.updateMatrix();
    backMesh.setMatrixAt(i, dummy.matrix);
  }
  seatMesh.instanceMatrix.needsUpdate = true;
  backMesh.instanceMatrix.needsUpdate = true;
  parent.add(seatMesh, backMesh);
}

/**
 * Creates a crisp miniature brass-and-walnut tabletop label plaque (e.g. "TABLE 1").
 */
function makeTablePlaque(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#382517';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e5c680';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = '#f5e1b0';
  ctx.font = '600 38px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45, metalness: 0.25 });
}

/**
 * Renders plush high-backed royal Noble armchairs with gold armrests & gilded crests
 * (visually distinct from communal timber benches).
 */
function addInstancedNobleArmchairs(parent, seats, velvetMat, goldMat, scale = 1) {
  if (!seats.length) return;
  const cushionGeom = new THREE.BoxGeometry(0.24 * scale, 0.11 * scale, 0.21 * scale);
  const backGeom = new THREE.BoxGeometry(0.24 * scale, 0.28 * scale, 0.055 * scale);
  const armGeom = new THREE.BoxGeometry(0.045 * scale, 0.14 * scale, 0.22 * scale);
  const crestGeom = new THREE.BoxGeometry(0.26 * scale, 0.045 * scale, 0.07 * scale);

  const cushionMesh = new THREE.InstancedMesh(cushionGeom, velvetMat, seats.length);
  const backMesh = new THREE.InstancedMesh(backGeom, velvetMat, seats.length);
  const armL = new THREE.InstancedMesh(armGeom, goldMat, seats.length);
  const armR = new THREE.InstancedMesh(armGeom, goldMat, seats.length);
  const crestMesh = new THREE.InstancedMesh(crestGeom, goldMat, seats.length);
  cushionMesh.receiveShadow = true;
  backMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const off = new THREE.Vector3();

  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    const ry = s.rotY || 0;
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(1, 1, 1);

    dummy.position.set(s.x, s.y, s.z);
    dummy.updateMatrix();
    cushionMesh.setMatrixAt(i, dummy.matrix);

    off.set(0, 0.10 * scale, -0.09 * scale).applyAxisAngle(yAxis, ry);
    dummy.position.set(s.x + off.x, s.y + off.y, s.z + off.z);
    dummy.updateMatrix();
    backMesh.setMatrixAt(i, dummy.matrix);

    off.set(0, 0.25 * scale, -0.09 * scale).applyAxisAngle(yAxis, ry);
    dummy.position.set(s.x + off.x, s.y + off.y, s.z + off.z);
    dummy.updateMatrix();
    crestMesh.setMatrixAt(i, dummy.matrix);

    off.set(-0.125 * scale, 0.06 * scale, -0.01 * scale).applyAxisAngle(yAxis, ry);
    dummy.position.set(s.x + off.x, s.y + off.y, s.z + off.z);
    dummy.updateMatrix();
    armL.setMatrixAt(i, dummy.matrix);

    off.set(0.125 * scale, 0.06 * scale, -0.01 * scale).applyAxisAngle(yAxis, ry);
    dummy.position.set(s.x + off.x, s.y + off.y, s.z + off.z);
    dummy.updateMatrix();
    armR.setMatrixAt(i, dummy.matrix);
  }
  [cushionMesh, backMesh, armL, armR, crestMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; });
  parent.add(cushionMesh, backMesh, armL, armR, crestMesh);
}

/**
 * Generates the illuminated live tournament big-screen broadcast texture for the
 * exterior Groundling Viewing Plaza outside the Iron Colosseum.
 */
function makeColosseumScreenMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');

  // Deep dramatic arena broadcast backdrop
  const grad = ctx.createRadialGradient(256, 152, 20, 256, 152, 260);
  grad.addColorStop(0, '#365466');
  grad.addColorStop(0.55, '#1a2c38');
  grad.addColorStop(1, '#0d171e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 288);

  // Inner brass broadcast border
  ctx.strokeStyle = '#d9bc7a';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 268);

  // Top broadcast header bar
  ctx.fillStyle = 'rgba(13, 23, 30, 0.85)';
  ctx.fillRect(12, 12, 488, 42);
  ctx.fillStyle = '#e0423f';
  ctx.beginPath();
  ctx.arc(36, 33, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffdf9e';
  ctx.font = '700 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('LIVE ARENA FEED', 52, 39);
  ctx.fillStyle = '#d8c28d';
  ctx.font = '600 15px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText('THE IRON COLOSSEUM · MAIN BOUT', 488, 39);

  // Stylized arena sand ring in the live broadcast frame
  ctx.strokeStyle = 'rgba(227, 199, 134, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(256, 152, 146, 62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(176, 152, 109, 0.22)';
  ctx.fill();

  // Crossed golden swords centerpiece
  ctx.strokeStyle = '#f3d896';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(222, 124); ctx.lineTo(290, 180);
  ctx.moveTo(290, 124); ctx.lineTo(222, 180);
  ctx.stroke();

  // Opposing gladiator house cards
  ctx.fillStyle = '#7d2d34';
  ctx.fillRect(36, 118, 122, 66);
  ctx.strokeStyle = '#e3c786';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 118, 122, 66);
  ctx.fillStyle = '#faf0d7';
  ctx.font = '700 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('CRIMSON', 97, 146);
  ctx.fillText('GUARD', 97, 166);

  ctx.fillStyle = '#2d4e66';
  ctx.fillRect(354, 118, 122, 66);
  ctx.strokeRect(354, 118, 122, 66);
  ctx.fillStyle = '#faf0d7';
  ctx.fillText('IRON', 415, 146);
  ctx.fillText('VANGUARD', 415, 166);

  // Bottom live ticker strip
  ctx.fillStyle = 'rgba(13, 23, 30, 0.9)';
  ctx.fillRect(12, 236, 488, 40);
  ctx.fillStyle = '#ebd49d';
  ctx.font = '600 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GROUNDLING VIEWING PLAZA  ·  ROUND II  ·  CHOREOGRAPHED SPECTACLE', 256, 261);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.42,
    roughness: 0.35,
    metalness: 0.1,
  });
}

function createDashedLine(points, mat) {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geom, mat);
  return line;
}

function createArrowMesh(xCenter, zStart, zEnd, dirZ, mat) {
  // Exact directional arrow matching SVG:
  // West: M45 58v68 + M38 64l7-9 7 9 (points -Z)
  // East: M315 58v68 + M308 120l7 9 7-9 (points +Z)
  const group = new THREE.Group();
  const shaftLen = Math.abs(zEnd - zStart);
  const shaftMid = (zStart + zEnd) / 2;
  const y = 0.06;

  // Recessed stone walkway under arrow
  addBox(group, 1.35, 0.04, shaftLen + 1.4, mat.stoneDark, xCenter, 0.02, shaftMid, false);

  // Raised antique-brass directional shaft
  addBox(group, 0.14, 0.07, shaftLen, mat.brassBright, xCenter, y, shaftMid, true);

  // Sculpted chevron arrowhead matching 7-unit half-width, 9-unit length
  const tipZ = dirZ < 0 ? zStart - 0.35 : zEnd + 0.35;
  const wingZ = dirZ < 0 ? tipZ + 0.9 : tipZ - 0.9;
  const wingW = 0.7;
  const wingLen = Math.hypot(wingW, 0.9);
  const angle = Math.atan2(wingW, 0.9);

  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, wingLen), mat.brassBright);
    bar.position.set(xCenter + side * (wingW / 2), y + 0.005, (tipZ + wingZ) / 2);
    bar.rotation.y = dirZ < 0 ? -side * angle : side * angle;
    bar.castShadow = true;
    bar.receiveShadow = true;
    group.add(bar);
  }

  // Ceremonial timber & brass bollard posts framing the lane ends
  for (const zPost of [zStart + 0.4, zEnd - 0.4]) {
    for (const dx of [-0.62, 0.62]) {
      addBox(group, 0.14, 0.42, 0.14, mat.timber, xCenter + dx, 0.21, zPost, true);
      addBox(group, 0.18, 0.08, 0.18, mat.brass, xCenter + dx, 0.45, zPost, false);
    }
  }
  return group;
}

/**
 * Builds the Zero-Obstruction 3-Tier Medieval Tournament Stadium at The Royal Lists:
 *   - The Tourney of the Silver Lance (isMelee = false: Jousting Tilt, Forest Green & Gold)
 *   - Battle of the Five Banners      (isMelee = true:  Grand Melee, Five House War-Banners, Crimson & Winter Twilight)
 *
 * Exact 1:1 match to the 2D booking venue map with mathematically verified unobstructed sightlines:
 *   - TIER 1 · ROYAL BOX (20 seats: Row A [10] North + Row B [10] South)
 *       Open-top ringside marble & crimson-velvet terrace with 10 plush gold-armed Royal Thrones per side,
 *       personal marble welcome-drink tables & golden chalices, and gilded parapet shields. Zero roof blocking upper tiers!
 *   - TIER 2 · NOBLE STAND (80 seats: Rows A–D [4×10] North + Rows E–H [4×10] South)
 *       Elevated mid-deck gallery rising cleanly above the Royal Box with 4 stepped rows × 10 cushioned
 *       wooden gallery chairs per side, carpeted aisles, and stone-and-brass mid-balustrade.
 *   - TIER 3 · COMMONER'S BENCH (200 seats: Rows A–J [10×10] North + Rows K–T [10×10] South)
 *       Steeply raked 10-row open-air rustic weathered-oak communal timber bleachers (zero cushions/armrests),
 *       crowned ONLY behind Row 10 by a high cantilevered stadium canopy well above all sightlines + 4 corner towers.
 */
function buildRoyalListsStadium(isMelee) {
  const root = new THREE.Group();
  const baseMat = makeMaterials();
  const mat = isMelee
    ? {
      ...baseMat,
      ground: new THREE.MeshStandardMaterial({ color: 0x351e26, roughness: 0.92, metalness: 0.05 }),
      plinthEdge: new THREE.MeshStandardMaterial({ color: 0xdfb97a, roughness: 0.34, metalness: 0.66 }),
      turf: new THREE.MeshStandardMaterial({ color: 0x3d3336, roughness: 0.92, metalness: 0.04 }),
      sand: new THREE.MeshStandardMaterial({ color: 0x867567, roughness: 0.95, metalness: 0.03 }),
      sandLane: new THREE.MeshStandardMaterial({ color: 0x736256, roughness: 0.96, metalness: 0.03 }),
      marble: new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.72, metalness: 0.06 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xc0b6a9, roughness: 0.84, metalness: 0.06 }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x6d6064, roughness: 0.86, metalness: 0.08 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x453028, roughness: 0.8, metalness: 0.08 }),
      timberLight: new THREE.MeshStandardMaterial({ color: 0x67493a, roughness: 0.78, metalness: 0.08 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x34343b, roughness: 0.46, metalness: 0.74 }),
      ember: new THREE.MeshStandardMaterial({ color: 0xffa640, emissive: 0xff6b1a, emissiveIntensity: 1.5, roughness: 0.35 }),
      royalVelvet: new THREE.MeshStandardMaterial({ color: 0x8a2432, roughness: 0.64, metalness: 0.08, side: THREE.DoubleSide }),
      royalCarpet: new THREE.MeshStandardMaterial({ color: 0x631d27, roughness: 0.84, metalness: 0.04 }),
      nobleCarpet: new THREE.MeshStandardMaterial({ color: 0x263f57, roughness: 0.84, metalness: 0.04 }),
      nobleCushion: new THREE.MeshStandardMaterial({ color: 0x305578, roughness: 0.72, metalness: 0.08 }),
      plankOak: new THREE.MeshStandardMaterial({ color: 0x8f6f4c, roughness: 0.88, metalness: 0.03 }),
      roofFabric: new THREE.MeshStandardMaterial({ color: 0x5c242e, roughness: 0.78, metalness: 0.05 }),
    }
    : {
      ...baseMat,
      marble: new THREE.MeshStandardMaterial({ color: 0xebe4d4, roughness: 0.70, metalness: 0.06 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x39443d, roughness: 0.48, metalness: 0.66 }),
      ember: new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xff8c24, emissiveIntensity: 1.35, roughness: 0.35 }),
      royalVelvet: new THREE.MeshStandardMaterial({ color: 0x822431, roughness: 0.64, metalness: 0.08, side: THREE.DoubleSide }),
      royalCarpet: new THREE.MeshStandardMaterial({ color: 0x5e1d27, roughness: 0.84, metalness: 0.04 }),
      nobleCarpet: new THREE.MeshStandardMaterial({ color: 0x264834, roughness: 0.84, metalness: 0.04 }),
      nobleCushion: new THREE.MeshStandardMaterial({ color: 0x346146, roughness: 0.72, metalness: 0.08 }),
      plankOak: new THREE.MeshStandardMaterial({ color: 0x9b7a52, roughness: 0.88, metalness: 0.03 }),
      roofFabric: new THREE.MeshStandardMaterial({ color: 0x274433, roughness: 0.78, metalness: 0.05 }),
    };

  const fiveHouses = [
    new THREE.MeshStandardMaterial({ color: 0x992e3b, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide }), // Crimson
    new THREE.MeshStandardMaterial({ color: 0x2c527a, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide }), // Sapphire
    new THREE.MeshStandardMaterial({ color: 0x2e6144, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide }), // Emerald
    new THREE.MeshStandardMaterial({ color: 0xcfa03e, roughness: 0.62, metalness: 0.14, side: THREE.DoubleSide }), // Aurelia Gold
    new THREE.MeshStandardMaterial({ color: 0x674173, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide }), // Iron Plum
  ];

  const animatedPennants = [];
  const animatedEmbers = [];
  const guidesGroup = new THREE.Group();
  const zoneGroups = {
    lists: new THREE.Group(),
    royalBox: new THREE.Group(),
    nobleStand: new THREE.Group(),
    commonerBench: new THREE.Group(),
    pavilions: new THREE.Group(),
    lanes: new THREE.Group(),
    stations: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  function addBrazier(parent, x, y, z, scale = 1) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.08 * scale, 0.15 * scale, 8), mat.iron);
    bowl.position.set(x, y, z);
    bowl.castShadow = true;
    parent.add(bowl);

    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.095 * scale), mat.ember.clone());
    flame.position.set(x, y + 0.11 * scale, z);
    flame.scale.set(0.85, 1.35, 0.85);
    parent.add(flame);
    animatedEmbers.push({ mesh: flame, baseY: flame.position.y, phase: x * 1.1 + z * 0.9 });
  }

  function addBannerPole(parent, x, yBase, z, poleH, clothMat, dirAngle = 0, swallowtail = false, big = false) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, poleH, 8), isMelee ? mat.iron : mat.timber);
    pole.position.set(x, yBase + poleH / 2, z);
    pole.castShadow = true;
    parent.add(pole);

    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mat.brassBright);
    finial.position.set(x, yBase + poleH + 0.08, z);
    parent.add(finial);

    const w = big ? 0.96 : 0.68;
    const h = big ? 0.28 : 0.17;
    const shape = new THREE.Shape();
    if (swallowtail) {
      shape.moveTo(0, h);
      shape.lineTo(w, h * 0.72);
      shape.lineTo(w * 0.72, 0);
      shape.lineTo(w, -h * 0.72);
      shape.lineTo(0, -h);
    } else {
      shape.moveTo(0, h);
      shape.lineTo(w, 0);
      shape.lineTo(0, -h);
    }
    shape.closePath();

    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), clothMat.clone());
    flag.material.side = THREE.DoubleSide;
    flag.position.set(x, yBase + poleH - (big ? 0.28 : 0.18), z);
    flag.rotation.y = dirAngle;
    parent.add(flag);
    animatedPennants.push({ mesh: flag, baseY: dirAngle, phase: x * 0.75 + z * 0.6 });
  }

  // ── 1. ARCHITECTURAL BASE PLINTH & BLUEPRINT GUIDES ────────────────────────
  const plinthW = 44.4;
  const plinthD = 30.8;
  addBox(root, plinthW, 0.48, plinthD, mat.ground, 0, -0.24, 0, false);

  const rimH = 0.07;
  const rimT = 0.14;
  addBox(root, plinthW + 0.14, rimH, rimT, mat.plinthEdge, 0, -0.02, -plinthD / 2, false);
  addBox(root, plinthW + 0.14, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthD / 2, false);
  addBox(root, rimT, rimH, plinthD + 0.14, mat.plinthEdge, -plinthW / 2, -0.02, 0, false);
  addBox(root, rimT, rimH, plinthD + 0.14, mat.plinthEdge, plinthW / 2, -0.02, 0, false);

  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.08 });
  const gridPoints = [];
  for (let gx = -20.8; gx <= 20.81; gx += 1.6) {
    gridPoints.push(new THREE.Vector3(gx, 0.005, -14.8), new THREE.Vector3(gx, 0.005, 14.8));
  }
  for (let gz = -14.4; gz <= 14.41; gz += 1.6) {
    gridPoints.push(new THREE.Vector3(-21.2, 0.005, gz), new THREE.Vector3(21.2, 0.005, gz));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(13.65, 13.80, 112), mat.guideRing);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(0, 0.016, 0);
  guidesGroup.add(ringMesh);

  const crossPts = [
    new THREE.Vector3(0, 0.014, -14.6), new THREE.Vector3(0, 0.014, 14.6),
    new THREE.Vector3(-17.2, 0.014, 0), new THREE.Vector3(17.2, 0.014, 0),
  ];
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), mat.guideLine));

  // ── 2. CENTRAL ARENA ("THE ROYAL LISTS") ───────────────────────────────────
  const listsW = 24.2;
  const listsD = 5.5;
  const listsX1 = -12.1;
  const listsX2 = 12.1;
  const listsZ1 = -2.75;
  const listsZ2 = 2.75;
  const listsGroup = zoneGroups.lists;

  addBox(listsGroup, listsW, 0.06, listsD, mat.turf, 0, 0.03, 0, false);
  addBox(listsGroup, listsW - 0.65, 0.08, listsD - 0.65, mat.sand, 0, 0.045, 0, false);
  if (isMelee) {
    addBox(listsGroup, 20.6, 0.088, 3.6, mat.sandLane, 0, 0.048, 0, false);
  } else {
    addBox(listsGroup, 21.0, 0.088, 1.35, mat.sandLane, 0, 0.048, -1.25, false);
    addBox(listsGroup, 21.0, 0.088, 1.35, mat.sandLane, 0, 0.048, 1.25, false);
  }

  const fenceH = isMelee ? 0.62 : 0.56;
  const curbMat = isMelee ? mat.stoneDark : mat.stone;
  const railMat = isMelee ? mat.timber : mat.timberLight;
  const postMat = isMelee ? mat.iron : mat.timber;

  addBox(listsGroup, listsW + 0.16, 0.15, 0.20, curbMat, 0, 0.075, listsZ1, true);
  addBox(listsGroup, listsW + 0.16, 0.15, 0.20, curbMat, 0, 0.075, listsZ2, true);
  if (isMelee) {
    addBox(listsGroup, 0.20, 0.15, listsD + 0.16, curbMat, listsX1, 0.075, 0, true);
    addBox(listsGroup, 0.20, 0.15, listsD + 0.16, curbMat, listsX2, 0.075, 0, true);
  } else {
    // Jousting Arena: leave wide 3.8-unit Horse Entrance opening (Z = -1.90..+1.90) at West & East ends
    for (const ex of [listsX1, listsX2]) {
      for (const sideZ of [-1, 1]) {
        addBox(listsGroup, 0.20, 0.15, 0.92, curbMat, ex, 0.075, sideZ * 2.34, true);
      }
    }
  }

  for (const ry of [0.28, 0.48]) {
    addBox(listsGroup, listsW, 0.08, 0.10, railMat, 0, ry, listsZ1, true);
    addBox(listsGroup, listsW, 0.08, 0.10, railMat, 0, ry, listsZ2, true);
    if (isMelee) {
      addBox(listsGroup, 0.10, 0.08, listsD, railMat, listsX1, ry, 0, true);
      addBox(listsGroup, 0.10, 0.08, listsD, railMat, listsX2, ry, 0, true);
    } else {
      for (const ex of [listsX1, listsX2]) {
        for (const sideZ of [-1, 1]) {
          addBox(listsGroup, 0.10, 0.08, 0.85, railMat, ex, ry, sideZ * 2.325, true);
        }
      }
    }
  }
  addBox(listsGroup, listsW + 0.12, 0.06, 0.12, mat.brassBright, 0, fenceH, listsZ1, false);
  addBox(listsGroup, listsW + 0.12, 0.06, 0.12, mat.brassBright, 0, fenceH, listsZ2, false);
  if (isMelee) {
    addBox(listsGroup, 0.12, 0.06, listsD + 0.12, mat.brassBright, listsX1, fenceH, 0, false);
    addBox(listsGroup, 0.12, 0.06, listsD + 0.12, mat.brassBright, listsX2, fenceH, 0, false);
  } else {
    for (const ex of [listsX1, listsX2]) {
      for (const sideZ of [-1, 1]) {
        addBox(listsGroup, 0.12, 0.06, 0.88, mat.brassBright, ex, fenceH, sideZ * 2.33, false);
      }
    }
  }

  for (let i = 0; i <= 16; i++) {
    const px = listsX1 + (listsW / 16) * i;
    const isCorner = i === 0 || i === 16;
    const isAccent = isCorner || i % 4 === 0;
    for (const pz of [listsZ1, listsZ2]) {
      addBox(listsGroup, isCorner ? 0.22 : 0.13, fenceH + (isAccent ? 0.14 : 0.04), isCorner ? 0.22 : 0.13, postMat, px, (fenceH + (isAccent ? 0.14 : 0.04)) / 2, pz, true);
      if (isCorner && isMelee) {
        addBrazier(listsGroup, px, fenceH + 0.20, pz, 0.88);
      } else if (isAccent) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 4), mat.brass);
        cap.position.set(px, fenceH + 0.22, pz);
        cap.rotation.y = Math.PI / 4;
        listsGroup.add(cap);
      }
    }
  }

  // West & East Starting Gate Barriers / Grand Equestrian Horse Entrances
  const gateZLen = 4.5;
  if (isMelee) {
    for (const [gx, hA, hB] of [[-10.5, 0, 1], [10.5, 2, 4]]) {
      addBox(listsGroup, 0.18, 0.06, gateZLen, mat.brassBright, gx, 0.08, 0, false);
      addBox(listsGroup, 0.16, 0.48, gateZLen, mat.iron, gx, 0.29, 0, true);
      addBox(listsGroup, 0.18, 0.06, gateZLen + 0.06, mat.brass, gx, 0.56, 0, false);
      for (const [gz, hIdx] of [[-2.22, hA], [2.22, hB]]) {
        addBox(listsGroup, 0.28, 1.05, 0.28, mat.stoneDark, gx, 0.52, gz, true);
        addBrazier(listsGroup, gx, 1.10, gz, 0.82);
        addBannerPole(listsGroup, gx + (gx < 0 ? -0.32 : 0.32), 0.12, gz, 2.2, fiveHouses[hIdx], gx < 0 ? 0 : Math.PI, true, false);
      }
    }
  } else {
    // ── JOUSTING HORSE ENTRANCE GATEHOUSES, SWUNG-OPEN DOORS & RIDING CAUSEWAYS ──
    for (const [endSign, pMat] of [[-1, mat.wine], [1, mat.nobleGreen]]) {
      const gateX = endSign * 12.1;

      // Packed-sand Equestrian Entry Causeway linking the Stable Courtyard (±15.10) seamlessly into the Lists (±11.78)
      addBox(listsGroup, 3.30, 0.080, 3.65, mat.sand, endSign * 13.44, 0.045, 0, false);
      addBox(listsGroup, 4.52, 0.088, 1.32, mat.sandLane, endSign * 12.80, 0.048, -1.05, false);
      addBox(listsGroup, 4.52, 0.088, 1.32, mat.sandLane, endSign * 12.80, 0.048, 1.05, false);

      // Guide chute fences flanking the horse causeway between Stables (±15.05) and Horse Gate (±12.1)
      for (const sideZ of [-1, 1]) {
        const chZ = sideZ * 1.95;
        addBox(listsGroup, 2.85, 0.12, 0.16, mat.stone, endSign * 13.6, 0.06, chZ, true);
        addBox(listsGroup, 2.85, 0.08, 0.09, mat.timberLight, endSign * 13.6, 0.32, chZ, true);
        addBox(listsGroup, 2.85, 0.08, 0.09, mat.timberLight, endSign * 13.6, 0.52, chZ, true);
        addBox(listsGroup, 2.90, 0.05, 0.11, mat.brassBright, endSign * 13.6, 0.62, chZ, false);
        for (const cx of [13.1, 14.1, 15.0]) {
          addBox(listsGroup, 0.13, 0.72, 0.13, mat.timber, endSign * cx, 0.36, chZ, true);
        }
      }

      // Twin Grand Stone & Timber Equestrian Gatehouse Piers (Z = ±1.95, height 2.85)
      for (const sideZ of [-1, 1]) {
        const pz = sideZ * 1.95;
        addBox(listsGroup, 0.46, 0.24, 0.46, mat.stoneDark, gateX, 0.12, pz, true);
        addBox(listsGroup, 0.38, 2.65, 0.38, mat.stone, gateX, 1.56, pz, true);
        addBox(listsGroup, 0.46, 0.12, 0.46, mat.brassBright, gateX, 2.94, pz, false);
        addBannerPole(listsGroup, gateX, 3.00, pz, 1.45, pMat, endSign < 0 ? 0 : Math.PI, false, false);

        // Swung-Open Double Timber Horse-Gate Door (hinged wide open toward the causeway!)
        const doorPivot = new THREE.Group();
        doorPivot.position.set(gateX + endSign * 0.12, 0.08, sideZ * 1.74);
        doorPivot.rotation.y = endSign * sideZ * -0.95; // swung wide open (~55°) into the chute!
        const dSign = -sideZ;
        addBox(doorPivot, 0.09, 1.38, 1.60, mat.timber, 0, 0.72, dSign * 0.80, true);
        addBox(doorPivot, 0.11, 0.10, 1.62, mat.iron, 0, 0.34, dSign * 0.80, false);
        addBox(doorPivot, 0.11, 0.10, 1.62, mat.iron, 0, 1.10, dSign * 0.80, false);
        addBox(doorPivot, 0.11, 0.06, 1.64, mat.brassBright, 0, 1.43, dSign * 0.80, false);
        listsGroup.add(doorPivot);
      }

      // High Overhead Equestrian Arch Lintel & Heraldic Pediment Crest (y = 2.82..3.45 — clears mounted lances!)
      addBox(listsGroup, 0.36, 0.26, 4.35, mat.timber, gateX, 2.80, 0, true);
      addBox(listsGroup, 0.42, 0.08, 4.44, mat.brassBright, gateX, 2.96, 0, false);
      addBox(listsGroup, 0.30, 0.38, 2.40, pMat, gateX, 3.16, 0, true);
      addBox(listsGroup, 0.34, 0.07, 2.52, mat.brassBright, gateX, 3.38, 0, false);
      // Gilded heraldic crest emblem mounted on both sides of the horse-gate arch
      const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), mat.brassBright);
      crest.scale.set(0.45, 1.25, 1.0);
      crest.position.set(gateX, 3.18, 0);
      listsGroup.add(crest);

      // Split Jousting Start-Lane Posts & Raised Striped Drop-Bars at X = ±10.5 (ready for horses to ride through!)
      const stX = endSign * 10.5;
      for (const gz of [-2.18, 0, 2.18]) {
        addBox(listsGroup, 0.18, 0.92, 0.18, mat.timber, stX, 0.46, gz, true);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 4), mat.brassBright);
        cap.position.set(stX, 0.99, gz);
        cap.rotation.y = Math.PI / 4;
        listsGroup.add(cap);
      }
      // Twin raised striped wooden starting-gate bars hinged from outer posts so both lanes are open for horses
      for (const sideZ of [-1, 1]) {
        const barPivot = new THREE.Group();
        barPivot.position.set(stX, 0.68, sideZ * 2.10);
        barPivot.rotation.x = sideZ * 0.58; // tilted upward open (~33°)
        addBox(barPivot, 0.09, 0.09, 1.95, sideZ < 0 ? mat.creamCloth : pMat, 0, 0, -sideZ * 0.98, true);
        addBox(barPivot, 0.11, 0.11, 0.24, mat.brassBright, 0, 0, -sideZ * 1.85, false);
        listsGroup.add(barPivot);
      }
    }
  }

  // Central Field Divider: Jousting Tilt (Silver Lance) vs. Five House War-Banners (Five Banners)
  const tiltLen = 21.8;
  const chevronLen = Math.hypot(1.1, 0.4);
  const chevronAngle = Math.atan2(0.4, 1.1);

  if (isMelee) {
    addBox(listsGroup, tiltLen, 0.10, 0.34, mat.stoneDark, 0, 0.09, 0, true);
    addBox(listsGroup, tiltLen, 0.22, 0.18, mat.iron, 0, 0.24, 0, true);
    addBox(listsGroup, tiltLen + 0.08, 0.06, 0.22, mat.brassBright, 0, 0.38, 0, false);

    for (const b of [
      { x: -8.6, house: 1, h: 2.45, dir: 0.15 },
      { x: -4.4, house: 2, h: 2.55, dir: 0.08 },
      { x: 0.0, house: 0, h: 3.10, dir: 0.0 },
      { x: 4.4, house: 3, h: 2.55, dir: Math.PI - 0.08 },
      { x: 8.6, house: 4, h: 2.45, dir: Math.PI - 0.15 },
    ]) {
      addBox(listsGroup, 0.44, 0.24, 0.44, mat.stoneDark, b.x, 0.22, 0, true);
      addBox(listsGroup, 0.48, 0.05, 0.48, mat.brass, b.x, 0.36, 0, false);
      addBannerPole(listsGroup, b.x, 0.36, 0, b.h, fiveHouses[b.house], b.dir, true, b.x === 0);
    }

    const clashRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.84, 32), mat.brassBright);
    clashRing.rotation.x = -Math.PI / 2;
    clashRing.position.set(0, 0.11, 0);
    listsGroup.add(clashRing);

    for (const dir of [-1, 1]) {
      const midX = dir * 0.75;
      for (const sideZ of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(chevronLen, 0.11, 0.13), mat.brassBright);
        wing.position.set(midX, 0.46, sideZ * 0.2);
        wing.rotation.y = dir * sideZ * chevronAngle;
        listsGroup.add(wing);
      }
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.07), fiveHouses[dir < 0 ? 1 : 3]);
      shield.position.set(dir * 1.75, 0.36, dir < 0 ? -0.78 : 0.78);
      shield.rotation.y = dir < 0 ? Math.PI * 0.35 : -Math.PI * 0.35;
      listsGroup.add(shield);
    }
  } else {
    addBox(listsGroup, tiltLen, 0.12, 0.28, mat.stoneDark, 0, 0.10, 0, true);
    addBox(listsGroup, tiltLen, 0.64, 0.16, mat.timber, 0, 0.44, 0, true);
    addBox(listsGroup, tiltLen + 0.08, 0.07, 0.20, mat.brassBright, 0, 0.79, 0, false);
    for (let tx = -9.6; tx <= 9.6; tx += 2.4) {
      const clothMat = Math.abs(tx) < 2.6 ? mat.wine : (Math.round(tx / 2.4) % 2 === 0 ? mat.nobleGreen : mat.wine);
      addBox(listsGroup, 1.55, 0.42, 0.21, clothMat, tx, 0.44, 0, false);
      addBox(listsGroup, 1.58, 0.045, 0.22, mat.brass, tx, 0.24, 0, false);
    }
    for (let px = -10.8; px <= 10.81; px += 1.8) {
      addBox(listsGroup, 0.14, 0.84, 0.22, mat.timberLight, px, 0.46, 0, true);
    }

    const clashRing = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.64, 32), mat.brassBright);
    clashRing.rotation.x = -Math.PI / 2;
    clashRing.position.set(0, 0.11, 0);
    listsGroup.add(clashRing);

    for (const dir of [-1, 1]) {
      const midX = dir * 0.75;
      for (const sideZ of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(chevronLen, 0.10, 0.12), mat.brassBright);
        wing.position.set(midX, 0.86, sideZ * 0.2);
        wing.rotation.y = dir * sideZ * chevronAngle;
        listsGroup.add(wing);
      }
      const lance = new THREE.Mesh(new THREE.ConeGeometry(0.055, 2.2, 8), mat.brassBright);
      lance.rotation.z = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
      lance.position.set(dir * 1.45, 1.0, dir < 0 ? -0.58 : 0.58);
      listsGroup.add(lance);
    }
  }

  // ── 3. ZERO-OBSTRUCTION 3-TIER STACKED STADIUM BOWL (EXACT MATCH TO 2D MAP) ─
  // Every tier rises cleanly behind the one in front with ZERO blocking roofs!
  //   - LEVEL 1 (Front, Z = ±3.55..±4.85, y = 0.78):  ROYAL BOX — 1 row × 10 Thrones/side (20 total)
  //   - LEVEL 2 (Mid,   Z = ±5.10..±7.40, y = 1.95..3.35): NOBLE STAND — 4 rows × 10 Gallery Chairs/side (80 total)
  //   - LEVEL 3 (Upper, Z = ±7.65..±12.25, y = 3.70..7.30): COMMONER'S BENCH — 10 rows × 10 Oak Benches/side (200 total)
  //   - High Cantilevered Stadium Roof sits ONLY behind Row 10 at y = 8.95 (well above every sightline!)
  function buildStadiumSide(sideSign) {
    const facingRotY = sideSign < 0 ? 0 : Math.PI;

    // ── LEVEL 1: RINGSIDE ROYAL BOX (1 Row × 10 Plush Gold-Armed Thrones + Drink Tables) ──
    const rbW = 14.8;
    const rbD = 1.30;
    const rbFrontZ = sideSign * 3.55;
    const rbBackZ = sideSign * 4.85;
    const rbCZ = (rbFrontZ + rbBackZ) / 2; // ±4.20

    // Carved White Marble & Crimson-Velvet Ringside Royal Dais (strictly non-overlapping faces)
    addBox(zoneGroups.royalBox, rbW + 0.4, 0.78, rbD + 0.16, mat.marble, 0, 0.39, rbCZ, true);
    addBox(zoneGroups.royalBox, rbW + 0.08, 0.06, rbD - 0.12, mat.royalCarpet, 0, 0.81, rbCZ, false);

    // Ornate Gold-Crested Marble Parapet Wall facing the Lists (sits cleanly ON TOP of dais y=0.78, inset 0.02)
    addBox(zoneGroups.royalBox, rbW + 0.32, 0.46, 0.16, mat.marble, 0, 1.01, rbFrontZ + sideSign * 0.02, true);
    addBox(zoneGroups.royalBox, rbW + 0.42, 0.06, 0.22, mat.brassBright, 0, 1.27, rbFrontZ + sideSign * 0.02, false);

    // Draped Royal Crimson Tapestries & Gilded Heraldic Shields along the front marble parapet
    for (const tx of [-4.8, 0, 4.8]) {
      addBox(zoneGroups.royalBox, 2.8, 0.64, 0.07, mat.royalVelvet, tx, 0.86, rbFrontZ - sideSign * 0.12, false);
      addBox(zoneGroups.royalBox, 2.86, 0.045, 0.08, mat.brassBright, tx, 0.54, rbFrontZ - sideSign * 0.125, false);
      const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), mat.brassBright);
      shield.scale.set(1.0, 1.25, 0.38);
      shield.position.set(tx, 0.90, rbFrontZ - sideSign * 0.18);
      zoneGroups.royalBox.add(shield);
    }

    // Low Marble & Gold Side Privacy Walls & Corner Royal Lanterns (strictly between front & back parapets)
    for (const ex of [-rbW / 2 - 0.08, rbW / 2 + 0.08]) {
      addBox(zoneGroups.royalBox, 0.22, 0.60, rbD - 0.18, mat.marble, ex, 1.08, rbCZ, true);
      addBox(zoneGroups.royalBox, 0.28, 0.06, rbD - 0.12, mat.brassBright, ex, 1.41, rbCZ, false);
      addBrazier(zoneGroups.royalBox, ex, 1.48, rbFrontZ + sideSign * 0.02, 0.72);
    }
    // Low Royal Box back rail separating Royal Box from the elevated Noble deck behind
    addBox(zoneGroups.royalBox, rbW + 0.32, 0.48, 0.16, mat.marble, 0, 1.02, rbBackZ - sideSign * 0.02, true);
    addBox(zoneGroups.royalBox, rbW + 0.42, 0.06, 0.22, mat.brassBright, 0, 1.29, rbBackZ - sideSign * 0.02, false);

    // 10 Plush Crimson-Velvet & Gold-Armed Royal Thrones (Row A North, Row B South => 20 Royal Box seats!)
    // + Personal Marble Welcome-Drink Side Tables & Golden Chalices between pairs!
    const royalSeats = [];
    for (let s = 0; s < 10; s++) {
      const p = royalSeatPosition('royal', sideSign < 0 ? 'A' : 'B', s + 1);
      const sx = p.x;
      royalSeats.push(p);

      // Personal miniature marble & gold welcome-drink side table with golden chalice
      if (s % 2 === 0) {
        const tableX = sx + 0.70;
        const tableZ = rbCZ - sideSign * 0.12;
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.42, 8), mat.brass);
        ped.position.set(tableX, 1.04, tableZ);
        zoneGroups.royalBox.add(ped);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.04, 12), mat.marble);
        top.position.set(tableX, 1.26, tableZ);
        zoneGroups.royalBox.add(top);
        const chalice = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.13, 8), mat.brassBright);
        chalice.position.set(tableX, 1.34, tableZ);
        zoneGroups.royalBox.add(chalice);
      }
    }
    addInstancedNobleArmchairs(zoneGroups.royalBox, royalSeats, mat.royalVelvet, mat.brassBright, 1.48);

    // ── LEVEL 2: ELEVATED NOBLE STAND (4 Rows × 10 Cushioned Gallery Chairs = 40/side => 80 total) ──
    // Starts elevated at y = 1.88 (Z = ±5.10 .. ±7.45) — 100% clear sightline OVER the Royal Box, ZERO Z-fighting!
    const nbW = 19.6;
    const nbFrontZ = sideSign * 5.10;
    const nbBackZ = sideSign * 7.45;
    const nbD = Math.abs(nbBackZ - nbFrontZ); // 2.35
    const nbCZ = (nbFrontZ + nbBackZ) / 2;

    // Solid elevated stone substructure supporting the Noble Stand deck
    addBox(zoneGroups.nobleStand, nbW, 1.88, nbD, mat.stoneDark, 0, 0.94, nbCZ, true);
    // Front Noble parapet sitting cleanly ON TOP of y=1.88, inset from front edge
    addBox(zoneGroups.nobleStand, nbW - 0.08, 0.42, 0.14, mat.stone, 0, 2.09, nbFrontZ + sideSign * 0.09, true);
    addBox(zoneGroups.nobleStand, nbW + 0.06, 0.06, 0.20, mat.brassBright, 0, 2.33, nbFrontZ + sideSign * 0.09, false);

    // 4 Ascending Carpeted Noble Terraces × 10 Reserved Cushioned Gallery Chairs (exclusive Z slices => zero coplanar faces!)
    const nobleBuckets = isMelee ? [[], [], [], [], []] : [[]];
    const nbRowStepZ = (nbD - 0.18) / 4; // 0.5425 per row
    const nbRowStepY = 0.38;

    for (let r = 0; r < 4; r++) {
      const tierH = (r + 1) * nbRowStepY;
      const topY = 1.88 + tierH;
      const rowZ = nbFrontZ + sideSign * (0.18 + nbRowStepZ * (r + 0.5));

      // Exclusive non-overlapping vertical step slice resting directly on substructure y=1.88
      addBox(zoneGroups.nobleStand, nbW - 0.20, tierH, nbRowStepZ - 0.008, r % 2 === 0 ? mat.stone : mat.stoneDark, 0, 1.88 + tierH / 2, rowZ, true);

      // Split Noble Carpet Wings (Left & Right) leaving completely clean gaps for the 3 Stone Staircases (-9.1, 0, +9.1)
      addBox(zoneGroups.nobleStand, 8.02, 0.04, nbRowStepZ - 0.06, mat.nobleCarpet, -4.55, topY + 0.02, rowZ, false);
      addBox(zoneGroups.nobleStand, 8.02, 0.04, nbRowStepZ - 0.06, mat.nobleCarpet, 4.55, topY + 0.02, rowZ, false);

      for (let s = 0; s < 10; s++) {
        // Leave a crisp central royal aisle between Seats 5 & 6 and side stairs outside Seats 1 & 10
        const hIdx = isMelee ? Math.floor(s / 2) : 0;
        nobleBuckets[hIdx].push(royalSeatPosition('noble', String.fromCharCode(65 + r + (sideSign < 0 ? 0 : 4)), s + 1));
      }
    }

    // Render all 40 Cushioned Wooden Noble Gallery Chairs on this side (80 total)
    if (isMelee) {
      nobleBuckets.forEach((bkt, idx) => {
        if (bkt.length) addInstancedSeatGroup(zoneGroups.nobleStand, bkt, fiveHouses[idx], mat.timber, 1.55);
      });
    } else {
      addInstancedSeatGroup(zoneGroups.nobleStand, nobleBuckets[0], mat.nobleCushion, mat.timber, 1.55);
    }

    // Center & Flanking Stepped Stone Access Stairs (raised cleanly proud on top of risers, ZERO carpet/riser Z-fighting!)
    for (const stX of [-9.1, 0, 9.1]) {
      for (let r = 0; r < 4; r++) {
        const baseTopY = 1.88 + (r + 1) * nbRowStepY;
        const rowFrontZ = nbFrontZ + sideSign * (0.18 + nbRowStepZ * r);
        for (let sub = 0; sub < 2; sub++) {
          const treadH = 0.04 + sub * 0.02;
          const treadZ = rowFrontZ + sideSign * (nbRowStepZ * (sub * 0.5 + 0.25));
          addBox(zoneGroups.nobleStand, 0.86, treadH, nbRowStepZ * 0.44, mat.marble, stX, baseTopY + treadH / 2, treadZ, false);
        }
      }
    }
    // Mid-divider balustrade placed cleanly in the ±7.45..±7.70 corridor behind Noble Row 4
    addBox(zoneGroups.nobleStand, nbW, 0.34, 0.14, mat.stone, 0, 3.55, nbBackZ + sideSign * 0.11, true);
    addBox(zoneGroups.nobleStand, nbW + 0.12, 0.06, 0.20, mat.brass, 0, 3.75, nbBackZ + sideSign * 0.11, false);

    // ── LEVEL 3: TOWERING OPEN-AIR COMMONER'S BENCH STADIUM BOWL (10 Rows × 10 = 100/side => 200 total) ──
    // Steeply raked from y = 3.68 up to y = 7.38 (Z = ±7.70 .. ±12.30) — ZERO obstruction & ZERO Z-fighting!
    const cmW = 23.6;
    const cmFrontZ = sideSign * 7.70;
    const cmBackZ = sideSign * 12.30;
    const cmD = Math.abs(cmBackZ - cmFrontZ); // 4.60
    const cmCZ = (cmFrontZ + cmBackZ) / 2;

    // Monumental stone stadium bowl substructure
    addBox(zoneGroups.commonerBench, cmW, 3.68, cmD, mat.stoneDark, 0, 1.84, cmCZ, true);
    addBox(zoneGroups.commonerBench, cmW - 0.14, 0.34, 0.12, mat.iron, 0, 3.85, cmFrontZ + sideSign * 0.08, false);
    addBox(zoneGroups.commonerBench, cmW - 0.04, 0.06, 0.16, mat.brass, 0, 4.05, cmFrontZ + sideSign * 0.08, false);

    // 10 Steeply Stepped Rustic Oak Communal Bench Rows × 10 Seat Places (exclusive Z slices => ZERO Z-fighting!)
    const benchStuds = [];
    const cmStartOffset = 0.16;
    const rowStepZ = (cmD - cmStartOffset) / 10; // 0.444 per row
    const rowStepY = 0.37; // steep ~40° stadium rake => every single row has unobstructed sightlines!

    for (let r = 0; r < 10; r++) {
      const tierH = (r + 1) * rowStepY;
      const topY = 3.68 + tierH;
      const benchZ = cmFrontZ + sideSign * (cmStartOffset + rowStepZ * (r + 0.5));

      // Exclusive vertical stone step slice resting directly on substructure y=3.68 (NO overlapping back/side faces!)
      addBox(zoneGroups.commonerBench, cmW - 0.24, tierH, rowStepZ - 0.008, r % 2 === 0 ? mat.stone : mat.stoneDark, 0, 3.68 + tierH / 2, benchZ, true);

      // Continuous long weathered oak communal plank benches (LEFT Seats 1–5 & RIGHT Seats 6–10)
      // Supported by dark iron bench risers resting cleanly on topY (no floating & zero coplanar overlap!)
      for (const sideX of [-5.6, 5.6]) {
        addBox(zoneGroups.commonerBench, 9.2, 0.07, 0.14, mat.iron, sideX, topY + 0.035, benchZ, false);
        addBox(zoneGroups.commonerBench, 9.25, 0.09, 0.26, mat.plankOak, sideX, topY + 0.115, benchZ, true);
      }

      // 10 numbered bench places along each row (5 Left + 5 Right = 10 × 10 rows = 100 per side!)
      for (let s = 0; s < 10; s++) {
        benchStuds.push(royalSeatPosition('commoner', String.fromCharCode(65 + r + (sideSign < 0 ? 0 : 10)), s + 1));
      }
    }

    // Subtle dark wrought-iron seat-place studs cleanly seated ON TOP of the oak plank (y = topY + 0.16..0.19)
    const studGeom = new THREE.BoxGeometry(0.055, 0.035, 0.22);
    const studMesh = new THREE.InstancedMesh(studGeom, mat.iron, benchStuds.length);
    const sDummy = new THREE.Object3D();
    benchStuds.forEach((p, idx) => {
      sDummy.position.set(p.x, p.y, p.z);
      sDummy.updateMatrix();
      studMesh.setMatrixAt(idx, sDummy.matrix);
    });
    studMesh.instanceMatrix.needsUpdate = true;
    zoneGroups.commonerBench.add(studMesh);

    // 3 Wide Raised Stone Stadium Stairways (West, Center, East) — cleanly proud ON TOP of risers, ZERO Z-fighting!
    for (const stX of [-10.95, 0, 10.95]) {
      for (let r = 0; r < 10; r++) {
        const topY = 3.68 + (r + 1) * rowStepY;
        const rowFrontZ = cmFrontZ + sideSign * (cmStartOffset + rowStepZ * r);
        for (let sub = 0; sub < 2; sub++) {
          const treadH = 0.035 + sub * 0.025;
          const treadZ = rowFrontZ + sideSign * (rowStepZ * (sub * 0.5 + 0.25));
          addBox(zoneGroups.commonerBench, 1.08, treadH, rowStepZ * 0.42, mat.marble, stX, topY + treadH / 2, treadZ, false);
        }
      }
    }

    // ── HIGH REAR STADIUM WALL, CORNER TOWERS & OVERHEAD REAR CANOPY (y = 9.25) ──
    // Positioned STRICTLY BEHIND cmBackZ (±12.30) with clean clearance so ZERO faces ever Z-fight!
    const topWallH = 8.45;
    const rearWallZ = cmBackZ + sideSign * 0.26;
    addBox(zoneGroups.commonerBench, cmW, topWallH, 0.42, mat.stoneDark, 0, topWallH / 2, rearWallZ, true);
    addBox(zoneGroups.commonerBench, cmW + 0.12, 0.12, 0.50, mat.brassBright, 0, topWallH + 0.06, rearWallZ, false);

    // Sleek High Cantilevered Upper Stadium Shade Canopy (high above Row 10 at y = 9.15, sloping cleanly up toward field!)
    const canopyD = 3.2;
    const canopyCZ = rearWallZ - sideSign * (canopyD / 2 - 0.24);
    const highCanopy = new THREE.Mesh(new THREE.BoxGeometry(cmW + 0.32, 0.18, canopyD), mat.roofFabric);
    highCanopy.position.set(0, 9.15, canopyCZ);
    highCanopy.rotation.x = sideSign < 0 ? -0.10 : 0.10; // rises slightly toward the field for huge open sightlines!
    highCanopy.castShadow = true;
    zoneGroups.commonerBench.add(highCanopy);
    addBox(zoneGroups.commonerBench, cmW + 0.40, 0.09, 0.12, mat.brassBright, 0, 9.30, canopyCZ - sideSign * (canopyD / 2), false);

    // Timber & iron support struts anchored ONLY at the rear curtain wall (zero front columns in any sightline!)
    for (let sx = -10.5; sx <= 10.51; sx += 3.5) {
      addBox(zoneGroups.commonerBench, 0.24, 1.15, 0.28, mat.iron, sx, 8.65, rearWallZ, true);
    }

    // 4 Monumental Stadium Corner Watchtowers framing the North & South grandstand wings (strictly outside cmW/2!)
    for (const endX of [-cmW / 2 - 0.78, cmW / 2 + 0.78]) {
      const towerH = 9.85;
      addBox(zoneGroups.commonerBench, 1.44, towerH, 1.44, mat.stoneDark, endX, towerH / 2, rearWallZ, true);
      addBox(zoneGroups.commonerBench, 1.60, 0.16, 1.60, mat.brassBright, endX, towerH + 0.08, rearWallZ, false);
      if (isMelee) {
        addBrazier(zoneGroups.commonerBench, endX, towerH + 0.26, rearWallZ, 1.25);
      } else {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.86, 1.45, 4), mat.nobleGreen);
        cap.position.set(endX, towerH + 0.88, rearWallZ);
        cap.rotation.y = Math.PI / 4;
        zoneGroups.commonerBench.add(cap);
      }
    }

    // Rhythmic Stadium Crest Banners along the top roof ridge
    for (let bi = -4; bi <= 4; bi++) {
      const bx = bi * 2.5;
      const bMat = isMelee
        ? fiveHouses[((bi + 5) % 5 + 5) % 5]
        : (bi === 0 ? mat.wine : (Math.abs(bi) % 2 === 0 ? mat.nobleGreen : mat.creamCloth));
      addBannerPole(zoneGroups.commonerBench, bx, 9.15, rearWallZ, bi === 0 ? 2.3 : 1.8, bMat, sideSign < 0 ? 0.15 : -Math.PI * 0.85, isMelee, false);
    }
  }

  buildStadiumSide(-1); // North Stadium
  buildStadiumSide(1);  // South Stadium

  // ── 4. NORTH & SOUTH REAR T-SHAPED ROYAL ENTRY GATEHOUSES ──────────────────
  for (const sideSign of [-1, 1]) {
    const pavGroup = zoneGroups.pavilions;
    const stemStart = sideSign * 12.60;
    const stemEnd = sideSign * 14.15;
    const stemMid = (stemStart + stemEnd) / 2;
    const stemLen = Math.abs(stemEnd - stemStart);

    addBox(pavGroup, 0.82, 0.30, stemLen, mat.stone, 0, 0.15, stemMid, true);
    addBox(pavGroup, 0.48, 0.05, stemLen + 0.04, mat.royalVelvet, 0, 0.32, stemMid, false);
    addBox(pavGroup, 0.10, 0.07, stemLen, mat.brassBright, -0.38, 0.33, stemMid, false);
    addBox(pavGroup, 0.10, 0.07, stemLen, mat.brassBright, 0.38, 0.33, stemMid, false);

    const gateZ = stemEnd;
    addBox(pavGroup, 2.05, 0.28, 0.52, mat.stone, 0, 0.14, gateZ, true);
    for (const gx of [-0.78, 0.78]) {
      addBox(pavGroup, 0.42, 2.15, 0.44, mat.stoneDark, gx, 1.08, gateZ, true);
      addBox(pavGroup, 0.48, 0.10, 0.50, mat.brassBright, gx, 2.18, gateZ, false);
      if (isMelee) {
        addBrazier(pavGroup, gx, 2.30, gateZ, 0.92);
      } else {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), mat.brassBright);
        sp.position.set(gx, 2.44, gateZ);
        sp.rotation.y = Math.PI / 4;
        pavGroup.add(sp);
      }
    }
    addBox(pavGroup, 1.98, 0.30, 0.34, isMelee ? mat.iron : mat.timber, 0, 1.85, gateZ, true);
    addBox(pavGroup, 2.06, 0.08, 0.38, mat.brassBright, 0, 2.02, gateZ, false);
  }

  // ── 5. WEST & EAST PROCESSIONAL ARROWS (X = ±13.5) ─────────────────────────
  zoneGroups.lanes.add(createArrowMesh(toX(45), toZ(58), toZ(126), -1, mat));
  zoneGroups.lanes.add(createArrowMesh(toX(315), toZ(58), toZ(126), 1, mat));

  // ── 6. WEST & EAST CHAMPION PREPARATION STATIONS (X = ±18.0) ───────────────
  // Silver Lance (Joust): Stables, sculpted warhorses, lance racks, horse barding & plate armor pavilions
  // Five Banners (Melee): Fortified weaponry & armor outfitting stations (swords, polearms, shields, armor, forge)
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d6, roughness: 0.26, metalness: 0.86 });
  const steelDarkMat = new THREE.MeshStandardMaterial({ color: 0x737d85, roughness: 0.36, metalness: 0.78 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xcab06a, roughness: 0.94, metalness: 0.02 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3b6c82, roughness: 0.18, metalness: 0.15 });
  const horseCoats = [
    new THREE.MeshStandardMaterial({ color: 0x4b2e1c, roughness: 0.78, metalness: 0.05 }), // Chestnut bay
    new THREE.MeshStandardMaterial({ color: 0x262120, roughness: 0.76, metalness: 0.06 }), // Black destrier
    new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.74, metalness: 0.05 }), // Dapple grey
  ];
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5c361d, roughness: 0.76, metalness: 0.06 });

  function addArmorStand(parent, x, z, rotY, plumeMat) {
    const g = new THREE.Group();
    g.position.set(x, 0.10, z);
    g.rotation.y = rotY;
    // Wooden mannequin cross-stand
    addBox(g, 0.38, 0.08, 0.38, mat.timber, 0, 0.04, 0, true);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.38, 8), mat.timberLight);
    post.position.y = 0.72;
    g.add(post);
    // Steel cuirass breastplate & tassets
    addBox(g, 0.34, 0.44, 0.22, steelMat, 0, 0.96, 0, true);
    addBox(g, 0.38, 0.14, 0.24, steelDarkMat, 0, 0.68, 0, false);
    addBox(g, 0.36, 0.05, 0.25, mat.brassBright, 0, 0.76, 0, false);
    // Rounded steel shoulder pauldrons
    for (const sx of [-0.23, 0.23]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), steelMat);
      pauldron.position.set(sx, 1.12, 0);
      pauldron.castShadow = true;
      g.add(pauldron);
    }
    // Great-helm with brass visor trim & colored crest plume
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.24, 10), steelMat);
    helm.position.y = 1.34;
    helm.castShadow = true;
    g.add(helm);
    addBox(g, 0.16, 0.03, 0.04, mat.brassBright, 0, 1.36, 0.10, false);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), plumeMat);
    plume.position.set(0, 1.54, -0.02);
    plume.rotation.x = -0.35;
    g.add(plume);
    parent.add(g);
  }

  function addWarhorse(parent, x, z, rotY, coatMat, bardingMat, barded = true) {
    const h = new THREE.Group();
    h.position.set(x, 0.10, z);
    h.rotation.y = rotY; // Local +Z is forward (horse's head)
    // Barrel torso & flanks
    addBox(h, 0.46, 0.46, 1.08, coatMat, 0, 0.86, 0, true);
    // 4 legs + dark hooves
    for (const lx of [-0.15, 0.15]) {
      for (const lz of [-0.38, 0.38]) {
        addBox(h, 0.10, 0.66, 0.10, coatMat, lx, 0.35, lz, true);
        addBox(h, 0.11, 0.09, 0.12, mat.iron, lx, 0.045, lz, false);
      }
    }
    // Arched equine neck, head, muzzle & ears
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56, 0.28), coatMat);
    neck.position.set(0, 1.18, 0.48);
    neck.rotation.x = 0.42;
    neck.castShadow = true;
    h.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.22, 0.44), coatMat);
    head.position.set(0, 1.38, 0.72);
    head.rotation.x = 0.32;
    head.castShadow = true;
    h.add(head);
    for (const ex of [-0.065, 0.065]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 4), coatMat);
      ear.position.set(ex, 1.54, 0.58);
      h.add(ear);
    }
    // Flowing tail & mane
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.56, 0.10), mat.timber);
    tail.position.set(0, 0.76, -0.58);
    tail.rotation.x = -0.25;
    h.add(tail);
    // Leather saddle
    addBox(h, 0.50, 0.12, 0.38, leatherMat, 0, 1.12, -0.02, false);
    addBox(h, 0.44, 0.14, 0.08, leatherMat, 0, 1.20, -0.18, false);
    // Heraldic barding caparison cloth & steel chamfron head armor
    if (barded) {
      addBox(h, 0.52, 0.54, 1.14, bardingMat, 0, 0.74, 0, true);
      addBox(h, 0.54, 0.055, 1.16, mat.brassBright, 0, 0.48, 0, false);
      addBox(h, 0.22, 0.18, 0.34, steelMat, 0, 1.43, 0.74, false);
      const chamfronCrest = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), mat.brassBright);
      chamfronCrest.position.set(0, 1.58, 0.68);
      h.add(chamfronCrest);
    }
    parent.add(h);
  }

  function buildJoustEndStation(endSign) {
    // endSign = -1 for West End (X = -18.0), +1 for East End (X = +18.0)
    const st = new THREE.Group();
    const houseCloth = endSign < 0 ? mat.royalVelvet : mat.nobleGreen;
    st.position.set(endSign * 18.0, 0, 0);
    // Local +X points INWARD toward the Lists gate when endSign = -1, so mirror via rotY
    st.rotation.y = endSign < 0 ? 0 : Math.PI;

    // Stone & packed-earth Knight Staging Courtyard (width 5.8 × depth 9.8)
    addBox(st, 5.8, 0.10, 9.8, mat.stoneDark, 0, 0.05, 0, false);
    addBox(st, 5.3, 0.11, 9.3, mat.sand, 0, 0.055, 0, false);
    addBox(st, 5.88, 0.05, 0.10, mat.brass, 0, 0.12, -4.9, false);
    addBox(st, 5.88, 0.05, 0.10, mat.brass, 0, 0.12, 4.9, false);
    addBox(st, 0.10, 0.05, 9.88, mat.brass, -2.9, 0.12, 0, false);

    // ── A. TIMBER HORSE STABLES BARN (North half, Z = -4.5 .. -0.3) ──────────
    const barnX = -1.15;
    const barnZ = -2.35;
    const barnW = 2.8;
    const barnD = 4.2;
    // Back timber wall & 4 stall dividers creating 3 horse stalls facing inward (+X)
    addBox(st, 0.22, 2.25, barnD, mat.timber, barnX - barnW / 2, 1.20, barnZ, true);
    for (let i = 0; i <= 3; i++) {
      const divZ = barnZ - barnD / 2 + (barnD / 3) * i;
      const isOuter = i === 0 || i === 3;
      addBox(st, barnW, isOuter ? 2.25 : 1.18, 0.14, isOuter ? mat.timber : mat.timberLight, barnX, (isOuter ? 2.25 : 1.18) / 2 + 0.10, divZ, true);
      // Front barn support post
      addBox(st, 0.16, 2.28, 0.16, mat.timber, barnX + barnW / 2, 1.22, divZ, true);
    }
    // Pitched Timber Shingle Stables Roof & Brass Ridge
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, barnD + 0.45), mat.plankOak);
      slope.position.set(barnX + side * 0.72, 2.68, barnZ);
      slope.rotation.z = -side * 0.42;
      slope.castShadow = true;
      st.add(slope);
    }
    addBox(st, 0.14, 0.14, barnD + 0.50, mat.brassBright, barnX, 3.04, barnZ, false);

    // 2 Warhorses in the Stalls + Hay Bales & Water Trough + 1 Saddled & Armored Destrier ready in the Yard!
    addWarhorse(st, barnX + 0.15, barnZ - 1.38, Math.PI / 2, horseCoats[0], houseCloth, false);
    addWarhorse(st, barnX + 0.15, barnZ + 0.02, Math.PI / 2, horseCoats[1], houseCloth, true);
    // Golden hay bales in Stall 3 & wooden water trough outside stalls
    addBox(st, 0.62, 0.44, 0.48, hayMat, barnX - 0.55, 0.32, barnZ + 1.38, true);
    addBox(st, 0.56, 0.42, 0.46, hayMat, barnX + 0.15, 0.31, barnZ + 1.44, true);
    addBox(st, 0.52, 0.38, 0.44, hayMat, barnX - 0.25, 0.72, barnZ + 1.40, true);
    addBox(st, 0.48, 0.36, 1.25, mat.timber, 1.45, 0.28, -3.55, true);
    addBox(st, 0.36, 0.06, 1.12, waterMat, 1.45, 0.46, -3.55, false);

    // Fully armored tournament warhorse stepping right onto the Equestrian Causeway toward the open Horse Gate!
    addWarhorse(st, 3.65, -1.05, Math.PI / 2, horseCoats[2], houseCloth, true);

    // ── B. KNIGHT'S EQUIPMENT, LANCE & ARMOR PAVILION (South half, Z = +0.5 .. +4.4)
    const tentX = -1.05;
    const tentZ = 2.45;
    const tentW = 2.9;
    const tentD = 3.5;
    // Striped Heraldic Equipment Pavilion Tent (open toward the yard +X)
    for (const px of [-tentW / 2, tentW / 2]) {
      for (const pz of [-tentD / 2, tentD / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.25, 8), mat.timberLight);
        post.position.set(tentX + px, 1.20, tentZ + pz);
        post.castShadow = true;
        st.add(post);
      }
    }
    const roofPyr = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.35, 4), houseCloth);
    roofPyr.position.set(tentX, 2.95, tentZ);
    roofPyr.rotation.y = Math.PI / 4;
    roofPyr.scale.set(0.92, 1, 1.10);
    roofPyr.castShadow = true;
    st.add(roofPyr);
    addBox(st, tentW + 0.22, 0.14, tentD + 0.22, mat.creamCloth, tentX, 2.26, tentZ, false);
    addBox(st, tentW + 0.26, 0.06, tentD + 0.26, mat.brassBright, tentX, 2.34, tentZ, false);
    addBannerPole(st, tentX, 3.55, tentZ, 1.05, houseCloth, 0.2, false, false);

    // 2 Standing Suits of Polished Plate Armor under the Knight's Pavilion
    addArmorStand(st, tentX - 0.35, tentZ - 0.85, Math.PI / 2, houseCloth);
    addArmorStand(st, tentX - 0.35, tentZ + 0.85, Math.PI / 2, mat.brassBright);

    // Horse-Barding & Saddle Trestle Bench inside the tent
    addBox(st, 0.58, 0.62, 1.15, mat.timber, tentX + 0.72, 0.42, tentZ, true);
    addBox(st, 0.66, 0.20, 0.86, houseCloth, tentX + 0.72, 0.78, tentZ, false);
    addBox(st, 0.48, 0.16, 0.42, leatherMat, tentX + 0.72, 0.94, tentZ, false);

    // Horizontal Jousting Lance Rack right in the staging yard displaying 5 long striped tournament lances!
    const rackX = 1.48;
    const rackZ = 2.35;
    for (const rz of [-1.15, 1.15]) {
      addBox(st, 0.14, 1.25, 0.14, mat.timber, rackX, 0.72, rackZ + rz, true);
      addBox(st, 0.56, 0.10, 0.16, mat.timberLight, rackX, 0.16, rackZ + rz, false);
    }
    for (let li = 0; li < 5; li++) {
      const ly = 0.46 + li * 0.19;
      const lance = new THREE.Mesh(new THREE.ConeGeometry(0.055, 3.35, 8), li % 2 === 0 ? mat.creamCloth : houseCloth);
      lance.rotation.x = Math.PI / 2;
      lance.position.set(rackX + 0.08, ly, rackZ);
      lance.castShadow = true;
      st.add(lance);
      // Brass vamplate hand-guard ring near the butt of each lance
      const guard = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), mat.brassBright);
      guard.rotation.x = Math.PI / 2;
      guard.position.set(rackX + 0.08, ly, rackZ - 0.95);
      st.add(guard);
    }

    // Heraldic banner standards flanking the yard entrance
    addBannerPole(st, 2.55, 0.10, -4.45, 2.5, houseCloth, 0.2, false, false);
    addBannerPole(st, 2.55, 0.10, 4.45, 2.5, houseCloth, 0.2, false, false);

    zoneGroups.stations.add(st);
  }

  function buildMeleeEndStation(endSign) {
    // endSign = -1 for West Armory (X = -18.0), +1 for East Armory (X = +18.0)
    const st = new THREE.Group();
    const houseA = endSign < 0 ? fiveHouses[0] : fiveHouses[2];
    const houseB = endSign < 0 ? fiveHouses[1] : fiveHouses[3];
    st.position.set(endSign * 18.0, 0, 0);
    st.rotation.y = endSign < 0 ? 0 : Math.PI;

    // Fortified Stone-Paved Armory & Outfitting Compound (width 5.8 × depth 9.8)
    addBox(st, 5.8, 0.12, 9.8, mat.stoneDark, 0, 0.06, 0, false);
    addBox(st, 5.3, 0.13, 9.3, mat.stone, 0, 0.065, 0, false);
    addBox(st, 5.88, 0.05, 0.10, mat.brassBright, 0, 0.14, -4.9, false);
    addBox(st, 5.88, 0.05, 0.10, mat.brassBright, 0, 0.14, 4.9, false);
    addBox(st, 0.10, 0.05, 9.88, mat.brassBright, -2.9, 0.14, 0, false);

    // ── A. WEAPONRY SELECTION PAVILION (North half, Z = -2.4) ────────────────
    const wX = -0.95;
    const wZ = -2.45;
    for (const px of [-1.45, 1.45]) {
      for (const pz of [-1.85, 1.85]) {
        addBox(st, 0.15, 2.40, 0.15, mat.iron, wX + px, 1.28, wZ + pz, true);
      }
    }
    // Pitched Dark-Iron & House-Cloth Armory Canopy
    const wRoof = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.16, 4.10), houseA);
    wRoof.position.set(wX, 2.56, wZ);
    wRoof.rotation.z = -0.14;
    wRoof.castShadow = true;
    st.add(wRoof);
    addBox(st, 3.40, 0.07, 4.16, mat.brassBright, wX, 2.66, wZ, false);

    // 1. Longsword & Claymore Rack (6 steel swords standing upright for participants to choose!)
    const swX = wX - 0.65;
    addBox(st, 0.24, 0.16, 2.8, mat.timber, swX, 0.20, wZ, true);
    addBox(st, 0.14, 0.10, 2.8, mat.timberLight, swX, 0.92, wZ, false);
    for (let s = 0; s < 6; s++) {
      const sz = wZ - 1.15 + s * 0.46;
      addBox(st, 0.045, 1.08, 0.09, steelMat, swX + 0.06, 0.78, sz, true);     // steel blade
      addBox(st, 0.06, 0.06, 0.28, mat.brassBright, swX + 0.06, 1.32, sz, false); // crossguard
      addBox(st, 0.05, 0.22, 0.05, leatherMat, swX + 0.06, 1.46, sz, false);     // hilt grip
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat.brassBright);
      pom.position.set(swX + 0.06, 1.59, sz);
      st.add(pom);
    }

    // 2. Polearm, Halberd & Battle-Axe Rack (5 tall weapons in the weapon bay)
    const paX = wX + 0.75;
    addBox(st, 0.26, 0.16, 2.5, mat.timber, paX, 0.20, wZ, true);
    addBox(st, 0.12, 0.08, 2.5, mat.iron, paX, 1.25, wZ, false);
    for (let p = 0; p < 5; p++) {
      const pz = wZ - 1.0 + p * 0.50;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.95, 6), mat.timberLight);
      shaft.position.set(paX, 1.15, pz);
      shaft.castShadow = true;
      st.add(shaft);
      // Alternating steel halberd / battle-axe / war-hammer heads
      if (p % 2 === 0) {
        addBox(st, 0.05, 0.34, 0.28, steelMat, paX + 0.06, 1.92, pz, true);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 4), steelMat);
        spike.position.set(paX, 2.22, pz);
        st.add(spike);
      } else {
        addBox(st, 0.06, 0.28, 0.34, steelDarkMat, paX, 1.98, pz, true);
      }
    }

    // 3. Five-House Shield Selection Rack right outside the weapon tent (6 painted house shields!)
    const shX = 1.62;
    addBox(st, 0.42, 0.58, 3.4, mat.timber, shX, 0.40, wZ, true);
    for (let i = 0; i < 6; i++) {
      const sz = wZ - 1.35 + i * 0.54;
      const shMat = fiveHouses[i % 5];
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.42), shMat);
      shield.position.set(shX + 0.16, 0.86, sz);
      shield.rotation.z = 0.22;
      shield.castShadow = true;
      st.add(shield);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), mat.brassBright);
      boss.position.set(shX + 0.22, 0.86, sz);
      st.add(boss);
    }

    // ── B. ARMOR OUTFITTING STATION & FIELD FORGE (South half, Z = +2.4) ─────
    const aX = -0.95;
    const aZ = 2.45;
    for (const px of [-1.45, 1.45]) {
      for (const pz of [-1.85, 1.85]) {
        addBox(st, 0.15, 2.40, 0.15, mat.iron, aX + px, 1.28, aZ + pz, true);
      }
    }
    const aRoof = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.16, 4.10), houseB);
    aRoof.position.set(aX, 2.56, aZ);
    aRoof.rotation.z = -0.14;
    aRoof.castShadow = true;
    st.add(aRoof);
    addBox(st, 3.40, 0.07, 4.16, mat.brassBright, aX, 2.66, aZ, false);

    // 3 Standing Suits of Plate Armor in Five-House Plumes for participants to suit up!
    addArmorStand(st, aX - 0.65, aZ - 1.05, Math.PI / 2, fiveHouses[0]);
    addArmorStand(st, aX - 0.65, aZ, Math.PI / 2, fiveHouses[1]);
    addArmorStand(st, aX - 0.65, aZ + 1.05, Math.PI / 2, fiveHouses[3]);

    // Armor & Helmet Fitting Table (4 gleaming steel helms + brass bucklers)
    addBox(st, 0.72, 0.68, 2.85, mat.timber, aX + 0.72, 0.46, aZ, true);
    for (let hi = 0; hi < 4; hi++) {
      const hz = aZ - 1.05 + hi * 0.70;
      const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.22, 10), steelMat);
      helm.position.set(aX + 0.72, 0.92, hz);
      helm.castShadow = true;
      st.add(helm);
      const buckler = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), mat.brass);
      buckler.position.set(aX + 0.88, 0.84, hz + 0.18);
      st.add(buckler);
    }

    // Field Smithy Forge Hearth & Iron Anvil on Oak Stump right in the armory yard!
    addBox(st, 0.92, 0.72, 0.92, mat.stoneDark, 1.55, 0.46, aZ - 0.75, true);
    addBrazier(st, 1.55, 0.86, aZ - 0.75, 1.35);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.56, 10), mat.timber);
    stump.position.set(1.55, 0.40, aZ + 0.72);
    stump.castShadow = true;
    st.add(stump);
    addBox(st, 0.44, 0.22, 0.22, mat.iron, 1.55, 0.78, aZ + 0.72, true);
    addBox(st, 0.62, 0.10, 0.18, steelDarkMat, 1.55, 0.90, aZ + 0.72, true);

    // Twin flaming war-braziers & Five-House swallowtail standards at the armory entrance
    for (const bz of [-4.45, 4.45]) {
      addBox(st, 0.36, 1.15, 0.36, mat.stoneDark, 2.55, 0.64, bz, true);
      addBrazier(st, 2.55, 1.26, bz, 0.92);
      addBannerPole(st, 2.55, 0.12, bz + (bz < 0 ? 0.55 : -0.55), 2.6, bz < 0 ? houseA : houseB, 0.2, true, false);
    }

    zoneGroups.stations.add(st);
  }

  for (const endSign of [-1, 1]) {
    if (isMelee) buildMeleeEndStation(endSign);
    else buildJoustEndStation(endSign);
  }

  // Interactive zone highlight overlays
  const highlights = {};
  const addDualHighlight = (key, rects) => {
    const grp = new THREE.Group();
    for (const [w, d, x, y, z] of rects) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.highlightMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      grp.add(m);
    }
    grp.visible = false;
    root.add(grp);
    highlights[key] = grp;
  };
  addDualHighlight('lists', [[24.8, 6.1, 0, 0.12, 0]]);
  addDualHighlight('royalBox', [[15.4, 1.6, 0, 1.38, -4.20], [15.4, 1.6, 0, 1.38, 4.20]]);
  addDualHighlight('nobleStand', [[20.0, 2.5, 0, 3.74, -6.28], [20.0, 2.5, 0, 3.74, 6.28]]);
  addDualHighlight('commonerBench', [[24.0, 4.8, 0, 7.55, -10.0], [24.0, 4.8, 0, 7.55, 10.0]]);
  addDualHighlight('stations', [[6.2, 10.2, -18.0, 0.16, 0], [6.2, 10.2, 18.0, 0.16, 0]]);
  addDualHighlight('pavilions', [[2.6, 2.2, 0, 0.38, -13.4], [2.6, 2.2, 0, 0.38, 13.4]]);

  return {
    root,
    guidesGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    animatedEmbers,
    lighting: isMelee
      ? {
        hemiSky: 0xdce5f2,
        hemiGround: 0x2d1820,
        hemiIntensity: 0.94,
        sunColor: 0xffe2be,
        sunIntensity: 1.58,
        rimColor: 0x99b3d4,
        rimIntensity: 0.72,
      }
      : {
        hemiSky: 0xf6edd6,
        hemiGround: 0x1b2e22,
        hemiIntensity: 0.96,
        sunColor: 0xfff1cf,
        sunIntensity: 1.65,
        rimColor: 0x9fc2a7,
        rimIntensity: 0.56,
      },
    metadata: {
      title: isMelee ? 'Battle of the Five Banners' : 'The Tourney of the Silver Lance',
      venue: isMelee
        ? 'The Royal Lists · 3-Tier Grand Melee Stadium & Armory Camps (300 Seats)'
        : 'The Royal Lists · 3-Tier Jousting Stadium & Knight Stables (300 Seats)',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Royal Box View',
        lists: isMelee ? 'Battlefield Level' : 'Jousting Lane',
      },
      subViewsLabel: 'View spectacle from',
      subViewsReset: 'Full Stadium',
      subViews: [
        { key: 'royalBox', preset: 'view-royal', label: 'Royal Box (20)', detail: 'Ringside marble & velvet thrones with drink tables' },
        { key: 'nobleStand', preset: 'view-noble', label: 'Noble Stand (80)', detail: 'Elevated 4-row cushioned gallery chairs' },
        { key: 'commonerBench', preset: 'view-commoner', label: 'Commoner’s Bench (200)', detail: 'Steep 10-row open oak bleachers with clear sightlines' },
        { key: 'stations', preset: 'view-station', label: isMelee ? 'Weaponry & Armor' : 'Stables & Armory', detail: isMelee ? 'West & East participant weapon racks, shields, armor & forge' : 'West & East stables, warhorses, lance racks & knight armor' },
        { key: 'lists', preset: 'lists', label: isMelee ? 'Melee Field' : 'Jousting Field', detail: 'Ground-level arena perspective' },
      ],
      zones: [
        { key: 'lists', label: isMelee ? 'Melee Field & Five Banners' : 'The Royal Lists & Tilt', color: '#e3c786', preset: 'lists' },
        { key: 'royalBox', label: 'Royal Box · 20 Velvet Thrones', color: '#8a2432', preset: 'view-royal' },
        { key: 'nobleStand', label: 'Noble Stand · 80 Gallery Chairs', color: isMelee ? '#305578' : '#346146', preset: 'view-noble' },
        { key: 'commonerBench', label: 'Commoner’s · 200 Oak Benches', color: '#9b7a52', preset: 'view-commoner' },
        { key: 'stations', label: isMelee ? 'West & East Weaponry & Armor' : 'West & East Stables & Lances', color: '#c8d0d6', preset: 'view-station' },
        { key: 'pavilions', label: 'Royal T-Gate Entrances', color: '#cdc4ad', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 31.5, 31.5], target: [0, 1.5, 0] },
      isometric: { pos: [19.5, 24.5, 31.5], target: [0, 1.8, 0] },
      top: { pos: [0, 53.5, 0.05], target: [0, 0, 0] },
      royal: { pos: [0, 1.85, -4.15], target: [0, 0.55, 0.6] },
      lists: { pos: [-13.4, 2.35, 1.45], target: [1.5, 2.2, -3.5] },
      'view-royal': { pos: [0, 1.85, -4.15], target: [0, 0.55, 0.6] },
      'view-noble': { pos: [0, 3.65, -6.35], target: [0, 0.45, 0.3] },
      'view-commoner': { pos: [0, 6.25, -9.85], target: [0, 0.45, 0.0] },
      'view-station': { pos: [-9.8, 5.4, 7.6], target: [-15.4, 1.35, 0] },
    },
  };
}

function buildSilverLanceVenue() {
  return buildRoyalListsStadium(false);
}

function buildFiveBannersVenue() {
  return buildRoyalListsStadium(true);
}

/**
 * Builds The Iron Colosseum — Games of the Iron Colosseum (Gladiatorial Games).
 * Exact 1:1 elliptical amphitheatre geometry matching templates/venue_art.html:
 *   - 5 concentric ellipses centered at (180, 93):
 *     (125×69), (115×61), (103×52), (91×43), and arena floor (74×31)
 *   - 12 radial stairways / vomitoria aisles spanning outer wall to arena rail
 *   - Central crossed-blade clash emblem + West & East challenger start bars
 */
function buildIronColosseumVenue() {
  const root = new THREE.Group();
  const baseMat = makeMaterials();
  const mat = {
    ...baseMat,
    ground: new THREE.MeshStandardMaterial({ color: 0x1c2f3a, roughness: 0.92, metalness: 0.06 }),
    plinthEdge: new THREE.MeshStandardMaterial({ color: 0xdfb97a, roughness: 0.34, metalness: 0.66 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb6b8b5, roughness: 0.84, metalness: 0.08 }),
    stoneLight: new THREE.MeshStandardMaterial({ color: 0xc9c6bc, roughness: 0.82, metalness: 0.06 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x677278, roughness: 0.86, metalness: 0.12 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2e3b44, roughness: 0.44, metalness: 0.74 }),
    steelBlue: new THREE.MeshStandardMaterial({ color: 0x305066, roughness: 0.72, metalness: 0.10, side: THREE.DoubleSide }),
    sand: new THREE.MeshStandardMaterial({ color: 0xb0986d, roughness: 0.95, metalness: 0.02 }),
    sandInner: new THREE.MeshStandardMaterial({ color: 0x9e855c, roughness: 0.96, metalness: 0.02 }),
    benchOak: new THREE.MeshStandardMaterial({ color: 0x8d714f, roughness: 0.8, metalness: 0.06 }),
    ember: new THREE.MeshStandardMaterial({ color: 0xffa640, emissive: 0xff6b1a, emissiveIntensity: 1.5, roughness: 0.35 }),
  };

  const animatedPennants = [];
  const animatedEmbers = [];
  const guidesGroup = new THREE.Group();
  const zoneGroups = {
    arena: new THREE.Group(),
    groundling: new THREE.Group(),
    noble: new THREE.Group(),
    commoner: new THREE.Group(),
    wall: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  const cx = toX(180); // 0
  const cz = toZ(93);  // +0.05

  // Helper: create a smooth extruded elliptical ring lying horizontally (XZ plane)
  function addEllipticalRing(parent, outerRx, outerRz, innerRx, innerRz, height, yBottom, material, segments = 96) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, outerRx, outerRz, 0, Math.PI * 2, false, 0);
    if (innerRx > 0 && innerRz > 0) {
      const hole = new THREE.Path();
      hole.absellipse(0, 0, innerRx, innerRz, 0, Math.PI * 2, true, 0);
      shape.holes.push(hole);
    }
    const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: segments });
    // ExtrudeGeometry extrudes along +Z; rotate -PI/2 around X so ellipse lies in XZ and extrudes upward (+Y)
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(cx, yBottom, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Helper: crisp antique-brass elliptical rim accent matching the exact SVG ellipse strokes
  function addBrassEllipseRim(parent, rx, rz, yPos, thickness = 0.09, height = 0.065) {
    return addEllipticalRing(parent, rx + thickness / 2, rz + thickness / 2, rx - thickness / 2, rz - thickness / 2, height, yPos, mat.brassBright, 108);
  }

  function addBrazier(parent, x, y, z, scale = 1) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.08 * scale, 0.16 * scale, 8), mat.iron);
    bowl.position.set(x, y, z);
    bowl.castShadow = true;
    parent.add(bowl);

    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.10 * scale), mat.ember.clone());
    flame.position.set(x, y + 0.12 * scale, z);
    flame.scale.set(0.85, 1.35, 0.85);
    parent.add(flame);
    animatedEmbers.push({ mesh: flame, baseY: flame.position.y, phase: x * 0.9 + z * 1.1 });
  }

  // ── 1. ARCHITECTURAL BASE PLINTH (EXTENDED ALL 4 SIDES FOR 4 CARDINAL PLAZAS)
  const plinthW = 39.6;
  const plinthD = 28.4;
  const plinthCZ = cz; // Centered on Colosseum (X = -19.8..+19.8, Z = -14.15..+14.25)
  addBox(root, plinthW, 0.46, plinthD, mat.ground, 0, -0.23, plinthCZ, false);

  const rimH = 0.07;
  const rimT = 0.14;
  addBox(root, plinthW + 0.14, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthCZ - plinthD / 2, false);
  addBox(root, plinthW + 0.14, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthCZ + plinthD / 2, false);
  addBox(root, rimT, rimH, plinthD + 0.14, mat.plinthEdge, -plinthW / 2, -0.02, plinthCZ, false);
  addBox(root, rimT, rimH, plinthD + 0.14, mat.plinthEdge, plinthW / 2, -0.02, plinthCZ, false);

  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.08 });
  const gridPoints = [];
  for (let gx = -19.2; gx <= 19.21; gx += 1.6) {
    gridPoints.push(new THREE.Vector3(gx, 0.005, -13.6), new THREE.Vector3(gx, 0.005, 13.7));
  }
  for (let gz = -13.6; gz <= 13.71; gz += 1.6) {
    gridPoints.push(new THREE.Vector3(-19.2, 0.005, gz), new THREE.Vector3(19.2, 0.005, gz));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  // Outer Circular Ground Ring (exact SVG: circle cx="180" cy="92" r="77")
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(7.63, 7.75, 112), mat.guideRing);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(0, 0.016, toZ(92));
  guidesGroup.add(ringMesh);

  // Crosshairs, corner brackets, bottom-left scale bar, top-right North arrow
  const crossPts = [
    new THREE.Vector3(0, 0.014, toZ(9)), new THREE.Vector3(0, 0.014, toZ(176)),
    new THREE.Vector3(toX(16), 0.014, toZ(92)), new THREE.Vector3(toX(344), 0.014, toZ(92)),
  ];
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), mat.guideLine));

  const bracketPts = [
    [toX(20), toZ(30), toX(20), toZ(21)], [toX(20), toZ(21), toX(33), toZ(21)],
    [toX(327), toZ(21), toX(340), toZ(21)], [toX(340), toZ(21), toX(340), toZ(30)],
    [toX(20), toZ(155), toX(20), toZ(164)], [toX(20), toZ(164), toX(33), toZ(164)],
    [toX(327), toZ(164), toX(340), toZ(164)], [toX(340), toZ(164), toX(340), toZ(155)],
    [toX(19), toZ(171), toX(54), toZ(171)], [toX(19), toZ(168), toX(19), toZ(174)], [toX(54), toZ(168), toX(54), toZ(174)],
    [toX(324), toZ(23), toX(330), toZ(13)], [toX(330), toZ(13), toX(336), toZ(23)], [toX(330), toZ(13), toX(330), toZ(32)],
  ];
  const bVecs = [];
  for (const [x1, z1, x2, z2] of bracketPts) {
    bVecs.push(new THREE.Vector3(x1, 0.018, z1), new THREE.Vector3(x2, 0.018, z2));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bVecs), mat.guideLine));

  // ── 2. CENTRAL GLADIATORIAL ARENA PIT (rx=7.4, rz=3.1) ─────────────────────
  // Exact SVG: <ellipse class="sketch-field" cx="180" cy="93" rx="74" ry="31"/>
  const arenaGroup = zoneGroups.arena;
  addEllipticalRing(arenaGroup, 7.42, 3.12, 0, 0, 0.14, 0.0, mat.sand, 96);
  addEllipticalRing(arenaGroup, 5.4, 2.15, 0, 0, 0.155, 0.0, mat.sandInner, 80);

  // Protective Iron-Banded Arena Podium Retaining Wall at rx=7.4, rz=3.1
  addEllipticalRing(arenaGroup, 7.66, 3.32, 7.36, 3.06, 0.72, 0.0, mat.stoneDark, 96);
  addBrassEllipseRim(arenaGroup, 7.4, 3.1, 0.72, 0.11, 0.075);

  // Central Arena Duel Markings (exact SVG: M172 88l16 10m0-10-16 10M146 93h-10m88 0h-10)
  // Center crossed X: X = -0.8..+0.8, Z = -0.45..+0.55 (width 1.6, height 1.0)
  const crossDiag = Math.hypot(1.6, 1.0);
  const crossAngle = Math.atan2(1.0, 1.6);
  const centerMedallion = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 40), mat.brass);
  centerMedallion.rotation.x = -Math.PI / 2;
  centerMedallion.position.set(cx, 0.175, cz);
  arenaGroup.add(centerMedallion);

  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(crossDiag, 0.08, 0.13), mat.brassBright);
    blade.position.set(cx, 0.20, cz);
    blade.rotation.y = s * crossAngle;
    blade.castShadow = true;
    arenaGroup.add(blade);
  }

  // West Challenger Start Bar (M146 93h-10 => X = -4.4..-3.4, Z = +0.05)
  // East Challenger Start Bar (M224 93h-10 => X = +3.4..+4.4, Z = +0.05)
  for (const dir of [-1, 1]) {
    const barX = cx + dir * 3.9;
    addBox(arenaGroup, 1.0, 0.08, 0.15, mat.brassBright, barX, 0.20, cz, true);
    // Low iron challenger marker pedestal beside each start line
    addBox(arenaGroup, 0.22, 0.34, 0.22, mat.iron, barX + dir * 0.75, 0.30, cz, true);
    addBox(arenaGroup, 0.26, 0.06, 0.26, mat.brass, barX + dir * 0.75, 0.49, cz, false);
  }

  // West & East Gladiator Portcullis Arches entering the sand pit at X = ±7.4
  for (const dir of [-1, 1]) {
    const gx = cx + dir * 7.52;
    addBox(arenaGroup, 0.46, 0.92, 1.16, mat.iron, gx, 0.46, cz, true);
    addBox(arenaGroup, 0.50, 0.12, 1.24, mat.brass, gx, 0.94, cz, false);
    for (const pz of [-0.36, -0.12, 0.12, 0.36]) {
      addBox(arenaGroup, 0.06, 0.74, 0.05, mat.brass, gx - dir * 0.20, 0.44, cz + pz, false);
    }
  }

  // ── 3. ARENA SAFETY PODIUM & MARSHAL WALK (rx=7.4..9.1, rz=3.1..4.3) ───────
  // Elevated stone podium separating the gladiatorial sand pit from the Noble Stand above
  addEllipticalRing(zoneGroups.arena, 9.10, 4.30, 7.52, 3.20, 0.92, 0.0, mat.stone, 96);
  addEllipticalRing(zoneGroups.arena, 9.04, 4.25, 8.32, 3.72, 0.16, 0.92, mat.stoneLight, 96);
  addBrassEllipseRim(zoneGroups.arena, 9.1, 4.3, 1.12, 0.12, 0.08);

  // ── 4. PLUSH ROYAL NOBLE STAND (rx=9.1..10.3, rz=4.3..5.2) · 60 ARMCHAIRS ──
  // Unmistakably regal: crimson-velvet carpeted loges, gold-armed high-back thrones,
  // private gilded box dividers, brass balustrade, and shaded North/South Imperial Canopies!
  const nobleVelvet = new THREE.MeshStandardMaterial({ color: 0x7a2430, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide });
  const nobleCarpet = new THREE.MeshStandardMaterial({ color: 0x5c1f28, roughness: 0.84, metalness: 0.04 });

  addEllipticalRing(zoneGroups.noble, 10.30, 5.20, 9.10, 4.30, 1.48, 0.0, mat.stoneDark, 96);
  // Crimson-velvet carpeted Noble terraces
  addEllipticalRing(zoneGroups.noble, 9.72, 4.76, 9.14, 4.34, 0.18, 1.38, nobleCarpet, 96);
  addEllipticalRing(zoneGroups.noble, 10.28, 5.18, 9.74, 4.78, 0.22, 1.56, nobleCarpet, 96);
  // Gleaming brass Noble front rail & back cornice
  addBrassEllipseRim(zoneGroups.noble, 9.14, 4.34, 1.66, 0.09, 0.09);
  addBrassEllipseRim(zoneGroups.noble, 10.3, 5.2, 1.82, 0.12, 0.08);

  // FOUR GRAND CARDINAL IMPERIAL NOBLE PAVILIONS (North / South / West / East)
  // Each features a projecting marble & velvet balcony, heraldic parapet crest,
  // 4 fluted marble-and-gold columns, corner braziers, and a stepped royal pavilion crown!
  function buildGrandNoblePavilion(px, pz, rotY, width, depth) {
    const pav = new THREE.Group();
    pav.position.set(px, 0, pz);
    pav.rotation.y = rotY; // Local +Z faces inward toward the arena pit

    // Elevated carved marble & crimson-velvet royal dais balcony projecting toward the arena
    addBox(pav, width + 0.26, 0.42, depth + 0.34, mat.stoneLight, 0, 1.56, 0.10, true);
    addBox(pav, width + 0.10, 0.08, depth + 0.18, nobleCarpet, 0, 1.79, 0.10, false);

    // Ornate front royal parapet balcony with draped velvet tapestry & golden crest emblem
    const frontZ = depth / 2 + 0.22;
    addBox(pav, width + 0.26, 0.44, 0.16, mat.stoneLight, 0, 1.98, frontZ, true);
    addBox(pav, width + 0.34, 0.08, 0.22, mat.brassBright, 0, 2.22, frontZ, false);
    addBox(pav, width * 0.72, 0.62, 0.08, nobleVelvet, 0, 1.78, frontZ + 0.09, false);
    addBox(pav, width * 0.76, 0.05, 0.09, mat.brassBright, 0, 1.48, frontZ + 0.095, false);
    // Center gilded imperial shield crest on front parapet
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.20), mat.brassBright);
    crest.scale.set(1.0, 1.25, 0.42);
    crest.position.set(0, 1.82, frontZ + 0.15);
    pav.add(crest);

    // 4 Fluted Marble & Gold Classical Columns on stepped pedestals + front corner braziers
    const colX = width / 2 - 0.14;
    const colFrontZ = frontZ - 0.06;
    const colBackZ = -depth / 2 + 0.02;
    for (const cxCol of [-colX, colX]) {
      // Front & rear column pairs
      for (const czCol of [colFrontZ, colBackZ]) {
        addBox(pav, 0.24, 0.22, 0.24, mat.stoneLight, cxCol, 1.88, czCol, true);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.78, 12), mat.stoneLight);
        shaft.position.set(cxCol, 2.84, czCol);
        shaft.castShadow = true;
        pav.add(shaft);
        // Gilded Corinthian capital & base collar
        addBox(pav, 0.24, 0.12, 0.24, mat.brassBright, cxCol, 3.74, czCol, false);
        addBox(pav, 0.20, 0.07, 0.20, mat.brass, cxCol, 2.02, czCol, false);
      }
      // Side gilded colonnade railing & velvet side curtains
      addBox(pav, 0.10, 0.42, depth + 0.12, nobleVelvet, cxCol, 2.02, 0.06, false);
      addBox(pav, 0.12, 0.06, depth + 0.16, mat.brassBright, cxCol, 2.24, 0.06, false);
      // Warm glowing corner braziers flanking the front balcony
      addBrazier(pav, cxCol + (cxCol < 0 ? -0.22 : 0.22), 2.30, frontZ, 0.78);
    }

    // Grand Multi-Tiered Stepped Imperial Velvet Pavilion Roof (NOT a flat slab!)
    // Architrave frieze + gold cornice
    addBox(pav, width + 0.42, 0.20, depth + 0.42, mat.stoneLight, 0, 3.88, 0.08, true);
    addBox(pav, width + 0.50, 0.08, depth + 0.50, mat.brassBright, 0, 4.00, 0.08, false);
    // Scalloped crimson valance skirt hanging below architrave
    addBox(pav, width + 0.36, 0.18, depth + 0.36, nobleVelvet, 0, 3.72, 0.08, false);
    // Tier 1 sloped imperial velvet canopy
    addBox(pav, width + 0.26, 0.26, depth + 0.26, nobleVelvet, 0, 4.16, 0.08, true);
    addBox(pav, width + 0.30, 0.06, depth + 0.30, mat.brass, 0, 4.30, 0.08, false);
    // Tier 2 stepped royal crown
    addBox(pav, width * 0.74, 0.28, depth * 0.72, nobleVelvet, 0, 4.44, 0.08, true);
    addBox(pav, width * 0.78, 0.06, depth * 0.76, mat.brassBright, 0, 4.59, 0.08, false);
    // Tier 3 central imperial cupola & golden finial spire
    addBox(pav, width * 0.40, 0.22, depth * 0.42, mat.brass, 0, 4.71, 0.08, true);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 6), mat.brassBright);
    spire.position.set(0, 5.10, 0.08);
    spire.castShadow = true;
    pav.add(spire);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mat.brassBright);
    orb.position.set(0, 5.44, 0.08);
    pav.add(orb);

    // 4 Corner roof brass finials
    for (const fx of [-(width / 2 + 0.16), width / 2 + 0.16]) {
      for (const fz of [-(depth / 2 + 0.06), depth / 2 + 0.22]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), mat.brassBright);
        fin.position.set(fx, 4.18, fz);
        fin.rotation.y = Math.PI / 4;
        pav.add(fin);
      }
    }

    zoneGroups.noble.add(pav);
  }

  // Spread grand Noble Stand pavilions symmetrically in all 4 cardinal directions (Top, Bottom, Left, Right)
  buildGrandNoblePavilion(cx, cz - 4.82, 0, 3.85, 1.24);              // North (Top)
  buildGrandNoblePavilion(cx, cz + 4.82, Math.PI, 3.85, 1.24);        // South (Bottom)
  buildGrandNoblePavilion(cx - 9.72, cz, Math.PI / 2, 2.75, 1.20);    // West (Left)
  buildGrandNoblePavilion(cx + 9.72, cz, -Math.PI / 2, 2.75, 1.20);   // East (Right)

  // ── 5. COMMUNAL COMMONER'S OAK BENCHES (rx=10.3..12.5, rz=5.2..6.9) · 240 ──
  // Open-air stepped stone tiers fitted with continuous weathered oak timber benches
  // (visually rustic & communal — zero velvet cushions or armrests!)
  const plankOak = new THREE.MeshStandardMaterial({ color: 0x876744, roughness: 0.86, metalness: 0.04 });
  addEllipticalRing(zoneGroups.commoner, 11.50, 6.10, 10.30, 5.20, 2.18, 0.0, mat.stone, 96);
  addBrassEllipseRim(zoneGroups.commoner, 11.5, 6.1, 2.50, 0.11, 0.07);
  addEllipticalRing(zoneGroups.commoner, 12.50, 6.90, 11.50, 6.10, 2.86, 0.0, mat.stoneDark, 108);

  // Continuous curved communal oak bench planks across all 4 Commoner's bench rows
  for (const [rxIn, rzIn, rxOut, rzOut, benchY] of [
    [10.42, 5.30, 10.74, 5.54, 2.18],
    [11.00, 5.73, 11.32, 5.97, 2.40],
    [11.58, 6.16, 11.86, 6.38, 2.86],
    [11.92, 6.43, 12.16, 6.62, 2.98],
  ]) {
    addEllipticalRing(zoneGroups.commoner, rxOut, rzOut, rxIn, rzIn, 0.12, benchY, plankOak, 96);
  }

  // Populate exact 60 plush Noble armchairs (crimson velvet + gold arms)
  // and 240 subtle iron bench-divider studs marking the 240 Commoner's bench spots
  const colNobleSeats = [];
  const colCommonerDividers = [];
  const wedgeStep = (Math.PI * 2) / 12;
  const pushEllipticRow = (bucket, rx, rz, y, countPerWedge) => {
    for (let w = 0; w < 12; w++) {
      const a0 = w * wedgeStep + 0.11;
      const a1 = (w + 1) * wedgeStep - 0.11;
      for (let s = 0; s < countPerWedge; s++) {
        const t = countPerWedge === 1 ? 0.5 : (s + 0.5) / countPerWedge;
        const theta = a0 + (a1 - a0) * t;
        const sx = cx + Math.cos(theta) * rx;
        const sz = cz + Math.sin(theta) * rz;
        const rotY = Math.atan2(cx - sx, cz - sz);
        bucket.push({ x: sx, y, z: sz, rotY });
      }
    }
  };
  pushEllipticRow(colNobleSeats, 9.42, 4.54, 1.62, 2);
  pushEllipticRow(colNobleSeats, 9.98, 4.96, 1.85, 3);
  addInstancedNobleArmchairs(zoneGroups.noble, colNobleSeats, nobleVelvet, mat.brassBright, 1.25);

  pushEllipticRow(colCommonerDividers, 10.58, 5.42, 2.34, 5);
  pushEllipticRow(colCommonerDividers, 11.16, 5.85, 2.56, 5);
  pushEllipticRow(colCommonerDividers, 11.72, 6.27, 3.01, 5);
  pushEllipticRow(colCommonerDividers, 12.04, 6.53, 3.13, 5);
  // Subtle iron bench markers (flat planks, no plush backrests) marking all 240 Commoner's bench places
  const benchMarkerGeom = new THREE.BoxGeometry(0.045, 0.055, 0.24);
  const benchMarkers = new THREE.InstancedMesh(benchMarkerGeom, mat.iron, colCommonerDividers.length);
  const bmDummy = new THREE.Object3D();
  colCommonerDividers.forEach((p, idx) => {
    bmDummy.position.set(p.x, p.y, p.z);
    bmDummy.rotation.set(0, p.rotY, 0);
    bmDummy.updateMatrix();
    benchMarkers.setMatrixAt(idx, bmDummy.matrix);
  });
  benchMarkers.instanceMatrix.needsUpdate = true;
  zoneGroups.commoner.add(benchMarkers);

  // ── 5B. FOUR CARDINAL EXTERIOR GROUNDLING PLAZAS & GIANT LIVE BIG SCREENS ──
  // Spread symmetrically outside North (Top), South (Bottom), West (Left), and East (Right)
  // facades so Groundling crowds surround the Colosseum watching the live feed on 4 giant screens!
  const gGroup = zoneGroups.groundling;
  const sharedScreenMat = makeColosseumScreenMaterial();
  const groundlingPlazaRects = [];

  function buildGroundlingPlaza(px, pz, rotY, screenW, plazaW, plazaD) {
    const plaza = new THREE.Group();
    plaza.position.set(px, 0, pz);
    plaza.rotation.y = rotY; // Local +Z faces outward from Colosseum toward standing Groundlings

    const plazaMidZ = plazaD / 2;
    // Cobbled exterior festival courtyard floor & antique-brass perimeter trim
    addBox(plaza, plazaW, 0.12, plazaD, mat.stoneDark, 0, 0.06, plazaMidZ, false);
    addBox(plaza, plazaW - 0.45, 0.14, plazaD - 0.45, mat.stone, 0, 0.07, plazaMidZ, false);
    addBox(plaza, plazaW + 0.10, 0.05, 0.10, mat.brass, 0, 0.15, plazaD, false);
    addBox(plaza, 0.10, 0.05, plazaD + 0.10, mat.brass, -plazaW / 2, 0.15, plazaMidZ, false);
    addBox(plaza, 0.10, 0.05, plazaD + 0.10, mat.brass, plazaW / 2, 0.15, plazaMidZ, false);

    // Monumental Wrought-Iron & Brass Truss Tower supporting the Giant Live Screen
    const scZ = 0.42;
    const screenH = screenW * (9 / 16);
    const screenY = 2.85;
    const towerH = screenY + screenH / 2 + 0.35;

    for (const sx of [-screenW / 2 - 0.24, screenW / 2 + 0.24]) {
      addBox(plaza, 0.40, 0.34, 0.60, mat.stoneDark, sx, 0.17, scZ, true);
      addBox(plaza, 0.22, towerH, 0.22, mat.iron, sx, towerH / 2 + 0.08, scZ, true);
      addBox(plaza, 0.28, 0.09, 0.28, mat.brassBright, sx, towerH + 0.12, scZ, false);
      addBrazier(plaza, sx, towerH + 0.22, scZ, 0.88);
    }
    addBox(plaza, screenW + 0.84, 0.22, 0.26, mat.iron, 0, screenY + screenH / 2 + 0.18, scZ, true);
    addBox(plaza, screenW + 0.84, 0.20, 0.26, mat.iron, 0, screenY - screenH / 2 - 0.15, scZ, true);
    addBox(plaza, screenW + 0.90, 0.07, 0.30, mat.brassBright, 0, screenY + screenH / 2 + 0.31, scZ, false);

    // Dark steel housing & glowing live broadcast big screen facing outward (+Z)
    addBox(plaza, screenW + 0.22, screenH + 0.22, 0.30, mat.iron, 0, screenY, scZ, true);
    const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), sharedScreenMat);
    screenPlane.position.set(0, screenY, scZ + 0.165);
    plaza.add(screenPlane);

    // 3 Stepped Iron Standing-Crowd Viewing Barriers facing the Big Screen
    const railW = Math.min(plazaW - 3.6, screenW + 1.6);
    for (const rz of [1.95, 3.20, 4.45]) {
      if (rz > plazaD - 0.85) continue;
      addBox(plaza, railW, 0.06, 0.08, mat.iron, 0, 0.70, rz, false);
      addBox(plaza, railW, 0.05, 0.09, mat.brass, 0, 0.75, rz, false);
      const posts = 5;
      for (let p = 0; p <= posts; p++) {
        const rx = -railW / 2 + (railW / posts) * p;
        addBox(plaza, 0.085, 0.74, 0.085, mat.iron, rx, 0.37, rz, true);
      }
      addBox(plaza, railW - 0.2, 0.03, 0.58, mat.stoneLight, 0, 0.15, rz + 0.38, false);
    }

    // Flanking Medieval Festival Banner Stalls & Brazier Entry Pillars
    for (const side of [-1, 1]) {
      const stallX = side * (plazaW / 2 - 0.92);
      const stallL = Math.min(2.8, plazaD - 2.4);
      addBox(plaza, 1.18, 1.18, stallL, mat.timber, stallX, 0.64, plazaMidZ + 0.25, true);
      addBox(plaza, 1.36, 0.15, stallL + 0.22, side < 0 ? mat.steelBlue : nobleVelvet, stallX, 1.78, plazaMidZ + 0.25, true);
      addBox(plaza, 1.40, 0.055, stallL + 0.26, mat.brass, stallX, 1.87, plazaMidZ + 0.25, false);
      for (const sOff of [-stallL / 2 + 0.14, stallL / 2 - 0.14]) {
        addBox(plaza, 0.09, 1.75, 0.09, mat.timberLight, stallX - side * 0.48, 0.92, plazaMidZ + 0.25 + sOff, true);
      }
      addBox(plaza, 0.40, 1.36, 0.40, mat.stoneDark, side * 1.9, 0.70, plazaD - 0.22, true);
      addBrazier(plaza, side * 1.9, 1.44, plazaD - 0.22, 0.80);
    }

    gGroup.add(plaza);
    groundlingPlazaRects.push({ px, pz, rotY, plazaW, plazaD });
  }

  // Place all 4 Cardinal Groundling Big-Screen Plazas around the Iron Colosseum
  buildGroundlingPlaza(cx, cz + 7.45, 0, 7.2, 13.4, 5.9);             // South (Bottom)
  buildGroundlingPlaza(cx, cz - 7.45, Math.PI, 7.2, 13.4, 5.9);       // North (Top)
  buildGroundlingPlaza(cx + 13.05, cz, Math.PI / 2, 6.0, 11.2, 5.6);  // East (Right)
  buildGroundlingPlaza(cx - 13.05, cz, -Math.PI / 2, 6.0, 11.2, 5.6); // West (Left)

  // ── 6. MONUMENTAL OUTER IRON CURTAIN WALL & COLONNADE (rx=12.5, rz=6.9) ────
  const wallGroup = zoneGroups.wall;
  // Iron-capped outer parapet crown
  addEllipticalRing(wallGroup, 12.54, 6.94, 12.16, 6.64, 0.56, 2.82, mat.iron, 108);
  addBrassEllipseRim(wallGroup, 12.5, 6.9, 3.38, 0.12, 0.08);

  // 24 Monumental Exterior Buttress Pilasters & Upper Colonnade Posts around the oval
  const pilasterCount = 24;
  for (let i = 0; i < pilasterCount; i++) {
    const theta = (i / pilasterCount) * Math.PI * 2;
    const px = cx + Math.cos(theta) * 12.56;
    const pz = cz + Math.sin(theta) * 6.96;
    const nx = Math.cos(theta) / 12.56;
    const nz = Math.sin(theta) / 6.96;
    const rotY = Math.atan2(nx, nz);

    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.30, 3.36, 0.34), i % 2 === 0 ? mat.iron : mat.stoneDark);
    pilaster.position.set(px, 1.68, pz);
    pilaster.rotation.y = rotY;
    pilaster.castShadow = true;
    pilaster.receiveShadow = true;
    wallGroup.add(pilaster);

    // Every 2nd pilaster (aligned with the 12 radial aisles): iron brazier + tall arena pennant!
    if (i % 2 === 0) {
      addBrazier(wallGroup, px, 3.48, pz, 0.92);

      // Tall steel-blue & gold pennants on the 4 cardinal points + alternating piers
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 1.35, 8), mat.iron);
      pole.position.set(cx + Math.cos(theta) * 12.28, 3.92, cz + Math.sin(theta) * 6.72);
      wallGroup.add(pole);

      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), mat.brassBright);
      orb.position.set(cx + Math.cos(theta) * 12.28, 4.62, cz + Math.sin(theta) * 6.72);
      wallGroup.add(orb);

      const fShape = new THREE.Shape();
      fShape.moveTo(0, 0.14);
      fShape.lineTo(0.62, 0.0);
      fShape.lineTo(0, -0.14);
      fShape.closePath();
      const flagMat = (i % 4 === 0 ? mat.steelBlue : mat.wine).clone();
      flagMat.side = THREE.DoubleSide;
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(fShape), flagMat);
      flag.position.set(cx + Math.cos(theta) * 12.28, 4.36, cz + Math.sin(theta) * 6.72);
      flag.rotation.y = -theta + Math.PI * 0.2;
      wallGroup.add(flag);
      animatedPennants.push({ mesh: flag, baseY: flag.rotation.y, phase: i * 0.55 });
    }
  }

  // ── 7. EXACT 12 RADIAL VOMITORIA / AISLE STAIRWAYS ─────────────────────────
  // Exact SVG path endpoints from templates/venue_art.html:
  // M180 24v38, M242 34l-25 31, M288 58l-42 20, M305 93h-51, M288 128l-42-20, M242 152l-25-31,
  // M180 162v-38, M118 152l25-31, M72 128l42-20, M55 93h51, M72 58l42 20, M118 34l25 31
  const spokes = [
    [180, 24, 180, 62],
    [242, 34, 217, 65],
    [288, 58, 246, 78],
    [305, 93, 254, 93],
    [288, 128, 246, 108],
    [242, 152, 217, 121],
    [180, 162, 180, 124],
    [118, 152, 143, 121],
    [72, 128, 114, 108],
    [55, 93, 106, 93],
    [72, 58, 114, 78],
    [118, 34, 143, 65],
  ];

  for (const [ox, oy, ix, iy] of spokes) {
    const x1 = toX(ox), z1 = toZ(oy); // Outer rim point (y = 3.34)
    const x2 = toX(ix), z2 = toZ(iy); // Inner arena wall point (y = 0.78)
    const dx = x2 - x1;
    const dz = z2 - z1;
    const horizLen = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);

    // Stepped stone stair stringer rising cleanly from inner podium to outer crown
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const sx = x1 + dx * t;
      const sz = z1 + dz * t;
      const sh = 3.20 - t * 2.38; // slopes from 3.20 at outer wall down to 0.82 at arena rail
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, horizLen / steps + 0.08), mat.stoneLight);
      stepMesh.position.set(sx, sh, sz);
      stepMesh.rotation.y = yaw;
      stepMesh.castShadow = true;
      stepMesh.receiveShadow = true;
      zoneGroups.commoner.add(stepMesh);
    }

    // Crisp continuous inclined antique-brass aisle rail (reads identically to the 12 spokes from Top-Down!)
    const dy = 0.80 - 3.38;
    const railLen = Math.hypot(horizLen, dy);
    const pitch = Math.atan2(-dy, horizLen);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, railLen), mat.brassBright);
    rail.position.set((x1 + x2) / 2, (3.38 + 0.80) / 2 + 0.06, (z1 + z2) / 2);
    rail.rotation.order = 'YXZ';
    rail.rotation.y = yaw;
    rail.rotation.x = pitch;
    zoneGroups.commoner.add(rail);
  }

  // Subtle elliptical zone highlights for interactive legend chips
  const highlights = {};
  const addEllipticalHighlight = (key, outerRx, outerRz, innerRx, innerRz, yPos) => {
    const mesh = addEllipticalRing(root, outerRx, outerRz, innerRx, innerRz, 0.04, yPos, mat.highlightMat.clone(), 80);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    highlights[key] = mesh;
  };
  addEllipticalHighlight('arena', 7.35, 3.05, 0, 0, 0.22);
  const plazaHLGroup = new THREE.Group();
  for (const r of groundlingPlazaRects) {
    const wrap = new THREE.Group();
    wrap.position.set(r.px, 0.18, r.pz);
    wrap.rotation.y = r.rotY;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(r.plazaW + 0.4, r.plazaD + 0.4), mat.highlightMat.clone());
    plane.rotation.x = -Math.PI / 2;
    plane.position.z = r.plazaD / 2;
    wrap.add(plane);
    plazaHLGroup.add(wrap);
  }
  plazaHLGroup.visible = false;
  root.add(plazaHLGroup);
  highlights.groundling = plazaHLGroup;
  addEllipticalHighlight('noble', 10.28, 5.18, 9.12, 4.32, 1.88);
  addEllipticalHighlight('commoner', 12.18, 6.66, 10.32, 5.22, 3.08);
  addEllipticalHighlight('wall', 12.68, 7.06, 12.12, 6.60, 3.48);

  return {
    root,
    guidesGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    animatedEmbers,
    lighting: {
      hemiSky: 0xdbe9f2,
      hemiGround: 0x16242d,
      hemiIntensity: 0.96,
      sunColor: 0xffecd0,
      sunIntensity: 1.62,
      rimColor: 0x89b4cf,
      rimIntensity: 0.68,
    },
    metadata: {
      title: 'Games of the Iron Colosseum',
      venue: 'The Iron Colosseum · 4 Grand Noble Pavilions & 4 Groundling Big-Screen Plazas',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Noble Pavilion',
        lists: 'Arena Floor',
      },
      subViewsLabel: 'View fight from',
      subViewsReset: 'Full Overview',
      subViews: [
        { key: 'noble', preset: 'view-noble', label: 'Noble Pavilions (60)', detail: '4 cardinal royal velvet pavilions & armchairs' },
        { key: 'commoner', preset: 'view-commoner', label: 'Commoner’s Bench (240)', detail: 'Upper oak timber benches' },
        { key: 'groundling', preset: 'view-groundling', label: 'Groundling 4 Big Screens (600)', detail: '4 exterior viewing plazas & live screens' },
        { key: 'arena', preset: 'lists', label: 'Arena Floor', detail: 'Gladiator perspective inside the pit' },
      ],
      zones: [
        { key: 'arena', label: 'Arena Pit & Duel Marks', color: '#e3c786', preset: 'lists' },
        { key: 'noble', label: '4 Noble Pavilions · 60 Velvet Seats', color: '#7a2430', preset: 'view-noble' },
        { key: 'commoner', label: 'Commoner’s · 240 Oak Benches', color: '#876744', preset: 'view-commoner' },
        { key: 'groundling', label: '4 Groundling Big-Screen Plazas (600)', color: '#3b6782', preset: 'view-groundling' },
        { key: 'wall', label: 'Iron Curtain Wall & Braziers', color: '#677278', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 27.5, 25.5], target: [0, 0.85, 0.05] },
      isometric: { pos: [15.5, 22.8, 26.8], target: [0, 0.9, 0.05] },
      top: { pos: [0, 45.5, 0.08], target: [0, 0, 0.05] },
      royal: { pos: [0, 2.85, -4.55], target: [0, 0.45, 0.85] },
      lists: { pos: [-5.5, 1.75, 0.05], target: [2.6, 1.35, 0.05] },
      'view-noble': { pos: [0, 2.85, -4.55], target: [0, 0.45, 0.85] },
      'view-commoner': { pos: [7.8, 4.15, -4.55], target: [-0.8, 0.35, 0.4] },
      'view-groundling': { pos: [0, 2.95, 13.85], target: [0, 2.65, 7.85] },
    },
  };
}

/**
 * Builds The King's Green — The King's Mark (Archery Contest).
 * Exact 1:1 coordinate fidelity to templates/venue_art.html:
 *   - Archery lawn: M69 48 h222 v77 H69 z  (X = -11.1..+11.1, Z = -4.45..+3.25)
 *   - Three concentric targets at x = 114, 180, 246, y = 66 (r = 13, 7, 2)
 *   - Three lane sighting arrows: M{x} 87 v26 + chevron pointing +Z
 *   - Dashed shooting line: M80 119 h200 (X = -10..+10, Z = +2.65)
 *   - South spectator gallery: M74 133 h213 v22 H74 z with 12 square bays
 *   - West & East safety range screens: M55 46 v81 & M305 46 v81
 */
function buildKingsMarkVenue() {
  const root = new THREE.Group();
  const baseMat = makeMaterials();
  const mat = {
    ...baseMat,
    ground: new THREE.MeshStandardMaterial({ color: 0x26341d, roughness: 0.92, metalness: 0.04 }),
    plinthEdge: new THREE.MeshStandardMaterial({ color: 0xdfb97a, roughness: 0.34, metalness: 0.66 }),
    lawnLight: new THREE.MeshStandardMaterial({ color: 0x4b6839, roughness: 0.92, metalness: 0.02 }),
    lawnDark: new THREE.MeshStandardMaterial({ color: 0x3f5930, roughness: 0.93, metalness: 0.02 }),
    hedge: new THREE.MeshStandardMaterial({ color: 0x2c4223, roughness: 0.95, metalness: 0.02 }),
    straw: new THREE.MeshStandardMaterial({ color: 0xcab072, roughness: 0.92, metalness: 0.02 }),
    targetCream: new THREE.MeshStandardMaterial({ color: 0xeee5cf, roughness: 0.85, metalness: 0.02 }),
    targetGreen: new THREE.MeshStandardMaterial({ color: 0x395b36, roughness: 0.8, metalness: 0.04 }),
    targetRed: new THREE.MeshStandardMaterial({ color: 0x8f2e36, roughness: 0.78, metalness: 0.04 }),
    targetGold: new THREE.MeshStandardMaterial({ color: 0xebb948, roughness: 0.32, metalness: 0.65 }),
    oliveCloth: new THREE.MeshStandardMaterial({ color: 0x566b3c, roughness: 0.72, metalness: 0.06, side: THREE.DoubleSide }),
  };

  const animatedPennants = [];
  const guidesGroup = new THREE.Group();
  const zoneGroups = {
    targets: new THREE.Group(),
    lanes: new THREE.Group(),
    shootingLine: new THREE.Group(),
    stand: new THREE.Group(),
    windbreaks: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  function addPennant(parent, x, yBase, z, poleH, clothMat, rotY = 0.25) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, poleH, 8), mat.timber);
    pole.position.set(x, yBase + poleH / 2, z);
    pole.castShadow = true;
    parent.add(pole);

    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.065), mat.brassBright);
    finial.position.set(x, yBase + poleH + 0.06, z);
    parent.add(finial);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0.13);
    shape.lineTo(0.58, 0.0);
    shape.lineTo(0, -0.13);
    shape.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), clothMat.clone());
    flag.material.side = THREE.DoubleSide;
    flag.position.set(x, yBase + poleH - 0.14, z);
    flag.rotation.y = rotY;
    parent.add(flag);
    animatedPennants.push({ mesh: flag, baseY: rotY, phase: x * 0.75 + z * 0.55 });
  }

  // ── 1. ARCHITECTURAL BASE PLINTH & BLUEPRINT GUIDES ────────────────────────
  const plinthW = 34.4;
  const plinthD = 17.6;
  addBox(root, plinthW, 0.46, plinthD, mat.ground, 0, -0.23, 0, false);

  const rimH = 0.07;
  const rimT = 0.12;
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, -plinthD / 2, false);
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthD / 2, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, -plinthW / 2, -0.02, 0, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, plinthW / 2, -0.02, 0, false);

  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.085 });
  const gridPoints = [];
  for (let gx = -16; gx <= 16; gx += 1.6) {
    gridPoints.push(new THREE.Vector3(gx, 0.005, -8.2), new THREE.Vector3(gx, 0.005, 8.2));
  }
  for (let gz = -8; gz <= 8; gz += 1.6) {
    gridPoints.push(new THREE.Vector3(-16.6, 0.005, gz), new THREE.Vector3(16.6, 0.005, gz));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  // Outer Circular Ground Ring (exact SVG: cx="180" cy="92" r="77")
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(7.63, 7.75, 112), mat.guideRing);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(0, 0.016, toZ(92));
  guidesGroup.add(ringMesh);

  // Crosshairs, corner brackets, scale bar, compass North arrow
  const crossPts = [
    new THREE.Vector3(0, 0.014, toZ(9)), new THREE.Vector3(0, 0.014, toZ(176)),
    new THREE.Vector3(toX(16), 0.014, toZ(92)), new THREE.Vector3(toX(344), 0.014, toZ(92)),
  ];
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), mat.guideLine));

  const bracketPts = [
    [toX(20), toZ(30), toX(20), toZ(21)], [toX(20), toZ(21), toX(33), toZ(21)],
    [toX(327), toZ(21), toX(340), toZ(21)], [toX(340), toZ(21), toX(340), toZ(30)],
    [toX(20), toZ(155), toX(20), toZ(164)], [toX(20), toZ(164), toX(33), toZ(164)],
    [toX(327), toZ(164), toX(340), toZ(164)], [toX(340), toZ(164), toX(340), toZ(155)],
    [toX(19), toZ(171), toX(54), toZ(171)], [toX(19), toZ(168), toX(19), toZ(174)], [toX(54), toZ(168), toX(54), toZ(174)],
    [toX(324), toZ(23), toX(330), toZ(13)], [toX(330), toZ(13), toX(336), toZ(23)], [toX(330), toZ(13), toX(330), toZ(32)],
  ];
  const bVecs = [];
  for (const [x1, z1, x2, z2] of bracketPts) {
    bVecs.push(new THREE.Vector3(x1, 0.018, z1), new THREE.Vector3(x2, 0.018, z2));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bVecs), mat.guideLine));

  // ── 2. ARCHERY RANGE LAWN (M69 34 h222 v72 H69 z) ──────────────────────────
  const fieldW = 22.2;
  const fieldD = 7.2;
  const fieldX1 = toX(69);   // -11.1
  const fieldX2 = toX(291);  // +11.1
  const fieldZ1 = toZ(34);   // -5.85
  const fieldZ2 = toZ(106);  // +1.35
  const fieldMidZ = (fieldZ1 + fieldZ2) / 2; // -2.25
  const lanesGroup = zoneGroups.lanes;

  // Mowed royal garden lawn with alternating grass stripes
  const stripeCount = 12;
  const stripeW = fieldW / stripeCount;
  for (let s = 0; s < stripeCount; s++) {
    const sx = fieldX1 + (s + 0.5) * stripeW;
    addBox(lanesGroup, stripeW, 0.06, fieldD, s % 2 === 0 ? mat.lawnLight : mat.lawnDark, sx, 0.03, fieldMidZ, false);
  }

  // Carved stone lawn curb & crisp antique-brass perimeter outline
  addBox(lanesGroup, fieldW + 0.2, 0.14, 0.18, mat.stone, 0, 0.07, fieldZ1, true);
  addBox(lanesGroup, fieldW + 0.2, 0.14, 0.18, mat.stone, 0, 0.07, fieldZ2, true);
  addBox(lanesGroup, 0.18, 0.14, fieldD + 0.2, mat.stone, fieldX1, 0.07, fieldMidZ, true);
  addBox(lanesGroup, 0.18, 0.14, fieldD + 0.2, mat.stone, fieldX2, 0.07, fieldMidZ, true);

  addBox(lanesGroup, fieldW + 0.14, 0.055, 0.11, mat.brassBright, 0, 0.16, fieldZ1, false);
  addBox(lanesGroup, fieldW + 0.14, 0.055, 0.11, mat.brassBright, 0, 0.16, fieldZ2, false);
  addBox(lanesGroup, 0.11, 0.055, fieldD + 0.14, mat.brassBright, fieldX1, 0.16, fieldMidZ, false);
  addBox(lanesGroup, 0.11, 0.055, fieldD + 0.14, mat.brassBright, fieldX2, 0.16, fieldMidZ, false);

  // Low clipped royal garden hedge backstop along the North edge behind the targets
  addBox(lanesGroup, fieldW - 0.6, 0.58, 0.54, mat.hedge, 0, 0.30, fieldZ1 + 0.32, true);

  // ── 3. THREE CONCENTRIC TARGET BUTTS & SIGHTING LANES (ARROWS POINT NORTH) ─
  // Exact SVG: x = 114, 180, 246; target cy = 52 (r = 13, 7, 2); arrow y = 98 -> 72 (pointing North -Z!)
  const targetXs = [toX(114), toX(180), toX(246)]; // -6.6, 0, +6.6
  const targetZ = toZ(52);     // -4.05
  const arrowTipZ = toZ(72);   // -2.05 (pointing North toward target!)
  const arrowTailZ = toZ(98);  // +0.55 (near shooting line)
  const arrowLen = arrowTailZ - arrowTipZ; // 2.60
  const arrowMidZ = (arrowTipZ + arrowTailZ) / 2;

  for (let idx = 0; idx < targetXs.length; idx++) {
    const tx = targetXs[idx];
    const isKings = idx === 1;
    const tGroup = zoneGroups.targets;

    // Ground concentric target plinth (exact r = 1.30, 0.70, 0.20)
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.38, 0.10, 48), mat.stone);
    pad.position.set(tx, 0.06, targetZ);
    pad.receiveShadow = true;
    tGroup.add(pad);

    for (const [r, w, ringMat] of [
      [1.30, 0.08, mat.brassBright],
      [0.70, 0.075, mat.brassBright],
      [0.20, 0.06, mat.targetGold],
    ]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 48), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(tx, 0.125, targetZ);
      tGroup.add(ring);
    }

    // 3D Standing Straw Archery Target Butt on Timber A-Frame Tripod facing South (+Z) toward archers
    const buttY = isKings ? 1.48 : 1.38;
    const buttZ = targetZ - 0.18;
    const buttR = isKings ? 1.02 : 0.94;

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.25, 0.11), mat.timber);
      leg.position.set(tx + side * 0.52, 1.06, buttZ + 0.12);
      leg.rotation.z = side * 0.22;
      leg.rotation.x = -0.18;
      leg.castShadow = true;
      tGroup.add(leg);
    }
    const rearBrace = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.15, 0.10), mat.timberLight);
    rearBrace.position.set(tx, 1.02, buttZ - 0.56);
    rearBrace.rotation.x = 0.42;
    rearBrace.castShadow = true;
    tGroup.add(rearBrace);

    const boss = new THREE.Group();
    boss.position.set(tx, buttY, buttZ);
    boss.rotation.x = -0.24;

    const strawBody = new THREE.Mesh(new THREE.CylinderGeometry(buttR, buttR, 0.28, 36), mat.straw);
    strawBody.rotation.x = Math.PI / 2;
    strawBody.castShadow = true;
    strawBody.receiveShadow = true;
    boss.add(strawBody);

    const hoop = new THREE.Mesh(new THREE.TorusGeometry(buttR + 0.01, 0.035, 10, 40), mat.brass);
    boss.add(hoop);

    const rings = [
      { r: buttR * 0.94, m: mat.targetCream, z: 0.145 },
      { r: buttR * 0.72, m: mat.targetGreen, z: 0.150 },
      { r: buttR * 0.46, m: mat.targetRed, z: 0.155 },
      { r: buttR * 0.20, m: mat.targetGold, z: 0.160 },
    ];
    for (const rSpec of rings) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rSpec.r, 32), rSpec.m);
      disc.position.z = rSpec.z;
      boss.add(disc);
    }

    const arrowOffsets = isKings ? [[0.04, 0.03], [-0.14, -0.09]] : [[0.18, -0.12]];
    for (const [ax, ay] of arrowOffsets) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.65, 6), mat.timberLight);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(ax, ay, 0.42);
      boss.add(shaft);
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.14), mat.brassBright);
      fletch.position.set(ax, ay, 0.68);
      boss.add(fletch);
    }
    tGroup.add(boss);

    if (isKings) {
      addPennant(tGroup, tx - 1.38, 0.06, targetZ - 0.55, 2.55, mat.wine, 0.25);
      addPennant(tGroup, tx + 1.38, 0.06, targetZ - 0.55, 2.55, mat.wine, 0.25);
    } else {
      addPennant(tGroup, tx + (idx === 0 ? -1.32 : 1.32), 0.06, targetZ - 0.55, 2.15, mat.oliveCloth, 0.25);
    }

    // Sighting Range Arrow on the Turf pointing NORTH (-Z) from shooting line toward targets!
    addBox(lanesGroup, 0.13, 0.06, arrowLen, mat.brassBright, tx, 0.09, arrowMidZ, false);
    const wingLen = Math.hypot(0.4, 0.5);
    const wingAng = Math.atan2(0.4, 0.5);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.065, wingLen), mat.brassBright);
      wing.position.set(tx + side * 0.2, 0.092, arrowTipZ + 0.25);
      wing.rotation.y = -side * wingAng;
      lanesGroup.add(wing);
    }
  }

  // ── 4. DASHED ARCHER'S SHOOTING LINE (M76 103 h208) ────────────────────────
  const shootZ = toZ(103); // +1.05
  const shootGroup = zoneGroups.shootingLine;
  for (let dx = -10.2; dx <= 10.21; dx += 0.8) {
    addBox(shootGroup, 0.42, 0.08, 0.18, mat.brassBright, dx, 0.09, shootZ, false);
  }
  for (const tx of targetXs) {
    addBox(shootGroup, 1.35, 0.10, 0.62, mat.stone, tx, 0.08, shootZ + 0.22, true);
    const rx = tx + 0.92;
    addBox(shootGroup, 0.08, 0.72, 0.08, mat.timber, rx, 0.38, shootZ + 0.18, true);
    addBox(shootGroup, 0.08, 0.72, 0.08, mat.timber, rx + 0.36, 0.38, shootZ + 0.18, true);
    addBox(shootGroup, 0.46, 0.07, 0.10, mat.brass, rx + 0.18, 0.68, shootZ + 0.18, false);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.38, 8), mat.wine);
    quiver.position.set(rx + 0.18, 0.26, shootZ + 0.18);
    shootGroup.add(quiver);
  }

  // ── 5. CURVED SPECTATOR AMPHITHEATRE GALLERY BEHIND ARCHERS (120 SEATS) ────
  // All 12 curved bays (120 seats) sit safely BEHIND the shooting line facing North toward the targets!
  // Exact arc match to templates/venue_art.html:
  //   Center of curvature: (0, -21.85), sweep phi = -25°..+25°, R_in = 25.8, R_out = 29.0
  const standGroup = zoneGroups.stand;
  const arcCZ = toZ(-126); // -21.85
  const phiMax = (25 * Math.PI) / 180;
  const rInner = 25.8;
  const rOuter = 29.0;

  function addCurvedArcBand(parent, rIn, rOut, height, yBottom, material, segs = 48) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= segs; i++) {
      const phi = -phiMax + (i / segs) * (phiMax * 2);
      const x = rOut * Math.sin(phi);
      const z = arcCZ + rOut * Math.cos(phi);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    for (let i = segs; i >= 0; i--) {
      const phi = -phiMax + (i / segs) * (phiMax * 2);
      const x = rIn * Math.sin(phi);
      const z = arcCZ + rIn * Math.cos(phi);
      shape.lineTo(x, -z);
    }
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.y = yBottom;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Curved limestone foundation plinth & brass front/rear footprint rims
  addCurvedArcBand(standGroup, rInner, rOuter, 0.34, 0.0, mat.stone);
  addCurvedArcBand(standGroup, rInner - 0.05, rInner + 0.07, 0.06, 0.34, mat.brassBright);
  addCurvedArcBand(standGroup, rOuter - 0.07, rOuter + 0.05, 0.06, 0.34, mat.brassBright);

  // 3 Stepped Ascending Curved Timber Seating Tiers rising away from the shooting line
  addCurvedArcBand(standGroup, rInner + 0.16, rInner + 1.06, 0.50, 0.12, mat.timber);
  addCurvedArcBand(standGroup, rInner + 1.06, rInner + 2.02, 0.88, 0.12, mat.timber);
  addCurvedArcBand(standGroup, rInner + 2.02, rOuter - 0.22, 1.28, 0.12, mat.timber);

  // Curved front balustrade facing archers & targets + curved rear stone parapet wall
  addCurvedArcBand(standGroup, rInner + 0.04, rInner + 0.16, 0.44, 0.34, mat.timberLight);
  addCurvedArcBand(standGroup, rInner + 0.03, rInner + 0.18, 0.06, 0.78, mat.brassBright);
  addCurvedArcBand(standGroup, rOuter - 0.22, rOuter, 1.72, 0.0, mat.stoneDark);
  addCurvedArcBand(standGroup, rOuter - 0.24, rOuter + 0.04, 0.08, 1.72, mat.brassBright);

  // Subtle brass step-edge highlights along the two intermediate tier curves
  addCurvedArcBand(standGroup, rInner + 1.02, rInner + 1.10, 0.045, 0.63, mat.brass);
  addCurvedArcBand(standGroup, rInner + 1.98, rInner + 2.06, 0.045, 1.01, mat.brass);

  // 13 Radial Curved Bay Divider Walls (creating 12 curved bays matching the blueprint)
  const bayCount = 12;
  const baySpan = (phiMax * 2) / bayCount;
  for (let b = 0; b <= bayCount; b++) {
    const phi = -phiMax + b * baySpan;
    const rMid = (rInner + rOuter) / 2;
    const dx = rMid * Math.sin(phi);
    const dz = arcCZ + rMid * Math.cos(phi);
    const isEnd = b === 0 || b === bayCount;
    const divH = isEnd ? 1.48 : 1.18;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(isEnd ? 0.20 : 0.10, divH, rOuter - rInner), isEnd ? mat.stoneDark : mat.timberLight);
    wall.position.set(dx, divH / 2 + 0.14, dz);
    wall.rotation.y = phi;
    wall.castShadow = true;
    standGroup.add(wall);

    // Inclined brass rail capping each radial bay divider
    const capLen = Math.hypot(rOuter - rInner, 0.94);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, capLen), mat.brass);
    cap.position.set(dx, 1.26, dz);
    cap.rotation.order = 'YXZ';
    cap.rotation.y = phi;
    cap.rotation.x = -Math.atan2(0.94, rOuter - rInner);
    standGroup.add(cap);
  }

  // Place 120 EXACT Individual Radially-Oriented Seats (12 curved bays × 10 seats = 120 total!)
  // Every seat sits safely behind the archers and rotates inward to face the targets!
  const archeryCenterSeats = [];
  const archeryBenchSeats = [];
  const rowArcs = [
    { r: rInner + 0.62, y: 0.72, cnt: 3 },
    { r: rInner + 1.54, y: 1.10, cnt: 3 },
    { r: rInner + 2.48, y: 1.50, cnt: 4 },
  ];

  for (let i = 0; i < bayCount; i++) {
    const phiStart = -phiMax + i * baySpan + 0.012;
    const phiEnd = -phiMax + (i + 1) * baySpan - 0.012;
    const phiMid = (phiStart + phiEnd) / 2;
    const isCenter = i === 5 || i === 6;
    const bucket = isCenter ? archeryCenterSeats : archeryBenchSeats;

    for (const row of rowArcs) {
      for (let s = 0; s < row.cnt; s++) {
        const t = (s + 0.5) / row.cnt;
        const phi = phiStart + (phiEnd - phiStart) * t;
        const sx = row.r * Math.sin(phi);
        const sz = arcCZ + row.r * Math.cos(phi);
        // Face radially North/inward directly toward the targets!
        const rotY = Math.atan2(-sx, arcCZ - sz);
        bucket.push({ x: sx, y: row.y, z: sz, rotY });
      }
    }

    // Woodland & Sovereign pennants flying along the curved rear ridge
    if (i % 2 === 0 || isCenter) {
      const px = (rOuter - 0.14) * Math.sin(phiMid);
      const pz = arcCZ + (rOuter - 0.14) * Math.cos(phiMid);
      addPennant(standGroup, px, 0.28, pz, isCenter ? 2.55 : 2.25, isCenter ? mat.wine : mat.oliveCloth, -Math.PI * 0.78);
    }
  }
  addInstancedSeatGroup(standGroup, archeryCenterSeats, mat.oliveCloth, mat.brassBright, 1.05);
  addInstancedSeatGroup(standGroup, archeryBenchSeats, mat.benchOak, mat.timber, 1.02);

  // ── 6. WEST & EAST SAFETY RANGE SCREENS (M55 32 v76 & M305 32 v76) ─────────
  const screenZ1 = toZ(32);  // -6.05
  const screenZ2 = toZ(108); // +1.55
  const screenLen = screenZ2 - screenZ1; // 7.60
  const screenMidZ = (screenZ1 + screenZ2) / 2; // -2.25

  for (const sx of [toX(55), toX(305)]) { // -12.5 and +12.5
    const wGroup = zoneGroups.windbreaks;
    addBox(wGroup, 0.28, 0.24, screenLen + 0.2, mat.stone, sx, 0.12, screenMidZ, true);
    addBox(wGroup, 0.16, 1.22, screenLen, mat.timber, sx, 0.74, screenMidZ, true);
    addBox(wGroup, 0.20, 0.075, screenLen + 0.12, mat.brassBright, sx, 1.38, screenMidZ, false);

    for (let p = 0; p <= 6; p++) {
      const pz = screenZ1 + (screenLen / 6) * p;
      const isEnd = p === 0 || p === 6;
      addBox(wGroup, 0.24, isEnd ? 1.56 : 1.40, 0.24, mat.timberLight, sx, (isEnd ? 1.56 : 1.40) / 2, pz, true);
      if (isEnd) {
        addPennant(wGroup, sx, 1.52, pz, 1.05, mat.oliveCloth, 0.25);
      }
    }
  }

  // Interactive zone highlights
  const highlights = {};
  const addZoneHighlight = (key, w, d, x, z, y = 0.13) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.highlightMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.visible = false;
    root.add(mesh);
    highlights[key] = mesh;
  };
  addZoneHighlight('targets', 18.0, 3.4, 0, targetZ, 0.14);
  addZoneHighlight('lanes', fieldW, fieldD, 0, fieldMidZ, 0.11);
  addZoneHighlight('shootingLine', 21.4, 1.4, 0, shootZ + 0.12, 0.14);
  const standHighlight = addCurvedArcBand(root, rInner - 0.15, rOuter + 0.15, 0.04, 1.76, mat.highlightMat.clone());
  standHighlight.castShadow = false;
  standHighlight.receiveShadow = false;
  standHighlight.visible = false;
  highlights.stand = standHighlight;
  addZoneHighlight('windbreaks', 26.2, screenLen + 0.8, 0, screenMidZ, 0.12);

  return {
    root,
    guidesGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    lighting: {
      hemiSky: 0xf7f2de,
      hemiGround: 0x26351d,
      hemiIntensity: 1.0,
      sunColor: 0xfff3d1,
      sunIntensity: 1.65,
      rimColor: 0xb2cc99,
      rimIntensity: 0.58,
    },
    metadata: {
      title: 'The King’s Mark',
      venue: 'The King’s Green · Curved Gallery Behind Archers',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Behind Archers',
        lists: 'Target Butts',
      },
      zones: [
        { key: 'targets', label: 'Three Target Butts (Downrange)', color: '#ebb948', preset: 'lists' },
        { key: 'lanes', label: 'Range Lawn & Line of Fire', color: '#4b6839', preset: 'isometric' },
        { key: 'shootingLine', label: 'Archer’s Shooting Line', color: '#e3c786', preset: 'royal' },
        { key: 'stand', label: 'Curved Rear Gallery (120 Seats)', color: '#8d714f', preset: 'royal' },
        { key: 'windbreaks', label: 'East & West Safety Screens', color: '#6b533b', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 23.2, 20.8], target: [0, 0.45, 0.2] },
      isometric: { pos: [10.4, 16.5, 21.6], target: [0, 0.55, 0.3] },
      top: { pos: [0, 33.5, 0.02], target: [0, 0, 0.2] },
      royal: { pos: [0, 4.1, 8.8], target: [0, 1.1, -4.0] },
      lists: { pos: [-7.8, 3.2, -7.0], target: [1.0, 1.0, 2.5] },
    },
  };
}

/**
 * Builds The Great Hall — The Victor's Feast (Feast).
 * Exact 1:1 coordinate fidelity to templates/venue_art.html:
 *   - Outer masonry walls: M55 35 h250 v117 H55 z  (X = -12.5..+12.5, Z = -5.75..+5.95)
 *   - Inner hall walls:    M62 42 h236 v103 H62 z  (X = -11.8..+11.8, Z = -5.05..+5.25)
 *   - North stepped Royal Dais & Hearth Apse:
 *       M133 35 V24 h94 v11  (X = -4.7..+4.7, Z = -6.85..-5.75)
 *       M150 23 v-5 h60 v5   (X = -3.0..+3.0, Z = -7.45..-6.95)
 *   - South Grand Entrance Vestibule: M163 152 v11 h34 v-11 (X = -1.7..+1.7, Z = +5.95..+7.05)
 *   - Four long banquet tables at x = 89, 143, 197, 251 (w = 20, h = 66, y = 62..128)
 *   - 8 oak chairs per table at y = 68, 84, 100, 116 (x-12..x-7 and x+27..x+32)
 *   - 3 glowing brass candelabras per table at y = 76.5, 92.5, 108.5
 */
function buildVictorsFeastVenue() {
  const root = new THREE.Group();
  const baseMat = makeMaterials();
  const mat = {
    ...baseMat,
    ground: new THREE.MeshStandardMaterial({ color: 0x322417, roughness: 0.92, metalness: 0.05 }),
    plinthEdge: new THREE.MeshStandardMaterial({ color: 0xe3c27e, roughness: 0.34, metalness: 0.66 }),
    floorLight: new THREE.MeshStandardMaterial({ color: 0xb8aa90, roughness: 0.86, metalness: 0.04 }),
    floorDark: new THREE.MeshStandardMaterial({ color: 0x8f806a, roughness: 0.88, metalness: 0.04 }),
    stoneWall: new THREE.MeshStandardMaterial({ color: 0xa69b88, roughness: 0.86, metalness: 0.05 }),
    stoneTrim: new THREE.MeshStandardMaterial({ color: 0x7b705f, roughness: 0.88, metalness: 0.06 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x4b3421, roughness: 0.72, metalness: 0.08 }),
    oakChair: new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.75, metalness: 0.06 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xefe5ce, roughness: 0.82, metalness: 0.02 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xf9f0d8, roughness: 0.65, metalness: 0.02 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x7d2d34, roughness: 0.82, metalness: 0.04 }),
    tapestry: new THREE.MeshStandardMaterial({ color: 0x6b2830, roughness: 0.78, metalness: 0.06, side: THREE.DoubleSide }),
    candleFlame: new THREE.MeshStandardMaterial({ color: 0xffcf66, emissive: 0xff8c1a, emissiveIntensity: 1.8, roughness: 0.25 }),
  };

  const animatedPennants = [];
  const animatedEmbers = [];
  const guidesGroup = new THREE.Group();
  const zoneGroups = {
    tables: new THREE.Group(),
    chairs: new THREE.Group(),
    candelabras: new THREE.Group(),
    dais: new THREE.Group(),
    hall: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  function addFlame(parent, x, y, z, scale = 1) {
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.068 * scale), mat.candleFlame.clone());
    flame.position.set(x, y, z);
    flame.scale.set(0.75, 1.5, 0.75);
    parent.add(flame);
    animatedEmbers.push({ mesh: flame, baseY: y, phase: x * 1.3 + z * 1.1 });
  }

  // ── 1. ARCHITECTURAL BASE PLINTH & BLUEPRINT GUIDES ────────────────────────
  const plinthW = 34.4;
  const plinthD = 17.6;
  addBox(root, plinthW, 0.46, plinthD, mat.ground, 0, -0.23, 0, false);

  const rimH = 0.07;
  const rimT = 0.12;
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, -plinthD / 2, false);
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthD / 2, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, -plinthW / 2, -0.02, 0, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, plinthW / 2, -0.02, 0, false);

  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.085 });
  const gridPoints = [];
  for (let gx = -16; gx <= 16; gx += 1.6) {
    gridPoints.push(new THREE.Vector3(gx, 0.005, -8.2), new THREE.Vector3(gx, 0.005, 8.2));
  }
  for (let gz = -8; gz <= 8; gz += 1.6) {
    gridPoints.push(new THREE.Vector3(-16.6, 0.005, gz), new THREE.Vector3(16.6, 0.005, gz));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  // Outer Circular Ground Ring (exact SVG: cx="180" cy="92" r="77")
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(7.63, 7.75, 112), mat.guideRing);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(0, 0.016, toZ(92));
  guidesGroup.add(ringMesh);

  // Crosshairs, corner brackets, bottom-left scale bar, top-right compass North arrow
  const crossPts = [
    new THREE.Vector3(0, 0.014, toZ(9)), new THREE.Vector3(0, 0.014, toZ(176)),
    new THREE.Vector3(toX(16), 0.014, toZ(92)), new THREE.Vector3(toX(344), 0.014, toZ(92)),
  ];
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), mat.guideLine));

  const bracketPts = [
    [toX(20), toZ(30), toX(20), toZ(21)], [toX(20), toZ(21), toX(33), toZ(21)],
    [toX(327), toZ(21), toX(340), toZ(21)], [toX(340), toZ(21), toX(340), toZ(30)],
    [toX(20), toZ(155), toX(20), toZ(164)], [toX(20), toZ(164), toX(33), toZ(164)],
    [toX(327), toZ(164), toX(340), toZ(164)], [toX(340), toZ(164), toX(340), toZ(155)],
    [toX(19), toZ(171), toX(54), toZ(171)], [toX(19), toZ(168), toX(19), toZ(174)], [toX(54), toZ(168), toX(54), toZ(174)],
    [toX(324), toZ(23), toX(330), toZ(13)], [toX(330), toZ(13), toX(336), toZ(23)], [toX(330), toZ(13), toX(330), toZ(32)],
  ];
  const bVecs = [];
  for (const [x1, z1, x2, z2] of bracketPts) {
    bVecs.push(new THREE.Vector3(x1, 0.018, z1), new THREE.Vector3(x2, 0.018, z2));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bVecs), mat.guideLine));

  // ── 2. GREAT HALL DOUBLE MASONRY WALLS & FLAGSTONE FLOOR ───────────────────
  // Outer: X = -12.5..+12.5 (w=25.0), Z = -5.75..+5.95 (d=11.70, center=+0.10)
  // Inner: X = -11.8..+11.8 (w=23.6), Z = -5.05..+5.25 (d=10.30, center=+0.10)
  const hallGroup = zoneGroups.hall;
  const outX1 = toX(55), outX2 = toX(305);   // -12.5, +12.5
  const outZ1 = toZ(35), outZ2 = toZ(152);   // -5.75, +5.95
  const inX1 = toX(62), inX2 = toX(298);     // -11.8, +11.8
  const inZ1 = toZ(42), inZ2 = toZ(145);     // -5.05, +5.25
  const hallMidZ = (outZ1 + outZ2) / 2;      // +0.10
  const wallT = 0.70;
  const wallH = 1.95;

  // Checkered limestone & slate banquet hall floor
  addBox(hallGroup, 24.4, 0.10, 11.1, mat.floorDark, 0, 0.05, hallMidZ, false);
  const tileCols = 12;
  const tileRows = 6;
  const tileW = 23.6 / tileCols;
  const tileD = 10.3 / tileRows;
  for (let r = 0; r < tileRows; r++) {
    for (let c = 0; c < tileCols; c++) {
      if ((r + c) % 2 === 0) {
        addBox(hallGroup, tileW - 0.04, 0.02, tileD - 0.04, mat.floorLight, inX1 + (c + 0.5) * tileW, 0.11, inZ1 + (r + 0.5) * tileD, false);
      }
    }
  }

  // Ceremonial crimson carpet runner down the central aisle & across the North head aisle
  addBox(hallGroup, 1.85, 0.025, 11.6, mat.carpet, 0, 0.125, hallMidZ + 0.25, false);
  addBox(hallGroup, 0.07, 0.028, 11.6, mat.brass, -0.88, 0.126, hallMidZ + 0.25, false);
  addBox(hallGroup, 0.07, 0.028, 11.6, mat.brass, 0.88, 0.126, hallMidZ + 0.25, false);
  addBox(hallGroup, 21.8, 0.025, 1.35, mat.carpet, 0, 0.125, -4.12, false);

  // Thick Castle Masonry Walls (cutaway height for clear 3D inspection)
  // West & East Side Walls
  addBox(hallGroup, wallT, wallH, 11.70, mat.stoneWall, outX1 + wallT / 2, wallH / 2, hallMidZ, true);
  addBox(hallGroup, wallT, wallH, 11.70, mat.stoneWall, outX2 - wallT / 2, wallH / 2, hallMidZ, true);

  // North Wall (split around the North Royal Dais alcove X = -4.7..+4.7)
  const northSideW = 12.5 - 4.7; // 7.8
  addBox(hallGroup, northSideW, wallH + 0.25, wallT, mat.stoneWall, -12.5 + northSideW / 2, (wallH + 0.25) / 2, outZ1 + wallT / 2, true);
  addBox(hallGroup, northSideW, wallH + 0.25, wallT, mat.stoneWall, 12.5 - northSideW / 2, (wallH + 0.25) / 2, outZ1 + wallT / 2, true);

  // South Wall (split around the South Grand Portal X = -1.7..+1.7)
  const southSideW = 12.5 - 1.7; // 10.8
  const southWallH = 1.55;
  addBox(hallGroup, southSideW, southWallH, wallT, mat.stoneWall, -12.5 + southSideW / 2, southWallH / 2, outZ2 - wallT / 2, true);
  addBox(hallGroup, southSideW, southWallH, wallT, mat.stoneWall, 12.5 - southSideW / 2, southWallH / 2, outZ2 - wallT / 2, true);

  // Crisp double-rectangle antique-brass wall crown trim (matches BOTH nested SVG rectangles 1:1!)
  const trimY = wallH + 0.04;
  const southTrimY = southWallH + 0.04;
  // Outer wall perimeter rim (M55 35 h250 v117 H55 z)
  addBox(hallGroup, 25.08, 0.06, 0.10, mat.brassBright, 0, trimY + 0.24, outZ1, false);
  addBox(hallGroup, 25.08, 0.06, 0.10, mat.brassBright, 0, southTrimY, outZ2, false);
  addBox(hallGroup, 0.10, 0.06, 11.78, mat.brassBright, outX1, trimY, hallMidZ, false);
  addBox(hallGroup, 0.10, 0.06, 11.78, mat.brassBright, outX2, trimY, hallMidZ, false);
  // Inner wall perimeter rim (M62 42 h236 v103 H62 z)
  addBox(hallGroup, 23.68, 0.06, 0.10, mat.brass, 0, trimY + 0.24, inZ1, false);
  addBox(hallGroup, 23.68, 0.06, 0.10, mat.brass, 0, southTrimY, inZ2, false);
  addBox(hallGroup, 0.10, 0.06, 10.38, mat.brass, inX1, trimY, hallMidZ, false);
  addBox(hallGroup, 0.10, 0.06, 10.38, mat.brass, inX2, trimY, hallMidZ, false);

  // Interior stone buttress piers, wall tapestries, and flickering wall sconces along West & East walls
  for (const side of [-1, 1]) {
    const wx = side < 0 ? inX1 + 0.08 : inX2 - 0.08;
    for (const pz of [-3.2, 0.1, 3.4]) {
      addBox(hallGroup, 0.34, wallH + 0.18, 0.38, mat.stoneTrim, wx, (wallH + 0.18) / 2, pz, true);
      addBox(hallGroup, 0.38, 0.07, 0.42, mat.brass, wx, wallH + 0.20, pz, false);
      // Wall torch sconce
      addBox(hallGroup, 0.22, 0.08, 0.08, mat.brass, wx - side * 0.20, 1.48, pz, false);
      addFlame(hallGroup, wx - side * 0.28, 1.62, pz, 0.95);
    }
    // Crimson & gold medieval hall tapestries hanging between piers
    for (const tz of [-1.55, 1.75]) {
      addBox(hallGroup, 0.06, 1.25, 1.45, mat.tapestry, wx - side * 0.05, 1.12, tz, false);
      addBox(hallGroup, 0.08, 0.07, 1.56, mat.brass, wx - side * 0.06, 1.76, tz, false);
    }
  }

  // ── 3. NORTH STEPPED ROYAL DAIS & HEARTH APSE ──────────────────────────────
  // Exact SVG:
  //   Main alcove: M133 35 V24 h94 v11 => X = -4.70..+4.70 (w=9.40), Z = -6.85..-5.75 (d=1.10)
  //   Rear apse:   M150 23 v-5 h60 v5  => X = -3.00..+3.00 (w=6.00), Z = -7.45..-6.95 (d=0.50)
  const daisGroup = zoneGroups.dais;

  // Raised stone & crimson Royal Dais platform filling the alcove + projecting gently to inner wall
  addBox(daisGroup, 9.40, 0.44, 1.80, mat.stoneWall, 0, 0.22, -5.95, true);
  addBox(daisGroup, 8.80, 0.05, 1.45, mat.carpet, 0, 0.46, -5.85, false);

  // Alcove masonry walls & brass crown trim (exact 9.40 x 1.10 footprint)
  const daisWallH = 2.45;
  addBox(daisGroup, 0.42, daisWallH, 1.20, mat.stoneWall, -4.55, daisWallH / 2, -6.30, true);
  addBox(daisGroup, 0.42, daisWallH, 1.20, mat.stoneWall, 4.55, daisWallH / 2, -6.30, true);
  addBox(daisGroup, 9.40, daisWallH, 0.36, mat.stoneWall, 0, daisWallH / 2, -6.75, true);
  addBox(daisGroup, 9.48, 0.07, 0.11, mat.brassBright, 0, daisWallH + 0.04, -6.85, false);
  addBox(daisGroup, 0.11, 0.07, 1.18, mat.brassBright, -4.70, daisWallH + 0.04, -6.30, false);
  addBox(daisGroup, 0.11, 0.07, 1.18, mat.brassBright, 4.70, daisWallH + 0.04, -6.30, false);

  // Rear Stepped Throne / Great Hearth Apse (exact 6.00 x 0.50 footprint at Z = -7.45..-6.95)
  const apseH = 2.95;
  addBox(daisGroup, 6.00, apseH, 0.56, mat.stoneTrim, 0, apseH / 2, -7.20, true);
  addBox(daisGroup, 6.08, 0.08, 0.62, mat.brassBright, 0, apseH + 0.04, -7.20, false);
  // Twin hearth chimney finials & glowing royal hearth fireplace
  for (const fx of [-2.75, 2.75]) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 4), mat.brassBright);
    cap.position.set(fx, apseH + 0.24, -7.20);
    cap.rotation.y = Math.PI / 4;
    daisGroup.add(cap);
  }
  // Glowing hearth embers recessed in the center of the North dais back wall
  addBox(daisGroup, 2.2, 0.85, 0.25, mat.walnut, 0, 0.88, -6.58, false);
  for (const hx of [-0.55, 0.0, 0.55]) {
    addFlame(daisGroup, hx, 0.72, -6.44, 1.45);
  }

  // Sovereign's High Head Table on the Dais
  addBox(daisGroup, 5.8, 0.66, 0.88, mat.walnut, 0, 0.78, -5.62, true);
  addBox(daisGroup, 5.88, 0.08, 0.94, mat.linen, 0, 1.12, -5.62, true);
  addBox(daisGroup, 5.88, 0.09, 0.26, mat.carpet, 0, 1.13, -5.62, false);
  for (const cx of [-2.1, 0, 2.1]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.32, 8), mat.brassBright);
    stem.position.set(cx, 1.32, -5.62);
    daisGroup.add(stem);
    addFlame(daisGroup, cx, 1.54, -5.62, 0.95);
  }

  // ── 4. SOUTH GRAND ENTRANCE VESTIBULE (M163 152 v11 h34 v-11) ──────────────
  // Exact footprint: X = -1.70..+1.70 (w=3.40), Z = +5.95..+7.05 (d=1.10)
  addBox(hallGroup, 3.40, 0.16, 1.20, mat.stoneWall, 0, 0.08, 6.50, true);
  addBox(hallGroup, 1.85, 0.04, 1.25, mat.carpet, 0, 0.17, 6.50, false);
  for (const gx of [-1.52, 1.52]) {
    addBox(hallGroup, 0.36, 1.82, 1.12, mat.stoneTrim, gx, 0.91, 6.50, true);
    addBox(hallGroup, 0.42, 0.08, 1.18, mat.brassBright, gx, 1.86, 6.50, false);
    addFlame(hallGroup, gx, 2.02, 6.95, 1.05);
  }
  // Open arched double oak entry doors folded inward & brass vestibule outline
  addBox(hallGroup, 3.48, 0.06, 0.10, mat.brassBright, 0, 0.20, 7.05, false);
  addBox(hallGroup, 0.12, 1.48, 0.72, mat.walnut, -1.24, 0.86, 5.55, true);
  addBox(hallGroup, 0.12, 1.48, 0.72, mat.walnut, 1.24, 0.86, 5.55, true);

  // ── 5. EIGHT BANQUET TABLES (TABLES 1–8) · 64 EXACT SEATS & 16 CANDELABRAS ─
  // Matches the exact Victor's Feast venue booking map (8 tables × 8 seats = 64 seats total)
  // arranged on the 4 Great Hall blueprint table columns (x = 89, 143, 197, 251) in 2 rows:
  //   North row: Table 1, Table 2, Table 3, Table 4  (Z = -2.00)
  //   South row: Table 5, Table 6, Table 7, Table 8  (Z = +2.40)
  const tableXs = [89, 143, 197, 251];
  const tableRowsZ = [-2.00, 2.40];
  const tableW = 2.0;
  const tableL = 3.30;
  const chairZOffsets = [-1.17, -0.39, 0.39, 1.17]; // 4 chairs per side × 2 sides = 8 seats/table
  const candleZOffsets = [-0.82, 0.82];             // 2 brass candelabras per table = 16 total

  const tableViews = [];
  const tablePresets = {};
  const tableCoords = [];

  let tableNum = 0;
  for (const rowZ of tableRowsZ) {
    for (const svgTx of tableXs) {
      tableNum++;
      const tx = toX(svgTx + 10); // -8.1, -2.7, +2.7, +8.1
      const tKey = `table-${tableNum}`;
      tableCoords.push({ key: tKey, tx, rowZ });
      tableViews.push({ key: tKey, label: `Table ${tableNum}`, seats: '8 seats' });
      // Angle cleanly from the interior aisle side so hall walls never obstruct the table view
      const camOffsetX = tx < 0 ? 3.2 : -3.2;
      tablePresets[tKey] = {
        pos: [tx + camOffsetX, 4.15, rowZ + 3.95],
        target: [tx, 0.85, rowZ],
      };

      // Heavy trestle walnut banquet table
      addBox(zoneGroups.tables, tableW - 0.18, 0.12, tableL - 0.18, mat.walnut, tx, 0.72, rowZ, true);
      for (const legOff of [-1.15, 1.15]) {
        addBox(zoneGroups.tables, 1.45, 0.66, 0.15, mat.walnut, tx, 0.38, rowZ + legOff, true);
      }
      addBox(zoneGroups.tables, 0.14, 0.11, 2.45, mat.walnut, tx, 0.28, rowZ, false);

      // Draped cream banquet linen tablecloth + burgundy center runner + crisp brass outline
      addBox(zoneGroups.tables, tableW, 0.10, tableL, mat.linen, tx, 0.81, rowZ, true);
      addBox(zoneGroups.tables, 0.54, 0.115, tableL - 0.12, mat.carpet, tx, 0.815, rowZ, false);
      addBox(zoneGroups.tables, tableW + 0.05, 0.04, 0.08, mat.brassBright, tx, 0.87, rowZ - tableL / 2, false);
      addBox(zoneGroups.tables, tableW + 0.05, 0.04, 0.08, mat.brassBright, tx, 0.87, rowZ + tableL / 2, false);
      addBox(zoneGroups.tables, 0.08, 0.04, tableL + 0.05, mat.brassBright, tx - tableW / 2, 0.87, rowZ, false);
      addBox(zoneGroups.tables, 0.08, 0.04, tableL + 0.05, mat.brassBright, tx + tableW / 2, 0.87, rowZ, false);

      // Crisp tabletop brass & walnut plaque ("TABLE 1" .. "TABLE 8") matching the booking map
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.38), makeTablePlaque(`TABLE ${tableNum}`));
      plaque.rotation.x = -Math.PI / 2;
      plaque.position.set(tx, 0.885, rowZ);
      zoneGroups.tables.add(plaque);

      // 8 Carved Oak Banquet Chairs per Table (4 Left, 4 Right => 8 × 8 = 64 seats total!)
      for (const zOff of chairZOffsets) {
        const cz = rowZ + zOff;
        for (const side of [-1, 1]) {
          const cxChair = tx + side * 1.46;
          const backX = cxChair + side * 0.22;

          // Seat frame & crimson velvet cushion
          addBox(zoneGroups.chairs, 0.48, 0.42, 0.50, mat.oakChair, cxChair, 0.30, cz, true);
          addBox(zoneGroups.chairs, 0.40, 0.08, 0.42, mat.carpet, cxChair - side * 0.03, 0.54, cz, false);
          // High carved oak chair backrest + brass top bar
          addBox(zoneGroups.chairs, 0.10, 0.90, 0.52, mat.walnut, backX, 0.55, cz, true);
          addBox(zoneGroups.chairs, 0.12, 0.055, 0.56, mat.brassBright, backX, 1.02, cz, false);

          // Place setting: brass trencher plate & goblet directly in front of each of the 64 seats
          const plateX = tx + side * 0.64;
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.03, 14), mat.brass);
          plate.position.set(plateX, 0.88, cz);
          zoneGroups.chairs.add(plate);

          const goblet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.13, 8), mat.brassBright);
          goblet.position.set(plateX - side * 0.16, 0.935, cz + 0.13);
          zoneGroups.chairs.add(goblet);
        }
      }

      // 2 Sculpted 3-Branch Brass Candelabras per table (16 total across the 8 tables)
      for (const kOff of candleZOffsets) {
        const kz = rowZ + kOff;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 0.08, 12), mat.brassBright);
        base.position.set(tx, 0.90, kz);
        zoneGroups.candelabras.add(base);

        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.32, 8), mat.brassBright);
        stem.position.set(tx, 1.07, kz);
        stem.castShadow = true;
        zoneGroups.candelabras.add(stem);

        addBox(zoneGroups.candelabras, 0.05, 0.045, 0.34, mat.brassBright, tx, 1.22, kz, false);
        for (const dz of [-0.14, 0, 0.14]) {
          const taperH = dz === 0 ? 0.22 : 0.16;
          const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, taperH, 8), mat.wax);
          taper.position.set(tx, 1.24 + taperH / 2, kz + dz);
          zoneGroups.candelabras.add(taper);
          addFlame(zoneGroups.candelabras, tx, 1.27 + taperH + 0.04, kz + dz, dz === 0 ? 0.88 : 0.68);
        }
      }
    }
  }

  // Interactive zone highlights
  const highlights = {};
  const addZoneHighlight = (key, w, d, x, z, y = 0.14) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.highlightMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.visible = false;
    root.add(mesh);
    highlights[key] = mesh;
  };
  addZoneHighlight('tables', 19.6, 8.2, 0, 0.20, 0.16);
  addZoneHighlight('chairs', 21.8, 8.4, 0, 0.20, 0.15);
  addZoneHighlight('candelabras', 18.8, 7.0, 0, 0.20, 0.92);
  addZoneHighlight('dais', 10.2, 2.8, 0, -6.2, 0.52);
  addZoneHighlight('hall', 25.6, 13.4, 0, 0.35, 0.13);
  for (const tc of tableCoords) {
    addZoneHighlight(tc.key, 4.15, 3.85, tc.tx, tc.rowZ, 0.17);
  }

  // ── 7. TOGGLEABLE MEDIEVAL GREAT HALL ROOF (ORANGE/AMBER TERRACOTTA) ───────
  // Attached as a dedicated Group so it renders on the 3D Campaign Map and can be
  // toggled on/off cleanly inside the interactive 3D architectural model viewer.
  const roofGroup = new THREE.Group();
  const roofMat = {
    tile: new THREE.MeshStandardMaterial({ color: 0xa64d22, roughness: 0.72, metalness: 0.08 }),
    tileBand: new THREE.MeshStandardMaterial({ color: 0x873b17, roughness: 0.76, metalness: 0.07 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x3f2a1a, roughness: 0.78, metalness: 0.06 }),
    lanternGlass: new THREE.MeshStandardMaterial({ color: 0xffd27d, emissive: 0xff9a2e, emissiveIntensity: 0.95, roughness: 0.25 }),
    pennant: new THREE.MeshStandardMaterial({ color: 0xd97d1e, roughness: 0.65, metalness: 0.06, side: THREE.DoubleSide }),
  };

  const eaveY = 2.20;
  const ridgeRise = 3.55;
  const ridgeY = eaveY + ridgeRise; // 5.75
  const halfSpanZ = 6.58;           // overhangs outer walls (-5.75..+5.95) cleanly on both sides
  const slopeLen = Math.hypot(halfSpanZ, ridgeRise);
  const slopeAngle = Math.atan2(ridgeRise, halfSpanZ);
  const roofLenX = 26.35;           // overhangs West/East walls (-12.5..+12.5) by ~0.68

  // Upper wall extensions (only shown when Roof is ON so cutaway mode stays low & open)
  const southUpperH = eaveY - southWallH; // 0.65
  addBox(roofGroup, southSideW, southUpperH, wallT, mat.stoneWall, -12.5 + southSideW / 2, southWallH + southUpperH / 2, outZ2 - wallT / 2, true);
  addBox(roofGroup, southSideW, southUpperH, wallT, mat.stoneWall, 12.5 - southSideW / 2, southWallH + southUpperH / 2, outZ2 - wallT / 2, true);
  // Stone lintel header above the South Grand Portal (keeps the double doorway open below)
  addBox(roofGroup, 3.60, 0.56, wallT, mat.stoneTrim, 0, eaveY - 0.28, outZ2 - wallT / 2, true);
  // Raise West & East side walls cleanly up to the eave line
  const sideUpperH = eaveY - wallH; // 0.25
  addBox(roofGroup, wallT, sideUpperH, 11.70, mat.stoneWall, outX1 + wallT / 2, wallH + sideUpperH / 2, hallMidZ, true);
  addBox(roofGroup, wallT, sideUpperH, 11.70, mat.stoneWall, outX2 - wallT / 2, wallH + sideUpperH / 2, hallMidZ, true);

  // Triangular Castle Stone Gable End Walls at West (-12.15) & East (+12.15)
  const gableHalfZ = 5.85;
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-gableHalfZ, 0);
  gableShape.lineTo(gableHalfZ, 0);
  gableShape.lineTo(0, ridgeRise - 0.08);
  gableShape.closePath();
  const gableGeom = new THREE.ExtrudeGeometry(gableShape, { depth: 0.68, bevelEnabled: false });
  gableGeom.center(); // centered along local X (width), Y (height), Z (depth)
  const gableCenterY = eaveY + (ridgeRise - 0.08) / 2;
  for (const gx of [-12.15, 12.15]) {
    const gableMesh = new THREE.Mesh(gableGeom, mat.stoneWall);
    gableMesh.rotation.y = Math.PI / 2;
    gableMesh.position.set(gx, gableCenterY, hallMidZ);
    gableMesh.castShadow = true;
    gableMesh.receiveShadow = true;
    roofGroup.add(gableMesh);

    // Gilded circular rose-window medallion & timber cross-framing on each gable end
    const outerSign = gx < 0 ? -1 : 1;
    const faceX = gx + outerSign * 0.36;
    const roseRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.09, 10, 20), mat.brassBright);
    roseRing.rotation.y = Math.PI / 2;
    roseRing.position.set(faceX, eaveY + 1.42, hallMidZ);
    roofGroup.add(roseRing);
    const roseGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18), roofMat.lanternGlass);
    roseGlass.rotation.z = Math.PI / 2;
    roseGlass.position.set(faceX - outerSign * 0.02, eaveY + 1.42, hallMidZ);
    roofGroup.add(roseGlass);
    addBox(roofGroup, 0.10, 0.14, 11.4, roofMat.timber, faceX, eaveY + 0.06, hallMidZ, false);
  }

  // Main Pitched Terracotta & Amber-Slate Roof Slopes (North & South)
  const slopeGeom = new THREE.BoxGeometry(roofLenX, 0.24, slopeLen);
  const ribGeom = new THREE.BoxGeometry(roofLenX + 0.08, 0.08, 0.26);
  const bargeGeom = new THREE.BoxGeometry(0.28, 0.34, slopeLen + 0.16);
  for (const side of [-1, 1]) {
    const slopePivot = new THREE.Group();
    slopePivot.position.set(0, eaveY + ridgeRise * 0.5, hallMidZ + side * halfSpanZ * 0.5);
    slopePivot.rotation.x = side * slopeAngle;

    const slab = new THREE.Mesh(slopeGeom, roofMat.tile);
    slab.castShadow = true;
    slab.receiveShadow = true;
    slopePivot.add(slab);

    // Alternating tile rib bands across the pitched roof for crisp medieval texture
    for (let r = -3; r <= 3; r += 1) {
      if (r === 0) continue;
      const rib = new THREE.Mesh(ribGeom, roofMat.tileBand);
      rib.position.set(0, 0.13, r * 0.92);
      slopePivot.add(rib);
    }
    // Dark walnut bargeboards framing both gable eaves
    for (const bx of [-roofLenX / 2 + 0.12, roofLenX / 2 - 0.12]) {
      const barge = new THREE.Mesh(bargeGeom, roofMat.timber);
      barge.position.set(bx, 0.02, 0);
      slopePivot.add(barge);
    }
    roofGroup.add(slopePivot);

    // Timber eave fascia beam & decorative exposed rafter corbels along the North & South eaves
    const eaveZ = hallMidZ + side * (halfSpanZ - 0.18);
    addBox(roofGroup, roofLenX, 0.22, 0.22, roofMat.timber, 0, eaveY - 0.05, eaveZ, false);
    for (let rx = -12.0; rx <= 12.0; rx += 2.4) {
      addBox(roofGroup, 0.16, 0.16, 0.52, roofMat.timber, rx, eaveY - 0.10, eaveZ - side * 0.16, false);
    }
  }

  // Ornate Antique-Brass Ridge Cresting Beam & Gable Peak Finials
  addBox(roofGroup, roofLenX + 0.24, 0.24, 0.28, roofMat.timber, 0, ridgeY + 0.04, hallMidZ, true);
  addBox(roofGroup, roofLenX + 0.10, 0.14, 0.14, mat.brassBright, 0, ridgeY + 0.20, hallMidZ, false);
  for (const fx of [-12.85, 12.85]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 0.95, 8), mat.brassBright);
    post.position.set(fx, ridgeY + 0.55, hallMidZ);
    roofGroup.add(post);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), mat.brassBright);
    orb.position.set(fx, ridgeY + 1.08, hallMidZ);
    roofGroup.add(orb);
  }

  // Central Octagonal Medieval Roof Lantern / Cupola with Warm Clerestory Glow & Orange Pennant
  const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.32, 0.52, 8), roofMat.timber);
  lanternBase.position.set(0, ridgeY + 0.18, hallMidZ);
  lanternBase.castShadow = true;
  roofGroup.add(lanternBase);
  const lanternCore = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.92, 8), roofMat.lanternGlass);
  lanternCore.position.set(0, ridgeY + 0.88, hallMidZ);
  roofGroup.add(lanternCore);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.98, 0.11), roofMat.timber);
    mullion.position.set(Math.cos(a) * 0.95, ridgeY + 0.88, hallMidZ + Math.sin(a) * 0.95);
    roofGroup.add(mullion);
  }
  const lanternRoof = new THREE.Mesh(new THREE.ConeGeometry(1.36, 1.35, 8), roofMat.tileBand);
  lanternRoof.position.set(0, ridgeY + 1.98, hallMidZ);
  lanternRoof.castShadow = true;
  roofGroup.add(lanternRoof);
  const lanternSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.35, 8), mat.brassBright);
  lanternSpire.position.set(0, ridgeY + 3.15, hallMidZ);
  roofGroup.add(lanternSpire);
  const roofPennant = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36), roofMat.pennant);
  roofPennant.position.set(0.58, ridgeY + 3.55, hallMidZ);
  roofGroup.add(roofPennant);
  animatedPennants.push({ mesh: roofPennant, baseY: ridgeY + 3.55, phase: 0.7 });

  // North Royal Dais Cross-Gable Dormer Roof & Tall Stone Hearth Chimney Stack
  const daisRoofY = 2.48;
  const daisRise = 1.65;
  const daisHalfX = 4.95;
  const daisSlopeLen = Math.hypot(daisHalfX, daisRise);
  const daisAngle = Math.atan2(daisRise, daisHalfX);
  const daisDepthZ = 3.90;
  for (const side of [-1, 1]) {
    const dSlab = new THREE.Mesh(new THREE.BoxGeometry(daisSlopeLen, 0.20, daisDepthZ), roofMat.tile);
    dSlab.position.set(side * daisHalfX * 0.5, daisRoofY + daisRise * 0.5, -5.20);
    dSlab.rotation.z = -side * daisAngle;
    dSlab.castShadow = true;
    roofGroup.add(dSlab);
  }
  // North Dais front triangular gable fill & brass ridge
  const daisGableShape = new THREE.Shape();
  daisGableShape.moveTo(-4.72, 0);
  daisGableShape.lineTo(4.72, 0);
  daisGableShape.lineTo(0, daisRise - 0.05);
  daisGableShape.closePath();
  const daisGableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(daisGableShape, { depth: 0.36, bevelEnabled: false }), mat.stoneWall);
  daisGableMesh.position.set(0, daisRoofY, -6.95);
  roofGroup.add(daisGableMesh);
  addBox(roofGroup, 0.18, 0.18, daisDepthZ + 0.15, mat.brassBright, 0, daisRoofY + daisRise + 0.04, -5.20, false);

  // Tall Castle Stone Chimney rising from the Rear Hearth Apse (Z = -7.20)
  addBox(roofGroup, 2.35, 3.65, 1.05, mat.stoneTrim, 0, apseH + 1.80, -7.12, true);
  addBox(roofGroup, 2.65, 0.24, 1.32, mat.stoneWall, 0, apseH + 3.66, -7.12, true);
  addBox(roofGroup, 2.72, 0.08, 1.38, mat.brassBright, 0, apseH + 3.82, -7.12, false);
  for (const cx of [-0.65, 0.65]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.25, 0.58, 8), mat.stoneTrim);
    pot.position.set(cx, apseH + 4.10, -7.12);
    roofGroup.add(pot);
  }

  // South Grand Entrance Porch Canopy (over the Vestibule X = -1.7..+1.7, Z = +5.95..+7.05)
  const porchY = 1.94;
  const porchRise = 0.96;
  const porchHalfX = 2.08;
  const porchSlopeLen = Math.hypot(porchHalfX, porchRise);
  const porchAngle = Math.atan2(porchRise, porchHalfX);
  const porchDepthZ = 1.85;
  for (const side of [-1, 1]) {
    const pSlab = new THREE.Mesh(new THREE.BoxGeometry(porchSlopeLen, 0.16, porchDepthZ), roofMat.tileBand);
    pSlab.position.set(side * porchHalfX * 0.5, porchY + porchRise * 0.5, 6.45);
    pSlab.rotation.z = -side * porchAngle;
    pSlab.castShadow = true;
    roofGroup.add(pSlab);
  }
  const porchGableShape = new THREE.Shape();
  porchGableShape.moveTo(-1.72, 0);
  porchGableShape.lineTo(1.72, 0);
  porchGableShape.lineTo(0, porchRise - 0.04);
  porchGableShape.closePath();
  const porchGableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(porchGableShape, { depth: 0.24, bevelEnabled: false }), roofMat.timber);
  porchGableMesh.position.set(0, porchY, 7.06);
  roofGroup.add(porchGableMesh);
  addBox(roofGroup, 0.14, 0.14, porchDepthZ + 0.12, mat.brassBright, 0, porchY + porchRise + 0.04, 6.45, false);
  const porchFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), mat.brassBright);
  porchFinial.position.set(0, porchY + porchRise + 0.26, 7.34);
  roofGroup.add(porchFinial);

  roofGroup.visible = true;
  root.add(roofGroup);

  return {
    root,
    guidesGroup,
    roofGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    animatedEmbers,
    lighting: {
      hemiSky: 0xffe9c2,
      hemiGround: 0x2c1e12,
      hemiIntensity: 0.96,
      sunColor: 0xffd79e,
      sunIntensity: 1.65,
      rimColor: 0xd19f62,
      rimIntensity: 0.58,
    },
    metadata: {
      title: 'The Victor’s Feast',
      venue: 'The Great Hall · 8 Tables · 64 Feast Seats',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Royal High Dais',
        lists: 'Banquet Floor',
      },
      tableViews,
      zones: [
        { key: 'tables', label: '8 Banquet Tables (Tables 1–8)', color: '#efe5ce', preset: 'isometric' },
        { key: 'chairs', label: '64 Feast Seats & Goblets', color: '#7d2d34', preset: 'lists' },
        { key: 'candelabras', label: '16 Brass Candelabras', color: '#ffcf66', preset: 'lists' },
        { key: 'dais', label: 'North Royal Dais & Hearth', color: '#e3c27e', preset: 'royal' },
        { key: 'hall', label: 'Great Hall & South Portal', color: '#a69b88', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 23.2, 20.8], target: [0, 0.55, 0.1] },
      isometric: { pos: [9.8, 17.5, 20.8], target: [0, 0.6, 0.1] },
      top: { pos: [0, 33.5, 0.02], target: [0, 0, 0.1] },
      royal: { pos: [0, 3.4, -5.8], target: [0, 0.65, 2.5] },
      lists: { pos: [0.0, 2.35, 6.2], target: [0, 0.95, -3.5] },
      ...tablePresets,
    },
  };
}

/**
 * Registry of all Gathering 3D venue builders — all 5 Gatherings complete.
 */
const VENUE_BUILDERS = {
  'silver-lance': buildSilverLanceVenue,
  'five-banners': buildFiveBannersVenue,
  'iron-colosseum': buildIronColosseumVenue,
  'kings-mark': buildKingsMarkVenue,
  'victors-feast': buildVictorsFeastVenue,
};

export class Venue3DViewer {
  constructor(container, slug, mode = 'card') {
    this.container = container;
    this.slug = slug;
    this.mode = mode; // 'card' | 'emblem' | 'showcase' | 'modal'
    this.disposed = false;
    this.visible = true;
    this.autoRotate = mode === 'showcase' || mode === 'modal' ? false : false;
    this.hovered = false;
    this.dragMoved = false;
    this.pointerDownPos = null;
    this.activeTransition = null;
    this.clock = new THREE.Clock();

    const builder = VENUE_BUILDERS[slug];
    if (!builder) return;

    this.scene = new THREE.Scene();
    this.venue = builder();
    this.scene.add(this.venue.root);
    this.currentPreset = mode === 'showcase' || mode === 'modal' ? 'isometric' : 'card';
    // Scenery is attached here, never inside the exported builders reused by the atlas.
    if (mode === 'showcase' || mode === 'modal') {
      const arenaBounds = new THREE.Box3().setFromObject(this.venue.root);
      this.surroundings = buildVenueSurroundings(THREE, slug, {
        arenaBounds, labelMaterialFactory: text => festivalLabelMaterial(THREE, text, document.createElement('canvas')),
      });
      if (this.surroundings) {
        this.arenaOverview = this.venue.presets.isometric;
        this.venue.presets['arena-overview'] = this.arenaOverview;
        this.venue.root.add(this.surroundings.group);
        Object.assign(this.venue.highlights, this.surroundings.highlights);
        Object.assign(this.venue.zoneGroups, this.surroundings.zones);
        const meta = this.venue.metadata;
        const existing = meta.subViews || (meta.tableViews || []).map(t => ({key:t.key,preset:t.key,label:t.label,detail:t.seats}));
        meta.subViews = [...existing,
          {key:'arena-overview',preset:'arena-overview',label:'Arena',detail:'Original arena overview'},
          {key:'parking',preset:'parking',label:'Parking',detail:`${this.surroundings.layout.bays.length} illustrative car spaces · ${this.surroundings.layout.motorcycles.length} motorcycle spaces`},
          {key:'food',preset:'food',label:'Food Court',detail:'Festival stalls and picnic seating'},
        ];
        meta.subViewsLabel = 'Explore the venue';
        meta.subViewsReset = 'Full Venue';
        meta.presetLabels.isometric = 'Full Venue';
      }
    }

    if ((mode === 'showcase' || mode === 'modal') && this.surroundings) {
      this.peopleControlsLifetime = new AbortController();
      this.peopleMobile = matchMedia('(max-width:740px)').matches;
      this.people = createVenuePeople(THREE, slug, {layout:this.surroundings.layout,mobile:this.peopleMobile});
      this.scene.add(this.people.group);
      this.onPeoplePreference = () => {
        const visible=readPeoplePreference();this.people.setVisible(visible);
        const button=this.container.closest('.venue-3d-showcase, .venue-3d-modal')?.querySelector('[data-3d-people]');
        if(button){button.textContent=visible?'People: On':'People: Off';button.setAttribute('aria-pressed',String(visible));}
        this.renderOnce();
      };
      window.addEventListener('tg-venue-people', this.onPeoplePreference);
    }

    // Lighting: per-venue atmosphere (warm afternoon sun by default, winter twilight for Five Banners)
    const light = this.venue.lighting || {};
    const hemi = new THREE.HemisphereLight(light.hemiSky ?? 0xf6edd6, light.hemiGround ?? 0x1b2e22, light.hemiIntensity ?? 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(light.sunColor ?? 0xfff1cf, light.sunIntensity ?? 1.65);
    sun.position.set(14, 24, 16);
    sun.castShadow = mode !== 'card';
    if (sun.castShadow) {
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 5;
      sun.shadow.camera.far = 75;
      const d = 24;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
    }
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(light.rimColor ?? 0x9fc2a7, light.rimIntensity ?? 0.55);
    rim.position.set(-16, 10, -14);
    this.scene.add(rim);
    this.atmosphereLights={hemi,sun,rim};
    this.practicalLighting=buildVenueLighting(THREE,slug,{mobile:matchMedia('(max-width: 700px)').matches});
    this.venue.root.add(this.practicalLighting.group);
    this.torchLights=this.practicalLighting.lights;

    const w = Math.max(container.clientWidth, 240);
    const h = Math.max(container.clientHeight, 180);
    const fov = mode === 'card' || mode === 'emblem' ? 35 : 37;
    this.camera = new THREE.PerspectiveCamera(fov, w / h, 0.5, 130);

    this.updateSurroundingsPresets(w / h);
    const initialPreset = this.venue.presets[mode === 'card' || mode === 'emblem' ? 'card' : 'isometric'];
    this.camera.position.set(...initialPreset.pos);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if (sun.castShadow) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.appendChild(this.renderer.domElement);
    container.closest('.card-visual, .event-emblem')?.classList.add('is-3d-ready');

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...initialPreset.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 3.6;
    this.controls.maxDistance = this.surroundingsMaxDistance || 68;
    this.controls.enableZoom = mode === 'showcase' || mode === 'modal';
    this.controls.zoomSpeed = 0.35;
    this.controls.enablePan = mode === 'showcase' || mode === 'modal';
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.85;
    this.controls.update();
    this.zoomTargetDist = null;
    this._zoomOffset = new THREE.Vector3();

    const syncMotion = () => {
      this.people?.setMotionEnabled(!MOTION.matches);
      this.controls.enableDamping = !MOTION.matches && this.controls.enabled;
      if (MOTION.matches) {
        this.controls.autoRotate = false; this.autoRotate = false; this.zoomTargetDist = null;
        if (this.activeTransition) {
          this.camera.position.copy(this.activeTransition.toPos);
          this.controls.target.copy(this.activeTransition.toTarget);
          this.activeTransition = null;
        }
      }
      this.controls.update(); this.renderOnce();
    };
    this.motionCleanup = MOTION.subscribe(syncMotion); syncMotion();
    this.bindEvents();
    this.onPeoplePreference?.();
    this.renderOnce();
    this.startLoop();
  }

  bindEvents() {
    const el = this.renderer.domElement;

    this.onPointerDown = e => {
      this.dragMoved = false;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.currentPreset = null;
      this.activeTransition = null;
      this.zoomTargetDist = null;
      this.container.classList.add('is-dragging');
    };
    this.onPointerMove = e => {
      if (!this.pointerDownPos) return;
      if (Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y) > 5) {
        this.dragMoved = true;
      }
    };
    this.onPointerUp = () => {
      this.pointerDownPos = null;
      this.container.classList.remove('is-dragging');
    };
    this.onClickCapture = e => {
      if (this.dragMoved) {
        e.preventDefault();
        e.stopPropagation();
        this.dragMoved = false;
      }
    };

    // Silky-smooth damped mouse-wheel / trackpad zoom (replaces OrbitControls' abrupt step zoom)
    if (this.mode === 'showcase' || this.mode === 'modal') {
      this.onWheelCapture = e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.currentPreset = null;
        this.activeTransition = null;
        const currentDist = this.camera.position.distanceTo(this.controls.target);
        if (this.zoomTargetDist === null) this.zoomTargetDist = currentDist;
        // Normalize line/page scroll modes and clamp big mouse-wheel spikes gently
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= 100;
        const clamped = Math.max(-120, Math.min(120, dy));
        const factor = Math.exp(clamped * 0.00045); // ~4.5% gentle zoom per standard wheel tick
        this.zoomTargetDist = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.zoomTargetDist * factor));
      };
      el.addEventListener('wheel', this.onWheelCapture, { passive: false, capture: true });
    }

    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('click', this.onClickCapture, true);

    if (this.mode === 'card' || this.mode === 'emblem') {
      this.onEnter = () => { this.hovered = true; };
      this.onLeave = () => { this.hovered = false; };
      this.container.addEventListener('pointerenter', this.onEnter);
      this.container.addEventListener('pointerleave', this.onLeave);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.visible = entries[0]?.isIntersecting ?? true;
      }, { threshold: 0.05 });
      this.intersectionObserver.observe(this.container);
    }
  }

  handleResize() {
    if (this.disposed) return;
    if (this.people) {
      const mobile=matchMedia('(max-width:740px)').matches;
      if(mobile!==this.peopleMobile){
        this.people.dispose();this.peopleMobile=mobile;
        this.people=createVenuePeople(THREE,this.slug,{layout:this.surroundings.layout,mobile});
        this.scene.add(this.people.group);this.people.setMotionEnabled(!MOTION.matches);
        this.people.setVisible(readPeoplePreference());
      }
    }
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.updateSurroundingsPresets(w / h);
    if (this.controls && this.surroundingsMaxDistance) this.controls.maxDistance = this.surroundingsMaxDistance;
    if (this.surroundings && this.controls?.enabled && ['isometric','top','parking','food'].includes(this.currentPreset)) {
      this.activeTransition = null;
      const preset = this.venue.presets[this.currentPreset];
      this.camera.position.fromArray(preset.pos);this.controls.target.fromArray(preset.target);this.controls.update();
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderOnce();
  }

  updateSurroundingsPresets(aspect) {
    if (!this.surroundings) return;
    const options = {aspect, fov:37};
    const full = fitSurroundingsPreset(THREE, this.surroundings.bounds, {...options, parts:this.surroundings.framingParts});
    this.venue.presets.isometric = full;
    this.venue.presets.top = fitSurroundingsPreset(THREE, this.surroundings.bounds, {...options, top:true, parts:this.surroundings.framingParts});
    for (const key of ['parking','food']) {
      const area = this.surroundings.layout[key === 'parking' ? 'parking' : 'food'];
      const bounds = new THREE.Box3().setFromObject(this.surroundings.zones[key]);
      const angle = area.angle;
      const direction = key === 'food' ? [.25 * Math.cos(angle) - 1.35 * Math.sin(angle), .95, -.25 * Math.sin(angle) - 1.35 * Math.cos(angle)] :
        [.65 * Math.cos(angle) + 1.35 * Math.sin(angle), .95, -.65 * Math.sin(angle) + 1.35 * Math.cos(angle)];
      this.venue.presets[key] = fitSurroundingsPreset(THREE, bounds, {...options, direction});
    }
    this.camera.far = full.far;
    this.camera.updateProjectionMatrix();
    this.surroundingsMaxDistance = full.distance * 1.4;
  }

  setPreset(name) {
    const targetPreset = this.venue.presets[name];
    if (!targetPreset) return;
    this.currentPreset = name;
    this.zoomTargetDist = null;
    const toPos = new THREE.Vector3(...targetPreset.pos);
    const toTarget = new THREE.Vector3(...targetPreset.target);
    if (MOTION.matches) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      this.controls.update();
      this.renderOnce();
      return;
    }
    this.activeTransition = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      progress: 0,
    };
  }

  setAtmosphere(mode) {
    const profile=atmosphereProfile(mode);if(!profile)return;
    this.atmosphereLights.hemi.intensity=profile.hemi;
    this.atmosphereLights.sun.intensity=profile.sun;
    this.atmosphereLights.sun.color.setHex(profile.sunColor);
    this.atmosphereLights.rim.intensity=profile.rim;
    this.surroundings?.setNight(profile.torches);
    if(this.practicalLighting)this.practicalLighting.setNight(profile.torches);
    else this.torchLights.forEach(light=>{light.visible=profile.torches;});
    this.scene.background=new THREE.Color(profile.sky);
    this.renderOnce();
  }

  // yaw/pitch turn the head (radians, from dragging); zoom narrows the field of view (1 = natural).
  setSeatPose(pose, yaw = 0, pitch = 0, zoom = 1) {
    if (this.venue?.roofGroup) this.venue.roofGroup.visible = false;
    this.currentPreset = null;
    this.activeTransition = null;
    this.zoomTargetDist = null;
    this.setAutoRotate(false);
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    // Consume overview inertia before anchoring the camera at the seat.
    this.controls.update();
    this.camera.fov = Math.max(12, Math.min(90, pose.fov / Math.max(.5, zoom)));
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(...pose.position);
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(...pose.target).sub(this.camera.position);
    direction.applyAxisAngle(up, -yaw);
    if (pitch) direction.applyAxisAngle(new THREE.Vector3().crossVectors(direction, up).normalize(), pitch);
    this.controls.target.copy(this.camera.position).add(direction);
    this.controls.update();
    if (this.seatMarker) this.seatMarker.visible = false;
    if (this.partyMarkers) this.partyMarkers.visible = false;
    this.renderOnce();
  }

  setSeatOverview(pose, partyPoses = []) {
    this.activeTransition = null;
    this.zoomTargetDist = null;
    this.controls.enabled = true;
    this.controls.enableDamping = true;
    this.camera.near = 0.5;
    this.camera.updateProjectionMatrix();
    if (!this.seatMarker) {
      this.seatMarker = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({color: 0xffdf63, depthTest: false}));
      this.seatMarker.renderOrder = 10;
      this.scene.add(this.seatMarker);
    }
    this.seatMarker.position.set(...pose.position);
    this.seatMarker.visible = true;
    if (this.partyMarkers) {
      this.partyMarkers.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});
      this.scene.remove(this.partyMarkers);
    }
    this.partyMarkers = new THREE.Group();
    partyPoses.forEach(p=>{
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.20,10,6),new THREE.MeshBasicMaterial({color:0xffdf63,depthTest:false}));
      marker.position.set(...p.position);marker.renderOrder=10;this.partyMarkers.add(marker);
    });
    this.scene.add(this.partyMarkers);
    this.controls.enableZoom = true; // scroll-wheel zoom, as in the full 3D venue view
    this.setPreset('isometric');
  }

  /** Move the orbiting camera closer (factor < 1) or further away (factor > 1). */
  dollyOverview(factor) {
    this.activeTransition = null;
    this.zoomTargetDist = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, offset.length() * factor));
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
    this.renderOnce();
  }

  setGuidesVisible(visible) {
    this.venue.guidesGroup.visible = visible;
    this.renderOnce();
  }

  setRoofVisible(visible) {
    if (!this.venue?.roofGroup) return;
    this.venue.roofGroup.visible = Boolean(visible);
    this.renderOnce();
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled && !MOTION.matches;
    this.controls.autoRotate = this.autoRotate;
  }

  highlightZone(key) {
    Object.entries(this.venue.highlights).forEach(([k, mesh]) => {
      mesh.visible = k === key;
    });
    this.renderOnce();
  }

  renderOnce() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    const tick = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);
      if (!this.visible || document.hidden) return;

      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;
      this.people?.update(dt);

      if (this.activeTransition) {
        this.activeTransition.progress = Math.min(1, this.activeTransition.progress + dt * 2.4);
        const t = 1 - Math.pow(1 - this.activeTransition.progress, 3);
        this.camera.position.lerpVectors(this.activeTransition.fromPos, this.activeTransition.toPos, t);
        this.controls.target.lerpVectors(this.activeTransition.fromTarget, this.activeTransition.toTarget, t);
        if (this.activeTransition.progress >= 1) this.activeTransition = null;
      } else if (this.zoomTargetDist !== null) {
        // Exponentially damped zoom glide toward zoomTargetDist
        this._zoomOffset.copy(this.camera.position).sub(this.controls.target);
        const curr = this._zoomOffset.length();
        const next = curr + (this.zoomTargetDist - curr) * (1 - Math.exp(-7.5 * dt));
        if (Math.abs(next - this.zoomTargetDist) < 0.015) {
          this._zoomOffset.setLength(this.zoomTargetDist);
          this.zoomTargetDist = null;
        } else {
          this._zoomOffset.setLength(next);
        }
        this.camera.position.copy(this.controls.target).add(this._zoomOffset);
      }

      if (!MOTION.matches) {
        // Gentle pennant flutter in the tournament breeze
        for (const p of this.venue.animatedPennants || []) {
          p.mesh.rotation.y = p.baseY + Math.sin(elapsed * 2.8 + p.phase) * 0.14;
        }
        // Subtle warm brazier ember flicker
        for (const e of this.venue.animatedEmbers || []) {
          const pulse = 1 + Math.sin(elapsed * 6.5 + e.phase) * 0.16;
          e.mesh.scale.set(0.85 * pulse, 1.35 * pulse, 0.85 * pulse);
          e.mesh.material.emissiveIntensity = 1.25 + Math.sin(elapsed * 8.2 + e.phase) * 0.4;
        }
        // Subtle gentle turn on card hover when not dragging
        if ((this.mode === 'card' || this.mode === 'emblem') && !this.pointerDownPos && !this.activeTransition) {
          this.controls.autoRotate = this.hovered;
          this.controls.autoRotateSpeed = 1.1;
        }
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose() {
    if(this.disposed)return;
    window.removeEventListener('tg-venue-people', this.onPeoplePreference);
    this.peopleControlsLifetime?.abort();
    this.people?.dispose();
    this.livingCleanup?.();
    this.motionCleanup?.();
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.renderer?.domElement?.removeEventListener('pointerdown', this.onPointerDown);
    if (this.onWheelCapture) this.renderer?.domElement?.removeEventListener('wheel', this.onWheelCapture, { capture: true });
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.container?.removeEventListener('click', this.onClickCapture, true);
    if (this.onEnter) this.container.removeEventListener('pointerenter', this.onEnter);
    if (this.onLeave) this.container.removeEventListener('pointerleave', this.onLeave);
    this.controls?.dispose();
    this.surroundings?.dispose();
    this.scene?.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    this.practicalLighting?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}

function wireToolbarControls(rootEl, viewer) {
  mountLivingVenue(rootEl,viewer,THREE);
  const presetLabels = viewer.venue?.metadata?.presetLabels || {};
  const presetButtons = [...rootEl.querySelectorAll('[data-3d-preset]')];
  const tableBar = rootEl.querySelector('[data-3d-tables]');
  let lockedZone = null;

  const clearTableActive = () => {
    tableBar?.querySelectorAll('.venue-table-btn').forEach(b => b.classList.remove('active'));
  };

  presetButtons.forEach(btn => {
    const key = btn.getAttribute('data-3d-preset');
    if (presetLabels[key]) btn.textContent = presetLabels[key];
    btn.addEventListener('click', () => {
      lockedZone = null;
      clearTableActive();
      viewer.highlightZone(null);
      presetButtons.forEach(b => b.classList.toggle('active', b === btn));
      viewer.setPreset(key);
    });
  });

  const roofBtn = rootEl.querySelector('[data-3d-roof]');
  const syncRoofBtn = visible => {
    if (!roofBtn) return;
    roofBtn.setAttribute('aria-pressed', String(visible));
    roofBtn.textContent = visible ? 'Roof: On' : 'Roof: Off';
  };
  if (roofBtn) {
    const hasRoof = Boolean(viewer.venue?.roofGroup);
    roofBtn.hidden = !hasRoof;
    if (hasRoof) {
      syncRoofBtn(viewer.venue.roofGroup.visible !== false);
      roofBtn.addEventListener('click', () => {
        const next = roofBtn.getAttribute('aria-pressed') !== 'true';
        syncRoofBtn(next);
        viewer.setRoofVisible(next);
      });
    }
  }

  if (tableBar) {
    const meta = viewer.venue?.metadata || {};
    const subItems = meta.subViews?.length
      ? meta.subViews
      : (meta.tableViews?.length ? meta.tableViews.map(t => ({ key: t.key, preset: t.key, label: t.label, detail: t.seats })) : null);
    if (subItems?.length) {
      const barLabel = meta.subViewsLabel || 'View table';
      const resetLabel = meta.subViewsReset || 'All Tables';
      tableBar.hidden = false;
      if (viewer.surroundings) tableBar.setAttribute('aria-label', 'Explore venue areas');
      tableBar.innerHTML = `<span class="venue-3d-tables-label">${barLabel}</span>${subItems.map(t =>
        `<button type="button" class="venue-table-btn" data-sub-zone="${t.key}" data-sub-preset="${t.preset}" title="${t.label}${t.detail ? ` (${t.detail})` : ''}">${t.label}</button>`
      ).join('')}<button type="button" class="venue-table-btn table-reset" data-table-reset>${resetLabel}</button>`;

      tableBar.querySelectorAll('[data-sub-zone]').forEach(btn => {
        const zoneKey = btn.getAttribute('data-sub-zone');
        const presetKey = btn.getAttribute('data-sub-preset');
        btn.addEventListener('pointerenter', () => viewer.highlightZone(zoneKey));
        btn.addEventListener('pointerleave', () => viewer.highlightZone(lockedZone));
        btn.addEventListener('click', () => {
          const wasActive = btn.classList.contains('active');
          clearTableActive();
          rootEl.querySelectorAll('.venue-zone-chip').forEach(c => c.classList.remove('active'));
          if (!wasActive) {
            btn.classList.add('active');
            lockedZone = zoneKey;
            presetButtons.forEach(b => b.classList.remove('active'));
            // Automatically lift roof off when inspecting an indoor banquet table so the interior is clear
            if (viewer.venue?.roofGroup?.visible && !['parking','food','arena-overview'].includes(zoneKey)) {
              viewer.setRoofVisible(false);
              syncRoofBtn(false);
            }
            viewer.highlightZone(zoneKey);
            viewer.setPreset(presetKey);
          } else {
            lockedZone = null;
            viewer.highlightZone(null);
            viewer.setPreset('isometric');
            presetButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-3d-preset') === 'isometric'));
          }
        });
      });

      tableBar.querySelector('[data-table-reset]')?.addEventListener('click', () => {
        lockedZone = null;
        clearTableActive();
        rootEl.querySelectorAll('.venue-zone-chip').forEach(c => c.classList.remove('active'));
        viewer.highlightZone(null);
        viewer.setPreset('isometric');
        presetButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-3d-preset') === 'isometric'));
      });
    } else {
      tableBar.hidden = true;
      tableBar.innerHTML = '';
    }
  }

  const guidesBtn = rootEl.querySelector('[data-3d-guides]');
  guidesBtn?.addEventListener('click', () => {
    const next = guidesBtn.getAttribute('aria-pressed') !== 'true';
    guidesBtn.setAttribute('aria-pressed', String(next));
    viewer.setGuidesVisible(next);
  });

  const peopleBtn = rootEl.querySelector('[data-3d-people]');
  if(peopleBtn){
    viewer.onPeoplePreference?.();
    peopleBtn.addEventListener('click',()=>{
      writePeoplePreference(!readPeoplePreference());
      window.dispatchEvent(new Event('tg-venue-people'));
    },{signal:viewer.peopleControlsLifetime?.signal});
  }
  const rotateBtn = rootEl.querySelector('[data-3d-rotate]');
  rotateBtn?.addEventListener('click', () => {
    const next = rotateBtn.getAttribute('aria-pressed') !== 'true';
    rotateBtn.setAttribute('aria-pressed', String(next));
    viewer.setAutoRotate(next);
  });

  const legend = rootEl.querySelector('[data-3d-legend]');
  if (legend && viewer.venue?.metadata?.zones) {
    legend.innerHTML = viewer.venue.metadata.zones.map(z =>
      `<button type="button" class="venue-zone-chip" data-zone="${z.key}" data-preset="${z.preset}"><i style="background:${z.color}"></i>${z.label}</button>`
    ).join('');
    legend.querySelectorAll('.venue-zone-chip').forEach(chip => {
      chip.addEventListener('pointerenter', () => viewer.highlightZone(chip.dataset.zone));
      chip.addEventListener('pointerleave', () => viewer.highlightZone(lockedZone));
      chip.addEventListener('click', () => {
        const wasActive = chip.classList.contains('active');
        legend.querySelectorAll('.venue-zone-chip').forEach(c => c.classList.remove('active'));
        clearTableActive();
        if (!wasActive) {
          chip.classList.add('active');
          lockedZone = chip.dataset.zone;
          viewer.highlightZone(chip.dataset.zone);
          viewer.setPreset(chip.dataset.preset);
          presetButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-3d-preset') === chip.dataset.preset));
        } else {
          lockedZone = null;
          viewer.highlightZone(null);
        }
      });
    });
  }
}

function initModal() {
  const modal = document.getElementById('venue-3d-modal');
  if (!modal) return null;
  let activeViewer = null;
  const stage = modal.querySelector('[data-modal-3d-stage]');
  const titleEl = modal.querySelector('[data-modal-3d-title]');
  const venueEl = modal.querySelector('[data-modal-3d-venue]');

  function closeModal() {
    if (activeViewer) {
      activeViewer.dispose();
      activeViewer = null;
    }
    if (modal.open) modal.close();
  }

  modal.querySelector('[data-modal-3d-close]')?.addEventListener('click', closeModal);
  modal.addEventListener('close', () => {
    if (activeViewer) {
      activeViewer.dispose();
      activeViewer = null;
    }
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  function openModal(slug, customTitle) {
    if (!VENUE_BUILDERS[slug]) return;
    if (activeViewer) activeViewer.dispose();
    stage.innerHTML = '';
    modal.setAttribute('data-venue-theme', slug);
    modal.showModal();

    // Reset button states
    modal.querySelectorAll('[data-3d-preset]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-3d-preset') === 'isometric');
    });
    const guidesBtn = modal.querySelector('[data-3d-guides]');
    if (guidesBtn) guidesBtn.setAttribute('aria-pressed', 'true');
    const rotateBtn = modal.querySelector('[data-3d-rotate]');
    if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false');

    activeViewer = new Venue3DViewer(stage, slug, 'modal');
    if (activeViewer.venue?.metadata) {
      if (titleEl) titleEl.textContent = customTitle || activeViewer.venue.metadata.title;
      if (venueEl) venueEl.textContent = activeViewer.venue.metadata.venue;
    }

    // Re-bind toolbar cleanly by cloning buttons once per open
    const bar = modal.querySelector('.venue-3d-bar');
    if (bar) {
      const freshBar = bar.cloneNode(true);
      bar.replaceWith(freshBar);
    }
    wireToolbarControls(modal, activeViewer);
    requestAnimationFrame(() => activeViewer?.handleResize());
  }

  return { openModal };
}

function boot() {
  if (document.documentElement.dataset.venue3dBooted) return;
  document.documentElement.dataset.venue3dBooted = '1';
  const modalApi = initModal();

  // Mount inline 3D stages on cards, detail hero emblems, and detail showcase blocks
  document.querySelectorAll('[data-venue-3d]').forEach(stage => {
    const slug = stage.getAttribute('data-venue-3d');
    const mode = stage.getAttribute('data-venue-mode') || 'card';
    if (!VENUE_BUILDERS[slug] || stage.dataset.venue3dMounted) return;
    try {
      stage.dataset.venue3dMounted = '1';
      const viewer = new Venue3DViewer(stage, slug, mode);
      const showcase = stage.closest('.venue-3d-showcase');
      if (showcase) wireToolbarControls(showcase, viewer);
    } catch (_err) {
      delete stage.dataset.venue3dMounted;
      // WebGL unavailable — SVG blueprint remains gracefully visible.
    }
  });

  // Wire "Inspect 3D" trigger buttons on cards, emblems, and showcases
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-open-3d]');
    if (!trigger || !modalApi) return;
    e.preventDefault();
    e.stopPropagation();
    modalApi.openModal(trigger.getAttribute('data-open-3d'), trigger.getAttribute('data-open-3d-title'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { VENUE_BUILDERS, boot as bootVenueViewers };
