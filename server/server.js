const http = require('http');
const express = require('express');
const cors = require('cors');
const colyseus = require('colyseus');
const schema = require('@colyseus/schema');

const Schema = schema.Schema;
const MapSchema = schema.MapSchema;

// Define Network Player Schema
class NetworkPlayer extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.shield = 50;
    this.isFiring = false;
    this.isCrouching = false;
    this.isSprinting = false;
    this.weaponName = 'M4 CARBINE';
  }
}
schema.defineTypes(NetworkPlayer, {
  x: 'number',
  y: 'number',
  z: 'number',
  yaw: 'number',
  pitch: 'number',
  hp: 'number',
  shield: 'number',
  isFiring: 'boolean',
  isCrouching: 'boolean',
  isSprinting: 'boolean',
  weaponName: 'string'
});

// Define Room State
class RoomState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
schema.defineTypes(RoomState, {
  players: { map: NetworkPlayer }
});

// Define Colyseus Room logic
class GameRoom extends colyseus.Room {
  onCreate(options) {
    this.setState(new RoomState());
    
    // Handle player incoming state updates
    this.onMessage('updateState', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.z = data.z;
        player.yaw = data.yaw;
        player.pitch = data.pitch;
        player.isFiring = data.isFiring;
        player.isCrouching = data.isCrouching;
        player.isSprinting = data.isSprinting;
        player.weaponName = data.weaponName;
      }
    });

    // Broadcast tracers and shooting FX to other clients
    this.onMessage('shoot', (client, data) => {
      this.broadcast('onShoot', {
        sessionId: client.sessionId,
        origin: data.origin,
        direction: data.direction
      }, { except: client });
    });

    // Handle damage logic between players
    this.onMessage('hit', (client, data) => {
      const targetSessionId = data.targetId;
      const targetPlayer = this.state.players.get(targetSessionId);
      if (targetPlayer && targetPlayer.hp > 0) {
        const damage = data.dmg || 24;
        
        // Apply shield and health reduction
        if (targetPlayer.shield > 0) {
          const absorbed = Math.min(targetPlayer.shield, damage * 0.65);
          targetPlayer.shield -= absorbed;
          targetPlayer.hp -= (damage - absorbed);
        } else {
          targetPlayer.hp -= damage;
        }

        if (targetPlayer.hp <= 0) {
          targetPlayer.hp = 0;
          this.broadcast('eliminated', {
            targetId: targetSessionId,
            attackerId: client.sessionId,
            attackerName: data.attackerName || 'Another Player'
          });
        }
      }
    });
  }

  onJoin(client, options) {
    console.log(`Player connected: ${client.sessionId}`);
    const newPlayer = new NetworkPlayer();
    
    // Spawn at a random position near origin
    newPlayer.x = (Math.random() - 0.5) * 45;
    newPlayer.z = (Math.random() - 0.5) * 45;
    newPlayer.y = 12; // Start above ground, physics will ground them
    newPlayer.hp = 100;
    newPlayer.shield = 50;
    
    this.state.players.set(client.sessionId, newPlayer);
  }

  onLeave(client, consented) {
    console.log(`Player disconnected: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log('Room disposed');
  }
}

// Setup Express and Server
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new colyseus.Server({
  server: server,
});

gameServer.define('battle_room', GameRoom);

const PORT = process.env.PORT || 2567;
server.listen(PORT, () => {
  console.log(`Colyseus game server running on ws://localhost:${PORT}`);
});
