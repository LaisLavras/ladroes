import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import { joinHeistRoom } from "../network/room";
import { loadProfile, saveProfile } from "../economy";
import { createPersonContainer } from "../pixelPerson";
import { createObraIcon } from "../obraIcons";
import { startSuspenseMusic, stopSuspenseMusic, setGuardChaseActive, setDoorOpening } from "../audio";
import { createFloorTexture } from "../floorTexture";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const COLS = 5;
const ROWS = 5;
const ROOM_SIZE = 620;
const BOUNDS = { width: COLS * ROOM_SIZE, height: ROWS * ROOM_SIZE };
const VIEWPORT = { width: 960, height: 640 };

const ENTRANCE_CELL = { col: 0, row: 0 };
const VAULT_CELL = { col: COLS - 1, row: ROWS - 1 };

const EXIT_ZONE = { x: 24, y: ROOM_SIZE - 150, w: 150, h: 110 };

// Top-right HUD — grouped into one clearly bounded card (alarm, timer, then
// restart/exit) instead of loose text sitting flush against the canvas
// edge, which was easy to lose track of.
const HUD_PANEL = { x: VIEWPORT.width - 232, y: 8, w: 216, h: 150 };

// Minimap — a small covered panel that only reveals rooms the player has
// actually walked into, so it never spoils the layout ahead.
const MINI_CELL = 14;
const MINI_GAP = 2;
const MINI_PAD = 8;
const MINI_X = 16;
const MINI_Y = 66;
const GUARD_DETECT_RADIUS = 160;
const GUARD_CONE_HALF_ANGLE = 0.5;

/** How far a ray from (gx,gy) in direction (dx,dy) can travel before it
 * would cross out of the given room rectangle. Used to keep the vision cone
 * from being drawn through walls. */
function rayRoomExitDistance(gx: number, gy: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (x1 - gx) / dx);
  else if (dx < 0) t = Math.min(t, (x0 - gx) / dx);
  if (dy > 0) t = Math.min(t, (y1 - gy) / dy);
  else if (dy < 0) t = Math.min(t, (y0 - gy) / dy);
  return t;
}

const ROLE_COLOR: Record<string, number> = {
  hacker: 0x49c2b1,
  fantasma: 0x8b7cf6,
  fugitivo: 0xf2a641,
  engenheiro: 0xe5484d,
  chefe: 0xe5484d,
  espectador: 0x5b6773,
};

const ROLE_LABEL: Record<string, string> = {
  hacker: "Hacker",
  fantasma: "Fantasma",
  fugitivo: "Fugitivo",
  engenheiro: "Engenheiro",
  chefe: "Chefe de Segurança",
  espectador: "Espectador",
};

const ROLE_HINT: Record<string, string> = {
  // Everyone can hold E to open a door now (covered by the 💡 toast on
  // connect) — the hacker's own line only needs to call out what's actually
  // unique to the role, so it doesn't just repeat that tip.
  hacker: "abre portas bem mais rápido que os outros",
  fantasma: "SHIFT — invisibilidade (5s, recarga 30s)",
  fugitivo: "passivo — corre mais rápido que os outros",
  engenheiro: "F — EMP desliga os guardas por 10s (recarga 45s)",
  chefe: "Atravessa portas fechadas — SHIFT perto de um ladrão para capturar (recarga 3s)",
  espectador: "",
};

interface PlayerVisual {
  sprite: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
}

interface GuardVisual {
  sprite: Phaser.GameObjects.Container;
  alertDot: Phaser.GameObjects.Arc;
}

const GUARD_COLOR = 0x142445; // dark navy blue, security uniform

interface ObraVisual {
  shape: Phaser.GameObjects.Container;
}

interface HeistSceneData {
  name?: string;
  loadout?: string[];
  mode?: string;
  fakeCount?: number;
  trackerCount?: number;
}

export class HeistScene extends Phaser.Scene {
  private playerName: string = "Jogador";
  private loadout: string[] = [];
  private mode: string = "assalto";
  private fakeCount: number = 1;
  private trackerCount: number = 1;
  private room?: Room;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private keyE?: Phaser.Input.Keyboard.Key;
  private keyShift?: Phaser.Input.Keyboard.Key;
  private keyF?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;

  private visuals = new Map<string, PlayerVisual>();
  private guardVisuals: GuardVisual[] = [];
  private obraVisuals = new Map<string, ObraVisual>();

  private statusText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private bannerText?: Phaser.GameObjects.Text;
  private dynamicGfx?: Phaser.GameObjects.Graphics;
  private fogGfx?: Phaser.GameObjects.Graphics;
  private minimapGfx?: Phaser.GameObjects.Graphics;
  private visitedCells = new Set<string>();

  private alarmBarFill?: Phaser.GameObjects.Rectangle;
  private alarmLabel?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private toastText?: Phaser.GameObjects.Text;
  private toastHideEvent?: Phaser.Time.TimerEvent;
  private backToShopBtn?: Phaser.GameObjects.Text;
  private restartBtn?: Phaser.GameObjects.Text;
  private finishTimeMs?: number;

  constructor() {
    super("heist");
  }

  init(data: HeistSceneData) {
    this.finishTimeMs = undefined;
    this.playerName = data?.name ?? "Jogador";
    this.loadout = data?.loadout ?? [];
    this.mode = data?.mode ?? "assalto";
    this.fakeCount = data?.fakeCount ?? 1;
    this.trackerCount = data?.trackerCount ?? 1;

    // Phaser reuses this Scene instance across restarts (init/create run
    // again, but the constructor doesn't) — without clearing these here, a
    // fresh run would start with last run's minimap already uncovered and
    // stale sprite references left over from before the restart.
    this.visitedCells = new Set();
    this.visuals = new Map();
    this.guardVisuals = [];
    this.obraVisuals = new Map();
  }

  create() {
    // The scene instance is reused on restart, so the previous run's drone
    // would otherwise keep playing under the new one — stop it whenever this
    // scene goes away, whichever button triggered that.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopSuspenseMusic();
      setGuardChaseActive(false);
      setDoorOpening(false, 0);
    });

    this.cameras.main.setBackgroundColor(0x0b0f14);
    this.cameras.main.setBounds(0, 0, BOUNDS.width, BOUNDS.height);

    this.drawFloor();
    this.drawExitZone();

    this.dynamicGfx = this.add.graphics().setDepth(5);

    // Everything outside the room the player is currently standing in gets
    // painted over — no peeking at the vault, or where the loot sits, before
    // you actually get there.
    this.fogGfx = this.add.graphics().setDepth(9);

    this.minimapGfx = this.add.graphics().setDepth(10).setScrollFactor(0);

    this.statusText = this.add
      .text(16, 16, "Conectando ao servidor...", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8793a1",
      })
      .setDepth(10)
      .setScrollFactor(0);

    this.hintText = this.add
      .text(16, 40, "", { fontFamily: "monospace", fontSize: "13px", color: "#f2a641" })
      .setDepth(10)
      .setScrollFactor(0);

    this.add
      .rectangle(HUD_PANEL.x, HUD_PANEL.y, HUD_PANEL.w, HUD_PANEL.h, 0x0f151d, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4552)
      .setDepth(9)
      .setScrollFactor(0);

    const hudPad = 12;
    this.add
      .rectangle(HUD_PANEL.x + hudPad, HUD_PANEL.y + 16, HUD_PANEL.w - hudPad * 2, 16, 0x1c2733)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x3a4552)
      .setDepth(10)
      .setScrollFactor(0);
    this.alarmBarFill = this.add
      .rectangle(HUD_PANEL.x + hudPad + 2, HUD_PANEL.y + 16, 0, 12, 0xe5484d)
      .setOrigin(0, 0.5)
      .setDepth(10)
      .setScrollFactor(0);
    this.alarmLabel = this.add
      .text(HUD_PANEL.x + hudPad, HUD_PANEL.y + 30, "ALARME 0%", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8793a1",
      })
      .setDepth(10)
      .setScrollFactor(0);

    this.timerText = this.add
      .text(HUD_PANEL.x + HUD_PANEL.w / 2, HUD_PANEL.y + 54, "⏱ 0:00", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#f2e94e",
      })
      .setOrigin(0.5, 0)
      .setDepth(10)
      .setScrollFactor(0);

    const hudRestartBtn = this.add
      .text(HUD_PANEL.x + hudPad, HUD_PANEL.y + 92, "↻ REINICIAR", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#1c2733",
        padding: { x: 8, y: 6 },
      })
      .setDepth(10)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    hudRestartBtn.on("pointerover", () => hudRestartBtn.setColor("#49c2b1"));
    hudRestartBtn.on("pointerout", () => hudRestartBtn.setColor("#8793a1"));
    hudRestartBtn.on("pointerdown", () => {
      this.room?.leave();
      this.scene.restart({
        name: this.playerName,
        loadout: this.loadout,
        mode: this.mode,
        fakeCount: this.fakeCount,
        trackerCount: this.trackerCount,
      });
    });

    const exitBtn = this.add
      .text(HUD_PANEL.x + HUD_PANEL.w - hudPad, HUD_PANEL.y + 92, "SAIR ▸ LOJA", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8793a1",
        backgroundColor: "#1c2733",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(10)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    exitBtn.on("pointerover", () => exitBtn.setColor("#f2a641"));
    exitBtn.on("pointerout", () => exitBtn.setColor("#8793a1"));
    exitBtn.on("pointerdown", () => {
      this.room?.leave();
      this.scene.start("menu");
    });

    this.bannerText = this.add
      .text(VIEWPORT.width / 2, VIEWPORT.height / 2, "", {
        fontFamily: "monospace",
        fontSize: "40px",
        color: "#ffffff",
        backgroundColor: "#000000",
        padding: { x: 20, y: 12 },
        align: "center",
        wordWrap: { width: VIEWPORT.width - 80 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false);

    this.restartBtn = this.add
      .text(VIEWPORT.width / 2 - 8, VIEWPORT.height / 2 + 60, "↻ REINICIAR", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#0b0f14",
        backgroundColor: "#49c2b1",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(1, 0.5)
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.restartBtn.on("pointerdown", () => {
      this.room?.leave();
      this.scene.restart({
        name: this.playerName,
        loadout: this.loadout,
        mode: this.mode,
        fakeCount: this.fakeCount,
        trackerCount: this.trackerCount,
      });
    });

    this.backToShopBtn = this.add
      .text(VIEWPORT.width / 2 + 8, VIEWPORT.height / 2 + 60, "◂ VOLTAR À LOJA", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#0b0f14",
        backgroundColor: "#f2a641",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.backToShopBtn.on("pointerdown", () => {
      this.room?.leave();
      this.scene.start("menu");
    });

    // Anchored to the top-left corner (under the status/hint lines) with a
    // wrap width well inside the canvas edge — previously this sat centered
    // across the full screen width, which on a smaller browser window let
    // long messages like the door-interact tip get clipped off-screen.
    this.toastText = this.add
      .text(16, 64, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f2a641",
        backgroundColor: "#0b0f14",
        padding: { x: 12, y: 6 },
        align: "center",
        wordWrap: { width: 320 },
      })
      .setOrigin(0, 0)
      .setDepth(15)
      .setScrollFactor(0)
      .setVisible(false);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as typeof this.wasd;
    this.keyE = this.input.keyboard?.addKey("E");
    this.keyShift = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyF = this.input.keyboard?.addKey("F");
    this.keyR = this.input.keyboard?.addKey("R");

    this.connect();
  }

  private drawFloor() {
    const floorKey = createFloorTexture(this);
    this.add.tileSprite(0, 0, BOUNDS.width, BOUNDS.height, floorKey).setOrigin(0, 0).setDepth(-1);

    const g = this.add.graphics();
    g.lineStyle(1, 0x1c2733, 0.35);
    for (let x = 0; x <= BOUNDS.width; x += 32) g.lineBetween(x, 0, x, BOUNDS.height);
    for (let y = 0; y <= BOUNDS.height; y += 32) g.lineBetween(0, y, BOUNDS.width, y);
    g.lineStyle(2, 0xf2a641, 1);
    g.strokeRect(1, 1, BOUNDS.width - 2, BOUNDS.height - 2);

    this.add
      .text(ENTRANCE_CELL.col * ROOM_SIZE + 12, ENTRANCE_CELL.row * ROOM_SIZE + 10, "ENTRADA", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#49c2b1",
      })
      .setDepth(3);

    this.add
      .text(VAULT_CELL.col * ROOM_SIZE + ROOM_SIZE - 12, VAULT_CELL.row * ROOM_SIZE + 10, "COFRE", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#49c2b1",
      })
      .setOrigin(1, 0)
      .setDepth(3);
  }

  private drawExitZone() {
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(2, 0xf2a641, 0.8);
    g.strokeRect(EXIT_ZONE.x, EXIT_ZONE.y, EXIT_ZONE.w, EXIT_ZONE.h);
    this.add
      .text(EXIT_ZONE.x + EXIT_ZONE.w / 2, EXIT_ZONE.y + EXIT_ZONE.h / 2, "SAÍDA", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f2a641",
      })
      .setOrigin(0.5)
      .setDepth(3);
  }

  private async connect() {
    try {
      this.room = await joinHeistRoom({
        name: this.playerName,
        loadout: this.loadout,
        mode: this.mode,
        fakeCount: this.fakeCount,
        trackerCount: this.trackerCount,
      });
      this.statusText?.setText(`Conectado — sala ${this.room.roomId}`);
      this.showToast("💡 Segure E perto de uma porta trancada para abrir", 6000);
      startSuspenseMusic();

      const $ = getStateCallbacks(this.room);

      // The maze layout is randomized per room instance on the server, so the
      // walls are drawn from synced state instead of being hardcoded here.
      const wallsGfx = this.add.graphics().setDepth(4);
      wallsGfx.fillStyle(0x3a4552, 1);
      $(this.room.state).walls.onAdd((wall) => {
        wallsGfx.fillRect(wall.x, wall.y, wall.w, wall.h);
      });

      $(this.room.state).statues.onAdd((statue) => {
        this.add
          .text(statue.x, statue.y, "🗿", { fontSize: "40px" })
          .setOrigin(0.5)
          .setDepth(4.5);
      });

      $(this.room.state).obras.onAdd((obra) => {
        const shape = createObraIcon(this, obra.itemType, obra.weight)
          .setPosition(obra.x, obra.y)
          .setDepth(6);
        this.obraVisuals.set(obra.id, { shape });

        $(obra).onChange(() => {
          const visual = this.obraVisuals.get(obra.id);
          if (!visual) return;
          visual.shape.setPosition(obra.x, obra.y);
          visual.shape.setAlpha(obra.carriedBy === this.room?.sessionId ? 1 : 0.9);
        });
      });

      $(this.room.state).players.onAdd((player, sessionId: string) => {
        const isSelf = sessionId === this.room?.sessionId;
        const color = ROLE_COLOR[player.role] ?? 0xffffff;

        const ringColor = isSelf ? 0xffffff : 0x000000;
        const ringAlpha = isSelf ? 0.5 : 0.25;
        const ring = this.add
          .ellipse(player.x, player.y + 13, isSelf ? 22 : 18, 9, ringColor, ringAlpha)
          .setDepth(6.8);

        const sprite = createPersonContainer(this, color, { masked: player.role !== "chefe" })
          .setPosition(player.x, player.y)
          .setDepth(7)
          .setScale(isSelf ? 1.6 : 1.4);

        const label = this.add
          .text(player.x, player.y - 28, ROLE_LABEL[player.role] ?? player.role, {
            fontFamily: "monospace",
            fontSize: "12px",
            color: isSelf ? "#ffffff" : "#8793a1",
          })
          .setOrigin(0.5)
          .setDepth(7);

        this.visuals.set(sessionId, { sprite, ring, label });
        if (isSelf) {
          this.hintText?.setText(ROLE_HINT[player.role] ?? "");
          this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
        }

        $(player).onChange(() => {
          const visual = this.visuals.get(sessionId);
          if (!visual) return;
          visual.sprite.setPosition(player.x, player.y);
          visual.ring.setPosition(player.x, player.y + 13);
          visual.label.setPosition(player.x, player.y - 28);
          visual.sprite.setAlpha(player.invisible ? 0.35 : 1);
          visual.ring.setAlpha(player.invisible ? 0.1 : ringAlpha);
        });
      });

      $(this.room.state).players.onRemove((_player, sessionId: string) => {
        const visual = this.visuals.get(sessionId);
        visual?.sprite.destroy();
        visual?.ring.destroy();
        visual?.label.destroy();
        this.visuals.delete(sessionId);
      });

      $(this.room.state).guards.onAdd((_guard, index: number) => {
        const sprite = createPersonContainer(this, GUARD_COLOR, { flashlight: true }).setDepth(6).setScale(1.4);
        const alertDot = this.add.circle(0, -22, 4, 0x5b6773).setDepth(6.5);
        this.guardVisuals[index] = { sprite, alertDot };
      });

      this.room.onMessage("guardAdapted", (msg: { message: string }) => {
        this.showToast(`👁 ${msg.message}`);
      });

      this.room.onMessage("payout", (msg: { amount: number; timeMs?: number }) => {
        const profile = loadProfile();
        profile.coins += msg.amount;
        saveProfile(profile);
        this.showToast(`💰 +${msg.amount} moedas`);
        if (typeof msg.timeMs === "number") this.finishTimeMs = msg.timeMs;
      });

      this.room.onMessage("youAreTraitor", () => {
        this.showToast("🗡️ VOCÊ É O TRAIDOR — sabote portas com R, ninguém mais sabe", 8000);
      });
    } catch (err) {
      this.statusText?.setText("Falha ao conectar — o servidor está rodando?");
      console.error(err);
    }
  }

  private showToast(message: string, durationMs = 4000) {
    this.toastText?.setText(message).setVisible(true);
    this.toastHideEvent?.remove();
    this.toastHideEvent = this.time.delayedCall(durationMs, () => this.toastText?.setVisible(false));
  }

  update() {
    // The initial state patch can arrive a frame or two after the join
    // promise resolves — over real network latency (unlike localhost) this
    // gap is reliably wide enough for update() to run before it, so every
    // state read below has to tolerate `state.players` not existing yet.
    if (!this.room || !(this.room.state as any)?.players) return;

    let x = 0;
    let y = 0;
    if (this.cursors?.left.isDown || this.wasd?.A.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) x += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) y += 1;
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(2);
      x /= len;
      y /= len;
    }

    const interact = !!this.keyE?.isDown;
    const ability = !!(this.keyShift?.isDown || this.keyF?.isDown);
    const secondary = !!this.keyR?.isDown;

    this.room.send("input", { x, y, interact, ability, secondary });

    this.redrawDynamic();
    this.redrawFog();
    this.updateMinimap();
    this.updateHud();
  }

  private updateMinimap() {
    if (!this.room || !this.minimapGfx) return;
    const state = this.room.state as any;
    const me = state.players.get(this.room.sessionId);
    if (!me) return;

    const col = clamp(Math.floor(me.x / ROOM_SIZE), 0, COLS - 1);
    const row = clamp(Math.floor(me.y / ROOM_SIZE), 0, ROWS - 1);
    this.visitedCells.add(`${col},${row}`);

    const g = this.minimapGfx;
    g.clear();

    const panelW = COLS * MINI_CELL + (COLS - 1) * MINI_GAP + MINI_PAD * 2;
    const panelH = ROWS * MINI_CELL + (ROWS - 1) * MINI_GAP + MINI_PAD * 2;
    g.fillStyle(0x05070a, 0.75);
    g.fillRect(MINI_X, MINI_Y, panelW, panelH);
    g.lineStyle(1, 0x3a4552, 0.9);
    g.strokeRect(MINI_X, MINI_Y, panelW, panelH);

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        // Unvisited rooms stay covered — nothing is drawn for them at all.
        if (!this.visitedCells.has(`${c},${r}`)) continue;

        const cx = MINI_X + MINI_PAD + c * (MINI_CELL + MINI_GAP);
        const cy = MINI_Y + MINI_PAD + r * (MINI_CELL + MINI_GAP);

        const isEntrance = c === ENTRANCE_CELL.col && r === ENTRANCE_CELL.row;
        const isVault = c === VAULT_CELL.col && r === VAULT_CELL.row;
        const isHere = c === col && r === row;

        const fill = isVault ? 0xf2c14e : isEntrance ? 0x49c2b1 : 0x5b6773;
        g.fillStyle(fill, isHere ? 1 : 0.85);
        g.fillRect(cx, cy, MINI_CELL, MINI_CELL);

        if (isHere) {
          g.lineStyle(2, 0xffffff, 1);
          g.strokeRect(cx - 1, cy - 1, MINI_CELL + 2, MINI_CELL + 2);
        }
      }
    }
  }

  private redrawFog() {
    if (!this.room || !this.fogGfx) return;
    const state = this.room.state as any;
    const me = state.players.get(this.room.sessionId);
    if (!me) return;

    const col = clamp(Math.floor(me.x / ROOM_SIZE), 0, COLS - 1);
    const row = clamp(Math.floor(me.y / ROOM_SIZE), 0, ROWS - 1);
    const x0 = col * ROOM_SIZE;
    const y0 = row * ROOM_SIZE;
    const x1 = x0 + ROOM_SIZE;
    const y1 = y0 + ROOM_SIZE;

    const g = this.fogGfx;
    g.clear();
    g.fillStyle(0x05070a, 0.97);
    g.fillRect(0, 0, BOUNDS.width, y0); // above the room
    g.fillRect(0, y1, BOUNDS.width, BOUNDS.height - y1); // below the room
    g.fillRect(0, y0, x0, ROOM_SIZE); // left of the room
    g.fillRect(x1, y0, BOUNDS.width - x1, ROOM_SIZE); // right of the room
  }

  private redrawDynamic() {
    if (!this.room || !this.dynamicGfx) return;
    const state = this.room.state as any;
    const gfx = this.dynamicGfx;
    gfx.clear();

    // Doors — also drives the progressive door-creak sample: louder the
    // further open it is, playing for as long as anyone is actively holding
    // one open (picks the furthest-along door if more than one is in progress).
    let doorOpeningProgress = -1;
    state.doors?.forEach((door: any) => {
      if (!door.open) {
        gfx.fillStyle(0xe5484d, 0.8);
        gfx.fillRect(door.x, door.y, door.w, door.h);

        // The fill grows along whichever axis is actually long — a
        // horizontal doorway (wide, thin) fills left-to-right, a vertical
        // one (tall, thin) fills bottom-to-top — so the progress is always
        // visible instead of being squeezed into an 8px-tall sliver.
        const pct = Math.min(1, (door.progress ?? 0) / 100);
        gfx.fillStyle(0x49c2b1, 0.9);
        if (door.h > door.w) {
          gfx.fillRect(door.x - 2, door.y + door.h * (1 - pct), door.w + 4, door.h * pct);
        } else {
          gfx.fillRect(door.x, door.y - 2, door.w * pct, door.h + 4);
        }
        if (pct > 0) doorOpeningProgress = Math.max(doorOpeningProgress, pct);
      } else {
        gfx.fillStyle(0xffe14d, 0.55);
        gfx.fillRect(door.x, door.y, door.w, door.h);
        gfx.lineStyle(2, 0xffe14d, 0.9);
        gfx.strokeRect(door.x, door.y, door.w, door.h);
      }
    });
    setDoorOpening(doorOpeningProgress >= 0, Math.max(0, doorOpeningProgress));

    // Guards + vision cones — the siren loops for as long as any guard has
    // someone in sight, so it tracks the whole chase rather than just the
    // moment it started.
    let anyGuardAlert = false;
    state.guards?.forEach((guard: any, i: number) => {
      const visual = this.guardVisuals[i];
      if (!visual) return;
      visual.sprite.setPosition(guard.x, guard.y);
      visual.alertDot.setPosition(guard.x, guard.y - 22);
      visual.alertDot.setFillStyle(guard.alert ? 0xe5484d : 0x5b6773);
      if (guard.alert) anyGuardAlert = true;

      // Clip the cone to the guard's own room so it visually stops right at
      // the wall instead of bleeding into whatever's on the other side.
      const col = clamp(Math.floor(guard.x / ROOM_SIZE), 0, COLS - 1);
      const row = clamp(Math.floor(guard.y / ROOM_SIZE), 0, ROWS - 1);
      const x0 = col * ROOM_SIZE;
      const y0 = row * ROOM_SIZE;
      const x1 = x0 + ROOM_SIZE;
      const y1 = y0 + ROOM_SIZE;

      const SAMPLES = 8;
      const points: { x: number; y: number }[] = [{ x: guard.x, y: guard.y }];
      for (let s = 0; s <= SAMPLES; s++) {
        const a = guard.angle - GUARD_CONE_HALF_ANGLE + (GUARD_CONE_HALF_ANGLE * 2 * s) / SAMPLES;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const clipT = rayRoomExitDistance(guard.x, guard.y, dx, dy, x0, y0, x1, y1);
        const len = Math.min(GUARD_DETECT_RADIUS, clipT);
        points.push({ x: guard.x + dx * len, y: guard.y + dy * len });
      }

      gfx.fillStyle(guard.alert ? 0xe5484d : 0xf2a641, guard.alert ? 0.28 : 0.12);
      gfx.beginPath();
      gfx.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) gfx.lineTo(points[p].x, points[p].y);
      gfx.closePath();
      gfx.fillPath();
    });
    setGuardChaseActive(anyGuardAlert);
  }

  private updateHud() {
    if (!this.room) return;
    const state = this.room.state as any;

    const alarm = Math.round(state.alarm ?? 0);
    this.alarmBarFill?.setSize((alarm / 100) * (HUD_PANEL.w - 12 * 2 - 4), 12);
    this.alarmLabel?.setText(`ALARME ${alarm}%`);
    this.alarmLabel?.setColor(alarm > 66 ? "#e5484d" : alarm > 33 ? "#f2a641" : "#8793a1");

    // Keeps ticking only while the run is live — freezes on the final split
    // the instant it ends, instead of drifting past the actual finish time.
    if (state.gameStatus === "playing" && typeof state.startedAt === "number" && state.startedAt > 0) {
      this.timerText?.setText(`⏱ ${formatTime(Date.now() - state.startedAt)}`);
    }

    const timeSuffix = typeof this.finishTimeMs === "number" ? `\n⏱ ${formatTime(this.finishTimeMs)}` : "";

    if (state.gameStatus !== "playing") {
      stopSuspenseMusic();
      setGuardChaseActive(false);
      setDoorOpening(false, 0);
    }

    if (state.gameStatus === "won") {
      this.bannerText?.setText(`ROUBO CONCLUÍDO${timeSuffix}`).setColor("#49c2b1").setVisible(true);
      this.restartBtn?.setVisible(true);
      this.backToShopBtn?.setVisible(true);
    } else if (state.gameStatus === "traitor_won") {
      const iAmTraitor = state.obras?.some((o: any) => o.carriedBy === this.room?.sessionId);
      this.bannerText
        ?.setText((iAmTraitor ? "VOCÊ TRAIU O GRUPO E VENCEU SOZINHO" : "O TRAIDOR VENCEU SOZINHO") + timeSuffix)
        .setColor("#f2a641")
        .setVisible(true);
      this.restartBtn?.setVisible(true);
      this.backToShopBtn?.setVisible(true);
    } else if (state.gameStatus === "lost") {
      let text = this.mode === "seguranca" ? "SEGURANÇA VENCEU" : "POLÍCIA CHEGOU";
      if (state.loseReason === "fake") text = "SE FUDEU, ITEM FALSIFICADO, NA PRÓXIMA ESCOLHA MELHOR!";
      else if (state.loseReason === "tracker") text = "SE FUDEU, OBJETO COM RASTREADOR";
      this.bannerText?.setText(text).setColor("#e5484d").setVisible(true);
      this.restartBtn?.setVisible(true);
      this.backToShopBtn?.setVisible(true);
    }
  }
}
