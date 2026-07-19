'use strict';

import { player } from './player';
import { zone, PHASES } from './zone';
import { loot } from './loot';
import { el } from './utils';

export function addFeed(html) {
  const d = document.createElement('div');
  d.className = 'feedline';
  d.innerHTML = html;
  const feed = el('feed');
  if (feed) {
    feed.prepend(d);
    while (feed.children.length > 5) {
      feed.removeChild(feed.lastChild);
    }
    setTimeout(() => {
      d.style.opacity = '0';
    }, 3500);
    setTimeout(() => {
      d.remove();
    }, 4200);
  }
}

export function drawMinimap() {
  const mmCv = el('minimap');
  if (!mmCv) return;
  const mm = mmCv.getContext('2d');
  const W = 150, cx = W / 2;
  mm.clearRect(0, 0, W, W);
  mm.fillStyle = 'rgba(8,12,16,.85)';
  mm.fillRect(0, 0, W, W);
  const range = Math.max(zone.r * 1.5, 70); // world units shown from center
  const s = (W / 2 - 8) / range;
  const wx = x => cx + (x - player.pos.x) * s;
  const wz = z => cx + (z - player.pos.z) * s;

  // current zone
  mm.strokeStyle = 'rgba(93,184,255,.9)';
  mm.lineWidth = 1.6;
  mm.beginPath();
  mm.arc(wx(zone.cx), wz(zone.cz), zone.r * s, 0, Math.PI * 2);
  mm.stroke();

  // next zone
  if (zone.state === 'wait' && zone.phase < PHASES.length) {
    mm.strokeStyle = 'rgba(255,255,255,.75)';
    mm.setLineDash([4, 4]);
    mm.beginPath();
    mm.arc(wx(zone.tcx), wz(zone.tcz), zone.tr * s, 0, Math.PI * 2);
    mm.stroke();
    mm.setLineDash([]);
  }

  // loot
  mm.fillStyle = 'rgba(255,180,84,.9)';
  for (const L of loot) {
    if (!L.m) continue;
    const x = wx(L.m.position.x);
    const y = wz(L.m.position.z);
    if (x > 4 && x < W - 4 && y > 4 && y < W - 4) {
      mm.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  // player arrow
  mm.save();
  mm.translate(cx, cx);
  mm.rotate(-player.yaw);
  mm.fillStyle = '#fff';
  mm.beginPath();
  mm.moveTo(0, -6);
  mm.lineTo(4.5, 5);
  mm.lineTo(-4.5, 5);
  mm.closePath();
  mm.fill();
  mm.restore();
}
