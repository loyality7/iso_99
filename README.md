# ISO-99 — Browser Battle Royale

A complete browser-based 3D Battle Royale game running on procedurally generated infinite terrain using Three.js and synthesized web audio.

## Project Structure

The project has been split from a monolithic single HTML file into a clean, modular structure:

```text
ISO-99/
├── css/
│   └── style.css      # Custom HSL-based styles, dark-themed overlays, and HUD styles
├── js/
│   ├── audio.js       # Audio synthesizer for procedural sound effects (shots, steps, ticks)
│   ├── bots.js        # AI bots state machine (wander, chase, attack) and visual meshes
│   ├── engine.js      # Three.js viewport configuration (scene, camera, lights, renderer)
│   ├── game.js        # Master loop, frame tick timers, user event dispatching
│   ├── loot.js        # Loot chests spawns (ammo, health, shield, DMR rifle) and pickup sensors
│   ├── player.js      # Player movement physics, WASD inputs, camera, and health/shield logic
│   ├── state.js       # Game global state container (scores, kills, game settings)
│   ├── terrain.js     # Noise-based height field formula, dynamic chunk lodger, cover check
│   ├── ui.js          # Canvas 2D minimap drawings, feed logs, screen updates
│   ├── utils.js       # Seeded RNG, clamp, lerp, and formatted text time helpers
│   └── weapon.js      # Gun models, muzzle flashes, reloading timers, bullet tracer VFX
├── index.html         # Document outline and module script launcher
├── package.json       # Project dependencies and Vite build script configuration
└── README.md          # Technical overview and quick start guide
```

## How to Run Locally

### 1. Install Dependencies
You need [Node.js](https://nodejs.org/) installed. Run the following command in this directory:
```bash
npm install
```

### 2. Run in Development Mode
Launch the local development server:
```bash
npm run dev
```

### 3. Build for Production
Generate optimized static production bundles in `/dist`:
```bash
npm run build
```
