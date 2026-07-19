'use strict';

import { GLTFLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/MTLLoader.js';

export const ASSETS: {
  trees: any[];
  rocks: any[];
  bushes: any[];
  foliage: any[];
  village: Record<string, any>;
  characters: Record<string, any>;
  weapons: Record<string, any>;
} = {
  trees: [],
  rocks: [],
  bushes: [],
  foliage: [],
  village: {},
  characters: {},
  weapons: {},
};

const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const objLoader = new OBJLoader();

function loadGLTF(url) {
  return new Promise((resolve) => {
    gltfLoader.load(
      url,
      gltf => {
        gltf.scene.animations = gltf.animations;
        resolve(gltf.scene);
      },
      undefined,
      err => {
        console.warn(`Failed to load GLTF asset from ${url}:`, err);
        resolve(null);
      }
    );
  });
}

function loadOBJWithMTL(mtlUrl, objUrl) {
  return new Promise((resolve) => {
    mtlLoader.load(
      mtlUrl,
      materials => {
        materials.preload();
        objLoader.setMaterials(materials);
        objLoader.load(
          objUrl,
          obj => resolve(obj),
          undefined,
          err => {
            console.warn(`Failed to load OBJ model from ${objUrl}:`, err);
            resolve(null);
          }
        );
      },
      undefined,
      err => {
        console.warn(`Failed to load MTL materials from ${mtlUrl}:`, err);
        resolve(null);
      }
    );
  });
}

export function loadAllAssets() {
  const promises = [];

  // 1. Load Nature Varieties (Trees)
  const treeFiles = [
    'CommonTree_1.gltf',
    'CommonTree_3.gltf',
    'Pine_1.gltf',
    'Pine_3.gltf',
    'TwistedTree_1.gltf',
    'DeadTree_1.gltf'
  ];
  treeFiles.forEach(file => {
    promises.push(
      loadGLTF(`/assets/nature/${file}`).then(mesh => {
        if (mesh) ASSETS.trees.push(mesh);
      })
    );
  });

  // 2. Load Rocks
  const rockFiles = [
    'Rock_Medium_1.gltf',
    'Rock_Medium_2.gltf',
    'Rock_Medium_3.gltf'
  ];
  rockFiles.forEach(file => {
    promises.push(
      loadGLTF(`/assets/nature/${file}`).then(mesh => {
        if (mesh) ASSETS.rocks.push(mesh);
      })
    );
  });

  // 3. Load Bushes
  const bushFiles = [
    'Bush_Common.gltf',
    'Bush_Common_Flowers.gltf'
  ];
  bushFiles.forEach(file => {
    promises.push(
      loadGLTF(`/assets/nature/${file}`).then(mesh => {
        if (mesh) ASSETS.bushes.push(mesh);
      })
    );
  });

  // 4. Load Foliage
  const foliageFiles = [
    'Fern_1.gltf',
    'Flower_3_Group.gltf',
    'Mushroom_Common.gltf',
    'Grass_Common_Tall.gltf'
  ];
  foliageFiles.forEach(file => {
    promises.push(
      loadGLTF(`/assets/nature/${file}`).then(mesh => {
        if (mesh) ASSETS.foliage.push(mesh);
      })
    );
  });

  // 5. Load Character skins (9 bots)
  const charFiles = {
    VIPER: 'Swat.gltf',
    ROOK: 'Adventurer.gltf',
    HAVOC: 'Punk.gltf',
    MANTIS: 'Suit.gltf',
    DRIFT: 'Casual_Hoodie.gltf',
    ONYX: 'Worker.gltf',
    SABER: 'Spacesuit.gltf',
    JUNO: 'Farmer.gltf',
    WRAITH: 'King.gltf',
  };
  for (const [name, filename] of Object.entries(charFiles)) {
    promises.push(
      loadGLTF(`/assets/characters/${filename}`).then(mesh => {
        if (mesh) ASSETS.characters[name] = mesh;
      })
    );
  }

  // 6. Load Weapon viewmodels
  promises.push(
    loadOBJWithMTL('/assets/weapons/AssaultRifle_1.mtl', '/assets/weapons/AssaultRifle_1.obj').then(mesh => {
      if (mesh) ASSETS.weapons.rifle = mesh;
    })
  );
  promises.push(
    loadOBJWithMTL('/assets/weapons/AssaultRifle2_1.mtl', '/assets/weapons/AssaultRifle2_1.obj').then(mesh => {
      if (mesh) ASSETS.weapons.dmr = mesh;
    })
  );

  // 7. Load Medieval Village modular components for cottage building
  const villagePieces = [
    'Wall_Plaster_Straight',
    'Wall_Plaster_Window_Wide_Flat',
    'Wall_Plaster_Door_Flat',
    'Roof_RoundTiles_4x4',
    'Prop_Wagon',
    'Prop_Crate',
    'Prop_Chimney'
  ];
  villagePieces.forEach(name => {
    promises.push(
      loadGLTF(`/assets/village/${name}.gltf`).then(mesh => {
        if (mesh) ASSETS.village[name] = mesh;
      })
    );
  });

  return Promise.all(promises);
}
