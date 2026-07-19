'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { SkeletonUtils } from 'https://unpkg.com/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { G } from './state';
import { camera, scene } from './engine';
import { terrainHeight, collidersNear } from './terrain';
import { playStep, playHurt, playSting } from './audio';
import { clamp, el, fmtTime } from './utils';
import { aliveBots } from './bots';
import { ASSETS } from './assets';
import { room, sendHit } from './multiplayer';

export let playerGroup = null;
export let playerMixer = null;
let playerActions = {};
let playerCurrentAction = null;

export const player = {
  pos: new THREE.Vector3(0, 0, 0),
  velY: 0,
  velX: 0,
  velZ: 0,
  onGround: true,
  wasOnGround: true,
  crouching: false,
  bobTime: 0,
  landDip: 0,
  yaw: 0,
  pitch: 0,
  radius: 0.5,
  eye: 1.7,
  speed: 6.2,
  sprint: 9.0,
  lastStep: 0,
  activeWeaponDef: null,
  lastWeaponName: '',
  thirdPerson: false,
  lastShotTime: 0,
};

player.pos.y = terrainHeight(0, 0);

export let dmgFlash = 0;
export function setDmgFlash(val) {
  dmgFlash = val;
}

export function setupInput() {
  document.addEventListener('mousemove', e => {
    if (!G.locked) return;
    player.yaw   -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = clamp(player.pitch, -1.52, 1.52);
  });
}

function fadeToPlayerAction(name, duration = 0.22) {
  if (!playerMixer || !playerActions || !playerActions[name]) return;
  const next = playerActions[name];
  if (playerCurrentAction === name) return;
  
  const prev = playerCurrentAction ? playerActions[playerCurrentAction] : null;
  next.reset();
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  
  if (prev) {
    prev.crossFadeTo(next, duration, true);
  } else {
    next.fadeIn(duration);
  }
  
  next.play();
  playerCurrentAction = name;
}

export function initPlayerModel() {
  if (playerGroup) {
    scene.remove(playerGroup);
  }
  playerGroup = new THREE.Group();
  playerGroup.visible = player.thirdPerson;
  scene.add(playerGroup);
  
  const charModel = ASSETS.characters['VIPER']; // Default player model skin (Swat character)
  if (charModel) {
    const model = SkeletonUtils.clone(charModel);
    model.scale.setScalar(0.95);
    model.rotation.y = Math.PI; // Face opposite yaw vector
    playerGroup.add(model);
    
    // Setup animations
    playerMixer = new THREE.AnimationMixer(model);
    playerActions = {};
    if (charModel.animations && charModel.animations.length > 0) {
      charModel.animations.forEach(clip => {
        playerActions[clip.name] = playerMixer.clipAction(clip);
      });
    }
    
    // Start with Idle_Gun
    const idle = playerActions['Idle_Gun'] || playerActions['Idle'];
    if (idle) {
      idle.play();
      playerCurrentAction = idle._clip.name;
    }
    
    // Attach weapon
    player.lastWeaponName = '';
    updatePlayerWeaponModel();
  }
}

export function updatePlayerWeaponModel() {
  if (!playerGroup) return;
  const modelRoot = playerGroup.children[0];
  if (!modelRoot) return;
  
  // Remove existing weapon attachments
  const toRemove = [];
  modelRoot.traverse(node => {
    if (node.name === 'player_weapon') toRemove.push(node);
  });
  toRemove.forEach(node => {
    node.parent.remove(node);
    node.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
  });
  
  // Attach active weapon model
  const currentWeap = player.activeWeaponDef || { name: 'M4 CARBINE' };
  const isDmr = currentWeap.name === 'MK-2 DMR';
  const isSmg = currentWeap.name === 'MP5 SMG';
  const weaponTemplate = isDmr ? ASSETS.weapons.dmr : ASSETS.weapons.rifle;
  
  if (weaponTemplate) {
    const botGun = weaponTemplate.clone();
    botGun.name = 'player_weapon';
    const scl = isSmg ? 0.095 : 0.12;
    botGun.scale.setScalar(scl);
    botGun.rotation.y = Math.PI; 
    botGun.rotation.x = Math.PI / 2;
    botGun.position.set(0, -0.05, 0.05); 
    
    let rightHand = null;
    modelRoot.traverse(node => {
      if (node.isBone && (
        node.name.includes('Hand_R') || 
        node.name.includes('hand_r') || 
        node.name.includes('RightHand') || 
        node.name.includes('hand.R')
      )) {
        rightHand = node;
      }
    });
    
    if (rightHand) {
      rightHand.add(botGun);
    } else {
      // Fallback alignment directly to model root
      botGun.position.set(0.2 * 2.5, 1.2, -0.3 * 2.5);
      modelRoot.add(botGun);
    }
  }
}

export function updatePlayer(dt) {
  const k = G.keys;
  
  // Dynamically update third-person weapon model if switched
  const currentWeapName = player.activeWeaponDef ? player.activeWeaponDef.name : '';
  if (player.lastWeaponName !== currentWeapName) {
    player.lastWeaponName = currentWeapName;
    updatePlayerWeaponModel();
  }
  
  if ((G as any).stage !== 'playing' && (G as any).stage !== 'lobby') {
    if (playerGroup) {
      playerGroup.position.copy(player.pos);
      playerGroup.rotation.y = player.yaw;
      
      if (playerMixer) {
        playerMixer.update(dt);
        let act = 'Idle_Gun';
        if ((G as any).stage === 'freefall') {
          act = 'Idle_Neutral';
        } else if ((G as any).stage === 'parachute') {
          act = 'Idle_Gun_Pointing';
        }
        fadeToPlayerAction(act, 0.12);
      }
    }
    return;
  }
  
  // 1. Crouch State Check
  player.crouching = (k['ControlLeft'] || k['KeyC']);
  const targetEye = player.crouching ? 0.95 : 1.7;
  player.eye += (targetEye - player.eye) * dt * 10; // smooth crouch transition
  
  let mx = 0, mz = 0;
  if (k['KeyW']) mz += 1;
  if (k['KeyS']) mz -= 1;
  if (k['KeyA']) mx -= 1;
  if (k['KeyD']) mx += 1;
  const moving = (mx !== 0 || mz !== 0);

  // 2. Velocity-based Locomotion (Inertia & Momentum)
  let targetVelX = 0;
  let targetVelZ = 0;
  
  if (moving) {
    const inv = 1 / Math.hypot(mx, mz);
    mx *= inv;
    mz *= inv;
    
    // Speed adjustments
    let sp = player.speed;
    if (player.crouching) {
      sp = player.speed * 0.45;
    } else if (k['ShiftLeft'] || k['ShiftRight']) {
      sp = player.sprint;
    }
    
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    targetVelX = (-sy * mz + cy * mx) * sp;
    targetVelZ = (-cy * mz - sy * mx) * sp;
    
    const accel = player.onGround ? 8.5 : 3.0; // less control mid-air
    player.velX += (targetVelX - player.velX) * accel * dt;
    player.velZ += (targetVelZ - player.velZ) * accel * dt;
  } else {
    const decel = player.onGround ? 12.0 : 2.0; // slide slightly in air
    player.velX += (0 - player.velX) * decel * dt;
    player.velZ += (0 - player.velZ) * decel * dt;
  }
  
  // Apply horizontal velocity
  player.pos.x += player.velX * dt;
  player.pos.z += player.velZ * dt;
  
  // Wall collision: push out of obstacle circles
  for (const c of collidersNear(player.pos.x, player.pos.z)) {
    const ox = player.pos.x - c.x, oz = player.pos.z - c.z;
    const d = Math.hypot(ox, oz), min = c.r + player.radius;
    if (d < min && d > 0.0001) {
      const push = (min - d) / d;
      player.pos.x += ox * push;
      player.pos.z += oz * push;
    }
  }

  // Play footstep sounds
  const speedMag = Math.hypot(player.velX, player.velZ);
  if (player.onGround && speedMag > 0.15) {
    const stepInterval = player.crouching ? 550 : ((k['ShiftLeft'] || k['ShiftRight']) ? 280 : 380);
    if (performance.now() - player.lastStep > stepInterval) {
      playStep();
      player.lastStep = performance.now();
    }
  }

  // Update third person character model position, rotation, and animation state
  if (playerGroup) {
    playerGroup.position.copy(player.pos);
    playerGroup.rotation.y = player.yaw;
    
    // Check if active weapon changed to swap the 3D model
    const currentWeaponName = player.activeWeaponDef ? player.activeWeaponDef.name : 'M4 CARBINE';
    if (player.lastWeaponName !== currentWeaponName) {
      player.lastWeaponName = currentWeaponName;
      updatePlayerWeaponModel();
    }
    
    if (playerMixer) {
      playerMixer.update(dt);
      
      let act = 'Idle_Gun';
      const now = performance.now();
      const recentlyFired = (now - player.lastShotTime < 1200);
      const isSprinting = (k['ShiftLeft'] || k['ShiftRight']) && speedMag > 0.15;

      if (G.firing) {
        if (speedMag > 0.15) {
          act = 'Run_Shoot';
        } else {
          act = 'Idle_Gun_Shoot';
        }
      } else if (!player.onGround) {
        act = recentlyFired ? 'Idle_Gun_Pointing' : 'Idle_Gun';
      } else if (isSprinting) {
        act = 'Run';
      } else if (speedMag > 0.15) {
        act = 'Walk';
      } else if (recentlyFired) {
        act = 'Idle_Gun_Pointing';
      } else {
        act = 'Idle_Gun';
      }
      fadeToPlayerAction(act, 0.12);
    }
  }

  // 3. Gravity, Jump, and Landing Impact (Basic Physics Engine)
  const ground = ((G as any).stage === 'lobby') ? 98.0 : terrainHeight(player.pos.x, player.pos.z);
  
  if (k['Space'] && player.onGround) {
    player.velY = 7.5;
    player.onGround = false;
  }
  
  player.velY -= 22 * dt;
  player.velY = Math.max(player.velY, -40); // terminal velocity limit
  player.pos.y += player.velY * dt;
  
  if (player.pos.y <= ground) {
    player.pos.y = ground;
    
    // Land detection
    if (!player.wasOnGround) {
      const landSpeed = -player.velY;
      
      // Fall damage check
      if (landSpeed > 10.5) {
        const dmg = Math.round((landSpeed - 10.5) * 5);
        if (dmg > 5) hurtPlayer(dmg, 'FALL DAMAGE');
      }
      
      // Visual land impact compression
      player.landDip = clamp(landSpeed * 0.045, 0, 0.45);
      playStep();
    }
    
    player.velY = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
  player.wasOnGround = player.onGround;

  // Visual land dip decay
  player.landDip += (0 - player.landDip) * dt * 10;

  // 4. Procedural Locomotion Bobbing
  if (player.onGround && speedMag > 0.15) {
    player.bobTime += dt * speedMag * 1.5;
  } else {
    player.bobTime += (0 - player.bobTime) * dt * 5;
  }
  const bobY = Math.sin(player.bobTime) * 0.035 * clamp(speedMag / player.speed, 0, 1.5);
  const bobX = Math.cos(player.bobTime * 0.5) * 0.02 * clamp(speedMag / player.speed, 0, 1.5);

  // Set camera matrices based on viewpoint mode (First-Person vs Third-Person orbital)
  if (player.thirdPerson && playerGroup) {
    const dist = 3.4; // camera distance behind character
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const sp = Math.sin(player.pitch), cp = Math.cos(player.pitch);
    
    // Position camera offset behind player pos + eye height
    const bx = sy * cp * dist;
    const bz = cy * cp * dist;
    const by = -sp * dist + 0.35; // elevate camera height slightly
    
    const camTargetX = player.pos.x + bx;
    const camTargetY = player.pos.y + player.eye + by;
    const camTargetZ = player.pos.z + bz;
    const g = terrainHeight(camTargetX, camTargetZ);
    
    camera.position.set(camTargetX, Math.max(camTargetY, g + 0.35), camTargetZ);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  } else {
    const targetCamY = player.pos.y + player.eye - player.landDip + bobY;
    camera.position.set(player.pos.x + bobX, targetCamY, player.pos.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }
}

// ---------------------------------------------------- Player health & damage
export function hurtPlayer(dmg, source) {
  if (!G.running || G.over) return;
  if ((G as any).stage !== 'playing') return;
  if (room && dmg > 0) {
    sendHit(room.sessionId, dmg);
    return;
  }
  if (G.shield > 0) {
    const absorbed = Math.min(G.shield, dmg * 0.65);
    G.shield -= absorbed;
    dmg -= absorbed;
  }
  G.hp -= dmg;
  playHurt();
  dmgFlash = 1;
  updateVitalsHUD();
  if (G.hp <= 0) {
    G.hp = 0;
    die(source);
  }
}

export function updateVitalsHUD() {
  el('hpNum').textContent = Math.ceil(G.hp).toString();
  el('shNum').textContent = Math.ceil(G.shield).toString();
  el('hpFill').style.width = clamp(G.hp, 0, 100) + '%';
  el('shFill').style.width = clamp(G.shield / 50 * 100, 0, 100) + '%';
  el('lowhp').classList.toggle('hidden', !(G.hp < 30 && G.hp > 0 && G.running));
}

export function updateAlive() {
  el('aliveNum').textContent = (aliveBots() + (G.hp > 0 ? 1 : 0)).toString();
}

function die(source) {
  G.over = true;
  G.running = false;
  document.exitPointerLock();
  playSting(false);
  
  if (playerMixer && playerActions['Death']) {
    const deathAct = playerActions['Death'];
    deathAct.setLoop(THREE.LoopOnce);
    deathAct.clampWhenFinished = true;
    fadeToPlayerAction('Death', 0.08);
  }
  
  const placement = aliveBots() + 1;
  el('deathStats').innerHTML =
    'Eliminated by <b>' + (source || 'THE ZONE') + '</b><br>' +
    'Placement <b>#' + placement + '</b> of 100 &nbsp;·&nbsp; Kills <b>' + G.kills + '</b> &nbsp;·&nbsp; Survived <b>' + fmtTime(G.timeAlive) + '</b>';
  el('hud').style.display = 'none';
  el('lowhp').classList.add('hidden');
  el('dmgVignette').style.opacity = '0';
  el('zoneVignette').style.opacity = '0';
  setTimeout(() => el('deathScreen').classList.remove('hidden'), 600);
}

export function checkWin() {
  if (G.over || aliveBots() > 0) return;
  G.over = true;
  G.running = false;
  document.exitPointerLock();
  playSting(true);
  el('winStats').innerHTML =
    'Placement <b>#1</b> of 100 &nbsp;·&nbsp; Kills <b>' + G.kills + '</b> &nbsp;·&nbsp; Survived <b>' + fmtTime(G.timeAlive) + '</b>';
  el('hud').style.display = 'none';
  el('lowhp').classList.add('hidden');
  el('dmgVignette').style.opacity = '0';
  el('zoneVignette').style.opacity = '0';
  setTimeout(() => el('winScreen').classList.remove('hidden'), 600);
}
