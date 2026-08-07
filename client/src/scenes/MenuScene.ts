import Phaser from "phaser";
import { ITEMS, loadProfile, saveProfile, type Profile } from "../economy";
import { setMusicEnabled, setSfxEnabled, setMusicVolume, playAlertSound } from "../audio";

const WIDTH = 960;
const HEIGHT = 640;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const MODES = [
  { id: "assalto", name: "Assalto", desc: "Cooperativo — 4 papéis contra os guardas" },
  { id: "traidor", name: "Traidor", desc: "1 dos 4 jogadores pode trair o grupo em segredo" },
  { id: "seguranca", name: "Ladrões vs Segurança", desc: "Um jogador controla o chefe, os outros roubam" },
];

const PLAYER_MODES = [
  { id: "solo", name: "Singleplayer", desc: "Você contra os guardas, sem outros jogadores (sempre modo Assalto)" },
  { id: "publica", name: "Multiplayer — Sala Aberta", desc: "Entra numa partida pública — qualquer um pode completar" },
  { id: "privada", name: "Multiplayer — Sala Privada", desc: "Só quem tiver o código entra — até 4 jogadores" },
];

// Multiplayer keeps a tight, fair range since it's the same setup for
// everyone in the room. Solo has no one else to keep it fair for, so the
// tracker can be dropped entirely (leaving just the forged piece) and the
// counts can go much higher — capped so at least one real item is always
// left in the vault.
const MULTI_COUNT_RANGE = { fake: { min: 1, max: 3 }, tracker: { min: 1, max: 3 } };
const SOLO_COUNT_RANGE = { fake: { min: 1, max: 9 }, tracker: { min: 0, max: 9 } };

export class MenuScene extends Phaser.Scene {
  private profile!: Profile;
  private selectedMode: string = "assalto";
  private playerMode: "solo" | "publica" | "privada" = "publica";
  private coinsText?: Phaser.GameObjects.Text;
  private feedbackText?: Phaser.GameObjects.Text;
  private nameText?: Phaser.GameObjects.Text;
  private modeCards: { id: string; bg: Phaser.GameObjects.Rectangle }[] = [];
  private playerModeCards: { id: string; bg: Phaser.GameObjects.Rectangle }[] = [];
  private itemCards: { id: string; bg: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text }[] = [];
  private startBtn?: Phaser.GameObjects.Rectangle;
  private startBtnLabel?: Phaser.GameObjects.Text;
  private createPrivateBtn?: Phaser.GameObjects.Text;
  private joinPrivateBtn?: Phaser.GameObjects.Text;
  private stepperTexts: Partial<Record<"fakeCount" | "trackerCount", Phaser.GameObjects.Text>> = {};
  private vaultHintText?: Phaser.GameObjects.Text;
  private musicToggle?: Phaser.GameObjects.Text;
  private sfxToggle?: Phaser.GameObjects.Text;
  private musicVolumeText?: Phaser.GameObjects.Text;

  constructor() {
    super("menu");
  }

  create() {
    this.profile = loadProfile();
    this.selectedMode = this.profile.lastMode;
    this.cameras.main.setBackgroundColor(0x0b0f14);
    setMusicEnabled(this.profile.musicEnabled);
    setSfxEnabled(this.profile.sfxEnabled);
    setMusicVolume(this.profile.musicVolume);

    this.add
      .text(WIDTH / 2, 36, "LADRÕES DE MUSEU", {
        fontFamily: "monospace",
        fontSize: "26px",
        color: "#f2a641",
      })
      .setOrigin(0.5);

    this.coinsText = this.add
      .text(WIDTH / 2, 72, "", { fontFamily: "monospace", fontSize: "16px", color: "#f2e94e" })
      .setOrigin(0.5);

    this.feedbackText = this.add
      .text(WIDTH / 2, 96, "", { fontFamily: "monospace", fontSize: "12px", color: "#8793a1" })
      .setOrigin(0.5);

    this.nameText = this.add
      .text(16, 8, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#121822",
        padding: { x: 8, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    this.nameText.on("pointerover", () => this.nameText?.setColor("#f2a641"));
    this.nameText.on("pointerout", () => this.nameText?.setColor("#8793a1"));
    this.nameText.on("pointerdown", () => this.editName());

    const rankingBtn = this.add
      .text(WIDTH - 16, 8, "🏆 RANKING", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#121822",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    rankingBtn.on("pointerover", () => rankingBtn.setColor("#f2a641"));
    rankingBtn.on("pointerout", () => rankingBtn.setColor("#8793a1"));
    rankingBtn.on("pointerdown", () => this.scene.start("leaderboard"));

    this.musicToggle = this.add
      .text(16, 32, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#121822",
        padding: { x: 8, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    this.musicToggle.on("pointerover", () => this.musicToggle?.setColor("#f2a641"));
    this.musicToggle.on("pointerout", () => this.musicToggle?.setColor("#8793a1"));
    this.musicToggle.on("pointerdown", () => {
      this.profile.musicEnabled = !this.profile.musicEnabled;
      setMusicEnabled(this.profile.musicEnabled);
      saveProfile(this.profile);
      this.refresh();
    });

    this.sfxToggle = this.add
      .text(140, 32, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#121822",
        padding: { x: 8, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    this.sfxToggle.on("pointerover", () => this.sfxToggle?.setColor("#f2a641"));
    this.sfxToggle.on("pointerout", () => this.sfxToggle?.setColor("#8793a1"));
    this.sfxToggle.on("pointerdown", () => {
      this.profile.sfxEnabled = !this.profile.sfxEnabled;
      setSfxEnabled(this.profile.sfxEnabled);
      saveProfile(this.profile);
      this.refresh();
      if (this.profile.sfxEnabled) playAlertSound();
    });

    // Its own row below the ON/OFF toggles — sharing their row would run
    // straight into the centered title at this width.
    this.add.text(16, 59, "Volume da música:", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#8793a1",
    });
    const volMinusBtn = this.add
      .text(150, 56, "−", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f2a641",
        backgroundColor: "#121822",
        padding: { x: 7, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    this.musicVolumeText = this.add
      .text(180, 59, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0);
    const volPlusBtn = this.add
      .text(210, 56, "+", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f2a641",
        backgroundColor: "#121822",
        padding: { x: 7, y: 4 },
      })
      .setInteractive({ useHandCursor: true });
    const changeMusicVolume = (delta: number) => {
      this.profile.musicVolume = clamp(this.profile.musicVolume + delta, 0, 100);
      setMusicVolume(this.profile.musicVolume);
      saveProfile(this.profile);
      this.refresh();
    };
    volMinusBtn.on("pointerdown", () => changeMusicVolume(-10));
    volPlusBtn.on("pointerdown", () => changeMusicVolume(10));

    this.add.text(60, 130, "EQUIPAMENTOS", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#49c2b1",
    });
    this.add.text(160, 131, "(uso único — vale só para o próximo roubo)", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#5b6773",
    });

    ITEMS.forEach((item, i) => this.renderItemCard(60, 160 + i * 76, item));

    this.add.text(500, 130, "JOGADORES", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#49c2b1",
    });
    PLAYER_MODES.forEach((pm, i) => this.renderPlayerModeCard(500, 160 + i * 76, pm));

    this.createPrivateBtn = this.add
      .text(500, 386, "CRIAR SALA", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#0b0f14",
        backgroundColor: "#49c2b1",
        padding: { x: 10, y: 8 },
      })
      .setInteractive({ useHandCursor: true });
    this.createPrivateBtn.on("pointerdown", () => this.startGame("privadaCriar"));

    this.joinPrivateBtn = this.add
      .text(500 + 140, 386, "ENTRAR C/ CÓDIGO", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#0b0f14",
        backgroundColor: "#f2a641",
        padding: { x: 10, y: 8 },
      })
      .setInteractive({ useHandCursor: true });
    this.joinPrivateBtn.on("pointerdown", () => this.joinPrivateRoom());

    this.add.text(60, 420, "MODO DE JOGO", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#49c2b1",
    });
    MODES.forEach((mode, i) => this.renderModeCard(60 + i * 300, 446, mode));

    this.add.text(60, 520, "NO COFRE", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#49c2b1",
    });
    this.vaultHintText = this.add.text(150, 521, "", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#5b6773",
    });
    this.renderStepper(60, 544, "Itens falsos", "fakeCount");
    this.renderStepper(360, 544, "Itens c/ rastreador", "trackerCount");

    this.startBtn = this.add
      .rectangle(WIDTH / 2, HEIGHT - 40, 260, 48, 0x49c2b1)
      .setInteractive({ useHandCursor: true });
    this.startBtnLabel = this.add
      .text(WIDTH / 2, HEIGHT - 40, "ENTRAR NO MUSEU", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#0b0f14",
      })
      .setOrigin(0.5);
    this.startBtn.on("pointerdown", () => {
      this.startGame(this.playerMode === "solo" ? "solo" : "publica");
    });

    this.refresh();
  }

  /** Spends the single-use loadout and returns what's left to send with the join. */
  private spendLoadout(): string[] {
    const loadout = Object.keys(this.profile.inventory).filter((id) => this.profile.inventory[id] > 0);
    for (const id of loadout) {
      this.profile.inventory[id] -= 1;
      if (this.profile.inventory[id] <= 0) delete this.profile.inventory[id];
    }
    saveProfile(this.profile);
    return loadout;
  }

  private startGame(connectMode: "solo" | "publica" | "privadaCriar") {
    this.profile.lastMode = this.selectedMode;
    const loadout = this.spendLoadout();

    this.scene.start("heist", {
      name: this.profile.name,
      loadout,
      mode: connectMode === "solo" ? "assalto" : this.selectedMode,
      fakeCount: this.profile.fakeCount,
      trackerCount: this.profile.trackerCount,
      connectMode,
    });
  }

  private joinPrivateRoom() {
    const code = window.prompt("Código da sala privada:", "");
    if (code === null) return;
    const trimmed = code.trim();
    if (!trimmed) return;

    this.profile.lastMode = this.selectedMode;
    const loadout = this.spendLoadout();

    this.scene.start("heist", {
      name: this.profile.name,
      loadout,
      mode: this.selectedMode,
      fakeCount: this.profile.fakeCount,
      trackerCount: this.profile.trackerCount,
      connectMode: "privadaEntrar",
      privateCode: trimmed,
    });
  }

  private renderPlayerModeCard(x: number, y: number, pm: (typeof PLAYER_MODES)[number]) {
    const bg = this.add
      .rectangle(x, y, 400, 64, 0x121822)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4552)
      .setInteractive({ useHandCursor: true });

    this.add.text(x + 12, y + 8, pm.name, {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#ffffff",
    });
    this.add.text(x + 12, y + 26, pm.desc, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#8793a1",
      wordWrap: { width: 376 },
    });

    bg.on("pointerdown", () => {
      this.playerMode = pm.id as typeof this.playerMode;
      this.refresh();
    });

    this.playerModeCards.push({ id: pm.id, bg });
  }

  private renderModeCard(x: number, y: number, mode: (typeof MODES)[number]) {
    const bg = this.add
      .rectangle(x, y, 284, 66, 0x121822)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4552)
      .setInteractive({ useHandCursor: true });

    this.add.text(x + 12, y + 8, mode.name, {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#ffffff",
    });
    this.add.text(x + 12, y + 28, mode.desc, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#8793a1",
      wordWrap: { width: 260 },
    });

    bg.on("pointerdown", () => {
      this.selectedMode = mode.id;
      this.refresh();
    });

    this.modeCards.push({ id: mode.id, bg });
  }

  /** Current allowed [min,max] for a vault stepper — wider once "Singleplayer" is selected. */
  private stepperRange(key: "fakeCount" | "trackerCount"): { min: number; max: number } {
    const table = this.playerMode === "solo" ? SOLO_COUNT_RANGE : MULTI_COUNT_RANGE;
    return key === "fakeCount" ? table.fake : table.tracker;
  }

  private renderStepper(x: number, y: number, label: string, key: "fakeCount" | "trackerCount") {
    this.add.text(x, y + 3, label, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#8793a1",
    });

    const controlsX = x + 170;
    const minusBtn = this.add
      .text(controlsX, y, "−", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f2a641",
        backgroundColor: "#121822",
        padding: { x: 8, y: 3 },
      })
      .setInteractive({ useHandCursor: true });

    const valueText = this.add
      .text(controlsX + 32, y + 3, String(this.profile[key]), {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0);
    this.stepperTexts[key] = valueText;

    const plusBtn = this.add
      .text(controlsX + 54, y, "+", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f2a641",
        backgroundColor: "#121822",
        padding: { x: 8, y: 3 },
      })
      .setInteractive({ useHandCursor: true });

    const change = (delta: number) => {
      const { min, max } = this.stepperRange(key);
      this.profile[key] = clamp(this.profile[key] + delta, min, max);
      valueText.setText(String(this.profile[key]));
      saveProfile(this.profile);
    };
    minusBtn.on("pointerdown", () => change(-1));
    plusBtn.on("pointerdown", () => change(1));
  }

  private renderItemCard(x: number, y: number, item: (typeof ITEMS)[number]) {
    const bg = this.add
      .rectangle(x, y, 400, 64, 0x121822)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4552)
      .setInteractive({ useHandCursor: true });

    this.add.text(x + 12, y + 8, item.name, {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#ffffff",
    });
    this.add.text(x + 12, y + 24, `${item.cost} moedas`, {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#f2e94e",
    });
    this.add.text(x + 12, y + 42, item.desc, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#8793a1",
      wordWrap: { width: 260 },
    });
    const status = this.add
      .text(x + 388, y + 8, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f2e94e",
      })
      .setOrigin(1, 0);

    bg.on("pointerdown", () => this.buyItem(item.id, item.cost));

    this.itemCards.push({ id: item.id, bg, status });
  }

  private buyItem(id: string, cost: number) {
    if (this.profile.coins < cost) {
      this.feedbackText?.setText("Moedas insuficientes.");
      return;
    }
    this.profile.coins -= cost;
    this.profile.inventory[id] = (this.profile.inventory[id] ?? 0) + 1;
    saveProfile(this.profile);
    this.feedbackText?.setText("Comprado! Vai ser usado no seu próximo roubo.");
    this.refresh();
  }

  private editName() {
    const chosen = window.prompt("Seu nome (aparece no ranking):", this.profile.name);
    if (chosen === null) return;
    const trimmed = chosen.trim().slice(0, 20);
    if (!trimmed) return;
    this.profile.name = trimmed;
    saveProfile(this.profile);
    this.refresh();
  }

  private refresh() {
    this.coinsText?.setText(`💰 ${this.profile.coins} moedas`);
    this.nameText?.setText(`👤 ${this.profile.name} (trocar)`);
    this.musicToggle?.setText(`🎵 Música: ${this.profile.musicEnabled ? "ON" : "OFF"}`);
    this.sfxToggle?.setText(`🔊 Efeitos: ${this.profile.sfxEnabled ? "ON" : "OFF"}`);
    this.musicVolumeText?.setText(`${this.profile.musicVolume}%`);

    for (const card of this.itemCards) {
      const count = this.profile.inventory[card.id] ?? 0;
      card.status.setText(count > 0 ? `possui ${count}` : "");
      card.bg.setStrokeStyle(1, count > 0 ? 0x49c2b1 : 0x3a4552);
    }

    for (const card of this.modeCards) {
      const selected = this.selectedMode === card.id;
      card.bg.setStrokeStyle(selected ? 2 : 1, selected ? 0xf2a641 : 0x3a4552);
    }

    for (const card of this.playerModeCards) {
      const selected = this.playerMode === card.id;
      card.bg.setStrokeStyle(selected ? 2 : 1, selected ? 0xf2a641 : 0x3a4552);
    }

    // Switching player mode changes the allowed range — re-clamp whatever
    // was picked before so a solo-only value (like 0 trackers) never gets
    // sent into a multiplayer room.
    (["fakeCount", "trackerCount"] as const).forEach((key) => {
      const { min, max } = this.stepperRange(key);
      this.profile[key] = clamp(this.profile[key], min, max);
      this.stepperTexts[key]?.setText(String(this.profile[key]));
    });
    saveProfile(this.profile);
    this.vaultHintText?.setText(
      this.playerMode === "solo" ? "(singleplayer: rastreador pode ser 0, até 9 de cada)" : ""
    );

    const isPrivate = this.playerMode === "privada";
    this.startBtn?.setVisible(!isPrivate);
    this.startBtnLabel?.setVisible(!isPrivate);
    this.startBtnLabel?.setText("JOGAR");
    this.createPrivateBtn?.setVisible(isPrivate);
    this.joinPrivateBtn?.setVisible(isPrivate);
  }
}
