// pedestrians.js — sidewalk walkers who stroll, chat, and run when things go loud.
// A pedestrian is { group, pos, heading, speed, state, color, seed }.
import * as THREE from 'three';
import { CITY, roadCoord } from './city.js';
import { mulberry, resolveCircle, dist2 } from './physics.js';

const SHIRTS = [0xe8e8e8, 0x3e6fc7, 0xc73e3e, 0x3ea86f, 0xd8c13c, 0x7a4fc7, 0xe07b39, 0x39c7c7];
const PANTS = [0x22262e, 0x3a3f4a, 0x5b4a3a, 0x2a3a5b];

export function buildPedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.24), mat(pants));
  legs.position.y = 0.39;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), mat(shirt));
  torso.position.y = 1.09;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat(skin));
  head.position.y = 1.58;
  g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), mat(skin));
  armL.position.set(-0.33, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.33;
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legs = legs;
  return g;
}

export function spawnPedestrians(G, count) {
  const rnd = mulberry(777);
  const list = [];
  for (let i = 0; i < count; i++) {
    const alongX = rnd() < 0.5;
    const k = Math.floor(rnd() * (CITY.half * 2 + 1)) - CITY.half;
    const c = roadCoord(k);
    const t = (rnd() * 2 - 1) * (CITY.half * CITY.pitch);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = alongX ? t : c + side * (CITY.road / 2 + 2.5);
    const z = alongX ? c + side * (CITY.road / 2 + 2.5) : t;
    if (Math.hypot(x, z) < 20) continue;
    const shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    const pants = PANTS[Math.floor(rnd() * PANTS.length)];
    const skin = [0xe8b98a, 0xc98a5b, 0x8a5b3a, 0xf0c8a0][Math.floor(rnd() * 4)];
    const group = buildPedMesh(shirt, pants, skin);
    group.position.set(x, 0, z);
    G.scene.add(group);
    list.push({
      group,
      pos: new THREE.Vector3(x, 0, z),
      heading: rnd() * Math.PI * 2,
      speed: 0.9 + rnd() * 0.9,
      state: 'walk',
      seed: rnd() * 10,
      fleeT: 0,
    });
  }
  return list;
}

export function updatePedestrians(G, dt, time) {
  const player = G.player;
  const danger = G.combat.shotsFiredAt > time - 2.5;
  for (const p of G.peds) {
    // flee from the player when loud, or from a speeding car nearby
    let threat = null;
    if (danger) threat = player.pos;
    else {
      for (const v of G.vehicles) {
        if (Math.abs(v.speed) > 8 && dist2(v.pos.x, v.pos.z, p.pos.x, p.pos.z) < 100) {
          threat = v.pos;
          break;
        }
      }
    }
    if (threat) { p.state = 'flee'; p.fleeT = 2.5; }
    else if (p.fleeT > 0) { p.fleeT -= dt; if (p.fleeT <= 0) p.state = 'walk'; }

    const speed = p.state === 'flee' ? 4.6 : p.speed;
    if (p.state === 'flee' && threat) {
      p.heading = Math.atan2(p.pos.x - threat.x, p.pos.z - threat.z);
    } else if (Math.random() < dt * 0.06) {
      // amble: small heading wander, snap to sidewalk directions at intersections
      p.heading += (Math.random() - 0.5) * 1.2;
    }
    const nx = p.pos.x + Math.sin(p.heading) * speed * dt;
    const nz = p.pos.z + Math.cos(p.heading) * speed * dt;
    // stay on sidewalks: if the next step leaves the walk, turn around
    const res = resolveCircle(nx, nz, 0.4, G.city.colliders);
    p.pos.x = res.x; p.pos.z = res.z;
    if (res.hit) p.heading += Math.PI * 0.75;
    // keep inside the city
    if (Math.abs(p.pos.x) > CITY.half * CITY.pitch + 24 || Math.abs(p.pos.z) > CITY.half * CITY.pitch + 24) {
      p.heading += Math.PI;
    }
    p.group.position.set(p.pos.x, 0, p.pos.z);
    p.group.rotation.y = p.heading;
    // walk-cycle arm swing
    const sw = Math.sin(time * (p.state === 'flee' ? 11 : 6) + p.seed) * (p.state === 'flee' ? 0.8 : 0.45);
    p.group.userData.armL.rotation.x = sw;
    p.group.userData.armR.rotation.x = -sw;
    p.group.userData.legs.rotation.x = sw * 0.5;
  }
}
