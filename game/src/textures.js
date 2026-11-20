// textures.js — every texture in Solmarina is drawn on a canvas at load time.
// No image files, no network: windows, signs, roads, sand and water are procedural.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Facade: coloured wall, lit/unlit window grid, ground-floor shopfront band.
export function facadeTexture(seed, baseColor, floors, litRatio) {
  const rnd = mulberry(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = baseColor; g.fillRect(0, 0, w, h);
    // subtle vertical grime
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, 0, 2 + rnd() * 6, h);
    }
    const cols = 6, rows = Math.max(3, floors);
    const cw = w / cols, ch = (h - 44) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rnd() < litRatio;
        g.fillStyle = lit ? (rnd() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#20242e';
        g.fillRect(c * cw + 6, r * ch + 6, cw - 12, ch - 12);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(c * cw + 6, r * ch + 6, cw - 12, 3);
      }
    }
    // shopfront band
    g.fillStyle = '#14161f'; g.fillRect(0, h - 44, w, 44);
    const signs = ['TACOS', 'BAR', '24H', 'HOTEL', 'PIZZA', 'CLUB', 'SHOP', 'CAFÉ'];
    g.fillStyle = ['#ff5a4e', '#ffd94d', '#7dff9a', '#6fc7ff'][seed % 4];
    g.font = 'bold 22px Arial'; g.textAlign = 'center';
    g.fillText(signs[seed % signs.length], w / 2, h - 14);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(8, h - 40, 26, 30); g.fillRect(w - 34, h - 40, 26, 30);
  });
}

// Asphalt with a dashed centre line running ALONG the tile.
// orientation 'h': dashes run along u (for east-west roads); 'v': along v.
export function roadTexture(orientation = 'h') {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2b2d33'; g.fillRect(0, 0, w, h);
    const rnd = mulberry(7);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.fillStyle = '#e8c33c';
    if (orientation === 'h') {
      g.fillRect(8, h / 2 - 2, 34, 4); g.fillRect(w - 42, h / 2 - 2, 34, 4);
    } else {
      g.fillRect(w / 2 - 2, 8, 4, 34); g.fillRect(w / 2 - 2, h - 42, 4, 34);
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    if (orientation === 'h') { g.fillRect(0, 2, w, 2); g.fillRect(0, h - 4, w, 2); }
    else { g.fillRect(2, 0, 2, h); g.fillRect(w - 4, 0, 2, h); }
  });
}

export function sidewalkTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#a8a091'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
    }
  });
}

export function sandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e3c98f'; g.fillRect(0, 0, w, h);
    const rnd = mulberry(21);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(120,90,40,${rnd() * 0.16})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });
}

export function waterTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1d7fa8'); grad.addColorStop(0.5, '#2aa5c4'); grad.addColorStop(1, '#17709a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 2;
    const rnd = mulberry(99);
    for (let i = 0; i < 26; i++) {
      const y = rnd() * h, x = rnd() * w, len = 20 + rnd() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
    }
  });
}

// Big sun-bleached "SOLMARINA" welcome sign texture for the beach billboard.
export function billboardTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ff9a3d'); grad.addColorStop(0.55, '#ff5a7a'); grad.addColorStop(1, '#7a4fd0');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '900 64px Arial'; g.textAlign = 'center';
    g.fillText('SOLMARINA', w / 2, 118);
    g.font = '700 30px Arial'; g.fillStyle = '#ffe9a8';
    g.fillText('SUN · SAND · SIN', w / 2, 176);
  });
}

export function palmLeafTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#2f9e4f'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.beginPath(); g.moveTo(32, 32);
      g.quadraticCurveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22, 32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
      g.stroke();
    }
  });
}
