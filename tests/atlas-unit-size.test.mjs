import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../static/vendor/three/three.module.min.js';

const sourceURL = new URL('../static/js/atlas3d.js', import.meta.url);

async function fixture() {
  const prev = {document: globalThis.document, matchMedia: globalThis.matchMedia, Path2D: globalThis.Path2D};
  const grad = {addColorStop() {}};
  const ctx = new Proxy({measureText: () => ({width: 100}), createLinearGradient: () => grad, createRadialGradient: () => grad},
    {get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true)});
  globalThis.document = {readyState: 'loading', documentElement: {classList: {contains: () => false}}, addEventListener() {}, createElement: () => ({width: 256, height: 256, getContext: () => ctx})};
  globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  globalThis.Path2D = class {};
  let source = fs.readFileSync(sourceURL, 'utf8').replace(/\r\n/g, '\n');
  source = source.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, q, p) => `from ${q}${new URL(p, sourceURL).href}${q}`);
  source += '\nexport {buildLivingArmies as testArmies, buildTerritorySystem as testTerritory};\n';
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const root = new THREE.Group();
  const territory = mod.testTerritory(root);
  const armies = mod.testArmies(root, territory);
  return {
    armies,
    dispose() {
      const resources = new Set();
      root.traverse(o => {
        if (o.geometry) resources.add(o.geometry);
        for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
          resources.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
        }
      });
      resources.forEach(r => r.dispose());
      root.clear();
      Object.assign(globalThis, prev);
    },
  };
}

test('live unit size presets scale living and undead armies while keeping unique units intact', async () => {
  const f = await fixture();
  const {armies} = f;
  const countLiving = () => armies.units.filter(u => u.alive && u.team < 4 && u.type !== 'hero').length;
  const countUndead = () => armies.units.filter(u => u.alive && u.team === 4 && u.type !== 'skarbrand').length;
  try {
    assert.equal(armies.getUnitSize(), 'medium');
    const initialMedium = countLiving();
    const livingCounts = {};
    for (const preset of ['ultra', 'high', 'medium', 'low']) {
      armies.setUnitSize(preset);
      armies.update(1 / 60, 0.016);
      assert.equal(armies.getUnitSize(), preset);
      livingCounts[preset] = countLiving();
      assert.equal(armies.units.filter(u => u.alive && u.type === 'king').length, 4);
      assert.equal(armies.units.filter(u => u.alive && u.type === 'mage').length, 4);
      assert.equal(armies.units.filter(u => u.alive && u.type === 'siege').length, 4);
    }
    assert.ok(livingCounts.low < livingCounts.medium && livingCounts.medium < livingCounts.high && livingCounts.high < livingCounts.ultra);
    assert.equal(livingCounts.medium, initialMedium);

    armies.setUnitSize('low');
    armies.triggerInvasion();
    armies.skipWave();
    armies.skipWave();
    armies.update(1 / 60, 0.05);
    const lowW2 = countUndead();
    armies.setUnitSize('ultra');
    armies.update(1 / 60, 0.07);
    const ultraW2 = countUndead();
    assert.ok(lowW2 > 0 && lowW2 < ultraW2 && ultraW2 <= 840);
    assert.equal(armies.getInvasionState().wave2UndeadTotal, 840);
  } finally {
    f.dispose();
  }
});
