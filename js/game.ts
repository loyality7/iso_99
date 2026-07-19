'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { scene, camera, renderer } from './engine';
import { initAudio } from './audio';
import { el } from './utils';
import { G } from './state';
import { player, setupInput, updatePlayer, updateVitalsHUD, updateAlive, dmgFlash, setDmgFlash, initPlayerModel, playerGroup } from './player';
import { weap, tryFire, startReload, finishReload, updateAmmoHUD, updateFX, updateWeaponModel, switchWeapon, handleWheelSwitch, gun } from './weapon';
import { spawnBot, updateBots, clearBots } from './bots';
import { spawnLoot, updateLoot, tryPickup, clearLoot } from './loot';
import { pickNextZone, updateZone, resetZone } from './zone';
import { drawMinimap, addFeed } from './ui';
import { terrainHeight, updateChunks, clearChunks } from './terrain';

import { loadAllAssets } from './assets';
import { initMultiplayer, updateMultiplayer, sendLocalState } from './multiplayer';
import { initIntroSystem, updateIntroSystem } from './intro';


// Setup pointer lock and menu controls
const canvas = renderer.domElement;
function lockPointer() {
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === canvas;
  if (!G.locked && G.running && !G.over) {
    el('pauseScreen').classList.remove('hidden');
  }
  if (G.locked) {
    el('pauseScreen').classList.add('hidden');
  }
});

// Event listeners for game controls
document.addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyE') tryPickup();
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'KeyV') {
    player.thirdPerson = !player.thirdPerson;
    if (playerGroup) {
      playerGroup.visible = player.thirdPerson;
    }
    gun.visible = !player.thirdPerson;
    updatePerspectiveUI();
  }
});

document.addEventListener('keyup', e => {
  G.keys[e.code] = false;
});

document.addEventListener('mousedown', e => {
  if (G.locked && e.button === 0) G.firing = true;
});

document.addEventListener('mouseup', e => {
  if (e.button === 0) G.firing = false;
});

document.addEventListener('wheel', e => {
  if (G.locked && G.running && !G.over) {
    handleWheelSwitch(e.deltaY);
  }
});

document.addEventListener('contextmenu', e => e.preventDefault());

el('startBtn').addEventListener('click', () => {
  initAudio();
  el('startScreen').classList.add('hidden');
  startMatch();
});

el('resumeBtn').addEventListener('click', () => {
  lockPointer();
});

el('retryBtn').addEventListener('click', () => window.location.reload());
el('againBtn').addEventListener('click', () => window.location.reload());

function startMatch() {
  G.running = true;
  G.over = false;
  el('hud').style.display = 'block';
  
  initPlayerModel();
  
  clearBots();
  for (let i = 0; i < 99; i++) {
    spawnBot(i);
  }
  
  clearLoot();
  spawnLoot();
  resetZone();
  pickNextZone();
  
  updateAlive();
  updateAmmoHUD();
  updateVitalsHUD();
  
  initIntroSystem();
  
  addFeed('Warmup Lobby — <b>100</b> combatants');
  lockPointer();
}

// Pre-build terrain around origin and register mouse input
updateChunks(0, 0);
setupInput();

// Pre-load raw assets asynchronously
const startBtn = el('startBtn');
if (startBtn) {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading Assets...';
}

loadAllAssets().then(() => {
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Deploy';
  }
  // Initialize Colyseus client connection
  initMultiplayer();
  // Clear the starting procedural placeholder chunks
  clearChunks();
  // Re-generate the local terrain to swap placeholders with high-fidelity models
  updateChunks(0, 0);
  // Swap viewmodel weapon with 3D model
  updateWeaponModel();
}).catch(err => {
  console.warn("Assets failed to load, falling back to procedural shapes:", err);
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Deploy (Fallback)';
  }
  initMultiplayer();
});

const clock = new THREE.Clock();
let mmTimer = 0;
let chunkTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (G.running && !G.over && G.locked) {
    G.timeAlive += dt;
    updateIntroSystem(dt);
    updatePlayer(dt);
    
    if (G.firing) {
      tryFire(now);
    }
    
    if (weap.reloading && now >= weap.reloadEnd) {
      finishReload();
    }
    
    updateBots(dt, now);
    updateMultiplayer(dt);
    sendLocalState();
    
    updateZone(dt);
    updateLoot(dt, now);

    chunkTimer -= dt;
    if (chunkTimer <= 0) {
      updateChunks(player.pos.x, player.pos.z);
      chunkTimer = 0.5;
    }
    
    mmTimer -= dt;
    if (mmTimer <= 0) {
      drawMinimap();
      mmTimer = 0.12;
    }

    if (dmgFlash > 0) {
      const df = Math.max(0, dmgFlash - 2.2 * dt);
      setDmgFlash(df);
      el('dmgVignette').style.opacity = df.toString();
    }
  }
  
  updateFX(dt);
  renderer.render(scene, camera);
}

const btnFirstPerson = el('btnFirstPerson');
const btnThirdPerson = el('btnThirdPerson');

export function updatePerspectiveUI() {
  if (player.thirdPerson) {
    if (btnFirstPerson) {
      btnFirstPerson.style.background = 'transparent';
      btnFirstPerson.style.color = '#fff';
    }
    if (btnThirdPerson) {
      btnThirdPerson.style.background = 'var(--amber)';
      btnThirdPerson.style.color = '#000';
    }
  } else {
    if (btnFirstPerson) {
      btnFirstPerson.style.background = 'var(--amber)';
      btnFirstPerson.style.color = '#000';
    }
    if (btnThirdPerson) {
      btnThirdPerson.style.background = 'transparent';
      btnThirdPerson.style.color = '#fff';
    }
  }
}

if (btnFirstPerson && btnThirdPerson) {
  btnFirstPerson.addEventListener('click', (e) => {
    e.stopPropagation();
    player.thirdPerson = false;
    if (playerGroup) playerGroup.visible = false;
    gun.visible = true;
    updatePerspectiveUI();
  });
  
  btnThirdPerson.addEventListener('click', (e) => {
    e.stopPropagation();
    player.thirdPerson = true;
    if (playerGroup) playerGroup.visible = true;
    gun.visible = false;
    updatePerspectiveUI();
  });
}

const fovSlider = el('fovSlider');
const fovVal = el('fovVal');

if (fovSlider && fovVal) {
  fovSlider.addEventListener('input', () => {
    const val = parseInt(fovSlider.value);
    fovVal.textContent = val.toString();
    camera.fov = val;
    camera.updateProjectionMatrix();
  });
}

// Align initial camera backdrop
camera.position.set(0, terrainHeight(0, 0) + player.eye, 0);
animate();
