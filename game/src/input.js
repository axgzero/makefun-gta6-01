// input.js — keyboard + mouse state, shared by foot, car and combat.
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys,
    mouseDX: 0, mouseDY: 0,
    mouseDown: false, mouseX: 0, mouseY: 0,
    dragging: false,
    locked: false,
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    state.mouseDown = true;
    state.dragging = true;
    state.mouseX = e.clientX; state.mouseY = e.clientY;
    if (e.button === 0 && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  window.addEventListener('mouseup', () => { state.mouseDown = false; state.dragging = false; });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
  });
  window.addEventListener('mousemove', (e) => {
    if (state.locked) {
      state.mouseDX += e.movementX;
      state.mouseDY += e.movementY;
    } else if (state.dragging) {
      state.mouseDX += e.clientX - state.mouseX;
      state.mouseDY += e.clientY - state.mouseY;
      state.mouseX = e.clientX; state.mouseY = e.clientY;
    }
  });
  // Edge-triggered helpers: call once per frame after reading.
  state.consumeMouse = function () {
    const dx = state.mouseDX, dy = state.mouseDY;
    state.mouseDX = 0; state.mouseDY = 0;
    return { dx, dy };
  };
  state.pressed = function (code) {
    if (!keys.has(code)) return false;
    keys.delete(code);
    return true;
  };
  return state;
}
