// save.js — localStorage saves: money, story progress, position, wanted.
// Auto-saves after every mission; L saves on demand.
const KEY = 'solmarina-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return s;
  } catch (e) {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

export function snapshot(G) {
  return {
    version: 1,
    money: Math.round(G.player.money),
    missionsDone: G.mission.done.slice(),
    missionIndex: G.mission.index,
    px: +G.player.pos.x.toFixed(1),
    pz: +G.player.pos.z.toFixed(1),
    heading: +G.player.heading.toFixed(2),
    health: Math.round(G.player.health),
    savedAt: Date.now(),
  };
}

export function applySave(G, s) {
  if (!s) return false;
  G.player.money = typeof s.money === 'number' ? s.money : 250;
  if (Array.isArray(s.missionsDone)) {
    for (let i = 0; i < s.missionsDone.length && i < G.mission.done.length; i++) {
      G.mission.done[i] = !!s.missionsDone[i];
    }
  }
  if (typeof s.missionIndex === 'number') G.mission.index = s.missionIndex;
  if (typeof s.px === 'number' && typeof s.pz === 'number') {
    G.player.pos.set(s.px, 0, s.pz);
  }
  if (typeof s.heading === 'number') G.player.heading = s.heading;
  if (typeof s.health === 'number') G.player.health = s.health;
  return true;
}
