'use strict';

export const G = {
  running: false,
  over: false,
  locked: false,
  hp: 100,
  shield: 0,
  kills: 0,
  timeAlive: 0,
  keys: {} as Record<string, boolean>,
  firing: false,
  stage: 'playing',
};
