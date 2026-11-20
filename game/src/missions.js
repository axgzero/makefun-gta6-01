// missions.js — the story: five jobs for Mara Solís, chained in order.
// A mission is a list of steps; each step is { type, x, z, r, text, sub } and the
// step completes when its condition is met. Rewards pay out in cash.
import * as THREE from 'three';
import { spawnEnemy, clearEnemies } from './combat.js';
import { addWanted } from './police.js';
import { dist2 } from './physics.js';
import { writeSave, snapshot } from './save.js';

const MISSIONS = [
  {
    name: 'MISSION 1 — FIRST GEAR',
    brief: 'Mara needs a driver. Steal a car and bring it to her garage.',
    reward: 300,
    steps: [
      { type: 'car', text: 'Steal a car', sub: 'Walk up to any car and press E' },
      { type: 'goto', x: 52, z: 52, r: 8, text: 'Drive to Mara’s garage', sub: 'Follow the yellow marker' },
    ],
  },
  {
    name: 'MISSION 2 — THE PICKUP',
    brief: 'A package is waiting at the docks. Collect it, then deliver it to the plaza hotel. Keep it quiet.',
    reward: 500,
    steps: [
      { type: 'goto', x: -60, z: 262, r: 8, text: 'Collect the package at the docks', sub: 'Drive south to the container yard' },
      { type: 'goto', x: 104, z: -104, r: 8, text: 'Deliver the package to the hotel', sub: 'North-east side of town — avoid the PD' },
    ],
  },
  {
    name: 'MISSION 3 — HOT PURSUIT',
    brief: 'The deal went sideways. The PD is on you — lose them.',
    reward: 700,
    steps: [
      { type: 'wanted', stars: 3, text: 'The PD is on your tail', sub: 'You are at 3 stars — break line of sight' },
      { type: 'lose', text: 'Lose the cops', sub: 'Stay hidden until the stars drop to zero' },
    ],
  },
  {
    name: 'MISSION 4 — DOCKSIDE DEAL',
    brief: 'Los Tiburones want Mara’s shipment. Hold the pier — on foot.',
    reward: 900,
    steps: [
      { type: 'goto', x: -60, z: 285, r: 10, text: 'Get to the pier', sub: 'On foot is fine — leave the car' },
      { type: 'defend', kills: 6, text: 'Defend the shipment', sub: 'Take down 6 Tiburones — click to shoot' },
    ],
  },
  {
    name: 'MISSION 5 — THE BIG SCORE',
    brief: 'One last job: the Solmarina vault. Grab the cash, then vanish.',
    reward: 2500,
    steps: [
      { type: 'goto', x: -52, z: -104, r: 8, text: 'Reach the vault downtown', sub: 'Downtown, west side' },
      { type: 'grab', x: -52, z: -104, text: 'Grab the cash', sub: 'Stand in the marker to crack the vault' },
      { type: 'escape', text: 'Escape to the safehouse', sub: '4 stars on you — get to the beach house' , x: 250, z: 180, r: 10 },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    done: [false, false, false, false, false],
    kills: 0,
    grabT: 0,
    active: false,
    marker: null,
    finished: false,
  };
}

export function startMission(G, index) {
  const m = G.mission;
  if (index >= MISSIONS.length) return;
  m.index = index;
  m.step = 0;
  m.kills = 0;
  m.grabT = 0;
  m.active = true;
  clearEnemies(G);
  const def = MISSIONS[index];
  G.hud.setObjective(def.name, def.brief);
  G.hud.showBanner(def.name, def.brief);
  G.audio.mission();
  updateMarker(G);
  if (index === 3) {
    // defend step spawns its crew when the player arrives; pre-spawn two lookouts
    spawnEnemy(G, -72, 292);
    spawnEnemy(G, -48, 292);
  }
  if (index === 4) {
    spawnEnemy(G, -64, -96);
    spawnEnemy(G, -40, -112);
  }
}

export function currentStep(G) {
  const def = MISSIONS[G.mission.index];
  if (!def) return null;
  return def.steps[G.mission.step] || null;
}

export function updateMarker(G) {
  const step = currentStep(G);
  if (G.mission.marker) {
    G.scene.remove(G.mission.marker);
    G.mission.marker = null;
  }
  if (!step || step.type === 'car' || step.type === 'wanted' || step.type === 'lose' || step.type === 'defend') return;
  const x = step.x ?? 0, z = step.z ?? 0;
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 20;
  marker.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.3, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd94d })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  marker.add(ring);
  marker.position.set(x, 0, z);
  G.scene.add(marker);
  G.mission.marker = marker;
  G.hud.setWaypoint(x, z);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m.active || m.finished) return;
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (!step) { completeMission(G); return; }
  const p = G.player;

  switch (step.type) {
    case 'car':
      if (!p.onFoot) advanceStep(G);
      break;
    case 'goto':
      if (dist2(p.pos.x, p.pos.z, step.x, step.z) < step.r * step.r) advanceStep(G);
      break;
    case 'wanted':
      if (p.wanted < step.stars) addWanted(G, step.stars - p.wanted, 'the deal went sideways');
      if (p.wanted >= step.stars) advanceStep(G);
      break;
    case 'lose':
      if (p.wanted === 0) advanceStep(G);
      break;
    case 'defend': {
      // keep the pressure on: top the crew up to 3 alive
      if (G.combat.enemies.length < 3 && m.kills + G.combat.enemies.length < step.kills + 2) {
        const a = Math.random() * Math.PI * 2;
        spawnEnemy(G, step.x + Math.sin(a) * 22 || -60 + Math.sin(a) * 22, 285 + Math.cos(a) * 10);
      }
      if (m.kills >= step.kills) advanceStep(G);
      break;
    }
    case 'grab':
      if (dist2(p.pos.x, p.pos.z, -52, -104) < 64) {
        m.grabT += dt;
        G.hud.setObjective(def.name, `Cracking the vault… ${Math.ceil(4 - m.grabT)}s`);
        if (m.grabT >= 4) {
          addWanted(G, 4, 'vault alarm tripped');
          advanceStep(G);
        }
      } else {
        m.grabT = 0;
      }
      break;
    case 'escape':
      if (dist2(p.pos.x, p.pos.z, step.x, step.z) < step.r * step.r) advanceStep(G);
      break;
  }
  // marker pulse
  if (m.marker) {
    m.marker.rotation.y += dt * 1.2;
    m.marker.children[1].scale.setScalar(1 + Math.sin(G.time * 3) * 0.08);
  }
}

function advanceStep(G) {
  const m = G.mission;
  const def = MISSIONS[m.index];
  m.step += 1;
  G.audio.pickup();
  const next = def.steps[m.step];
  if (!next) { completeMission(G); return; }
  G.hud.setObjective(def.name, `${next.text} — ${next.sub || ''}`);
  updateMarker(G);
  if (next.type === 'defend') {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      spawnEnemy(G, -60 + Math.sin(a) * 20, 285 + Math.cos(a) * 12);
    }
  }
}

function completeMission(G) {
  const m = G.mission;
  const def = MISSIONS[m.index];
  m.done[m.index] = true;
  m.active = false;
  G.player.money += def.reward;
  G.audio.cash();
  G.hud.showBanner('JOB DONE', `+$${def.reward} — ${def.name}`);
  G.hud.setObjective('Free roam', 'Press ENTER for the next job, or explore Solmarina');
  G.hud.hideWaypoint();
  if (m.marker) { G.scene.remove(m.marker); m.marker = null; }
  clearEnemies(G);
  writeSave(snapshot(G));
  if (m.index >= MISSIONS.length - 1) {
    m.finished = true;
    G.hud.showBanner('SOLMARINA IS YOURS', 'Every job done — the city is yours, Leo.');
  }
}

export function nextMission(G) {
  const m = G.mission;
  if (m.active) return;
  const next = m.done.findIndex((d) => !d);
  if (next === -1) {
    G.hud.setObjective('Free roam', 'Every job done — Solmarina is yours.');
    return;
  }
  startMission(G, next);
}

export function onEnemyKilled(G) {
  G.mission.kills += 1;
  const step = currentStep(G);
  if (step && step.type === 'defend') {
    G.hud.setObjective(MISSIONS[G.mission.index].name, `Defend the shipment — ${G.mission.kills}/${step.kills} down`);
  }
}
