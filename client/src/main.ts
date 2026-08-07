import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { HeistScene } from "./scenes/HeistScene";
import { LeaderboardScene } from "./scenes/LeaderboardScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 640,
  backgroundColor: "#0b0f14",
  pixelArt: true,
  // Without this, the canvas renders at a fixed 960x640 and anything past
  // the edge of a narrower browser window is simply clipped off-screen
  // (body has overflow: hidden, so there's not even a scrollbar to reach
  // it) — FIT scales the whole game down to fit instead.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, HeistScene, LeaderboardScene],
});
