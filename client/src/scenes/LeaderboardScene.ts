import Phaser from "phaser";
import { SERVER_HTTP_URL } from "../network/room";

const WIDTH = 960;

interface LeaderboardEntry {
  name: string;
  timeMs: number;
  mode: string;
  date: string;
}

const MODES = [
  { id: "assalto", name: "Assalto" },
  { id: "traidor", name: "Traidor" },
];

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export class LeaderboardScene extends Phaser.Scene {
  private selectedMode: string = "assalto";
  private modeCards: { id: string; bg: Phaser.GameObjects.Rectangle }[] = [];
  private listText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super("leaderboard");
  }

  create() {
    // A scene shutdown never destroys its Game Objects on its own — without
    // this, coming back to the ranking screen piled a fresh copy on top of
    // whatever was already sitting here from before.
    this.children.removeAll(true);
    this.cameras.main.setBackgroundColor(0x0b0f14);
    this.modeCards = [];

    this.add
      .text(WIDTH / 2, 40, "🏆 RANKING — MENOR TEMPO", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#f2a641",
      })
      .setOrigin(0.5);

    const backBtn = this.add
      .text(16, 16, "◂ VOLTAR", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#121822",
        padding: { x: 8, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#f2a641"));
    backBtn.on("pointerout", () => backBtn.setColor("#8793a1"));
    backBtn.on("pointerdown", () => this.scene.start("menu"));

    MODES.forEach((mode, i) => this.renderModeCard(WIDTH / 2 - 110 + i * 220, 90, mode));

    this.statusText = this.add
      .text(WIDTH / 2, 140, "Carregando...", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#8793a1",
      })
      .setOrigin(0.5, 0);

    this.listText = this.add.text(WIDTH / 2, 170, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
      lineSpacing: 10,
    });
    this.listText.setOrigin(0.5, 0);

    this.refresh();
  }

  private renderModeCard(x: number, y: number, mode: (typeof MODES)[number]) {
    const bg = this.add
      .rectangle(x, y, 200, 36, 0x121822)
      .setStrokeStyle(1, 0x3a4552)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, y, mode.name, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    bg.on("pointerdown", () => {
      this.selectedMode = mode.id;
      this.refresh();
    });

    this.modeCards.push({ id: mode.id, bg });
  }

  private async refresh() {
    for (const card of this.modeCards) {
      const selected = this.selectedMode === card.id;
      card.bg.setStrokeStyle(selected ? 2 : 1, selected ? 0xf2a641 : 0x3a4552);
    }

    this.statusText?.setText("Carregando...").setVisible(true);
    this.listText?.setText("");

    try {
      const res = await fetch(`${SERVER_HTTP_URL}/leaderboard?mode=${this.selectedMode}&limit=10`);
      const entries: LeaderboardEntry[] = await res.json();

      if (entries.length === 0) {
        this.statusText?.setText("Ninguém completou esse modo ainda — seja o primeiro!");
        return;
      }

      this.statusText?.setVisible(false);
      const lines = entries.map((e, i) => {
        const rank = `${i + 1}.`.padEnd(4, " ");
        return `${rank} ${formatTime(e.timeMs).padEnd(6, " ")} ${e.name}`;
      });
      this.listText?.setText(lines.join("\n"));
    } catch (err) {
      this.statusText?.setText("Falha ao carregar o ranking — o servidor está rodando?");
      console.error(err);
    }
  }
}
