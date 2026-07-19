'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { G } from './state';
import { scene } from './engine';
import { player, hurtPlayer } from './player';
import { fmtTime, clamp, lerp, el } from './utils';
import { playZoneTick } from './audio';
import { addFeed } from './ui';

export const PHASES = [
  { wait: 35, shrink: 30, r: 420 },
  { wait: 28, shrink: 25, r: 260 },
  { wait: 22, shrink: 20, r: 150 },
  { wait: 18, shrink: 15, r: 80  },
  { wait: 14, shrink: 12, r: 30  },
  { wait: 10, shrink: 10, r: 6   },
];

export const zone = {
  cx: 0,
  cz: 0,
  r: 650,
  fromCx: 0,
  fromCz: 0,
  fromR: 650,
  tcx: 0,
  tcz: 0,
  tr: 650,
  phase: 0,
  state: 'wait',
  t: PHASES[0].wait,
  dps: 2,
};

export const zoneAcc = {
  player: 0,
  bot: {},
  tick: 0,
};

export const zoneWall = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 160, 72, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x5db8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
);
zoneWall.position.y = 60;
scene.add(zoneWall);

export function resetZone() {
  zone.cx = 0;
  zone.cz = 0;
  zone.r = 650;
  zone.fromCx = 0;
  zone.fromCz = 0;
  zone.fromR = 650;
  zone.tcx = 0;
  zone.tcz = 0;
  zone.tr = 650;
  zone.phase = 0;
  zone.state = 'wait';
  zone.t = PHASES[0].wait;
  zone.dps = 2;
  zoneAcc.player = 0;
  zoneAcc.bot = {};
  zoneAcc.tick = 0;
}

export function pickNextZone() {
  const p = PHASES[zone.phase];
  const maxShift = Math.max(0, zone.r - p.r);
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * maxShift;
  zone.tcx = zone.cx + Math.cos(a) * d;
  zone.tcz = zone.cz + Math.sin(a) * d;
  zone.tr = p.r;
  zone.fromCx = zone.cx;
  zone.fromCz = zone.cz;
  zone.fromR = zone.r;
}

export function updateZone(dt) {
  if ((G as any).stage !== 'playing') {
    const vign = el('zoneVignette');
    if (vign) vign.style.opacity = '0';
    return;
  }
  zone.t -= dt;
  const label = el('zoneLabel');
  const time = el('zoneTime');
  
  if (zone.state === 'wait') {
    label.textContent = 'NEXT CIRCLE IN';
    label.className = zone.t < 6 ? 'warn' : '';
    time.textContent = fmtTime(zone.t);
    if (zone.t <= 0) {
      zone.state = 'shrink';
      zone.t = PHASES[zone.phase].shrink;
      addFeed('<span class="z">ZONE</span> is collapsing');
      playZoneTick();
    }
  } else if (zone.state === 'shrink') {
    label.textContent = 'ZONE COLLAPSING';
    label.className = 'danger';
    time.textContent = fmtTime(zone.t);
    const p = PHASES[zone.phase];
    const k = clamp(1 - zone.t / p.shrink, 0, 1);
    zone.cx = lerp(zone.fromCx, zone.tcx, k);
    zone.cz = lerp(zone.fromCz, zone.tcz, k);
    zone.r  = lerp(zone.fromR,  zone.tr,  k);
    
    if (zone.t <= 0) {
      zone.cx = zone.tcx;
      zone.cz = zone.tcz;
      zone.r = zone.tr;
      zone.phase++;
      zone.dps = 2 + zone.phase * 2.2;
      if (zone.phase < PHASES.length) {
        zone.state = 'wait';
        zone.t = PHASES[zone.phase].wait;
        pickNextZone();
      } else {
        zone.state = 'final';
      }
    }
  } else {
    label.textContent = 'FINAL CIRCLE';
    label.className = 'danger';
    time.textContent = '—';
  }
  
  zoneWall.scale.set(zone.r, 1, zone.r);
  zoneWall.position.x = zone.cx;
  zoneWall.position.z = zone.cz;

  // damage the player outside
  const pd = Math.hypot(player.pos.x - zone.cx, player.pos.z - zone.cz);
  const outside = pd > zone.r;
  el('zoneVignette').style.opacity = outside ? 1 : 0;
  if (outside) {
    zoneAcc.player += zone.dps * dt;
    zoneAcc.tick += dt;
    if (zoneAcc.tick > 1) {
      playZoneTick();
      zoneAcc.tick = 0;
    }
    if (zoneAcc.player >= 1) {
      hurtPlayer(zoneAcc.player, null);
      zoneAcc.player = 0;
    }
  }
}
