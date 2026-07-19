'use strict';

import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export const SKY = 0x9fc3e0;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 110, 235);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.id = 'game';
document.body.appendChild(renderer.domElement);

const hemisphereLight = new THREE.HemisphereLight(0xcfe4ff, 0x3d4a33, 0.95);
scene.add(hemisphereLight);

const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
sun.position.set(80, 140, 60);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
