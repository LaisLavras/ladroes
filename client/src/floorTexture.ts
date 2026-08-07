import Phaser from "phaser";

const TILE = 256;
const PLANK_H = 32;
const PLANK_W = 128;

const PLANK_TONES = ["#b5772f", "#c9873f", "#a6672b", "#d99a4e", "#bd7f38"];
const SEAM_COLOR = "rgba(74, 45, 15, 0.55)";
const GRAIN_COLOR = "rgba(74, 45, 15, 0.18)";

/** Draws a tileable wood-plank floor once per game instance (offset rows,
 * per-plank tint variation, seam + grain lines) and returns its texture key
 * — generated at runtime so the game doesn't need to ship a floor image. */
export function createFloorTexture(scene: Phaser.Scene): string {
  const key = "floorWood";
  if (scene.textures.exists(key)) return key;

  const canvas = scene.textures.createCanvas(key, TILE, TILE)!;
  const ctx = canvas.context;

  for (let y = 0; y < TILE; y += PLANK_H) {
    // Every other row of planks is offset by half a plank, like a real
    // staggered wood floor instead of a plain grid.
    const rowIndex = Math.floor(y / PLANK_H);
    const offset = rowIndex % 2 === 0 ? 0 : -PLANK_W / 2;

    for (let x = offset; x < TILE; x += PLANK_W) {
      ctx.fillStyle = PLANK_TONES[Math.floor(Math.random() * PLANK_TONES.length)];
      ctx.fillRect(x, y, PLANK_W, PLANK_H);

      ctx.strokeStyle = SEAM_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, PLANK_W - 2, PLANK_H - 2);
    }

    // A faint horizontal grain line running through each row of planks.
    ctx.strokeStyle = GRAIN_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + PLANK_H / 2 + (Math.random() - 0.5) * 4);
    ctx.lineTo(TILE, y + PLANK_H / 2 + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  canvas.refresh();
  return key;
}
