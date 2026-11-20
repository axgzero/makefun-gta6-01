// physics.js — tiny arcade collision helpers. Everything is a circle (cars, people)
// against axis-aligned building boxes, so the whole city is cheap to collide with.
export function circleVsBox(px, pz, r, b) {
  const cx = Math.max(b.minX, Math.min(px, b.maxX));
  const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }
  // centre inside the box: push out along the smallest penetration axis
  const pl = px - b.minX, pr = b.maxX - px, pt = pz - b.minZ, pb = b.maxZ - pz;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { nx: -1, nz: 0, depth: pl + r };
  if (m === pr) return { nx: 1, nz: 0, depth: pr + r };
  if (m === pt) return { nx: 0, nz: -1, depth: pt + r };
  return { nx: 0, nz: 1, depth: pb + r };
}

// Push a circle out of every box it touches. Returns true when a hit happened.
export function resolveCircle(px, pz, r, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (px < b.minX - r || px > b.maxX + r || pz < b.minZ - r || pz > b.maxZ + r) continue;
    const push = circleVsBox(px, pz, r, b);
    if (push) {
      px += push.nx * push.depth;
      pz += push.nz * push.depth;
      hit = true;
    }
  }
  return { x: px, z: pz, hit };
}

export function pointInBox(x, z, b, pad = 0) {
  return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest signed angle from a to b.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
