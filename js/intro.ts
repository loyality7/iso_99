'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { scene, camera } from './engine';
import { G } from './state';
import { player } from './player';
import { bots, drawLabel } from './bots';
import { terrainHeight } from './terrain';
import { el } from './utils';
import { addFeed } from './ui';

export let lobbyPlatform: THREE.Group | null = null;
export let planeMesh: THREE.Group | null = null;
export let playerChuteMesh: THREE.Group | null = null;

// Plane configuration
export const planeStart = new THREE.Vector3(-320, 140, -320);
export const planeEnd = new THREE.Vector3(320, 140, 320);
export const planeDir = new THREE.Vector3().subVectors(planeEnd, planeStart).normalize();
export const planePos = new THREE.Vector3().copy(planeStart);
export let planeProgress = 0;
export const planeSpeed = 48; // units per second

// Warmup config
export let lobbyTimeLeft = 10; // 10 second countdown
let lobbyInterval: any = null;

// UI elements created dynamically
let lobbyHUD: HTMLElement | null = null;
let planeHUD: HTMLElement | null = null;
let freefallHUD: HTMLElement | null = null;

function createPlaneMesh() {
  const group = new THREE.Group();
  
  // Fuselage
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.2, 18, 8),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  
  // Wings
  const wings = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.4, 4.2),
    new THREE.MeshLambertMaterial({ color: 0x8a9296 })
  );
  wings.position.set(0, 0, 1);
  group.add(wings);
  
  // Engines
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x2e3236 });
  const engL = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 6), engineMat);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-6, -0.6, 1);
  
  const engR = engL.clone();
  engR.position.x = 6;
  group.add(engL, engR);
  
  // Tail fins
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 4.5, 3.2),
    new THREE.MeshLambertMaterial({ color: 0xd35450 }) // Orange/Red tail
  );
  tail.position.set(0, 2.4, -7.5);
  group.add(tail);
  
  const horizontalTail = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.2, 2.4),
    new THREE.MeshLambertMaterial({ color: 0x8a9296 })
  );
  horizontalTail.position.set(0, 0.5, -7.5);
  group.add(horizontalTail);
  
  scene.add(group);
  return group;
}

export function createParachuteMesh(colorHex = 0xd35450) {
  const group = new THREE.Group();
  
  // Canopy dome
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
    new THREE.MeshLambertMaterial({ color: colorHex, side: THREE.DoubleSide })
  );
  canopy.position.set(0, 4.8, 0);
  group.add(canopy);
  
  // Connect lines
  const stringMat = new THREE.LineBasicMaterial({ color: 0xcccccc });
  const lines = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-2.2, 4.8, 0)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.2, 4.8, 0)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.8, -2.2)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.8, 2.2)]
  ];
  
  lines.forEach(pts => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geo, stringMat));
  });
  
  return group;
}

export function initIntroSystem() {
  G.stage = 'lobby';
  lobbyTimeLeft = 10;
  planeProgress = 0;
  planePos.copy(planeStart);
  
  // Build lobby platform with safety walls
  if (lobbyPlatform) scene.remove(lobbyPlatform);
  lobbyPlatform = new THREE.Group();
  
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 80), new THREE.MeshLambertMaterial({ color: 0x22262a }));
  floor.position.y = 96;
  lobbyPlatform.add(floor);
  
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x495057, transparent: true, opacity: 0.35 });
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(80, 8, 1), wallMat);
  w1.position.set(0, 100, -40);
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(80, 8, 1), wallMat);
  w2.position.set(0, 100, 40);
  const w3 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 80), wallMat);
  w3.position.set(40, 100, 0);
  const w4 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 80), wallMat);
  w4.position.set(-40, 100, 0);
  
  lobbyPlatform.add(w1, w2, w3, w4);
  scene.add(lobbyPlatform);
  
  // Position local player on lobby pad
  player.pos.set(0, 99, 0);
  player.velY = 0;
  player.velX = 0;
  player.velZ = 0;
  
  // Setup Lobby HUD
  if (!lobbyHUD) {
    lobbyHUD = document.createElement('div');
    lobbyHUD.id = 'lobbyHUD';
    lobbyHUD.style.cssText = 'position:absolute; top:15%; left:50%; transform:translate(-50%,-50%); text-align:center; color:#fff; font-family:ui-monospace, Consolas, monospace; z-index:100; pointer-events:none; background:rgba(10,14,20,0.85); border:1.5px solid rgba(255, 180, 84, 0.35); border-radius:12px; padding:18px 36px; box-shadow:0 12px 40px rgba(0,0,0,0.6); backdrop-filter:blur(8px); webkit-backdrop-filter:blur(8px);';
    document.body.appendChild(lobbyHUD);
  }
  lobbyHUD.style.display = 'block';
  lobbyHUD.innerHTML = `<h1 style="font-size:24px; text-shadow:0 2px 4px rgba(0,0,0,0.8); margin:0;">WARMUP LOBBY</h1><p id="lobbyTimer" style="font-size:42px; color:var(--amber); text-shadow:0 0 8px rgba(0,0,0,0.8); margin:4px 0 0 0; font-weight:bold;">${lobbyTimeLeft}s</p>`;
  
  // Spawn bots on lobby platform
  bots.forEach((b, idx) => {
    const angle = (idx / bots.length) * Math.PI * 2;
    const r = 5 + Math.random() * 25;
    b.group.position.set(Math.cos(angle) * r, 98.5, Math.sin(angle) * r);
    b.dead = false;
    b.health = 100;
    b.shield = 100;
    b.state = 'wander';
    b.target.copy(b.group.position);
    // Assign random takeoff eject distances for flight path later
    (b as any).jumpProgress = 40 + Math.random() * 560;
    (b as any).freefalling = false;
    (b as any).parachuting = false;
    if ((b as any).chuteMesh) {
      b.group.remove((b as any).chuteMesh);
      (b as any).chuteMesh = null;
    }
    drawLabel(b);
  });
  
  // Start countdown
  if (lobbyInterval) clearInterval(lobbyInterval);
  lobbyInterval = setInterval(() => {
    lobbyTimeLeft--;
    const tEl = el('lobbyTimer');
    if (tEl) tEl.textContent = `${lobbyTimeLeft}s`;
    
    if (lobbyTimeLeft <= 0) {
      clearInterval(lobbyInterval);
      boardAirplane();
    }
  }, 1000);
}

function boardAirplane() {
  G.stage = 'plane';
  if (lobbyHUD) lobbyHUD.style.display = 'none';
  
  // Remove lobby platform
  if (lobbyPlatform) {
    scene.remove(lobbyPlatform);
    lobbyPlatform = null;
  }
  
  // Spawn Airplane
  planeProgress = 0;
  planePos.copy(planeStart);
  planeMesh = createPlaneMesh();
  
  // Set initial view looking down the flight path (directly behind the plane)
  player.yaw = Math.atan2(planeDir.x, planeDir.z) + Math.PI;
  player.pitch = 0.22;
  
  if (!planeHUD) {
    planeHUD = document.createElement('div');
    planeHUD.id = 'planeHUD';
    planeHUD.style.cssText = 'position:absolute; top:20%; left:50%; transform:translate(-50%,-50%); text-align:center; color:#fff; font-family:ui-monospace, Consolas, monospace; z-index:100; pointer-events:none; background:rgba(10,14,20,0.85); border:1.5px solid rgba(255, 180, 84, 0.35); border-radius:12px; padding:18px 36px; box-shadow:0 12px 40px rgba(0,0,0,0.6); backdrop-filter:blur(8px); webkit-backdrop-filter:blur(8px);';
    document.body.appendChild(planeHUD);
  }
  planeHUD.style.display = 'block';
  planeHUD.innerHTML = `<h1 style="font-size:28px; text-shadow:0 2px 5px rgba(0,0,0,0.85); margin:0;">IN TRANSIT</h1><p style="font-size:18px; text-shadow:0 2px 3px rgba(0,0,0,0.8); margin:12px 0 0 0; background:rgba(8,12,16,0.72); padding:8px 20px; border-radius:4px; border:1.5px solid var(--amber);">PRESS SPACE TO EJECT</p>`;
  
  addFeed('All combatants boarded the drop plane.');
}

export function ejectPlayer() {
  if (G.stage !== 'plane') return;
  G.stage = 'freefall';
  if (planeHUD) planeHUD.style.display = 'none';
  
  player.pos.copy(planePos);
  player.velY = -5; // initial drop velocity
  player.velX = planeDir.x * 20; // carry forward inertia
  player.velZ = planeDir.z * 20;
  
  if (!freefallHUD) {
    freefallHUD = document.createElement('div');
    freefallHUD.id = 'freefallHUD';
    freefallHUD.style.cssText = 'position:absolute; bottom:18%; left:50%; transform:translate(-50%,0); text-align:center; color:#fff; font-family:ui-monospace, Consolas, monospace; z-index:100; pointer-events:none; background:rgba(10,14,20,0.85); border:1.5px solid rgba(93, 184, 255, 0.35); border-radius:12px; padding:12px 24px; box-shadow:0 12px 40px rgba(0,0,0,0.6); backdrop-filter:blur(8px); webkit-backdrop-filter:blur(8px);';
    document.body.appendChild(freefallHUD);
  }
  freefallHUD.style.display = 'block';
  freefallHUD.innerHTML = `<p style="font-size:16px; background:rgba(0,0,0,0.6); padding:6px 16px; border-radius:4px; border:1px solid #7ee08c;">FREEFALLING<br><small style="color:#bbb;">PRESS SPACE / F TO DEPLOY PARACHUTE</small></p>`;
  
  addFeed('You ejected from the drop plane.');
}

export function deployParachute() {
  if (G.stage !== 'freefall') return;
  G.stage = 'parachute';
  
  if (freefallHUD) {
    freefallHUD.innerHTML = `<p style="font-size:16px; background:rgba(0,0,0,0.6); padding:6px 16px; border-radius:4px; border:1px solid #5db8ff;">PARACHUTING GLIDE<br><small style="color:#bbb;">STEER WITH W/A/S/D TOWARDS SHORE</small></p>`;
  }
  
  // Attach parachute mesh to camera or playerGroup
  import('./player').then(m => {
    if (m.playerGroup) {
      playerChuteMesh = createParachuteMesh(0xd35450); // Red parachute canopy
      m.playerGroup.add(playerChuteMesh);
    }
  });
}

export function updateIntroSystem(dt: number) {
  const keys = G.keys;
  
  // 1. Lobby Stage Clamping
  if (G.stage === 'lobby') {
    // Keep local player inside platform bounds
    player.pos.x = clamp(player.pos.x, -37, 37);
    player.pos.z = clamp(player.pos.z, -37, 37);
    player.pos.y = 98; // Lock to floor height
    player.velY = 0;
    
    // Clamp bots inside lobby
    bots.forEach(b => {
      b.group.position.x = clamp(b.group.position.x, -37, 37);
      b.group.position.z = clamp(b.group.position.z, -37, 37);
      b.group.position.y = 98;
    });
    return;
  }
  
  // 2. Airplane Transit Stage
  if (G.stage === 'plane') {
    planeProgress += dt * planeSpeed;
    planePos.copy(planeStart).addScaledVector(planeDir, planeProgress);
    
    if (planeMesh) {
      planeMesh.position.copy(planePos);
      planeMesh.rotation.y = Math.atan2(planeDir.x, planeDir.z);
    }
    
    // Force eject if plane reached the map bounds limit
    if (planeProgress >= 640) {
      ejectPlayer();
    } else if (keys['Space']) {
      ejectPlayer();
    }
    
    // Lock player position to plane
    player.pos.copy(planePos);
    player.velY = 0;
    
    // Position camera dynamically trailing the plane with 3D orbital control
    const dist = 32;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const sp = Math.sin(player.pitch), cp = Math.cos(player.pitch);
    
    const camTargetX = planePos.x + sy * cp * dist;
    const camTargetZ = planePos.z + cy * cp * dist;
    const camTargetY = planePos.y - sp * dist + 5.0;
    const g = terrainHeight(camTargetX, camTargetZ);
    
    camera.position.set(camTargetX, Math.max(camTargetY, g + 1.0), camTargetZ);
    camera.lookAt(planePos);
    
    // Check bot jump progress triggers
    bots.forEach(b => {
      if (!(b as any).freefalling && !(b as any).parachuting && planeProgress >= (b as any).jumpProgress) {
        (b as any).freefalling = true;
        b.group.position.copy(planePos);
        // Random drift landing coordinate
        b.target.set(
          planePos.x + (Math.random() - 0.5) * 160,
          0,
          planePos.z + (Math.random() - 0.5) * 160
        );
        b.target.y = terrainHeight(b.target.x, b.target.z);
      }
    });
    return;
  }
  
  // 3. Freefalling & Parachuting Locomotion Physics
  if (G.stage === 'freefall' || G.stage === 'parachute') {
    const isChute = G.stage === 'parachute';
    
    // Apply gravity deceleration
    const gravity = isChute ? 8 : 18;
    player.velY -= gravity * dt;
    
    // Terminal descent limit capping
    const terminalSpeed = isChute ? -4.5 : -35;
    player.velY = Math.max(player.velY, terminalSpeed);
    
    // Horizontal Glide Steering controls
    let moveX = 0;
    let moveZ = 0;
    if (keys['KeyW']) moveZ += 1;
    if (keys['KeyS']) moveZ -= 1;
    if (keys['KeyA']) moveX -= 1;
    if (keys['KeyD']) moveX += 1;
    
    if (moveX !== 0 || moveZ !== 0) {
      const dirLength = Math.hypot(moveX, moveZ);
      const yawSin = Math.sin(player.yaw);
      const yawCos = Math.cos(player.yaw);
      
      const forwardX = -yawSin * (moveZ / dirLength);
      const forwardZ = -yawCos * (moveZ / dirLength);
      const strafeX = yawCos * (moveX / dirLength);
      const strafeZ = -yawSin * (moveX / dirLength);
      
      const glideSpeed = isChute ? 12 : 28;
      player.pos.x += (forwardX + strafeX) * glideSpeed * dt;
      player.pos.z += (forwardZ + strafeZ) * glideSpeed * dt;
    }
    
    // Apply vertical coordinate delta
    player.pos.y += player.velY * dt;
    
    // Ground detection checks
    const ground = terrainHeight(player.pos.x, player.pos.z);
    
    // Deploy chute if they manually trigger it via Space or F keys
    if (!isChute && (keys['KeyF'] || keys['Space'])) {
      deployParachute();
    }
    
    // Landing collision trigger
    if (player.pos.y <= ground) {
      player.pos.y = ground;
      player.velY = 0;
      const wasFreefalling = (G.stage === 'freefall');
      G.stage = 'playing';
      
      // Remove local parachute visual
      import('./player').then(m => {
        if (m.playerGroup && playerChuteMesh) {
          m.playerGroup.remove(playerChuteMesh);
          playerChuteMesh = null;
        }
        
        if (wasFreefalling) {
          // Crash landed!
          m.hurtPlayer(85, 'CRASH LANDING');
        }
      });
      
      if (freefallHUD) freefallHUD.style.display = 'none';
      if (planeMesh) {
        scene.remove(planeMesh);
        planeMesh = null;
      }
      
      if (wasFreefalling) {
        addFeed('⚠️ Crash landed without a parachute! Taken 85 damage.');
      } else {
        addFeed('Landed safely on the island — Get ready!');
      }
    }
    
    // Camera orbital lock trailing the player falling with 3D look control
    const dist = isChute ? 10 : 14;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const sp = Math.sin(player.pitch), cp = Math.cos(player.pitch);
    
    const camTargetX = player.pos.x + sy * cp * dist;
    const camTargetZ = player.pos.z + cy * cp * dist;
    const camTargetY = player.pos.y - sp * dist + (isChute ? 2.5 : 3.5);
    const g = terrainHeight(camTargetX, camTargetZ);
    
    camera.position.set(camTargetX, Math.max(camTargetY, g + 0.5), camTargetZ);
    camera.lookAt(player.pos);
  }
  
  // 4. Update Freefalling/Parachuting Bots
  bots.forEach(b => {
    const isF = (b as any).freefalling;
    const isP = (b as any).parachuting;
    if (!isF && !isP) return;
    
    const bg = b.group;
    const ground = terrainHeight(bg.position.x, bg.position.z);
    
    if (isF) {
      bg.position.y -= 30 * dt; // Rapid descent
      // Drift slowly towards target landing spot
      const dx = b.target.x - bg.position.x;
      const dz = b.target.z - bg.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1) {
        bg.position.x += (dx / dist) * 22 * dt;
        bg.position.z += (dz / dist) * 22 * dt;
      }
      
      if (bg.position.y - ground <= 35) {
        (b as any).freefalling = false;
        (b as any).parachuting = true;
        // Attach parachute visual
        const chute = createParachuteMesh(0x5a9d6); // Blue parachute for bots
        (b as any).chuteMesh = chute;
        bg.add(chute);
      }
    } else if (isP) {
      bg.position.y -= 4.2 * dt; // Slow parachute descent
      
      const dx = b.target.x - bg.position.x;
      const dz = b.target.z - bg.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1) {
        bg.position.x += (dx / dist) * 11 * dt;
        bg.position.z += (dz / dist) * 11 * dt;
        bg.rotation.y = Math.atan2(dx, dz);
      }
      
      if (bg.position.y <= ground) {
        bg.position.y = ground;
        (b as any).parachuting = false;
        if ((b as any).chuteMesh) {
          bg.remove((b as any).chuteMesh);
          (b as any).chuteMesh = null;
        }
      }
    }
  });
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
