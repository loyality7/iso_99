'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { G } from './state';
import { scene, camera } from './engine';
import { player } from './player';
import { terrainHeight } from './terrain';
import { playShot, blip } from './audio';
import { clamp, rand, el } from './utils';
import { bots, damageBot } from './bots';
import { ASSETS } from './assets';
import { remotePlayers, sendShoot, sendHit } from './multiplayer';

export const WEAPONS = {
  rifle: { name: 'M4 CARBINE', dmg: 24, interval: 120, mag: 30, spread: 0.012 },
  dmr:   { name: 'MK-2 DMR',   dmg: 42, interval: 300, mag: 20, spread: 0.004 },
  smg:   { name: 'MP5 SMG',    dmg: 16, interval: 75,  mag: 40, spread: 0.022 },
};

// Player's active weapon status acting as a live proxy
export const weap = {
  def: WEAPONS.rifle,
  mag: 30,
  reserve: 90,
  lastShot: 0,
  reloading: false,
  reloadEnd: 0,
};

// Weapon Inventory System
export const playerInventory: any[] = [
  { def: WEAPONS.rifle, mag: 30, reserve: 90, reloading: false, reloadEnd: 0 }, // slot 0
  null // slot 1 starts empty
];
export let activeSlot = 0;

export function switchWeapon(slot) {
  if (slot < 0 || slot >= playerInventory.length) return;
  if (!playerInventory[slot]) return; // slot empty
  
  // Save current active state to inventory
  playerInventory[activeSlot].mag = weap.mag;
  playerInventory[activeSlot].reserve = weap.reserve;
  playerInventory[activeSlot].reloading = weap.reloading;
  playerInventory[activeSlot].reloadEnd = weap.reloadEnd;
  
  // Load new active slot state
  activeSlot = slot;
  const newWeap = playerInventory[activeSlot];
  weap.def = newWeap.def;
  weap.mag = newWeap.mag;
  weap.reserve = newWeap.reserve;
  weap.reloading = newWeap.reloading;
  weap.reloadEnd = newWeap.reloadEnd;
  weap.lastShot = 0;
  
  // Reset UI reload hint
  if (!weap.reloading) {
    const hint = el('reloadHint');
    if (hint) {
      hint.textContent = 'R TO RELOAD';
      hint.classList.remove('active');
    }
  } else {
    const hint = el('reloadHint');
    if (hint) {
      hint.textContent = 'RELOADING…';
      hint.classList.add('active');
    }
  }
  
  updateWeaponModel();
  updateAmmoHUD();
  player.activeWeaponDef = newWeap.def;
  
  // Play subtle switch sound
  blip(880, 0.05, 0.15, 'triangle');
}

export function addWeaponToInventory(weaponDef, ammoCount) {
  // Check if we already have this weapon
  let slotIndex = -1;
  for (let i = 0; i < playerInventory.length; i++) {
    if (playerInventory[i] && playerInventory[i].def.name === weaponDef.name) {
      slotIndex = i;
      break;
    }
  }
  
  if (slotIndex !== -1) {
    // Already have it: add ammo to reserve
    if (slotIndex === activeSlot) {
      weap.reserve += ammoCount;
    } else {
      playerInventory[slotIndex].reserve += ammoCount;
    }
  } else {
    // Don't have it: equip it in slot 1 (or next empty slot)
    let targetSlot = -1;
    for (let i = 0; i < playerInventory.length; i++) {
      if (!playerInventory[i]) {
        targetSlot = i;
        break;
      }
    }
    
    if (targetSlot === -1) {
      targetSlot = 1; // Overwrite secondary slot if full
    }
    
    playerInventory[targetSlot] = {
      def: weaponDef,
      mag: weaponDef.mag,
      reserve: ammoCount,
      reloading: false,
      reloadEnd: 0
    };
    
    switchWeapon(targetSlot);
  }
  updateAmmoHUD();
}

export function handleWheelSwitch(deltaY) {
  let targetSlot = activeSlot;
  if (deltaY > 0) {
    targetSlot = (activeSlot + 1) % playerInventory.length;
  } else if (deltaY < 0) {
    targetSlot = (activeSlot - 1 + playerInventory.length) % playerInventory.length;
  }
  
  if (playerInventory[targetSlot]) {
    switchWeapon(targetSlot);
  }
}

// Simple viewmodel gun container
export const gun = new THREE.Group();
gun.position.set(0.2, -0.24, -0.48);
camera.add(gun);

export function updateWeaponModel() {
  while (gun.children.length > 0) {
    gun.remove(gun.children[0]);
  }
  const active = weap.def;
  let mesh = null;
  if (active.name === 'M4 CARBINE' && ASSETS.weapons.rifle) {
    mesh = ASSETS.weapons.rifle.clone();
  } else if (active.name === 'MK-2 DMR' && ASSETS.weapons.dmr) {
    mesh = ASSETS.weapons.dmr.clone();
  } else if (active.name === 'MP5 SMG' && ASSETS.weapons.rifle) {
    mesh = ASSETS.weapons.rifle.clone();
  }

  if (mesh) {
    mesh.scale.setScalar(0.045);
    mesh.rotation.y = Math.PI; // Point weapon away from player camera
    mesh.position.set(0, -0.05, 0.15); // Adjust offset for perfect first person placement
    gun.add(mesh);
  } else {
    // Fallback basic shapes viewmodel
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.15, 0.52), new THREE.MeshLambertMaterial({ color: 0x2b2f33 }));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), new THREE.MeshLambertMaterial({ color: 0x1d2023 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.4);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), new THREE.MeshLambertMaterial({ color: 0x3a3126 }));
    grip.position.set(0, -0.13, 0.12);
    grip.rotation.x = 0.3;
    gun.add(body, barrel, grip);
  }
}

// Initial draw (will draw fallback until assets are ready)
updateWeaponModel();


export const muzzleLight = new THREE.PointLight(0xffc46b, 0, 10);
scene.add(muzzleLight);

export let gunKick = 0;
export function setGunKick(val) {
  gunKick = val;
}

export const tracers = [];
export const puffs = [];
const tracerM = new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9 });

export function startReload() {
  if (!G.running || weap.reloading || weap.mag === weap.def.mag || weap.reserve <= 0) return;
  weap.reloading = true;
  weap.reloadEnd = performance.now() + 1400;
  el('reloadHint').textContent = 'RELOADING…';
  el('reloadHint').classList.add('active');
  blip(300, 0.1, 0.2, 'square');
}

export function finishReload() {
  const need = weap.def.mag - weap.mag;
  const take = Math.min(need, weap.reserve);
  weap.mag += take;
  weap.reserve -= take;
  weap.reloading = false;
  el('reloadHint').textContent = 'R TO RELOAD';
  el('reloadHint').classList.remove('active');
  blip(600, 0.08, 0.2, 'square');
  updateAmmoHUD();
}

export function updateAmmoHUD() {
  el('ammo').innerHTML = weap.mag + ' <small>/ ' + weap.reserve + '</small>';
  el('wname').textContent = weap.def.name;
  
  const slot0El = el('slot0');
  const slot1El = el('slot1');
  if (slot0El && slot1El) {
    const slot0Weap = playerInventory[0];
    const slot1Weap = playerInventory[1];
    
    slot0El.textContent = `[1] ${slot0Weap ? slot0Weap.def.name : '---'}`;
    slot1El.textContent = `[2] ${slot1Weap ? slot1Weap.def.name : '---'}`;
    
    if (activeSlot === 0) {
      slot0El.style.borderColor = 'var(--amber)';
      slot0El.style.color = 'var(--amber)';
      slot1El.style.borderColor = 'var(--line)';
      slot1El.style.color = '#8ba0b4';
    } else {
      slot1El.style.borderColor = 'var(--amber)';
      slot1El.style.color = 'var(--amber)';
      slot0El.style.borderColor = 'var(--line)';
      slot0El.style.color = '#8ba0b4';
    }
  }
}

export function addTracer(from, to, life = 0.07, color = null) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const m = color ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }) : tracerM.clone();
  const line = new THREE.Line(g, m);
  scene.add(line);
  tracers.push({ line, life, max: life });
}

export function addPuff(p, color = 0xd8d2c2) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  m.position.copy(p);
  scene.add(m);
  puffs.push({ m, life: 0.35 });
}

export function updateFX(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = 0.9 * (t.life / t.max);
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life -= dt;
    p.m.scale.multiplyScalar(1 + 4 * dt);
    p.m.material.opacity = clamp(p.life / 0.35, 0, 1) * 0.85;
    if (p.life <= 0) {
      scene.remove(p.m);
      p.m.geometry.dispose();
      p.m.material.dispose();
      puffs.splice(i, 1);
    }
  }
  if (gunKick > 0) {
    gunKick = Math.max(0, gunKick - 8 * dt);
  }
  gun.position.z = -0.55 + gunKick * 0.09;
  gun.rotation.x = gunKick * 0.10;
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - 30 * dt);
}

let hitTimer: any = null;
export function showHitmarker(kill) {
  const h = el('hitmarker');
  h.classList.toggle('kill', !!kill);
  h.style.opacity = "1";
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { h.style.opacity = "0"; }, kill ? 220 : 110);
}

const _dir = new THREE.Vector3();
function raySphereDist(origin, dir, center, r) {
  const ocx = center.x - origin.x, ocy = center.y - origin.y, ocz = center.z - origin.z;
  const t = ocx * dir.x + ocy * dir.y + ocz * dir.z;
  if (t < 0) return -1;
  const d2 = (ocx * ocx + ocy * ocy + ocz * ocz) - t * t;
  if (d2 > r * r) return -1;
  return t - Math.sqrt(r * r - d2);
}

function terrainRayHit(origin, dir, maxDist) {
  for (let d = 2; d < maxDist; d += 2) {
    const px = origin.x + dir.x * d, py = origin.y + dir.y * d, pz = origin.z + dir.z * d;
    if (py < terrainHeight(px, pz)) return d;
  }
  return maxDist;
}

export function tryFire(now) {
  if (!G.running || weap.reloading) return;
  if ((G as any).stage !== 'playing' && (G as any).stage !== 'lobby') return;
  if (now - weap.lastShot < weap.def.interval) return;
  if (weap.mag <= 0) {
    blip(150, 0.06, 0.15, 'square');
    weap.lastShot = now + 150;
    startReload();
    return;
  }
  weap.lastShot = now;
  weap.mag--;
  updateAmmoHUD();
  playShot(1, 1);
  gunKick = 1;
  player.pitch = clamp(player.pitch + 0.006, -1.52, 1.52);
  player.lastShotTime = performance.now();

  camera.getWorldDirection(_dir);
  _dir.x += rand(-1, 1) * weap.def.spread;
  _dir.y += rand(-1, 1) * weap.def.spread;
  _dir.z += rand(-1, 1) * weap.def.spread;
  _dir.normalize();
  const origin = camera.position.clone();

  const terrDist = terrainRayHit(origin, _dir, 300);
  let best = null, bestRemoteId = null, bestD = terrDist;
  
  for (const b of bots) {
    if (b.dead) continue;
    const center = b.group.position.clone();
    center.y += 1.1;
    const d = raySphereDist(origin, _dir, center, 1.05);
    if (d > 0 && d < bestD) {
      best = b;
      bestRemoteId = null;
      bestD = d;
    }
  }

  remotePlayers.forEach((rp, sessionId) => {
    if (rp.hp <= 0) return;
    const center = rp.group.position.clone();
    center.y += 1.1;
    const d = raySphereDist(origin, _dir, center, 1.05);
    if (d > 0 && d < bestD) {
      best = null;
      bestRemoteId = sessionId;
      bestD = d;
    }
  });

  const hitPoint = origin.clone().addScaledVector(_dir, bestD);
  const muzzle = new THREE.Vector3(0.3, -0.25, -0.9).applyMatrix4(camera.matrixWorld);
  addTracer(muzzle, hitPoint);
  muzzleLight.position.copy(muzzle);
  muzzleLight.intensity = 2.4;

  // Broadcast shot tracer to multiplayer server
  sendShoot(muzzle, _dir);

  if (best) {
    damageBot(best, weap.def.dmg);
  } else if (bestRemoteId) {
    sendHit(bestRemoteId, weap.def.dmg);
    showHitmarker(false);
  } else {
    addPuff(hitPoint);
  }
  
  // Alert nearby wandering bots to player gunfire
  bots.forEach(b => {
    if (!b.dead && b.state === 'wander') {
      const d = b.group.position.distanceTo(player.pos);
      if (d < 65) {
        b.state = 'chase';
        b.target.copy(player.pos);
        b.loseSightAt = now + 4000;
      }
    }
  });

  if (weap.mag === 0) startReload();
}
