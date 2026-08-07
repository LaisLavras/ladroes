import Phaser from "phaser";

// A small pixel-art person, 10 "pixels" wide by 14 tall, built out of real
// Rectangle GameObjects (rather than a generated texture, since Phaser 4's
// createCanvas() throws in this environment). Rows 1-3 have two variants: a
// robber's mask with eye-holes for thieves, or a plain face for guards.
const BASE_ROWS = [
  "..hhhh....",
  null, // row 1 — swapped in below
  null, // row 2 — swapped in below
  null, // row 3 — swapped in below
  "...SSSS...",
  ".BBBBBBBB.",
  "BBBBBBBBBB",
  "BBBBBBBBBB",
  ".BBBBBBBB.",
  ".B......B.",
  "...dddd...",
  "...dddd...",
  "...dddd...",
  "..dd..dd..",
];
const PLAIN_ROWS = [".hSSSSSh..", ".hSeSSeSh.", ".hSSSSSh.."];
// Three rows tall (not just one) and wider than the face rows above/below —
// so it reads as a bandit's bandana overhanging the temples at normal sprite
// scale, without needing to zoom in to tell it apart from a plain face.
const MASKED_ROWS = ["MMMMMMMMMM", "MMMeMMeMMM", "MMMMMMMMMM"];
const PX = 2;

const PIXEL_COLORS: Record<string, number> = {
  h: 0x2b1b12,
  S: 0xe8b98a,
  M: 0x14181f,
  d: 0x1c2733,
};

export interface PersonOptions {
  /** Black robber's mask with eye-holes, for thieves. */
  masked?: boolean;
  /** A little flashlight block held out to the side, for guards. */
  flashlight?: boolean;
}

/** Builds a small pixel-art person, centered on (0,0) within the returned container. */
export function createPersonContainer(
  scene: Phaser.Scene,
  bodyColor: number,
  options: PersonOptions = {}
): Phaser.GameObjects.Container {
  const bandRows = options.masked ? MASKED_ROWS : PLAIN_ROWS;
  const grid = BASE_ROWS.map((row, i) => (i >= 1 && i <= 3 ? bandRows[i - 1] : row)) as string[];
  const eyeColor = options.masked ? 0xf2f2f2 : 0x1b2430;

  const cols = grid[0].length;
  const rows = grid.length;
  const totalW = cols * PX;
  const totalH = rows * PX;

  const container = scene.add.container(0, 0);

  const place = (rx: number, ry: number, color: number, w = PX, h = PX) => {
    const localX = rx * PX + w / 2 - totalW / 2;
    const localY = ry * PX + h / 2 - totalH / 2;
    container.add(scene.add.rectangle(localX, localY, w, h, color));
  };

  grid.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === ".") continue;
      const color = ch === "B" ? bodyColor : ch === "e" ? eyeColor : PIXEL_COLORS[ch];
      place(rx, ry, color);
    }
  });

  if (options.flashlight) {
    place(cols, 9, 0xfff2b0, PX * 2, PX);
  }

  return container;
}
