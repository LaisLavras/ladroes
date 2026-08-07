import Phaser from "phaser";

const TILE = 256;
const BLOCK = 64;

const STONE_TONES = ["#7d6a4a", "#71603f", "#867257", "#655437", "#786547"];
const MORTAR_COLOR = "rgba(30, 24, 15, 0.7)";
const CRACK_COLOR = "rgba(30, 24, 15, 0.4)";
const SPECKLE_COLOR = "rgba(20, 16, 10, 0.3)";

/** Draws a tileable ancient-stone floor once per game instance (weathered
 * sandstone blocks, mortar seams, speckling, the odd crack) and returns its
 * texture key — generated at runtime so the game doesn't need to ship a
 * floor image. */
export function createFloorTexture(scene: Phaser.Scene): string {
  const key = "floorStone";
  if (scene.textures.exists(key)) return key;

  const canvas = scene.textures.createCanvas(key, TILE, TILE)!;
  const ctx = canvas.context;

  for (let by = 0; by < TILE; by += BLOCK) {
    for (let bx = 0; bx < TILE; bx += BLOCK) {
      ctx.fillStyle = STONE_TONES[Math.floor(Math.random() * STONE_TONES.length)];
      ctx.fillRect(bx, by, BLOCK, BLOCK);

      ctx.strokeStyle = MORTAR_COLOR;
      ctx.lineWidth = 3;
      ctx.strokeRect(bx + 1, by + 1, BLOCK - 2, BLOCK - 2);

      // Weathering speckles scattered across the block.
      ctx.fillStyle = SPECKLE_COLOR;
      const speckleCount = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < speckleCount; i++) {
        const sx = bx + Math.random() * BLOCK;
        const sy = by + Math.random() * BLOCK;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Some blocks get a jagged hairline crack.
      if (Math.random() < 0.4) {
        ctx.strokeStyle = CRACK_COLOR;
        ctx.lineWidth = 1;
        let cx = bx + Math.random() * BLOCK;
        let cy = by + Math.random() * BLOCK;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const segments = 2 + Math.floor(Math.random() * 2);
        for (let s = 0; s < segments; s++) {
          cx += (Math.random() - 0.5) * BLOCK * 0.4;
          cy += (Math.random() - 0.5) * BLOCK * 0.4;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
  }

  canvas.refresh();
  return key;
}
