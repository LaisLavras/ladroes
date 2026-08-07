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
  scene: [MenuScene, HeistScene, LeaderboardScene],
});
