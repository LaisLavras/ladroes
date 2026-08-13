import Phaser from "phaser";

/** Builds a small themed icon for a stealable item, centered on (0,0). */
export function createObraIcon(scene: Phaser.Scene, itemType: string, weight: number): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const scale = 0.8 + weight * 0.25;

  switch (itemType) {
    case "dinheiro": {
      // Stepped rows of blocks (not a smooth ellipse) so the sack reads as
      // pixel art like everything else, instead of standing out as the one
      // rounded shape in the set.
      const px = 3 * scale;
      const bagColor = 0x2f8f4e;
      const outline = 0x1c2733;
      const rowWidths = [3, 6, 7, 8, 8, 7, 5]; // in px units, top to bottom
      const totalH = rowWidths.length * px;
      rowWidths.forEach((w, i) => {
        const y = i * px - totalH / 2 + px / 2 + px;
        container.add(scene.add.rectangle(0, y, w * px, px, bagColor).setStrokeStyle(1, outline));
      });
      container.add(scene.add.rectangle(0, -totalH / 2 - px / 2 + px, 2 * px, px, outline));
      container.add(
        scene.add.text(0, 4 * scale, "$", { fontFamily: "monospace", fontSize: `${11 * scale}px`, color: "#f2e94e" }).setOrigin(0.5)
      );
      break;
    }
    case "quadro": {
      const w = 20 * scale;
      const h = 26 * scale;
      container.add(scene.add.rectangle(0, 0, w, h, 0x8a5a2b).setStrokeStyle(2, 0x1c2733));
      container.add(scene.add.rectangle(0, 0, w - 6, h - 6, 0x4a7fc9));
      container.add(scene.add.rectangle(-3, 2, 6, 6, 0x2b5a9e));
      break;
    }
    case "vaso": {
      container.add(scene.add.ellipse(0, -8 * scale, 8 * scale, 5 * scale, 0xc97a3a).setStrokeStyle(1, 0x1c2733));
      container.add(
        scene.add
          .triangle(0, 0, -9 * scale, 8 * scale, 9 * scale, 8 * scale, 0, -6 * scale, 0xc97a3a)
          .setStrokeStyle(1, 0x1c2733)
      );
      break;
    }
    case "caneta": {
      container.add(scene.add.rectangle(0, 2, 5 * scale, 22 * scale, 0x1b2430).setStrokeStyle(1, 0x3a4552));
      container.add(scene.add.rectangle(0, -6 * scale, 5 * scale, 6 * scale, 0xf2c14e));
      container.add(scene.add.triangle(0, 15 * scale, -2.5 * scale, 0, 2.5 * scale, 0, 0, 6 * scale, 0xe8b98a));
      break;
    }
    case "relogio": {
      container.add(scene.add.circle(0, 0, 11 * scale, 0xe8e2d0).setStrokeStyle(2, 0xc9a24b));
      container.add(scene.add.rectangle(0, -1, 1.5 * scale, 7 * scale, 0x1c2733).setOrigin(0.5, 1));
      container.add(scene.add.rectangle(0, -1, 5 * scale, 1.5 * scale, 0x1c2733).setOrigin(0, 1));
      break;
    }
    case "colar": {
      container.add(scene.add.ellipse(0, 0, 20 * scale, 14 * scale, 0x000000, 0).setStrokeStyle(2, 0xf2e94e));
      container.add(scene.add.circle(0, 7 * scale, 4 * scale, 0x5ac9e8).setStrokeStyle(1, 0x1c2733));
      break;
    }
    case "moeda": {
      container.add(scene.add.circle(0, 0, 10 * scale, 0xf2c14e).setStrokeStyle(2, 0xc9962e));
      container.add(
        scene.add.text(0, 0, "¢", { fontFamily: "monospace", fontSize: `${11 * scale}px`, color: "#8a5a2b" }).setOrigin(0.5)
      );
      break;
    }
    case "escultura": {
      container.add(scene.add.rectangle(0, 12 * scale, 16 * scale, 5 * scale, 0x8a8f99).setStrokeStyle(1, 0x1c2733));
      container.add(scene.add.ellipse(0, 0, 10 * scale, 20 * scale, 0xd8dbe0).setStrokeStyle(1, 0x8a8f99));
      container.add(scene.add.circle(0, -11 * scale, 5 * scale, 0xd8dbe0).setStrokeStyle(1, 0x8a8f99));
      break;
    }
    case "coroa": {
      container.add(
        scene.add
          .triangle(0, 0, -11 * scale, 6 * scale, 11 * scale, 6 * scale, 0, -10 * scale, 0xf2e94e)
          .setStrokeStyle(1, 0xc9962e)
      );
      container.add(scene.add.rectangle(0, 7 * scale, 22 * scale, 5 * scale, 0xf2e94e).setStrokeStyle(1, 0xc9962e));
      container.add(scene.add.circle(0, -10 * scale, 2.5 * scale, 0xe5484d));
      break;
    }
    default: {
      container.add(scene.add.star(0, 0, 5, 6 * scale, 12 * scale, 0xf2e94e).setStrokeStyle(2, 0xffffff));
    }
  }

  return container;
}
