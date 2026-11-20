// hud.js — DOM HUD (stars, money, health, objective, banner, speed, weapon),
// the canvas minimap, and the start / pause / busted screens.
import { CITY, roadCoord } from './city.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), stars: $('stars'), money: $('money'), health: $('healthfill'),
    clock: $('clock'), objective: $('objective'), banner: $('banner'),
    speedo: $('speedo'), weapon: $('weapon'), hint: $('hint'),
    waypoint: $('waypoint'), vignette: $('vignette'), crosshair: $('crosshair'),
    start: $('startScreen'), pause: $('pauseScreen'), end: $('endScreen'),
    endTitle: $('endTitle'), endText: $('endText'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let hintT = 0;
  let bannerT = 0;

  function drawMinimap() {
    const S = 208, W = 640; // world span shown
    const px = G.player.pos.x, pz = G.player.pos.z;
    const toMap = (x, z) => [S / 2 + ((x - px) / W) * S, S / 2 + ((z - pz) / W) * S];
    mm.clearRect(0, 0, S, S);
    mm.fillStyle = '#10182e';
    mm.fillRect(0, 0, S, S);
    // land + sea
    mm.fillStyle = '#3d4a2e';
    const [lx0, lz0] = toMap(CITY.landMinX, CITY.landMinZ);
    const [lx1, lz1] = toMap(CITY.landMaxX, CITY.landMaxZ);
    mm.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    mm.fillStyle = '#2a7fa8';
    mm.fillRect(0, 0, S, S);
    mm.fillStyle = '#3d4a2e';
    mm.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    mm.fillStyle = '#e3c98f';
    const [bx0, bz0] = toMap(232, CITY.landMinZ);
    const [bx1, bz1] = toMap(340, CITY.landMaxZ);
    mm.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
    // roads
    mm.strokeStyle = '#c9c9c9';
    mm.lineWidth = 2;
    for (let k = -CITY.half; k <= CITY.half; k++) {
      const c = roadCoord(k);
      const [ax, az] = toMap(-CITY.half * CITY.pitch - 10, c);
      const [bx, bz] = toMap(CITY.half * CITY.pitch + 10, c);
      mm.beginPath(); mm.moveTo(ax, az); mm.lineTo(bx, bz); mm.stroke();
      const [cx, cz] = toMap(c, -CITY.half * CITY.pitch - 10);
      const [dx, dz] = toMap(c, CITY.half * CITY.pitch + 10);
      mm.beginPath(); mm.moveTo(cx, cz); mm.lineTo(dx, dz); mm.stroke();
    }
    // mission marker
    const step = G.mission.active ? { x: G.mission.marker?.position.x, z: G.mission.marker?.position.z } : null;
    if (step && step.x !== undefined) {
      const [mx, mz] = toMap(step.x, step.z);
      mm.fillStyle = '#ffd94d';
      mm.beginPath(); mm.arc(mx, mz, 6, 0, Math.PI * 2); mm.fill();
      mm.strokeStyle = '#231303'; mm.lineWidth = 2; mm.stroke();
    }
    // traffic (white), police (blue/red), player (green arrow)
    for (const v of G.vehicles) {
      const [vx, vz] = toMap(v.pos.x, v.pos.z);
      if (vx < -4 || vx > S + 4 || vz < -4 || vz > S + 4) continue;
      mm.fillStyle = v.police ? '#3a6cff' : '#ffffff';
      mm.fillRect(vx - 2, vz - 2, 4, 4);
    }
    const [pxm, pzm] = toMap(px, pz);
    mm.save();
    mm.translate(pxm, pzm);
    mm.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)) * 0 + (Math.PI - G.player.heading) * 0);
    // north-up map: rotate arrow by heading (heading 0 = +z = down on map)
    mm.rotate(Math.PI - G.player.heading);
    mm.fillStyle = '#7dff9a';
    mm.beginPath();
    mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
    mm.restore();
    // north tick
    mm.fillStyle = '#fff';
    mm.font = 'bold 11px Arial';
    mm.fillText('N', S - 14, 14);
  }

  return {
    show() { el.hud.classList.remove('hidden'); },
    hide() { el.hud.classList.add('hidden'); },
    setObjective(title, sub) {
      el.objective.innerHTML = `${title}<small>${sub || ''}</small>`;
    },
    showBanner(title, sub) {
      el.banner.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
      el.banner.classList.add('show');
      bannerT = 2.6;
    },
    flashHint(text) {
      el.hint.textContent = text;
      el.hint.classList.remove('hidden');
      hintT = 2.2;
    },
    hideHint() { el.hint.classList.add('hidden'); },
    hurtFlash() {
      el.vignette.classList.add('hurt');
      setTimeout(() => el.vignette.classList.remove('hurt'), 220);
    },
    muzzleFlash() {
      el.vignette.style.boxShadow = 'inset 0 0 60px rgba(255,220,120,0.35)';
      setTimeout(() => { el.vignette.style.boxShadow = ''; }, 70);
    },
    setWaypoint(x, z) {
      el.waypoint.classList.remove('hidden');
      el.waypoint.dataset.x = x;
      el.waypoint.dataset.z = z;
    },
    hideWaypoint() { el.waypoint.classList.add('hidden'); },
    showStart() { el.start.classList.remove('hidden'); },
    hideStart() { el.start.classList.add('hidden'); },
    showPause() { el.pause.classList.remove('hidden'); },
    hidePause() { el.pause.classList.add('hidden'); },
    showEnd(kind, cause) {
      el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      el.endText.textContent = kind === 'busted'
        ? 'The Solmarina PD caught up with you. Your crew posts bail — but the heat stays.'
        : `You got taken out${cause ? ` (${cause})` : ''}. Mara’s crew drags you to safety — minus some cash.`;
      el.end.classList.remove('hidden');
    },
    hideEnd() { el.end.classList.add('hidden'); },
    update(dt) {
      const p = G.player;
      // stars
      let s = '';
      for (let i = 0; i < 5; i++) s += i < p.wanted ? '★' : '<span class="off">★</span>';
      el.stars.innerHTML = s;
      el.money.textContent = Math.round(p.money).toLocaleString('en-US');
      el.health.style.width = `${Math.max(0, p.health)}%`;
      el.clock.textContent = `GOLDEN HOUR · 17:40 · ${G.mission.done.filter(Boolean).length}/5 JOBS DONE`;
      // weapon
      const w = p.weapon === 'pistol' ? `Pistol <small>${p.ammo} / ${p.reserve}</small>` : 'Fists <small>press 2 for pistol</small>';
      el.weapon.innerHTML = w;
      // speedo
      if (!p.onFoot && p.car) {
        el.speedo.classList.remove('hidden');
        el.speedo.innerHTML = `${Math.round(Math.abs(p.car.speed) * 3.6)}<small>KM/H</small>`;
      } else {
        el.speedo.classList.add('hidden');
      }
      // crosshair on foot with pistol
      el.crosshair.style.display = p.onFoot && p.weapon === 'pistol' ? 'block' : 'none';
      // waypoint arrow: rotate toward objective, show distance
      if (!el.waypoint.classList.contains('hidden')) {
        const tx = parseFloat(el.waypoint.dataset.x), tz = parseFloat(el.waypoint.dataset.z);
        const dx = tx - p.pos.x, dz = tz - p.pos.z;
        const worldAngle = Math.atan2(dx, dz);
        const rel = worldAngle - G.camYaw;
        el.waypoint.style.transform = `translateX(-50%) rotate(${(-rel * 180) / Math.PI + 180}deg)`;
        el.waypoint.querySelector('.dist').textContent = `${Math.round(Math.hypot(dx, dz))}m`;
        el.waypoint.querySelector('.dist').style.transform = `translateX(-50%) rotate(${((rel * 180) / Math.PI - 180)}deg)`;
      }
      // timers
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) this.hideHint(); }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
      drawMinimap();
    },
  };
}
