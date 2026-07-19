declare module 'https://unpkg.com/three@0.128.0/build/three.module.js' {
  export * from 'three';
}

declare module 'https://unpkg.com/three@0.128.0/examples/jsm/utils/SkeletonUtils.js' {
  export namespace SkeletonUtils {
    function clone(object: any): any;
  }
}

declare module 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js' {
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
  export { GLTFLoader };
}

declare module 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/OBJLoader.js' {
  import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
  export { OBJLoader };
}

declare module 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/MTLLoader.js' {
  import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
  export { MTLLoader };
}
