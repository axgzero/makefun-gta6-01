// police.js — the wanted system and the Solmarina PD.
// Stars rise with crimes, fall when the player stays out of sight; police cars ram,
// foot cops chase on foot, and getting caught (or killed) ends the run — for now.
import * as THREE from 'three';
import { makeVehicle, steerToward, driveVehicle } from './vehicles.js';
import { CITY } from './city.js';
import { dist2, clamp } from './physics.js';
import { buildPedMesh } from './pedestrians.js';

export function addWanted(G, stars, reason) {
  if (G.player.wanted >= 5) return;
  G.player.wanted = clamp(G.player.wanted + stars, 0, 5);
  G.wanted.hiddenT = 0;
  G.wanted.lastCrime = reason || 'crime';
  if (G.player.wanted >= 3) G.audio.setSiren(true);
  G.hud.flashHint(reason ? `WANTED — ${reason}` : 'WANTED LEVEL UP');
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const p = G.player;
  // how many police can actually see the player?
  let seen = false;
  for (const c of G.policeCars) {
    if (dist2(c.pos.x, c.pos.z, p.pos.x, p.pos.z) < 3600) { seen = true; break; }
  }
  for (const c of G.cops) {
    if (dist2(c.pos.x, c.pos.z, p.pos.x, p.pos.z) < 1600) { seen = true; break; }
  }
  if (p.wanted > 0 && !seen) {
    w.hiddenT += dt;
    if (w.hiddenT > 9) {
      p.wanted = Math.max(0, p.wanted - 1);
      w.hiddenT = 0;
      if (p.wanted === 0) G.audio.setSiren(false);
    }
  } else {
    w.hiddenT = 0;
  }
  // spawn police cars up to the wanted level's cap
  const wantCars = p.wanted === 0 ? 0 : Math.min(1 + p.wanted, 5);
  while (G.policeCars.length < wantCars) spawnPoliceCar(G);
  while (G.policeCars.length > wantCars) {
    const c = G.policeCars.pop();
    G.scene.remove(c.group);
    const i = G.vehicles.indexOf(c);
    if (i >= 0) G.vehicles.splice(i, 1);
  }
  // foot cops when the player is on foot and wanted
  const wantCops = (!p.onFoot && p.wanted >= 2) || (p.onFoot && p.wanted >= 1)
    ? Math.min(p.wanted, 4) : 0;
  while (G.cops.length < wantCops) spawnCop(G);
  while (G.cops.length > wantCops) {
    const c = G.cops.pop();
    G.scene.remove(c.group);
  }
  // chase behaviour
  for (const car of G.policeCars) {
    const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
    if (d > 260) {
      // too far: teleport the pursuit back into range behind the player
      const a = Math.atan2(p.pos.x - car.pos.x, p.pos.z - car.pos.z) + Math.PI;
      car.pos.set(p.pos.x + Math.sin(a) * 70, 0, p.pos.z + Math.cos(a) * 70);
      car.speed = 10;
    }
    const crashed = steerToward(car, p.pos.x, p.pos.z, 1, dt, G.city.colliders, G.vehicles);
    if (crashed) G.audio.crash();
    // ramming the player hurts
    if (d < 4.5 && Math.abs(car.speed) > 6) {
      damagePlayer(G, 8 * dt * 10, 'rammed by the PD');
    }
    // light-bar flash
    const t = performance.now() / 120;
    const on = Math.sin(t) > 0;
    if (car.group.userData.lightRed) car.group.userData.lightRed.visible = on;
    if (car.group.userData.lightBlue) car.group.userData.lightBlue.visible = !on;
    // busted: cop alongside a stopped player car
    if (!p.onFoot && Math.abs(car.speed) < 2 && Math.abs(p.car.speed) < 1 && d < 5) {
      w.bustT += dt;
      if (w.bustT > 2.5) endRun(G, 'busted');
    } else {
      w.bustT = Math.max(0, w.bustT - dt * 2);
    }
  }
  for (const cop of G.cops) {
    const d = Math.hypot(p.pos.x - cop.pos.x, p.pos.z - cop.pos.z);
    const speed = d > 12 ? 5.2 : 4.2;
    cop.heading = Math.atan2(p.pos.x - cop.pos.x, p.pos.z - cop.pos.z);
    cop.pos.x += Math.sin(cop.heading) * speed * dt;
    cop.pos.z += Math.cos(cop.heading) * speed * dt;
    cop.group.position.set(cop.pos.x, 0, cop.pos.z);
    cop.group.rotation.y = cop.heading;
    const sw = Math.sin(performance.now() / 90) * 0.7;
    cop.group.userData.armL.rotation.x = sw;
    cop.group.userData.armR.rotation.x = -sw;
    if (p.onFoot && d < 1.6) {
      w.bustT += dt;
      if (w.bustT > 1.6) endRun(G, 'busted');
    }
  }
}

function spawnPoliceCar(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const x = THREE.MathUtils.clamp(p.pos.x + Math.sin(a) * 60, -220, 220);
  const z = THREE.MathUtils.clamp(p.pos.z + Math.cos(a) * 60, -220, 220);
  const car = makeVehicle('police', x, z, Math.atan2(p.pos.x - x, p.pos.z - z));
  car.ai = { police: true };
  G.scene.add(car.group);
  G.vehicles.push(car);
  G.policeCars.push(car);
}

function spawnCop(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const x = p.pos.x + Math.sin(a) * 26;
  const z = p.pos.z + Math.cos(a) * 26;
  const group = buildPedMesh(0x1c2f55, 0x14161f, 0xe8b98a);
  // police cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), new THREE.MeshLambertMaterial({ color: 0x1c2f55 }));
  cap.position.y = 1.78;
  group.add(cap);
  group.position.set(x, 0, z);
  G.scene.add(group);
  G.cops.push({ group, pos: new THREE.Vector3(x, 0, z), heading: 0 });
}

export function damagePlayer(G, amount, cause) {
  if (G.flags.gameOver || G.flags.paused) return;
  G.player.health -= amount;
  G.player.lastHurt = G.time;
  G.hud.hurtFlash();
  if (G.player.health <= 0) {
    G.player.health = 0;
    endRun(G, 'wasted', cause);
  }
}

export function endRun(G, kind, cause) {
  if (G.flags.gameOver) return;
  G.flags.gameOver = true;
  G.audio.setSiren(false);
  G.audio.setEngine(0, false);
  if (kind === 'busted') G.audio.fail();
  else G.audio.fail();
  G.hud.showEnd(kind, cause);
}
