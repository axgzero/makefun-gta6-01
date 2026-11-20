// city.js — builds Solmarina: a road grid, procedural buildings with lit windows,
// palms, streetlights, a beach with water, a dockside and a downtown core.
// The same constants drive the minimap, traffic and missions, so the world agrees.
import * as THREE from 'three';
import { facadeTexture, roadTexture, sidewalkTexture, sandTexture, waterTexture, billboardTexture } from './textures.js';
import { mulberry } from './physics.js';

export const CITY = {
  pitch: 52,        // distance between road centrelines
  road: 12,         // road width
  half: 4,          // roads at k*pitch for k in [-half..half]
  block: 40,        // block size (pitch - road)
  landMinX: -280, landMaxX: 340,
  landMinZ: -280, landMaxZ: 310,
};

export function roadCoord(k) { return k * CITY.pitch; }

// Is (x,z) on a road (within the drivable asphalt)?
export function onRoad(x, z) {
  const half = CITY.road / 2 + 1;
  const rx = Math.abs(((x + CITY.pitch / 2) % CITY.pitch + CITY.pitch) % CITY.pitch - CITY.pitch / 2);
  const rz = Math.abs(((z + CITY.pitch / 2) % CITY.pitch + CITY.pitch) % CITY.pitch - CITY.pitch / 2);
  const inX = Math.abs(x) <= CITY.half * CITY.pitch + half;
  const inZ = Math.abs(z) <= CITY.half * CITY.pitch + half;
  return (rx < half && inZ) || (rz < half && inX);
}

export function buildCity(scene) {
  const rnd = mulberry(1337);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Land slab and sea. Water sits just below the land so the beach edge reads.
  const land = new THREE.Mesh(
    new THREE.BoxGeometry(CITY.landMaxX - CITY.landMinX, 2, CITY.landMaxZ - CITY.landMinZ),
    new THREE.MeshLambertMaterial({ color: 0x66704f })
  );
  land.position.set((CITY.landMinX + CITY.landMaxX) / 2, -1, (CITY.landMinZ + CITY.landMaxZ) / 2);
  land.receiveShadow = true;
  group.add(land);

  const waterTex = waterTexture();
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(24, 24);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  group.add(water);

  // Sand on the east beach and the south shore.
  const sandTex = sandTexture();
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(10, 10);
  const sandMat = new THREE.MeshLambertMaterial({ map: sandTex });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(110, CITY.landMaxZ - CITY.landMinZ), sandMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(285, 0.02, 15);
  beach.receiveShadow = true;
  group.add(beach);
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(CITY.landMaxX - CITY.landMinX, 46), sandMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(30, 0.02, 287);
  group.add(shore);

  // Roads: asphalt strips with dashed centre lines, plus sidewalks.
  const roadTexH = roadTexture('h');
  roadTexH.wrapS = roadTexH.wrapT = THREE.RepeatWrapping;
  const roadTexV = roadTexture('v');
  roadTexV.wrapS = roadTexV.wrapT = THREE.RepeatWrapping;
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV });
  const walkTex = sidewalkTexture();
  walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
  const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  const span = CITY.half * 2 * CITY.pitch + CITY.road;
  for (let k = -CITY.half; k <= CITY.half; k++) {
    const c = roadCoord(k);
    roadTexH.repeat.set(span / 12, 1);
    roadTexV.repeat.set(1, span / 12);
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.road), roadMatH);
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.05, c); rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, span), roadMatV);
    rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.05, 0); rz.receiveShadow = true;
    group.add(rz);
    // sidewalks hug both sides of each road
    for (const off of [-CITY.road / 2 - 2.5, CITY.road / 2 + 2.5]) {
      const sx = new THREE.Mesh(new THREE.PlaneGeometry(span, 5), walkMat);
      sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.04, c + off);
      group.add(sx);
      const sz = new THREE.Mesh(new THREE.PlaneGeometry(5, span), walkMat);
      sz.rotation.x = -Math.PI / 2; sz.position.set(c + off, 0.04, 0);
      group.add(sz);
    }
  }

  // Buildings, one block at a time. Downtown (near 0,0) goes tall.
  const palette = ['#c96f4a', '#d9a05b', '#7a8ba0', '#b0a08a', '#8a6f8e', '#5b7a6f', '#a8574e', '#6f7fa8'];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let seed = 11;
  for (let i = -CITY.half; i < CITY.half; i++) {
    for (let j = -CITY.half; j < CITY.half; j++) {
      const cx = i * CITY.pitch + CITY.pitch / 2;
      const cz = j * CITY.pitch + CITY.pitch / 2;
      // paved lot under the block so streets read as city, not desert
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(CITY.block, CITY.block), walkMat);
      lot.rotation.x = -Math.PI / 2;
      lot.position.set(cx, 0.03, cz);
      lot.receiveShadow = true;
      group.add(lot);
      if (Math.abs(cx) < 30 && Math.abs(cz) < 30) continue; // central plaza
      const downtown = Math.max(0, 1 - Math.hypot(cx, cz) / 260);
      const count = rnd() < 0.45 ? 1 : rnd() < 0.7 ? 2 : 4;
      for (let b = 0; b < count; b++) {
        const w = count === 1 ? 34 : count === 2 ? 16 : 15;
        const d = count === 1 ? 34 : count === 2 ? 34 : 15;
        const ox = count === 1 ? 0 : count === 2 ? (b === 0 ? -9 : 9) : (b % 2 === 0 ? -9 : 9);
        const oz = count === 1 ? 0 : count === 2 ? 0 : (b < 2 ? -9 : 9);
        const h = 8 + rnd() * (10 + downtown * 52);
        const mat = new THREE.MeshLambertMaterial({
          map: facadeTexture(seed++, palette[Math.floor(rnd() * palette.length)], Math.max(2, Math.round(h / 7)), 0.45),
        });
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d);
        m.position.set(cx + ox, h / 2, cz + oz);
        group.add(m);
        // flat roof cap
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
        roof.scale.set(w + 0.6, 0.5, d + 0.6);
        roof.position.set(cx + ox, h + 0.25, cz + oz);
        group.add(roof);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
      }
    }
  }

  // Central plaza: fountain + palms + benches, the story's home base.
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 24), new THREE.MeshLambertMaterial({ color: 0x6fc7d8 }));
  plaza.position.set(0, 0.6, 0);
  group.add(plaza);
  colliders.push({ minX: -9, maxX: 9, minZ: -9, maxZ: 9 });

  // Palms along the beach road and the plaza.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  function palm(x, z) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    t.position.set(x, 3.5, z);
    group.add(t);
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 4), leafMat);
      const a = (k / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.8, 7.4, z + Math.sin(a) * 1.8);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      group.add(leaf);
    }
  }
  for (let z = -200; z <= 200; z += 26) { palm(226, z); palm(238, z + 13); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; palm(Math.cos(a) * 16, Math.sin(a) * 16); }

  // Streetlights along every avenue.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let k = -CITY.half; k <= CITY.half; k++) {
    for (let s = -3; s <= 3; s += 2) {
      const c = roadCoord(k);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
      pole.position.set(c + 7.5, 3.5, s * CITY.pitch + 8);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(c + 7.5, 7.1, s * CITY.pitch + 8);
      group.add(lamp);
    }
  }

  // Dockside, south: piers, containers, cranes.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6b5a44 });
  for (let p = -1; p <= 1; p++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 60), dockMat);
    pier.position.set(p * 60 - 60, 0.1, 300);
    group.add(pier);
    // low deck, no collider: the player walks onto it
  }
  const contColors = [0xc75b4e, 0x4e7ac7, 0x5ba85b, 0xc7a44e];
  for (let i = 0; i < 14; i++) {
    const cont = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: contColors[i % 4] }));
    const w = 12, h = 2.6, d = 2.6;
    const x = -150 + (i % 7) * 46, z = 252 + Math.floor(i / 7) * 10;
    cont.scale.set(w, h, d);
    cont.position.set(x, h / 2 + (i % 3) * 2.7, z);
    group.add(cont);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  // Cranes
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8b13c });
  for (const cx of [-100, 40]) {
    const tower = new THREE.Mesh(boxGeo, craneMat);
    tower.scale.set(3, 34, 3); tower.position.set(cx, 17, 262);
    group.add(tower);
    const arm = new THREE.Mesh(boxGeo, craneMat);
    arm.scale.set(3, 2.4, 40); arm.position.set(cx, 32, 282);
    group.add(arm);
    colliders.push({ minX: cx - 2, maxX: cx + 2, minZ: 260, maxZ: 264 });
  }

  // Beach billboard + a few beach umbrellas.
  const bb = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 13),
    new THREE.MeshBasicMaterial({ map: billboardTexture() })
  );
  bb.position.set(252, 9, 120);
  bb.rotation.y = -Math.PI / 2;
  group.add(bb);
  const bbPole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), poleMat);
  bbPole.position.set(253, 2, 120);
  group.add(bbPole);
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xff5a7a });
  for (let i = 0; i < 6; i++) {
    const umb = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 8), umbMat);
    umb.position.set(268 + (i % 3) * 14, 2.6, -140 + Math.floor(i / 3) * 30);
    group.add(umb);
  }

  scene.add(group);
  return { group, colliders };
}
