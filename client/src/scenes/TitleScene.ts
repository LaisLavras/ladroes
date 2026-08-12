import Phaser from "phaser";
import { createPersonContainer } from "../pixelPerson";
import { createObraIcon } from "../obraIcons";

const WIDTH = 960;
const HEIGHT = 640;

// Loot scattered around the two thieves — a mix of item types/weights so the
// pile reads as varied treasure instead of copies of the same icon.
const LOOT: { itemType: string; weight: number; x: number; y: number; scale: number }[] = [
  { itemType: "coroa", weight: 2, x: 480, y: 472, scale: 2.6 },
  { itemType: "moeda", weight: 1, x: 392, y: 505, scale: 2.2 },
  { itemType: "moeda", weight: 1, x: 568, y: 503, scale: 2 },
  { itemType: "colar", weight: 1, x: 430, y: 450, scale: 2.4 },
  { itemType: "dinheiro", weight: 2, x: 550, y: 454, scale: 2.4 },
  { itemType: "escultura", weight: 3, x: 312, y: 460, scale: 1.8 },
  { itemType: "vaso", weight: 2, x: 648, y: 464, scale: 2 },
];

/** The very first thing a player sees — a title card with the two thieves and
 * their loot, before getting into the mode/loadout picking in MenuScene. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0b0f14);

    const g = this.add.graphics();
    g.lineStyle(1, 0x1c2733, 1);
    for (let x = 0; x <= WIDTH; x += 32) g.lineBetween(x, 0, x, HEIGHT);
    for (let y = 0; y <= HEIGHT; y += 32) g.lineBetween(0, y, WIDTH, y);

    this.add
      .text(WIDTH / 2, 96, "LADRÕES DE MUSEU", {
        fontFamily: "monospace",
        fontSize: "52px",
        color: "#f2a641",
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, 150, "um roubo cooperativo em pixel art", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8793a1",
      })
      .setOrigin(0.5);

    // Loot pile first (behind), thieves on top of it.
    LOOT.forEach((item) => {
      createObraIcon(this, item.itemType, item.weight).setPosition(item.x, item.y).setScale(item.scale).setDepth(1);
    });

    createPersonContainer(this, 0x49c2b1, { masked: true }).setPosition(400, 320).setScale(7).setDepth(2);
    createPersonContainer(this, 0xf2a641, { masked: true }).setPosition(560, 320).setScale(7).setDepth(2);

    const playBtn = this.add
      .rectangle(WIDTH / 2, HEIGHT - 70, 260, 56, 0x49c2b1)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    const playLabel = this.add
      .text(WIDTH / 2, HEIGHT - 70, "JOGAR", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#0b0f14",
      })
      .setOrigin(0.5)
      .setDepth(3);

    playBtn.on("pointerover", () => playBtn.setFillStyle(0x6ed9c7));
    playBtn.on("pointerout", () => playBtn.setFillStyle(0x49c2b1));
    playBtn.on("pointerdown", () => {
      this.scene.start("menu");
    });
    playLabel.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.scene.start("menu"));
  }
}
