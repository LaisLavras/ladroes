import Phaser from "phaser";
import { createPersonContainer } from "../pixelPerson";
import { createObraIcon } from "../obraIcons";

const WIDTH = 960;
const HEIGHT = 640;

const THIEVES = [
  { x: 400, color: 0x49c2b1, bagX: 305 },
  { x: 560, color: 0xf2a641, bagX: 655 },
];
const THIEF_Y = 380;
const THIEF_SCALE = 8;
const BAG_Y = 415;
const BAG_SCALE = 2.6;

/** The very first thing a player sees — a title card with the two thieves,
 * each clutching a sack of loot, before getting into the mode/loadout
 * picking in MenuScene. */
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
      .text(WIDTH / 2, 150, "Entre e saia sem ser notado — seu faro é aguçado o\nsuficiente pra não ser pego?!", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8793a1",
        align: "center",
      })
      .setOrigin(0.5);

    THIEVES.forEach((t) => {
      createPersonContainer(this, t.color, { masked: true }).setPosition(t.x, THIEF_Y).setScale(THIEF_SCALE).setDepth(2);
      createObraIcon(this, "dinheiro", 2).setPosition(t.bagX, BAG_Y).setScale(BAG_SCALE).setDepth(2);
    });

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
