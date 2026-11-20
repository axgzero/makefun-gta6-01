// traffic.js — ambient traffic: AI cars cruise the road grid, turn at intersections,
// brake for the car ahead, and honk when the player blocks them.
import * as THREE from 'three';
import { makeVehicle, driveVehicle } from './vehicles.js';
import { CITY, roadCoord, onRoad } from './city.js';
import { mulberry, clamp } from './physics.js';

const KINDS = ['sedan', 'sedan', 'taxi', 'sports', 'truck', 'van'];

export function spawnTraffic(G, count) {
  const rnd = mulberry(4242);
  const list = [];
  for (let i = 0; i < count; i++) {
    const alongX = rnd() < 0.5;
    const k = Math.floor(rnd() * (CITY.half * 2 + 1)) - CITY.half;
    const c = roadCoord(k);
    const t = (rnd() * 2 - 1) * (CITY.half * CITY.pitch);
    const x = alongX ? t : c + (rnd() < 0.5 ? -3 : 3);
    const z = alongX ? c + (rnd() < 0.5 ? -3 : 3) : t;
    const heading = alongX ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : (z < 0 ? 0 : Math.PI);
    // keep clear of the plaza and the player's start
    if (Math.hypot(x, z) < 24) continue;
    const kind = KINDS[Math.floor(rnd() * KINDS.length)];
    const v = makeVehicle(kind, x, z, heading);
    v.ai = {
      cruise: 9 + rnd() * 7,
      dir: alongX ? 'x' : 'z',
      sign: alongX ? (x < 0 ? 1 : -1) : (z < 0 ? 1 : -1),
      wait: 0,
    };
    v.group.visible = true;
    G.scene.add(v.group);
    list.push(v);
  }
  return list;
}

// One AI step: follow the current road; at an intersection, maybe turn.
export function updateTraffic(G, dt) {
  const span = CITY.half * CITY.pitch;
  for (const v of G.traffic) {
    const ai = v.ai;
    if (!ai) continue;
    if (ai.wait > 0) { ai.wait -= dt; continue; }
    // car ahead? brake.
    let blocked = false;
    const aheadX = v.pos.x + Math.sin(v.heading) * 9;
    const aheadZ = v.pos.z + Math.cos(v.heading) * 9;
    for (const o of G.vehicles) {
      if (o === v) continue;
      const dx = o.pos.x - aheadX, dz = o.pos.z - aheadZ;
      if (dx * dx + dz * dz < 30) { blocked = true; break; }
    }
    // player on foot in front? brake too.
    if (G.player.onFoot) {
      const dx = G.player.pos.x - aheadX, dz = G.player.pos.z - aheadZ;
      if (dx * dx + dz * dz < 25) blocked = true;
    }
    const throttle = blocked ? 0 : 0.55;
    const target = ai.cruise * (blocked ? 0 : 1);
    const input = { throttle: v.speed < target ? throttle : 0, steer: 0, handbrake: false };
    // steer back onto the road centre if drifting
    const c = ai.dir === 'x'
      ? Math.round(v.pos.z / CITY.pitch) * CITY.pitch + (ai.sign > 0 ? -3 : 3) * 0 + (v.pos.z > 0 ? 0 : 0)
      : Math.round(v.pos.x / CITY.pitch) * CITY.pitch;
    // lane offset: right-hand traffic
    const lane = ai.dir === 'x'
      ? Math.round(v.pos.z / CITY.pitch) * CITY.pitch + (ai.sign > 0 ? 3 : -3)
      : Math.round(v.pos.x / CITY.pitch) * CITY.pitch + (ai.sign > 0 ? -3 : 3);
    const lateral = ai.dir === 'x' ? lane - v.pos.z : lane - v.pos.x;
    const wantHeading = ai.dir === 'x'
      ? (ai.sign > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ai.sign > 0 ? 0 : Math.PI);
    let d = wantHeading - v.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    input.steer = clamp(d * 1.4 + lateral * 0.02, -1, 1);
    driveVehicle(v, input, dt, G.city.colliders, G.vehicles);

    // at an intersection, sometimes turn
    const nearX = Math.abs(((v.pos.x + CITY.pitch / 2) % CITY.pitch + CITY.pitch) % CITY.pitch - CITY.pitch / 2) < 4;
    const nearZ = Math.abs(((v.pos.z + CITY.pitch / 2) % CITY.pitch + CITY.pitch) % CITY.pitch - CITY.pitch / 2) < 4;
    if (nearX && nearZ && Math.random() < dt * 0.55) {
      const turn = Math.random();
      if (turn < 0.3) {
        // turn left or right: swap axis, keep position on the grid
        if (ai.dir === 'x') {
          ai.dir = 'z';
          ai.sign = Math.random() < 0.5 ? 1 : -1;
          v.heading = ai.sign > 0 ? 0 : Math.PI;
        } else {
          ai.dir = 'x';
          ai.sign = Math.random() < 0.5 ? 1 : -1;
          v.heading = ai.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      } else if (turn < 0.36) {
        ai.wait = 1.5 + Math.random() * 2; // pause at the lights
      }
    }
    // despawn far away, respawn near the player so streets stay alive
    if (Math.abs(v.pos.x) > span + 60 || Math.abs(v.pos.z) > span + 60 || !onRoad(v.pos.x, v.pos.z)) {
      const k = Math.floor(Math.random() * (CITY.half * 2 + 1)) - CITY.half;
      const alongX = Math.random() < 0.5;
      const t = (Math.random() * 2 - 1) * span;
      const cc = roadCoord(k);
      v.pos.set(alongX ? t : cc + 3, 0, alongX ? cc + 3 : t);
      v.heading = alongX ? (t < 0 ? Math.PI / 2 : -Math.PI / 2) : (t < 0 ? 0 : Math.PI);
      v.speed = 6;
      ai.dir = alongX ? 'x' : 'z';
      ai.sign = alongX ? (t < 0 ? 1 : -1) : (t < 0 ? 1 : -1);
    }
  }
}

// Nearest drivable car to a point (for E to steal), excluding police in a chase.
export function nearestCar(G, x, z, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const v of G.vehicles) {
    if (v.player) continue;
    const dx = v.pos.x - x, dz = v.pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
