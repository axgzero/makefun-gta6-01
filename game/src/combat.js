// combat.js — pistol hitscan, fists, enemy shooters and tracers.
// Enemies are mission gang members; they take cover poorly and shoot badly on purpose.
import * as THREE from 'three';
import { buildPedMesh } from './pedestrians.js';
import { dist2 } from './physics.js';
import { addWanted, damagePlayer } from './police.js';

export function createCombat(G) {
  return {
    shotsFiredAt: -100,
    tracers: [],
    enemies: [],
    muzzle: null,
  };
}

export function spawnEnemy(G, x, z, hp = 100) {
  const group = buildPedMesh(0x222226, 0x2a2a30, 0xc98a5b);
  // red bandana = Los Tiburones
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0xc72222 }));
  band.position.y = 1.72;
  group.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111214 }));
  gun.position.set(0.3, 1.15, 0.3);
  group.add(gun);
  group.position.set(x, 0, z);
  G.scene.add(group);
  const e = { group, pos: new THREE.Vector3(x, 0, z), heading: 0, hp, shootT: 1 + Math.random(), strafe: Math.random() * 10 };
  G.combat.enemies.push(e);
  return e;
}

export function clearEnemies(G) {
  for (const e of G.combat.enemies) G.scene.remove(e.group);
  G.combat.enemies.length = 0;
}

// Player fires the pistol toward the camera centre (or mouse point).
export function playerShoot(G) {
  const p = G.player;
  if (p.weapon !== 'pistol' || p.ammo <= 0) {
    if (p.weapon === 'pistol') G.audio.click();
    return;
  }
  p.ammo -= 1;
  G.combat.shotsFiredAt = G.time;
  G.audio.gunshot();
  if (p.wanted < 2) addWanted(G, 1, 'shots fired');
  // Shoot from the player's chest along the camera's forward direction
  // (a ray from the camera itself would plunge into the ground past the player).
  // Forgiving hit test: the shot lands when the ray passes within 0.85 m of a
  // target's chest — a thin raycast would miss a strafing target too often.
  const origin = p.pos.clone();
  origin.y = p.pos.y + 1.2;
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const chestAt = (v) => new THREE.Vector3(v.pos.x, v.pos.y + 1.2, v.pos.z);
  let best = null, bestT = 120;
  const consider = (obj, kind) => {
    const c = chestAt(obj);
    const rel = c.clone().sub(origin);
    const t = rel.dot(dir);
    if (t < 1 || t > 120) return;
    const closest = origin.clone().add(dir.clone().multiplyScalar(t));
    if (closest.distanceTo(c) < 1.1 && t < bestT) { bestT = t; best = { obj, kind }; }
  };
  for (const e of G.combat.enemies) consider(e, 'enemy');
  for (const c of G.cops) consider(c, 'cop');
  for (const ped of G.peds) consider(ped, 'ped');
  let end = origin.clone().add(dir.clone().multiplyScalar(120));
  if (best) {
    end = chestAt(best.obj);
    if (best.kind === 'enemy') {
      const e = best.obj;
      e.hp -= 34;
      spawnHitSparks(G, end);
      if (e.hp <= 0) killEnemy(G, e);
    } else if (best.kind === 'ped') {
      const ped = best.obj;
      addWanted(G, 1, 'civilian down');
      G.peds.splice(G.peds.indexOf(ped), 1);
      G.scene.remove(ped.group);
      spawnHitSparks(G, end);
    }
  }
  addTracer(G, origin.clone(), end);
  G.hud.muzzleFlash();
  G.cameraShake = Math.min(0.35, (G.cameraShake || 0) + 0.14);
}

export function playerPunch(G) {
  const p = G.player;
  G.audio.punch();
  G.combat.shotsFiredAt = G.time;
  let hitAny = false;
  const range = 2.2;
  for (const e of [...G.combat.enemies]) {
    if (dist2(e.pos.x, e.pos.z, p.pos.x, p.pos.z) < range * range) {
      e.hp -= 25;
      hitAny = true;
      spawnHitSparks(G, e.pos.clone().setY(1.2));
      if (e.hp <= 0) killEnemy(G, e);
    }
  }
  if (!hitAny) {
    // punching a nearby ped counts too
    for (const ped of [...G.peds]) {
      if (dist2(ped.pos.x, ped.pos.z, p.pos.x, p.pos.z) < range * range) {
        addWanted(G, 1, 'assault');
        G.peds.splice(G.peds.indexOf(ped), 1);
        G.scene.remove(ped.group);
        break;
      }
    }
  }
}

function killEnemy(G, e) {
  const i = G.combat.enemies.indexOf(e);
  if (i >= 0) G.combat.enemies.splice(i, 1);
  spawnHitSparks(G, e.pos.clone().setY(1.2));
  // fall over, then fade out
  e.group.rotation.x = -Math.PI / 2;
  e.group.position.y = 0.3;
  setTimeout(() => G.scene.remove(e.group), 2500);
  G.mission.onEnemyKilled?.(e);
}

function spawnHitSparks(G, at) {
  const geo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 10; i++) {
    pts.push(at.x + (Math.random() - 0.5), at.y + (Math.random() - 0.5), at.z + (Math.random() - 0.5));
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd94d, size: 0.35 }));
  G.scene.add(m);
  setTimeout(() => G.scene.remove(m), 350);
}

function addTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.combat.tracers.push({ line, t: 0 });
}

export function updateCombat(G, dt) {
  // tracer fade
  for (const t of [...G.combat.tracers]) {
    t.t += dt;
    t.line.material.opacity = Math.max(0, 0.9 - t.t * 9);
    if (t.t > 0.12) {
      G.scene.remove(t.line);
      G.combat.tracers.splice(G.combat.tracers.indexOf(t), 1);
    }
  }
  // enemies: strafe, shoot at the player with loose aim
  const p = G.player;
  for (const e of [...G.combat.enemies]) {
    const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    e.strafe += dt;
    e.heading = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    e.group.rotation.y = e.heading;
    if (d > 26) {
      e.pos.x += Math.sin(e.heading) * 3.4 * dt;
      e.pos.z += Math.cos(e.heading) * 3.4 * dt;
    } else if (d < 8) {
      e.pos.x -= Math.sin(e.heading) * 2 * dt;
      e.pos.z -= Math.cos(e.heading) * 2 * dt;
    } else {
      const side = Math.sin(e.strafe * 0.7) > 0 ? 1 : -1;
      e.pos.x += Math.cos(e.heading) * side * 1.5 * dt;
      e.pos.z -= Math.sin(e.heading) * side * 1.5 * dt;
    }
    e.group.position.set(e.pos.x, 0, e.pos.z);
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 46 && !G.flags.gameOver) {
      e.shootT = 1.1 + Math.random() * 1.3;
      G.audio.enemyShot();
      addTracer(G, e.pos.clone().setY(1.3), p.pos.clone().setY(1.2 + (Math.random() - 0.5) * 1.6));
      // loose aim: closer = likelier to hit
      if (Math.random() < 0.20 * (1 - d / 60)) {
        damagePlayer(G, 4 + Math.random() * 5, 'shot by Los Tiburones');
      }
    }
  }
}
