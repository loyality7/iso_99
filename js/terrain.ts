'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { SkeletonUtils } from 'https://unpkg.com/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './engine';
import { mulberry32 } from './utils';
import { ASSETS } from './assets';

export const CHUNK = 60;
const SEG = 22;
const VIEW = 4; // view radius in chunks
export const chunks = new Map(); // "cx,cz" -> {group, colliders}

const grassA = new THREE.Color(0x5d8a45);
const grassB = new THREE.Color(0x74995a);
const rockC = new THREE.Color(0x8a8f94);
const sandC = new THREE.Color(0xc9bd8f);
const tmpC = new THREE.Color();

const treeTrunkG = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
const treeTopG = new THREE.ConeGeometry(1.6, 4.2, 7);
const rockG = new THREE.DodecahedronGeometry(1, 0);
const trunkM = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const leafM = new THREE.MeshLambertMaterial({ color: 0x3f6b35 });
const leafM2 = new THREE.MeshLambertMaterial({ color: 0x4f7a3a });
const rockM = new THREE.MeshLambertMaterial({ color: 0x7f858c });
const hutM = new THREE.MeshLambertMaterial({ color: 0x9a8f7a });
const roofM = new THREE.MeshLambertMaterial({ color: 0x704a3a });

function hashN(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hashN(xi, zi), b = hashN(xi + 1, zi), c = hashN(xi, zi + 1), d = hashN(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function terrainHeight(x, z) {
  let h = 0;
  h += vnoise(x * 0.007, z * 0.007) * 26;   // rolling hills
  h += vnoise(x * 0.028, z * 0.028) * 7;    // medium bumps
  h += vnoise(x * 0.09, z * 0.09) * 1.4;  // detail
  return h - 15;
}

export const housePositions = [];

function buildHouse(x, z, h, rotationY, group, colliders) {
  housePositions.push({ x, y: h, z, rot: rotationY });

  const houseGroup = new THREE.Group();
  houseGroup.position.set(x, h, z);
  houseGroup.rotation.y = rotationY;

  // Scale up the house to 1.75 so the interior and doorway are extremely spacious and easy to enter
  houseGroup.scale.setScalar(1.75);

  // Add wooden floor plank plane inside
  const floorG = new THREE.PlaneGeometry(4, 4);
  floorG.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorG, new THREE.MeshLambertMaterial({ color: 0x5a483a }));
  floor.position.y = 0.02; // slightly above terrain to prevent z-fighting
  houseGroup.add(floor);

  // Front Wall (Doorway opening)
  if (ASSETS.village['Wall_Plaster_Door_Flat']) {
    const wall = SkeletonUtils.clone(ASSETS.village['Wall_Plaster_Door_Flat']);
    wall.position.set(0, 0, -2);
    houseGroup.add(wall);
  }
  // Back Wall (Straight wood framing)
  if (ASSETS.village['Wall_Plaster_Straight']) {
    const wall = SkeletonUtils.clone(ASSETS.village['Wall_Plaster_Straight']);
    wall.position.set(0, 0, 2);
    wall.rotation.y = Math.PI;
    houseGroup.add(wall);
  }
  // Left Wall (Window view)
  if (ASSETS.village['Wall_Plaster_Window_Wide_Flat']) {
    const wall = SkeletonUtils.clone(ASSETS.village['Wall_Plaster_Window_Wide_Flat']);
    wall.position.set(-2, 0, 0);
    wall.rotation.y = Math.PI / 2;
    houseGroup.add(wall);
  }
  // Right Wall (Straight)
  if (ASSETS.village['Wall_Plaster_Straight']) {
    const wall = SkeletonUtils.clone(ASSETS.village['Wall_Plaster_Straight']);
    wall.position.set(2, 0, 0);
    wall.rotation.y = -Math.PI / 2;
    houseGroup.add(wall);
  }
  // Roof (4x4 tiles)
  if (ASSETS.village['Roof_RoundTiles_4x4']) {
    const roof = SkeletonUtils.clone(ASSETS.village['Roof_RoundTiles_4x4']);
    roof.position.set(0, 3, 0);
    houseGroup.add(roof);
  }
  // Chimney on the back
  if (ASSETS.village['Prop_Chimney']) {
    const chimney = SkeletonUtils.clone(ASSETS.village['Prop_Chimney']);
    chimney.position.set(1.5, 0, 1.8);
    houseGroup.add(chimney);
  }
  // Prop: Wagon Cart outside for tactical cover
  if (ASSETS.village['Prop_Wagon']) {
    const wagon = SkeletonUtils.clone(ASSETS.village['Prop_Wagon']);
    wagon.position.set(-4, 0.2, -2.5);
    wagon.rotation.y = 0.5;
    wagon.scale.setScalar(0.9);
    houseGroup.add(wagon);

    // Convert local position back to world coordinates for the collider
    const wx = x + (-4 * 1.75 * Math.cos(rotationY) + 2.5 * 1.75 * Math.sin(rotationY));
    const wz = z + (-4 * 1.75 * Math.sin(rotationY) - 2.5 * 1.75 * Math.cos(rotationY));
    colliders.push({ x: wx, z: wz, r: 1.4 * 1.75 });
  }
  // Prop: Crate stacks outside
  if (ASSETS.village['Prop_Crate']) {
    const crate1 = SkeletonUtils.clone(ASSETS.village['Prop_Crate']);
    crate1.position.set(3.5, 0, -2);
    crate1.scale.setScalar(0.95);
    houseGroup.add(crate1);

    const crate2 = SkeletonUtils.clone(ASSETS.village['Prop_Crate']);
    crate2.position.set(3.7, 0.76, -1.8);
    crate2.rotation.y = 0.4;
    crate2.scale.setScalar(0.85);
    houseGroup.add(crate2);

    const cx = x + (3.5 * 1.75 * Math.cos(rotationY) + 2 * 1.75 * Math.sin(rotationY));
    const cz = z + (3.5 * 1.75 * Math.sin(rotationY) - 2 * 1.75 * Math.cos(rotationY));
    colliders.push({ x: cx, z: cz, r: 1.1 * 1.75 });
  }

  // Tag meshes for memory management disposal if needed
  houseGroup.traverse(c => {
    if ((c as any).isMesh) {
      c.userData.dispose = true;
    }
  });

  group.add(houseGroup);

  // Set up hollow boundary wall colliders so center of house remains open
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const wallPoints = [
    { lx: -2, lz: 2 },  // Back-Left corner
    { lx: 2, lz: 2 },  // Back-Right corner
    { lx: -2, lz: -2 }, // Front-Left corner
    { lx: 2, lz: -2 }, // Front-Right corner
    { lx: 0, lz: 2 },  // Back Center
    { lx: -2, lz: 0 },  // Left Center
    { lx: 2, lz: 0 },  // Right Center
  ];
  wallPoints.forEach(pt => {
    const wx = x + (pt.lx * 1.75 * cos - pt.lz * 1.75 * sin);
    const wz = z + (pt.lx * 1.75 * sin + pt.lz * 1.75 * cos);
    // Thin down wall colliders (radius 0.35 instead of 0.85) to keep interior free and easy to enter
    colliders.push({ x: wx, z: wz, r: 0.35 * 1.75 });
  });
}

export function buildChunk(cx, cz) {
  const group = new THREE.Group();
  const colliders = [];
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
    const h = terrainHeight(wx, wz);
    pos.setY(i, h);

    // color by height with a little noise variance
    const jitter = vnoise(wx * 0.2, wz * 0.2);
    if (h < -9) {
      tmpC.copy(sandC);
    } else if (h > 12) {
      tmpC.copy(rockC);
    } else {
      tmpC.copy(grassA).lerp(grassB, jitter);
    }

    // soft blend near shore
    if (h >= -9 && h <= -6) {
      tmpC.lerp(sandC, (-6 - h) / -3 * -1);
    }
    colors[i * 3] = tmpC.r;
    colors[i * 3 + 1] = tmpC.g;
    colors[i * 3 + 2] = tmpC.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(ox, 0, oz);
  group.add(mesh);

  // deterministic decoration
  const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x9E3779B9);
  const nTrees = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < nTrees; i++) {
    const x = ox + (rng() - 0.5) * CHUNK, z = oz + (rng() - 0.5) * CHUNK;
    const h = terrainHeight(x, z);
    if (h < -8 || h > 13) continue; // no trees on beach/peaks

    const s = 0.8 + rng() * 0.9;
    if (ASSETS.trees && ASSETS.trees.length > 0) {
      // Pick a random tree asset from the loaded set
      const treeTemplate = ASSETS.trees[Math.floor(rng() * ASSETS.trees.length)];
      const tree = SkeletonUtils.clone(treeTemplate);
      tree.position.set(x, h, z);
      tree.scale.setScalar(s * 1.5);
      tree.rotation.y = rng() * Math.PI;
      group.add(tree);
    } else {
      const trunk = new THREE.Mesh(treeTrunkG, trunkM);
      trunk.position.set(x, h + 1.1 * s, z);
      trunk.scale.setScalar(s);

      const top = new THREE.Mesh(treeTopG, rng() > 0.5 ? leafM : leafM2);
      top.position.set(x, h + (2.2 + 2.1) * s * 0.92, z);
      top.scale.setScalar(s);
      top.rotation.y = rng() * Math.PI;
      group.add(trunk, top);
    }
    colliders.push({ x, z, r: 0.55 * s });
  }

  const nRocks = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < nRocks; i++) {
    const x = ox + (rng() - 0.5) * CHUNK, z = oz + (rng() - 0.5) * CHUNK;
    const h = terrainHeight(x, z);
    const s = 0.7 + rng() * 1.6;

    if (ASSETS.rocks && ASSETS.rocks.length > 0) {
      // Pick a random rock asset from the loaded set
      const rockTemplate = ASSETS.rocks[Math.floor(rng() * ASSETS.rocks.length)];
      const rock = SkeletonUtils.clone(rockTemplate);
      rock.position.set(x, h, z);
      rock.scale.setScalar(s * 1.5);
      rock.rotation.y = rng() * Math.PI;
      group.add(rock);
    } else {
      const rock = new THREE.Mesh(rockG, rockM);
      rock.position.set(x, h + s * 0.35, z);
      rock.scale.set(s, s * 0.75, s);
      rock.rotation.y = rng() * Math.PI;
      group.add(rock);
    }
    colliders.push({ x, z, r: s * 0.85 });
  }

  // Add Bushes
  const nBushes = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < nBushes; i++) {
    const x = ox + (rng() - 0.5) * CHUNK, z = oz + (rng() - 0.5) * CHUNK;
    const h = terrainHeight(x, z);
    if (h < -7 || h > 12) continue; // no bushes on shore/peaks
    const s = 0.6 + rng() * 0.8;
    if (ASSETS.bushes && ASSETS.bushes.length > 0) {
      const bushTemplate = ASSETS.bushes[Math.floor(rng() * ASSETS.bushes.length)];
      const bush = SkeletonUtils.clone(bushTemplate);
      bush.position.set(x, h, z);
      bush.scale.setScalar(s * 1.4);
      bush.rotation.y = rng() * Math.PI;
      group.add(bush);
      colliders.push({ x, z, r: s * 0.8 });
    }
  }

  // Add Ground Foliage (ferns, flowers, mushrooms, tall grass) - increased density significantly for lush grass fields
  const nFoliage = 35 + Math.floor(rng() * 25);
  for (let i = 0; i < nFoliage; i++) {
    const x = ox + (rng() - 0.5) * CHUNK, z = oz + (rng() - 0.5) * CHUNK;
    const h = terrainHeight(x, z);
    if (h < -8 || h > 12) continue;
    const s = 0.6 + rng() * 0.8;
    if (ASSETS.foliage && ASSETS.foliage.length > 0) {
      const folTemplate = ASSETS.foliage[Math.floor(rng() * ASSETS.foliage.length)];
      const foliageItem = SkeletonUtils.clone(folTemplate);
      foliageItem.position.set(x, h, z);
      foliageItem.scale.setScalar(s * 1.4);
      foliageItem.rotation.y = rng() * Math.PI;
      group.add(foliageItem);
    }
  }

  // Build modular medieval houses - clustered into villages/towns vs nature cottages
  const isTown = rng() < 0.40;
  if (isTown) {
    // Dense town center: spawn a cluster of 3 to 5 houses in a grid-like street layout!
    const nHouses = 3 + Math.floor(rng() * 3);
    for (let hIdx = 0; hIdx < nHouses; hIdx++) {
      const gridX = ((hIdx % 2) - 0.5) * 16;
      const gridZ = (Math.floor(hIdx / 2) - 0.5) * 16;
      
      const x = ox + gridX + (rng() - 0.5) * 3;
      const z = oz + gridZ + (rng() - 0.5) * 3;
      const h = terrainHeight(x, z);
      
      if (h > -7 && h < 12) {
        if (ASSETS.village['Wall_Plaster_Straight']) {
          buildHouse(x, z, h, rng() * Math.PI * 2, group, colliders);
        } else {
          // Fallback box hut
          const hut = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 4.2), hutM);
          hut.position.set(x, h + 1.4, z);
          hut.rotation.y = rng() * Math.PI;

          const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.8, 4), roofM);
          roof.position.set(x, h + 3.8, z);
          roof.rotation.y = hut.rotation.y + Math.PI / 4;

          hut.userData.dispose = true;
          roof.userData.dispose = true;
          group.add(hut, roof);
          colliders.push({ x, z, r: 3.2 });
        }
      }
    }
  } else {
    // Normal nature chunk: spawn maybe 1 isolated cottage with 22% chance
    if (rng() < 0.22) {
      const x = ox + (rng() - 0.5) * CHUNK * 0.6, z = oz + (rng() - 0.5) * CHUNK * 0.6;
      const h = terrainHeight(x, z);
      if (h > -7 && h < 11) {
        if (ASSETS.village['Wall_Plaster_Straight']) {
          buildHouse(x, z, h, rng() * Math.PI * 2, group, colliders);
        } else {
          // Fallback basic shapes hut if assets are still loading
          const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), hutM);
          hut.position.set(x, h + 1.3, z);
          hut.rotation.y = rng() * Math.PI;

          const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.6, 4), roofM);
          roof.position.set(x, h + 3.6, z);
          roof.rotation.y = hut.rotation.y + Math.PI / 4;

          hut.userData.dispose = true;
          roof.userData.dispose = true;
          group.add(hut, roof);
          colliders.push({ x, z, r: 3.1 });
        }
      }
    }
  }

  scene.add(group);
  return { group, colliders };
}

export function updateChunks(px, pz) {
  const pcx = Math.round(px / CHUNK), pcz = Math.round(pz / CHUNK);
  const needed = new Set();

  for (let dx = -VIEW; dx <= VIEW; dx++) {
    for (let dz = -VIEW; dz <= VIEW; dz++) {
      const cx = pcx + dx, cz = pcz + dz, key = cx + ',' + cz;
      needed.add(key);
      if (!chunks.has(key)) {
        chunks.set(key, buildChunk(cx, cz));
      }
    }
  }

  for (const [key, c] of chunks) {
    if (!needed.has(key)) {
      scene.remove(c.group);
      c.group.traverse(o => {
        if ((o as any).isMesh && ((o as any).geometry.type === 'PlaneGeometry' || o.userData.dispose)) {
          (o as any).geometry.dispose();
          if ((o as any).geometry.type === 'PlaneGeometry') {
            (o as any).material.dispose();
          }
        }
      });
      chunks.delete(key);
    }
  }
}

export function collidersNear(x, z) {
  const pcx = Math.round(x / CHUNK), pcz = Math.round(z / CHUNK), out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get((pcx + dx) + ',' + (pcz + dz));
      if (c) {
        out.push(...c.colliders);
      }
    }
  }
  return out;
}

// line-of-sight: sample terrain along a segment (hills provide cover)
export function losBlocked(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const steps = Math.floor(len / 2.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = a.x + dx * t, py = a.y + dy * t, pz = a.z + dz * t;
    if (py < terrainHeight(px, pz) + 0.35) {
      return true;
    }
  }
  return false;
}

export function clearChunks() {
  for (const [key, c] of chunks) {
    scene.remove(c.group);
    c.group.traverse(o => {
      if ((o as any).isMesh && ((o as any).geometry.type === 'PlaneGeometry' || o.userData.dispose)) {
        (o as any).geometry.dispose();
        if ((o as any).geometry.type === 'PlaneGeometry') {
          (o as any).material.dispose();
        }
      }
    });
  }
  chunks.clear();
  housePositions.length = 0;
}

