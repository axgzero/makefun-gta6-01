// main.js — SOLMARINA boot + game loop.
// Wires every system together: city, traffic, pedestrians, police, combat,
// missions, HUD, audio and saves. Exposes window.__SOLMARINA for testing.
import * as THREE from 'three';
import { buildCity, CITY } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createCombat, updateCombat, playerShoot, playerPunch, clearEnemies } from './combat.js';
import { makeVehicle, driveVehicle } from './vehicles.js';
import { spawnTraffic, updateTraffic, nearestCar } from './traffic.js';
import { spawnPedestrians, updatePedestrians, buildPedMesh } from './pedestrians.js';
import { addWanted, updateWanted, damagePlayer } from './police.js';
import { createMissionState, startMission, updateMissions, nextMission, onEnemyKilled } from './missions.js';
import { loadSave, writeSave, snapshot, applySave, clearSave } from './save.js';
import { resolveCircle, clamp, angleDelta, dist2 } from './physics.js';

const LOWFX = new URLSearchParams(location.search).has('lowfx');
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: !LOWFX, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.domElement.className = 'game';
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff9e57);
scene.fog = new THREE.Fog(0xffb37a, 180, 700);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

// Golden-hour lighting: low warm sun from the west, soft sky fill.
const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
sun.position.set(-180, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 700;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4a3a, 0.9));
// visible sun disc + a few clouds for the skyline
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
sunDisc.position.set(-420, 150, 120);
sunDisc.lookAt(0, 40, 0);
scene.add(sunDisc);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe8d8, transparent: true, opacity: 0.85 });
for (const [cx, cy, cz, s] of [[-120, 150, -260, 30], [80, 170, -300, 40], [220, 140, 180, 26], [-260, 160, 220, 34], [40, 180, 260, 44]]) {
  const c = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
  c.scale.y = 0.32;
  c.position.set(cx, cy, cz);
  scene.add(c);
}

const G = {
  scene, camera, renderer,
  time: 0,
  city: null,
  vehicles: [], traffic: [], peds: [], cops: [], policeCars: [],
  player: null,
  wanted: { hiddenT: 0, lastCrime: '', bustT: 0 },
  mission: createMissionState(),
  combat: null, hud: null, audio: null, input: null,
  flags: { started: false, paused: false, gameOver: false },
  camYaw: Math.PI * 0.75, camPitch: 0.32, camDist: 8, camLock: false,
  cameraShake: 0,
  fps: 0,
};
G.combat = createCombat(G);
G.audio = createAudio();
G.hud = createHud(G);
G.input = createInput(renderer.domElement);
G.mission.onEnemyKilled = () => onEnemyKilled(G);

G.city = buildCity(scene);

// Player: Leo Marín, teal jacket, built from boxes like every ped.
const playerGroup = buildPedMesh(0x2f9e8f, 0x22262e, 0xe8b98a);
playerGroup.position.set(0, 0, 14);
scene.add(playerGroup);
G.player = {
  group: playerGroup,
  pos: new THREE.Vector3(0, 0, 14),
  heading: Math.PI,
  speed: 0, vy: 0, grounded: true,
  onFoot: true, car: null,
  health: 100, money: 250, wanted: 0, lastHurt: -100,
  weapon: 'fists', ammo: 12, reserve: 48,
  walkPhase: 0,
};

// A parked sports car on the avenue by the plaza so the first steal is quick.
const starterCar = makeVehicle('sports', 0, 30, 0, 0xc73e3e);
scene.add(starterCar.group);
G.vehicles.push(starterCar);
// a few parked cars along the avenues
for (const [x, z, kind, h] of [[3, -80, 'sedan', 0], [-3, 80, 'taxi', Math.PI], [3, 150, 'van', 0], [-3, -150, 'sedan', Math.PI], [80, 3, 'sports', Math.PI / 2]]) {
  const v = makeVehicle(kind, x, z, h);
  scene.add(v.group);
  G.vehicles.push(v);
}
G.traffic = spawnTraffic(G, 16);
G.vehicles.push(...G.traffic);
G.peds = spawnPedestrians(G, 26);

// Restore a save if one exists.
const saved = loadSave();
if (saved) {
  applySave(G, saved);
  G.player.group.position.copy(G.player.pos);
  document.getElementById('playBtn').textContent = `▶  CONTINUE — $${Math.round(G.player.money)} · ${G.mission.done.filter(Boolean).length}/5 JOBS`;
}

// ---- car enter / exit ----
function enterCar(car) {
  const p = G.player;
  p.onFoot = false;
  p.car = car;
  car.player = true;
  car.ai = null;
  const ti = G.traffic.indexOf(car);
  if (ti >= 0) G.traffic.splice(ti, 1);
  p.group.visible = false;
  G.camDist = 11;
  G.audio.click();
  const firstSteal = !G.mission.done[0] && G.mission.index === 0;
  if (!firstSteal) addWanted(G, car.police ? 2 : 1, car.police ? 'stole a police car' : 'car stolen');
  G.hud.flashHint(firstSteal ? 'Nice ride — now drive to Mara’s garage' : car.police ? 'You stole a PD cruiser. Bold.' : 'Car stolen — the PD will notice');
}

function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.player = false;
  const side = Math.cos(car.heading) > 0 ? 1 : -1;
  p.pos.set(car.pos.x + Math.cos(car.heading) * 2.4 * side, 0, car.pos.z - Math.sin(car.heading) * 2.4 * side);
  const res = resolveCircle(p.pos.x, p.pos.z, 0.6, G.city.colliders);
  p.pos.x = res.x; p.pos.z = res.z;
  p.heading = car.heading;
  p.onFoot = true;
  p.car = null;
  p.group.visible = true;
  p.group.position.copy(p.pos);
  G.camDist = 8;
}

// ---- on-foot movement ----
function updateOnFoot(dt) {
  const p = G.player;
  const inp = G.input;
  const fwd = { x: -Math.sin(G.camYaw), z: -Math.cos(G.camYaw) };
  const right = { x: -fwd.z, z: fwd.x };
  let mx = 0, mz = 0;
  if (inp.keys.has('KeyW') || inp.keys.has('ArrowUp')) { mx += fwd.x; mz += fwd.z; }
  if (inp.keys.has('KeyS') || inp.keys.has('ArrowDown')) { mx -= fwd.x; mz -= fwd.z; }
  if (inp.keys.has('KeyA') || inp.keys.has('ArrowLeft')) { mx -= right.x; mz -= right.z; }
  if (inp.keys.has('KeyD') || inp.keys.has('ArrowRight')) { mx += right.x; mz += right.z; }
  const len = Math.hypot(mx, mz);
  const sprint = inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight');
  const speed = sprint ? 8.2 : 4.8;
  if (len > 0) {
    mx /= len; mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    p.heading += angleDelta(p.heading, targetHeading) * Math.min(1, dt * 12);
    const nx = p.pos.x + mx * speed * dt;
    const nz = p.pos.z + mz * speed * dt;
    const res = resolveCircle(nx, nz, 0.55, G.city.colliders);
    p.pos.x = res.x; p.pos.z = res.z;
    p.walkPhase += dt * (sprint ? 13 : 9);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  // jump + gravity
  if (p.grounded && inp.keys.has('Space')) {
    p.vy = 8.5;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy -= 24 * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }
  // walk-cycle swing
  const sw = Math.sin(p.walkPhase) * (p.speed > 0 ? 0.55 : 0);
  p.group.userData.armL.rotation.x = sw;
  p.group.userData.armR.rotation.x = -sw;
  p.group.userData.legs.rotation.x = sw * 0.6;
  p.group.position.set(p.pos.x, p.pos.y, p.pos.z);
  p.group.rotation.y = p.heading;
  // nearby car prompt
  const near = nearestCar(G, p.pos.x, p.pos.z, 5);
  if (near) G.hud.flashHint('Press E to steal the ' + near.kind);
  if (inp.pressed('KeyE') && near) enterCar(near);
}

// ---- driving ----
function updateDriving(dt) {
  const p = G.player;
  const car = p.car;
  const inp = G.input;
  const throttle = (inp.keys.has('KeyW') || inp.keys.has('ArrowUp') ? 1 : 0)
    + (inp.keys.has('KeyS') || inp.keys.has('ArrowDown') ? -1 : 0);
  const steer = (inp.keys.has('KeyA') || inp.keys.has('ArrowLeft') ? -1 : 0)
    + (inp.keys.has('KeyD') || inp.keys.has('ArrowRight') ? 1 : 0);
  const handbrake = inp.keys.has('Space');
  let auto = null;
  if (car._auto && car._auto.t > 0) {
    auto = car._auto;
    auto.t -= dt;
  }
  const crashed = driveVehicle(car, {
    throttle: auto ? auto.throttle : throttle,
    steer: auto ? auto.steer : steer,
    handbrake: auto ? false : handbrake,
  }, dt, G.city.colliders, G.vehicles);
  if (crashed) {
    G.audio.crash();
    G.cameraShake = Math.min(0.5, G.cameraShake + 0.25);
    damagePlayer(G, 4, 'crash');
    if (car.health > 0) car.health -= 8;
  }
  p.pos.copy(car.pos);
  p.heading = car.heading;
  // running over a pedestrian is a crime
  for (const ped of [...G.peds]) {
    if (Math.abs(car.speed) > 6 && dist2(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z) < 7) {
      G.peds.splice(G.peds.indexOf(ped), 1);
      G.scene.remove(ped.group);
      addWanted(G, 1, 'hit and run');
      G.audio.crash();
    }
  }
  if (inp.pressed('KeyE')) exitCar();
  // auto-align the chase camera behind the car when the mouse is idle
  const now = performance.now();
  if (!G.camLock && now - lastMouseMove > 1600) {
    G.camYaw += angleDelta(G.camYaw, car.heading + Math.PI) * Math.min(1, dt * 1.4);
  }
}

// ---- camera ----
let lastMouseMove = 0;
function updateCamera(dt) {
  const p = G.player;
  const { dx, dy } = G.input.consumeMouse();
  if (dx !== 0 || dy !== 0) {
    G.camYaw -= dx * 0.0042;
    G.camPitch = clamp(G.camPitch + dy * 0.0022, 0.08, 1.15);
    lastMouseMove = performance.now();
  }
  const target = p.onFoot ? p.pos.clone().setY(p.pos.y + 1.6) : p.car.pos.clone().setY(1.4);
  const dist = G.camDist;
  const off = new THREE.Vector3(
    Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist,
    Math.sin(G.camPitch) * dist + 1.2,
    Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist
  );
  const shake = G.cameraShake;
  G.cameraShake = Math.max(0, G.cameraShake - dt * 1.4);
  camera.position.copy(target).add(off);
  if (shake > 0.005) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(target);
  const speed01 = p.onFoot ? 0 : clamp(Math.abs(p.car.speed) / 46, 0, 1);
  camera.fov += ((62 + speed01 * 10) - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---- UI wiring ----
function startGame() {
  G.audio.unlock();
  G.audio.click();
  document.getElementById('loading').classList.add('hidden');
  G.hud.hideStart();
  G.hud.show();
  G.flags.started = true;
  G.camDist = 8;
  G.camPitch = 0.42;
  if (!G.mission.active && !G.mission.finished) nextMission(G);
  else if (G.mission.finished) G.hud.setObjective('Free roam', 'Every job done — Solmarina is yours.');
}
document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', () => {
  G.flags.paused = false;
  G.hud.hidePause();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});
document.getElementById('retryBtn').addEventListener('click', () => {
  const p = G.player;
  p.health = 100;
  p.wanted = 0;
  p.money = Math.max(0, Math.round(p.money * 0.9));
  p.pos.set(0, 0, 14);
  p.heading = Math.PI;
  if (p.car) { p.car.player = false; p.car = null; }
  p.onFoot = true;
  p.group.visible = true;
  p.group.position.copy(p.pos);
  G.wanted.bustT = 0;
  G.flags.gameOver = false;
  G.audio.setSiren(false);
  G.hud.hideEnd();
  clearEnemies(G);
  for (const c of [...G.policeCars]) { G.scene.remove(c.group); }
  G.policeCars.length = 0;
  G.vehicles = G.vehicles.filter((v) => !v.police);
  for (const c of [...G.cops]) G.scene.remove(c.group);
  G.cops.length = 0;
  startMission(G, G.mission.index);
});

// ---- main loop ----
const clock = new THREE.Clock();
let lastFpsT = performance.now(), fpsFrames = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  if (!G.flags.paused && !G.flags.gameOver) {
    if (G.flags.started) {
      if (G.player.onFoot) updateOnFoot(dt);
      else updateDriving(dt);
      // combat inputs
      if (G.input.keys.has('Digit1')) G.player.weapon = 'fists';
      if (G.input.keys.has('Digit2')) G.player.weapon = 'pistol';
      if (G.input.mouseDown && G.player.onFoot && G.player.weapon === 'pistol' && !G.input._shotCd) {
        playerShoot(G);
        G.input._shotCd = 0.28;
      }
      if (G.input._shotCd) G.input._shotCd = Math.max(0, G.input._shotCd - dt);
      if (G.input.pressed('KeyF') && G.player.onFoot) playerPunch(G);
      if (G.input.pressed('KeyR') && G.player.weapon === 'pistol') {
        const need = 12 - G.player.ammo;
        const take = Math.min(need, G.player.reserve);
        G.player.ammo += take;
        G.player.reserve -= take;
        G.audio.click();
      }
      if (G.input.pressed('KeyL')) {
        writeSave(snapshot(G));
        G.hud.flashHint('Game saved');
      }
      if (G.input.pressed('Enter')) nextMission(G);
      updateMissions(G, dt);
      updateWanted(G, dt);
      updateCombat(G, dt);
      // slow health regen after 6s out of trouble
      if (G.time - G.player.lastHurt > 6 && G.player.health > 0 && G.player.health < 100) {
        G.player.health = Math.min(100, G.player.health + 4 * dt);
      }
      // engine sound
      const speed01 = G.player.onFoot ? 0 : clamp(Math.abs(G.player.car.speed) / 46, 0, 1);
      G.audio.setEngine(speed01, !G.player.onFoot);
    } else {
      // attract mode: slow orbit over the plaza while the title shows
      G.camYaw += dt * 0.05;
      G.camPitch = 0.5;
      G.camDist = 60;
      const t = new THREE.Vector3(0, 2, 0);
      camera.position.set(Math.sin(G.camYaw) * 60, 26, Math.cos(G.camYaw) * 60);
      camera.lookAt(t);
    }
    updateTraffic(G, dt);
    updatePedestrians(G, dt, G.time);
    if (G.flags.started) G.hud.update(dt);
  }
  if (G.input.pressed('KeyP') && G.flags.started && !G.flags.gameOver) {
    G.flags.paused = !G.flags.paused;
    if (G.flags.paused) G.hud.showPause();
    else G.hud.hidePause();
  }
  if (G.input.pressed('KeyM')) {
    G.audio.setMuted(!G.audio.isMuted());
    G.hud.flashHint(G.audio.isMuted() ? 'Sound muted' : 'Sound on');
  }
  if (!G.flags.paused && G.flags.started) updateCamera(dt);
  renderer.render(scene, camera);

  fpsFrames += 1;
  const nowMs = performance.now();
  if (nowMs - lastFpsT > 500) {
    G.fps = Math.round((fpsFrames * 1000) / (nowMs - lastFpsT));
    fpsFrames = 0; lastFpsT = nowMs;
  }
  if (!window.__SOLMARINA_READY) {
    window.__SOLMARINA_READY = true;
    document.getElementById('loading').classList.add('hidden');
    G.hud.showStart();
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hooks for screenshots / automated play-tests (not part of gameplay).
window.__SOLMARINA = {
  G,
  ready: () => !!window.__SOLMARINA_READY,
  start: () => startGame(),
  teleport(x, z) {
    const p = G.player;
    if (!p.onFoot && p.car) { p.car.pos.set(x, 0, z); p.pos.set(x, 0, z); }
    else p.pos.set(x, 0, z);
    p.group.position.copy(p.pos);
  },
  setWanted(n) { G.player.wanted = n; if (n >= 3) G.audio.setSiren(true); },
  setCamera(yaw, pitch, dist) {
    G.camYaw = yaw; G.camPitch = pitch; G.camDist = dist; G.camLock = true;
  },
  unlockCamera() { G.camLock = false; },
  startMission(i) { if (!G.flags.started) startGame(); startMission(G, i); },
  setHealth(n) { G.player.health = n; },
  giveCar(kind, color) {
    const p = G.player;
    const v = makeVehicle(kind || 'sports', p.pos.x + 4, p.pos.z + 2, p.heading, color);
    G.scene.add(v.group);
    G.vehicles.push(v);
    return v;
  },
  enterNearestCar() {
    const near = nearestCar(G, G.player.pos.x, G.player.pos.z, 8);
    if (near) enterCar(near);
    return !!near;
  },
  exitCar() {
    if (!G.player.onFoot) exitCar();
    return G.player.onFoot;
  },
  drive(throttle, steer, seconds) {
    const p = G.player;
    if (p.onFoot || !p.car) return false;
    p.car._auto = { throttle, steer, t: seconds };
    return true;
  },
  state() {
    const p = G.player;
    return {
      started: G.flags.started, paused: G.flags.paused, gameOver: G.flags.gameOver,
      onFoot: p.onFoot, x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1),
      heading: +p.heading.toFixed(2), health: Math.round(p.health),
      money: Math.round(p.money), wanted: p.wanted,
      weapon: p.weapon, ammo: p.ammo,
      mission: G.mission.index, step: G.mission.step, missionActive: G.mission.active,
      cars: G.vehicles.length, traffic: G.traffic.length, peds: G.peds.length,
      policeCars: G.policeCars.length, cops: G.cops.length, enemies: G.combat.enemies.length,
      fps: G.fps,
    };
  },
};

animate();
