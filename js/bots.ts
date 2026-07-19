'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { SkeletonUtils } from 'https://unpkg.com/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { scene, camera } from './engine';
import { rand, clamp, el } from './utils';
import { G } from './state';
import { terrainHeight, losBlocked, collidersNear } from './terrain';
import { playShot, playHit, playKill } from './audio';
import { player, hurtPlayer, checkWin, updateAlive } from './player';
import { addTracer, showHitmarker } from './weapon';
import { zone, zoneAcc } from './zone';
import { addFeed } from './ui';
import { ASSETS } from './assets';

function getGroundHeight(x: number, z: number): number {
  return ((G as any).stage === 'lobby') ? 98.5 : terrainHeight(x, z);
}


export const BOT_NAMES = ['VIPER', 'ROOK', 'HAVOC', 'MANTIS', 'DRIFT', 'ONYX', 'SABER', 'JUNO', 'WRAITH'];
export const BOT_COLORS = [0xd35450, 0x5aa9d6, 0xd6a24e, 0x8f6fd0, 0x58b98a, 0xd06fb0, 0x7d8fd3, 0xc7c05a, 0x6fc4c9];
export const bots = [];

export function clearBots() {
  bots.length = 0;
}

function fadeToAction(bot, name, duration = 0.22) {
  if (!bot.mixer || !bot.actions || !bot.actions[name]) return;
  const next = bot.actions[name];
  const prevName = bot.currentAction;
  if (prevName === name) return;
  
  const prev = prevName ? bot.actions[prevName] : null;
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  
  if (prev) {
    prev.crossFadeTo(next, duration, true);
  } else {
    next.fadeIn(duration);
  }
  
  next.play();
  bot.currentAction = name;
}

function attachWeaponToBot(model, weaponName) {
  let rightHand = null;
  model.traverse(node => {
    if (node.isBone && (
      node.name.includes('Hand_R') || 
      node.name.includes('hand_r') || 
      node.name.includes('RightHand') || 
      node.name.includes('hand.R')
    )) {
      rightHand = node;
    }
  });
  
  const isDmr = weaponName === 'dmr';
  const isSmg = weaponName === 'smg';
  const weaponTemplate = isDmr ? ASSETS.weapons.dmr : ASSETS.weapons.rifle;
  if (weaponTemplate) {
    const botGun = weaponTemplate.clone();
    const scl = isSmg ? 0.095 : 0.12;
    botGun.scale.setScalar(scl);
    botGun.rotation.y = Math.PI; 
    botGun.rotation.x = Math.PI / 2;
    botGun.position.set(0, -0.05, 0.05); 
    
    if (rightHand) {
      rightHand.add(botGun);
    } else {
      // Fallback attachment directly to model root if bone not found
      botGun.position.set(0.2 * 2.5, 1.2, -0.3 * 2.5);
      model.add(botGun);
    }
  }
}

function makeLabel(bot) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  bot.labelCv = cv;
  const tex = new THREE.CanvasTexture(cv);
  bot.labelTex = tex;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(3.4, 0.85, 1);
  sp.position.y = 2.75;
  bot.label = sp;
  drawLabel(bot);
  return sp;
}

export function drawLabel(bot) {
  const c = bot.labelCv.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  
  // Draw Name Background & Text
  c.fillStyle = 'rgba(0,0,0,.55)';
  c.fillRect(48, 2, 160, 24);
  c.fillStyle = '#fff';
  c.font = '700 20px Consolas, monospace';
  c.textAlign = 'center';
  c.fillText(bot.name, 128, 20);
  
  // Health bar (green/yellow/red)
  c.fillStyle = 'rgba(0,0,0,.55)';
  c.fillRect(52, 28, 152, 14);
  c.fillStyle = bot.health > 50 ? '#7ee08c' : (bot.health > 25 ? '#ffb454' : '#ff5d5d');
  c.fillRect(54, 30, 148 * clamp(bot.health / 100, 0, 1), 10);
  c.fillStyle = '#fff';
  c.font = '700 11px Consolas, monospace';
  c.fillText(`${Math.ceil(bot.health)} HP`, 128, 39);
  
  // Shield bar (blue)
  c.fillStyle = 'rgba(0,0,0,.55)';
  c.fillRect(52, 44, 152, 14);
  c.fillStyle = '#5db8ff';
  c.fillRect(54, 46, 148 * clamp(bot.shield / 100, 0, 1), 10);
  c.fillStyle = '#fff';
  c.font = '700 11px Consolas, monospace';
  c.fillText(`${Math.ceil(bot.shield)} SH`, 128, 55);
  
  bot.labelTex.needsUpdate = true;
}

export function spawnBot(i) {
  const angle = (i / 100) * Math.PI * 2 + rand(-0.35, 0.35);
  const dist = rand(30, 520);
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;
  const y = getGroundHeight(x, z);

  const nameBase = BOT_NAMES[i % BOT_NAMES.length];
  const name = nameBase + ' ' + String(i + 1).padStart(2, '0');
  const charModel = ASSETS.characters[nameBase];

  // Distribute weapon types to bots (33% SMG, 33% Rifle, 34% DMR)
  const weaponSeed = (i * 17) % 100;
  const weaponType = weaponSeed < 33 ? 'smg' : (weaponSeed < 66 ? 'rifle' : 'dmr');

  let mixer = null;
  const actions = {};

  const group = new THREE.Group();
  if (charModel) {
    const model = SkeletonUtils.clone(charModel);
    model.scale.setScalar(0.95);
    model.rotation.y = Math.PI; // Rotate character to align forward vector
    group.add(model);
    
    // Attach weapon visual
    attachWeaponToBot(model, weaponType);
    
    // Setup animations
    mixer = new THREE.AnimationMixer(model);
    if (charModel.animations && charModel.animations.length > 0) {
      charModel.animations.forEach(clip => {
        actions[clip.name] = mixer.clipAction(clip);
      });
    }
  } else {
    const mat = new THREE.MeshLambertMaterial({ color: BOT_COLORS[i % BOT_COLORS.length] });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 10), mat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), new THREE.MeshLambertMaterial({ color: 0xd9c2a3 }));
    head.position.y = 1.95;
    const gunb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.8), new THREE.MeshLambertMaterial({ color: 0x24282c }));
    gunb.position.set(0.35, 1.35, -0.35);
    group.add(body, head, gunb);
  }
  group.position.set(x, y, z);
  scene.add(group);

  const bot = {
    name: name,
    group,
    health: 100,
    shield: 100, // Spawn with shield
    dead: false,
    deadT: 0,
    state: 'wander',
    target: new THREE.Vector3(x, y, z),
    retargetAt: 0,
    nextShot: 0,
    loseSightAt: 0,
    speed: rand(2.6, 3.4),
    chaseSpeed: rand(4.2, 5.2),
    mixer,
    actions,
    currentAction: null,
    weaponType
  };
  
  if (mixer) {
    const startAct = actions['Idle_Gun'] || actions['Idle'];
    if (startAct) {
      startAct.play();
      bot.currentAction = startAct._clip.name;
    }
  }
  
  group.add(makeLabel(bot));
  bots.push(bot);
}

export function aliveBots() {
  return bots.filter(b => !b.dead).length;
}

export function damageBot(bot, dmg, byZone = false, killerName = null) {
  if (bot.dead) return;
  if ((G as any).stage !== 'playing') return;
  
  if (!byZone) {
    if (bot.shield > 0) {
      const sDmg = Math.min(bot.shield, dmg);
      bot.shield -= sDmg;
      dmg -= sDmg;
    }
  }
  bot.health -= dmg;
  drawLabel(bot);
  
  if (!byZone) {
    if (killerName === null) {
      playHit();
      showHitmarker(bot.health <= 0);
    }
  }
  
  if (!byZone && bot.state === 'wander') {
    bot.state = 'chase';
  }
  
  if (bot.health <= 0) {
    bot.health = 0;
    bot.dead = true;
    bot.deadT = 0;
    
    if (bot.mixer && bot.actions['Death']) {
      const deathAct = bot.actions['Death'];
      deathAct.setLoop(THREE.LoopOnce);
      deathAct.clampWhenFinished = true;
      fadeToAction(bot, 'Death', 0.08);
    }
    
    // Drop bot's weapon and items on death
    import('./loot').then(l => {
      const wType = l.LOOT_TYPES.find(t => t.type === 'weapon' && t.weaponDef === bot.weaponType);
      if (wType) {
        l.spawnLootItem(wType, bot.group.position.x, bot.group.position.y + 0.35, bot.group.position.z);
      }
      
      // 55% chance to drop additional Medkit or Shield Cell
      if (Math.random() < 0.55) {
        const itemType = Math.random() < 0.5 ? 'health' : 'shield';
        const dropType = l.LOOT_TYPES.find(t => t.type === itemType);
        if (dropType) {
          l.spawnLootItem(dropType, bot.group.position.x + (Math.random() - 0.5) * 1.5, bot.group.position.y + 0.35, bot.group.position.z + (Math.random() - 0.5) * 1.5);
        }
      }
    });
    
    if (byZone) {
      addFeed('<span class="z">THE ZONE</span> eliminated ' + bot.name);
    } else if (killerName) {
      addFeed(`<b>${killerName}</b> eliminated ${bot.name}`);
    } else {
      G.kills++;
      playKill();
      addFeed('<b>YOU</b> eliminated ' + bot.name);
    }
    updateAlive();
    checkWin();
  }
}

export function updateBots(dt, now) {
  const pPos = camera.position;
  const playerPos = player.pos;
  
  for (const b of bots) {
    const g = b.group;
    if (b.dead) {
      b.deadT += dt;
      if (b.mixer) b.mixer.update(dt);
      
      // Fallback shape rotation if model animations don't exist
      if (!b.mixer) {
        g.rotation.z = Math.min(Math.PI / 2, b.deadT * 3.5);
      }
      
      if (b.deadT > 1.8) g.position.y -= dt * 0.8;
      if (b.deadT > 3.2) {
        scene.remove(g);
      }
      continue;
    }
    
    if ((b as any).freefalling || (b as any).parachuting) {
      if (b.mixer) {
        b.mixer.update(dt);
        const act = (b as any).freefalling ? 'Idle_Neutral' : 'Idle_Gun_Pointing';
        fadeToAction(b, act, 0.12);
      }
      continue;
    }
    
    const bPos = g.position;
    const distToPlayer = bPos.distanceTo(playerPos);
    
    // Manage floating nameplate/health visibility based on distance
    if (b.label) {
      b.label.visible = distToPlayer < 90;
    }

    // Optimization for 100+ bots: if too far away, run simplified pathfinding/zone-escape AI
    if (distToPlayer > 130) {
      const dzx = bPos.x - zone.cx, dzz = bPos.z - zone.cz;
      const zdist = Math.hypot(dzx, dzz);
      const outside = zdist > zone.r;
      if (outside) {
        zoneAcc.bot[b.name] = (zoneAcc.bot[b.name] || 0) + zone.dps * dt;
        if (zoneAcc.bot[b.name] >= 5) {
          damageBot(b, zoneAcc.bot[b.name], true);
          zoneAcc.bot[b.name] = 0;
        }
      }
      
      // Wander or seek zone
      if (outside) {
        b.target.set(zone.cx + rand(-20, 20), 0, zone.cz + rand(-20, 20));
        b.target.y = getGroundHeight(b.target.x, b.target.z);
      } else if (now > b.retargetAt) {
        const wanderDist = rand(30, 80);
        const wanderAng = rand(0, Math.PI * 2);
        b.target.set(
          bPos.x + Math.cos(wanderAng) * wanderDist,
          0,
          bPos.z + Math.sin(wanderAng) * wanderDist
        );
        b.target.y = getGroundHeight(b.target.x, b.target.z);
        b.retargetAt = now + rand(4000, 8000);
      }

      // Straight line move
      const dx = b.target.x - bPos.x;
      const dz = b.target.z - bPos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        const speed = outside ? b.chaseSpeed : b.speed;
        bPos.x += (dx / d) * speed * dt;
        bPos.z += (dz / d) * speed * dt;
        bPos.y = getGroundHeight(bPos.x, bPos.z);
        g.rotation.y = Math.atan2(dx, dz);
      }
      
      b.state = 'wander';
      continue;
    }
    
    if (b.mixer) b.mixer.update(dt);
    
    // zone check
    const dzx = bPos.x - zone.cx, dzz = bPos.z - zone.cz;
    const zdist = Math.hypot(dzx, dzz);
    const outside = zdist > zone.r;
    if (outside) {
      zoneAcc.bot[b.name] = (zoneAcc.bot[b.name] || 0) + zone.dps * dt;
      if (zoneAcc.bot[b.name] >= 5) {
        damageBot(b, zoneAcc.bot[b.name], true);
        zoneAcc.bot[b.name] = 0;
        drawLabel(b);
      }
    }
    
    // Sight detection
    const eye = bPos.clone();
    eye.y += 1.9;
    
    let target = null;
    let targetDist = 55;
    let targetPos = null;
    let targetEye = null;
    
    // 1. Player check
    const pEye = camera.position.clone();
    const playerVisible = distToPlayer < targetDist && !losBlocked(eye, pEye);
    if (playerVisible) {
      target = 'player';
      targetDist = distToPlayer;
      targetPos = player.pos;
      targetEye = pEye;
    }
    
    // 2. Other bots check
    for (const other of bots) {
      if (other === b || other.dead) continue;
      const dOther = bPos.distanceTo(other.group.position);
      if (dOther < targetDist) {
        const otherEye = other.group.position.clone();
        otherEye.y += 1.9;
        if (!losBlocked(eye, otherEye)) {
          target = other;
          targetDist = dOther;
          targetPos = other.group.position;
          targetEye = otherEye;
        }
      }
    }
    
    // Behavior machine
    if (b.state === 'wander') {
      if (target && targetDist < 45) {
        b.state = 'chase';
        fadeToAction(b, 'Run', 0.15);
      }
      
      if (outside) {
        b.target.set(zone.cx + rand(-10, 10), 0, zone.cz + rand(-10, 10));
        fadeToAction(b, 'Run', 0.15);
        moveBot(b, b.target, b.chaseSpeed, dt);
      } else if (now > b.retargetAt) {
        b.target.set(bPos.x + rand(-28, 28), 0, bPos.z + rand(-28, 28));
        b.retargetAt = now + rand(3500, 7000);
      }
      fadeToAction(b, 'Walk', 0.15);
      moveBot(b, b.target, b.speed, dt);
      
    } else if (b.state === 'chase') {
      if (target) {
        b.loseSightAt = now + 4000;
        b.target.copy(targetPos); // update last known target position
        if (targetDist < 32) {
          b.state = 'attack';
          fadeToAction(b, 'Idle_Gun_Pointing', 0.15);
          continue;
        }
        fadeToAction(b, 'Run', 0.15);
        moveBot(b, targetPos, b.chaseSpeed, dt);
      } else {
        if (now > b.loseSightAt) {
          b.state = 'wander';
          fadeToAction(b, 'Walk', 0.15);
        } else {
          fadeToAction(b, 'Run', 0.15);
          moveBot(b, b.target, b.chaseSpeed, dt);
        }
      }
      
    } else if (b.state === 'attack') {
      if (!target || targetDist > 36) {
        b.state = 'chase';
        b.loseSightAt = now + 4000;
        fadeToAction(b, 'Run', 0.15);
        continue;
      }
      
      g.rotation.y = Math.atan2(targetPos.x - bPos.x, targetPos.z - bPos.z);
      
      if (now > b.nextShot) {
        const fireInterval = b.weaponType === 'smg' ? rand(450, 750) : (b.weaponType === 'dmr' ? rand(1000, 1600) : rand(700, 1150));
        b.nextShot = now + fireInterval;
        if (G.stage === 'playing') {
          botShoot(b, target, targetEye, targetDist);
        }
      }
      
      // Anim matching state
      if (b.actions['Gun_Shoot']) {
        fadeToAction(b, 'Gun_Shoot', 0.1);
      } else if (b.actions['Idle_Gun_Pointing']) {
        fadeToAction(b, 'Idle_Gun_Pointing', 0.1);
      } else {
        fadeToAction(b, 'Idle_Gun', 0.1);
      }
      
      // Strafe
      const strafe = Math.sin(now * 0.002 + bots.indexOf(b)) * 1.6;
      const sx = Math.cos(g.rotation.y) * strafe * dt;
      const sz = -Math.sin(g.rotation.y) * strafe * dt;
      bPos.x += sx;
      bPos.z += sz;
      bPos.y = getGroundHeight(bPos.x, bPos.z);
    }
  }
}

function moveBot(b, target, speed, dt) {
  const g = b.group;
  const dx = target.x - g.position.x, dz = target.z - g.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) {
    if (b.state === 'wander') {
      fadeToAction(b, 'Idle_Gun', 0.15);
    }
    return;
  }
  const vx = dx / d * speed * dt, vz = dz / d * speed * dt;
  g.position.x += vx;
  g.position.z += vz;

  // Obstacle pushout
  for (const c of collidersNear(g.position.x, g.position.z)) {
    const ox = g.position.x - c.x, oz = g.position.z - c.z;
    const dd = Math.hypot(ox, oz), min = c.r + 0.5;
    if (dd < min && dd > 0.001) {
      const p = (min - dd) / dd;
      g.position.x += ox * p;
      g.position.z += oz * p;
    }
  }
  g.position.y = getGroundHeight(g.position.x, g.position.z);
  g.rotation.y = Math.atan2(dx, dz);
}

function botShoot(b, target, targetEye, dist) {
  playShot(0.4, 0.8);
  const from = b.group.position.clone();
  from.y += 1.6;
  
  let hit = false;
  
  // Calculate accuracy based on weapon type
  const isSmg = b.weaponType === 'smg';
  const isDmr = b.weaponType === 'dmr';
  const baseAcc = isDmr ? 0.80 : (isSmg ? 0.58 : 0.68);
  const distDiv = isDmr ? 100 : (isSmg ? 55 : 80);
  const minAcc = isDmr ? 0.25 : (isSmg ? 0.08 : 0.15);
  
  if (target === 'player') {
    const moving = G.keys['KeyW'] || G.keys['KeyA'] || G.keys['KeyS'] || G.keys['KeyD'];
    let p = clamp(baseAcc - dist / distDiv, minAcc, baseAcc);
    if (moving) {
      p *= isSmg ? 0.90 : (isDmr ? 0.70 : 0.82); // SMG is highly accurate while moving
    }
    hit = Math.random() < p;
  } else {
    // Bot-on-bot shooting accuracy logic
    let p = clamp(0.6 - dist / 75, 0.1, 0.6);
    hit = Math.random() < p;
  }
  
  const to = targetEye.clone();
  if (!hit) {
    to.x += rand(-2.5, 2.5);
    to.y += rand(-1.5, 1.5);
    to.z += rand(-2.5, 2.5);
  }
  
  // Tracer thickness and colors based on weapon type
  const tracerColor = isSmg ? 0xffdd44 : (isDmr ? 0xff3333 : 0xff8844);
  const thickness = isSmg ? 0.06 : (isDmr ? 0.13 : 0.09);
  addTracer(from, to, thickness, tracerColor);
  
  if (hit) {
    if (target === 'player') {
      const dmg = isSmg ? rand(8, 12) : (isDmr ? rand(20, 28) : rand(12, 19));
      hurtPlayer(dmg, b.name);
    } else {
      const dmg = isSmg ? rand(8, 14) : (isDmr ? rand(22, 30) : rand(10, 18));
      damageBot(target, dmg, false, b.name);
    }
  }
}
