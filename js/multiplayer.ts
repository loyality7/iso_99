import { Client, Room, Callbacks } from '@colyseus/sdk';
import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { SkeletonUtils } from 'https://unpkg.com/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { scene, camera } from './engine';
import { player, updateVitalsHUD, setDmgFlash } from './player';
import { G } from './state';
import { ASSETS } from './assets';
import { addFeed } from './ui';
import { addTracer } from './weapon';
import { playHurt } from './audio';
import { createParachuteMesh } from './intro';
import { terrainHeight } from './terrain';

export let client: Client | null = null;
export let room: Room | null = null;
export const remotePlayers = new Map(); // sessionId -> remotePlayerState

export function initMultiplayer() {
  const host = window.location.hostname === 'localhost' ? 'localhost:2567' : window.location.host;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  client = new Client(`${protocol}//${host}`);
  console.log('Connecting to Colyseus multiplayer server...');
  
  client.joinOrCreate('battle_room').then(joinedRoom => {
    room = joinedRoom;
    console.log('Joined room:', room.sessionId);
    addFeed('Connected to multiplayer server.');
    
    const callbacks = Callbacks.get(room);
    
    // Sync newly joined players
    callbacks.onAdd('players', (networkPlayer: any, sessionId: string) => {
      if (sessionId === room.sessionId) {
        // Align local player position with server-assigned coordinates
        player.pos.set(networkPlayer.x, networkPlayer.y, networkPlayer.z);
        
        // Listen to own health and shield updates from server
        callbacks.listen(networkPlayer, 'hp', (value, prevValue) => {
          if (value < prevValue) {
            setDmgFlash(1.0);
            playHurt();
          }
          G.hp = value;
          updateVitalsHUD();
          if (G.hp <= 0 && G.running) {
            import('./player').then(m => m.hurtPlayer(0, 'ANOTHER PLAYER'));
          }
        });
        
        callbacks.listen(networkPlayer, 'shield', (value) => {
          G.shield = value;
          updateVitalsHUD();
        });
        return;
      }
      
      spawnRemotePlayer(sessionId, networkPlayer);

      // Listen to remote player coordinate changes for smooth interpolation
      callbacks.listen(networkPlayer, 'x', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.targetPos.x = val;
      });
      callbacks.listen(networkPlayer, 'y', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.targetPos.y = val;
      });
      callbacks.listen(networkPlayer, 'z', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.targetPos.z = val;
      });
      callbacks.listen(networkPlayer, 'yaw', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.targetYaw = val;
      });
      callbacks.listen(networkPlayer, 'pitch', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.targetPitch = val;
      });
      callbacks.listen(networkPlayer, 'hp', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.hp = val;
      });
      callbacks.listen(networkPlayer, 'shield', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.shield = val;
      });
      callbacks.listen(networkPlayer, 'isFiring', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) {
          remote.isFiring = val;
          if (val) remote.lastShotTime = performance.now();
        }
      });
      callbacks.listen(networkPlayer, 'isCrouching', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.isCrouching = val;
      });
      callbacks.listen(networkPlayer, 'isSprinting', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.isSprinting = val;
      });
      callbacks.listen(networkPlayer, 'weaponName', (val) => {
        const remote = remotePlayers.get(sessionId);
        if (remote) remote.weaponName = val;
      });
    });
    
    // Sync players who left
    callbacks.onRemove('players', (networkPlayer: any, sessionId: string) => {
      if (sessionId === room.sessionId) return;
      removeRemotePlayer(sessionId);
    });
    
    // Listen for custom server broadcast messages
    room.onMessage('onShoot', (message) => {
      const origin = new THREE.Vector3(message.origin.x, message.origin.y, message.origin.z);
      const dir = new THREE.Vector3(message.direction.x, message.direction.y, message.direction.z);
      addTracer(origin, dir);
    });
    
    room.onMessage('eliminated', (message) => {
      const attackerName = message.attackerId === room.sessionId ? 'You' : `Player ${message.attackerId.substring(0, 4).toUpperCase()}`;
      const victimName = message.targetId === room.sessionId ? 'You' : `Player ${message.targetId.substring(0, 4).toUpperCase()}`;
      addFeed(`<b>${attackerName}</b> eliminated <b>${victimName}</b>`);
    });
    
  }).catch(err => {
    console.warn('Unable to reach multiplayer server. Offline bots mode active.', err);
    addFeed('Multiplayer server offline — playing with local AI bots');
  });
}

function spawnRemotePlayer(sessionId, networkPlayer) {
  const group = new THREE.Group();
  group.position.set(networkPlayer.x, networkPlayer.y, networkPlayer.z);
  scene.add(group);
  
  const charModel = ASSETS.characters['VIPER'];
  let model = null;
  let mixer = null;
  const actions = {};
  
  if (charModel) {
    model = SkeletonUtils.clone(charModel);
    model.scale.setScalar(0.95);
    model.rotation.y = Math.PI;
    group.add(model);
    
    mixer = new THREE.AnimationMixer(model);
    charModel.animations.forEach(clip => {
      actions[clip.name] = mixer.clipAction(clip);
    });
    
    const idle = actions['Idle_Gun'] || actions['Idle'];
    if (idle) idle.play();
  } else {
    // Fallback capsule geometry
    const geom = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff5555 });
    model = new THREE.Mesh(geom, mat);
    model.position.y = 0.9;
    group.add(model);
  }
  
  // Render Dynamic Overhead Health & Name Plate Label
  const labelGeom = new THREE.PlaneGeometry(1.6, 0.4);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const labelMesh = new THREE.Mesh(labelGeom, material);
  labelMesh.position.set(0, 2.25, 0);
  group.add(labelMesh);
  
  remotePlayers.set(sessionId, {
    group: group,
    model: model,
    mixer: mixer,
    actions: actions,
    currentAction: 'Idle_Gun',
    targetPos: new THREE.Vector3(networkPlayer.x, networkPlayer.y, networkPlayer.z),
    targetYaw: networkPlayer.yaw,
    targetPitch: networkPlayer.pitch,
    hp: networkPlayer.hp,
    shield: networkPlayer.shield,
    isFiring: networkPlayer.isFiring,
    isCrouching: networkPlayer.isCrouching,
    isSprinting: networkPlayer.isSprinting,
    weaponName: networkPlayer.weaponName,
    lastWeapName: '',
    lastShotTime: 0,
    labelCtx: ctx,
    labelTexture: texture,
    labelMesh: labelMesh
  });
  
  addFeed(`Player <b>${sessionId.substring(0, 4).toUpperCase()}</b> joined the battle!`);
}

function removeRemotePlayer(sessionId) {
  const remote = remotePlayers.get(sessionId);
  if (remote) {
    scene.remove(remote.group);
    remotePlayers.delete(sessionId);
    addFeed(`Player <b>${sessionId.substring(0, 4).toUpperCase()}</b> left the battle.`);
  }
}

export function sendLocalState() {
  if (!room) return;
  room.send('updateState', {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z,
    yaw: player.yaw,
    pitch: player.pitch,
    isFiring: G.firing,
    isCrouching: player.crouching,
    isSprinting: G.keys['ShiftLeft'] || G.keys['ShiftRight'],
    weaponName: player.activeWeaponDef ? player.activeWeaponDef.name : 'M4 CARBINE'
  });
}

export function sendShoot(origin, direction) {
  if (!room) return;
  room.send('shoot', {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    direction: { x: direction.x, y: direction.y, z: direction.z }
  });
}

export function sendHit(targetId, dmg) {
  if (!room) return;
  room.send('hit', {
    targetId: targetId,
    dmg: dmg,
    attackerName: `Player ${room.sessionId.substring(0, 4).toUpperCase()}`
  });
}

function updateRemoteWeapon(remote) {
  const isDmr = remote.weaponName === 'MK-2 DMR';
  const isSmg = remote.weaponName === 'MP5 SMG';
  const weaponTemplate = isDmr ? ASSETS.weapons.dmr : ASSETS.weapons.rifle;
  
  let rightHand = null;
  remote.model.traverse(node => {
    if (node.isBone && (
      node.name.includes('Hand_R') || 
      node.name.includes('hand_r') || 
      node.name.includes('RightHand') || 
      node.name.includes('hand.R')
    )) {
      rightHand = node;
    }
  });
  
  const toRemove = [];
  remote.model.traverse(node => {
    if (node.name === 'bot_weapon') toRemove.push(node);
  });
  toRemove.forEach(n => n.parent.remove(n));
  
  if (weaponTemplate) {
    const clone = weaponTemplate.clone();
    clone.name = 'bot_weapon';
    const scl = isSmg ? 0.095 : 0.12;
    clone.scale.setScalar(scl);
    clone.rotation.y = Math.PI;
    clone.rotation.x = Math.PI / 2;
    clone.position.set(0, -0.05, 0.05);
    
    if (rightHand) rightHand.add(clone);
    else remote.model.add(clone);
  }
}

function updateRemoteLabel(remote, sessionId) {
  const ctx = remote.labelCtx;
  ctx.clearRect(0, 0, 256, 64);
  
  // Draw Background Panel
  ctx.fillStyle = 'rgba(8, 12, 16, 0.82)';
  ctx.roundRect ? ctx.roundRect(10, 5, 236, 54, 8) : ctx.rect(10, 5, 236, 54);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw Name Text
  ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#ffb454';
  ctx.textAlign = 'center';
  ctx.fillText(`PLAYER ${sessionId.substring(0, 4).toUpperCase()}`, 128, 28);
  
  // Draw HP Text
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#7ee08c';
  ctx.fillText(`${Math.ceil(remote.hp)} HP  ${Math.ceil(remote.shield)} SH`, 128, 48);
  
  remote.labelTexture.needsUpdate = true;
}

export function updateMultiplayer(dt) {
  remotePlayers.forEach((remote, sessionId) => {
    // Smooth coordinate interpolation (de-jittering)
    remote.group.position.lerp(remote.targetPos, dt * 11);
    
    // Smooth angle interpolation
    let diff = remote.targetYaw - remote.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    remote.group.rotation.y += diff * dt * 12;
    
    remote.labelMesh.lookAt(camera.position);
    
    // Handle model animation cycles
    if (remote.mixer) {
      remote.mixer.update(dt);
      
      let act = 'Idle_Gun';
      const dist = remote.group.position.distanceTo(remote.targetPos);
      const isMoving = dist > 0.15;
      const now = performance.now();
      const recentlyFired = (now - (remote.lastShotTime || 0) < 1200);

      const rPos = remote.group.position;
      const groundY = terrainHeight(rPos.x, rPos.z);
      const heightAboveGround = rPos.y - groundY;
      
      const remoteFreefalling = heightAboveGround > 35;
      const remoteParachuting = heightAboveGround > 2.5 && heightAboveGround <= 35;

      // Sync parachute canopy mesh
      if (remoteParachuting) {
        if (!remote.chuteMesh) {
          const chute = createParachuteMesh(0x58b98a); // green canopy for remote players
          remote.chuteMesh = chute;
          remote.group.add(chute);
        }
      } else {
        if (remote.chuteMesh) {
          remote.group.remove(remote.chuteMesh);
          remote.chuteMesh = null;
        }
      }

      if (remote.hp <= 0) {
        act = 'Death';
      } else if (remoteFreefalling) {
        act = 'Idle_Neutral';
      } else if (remoteParachuting) {
        act = 'Idle_Gun_Pointing';
      } else if (remote.isFiring) {
        if (isMoving) {
          act = 'Run_Shoot';
        } else {
          act = 'Idle_Gun_Shoot';
        }
      } else if (remote.isSprinting && isMoving) {
        act = 'Run';
      } else if (isMoving) {
        act = 'Walk';
      } else if (recentlyFired) {
        act = 'Idle_Gun_Pointing';
      } else {
        act = 'Idle_Gun';
      }
      
      if (remote.currentAction !== act) {
        const next = remote.actions[act];
        const prev = remote.actions[remote.currentAction];
        if (next) {
          next.reset();
          next.enabled = true;
          next.setEffectiveTimeScale(1);
          next.setEffectiveWeight(1);
          
          if (prev) {
            prev.crossFadeTo(next, 0.22, true);
          } else {
            next.fadeIn(0.22);
          }
          next.play();
          
          if (act === 'Death') {
            next.setLoop(THREE.LoopOnce);
            next.clampWhenFinished = true;
          }
          
          remote.currentAction = act;
        }
      }
    }
    
    // Sync weapon attachment
    if (remote.weaponName !== remote.lastWeapName) {
      remote.lastWeapName = remote.weaponName;
      updateRemoteWeapon(remote);
    }
    
    updateRemoteLabel(remote, sessionId);
  });
}
