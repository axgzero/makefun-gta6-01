// vehicles.js — car models built from boxes, and arcade driving physics.
// A vehicle is { group, pos, heading, speed, kind, color, police, player, ai, health, steer }.
import * as THREE from 'three';
import { clamp, resolveCircle, angleDelta } from './physics.js';

const CAR_COLORS = [0xc73e3e, 0x3e6fc7, 0xd8c13c, 0xeeeeee, 0x222226, 0x3ea86f, 0xc77b3e, 0x7a4fc7];

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

export function buildCarMesh(kind, color) {
  const g = new THREE.Group();
  g.name = 'car-' + kind;
  const body = box(2.0, 0.62, 4.4, color, 0, 0.62, 0);
  g.add(body);
  const cabinColor = kind === 'taxi' ? 0xf2c230 : color;
  const cabin = box(1.7, 0.55, kind === 'truck' ? 1.1 : 2.1, kind === 'sports' ? 0x14161f : 0x1c2733, 0, 1.18, kind === 'truck' ? 1.4 : -0.15);
  g.add(cabin);
  if (kind === 'truck') {
    g.add(box(1.9, 1.5, 2.4, 0x8a8f96, 0, 1.15, -0.9));
  }
  if (kind === 'sports') {
    g.add(box(1.9, 0.1, 0.5, 0x14161f, 0, 1.05, -2.1)); // spoiler
  }
  if (kind === 'taxi') {
    g.add(box(0.9, 0.22, 0.5, 0x222226, 0, 1.55, -0.15)); // roof sign
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  // headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.66, 2.22);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.66, -2.22);
    g.add(tl);
  }
  if (kind === 'police') {
    // black-and-white livery + light bar
    body.material = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    g.add(box(2.02, 0.3, 2.2, 0x14161f, 0, 0.62, -0.9));
    const bar = box(1.2, 0.18, 0.4, 0x222226, 0, 1.52, -0.15);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.32, 1.52, -0.15);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.set(0.32, 1.52, -0.15);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeVehicle(kind, x, z, heading, color) {
  const group = buildCarMesh(kind, color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    group, kind, color,
    pos: new THREE.Vector3(x, 0, z),
    heading, speed: 0, steer: 0,
    police: kind === 'police',
    player: false, ai: null,
    health: 100, smoke: 0, horn: 0,
  };
}

// Arcade drive step. input: { throttle (-1..1), steer (-1..1), handbrake }.
// Returns true when the car hit something hard (for damage/sound).
export function driveVehicle(v, input, dt, colliders, others) {
  const specs = {
    sedan: { accel: 16, top: 34, brake: 30, grip: 2.4 },
    taxi: { accel: 15, top: 32, brake: 30, grip: 2.4 },
    sports: { accel: 22, top: 46, brake: 34, grip: 2.9 },
    truck: { accel: 11, top: 26, brake: 24, grip: 2.0 },
    police: { accel: 19, top: 40, brake: 34, grip: 2.8 },
    van: { accel: 13, top: 29, brake: 26, grip: 2.2 },
  }[v.kind] || { accel: 16, top: 34, brake: 30, grip: 2.4 };

  if (input.throttle > 0) v.speed += specs.accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (v.speed > 0.5) v.speed -= specs.brake * dt;
    else v.speed += specs.accel * 0.55 * input.throttle * dt; // reverse
  }
  // drag + rolling resistance
  v.speed -= v.speed * (input.handbrake ? 2.4 : 0.55) * dt;
  if (Math.abs(v.speed) < 0.05 && input.throttle === 0) v.speed = 0;
  v.speed = clamp(v.speed, -12, specs.top);

  const steerTarget = clamp(input.steer, -1, 1);
  v.steer += (steerTarget - v.steer) * Math.min(1, dt * 8);
  const turnRate = v.steer * specs.grip * clamp(Math.abs(v.speed) / 12, 0, 1) * (input.handbrake ? 1.7 : 1);
  v.heading += (v.speed >= 0 ? turnRate : -turnRate) * dt * Math.sign(v.speed || 1);

  const nx = v.pos.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.pos.z + Math.cos(v.heading) * v.speed * dt;
  const res = resolveCircle(nx, nz, 1.9, colliders);
  let crashed = false;
  if (res.hit) {
    if (Math.abs(v.speed) > 12) crashed = true;
    v.speed *= 0.45;
  }
  // soft car-car push
  for (const o of others) {
    if (o === v) continue;
    const dx = res.x - o.pos.x, dz = res.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 14 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (3.8 - d) / 2;
      res.x += (dx / d) * push;
      res.z += (dz / d) * push;
      if (Math.abs(v.speed) > 10) crashed = true;
      v.speed *= 0.85;
    }
  }
  v.pos.x = res.x; v.pos.z = res.z;
  v.group.position.set(v.pos.x, 0, v.pos.z);
  v.group.rotation.y = v.heading;
  // wheel spin + steering visual
  const spin = v.speed * dt * 2.2;
  for (const w of v.group.userData.wheels || []) w.rotation.x += spin;
  v.group.rotation.z = -v.steer * 0.03 * clamp(Math.abs(v.speed) / 20, 0, 1);
  if (v.health < 45) v.smoke += dt;
  return crashed;
}

// Steer a vehicle toward a target point (used by police + traffic when chasing).
export function steerToward(v, tx, tz, throttle, dt, colliders, others) {
  const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
  const d = angleDelta(v.heading, want);
  return driveVehicle(v, { throttle, steer: clamp(d * 1.6, -1, 1), handbrake: Math.abs(d) > 2.2 }, dt, colliders, others);
}
