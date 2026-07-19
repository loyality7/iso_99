'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { G } from './state';
import { scene } from './engine';
import { player, updateVitalsHUD } from './player';
import { terrainHeight, housePositions } from './terrain';
import { weap, WEAPONS, updateAmmoHUD, addWeaponToInventory } from './weapon';
import { ASSETS } from './assets';
import { playPickup } from './audio';
import { addFeed } from './ui';
import { el } from './utils';

export const LOOT_TYPES = [
  { type: 'health', name: 'MEDKIT (+50 HP)',      color: 0x7ee08c, w: 5 },
  { type: 'ammo',   name: 'AMMO CACHE (+60)',     color: 0xffb454, w: 3.5 },
  { type: 'shield', name: 'SHIELD CELL (+50)',    color: 0x5db8ff, w: 4.5 },
  { type: 'weapon', name: 'M4 CARBINE',           color: 0xffb454, w: 1.2, weaponDef: 'rifle' },
  { type: 'weapon', name: 'MK-2 DMR',             color: 0xd35450, w: 0.8, weaponDef: 'dmr' },
  { type: 'weapon', name: 'MP5 SMG',            color: 0x5db8ff, w: 1.2, weaponDef: 'smg' },
];

export const loot = [];
export let nearLoot = null;

function disposeHierarchy(obj) {
  obj.traverse(child => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  });
}

function createLootMesh(def) {
  const group = new THREE.Group();
  
  if (def.type === 'health') {
    // Red medical cross box
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xd32f2f })
    );
    box.castShadow = true;
    group.add(box);
    
    const barH = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    barH.position.y = 0.23;
    
    const barV = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.04, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    barV.position.y = 0.23;
    
    group.add(barH, barV);
    
  } else if (def.type === 'shield') {
    // Glowing blue canister
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.65, 8),
      new THREE.MeshLambertMaterial({ color: 0x1976d2, emissive: 0x1565c0, emissiveIntensity: 0.5 })
    );
    cylinder.castShadow = true;
    group.add(cylinder);
    
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8),
      new THREE.MeshLambertMaterial({ color: 0x90a4ae })
    );
    cap.position.y = 0.33;
    
    const base = cap.clone();
    base.position.y = -0.33;
    
    group.add(cap, base);
    
  } else if (def.type === 'ammo') {
    // Military green ammo can with yellow stripe
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x2e7d32 })
    );
    box.castShadow = true;
    group.add(box);
    
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.36, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xfbc02d })
    );
    group.add(stripe);
    
  } else if (def.type === 'weapon') {
    // Floating actual gun model!
    let weaponTemplate = null;
    const isSmg = def.weaponDef === 'smg';
    if (def.weaponDef === 'rifle' && ASSETS.weapons.rifle) {
      weaponTemplate = ASSETS.weapons.rifle;
    } else if (def.weaponDef === 'dmr' && ASSETS.weapons.dmr) {
      weaponTemplate = ASSETS.weapons.dmr;
    } else if (isSmg && ASSETS.weapons.rifle) {
      weaponTemplate = ASSETS.weapons.rifle;
    }
    
    if (weaponTemplate) {
      const weaponClone = weaponTemplate.clone();
      const scl = isSmg ? 0.095 : 0.12;
      weaponClone.scale.setScalar(scl);
      weaponClone.rotation.y = Math.PI / 2;
      weaponClone.position.y = -0.1;
      group.add(weaponClone);
      
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.45, 16),
        new THREE.MeshBasicMaterial({ color: def.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.y = -0.3;
      group.add(glow);
    } else {
      const caseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.18, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x37474f })
      );
      group.add(caseMesh);
    }
  }
  
  return group;
}

export function spawnLootItem(def, x, y, z) {
  const m = createLootMesh(def);
  m.position.set(x, y, z);
  scene.add(m);
  loot.push({ m, def, baseY: y });
  return m;
}

export function clearLoot() {
  for (const L of loot) {
    scene.remove(L.m);
    disposeHierarchy(L.m);
  }
  loot.length = 0;
  nearLoot = null;
}

export function spawnLoot() {
  const pool = [];
  LOOT_TYPES.forEach(t => {
    for (let i = 0; i < t.w * 2; i++) pool.push(t);
  });
  
  // 1. Spawn loot inside each generated house
  housePositions.forEach(house => {
    // 85% chance to spawn at least one item, 40% chance for a second item
    const count = Math.random() < 0.85 ? (Math.random() < 0.45 ? 2 : 1) : 0;
    for (let i = 0; i < count; i++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      
      // Random offset from center of house floor
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      const x = house.x + Math.cos(angle) * r;
      const z = house.z + Math.sin(angle) * r;
      const y = house.y + 0.35; // slightly floating above floor
      
      const m = createLootMesh(t);
      m.position.set(x, y, z);
      scene.add(m);
      loot.push({ m, def: t, baseY: y });
    }
  });

  // 2. Spawn general wilderness loot distributed over the wider terrain
  const generalLootCount = 320;
  for (let i = 0; i < generalLootCount; i++) {
    const t = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * Math.PI * 2;
    const d = 20 + Math.sqrt(Math.random()) * 580; // range adjusted for 650m zone
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = terrainHeight(x, z);
    
    // Check if near water or peaks
    if (y < -8 || y > 14) continue;
    
    const m = createLootMesh(t);
    m.position.set(x, y + 0.8, z);
    scene.add(m);
    loot.push({ m, def: t, baseY: y + 0.8 });
  }
}

export function updateLoot(dt, now) {
  nearLoot = null;
  let bestD = 2.6;
  for (const L of loot) {
    L.m.rotation.y += dt * 1.5;
    L.m.position.y = L.baseY + Math.sin(now * 0.003 + L.baseY) * 0.15;
    const d = L.m.position.distanceTo(player.pos);
    if (d < bestD) {
      bestD = d;
      nearLoot = L;
    }
  }
  const pk = el('pickup');
  if (nearLoot) {
    pk.style.display = 'block';
    el('pickupName').textContent = nearLoot.def.name;
  } else {
    pk.style.display = 'none';
  }
}

export function tryPickup() {
  if (!G.running || !nearLoot) return;
  const t = nearLoot.def.type;
  if (t === 'health') {
    if (G.hp >= 100) return;
    G.hp = Math.min(100, G.hp + 50);
    addFeed('Used <b>MEDKIT</b> (+50 HP)');
  } else if (t === 'ammo') {
    weap.reserve += 60;
    updateAmmoHUD();
    addFeed('Picked up <b>AMMO CACHE</b> (+60)');
  } else if (t === 'shield') {
    if (G.shield >= 100) return;
    G.shield = Math.min(100, G.shield + 50);
    addFeed('Used <b>SHIELD CELL</b> (+50 Shield)');
  } else if (t === 'weapon') {
    const wDef = WEAPONS[nearLoot.def.weaponDef];
    addWeaponToInventory(wDef, wDef.mag);
    addFeed(`Picked up <b>${wDef.name}</b>`);
  }
  
  playPickup();
  updateVitalsHUD();
  scene.remove(nearLoot.m);
  disposeHierarchy(nearLoot.m);
  loot.splice(loot.indexOf(nearLoot), 1);
  nearLoot = null;
  el('pickup').style.display = 'none';
}
