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

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 * Builds The Royal Lists — The Tourney of the Silver Lance.
 * Every structural footprint matches templates/venue_art.html identically.
 */
function buildSilverLanceVenue() {
  const root = new THREE.Group();
  const mat = makeMaterials();
  const animatedPennants = [];
  const guidesGroup = new THREE.Group();
  const zoneGroups = {
    lists: new THREE.Group(),
    northStand: new THREE.Group(),
    southStand: new THREE.Group(),
    pavilions: new THREE.Group(),
    lanes: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  // ── 1. ARCHITECTURAL BASE PLINTH & BLUEPRINT GRID ──────────────────────────
  const plinthW = 34.4;
  const plinthD = 17.6;
  addBox(root, plinthW, 0.46, plinthD, mat.ground, 0, -0.23, 0, false);

  // Subtle brass bevel border around architectural base
  const rimH = 0.07;
  const rimT = 0.12;
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, -plinthD / 2, false);
  addBox(root, plinthW + 0.12, rimH, rimT, mat.plinthEdge, 0, -0.02, plinthD / 2, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, -plinthW / 2, -0.02, 0, false);
  addBox(root, rimT, rimH, plinthD + 0.12, mat.plinthEdge, plinthW / 2, -0.02, 0, false);

  // Architectural blueprint grid on ground plane
  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.085 });
  const gridPoints = [];
  for (let gx = -16; gx <= 16; gx += 1.6) {
    gridPoints.push(new THREE.Vector3(gx, 0.005, -8.2), new THREE.Vector3(gx, 0.005, 8.2));
  }
  for (let gz = -8; gz <= 8; gz += 1.6) {
    gridPoints.push(new THREE.Vector3(-16.6, 0.005, gz), new THREE.Vector3(16.6, 0.005, gz));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  // Outer Circular Ground Ring (exact SVG: circle cx="180" cy="92" r="77")
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(7.63, 7.75, 112), mat.guideRing);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(0, 0.016, toZ(92));
  guidesGroup.add(ringMesh);

  // Center Crosshairs (M180 9v167, M16 92h328)
  const crossPts = [
    new THREE.Vector3(0, 0.014, toZ(9)), new THREE.Vector3(0, 0.014, toZ(176)),
    new THREE.Vector3(toX(16), 0.014, toZ(92)), new THREE.Vector3(toX(344), 0.014, toZ(92)),
  ];
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPts), mat.guideLine));

  // Four Drafting Corner Brackets (M20 30v-9h13 etc.)
  const bracketPts = [
    [toX(20), toZ(30), toX(20), toZ(21)], [toX(20), toZ(21), toX(33), toZ(21)],
    [toX(327), toZ(21), toX(340), toZ(21)], [toX(340), toZ(21), toX(340), toZ(30)],
    [toX(20), toZ(155), toX(20), toZ(164)], [toX(20), toZ(164), toX(33), toZ(164)],
    [toX(327), toZ(164), toX(340), toZ(164)], [toX(340), toZ(164), toX(340), toZ(155)],
    // Bottom-left scale bar (M19 171h35)
    [toX(19), toZ(171), toX(54), toZ(171)],
    [toX(19), toZ(168), toX(19), toZ(174)],
    [toX(54), toZ(168), toX(54), toZ(174)],
    // Top-right compass north arrow (M324 23 l6-10 6 10, M330 13 v19)
    [toX(324), toZ(23), toX(330), toZ(13)],
    [toX(330), toZ(13), toX(336), toZ(23)],
    [toX(330), toZ(13), toX(330), toZ(32)],
  ];
  const bVecs = [];
  for (const [x1, z1, x2, z2] of bracketPts) {
    bVecs.push(new THREE.Vector3(x1, 0.018, z1), new THREE.Vector3(x2, 0.018, z2));
  }
  guidesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bVecs), mat.guideLine));

  // ── 2. CENTRAL JOUSTING ARENA ("THE ROYAL LISTS") ──────────────────────────
  // Exact SVG rect: x=59..301 (w=242 => 24.2), y=65..120 (h=55 => 5.5)
  const listsW = 24.2;
  const listsD = 5.5;
  const listsX1 = toX(59);   // -12.1
  const listsX2 = toX(301);  // +12.1
  const listsZ1 = toZ(65);   // -2.75
  const listsZ2 = toZ(120);  // +2.75
  const listsGroup = zoneGroups.lists;

  // Turf border and groomed tournament sand pitch
  addBox(listsGroup, listsW, 0.06, listsD, mat.turf, 0, 0.03, 0, false);
  addBox(listsGroup, listsW - 0.65, 0.08, listsD - 0.65, mat.sand, 0, 0.045, 0, false);

  // Subtle packed hoof-track jousting lanes (North & South of the tilt)
  addBox(listsGroup, 21.0, 0.088, 1.35, mat.sandLane, 0, 0.048, -1.25, false);
  addBox(listsGroup, 21.0, 0.088, 1.35, mat.sandLane, 0, 0.048, 1.25, false);

  // Outer Perimeter Lists Fence (exact 24.2 x 5.5 rectangle)
  const fenceH = 0.56;
  const railThick = 0.09;
  // Stone/timber curb base
  addBox(listsGroup, listsW + 0.14, 0.14, 0.18, mat.stone, 0, 0.07, listsZ1, true);
  addBox(listsGroup, listsW + 0.14, 0.14, 0.18, mat.stone, 0, 0.07, listsZ2, true);
  addBox(listsGroup, 0.18, 0.14, listsD + 0.14, mat.stone, listsX1, 0.07, 0, true);
  addBox(listsGroup, 0.18, 0.14, listsD + 0.14, mat.stone, listsX2, 0.07, 0, true);

  // Horizontal double timber rails + bright brass top cap rail
  for (const ry of [0.27, 0.47]) {
    addBox(listsGroup, listsW, 0.07, railThick, mat.timberLight, 0, ry, listsZ1, true);
    addBox(listsGroup, listsW, 0.07, railThick, mat.timberLight, 0, ry, listsZ2, true);
    addBox(listsGroup, railThick, 0.07, listsD, mat.timberLight, listsX1, ry, 0, true);
    addBox(listsGroup, railThick, 0.07, listsD, mat.timberLight, listsX2, ry, 0, true);
  }
  addBox(listsGroup, listsW + 0.12, 0.055, 0.12, mat.brassBright, 0, fenceH, listsZ1, false);
  addBox(listsGroup, listsW + 0.12, 0.055, 0.12, mat.brassBright, 0, fenceH, listsZ2, false);
  addBox(listsGroup, 0.12, 0.055, listsD + 0.12, mat.brassBright, listsX1, fenceH, 0, false);
  addBox(listsGroup, 0.12, 0.055, listsD + 0.12, mat.brassBright, listsX2, fenceH, 0, false);

  // Perimeter Fence Posts
  const postStepX = listsW / 16;
  for (let i = 0; i <= 16; i++) {
    const px = listsX1 + i * postStepX;
    const isCorner = i === 0 || i === 16;
    const isAccent = isCorner || i % 4 === 0;
    for (const pz of [listsZ1, listsZ2]) {
      addBox(listsGroup, isCorner ? 0.2 : 0.13, fenceH + (isAccent ? 0.12 : 0.04), isCorner ? 0.2 : 0.13, mat.timber, px, (fenceH + (isAccent ? 0.12 : 0.04)) / 2, pz, true);
      if (isAccent) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 4), mat.brass);
        cap.position.set(px, fenceH + 0.2, pz);
        cap.rotation.y = Math.PI / 4;
        listsGroup.add(cap);
      }
    }
  }
  for (let j = 1; j <= 3; j++) {
    const pz = listsZ1 + (listsD / 4) * j;
    for (const px of [listsX1, listsX2]) {
      addBox(listsGroup, 0.13, fenceH + 0.04, 0.13, mat.timber, px, (fenceH + 0.04) / 2, pz, true);
    }
  }

  // Inner Starting Gate Barriers (exact SVG: M75 70v45 and M285 70v45)
  const gateZLen = 4.5; // y=70..115 => -2.25..+2.25
  for (const [gx, pennantMat] of [[toX(75), mat.wine], [toX(285), mat.nobleGreen]]) {
    // Ground brass starting line strip
    addBox(listsGroup, 0.15, 0.06, gateZLen, mat.brassBright, gx, 0.08, 0, false);
    // Low timber starting-gate crossbeam
    addBox(listsGroup, 0.14, 0.42, gateZLen, mat.timber, gx, 0.26, 0, true);
    addBox(listsGroup, 0.16, 0.06, gateZLen + 0.04, mat.brass, gx, 0.50, 0, false);

    // Flanking heraldic gate standards at ends of each starting barrier
    for (const gz of [-2.22, 2.22]) {
      addBox(listsGroup, 0.22, 0.92, 0.22, mat.timber, gx, 0.46, gz, true);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.35, 8), mat.brass);
      pole.position.set(gx, 1.45, gz);
      listsGroup.add(pole);

      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), mat.brassBright);
      finial.position.set(gx, 2.15, gz);
      listsGroup.add(finial);

      // Triangular miniature heraldic pennant
      const flagShape = new THREE.Shape();
      flagShape.moveTo(0, 0.18);
      flagShape.lineTo(0.72, 0.04);
      flagShape.lineTo(0, -0.18);
      flagShape.closePath();
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), pennantMat.clone());
      flag.material.side = THREE.DoubleSide;
      flag.position.set(gx, 1.88, gz);
      flag.rotation.y = gx < 0 ? 0 : Math.PI;
      listsGroup.add(flag);
      animatedPennants.push({ mesh: flag, baseY: flag.rotation.y, phase: gx * 0.7 + gz });
    }
  }

  // Central Horizontal Tilt Barrier ("The Tilt" — exact SVG: M71 92h218 => X = -10.9..+10.9, Z = 0)
  const tiltLen = 21.8;
  const tiltZ = toZ(92);
  addBox(listsGroup, tiltLen, 0.12, 0.28, mat.stoneDark, 0, 0.10, tiltZ, true);
  addBox(listsGroup, tiltLen, 0.64, 0.16, mat.timber, 0, 0.44, tiltZ, true);
  addBox(listsGroup, tiltLen + 0.08, 0.07, 0.20, mat.brassBright, 0, 0.79, tiltZ, false);

  // Decorative draped tournament caparison panels along the tilt wall
  for (let tx = -9.6; tx <= 9.6; tx += 2.4) {
    const clothMat = Math.abs(tx) < 2.6 ? mat.wine : (Math.round(tx / 2.4) % 2 === 0 ? mat.nobleGreen : mat.wine);
    addBox(listsGroup, 1.55, 0.42, 0.21, clothMat, tx, 0.44, tiltZ, false);
    addBox(listsGroup, 1.58, 0.045, 0.22, mat.brass, tx, 0.24, tiltZ, false);
  }
  // Vertical tilt barrier posts
  for (let px = -10.8; px <= 10.81; px += 1.8) {
    addBox(listsGroup, 0.14, 0.84, 0.22, mat.timberLight, px, 0.46, tiltZ, true);
  }

  // Opposing Center Jousting Lance Chevrons (exact SVG: M167 88l11 4-11 4 and M193 88l-11 4 11 4)
  // Left chevron: X = -1.30..-0.20 pointing +X; Right chevron: X = +1.30..+0.20 pointing -X
  const clashY = 0.86;
  const chevronLen = Math.hypot(1.1, 0.4);
  const chevronAngle = Math.atan2(0.4, 1.1);

  // Subtle brass clash medallion on the ground at center (0, 0)
  const clashRing = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.64, 32), mat.brassBright);
  clashRing.rotation.x = -Math.PI / 2;
  clashRing.position.set(0, 0.11, tiltZ);
  listsGroup.add(clashRing);

  for (const dir of [-1, 1]) {
    // dir = -1 => left chevron pointing right (+X); dir = +1 => right chevron pointing left (-X)
    const tipX = dir * 0.2;
    const tailX = dir * 1.3;
    const midX = (tipX + tailX) / 2;
    for (const sideZ of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(chevronLen, 0.10, 0.12), mat.brassBright);
      wing.position.set(midX, clashY, tiltZ + sideZ * 0.2);
      wing.rotation.y = dir * sideZ * chevronAngle;
      wing.castShadow = true;
      listsGroup.add(wing);
    }
    // Gleaming miniature jousting lance resting along each opposing side
    const lance = new THREE.Mesh(new THREE.ConeGeometry(0.055, 2.2, 8), mat.brassBright);
    lance.rotation.z = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
    lance.position.set(dir * 1.45, clashY + 0.14, tiltZ + (dir < 0 ? -0.58 : 0.58));
    lance.castShadow = true;
    listsGroup.add(lance);
  }

  // ── 3. NORTH & SOUTH GRANDSTANDS (13 SQUARE BAYS EACH) ─────────────────────
  // Exact SVG:
  //   North: M77 34h206v22H77z  => X = -10.3..+10.3 (w=20.6), Z = -5.85..-3.65 (d=2.2, center=-4.75)
  //   South: M77 129h206v22H77z => X = -10.3..+10.3 (w=20.6), Z = +3.65..+5.85 (d=2.2, center=+4.75)
  //   13 square bays along each stand matching `range(85, 278, 16)`
  function buildGrandstand(targetGroup, sideSign) {
    // sideSign: -1 for North Stand (faces +Z), +1 for South Stand (faces -Z)
    const standW = 20.6;
    const standD = 2.2;
    const centerZ = sideSign * 4.75;
    const frontZ = centerZ - sideSign * (standD / 2); // ±3.65 (closest to lists)
    const backZ = centerZ + sideSign * (standD / 2);  // ±5.85 (outer back wall)

    // Solid stepped limestone & timber foundation plinth
    addBox(targetGroup, standW, 0.34, standD, mat.stone, 0, 0.17, centerZ, true);
    // Crisp antique-brass outer footprint outline (exact 20.6 x 2.2 rectangle)
    addBox(targetGroup, standW + 0.08, 0.06, 0.11, mat.brassBright, 0, 0.37, frontZ, false);
    addBox(targetGroup, standW + 0.08, 0.06, 0.11, mat.brassBright, 0, 0.37, backZ, false);
    addBox(targetGroup, 0.11, 0.06, standD + 0.08, mat.brassBright, -standW / 2, 0.37, centerZ, false);
    addBox(targetGroup, 0.11, 0.06, standD + 0.08, mat.brassBright, standW / 2, 0.37, centerZ, false);

    // 3 Rising Seating Tiers behind front railing (stepped away from the lists)
    const tiers = [
      { offset: -0.62, depth: 0.56, height: 0.52 },
      { offset: 0.0, depth: 0.58, height: 0.86 },
      { offset: 0.64, depth: 0.62, height: 1.22 },
    ];
    for (const t of tiers) {
      addBox(targetGroup, standW - 0.32, t.height, t.depth, mat.timber, 0, t.height / 2 + 0.12, centerZ + sideSign * t.offset, true);
    }

    // Rear parapet gallery wall & side cheek walls
    addBox(targetGroup, standW, 1.72, 0.18, mat.stoneDark, 0, 0.86, backZ - sideSign * 0.06, true);
    addBox(targetGroup, standW + 0.08, 0.09, 0.24, mat.brass, 0, 1.76, backZ - sideSign * 0.06, false);
    for (const endX of [-standW / 2 + 0.09, standW / 2 - 0.09]) {
      addBox(targetGroup, 0.18, 1.38, standD, mat.stoneDark, endX, 0.69, centerZ, true);
      addBox(targetGroup, 0.22, 0.07, standD + 0.06, mat.brass, endX, 1.40, centerZ, false);
    }

    // Front balustrade railing facing the lists
    addBox(targetGroup, standW - 0.1, 0.42, 0.10, mat.timberLight, 0, 0.55, frontZ + sideSign * 0.08, true);
    addBox(targetGroup, standW, 0.06, 0.14, mat.brassBright, 0, 0.78, frontZ + sideSign * 0.08, false);

    // 13 Square Seating Bays matching exact Silver Lance venue map (150 seats per stand = 300 total):
    //   - Center bay (i = 6): Royal Box = 10 seats per stand (20 total)
    //   - Flanking 4 bays (i = 4,5,7,8): Noble Stand = 40 seats per stand (80 total)
    //   - Outer 8 bays (i = 0..3, 9..12): Commoner's Bench = 100 seats per stand (200 total)
    const bayCount = 13;
    const baySpacing = 1.52;
    const bayW = 0.98;
    const bayD = 1.06;
    const bayZ = centerZ;
    const facingRotY = sideSign < 0 ? 0 : Math.PI;
    const royalSeats = [];
    const nobleSeats = [];
    const benchSeats = [];

    for (let i = 0; i < bayCount; i++) {
      const bx = (i - (bayCount - 1) / 2) * baySpacing;
      const distCenter = Math.abs(i - 6);
      const isRoyal = distCenter === 0; // Center bay: 10 Royal Box seats per stand (20 total)
      const isNoble = distCenter >= 1 && distCenter <= 2; // 4 flanking bays: 40 Noble seats per stand (80 total)
      const seatMat = isRoyal ? mat.wine : (isNoble ? mat.nobleGreen : mat.benchOak);

      // Stepped bench risers inside each square bay
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 0.67, bayZ - sideSign * 0.34, true);
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 1.01, bayZ, true);
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 1.35, bayZ + sideSign * 0.34, true);

      // Exact individual miniature seats per bay matching the 300-seat booking map
      if (isRoyal) {
        // 2 plush rows × 5 seats = 10 Royal Box seats on this stand
        for (const [rowOff, ry] of [[-0.26, 0.78], [0.26, 1.24]]) {
          for (let s = 0; s < 5; s++) {
            const sx = bx + (s - 2) * 0.165;
            royalSeats.push({ x: sx, y: ry, z: bayZ + sideSign * rowOff, rotY: facingRotY });
          }
        }
      } else if (isNoble) {
        // 3 rows (3 + 3 + 4) = 10 Noble seats × 4 bays = 40 per stand
        const rowsSpec = [[-0.34, 0.77, 3], [0, 1.11, 3], [0.34, 1.45, 4]];
        for (const [rowOff, ry, cnt] of rowsSpec) {
          for (let s = 0; s < cnt; s++) {
            const sx = bx + (cnt === 1 ? 0 : ((s / (cnt - 1)) - 0.5) * 0.68);
            nobleSeats.push({ x: sx, y: ry, z: bayZ + sideSign * rowOff, rotY: facingRotY });
          }
        }
      } else {
        // Outer 8 bays: 4 bays × 12 (4+4+4) + 4 bays × 13 (4+4+5) = 100 Commoner seats per stand
        const isThirteen = i === 1 || i === 3 || i === 9 || i === 11;
        const rowsSpec = [[-0.34, 0.77, 4], [0, 1.11, 4], [0.34, 1.45, isThirteen ? 5 : 4]];
        for (const [rowOff, ry, cnt] of rowsSpec) {
          for (let s = 0; s < cnt; s++) {
            const sx = bx + ((s / (cnt - 1)) - 0.5) * 0.70;
            benchSeats.push({ x: sx, y: ry, z: bayZ + sideSign * rowOff, rotY: facingRotY });
          }
        }
      }

      // Crisp 4-sided raised box-frame enclosure around each of the 13 bays
      const frameH = isRoyal ? 1.58 : 1.46;
      const frameY = frameH / 2 + 0.14;
      const wallT = 0.09;
      addBox(targetGroup, wallT, frameH * 0.65, bayD, mat.timberLight, bx - bayW / 2, frameY - 0.12, bayZ, true);
      addBox(targetGroup, wallT, frameH * 0.65, bayD, mat.timberLight, bx + bayW / 2, frameY - 0.12, bayZ, true);

      // Bright antique-brass top rim around every single square bay
      const rimY = isRoyal ? 1.54 : 1.44;
      const rimMat = isRoyal ? mat.brassBright : mat.brass;
      addBox(targetGroup, bayW + 0.04, 0.06, 0.08, rimMat, bx, rimY, bayZ - bayD / 2, false);
      addBox(targetGroup, bayW + 0.04, 0.06, 0.08, rimMat, bx, rimY, bayZ + bayD / 2, false);
      addBox(targetGroup, 0.08, 0.06, bayD + 0.04, rimMat, bx - bayW / 2, rimY, bayZ, false);
      addBox(targetGroup, 0.08, 0.06, bayD + 0.04, rimMat, bx + bayW / 2, rimY, bayZ, false);

      // Rear timber arcade posts & subtle heraldic banners on alternate bays
      if (i % 2 === 0 || isRoyal) {
        const postH = isRoyal ? 2.55 : 2.25;
        const postZ = backZ - sideSign * 0.12;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, postH, 8), mat.timber);
        post.position.set(bx, postH / 2 + 0.25, postZ);
        post.castShadow = true;
        targetGroup.add(post);

        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), mat.brassBright);
        orb.position.set(bx, postH + 0.28, postZ);
        targetGroup.add(orb);

        const pShape = new THREE.Shape();
        pShape.moveTo(0, 0.14);
        pShape.lineTo(0.56, 0.0);
        pShape.lineTo(0, -0.14);
        pShape.closePath();
        const pMat = (isRoyal ? mat.wine : (isNoble ? mat.nobleGreen : mat.creamCloth)).clone();
        pMat.side = THREE.DoubleSide;
        const pennant = new THREE.Mesh(new THREE.ShapeGeometry(pShape), pMat);
        pennant.position.set(bx, postH + 0.05, postZ);
        pennant.rotation.y = sideSign < 0 ? Math.PI * 0.15 : -Math.PI * 0.85;
        targetGroup.add(pennant);
        animatedPennants.push({ mesh: pennant, baseY: pennant.rotation.y, phase: i * 0.65 + sideSign });
      }
    }

    addInstancedSeatGroup(targetGroup, royalSeats, mat.wine, mat.brassBright, 0.92);
    addInstancedSeatGroup(targetGroup, nobleSeats, mat.nobleGreen, mat.timber, 0.84);
    addInstancedSeatGroup(targetGroup, benchSeats, mat.benchOak, mat.timber, 0.78);

    // Narrow Royal Canopy Valance along the back crest of the Royal Box center bay
    const canopyW = baySpacing * 1.45;
    const canopyZ = backZ - sideSign * 0.24;
    addBox(targetGroup, canopyW, 0.14, 0.44, mat.wine, 0, 2.22, canopyZ, true);
    addBox(targetGroup, canopyW + 0.08, 0.06, 0.48, mat.brassBright, 0, 2.31, canopyZ, false);
  }

  buildGrandstand(zoneGroups.northStand, -1);
  buildGrandstand(zoneGroups.southStand, 1);

  // ── 4. NORTH & SOUTH REAR T-SHAPED ROYAL PAVILION ENTRANCES ────────────────
  // Exact SVG:
  //   North: M180 34V20m-5 0h10  => stem Z = -5.85..-7.25, crossbar X = -0.5..+0.5 at Z = -7.25
  //   South: M180 151v14m-5 0h10 => stem Z = +5.85..+7.25, crossbar X = -0.5..+0.5 at Z = +7.25
  for (const sideSign of [-1, 1]) {
    const pavGroup = zoneGroups.pavilions;
    const stemStart = sideSign * 5.85;
    const stemEnd = sideSign * 7.25;
    const stemMid = (stemStart + stemEnd) / 2;
    const stemLen = Math.abs(stemEnd - stemStart);

    // Raised stone & brass ceremonial causeway (the stem of the "T")
    addBox(pavGroup, 0.46, 0.28, stemLen, mat.stone, 0, 0.14, stemMid, true);
    addBox(pavGroup, 0.30, 0.05, stemLen + 0.04, mat.wine, 0, 0.30, stemMid, false);
    addBox(pavGroup, 0.08, 0.07, stemLen, mat.brassBright, -0.22, 0.31, stemMid, false);
    addBox(pavGroup, 0.08, 0.07, stemLen, mat.brassBright, 0.22, 0.31, stemMid, false);

    // Twin-Pier Heraldic Entry Gatehouse (the crossbar of the "T" at Z = ±7.25)
    const gateZ = stemEnd;
    addBox(pavGroup, 1.18, 0.26, 0.36, mat.stone, 0, 0.13, gateZ, true);
    for (const gx of [-0.46, 0.46]) {
      addBox(pavGroup, 0.26, 1.38, 0.28, mat.stoneDark, gx, 0.72, gateZ, true);
      addBox(pavGroup, 0.30, 0.09, 0.32, mat.brass, gx, 1.44, gateZ, false);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 4), mat.brassBright);
      spire.position.set(gx, 1.62, gateZ);
      spire.rotation.y = Math.PI / 4;
      pavGroup.add(spire);
    }
    // Crossbar arch lintel with royal crest
    addBox(pavGroup, 1.18, 0.22, 0.24, mat.timber, 0, 1.24, gateZ, true);
    addBox(pavGroup, 1.24, 0.08, 0.28, mat.brassBright, 0, 1.38, gateZ, false);
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), mat.brassBright);
    crest.position.set(0, 1.56, gateZ);
    pavGroup.add(crest);
  }

  // ── 5. WEST & EAST PROCESSIONAL ARROWS (EXACT FLANKING PLACEMENTS) ─────────
  // West arrow: M45 58v68 + M38 64l7-9 7 9  => X = -13.5, Z = -3.45..+3.35, pointing North (-Z)
  // East arrow: M315 58v68 + M308 120l7 9 7-9 => X = +13.5, Z = -3.45..+3.35, pointing South (+Z)
  zoneGroups.lanes.add(createArrowMesh(toX(45), toZ(58), toZ(126), -1, mat));
  zoneGroups.lanes.add(createArrowMesh(toX(315), toZ(58), toZ(126), 1, mat));

  // Subtle zone highlight overlays (revealed when hovering legend chips)
  const highlights = {};
  const addZoneHighlight = (key, w, d, x, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.highlightMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.095, z);
    mesh.visible = false;
    root.add(mesh);
    highlights[key] = mesh;
  };
  addZoneHighlight('lists', 24.8, 6.1, 0, 0);
  addZoneHighlight('northStand', 21.4, 2.9, 0, -4.75);
  addZoneHighlight('southStand', 21.4, 2.9, 0, 4.75);
  addZoneHighlight('pavilions', 2.2, 15.2, 0, 0);
  addZoneHighlight('lanes', 29.4, 8.8, 0, 0);

  return {
    root,
    guidesGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    metadata: {
      title: 'The Tourney of the Silver Lance',
      venue: 'The Royal Lists · Silverlance Grounds',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Royal Box',
        lists: 'Jousting Lane',
      },
      zones: [
        { key: 'lists', label: 'The Royal Lists & Tilt', color: '#e3c786', preset: 'lists' },
        { key: 'northStand', label: 'North Stand (150 Seats)', color: '#7d3038', preset: 'royal' },
        { key: 'southStand', label: 'South Stand (150 Seats)', color: '#3b6a4d', preset: 'isometric' },
        { key: 'pavilions', label: 'Royal T-Gate Pavilions', color: '#cdc4ad', preset: 'top' },
        { key: 'lanes', label: 'West Entry / East Exit', color: '#d8b468', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 23.8, 21.5], target: [0, 0.25, 0.2] },
      isometric: { pos: [10.5, 19.5, 22.8], target: [0, 0.35, 0] },
      top: { pos: [0, 33.5, 0.02], target: [0, 0, 0] },
      royal: { pos: [0, 4.2, -6.4], target: [0, 0.55, 1.8] },
      lists: { pos: [-13.6, 2.4, 1.45], target: [2.2, 0.5, 0] },
    },
  };
}

/**
 * Builds The Royal Lists configured for Battle of the Five Banners (Grand Melee).
 * Identical architectural footprint & placements to the blueprint, dressed in deep
 * oxblood/winter-twilight heraldry with the five house war-banners, fortified
 * melee stockades, glowing braziers, and the central battle line.
 */
function buildFiveBannersVenue() {
  const root = new THREE.Group();
  const baseMat = makeMaterials();
  const mat = {
    ...baseMat,
    ground: new THREE.MeshStandardMaterial({ color: 0x351e26, roughness: 0.92, metalness: 0.05 }),
    plinthEdge: new THREE.MeshStandardMaterial({ color: 0xdfb97a, roughness: 0.34, metalness: 0.66 }),
    turf: new THREE.MeshStandardMaterial({ color: 0x3d3336, roughness: 0.92, metalness: 0.04 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x867567, roughness: 0.95, metalness: 0.03 }),
    sandLane: new THREE.MeshStandardMaterial({ color: 0x736256, roughness: 0.96, metalness: 0.03 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xbcb2a6, roughness: 0.84, metalness: 0.06 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x706466, roughness: 0.86, metalness: 0.08 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x432f28, roughness: 0.8, metalness: 0.08 }),
    timberLight: new THREE.MeshStandardMaterial({ color: 0x624538, roughness: 0.78, metalness: 0.08 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x36363c, roughness: 0.48, metalness: 0.72 }),
    ember: new THREE.MeshStandardMaterial({ color: 0xffa640, emissive: 0xff6b1a, emissiveIntensity: 1.5, roughness: 0.35 }),
  };

  // The Five Great Houses of the Melee
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
    northStand: new THREE.Group(),
    southStand: new THREE.Group(),
    pavilions: new THREE.Group(),
    lanes: new THREE.Group(),
  };

  Object.values(zoneGroups).forEach(g => root.add(g));
  root.add(guidesGroup);

  function addBrazier(parent, x, y, z, scale = 1) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.08 * scale, 0.14 * scale, 8), mat.iron);
    bowl.position.set(x, y, z);
    bowl.castShadow = true;
    parent.add(bowl);

    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.095 * scale), mat.ember.clone());
    flame.position.set(x, y + 0.11 * scale, z);
    flame.scale.set(0.85, 1.35, 0.85);
    parent.add(flame);
    animatedEmbers.push({ mesh: flame, baseY: flame.position.y, phase: x * 1.1 + z * 0.9 });
  }

  function addWarStandard(parent, x, z, poleH, houseMat, dirAngle = 0, big = false) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, poleH, 8), mat.iron);
    pole.position.set(x, poleH / 2 + 0.12, z);
    pole.castShadow = true;
    parent.add(pole);

    // Crossbar & brass spearhead finial
    addBox(parent, 0.06, 0.05, big ? 0.56 : 0.34, mat.brassBright, x, poleH + 0.02, z, false);
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24, 4), mat.brassBright);
    spear.position.set(x, poleH + 0.22, z);
    parent.add(spear);

    // Swallowtail war-banner flag
    const w = big ? 0.92 : 0.62;
    const h = big ? 0.28 : 0.18;
    const shape = new THREE.Shape();
    shape.moveTo(0, h);
    shape.lineTo(w, h * 0.72);
    shape.lineTo(w * 0.72, 0);
    shape.lineTo(w, -h * 0.72);
    shape.lineTo(0, -h);
    shape.closePath();

    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), houseMat.clone());
    flag.position.set(x, poleH - (big ? 0.28 : 0.16), z);
    flag.rotation.y = dirAngle;
    parent.add(flag);
    animatedPennants.push({ mesh: flag, baseY: dirAngle, phase: x * 0.8 + z * 0.6 });
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

  const gridMat = new THREE.LineBasicMaterial({ color: 0xe7cf98, transparent: true, opacity: 0.09 });
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

  // Center Crosshairs & Corner Drafting Brackets + Scale Bar + Compass Arrow
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

  // ── 2. CENTRAL GRAND MELEE FIELD ("THE ROYAL LISTS") ───────────────────────
  // Exact SVG rect: x=59..301 (w=242 => 24.2), y=65..120 (h=55 => 5.5)
  const listsW = 24.2;
  const listsD = 5.5;
  const listsX1 = toX(59);
  const listsX2 = toX(301);
  const listsZ1 = toZ(65);
  const listsZ2 = toZ(120);
  const listsGroup = zoneGroups.lists;

  // Weathered winter melee field with central tactical clash earth
  addBox(listsGroup, listsW, 0.06, listsD, mat.turf, 0, 0.03, 0, false);
  addBox(listsGroup, listsW - 0.65, 0.08, listsD - 0.65, mat.sand, 0, 0.045, 0, false);
  addBox(listsGroup, 20.6, 0.088, 3.6, mat.sandLane, 0, 0.048, 0, false);

  // Iron-banded timber palisade perimeter fence (exact 24.2 x 5.5 footprint)
  const fenceH = 0.62;
  addBox(listsGroup, listsW + 0.16, 0.16, 0.22, mat.stoneDark, 0, 0.08, listsZ1, true);
  addBox(listsGroup, listsW + 0.16, 0.16, 0.22, mat.stoneDark, 0, 0.08, listsZ2, true);
  addBox(listsGroup, 0.22, 0.16, listsD + 0.16, mat.stoneDark, listsX1, 0.08, 0, true);
  addBox(listsGroup, 0.22, 0.16, listsD + 0.16, mat.stoneDark, listsX2, 0.08, 0, true);

  for (const ry of [0.28, 0.50]) {
    addBox(listsGroup, listsW, 0.085, 0.10, mat.timber, 0, ry, listsZ1, true);
    addBox(listsGroup, listsW, 0.085, 0.10, mat.timber, 0, ry, listsZ2, true);
    addBox(listsGroup, 0.10, 0.085, listsD, mat.timber, listsX1, ry, 0, true);
    addBox(listsGroup, 0.10, 0.085, listsD, mat.timber, listsX2, ry, 0, true);
  }
  addBox(listsGroup, listsW + 0.12, 0.06, 0.13, mat.brassBright, 0, fenceH, listsZ1, false);
  addBox(listsGroup, listsW + 0.12, 0.06, 0.13, mat.brassBright, 0, fenceH, listsZ2, false);
  addBox(listsGroup, 0.13, 0.06, listsD + 0.12, mat.brassBright, listsX1, fenceH, 0, false);
  addBox(listsGroup, 0.13, 0.06, listsD + 0.12, mat.brassBright, listsX2, fenceH, 0, false);

  const postStepX = listsW / 16;
  for (let i = 0; i <= 16; i++) {
    const px = listsX1 + i * postStepX;
    const isCorner = i === 0 || i === 16;
    const isAccent = isCorner || i % 4 === 0;
    for (const pz of [listsZ1, listsZ2]) {
      addBox(listsGroup, isCorner ? 0.24 : 0.14, fenceH + (isAccent ? 0.16 : 0.04), isCorner ? 0.24 : 0.14, mat.iron, px, (fenceH + (isAccent ? 0.16 : 0.04)) / 2, pz, true);
      if (isCorner) {
        addBrazier(listsGroup, px, fenceH + 0.22, pz, 0.9);
      } else if (isAccent) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.18, 4), mat.brass);
        cap.position.set(px, fenceH + 0.24, pz);
        cap.rotation.y = Math.PI / 4;
        listsGroup.add(cap);
      }
    }
  }
  for (let j = 1; j <= 3; j++) {
    const pz = listsZ1 + (listsD / 4) * j;
    for (const px of [listsX1, listsX2]) {
      addBox(listsGroup, 0.14, fenceH + 0.04, 0.14, mat.iron, px, (fenceH + 0.04) / 2, pz, true);
    }
  }

  // West & East Melee Starting Stockades (exact SVG: M75 70v45 and M285 70v45)
  const gateZLen = 4.5;
  for (const [gx, houseIdxA, houseIdxB] of [[toX(75), 0, 1], [toX(285), 2, 4]]) {
    addBox(listsGroup, 0.18, 0.06, gateZLen, mat.brassBright, gx, 0.08, 0, false);
    addBox(listsGroup, 0.16, 0.48, gateZLen, mat.iron, gx, 0.29, 0, true);
    addBox(listsGroup, 0.18, 0.06, gateZLen + 0.06, mat.brass, gx, 0.56, 0, false);

    for (const [gz, hIdx] of [[-2.22, houseIdxA], [2.22, houseIdxB]]) {
      addBox(listsGroup, 0.28, 1.05, 0.28, mat.stoneDark, gx, 0.52, gz, true);
      addBrazier(listsGroup, gx, 1.10, gz, 0.85);
      addWarStandard(listsGroup, gx + (gx < 0 ? -0.32 : 0.32), gz, 2.15, fiveHouses[hIdx], gx < 0 ? 0 : Math.PI, false);
    }
  }

  // Central Battle Line (exact SVG: M71 92h218 => X = -10.9..+10.9, Z = 0)
  // Low tactical battle-line stone & iron divider topped with gleaming brass + the FIVE HOUSE WAR-BANNERS!
  const tiltLen = 21.8;
  const tiltZ = toZ(92);
  addBox(listsGroup, tiltLen, 0.10, 0.34, mat.stoneDark, 0, 0.09, tiltZ, true);
  addBox(listsGroup, tiltLen, 0.22, 0.18, mat.iron, 0, 0.24, tiltZ, true);
  addBox(listsGroup, tiltLen + 0.08, 0.06, 0.22, mat.brassBright, 0, 0.38, tiltZ, false);

  // Five Proud House War-Banners arrayed along the central melee line (5 Houses, 1 Field)
  const bannerPositions = [
    { x: -8.6, house: 1, h: 2.35, dir: 0.18 },   // Sapphire (West Outer)
    { x: -4.4, house: 2, h: 2.45, dir: 0.10 },   // Emerald (West Inner)
    { x: 0.0, house: 0, h: 2.95, dir: 0.0 },     // Crimson Sovereign Center Banner
    { x: 4.4, house: 3, h: 2.45, dir: Math.PI - 0.10 }, // Aurelia Gold (East Inner)
    { x: 8.6, house: 4, h: 2.35, dir: Math.PI - 0.18 }, // Iron Plum (East Outer)
  ];
  for (const b of bannerPositions) {
    // Small stone & brass banner plinth
    addBox(listsGroup, 0.42, 0.24, 0.42, mat.stoneDark, b.x, 0.22, tiltZ, true);
    addBox(listsGroup, 0.46, 0.05, 0.46, mat.brass, b.x, 0.36, tiltZ, false);
    addWarStandard(listsGroup, b.x, tiltZ, b.h, fiveHouses[b.house], b.dir, b.x === 0);
  }

  // Opposing Center Melee Charge Chevrons (exact SVG: M167 88l11 4-11 4 and M193 88l-11 4 11 4)
  const clashY = 0.46;
  const chevronLen = Math.hypot(1.1, 0.4);
  const chevronAngle = Math.atan2(0.4, 1.1);

  const clashRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.84, 32), mat.brassBright);
  clashRing.rotation.x = -Math.PI / 2;
  clashRing.position.set(0, 0.11, tiltZ);
  listsGroup.add(clashRing);

  for (const dir of [-1, 1]) {
    const tipX = dir * 0.2;
    const tailX = dir * 1.3;
    const midX = (tipX + tailX) / 2;
    for (const sideZ of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(chevronLen, 0.11, 0.13), mat.brassBright);
      wing.position.set(midX, clashY, tiltZ + sideZ * 0.2);
      wing.rotation.y = dir * sideZ * chevronAngle;
      wing.castShadow = true;
      listsGroup.add(wing);
    }
    // Miniature tilted heraldic battle shields flanking the central clash
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.07), fiveHouses[dir < 0 ? 1 : 3]);
    shield.position.set(dir * 1.75, 0.34, tiltZ + (dir < 0 ? -0.78 : 0.78));
    shield.rotation.y = dir < 0 ? Math.PI * 0.35 : -Math.PI * 0.35;
    shield.castShadow = true;
    listsGroup.add(shield);
  }

  // ── 3. NORTH & SOUTH GRANDSTANDS (13 SQUARE BAYS EACH · FIVE-HOUSE SEATING) ─
  // Exact SVG:
  //   North: M77 34h206v22H77z  => X = -10.3..+10.3, Z = -5.85..-3.65
  //   South: M77 129h206v22H77z => X = -10.3..+10.3, Z = +3.65..+5.85
  function buildMeleeStand(targetGroup, sideSign) {
    const standW = 20.6;
    const standD = 2.2;
    const centerZ = sideSign * 4.75;
    const frontZ = centerZ - sideSign * (standD / 2);
    const backZ = centerZ + sideSign * (standD / 2);

    addBox(targetGroup, standW, 0.36, standD, mat.stoneDark, 0, 0.18, centerZ, true);
    addBox(targetGroup, standW + 0.08, 0.06, 0.11, mat.brassBright, 0, 0.39, frontZ, false);
    addBox(targetGroup, standW + 0.08, 0.06, 0.11, mat.brassBright, 0, 0.39, backZ, false);
    addBox(targetGroup, 0.11, 0.06, standD + 0.08, mat.brassBright, -standW / 2, 0.39, centerZ, false);
    addBox(targetGroup, 0.11, 0.06, standD + 0.08, mat.brassBright, standW / 2, 0.39, centerZ, false);

    const tiers = [
      { offset: -0.62, depth: 0.56, height: 0.52 },
      { offset: 0.0, depth: 0.58, height: 0.86 },
      { offset: 0.64, depth: 0.62, height: 1.22 },
    ];
    for (const t of tiers) {
      addBox(targetGroup, standW - 0.32, t.height, t.depth, mat.timber, 0, t.height / 2 + 0.12, centerZ + sideSign * t.offset, true);
    }

    // Battlemented dark-stone rear parapet wall
    addBox(targetGroup, standW, 1.76, 0.20, mat.stoneDark, 0, 0.88, backZ - sideSign * 0.06, true);
    addBox(targetGroup, standW + 0.08, 0.09, 0.26, mat.brass, 0, 1.80, backZ - sideSign * 0.06, false);
    for (const endX of [-standW / 2 + 0.10, standW / 2 - 0.10]) {
      addBox(targetGroup, 0.20, 1.44, standD, mat.stoneDark, endX, 0.72, centerZ, true);
      addBrazier(targetGroup, endX, 1.50, backZ - sideSign * 0.12, 0.85);
    }

    // Front iron-and-timber balustrade facing the melee field
    addBox(targetGroup, standW - 0.1, 0.44, 0.11, mat.iron, 0, 0.56, frontZ + sideSign * 0.08, true);
    addBox(targetGroup, standW, 0.06, 0.14, mat.brassBright, 0, 0.80, frontZ + sideSign * 0.08, false);

    // 13 Square Seating Bays grouped across the Five Houses (40 seats per stand = 80 total)
    const bayCount = 13;
    const baySpacing = 1.52;
    const bayW = 0.98;
    const bayD = 1.06;
    const bayZ = centerZ;
    const facingRotY = sideSign < 0 ? 0 : Math.PI;
    const houseSeatBuckets = [[], [], [], [], []];

    for (let i = 0; i < bayCount; i++) {
      const bx = (i - (bayCount - 1) / 2) * baySpacing;
      const distCenter = Math.abs(i - 6);
      const isMarshal = distCenter <= 1; // Central 3 bays = High Marshal's Tribune
      const houseIdx = isMarshal ? 0 : (i < 3 ? 1 : (i < 5 ? 2 : (i < 10 ? 3 : 4)));
      const seatMat = fiveHouses[houseIdx];

      // Stepped faction risers inside each square bay
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 0.69, bayZ - sideSign * 0.34, true);
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 1.03, bayZ, true);
      addBox(targetGroup, bayW - 0.14, 0.10, 0.26, mat.timberLight, bx, 1.37, bayZ + sideSign * 0.34, true);

      // Exact 40 seats per stand (12 bays × 3 seats + center bay × 4 seats = 40; 80 total across both stands)
      if (i === 6) {
        for (const [dx, rowOff, ry] of [[-0.22, -0.26, 0.80], [0.22, -0.26, 0.80], [-0.22, 0.26, 1.24], [0.22, 0.26, 1.24]]) {
          houseSeatBuckets[houseIdx].push({ x: bx + dx, y: ry, z: bayZ + sideSign * rowOff, rotY: facingRotY });
        }
      } else {
        for (const [dx, rowOff, ry] of [[-0.22, -0.34, 0.79], [0.0, 0, 1.13], [0.22, 0.34, 1.47]]) {
          houseSeatBuckets[houseIdx].push({ x: bx + dx, y: ry, z: bayZ + sideSign * rowOff, rotY: facingRotY });
        }
      }

      // Crisp square bay dividers & brass rim (exact 13 boxes from top-down view)
      const frameH = isMarshal ? 1.60 : 1.48;
      const frameY = frameH / 2 + 0.14;
      addBox(targetGroup, 0.09, frameH * 0.65, bayD, mat.timberLight, bx - bayW / 2, frameY - 0.12, bayZ, true);
      addBox(targetGroup, 0.09, frameH * 0.65, bayD, mat.timberLight, bx + bayW / 2, frameY - 0.12, bayZ, true);

      const rimY = isMarshal ? 1.56 : 1.46;
      const rimMat = isMarshal ? mat.brassBright : mat.brass;
      addBox(targetGroup, bayW + 0.04, 0.06, 0.08, rimMat, bx, rimY, bayZ - bayD / 2, false);
      addBox(targetGroup, bayW + 0.04, 0.06, 0.08, rimMat, bx, rimY, bayZ + bayD / 2, false);
      addBox(targetGroup, 0.08, 0.06, bayD + 0.04, rimMat, bx - bayW / 2, rimY, bayZ, false);
      addBox(targetGroup, 0.08, 0.06, bayD + 0.04, rimMat, bx + bayW / 2, rimY, bayZ, false);

      // Five-house tall rear war pennants along the stand ridge
      if (i % 2 === 0 || isMarshal) {
        const postH = isMarshal ? 2.62 : 2.30;
        const postZ = backZ - sideSign * 0.12;
        addWarStandard(targetGroup, bx, postZ, postH, fiveHouses[houseIdx], sideSign < 0 ? Math.PI * 0.12 : -Math.PI * 0.88, false);
      }
    }

    // Render all 40 individual faction seats on this stand (80 total across North & South)
    houseSeatBuckets.forEach((bucket, idx) => {
      addInstancedSeatGroup(targetGroup, bucket, fiveHouses[idx], mat.iron, 1.15);
    });

    // Compact Marshal's Tribune Canopy Valance along back ridge of central 3 bays
    const canopyW = baySpacing * 3.1;
    const canopyZ = backZ - sideSign * 0.24;
    addBox(targetGroup, canopyW, 0.16, 0.44, fiveHouses[0], 0, 2.26, canopyZ, true);
    addBox(targetGroup, canopyW + 0.1, 0.06, 0.48, mat.brassBright, 0, 2.36, canopyZ, false);
  }

  buildMeleeStand(zoneGroups.northStand, -1);
  buildMeleeStand(zoneGroups.southStand, 1);

  // ── 4. NORTH & SOUTH REAR T-SHAPED BATTLE GATEHOUSES ───────────────────────
  // Exact SVG: M180 34V20m-5 0h10 and M180 151v14m-5 0h10
  for (const sideSign of [-1, 1]) {
    const pavGroup = zoneGroups.pavilions;
    const stemStart = sideSign * 5.85;
    const stemEnd = sideSign * 7.25;
    const stemMid = (stemStart + stemEnd) / 2;
    const stemLen = Math.abs(stemEnd - stemStart);

    // Fortified approach causeway (stem of the "T")
    addBox(pavGroup, 0.48, 0.28, stemLen, mat.stone, 0, 0.14, stemMid, true);
    addBox(pavGroup, 0.30, 0.05, stemLen + 0.04, fiveHouses[0], 0, 0.30, stemMid, false);
    addBox(pavGroup, 0.08, 0.07, stemLen, mat.brassBright, -0.23, 0.31, stemMid, false);
    addBox(pavGroup, 0.08, 0.07, stemLen, mat.brassBright, 0.23, 0.31, stemMid, false);

    // Crenelated Twin-Tower Battle Gatehouse (crossbar of the "T" at Z = ±7.25)
    const gateZ = stemEnd;
    addBox(pavGroup, 1.24, 0.28, 0.40, mat.stone, 0, 0.14, gateZ, true);
    for (const gx of [-0.48, 0.48]) {
      addBox(pavGroup, 0.30, 1.48, 0.32, mat.stoneDark, gx, 0.76, gateZ, true);
      addBox(pavGroup, 0.34, 0.09, 0.36, mat.brass, gx, 1.52, gateZ, false);
      addBrazier(pavGroup, gx, 1.62, gateZ, 0.78);
    }
    addBox(pavGroup, 1.22, 0.24, 0.26, mat.iron, 0, 1.28, gateZ, true);
    addBox(pavGroup, 1.28, 0.08, 0.30, mat.brassBright, 0, 1.42, gateZ, false);
  }

  // ── 5. WEST & EAST PROCESSIONAL MARCH ARROWS ───────────────────────────────
  // Exact SVG: West x=45 pointing North (-Z), East x=315 pointing South (+Z)
  zoneGroups.lanes.add(createArrowMesh(toX(45), toZ(58), toZ(126), -1, mat));
  zoneGroups.lanes.add(createArrowMesh(toX(315), toZ(58), toZ(126), 1, mat));

  const highlights = {};
  const addZoneHighlight = (key, w, d, x, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.highlightMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.095, z);
    mesh.visible = false;
    root.add(mesh);
    highlights[key] = mesh;
  };
  addZoneHighlight('lists', 24.8, 6.1, 0, 0);
  addZoneHighlight('northStand', 21.4, 2.9, 0, -4.75);
  addZoneHighlight('southStand', 21.4, 2.9, 0, 4.75);
  addZoneHighlight('pavilions', 2.2, 15.2, 0, 0);
  addZoneHighlight('lanes', 29.4, 8.8, 0, 0);

  return {
    root,
    guidesGroup,
    zoneGroups,
    highlights,
    animatedPennants,
    animatedEmbers,
    lighting: {
      hemiSky: 0xdce5f2,
      hemiGround: 0x2d1820,
      hemiIntensity: 0.92,
      sunColor: 0xffe2be,
      sunIntensity: 1.55,
      rimColor: 0x99b3d4,
      rimIntensity: 0.72,
    },
    metadata: {
      title: 'Battle of the Five Banners',
      venue: 'The Royal Lists · Grand Melee Field',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Marshal’s Tribune',
        lists: 'Battlefield Level',
      },
      zones: [
        { key: 'lists', label: 'Melee Field & Five Banners', color: '#e3c786', preset: 'lists' },
        { key: 'northStand', label: 'North Stand · 40 Field Seats', color: '#992e3b', preset: 'royal' },
        { key: 'southStand', label: 'South Stand · 40 Field Seats', color: '#2c527a', preset: 'isometric' },
        { key: 'pavilions', label: 'T-Gate Battle Towers', color: '#bcb2a6', preset: 'top' },
        { key: 'lanes', label: 'West Entry / East Exit', color: '#cfa03e', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 23.8, 21.5], target: [0, 0.25, 0.2] },
      isometric: { pos: [10.5, 19.5, 22.8], target: [0, 0.35, 0] },
      top: { pos: [0, 33.5, 0.02], target: [0, 0, 0] },
      royal: { pos: [0, 4.4, -6.5], target: [0, 0.65, 1.6] },
      lists: { pos: [-13.6, 2.5, 1.55], target: [2.2, 0.65, 0] },
    },
  };
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

  // ── 3. GROUNDLING STANDING PROMENADE (rx=7.4..9.1, rz=3.1..4.3) ────────────
  // Exact SVG Ring 2: rx=91, ry=43
  addEllipticalRing(zoneGroups.groundling, 9.10, 4.30, 7.52, 3.20, 0.82, 0.0, mat.stone, 96);
  addEllipticalRing(zoneGroups.groundling, 9.05, 4.26, 8.35, 3.74, 0.22, 0.82, mat.stoneLight, 96);
  addBrassEllipseRim(zoneGroups.groundling, 9.1, 4.3, 1.06, 0.11, 0.07);

  // ── 4. NOBLE STAND RING (rx=9.1..10.3, rz=4.3..5.2) · 60 EXACT SEATS ───────
  // Exact SVG Ring 3: rx=103, ry=52 (12 wedges × 5 seats = 60 Noble seats)
  addEllipticalRing(zoneGroups.noble, 10.30, 5.20, 9.10, 4.30, 1.48, 0.0, mat.stoneDark, 96);
  addEllipticalRing(zoneGroups.noble, 9.72, 4.76, 9.14, 4.34, 0.22, 1.32, mat.steelBlue, 96);
  addEllipticalRing(zoneGroups.noble, 10.28, 5.18, 9.74, 4.78, 0.24, 1.54, mat.steelBlue, 96);
  addBrassEllipseRim(zoneGroups.noble, 10.3, 5.2, 1.80, 0.11, 0.07);

  // ── 5. COMMONER'S BENCH TIERS (rx=10.3..12.5, rz=5.2..6.9) · 240 SEATS ─────
  // Exact SVG Ring 4: rx=115, ry=61 & Ring 5: rx=125, ry=69 (12 wedges × 20 seats = 240 seats)
  addEllipticalRing(zoneGroups.commoner, 11.50, 6.10, 10.30, 5.20, 2.18, 0.0, mat.stone, 96);
  addEllipticalRing(zoneGroups.commoner, 10.92, 5.66, 10.34, 5.24, 0.22, 2.02, mat.benchOak, 96);
  addEllipticalRing(zoneGroups.commoner, 11.48, 6.08, 10.94, 5.68, 0.24, 2.24, mat.benchOak, 96);
  addBrassEllipseRim(zoneGroups.commoner, 11.5, 6.1, 2.50, 0.11, 0.07);

  addEllipticalRing(zoneGroups.commoner, 12.50, 6.90, 11.50, 6.10, 2.86, 0.0, mat.stoneDark, 108);
  addEllipticalRing(zoneGroups.commoner, 12.18, 6.66, 11.54, 6.14, 0.22, 2.74, mat.benchOak, 108);

  // Place exact individual seats cleanly inside the 12 elliptical wedges between radial aisles:
  //   60 Noble seats (12 wedges × [2 inner + 3 outer])
  //   240 Commoner seats (12 wedges × [5 + 5 lower ring + 5 + 5 upper ring])
  const colNobleSeats = [];
  const colCommonerSeats = [];
  const wedgeStep = (Math.PI * 2) / 12;
  const pushEllipticRow = (bucket, rx, rz, y, countPerWedge) => {
    for (let w = 0; w < 12; w++) {
      const a0 = w * wedgeStep + 0.10;
      const a1 = (w + 1) * wedgeStep - 0.10;
      for (let s = 0; s < countPerWedge; s++) {
        const t = countPerWedge === 1 ? 0.5 : (s + 0.5) / countPerWedge;
        const theta = a0 + (a1 - a0) * t;
        const sx = cx + Math.cos(theta) * rx;
        const sz = cz + Math.sin(theta) * rz;
        // Face inward toward the arena pit center (cx, cz)
        const rotY = Math.atan2(cx - sx, cz - sz);
        bucket.push({ x: sx, y, z: sz, rotY });
      }
    }
  };
  pushEllipticRow(colNobleSeats, 9.42, 4.54, 1.60, 2);
  pushEllipticRow(colNobleSeats, 9.98, 4.96, 1.84, 3);
  pushEllipticRow(colCommonerSeats, 10.62, 5.44, 2.30, 5);
  pushEllipticRow(colCommonerSeats, 11.18, 5.86, 2.54, 5);
  pushEllipticRow(colCommonerSeats, 11.72, 6.28, 3.01, 5);
  pushEllipticRow(colCommonerSeats, 12.02, 6.52, 3.03, 5);

  addInstancedSeatGroup(zoneGroups.noble, colNobleSeats, mat.steelBlue, mat.brassBright, 1.35);
  addInstancedSeatGroup(zoneGroups.commoner, colCommonerSeats, mat.benchOak, mat.iron, 1.12);

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
  addEllipticalHighlight('groundling', 9.08, 4.28, 7.45, 3.14, 1.12);
  addEllipticalHighlight('noble', 10.28, 5.18, 9.12, 4.32, 1.86);
  addEllipticalHighlight('commoner', 12.18, 6.66, 10.32, 5.22, 3.04);
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
      venue: 'The Iron Colosseum · Arena District',
      presetLabels: {
        isometric: '3D Isometric',
        top: 'Top-Down Plan',
        royal: 'Noble Stand',
        lists: 'Arena Floor',
      },
      zones: [
        { key: 'arena', label: 'Arena Pit & Duel Marks', color: '#e3c786', preset: 'lists' },
        { key: 'groundling', label: 'Groundling Rail (150 Standing)', color: '#c9c6bc', preset: 'lists' },
        { key: 'noble', label: 'Noble Stand Ring (60 Seats)', color: '#305066', preset: 'royal' },
        { key: 'commoner', label: 'Commoner’s Tiers (240 Seats)', color: '#8d714f', preset: 'isometric' },
        { key: 'wall', label: 'Iron Curtain Wall & Braziers', color: '#677278', preset: 'top' },
      ],
    },
    presets: {
      card: { pos: [0.0, 23.2, 20.8], target: [0, 0.75, 0.05] },
      isometric: { pos: [10.4, 18.8, 21.6], target: [0, 0.85, 0.05] },
      top: { pos: [0, 33.5, 0.07], target: [0, 0, 0.05] },
      royal: { pos: [0, 5.4, -10.2], target: [0, 0.45, 0.8] },
      lists: { pos: [-5.6, 1.85, 0.05], target: [2.6, 1.15, 0.05] },
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

  return {
    root,
    guidesGroup,
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

class Venue3DViewer {
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
      sun.shadow.camera.far = 65;
      const d = 19;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
    }
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(light.rimColor ?? 0x9fc2a7, light.rimIntensity ?? 0.55);
    rim.position.set(-16, 10, -14);
    this.scene.add(rim);

    const w = Math.max(container.clientWidth, 240);
    const h = Math.max(container.clientHeight, 180);
    const fov = mode === 'card' || mode === 'emblem' ? 35 : 37;
    this.camera = new THREE.PerspectiveCamera(fov, w / h, 0.2, 120);

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
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 3.6;
    this.controls.maxDistance = 56;
    this.controls.enableZoom = mode === 'showcase' || mode === 'modal';
    this.controls.enablePan = mode === 'showcase' || mode === 'modal';
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.85;
    this.controls.update();

    this.bindEvents();
    this.renderOnce();
    this.startLoop();
  }

  bindEvents() {
    const el = this.renderer.domElement;

    this.onPointerDown = e => {
      this.dragMoved = false;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.activeTransition = null;
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
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderOnce();
  }

  setPreset(name) {
    const targetPreset = this.venue.presets[name];
    if (!targetPreset) return;
    const toPos = new THREE.Vector3(...targetPreset.pos);
    const toTarget = new THREE.Vector3(...targetPreset.target);
    if (REDUCED_MOTION) {
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

  setGuidesVisible(visible) {
    this.venue.guidesGroup.visible = visible;
    this.renderOnce();
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled && !REDUCED_MOTION;
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

      if (this.activeTransition) {
        this.activeTransition.progress = Math.min(1, this.activeTransition.progress + dt * 2.4);
        const t = 1 - Math.pow(1 - this.activeTransition.progress, 3);
        this.camera.position.lerpVectors(this.activeTransition.fromPos, this.activeTransition.toPos, t);
        this.controls.target.lerpVectors(this.activeTransition.fromTarget, this.activeTransition.toTarget, t);
        if (this.activeTransition.progress >= 1) this.activeTransition = null;
      }

      if (!REDUCED_MOTION) {
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
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.renderer?.domElement?.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.container?.removeEventListener('click', this.onClickCapture, true);
    if (this.onEnter) this.container.removeEventListener('pointerenter', this.onEnter);
    if (this.onLeave) this.container.removeEventListener('pointerleave', this.onLeave);
    this.controls?.dispose();
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
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}

function wireToolbarControls(rootEl, viewer) {
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

  if (tableBar) {
    const tableViews = viewer.venue?.metadata?.tableViews;
    if (tableViews?.length) {
      tableBar.hidden = false;
      tableBar.innerHTML = `<span class="venue-3d-tables-label">View table</span>${tableViews.map(t =>
        `<button type="button" class="venue-table-btn" data-table-view="${t.key}" title="${t.label} (${t.seats})">${t.label}</button>`
      ).join('')}<button type="button" class="venue-table-btn table-reset" data-table-reset>All Tables</button>`;

      tableBar.querySelectorAll('[data-table-view]').forEach(btn => {
        const key = btn.getAttribute('data-table-view');
        btn.addEventListener('pointerenter', () => viewer.highlightZone(key));
        btn.addEventListener('pointerleave', () => viewer.highlightZone(lockedZone));
        btn.addEventListener('click', () => {
          const wasActive = btn.classList.contains('active');
          clearTableActive();
          rootEl.querySelectorAll('.venue-zone-chip').forEach(c => c.classList.remove('active'));
          if (!wasActive) {
            btn.classList.add('active');
            lockedZone = key;
            presetButtons.forEach(b => b.classList.remove('active'));
            viewer.highlightZone(key);
            viewer.setPreset(key);
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

  function openModal(slug) {
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
      if (titleEl) titleEl.textContent = activeViewer.venue.metadata.title;
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
  const modalApi = initModal();

  // Mount inline 3D stages on cards, detail hero emblems, and detail showcase blocks
  document.querySelectorAll('[data-venue-3d]').forEach(stage => {
    const slug = stage.getAttribute('data-venue-3d');
    const mode = stage.getAttribute('data-venue-mode') || 'card';
    if (!VENUE_BUILDERS[slug]) return;
    try {
      const viewer = new Venue3DViewer(stage, slug, mode);
      const showcase = stage.closest('.venue-3d-showcase');
      if (showcase) wireToolbarControls(showcase, viewer);
    } catch (_err) {
      // WebGL unavailable — SVG blueprint remains gracefully visible.
    }
  });

  // Wire "Inspect 3D" trigger buttons on cards, emblems, and showcases
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-open-3d]');
    if (!trigger || !modalApi) return;
    e.preventDefault();
    e.stopPropagation();
    modalApi.openModal(trigger.getAttribute('data-open-3d'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
