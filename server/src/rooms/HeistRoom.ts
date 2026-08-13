import { Room, Client } from "@colyseus/core";
import { HeistState } from "./schema/HeistState";
import { PlayerState } from "./schema/PlayerState";
import { GuardState } from "./schema/GuardState";
import { DoorState } from "./schema/DoorState";
import { WallState } from "./schema/WallState";
import { StatueState } from "./schema/StatueState";
import { ObraState } from "./schema/ObraState";
import { addScore } from "../leaderboard";

const ROLES = ["hacker", "fantasma", "fugitivo", "engenheiro"];
const BASE_SPEED = 220; // px/s
const FUGITIVO_SPEED_MULT = 1.4;
const PLAYER_R = 16;

const TRAITOR_SABOTAGE_ALARM_RATE = 3; // per second, while closing a door — a little noise "calling guards"

// The museum is a grid of rooms with exactly one correct path carved through
// it from the entrance to the vault — most rooms are dead ends, so choosing
// the wrong door really does cost you a detour.
const COLS = 5;
const ROWS = 5;
const ROOM_SIZE = 620;
const BOUNDS = { width: COLS * ROOM_SIZE, height: ROWS * ROOM_SIZE };

const ENTRANCE_CELL = { col: 0, row: 0 };
// The vault always sits exactly this many rooms from the entrance (by the
// only path that reaches it) — a run's minimum possible distance is the same
// every match, so times on the leaderboard are actually comparable to each
// other instead of depending on how short or long that game's maze happened
// to roll. Where those 10 rooms lead changes every match; the rest of the
// grid is filled in around that fixed-length path as ordinary maze branches.
const TRUNK_LENGTH = 10;

const WALL_THICKNESS = 8;
const DOOR_GAP_SIZE = 110;
const DOOR_MARGIN = 70; // keep the doorway clear of room corners

const DOOR_FILL_RATE = 100 / 9; // 9s to open for anyone now that all roles can do it
const HACKER_DOOR_MULT = 1.5; // hacker keeps the original 6s pace, everyone else is slower
const DOOR_RADIUS = 64;
const PICKUP_RADIUS = 40;

// Bigger and heavier pieces are worth more — but slow whoever carries them
// down, unless that's the Fugitivo (who's built for hauling heavy loads).
// One of these is a forgery, and one is wired with a tracker — walking out
// with either busts the whole crew instead of paying out. Which ones change
// every match.
const OBRA_POOL: { itemType: string; value: number; weight: number }[] = [
  { itemType: "dinheiro", value: 220, weight: 1 },
  { itemType: "dinheiro", value: 280, weight: 2 },
  { itemType: "quadro", value: 420, weight: 2 },
  { itemType: "quadro", value: 560, weight: 3 },
  { itemType: "vaso", value: 340, weight: 2 },
  { itemType: "caneta", value: 140, weight: 1 },
  { itemType: "relogio", value: 300, weight: 1 },
  { itemType: "colar", value: 480, weight: 1 },
  { itemType: "moeda", value: 200, weight: 1 },
  { itemType: "escultura", value: 640, weight: 3 },
  { itemType: "coroa", value: 720, weight: 2 },
];
const WEIGHT_SPEED_PENALTY = 0.08; // per weight point above 1

const EXIT_ZONE = { x: 24, y: ROOM_SIZE - 150, w: 150, h: 110 };

const GUARD_SPEED = 90; // px/s, patrolling
const GUARD_CHASE_SPEED = 110; // px/s, once a guard has spotted someone — still a step up from patrol, but slow enough to outrun
const GUARD_CHASE_FORGET_MS = 4000; // keeps pursuing this long after losing sight
const GUARD_DETECT_RADIUS = 160;
const GUARD_CONE_HALF_ANGLE = 0.5; // radians — must match the cone drawn client-side
const GUARD_WAYPOINT_EPS = 6;
const GUARD_ROOM_INSET = 70;

// Alarm climbs faster the closer a guard is to the thief it's looking at,
// and only within the vision cone — never through walls or from behind.
const ALARM_RISE_MIN = 6; // per second, right at the edge of the cone
const ALARM_RISE_MAX = 26; // per second, standing right in front of a guard
const ALARM_DECAY_RATE = 5; // per second, while hidden

const STATUE_R = 24;
const STATUE_HIDE_RADIUS = 58;
const STATUE_MARGIN = 100; // keep statues clear of walls/doors

const GHOST_INVISIBLE_MS = 5000;
const GHOST_COOLDOWN_MS = 30000;
const ENGINEER_EMP_MS = 10000;
const ENGINEER_COOLDOWN_MS = 45000;

// Adaptive AI: after this many times a guard spots someone, it starts
// lingering longer at each stop on its patrol — it's learned people keep
// coming through here.
const ADAPT_THRESHOLD = 3;
const ADAPT_DWELL_MS = 3000;

interface PlayerInput {
  x: number;
  y: number;
  interact: boolean;
  ability: boolean;
  secondary: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell {
  col: number;
  row: number;
}

function cellKey(c: Cell) {
  return `${c.col},${c.row}`;
}

function connectionKey(a: Cell, b: Cell) {
  return [cellKey(a), cellKey(b)].sort().join("-");
}

const DIRS = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

/** A self-avoiding walk of exactly `length` steps from the entrance, chosen
 * at random each call — this becomes the one guaranteed-length path to the
 * vault. Backtracks on dead ends so it always finds one when the grid has
 * room for it (25 cells comfortably fits a 10-step path). */
function generateTrunkPath(cols: number, rows: number, length: number): Cell[] {
  const path: Cell[] = [{ ...ENTRANCE_CELL }];
  const visited = new Set<string>([cellKey(path[0])]);

  function step(): boolean {
    if (path.length - 1 === length) return true;
    const current = path[path.length - 1];

    for (const d of shuffled(DIRS)) {
      const nc = current.col + d.dc;
      const nr = current.row + d.dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = { col: nc, row: nr };
      const key = cellKey(next);
      if (visited.has(key)) continue;

      visited.add(key);
      path.push(next);
      if (step()) return true;
      path.pop();
      visited.delete(key);
    }

    return false;
  }

  if (!step()) throw new Error("could not fit a trunk path of the requested length");
  return path;
}

/** Randomized depth-first "recursive backtracker" — the standard algorithm for
 * carving a perfect maze (exactly one path between any two rooms, plenty of
 * dead ends) out of a grid. Seeded with the trunk path already "carved" and
 * marked visited, so the single path it leaves between the entrance and the
 * trunk's far end is exactly that trunk — everything else branches off of it
 * (and off those branches) as ordinary dead-end maze. */
function generateMazeConnections(cols: number, rows: number): { connections: Set<string>; vaultCell: Cell } {
  const trunk = generateTrunkPath(cols, rows, TRUNK_LENGTH);

  const visited = new Set<string>(trunk.map(cellKey));
  const connections = new Set<string>();
  for (let i = 0; i < trunk.length - 1; i++) {
    connections.add(connectionKey(trunk[i], trunk[i + 1]));
  }

  const stack: Cell[] = [...trunk];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Cell[] = [];

    for (const d of DIRS) {
      const nc = current.col + d.dc;
      const nr = current.row + d.dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = { col: nc, row: nr };
      if (!visited.has(cellKey(next))) neighbors.push(next);
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    connections.add(connectionKey(current, next));
    visited.add(cellKey(next));
    stack.push(next);
  }

  return { connections, vaultCell: trunk[trunk.length - 1] };
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Smallest signed difference between two angles, in [-PI, PI]. */
function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function circleIntersectsRect(px: number, py: number, r: number, rect: Rect) {
  const closestX = clamp(px, rect.x, rect.x + rect.w);
  const closestY = clamp(py, rect.y, rect.y + rect.h);
  const dx = px - closestX;
  const dy = py - closestY;
  return dx * dx + dy * dy < r * r;
}

/** Distance from a point to the closest point on a line segment. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + t * dx, ay + t * dy);
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface RoomBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function randomPointIn(b: RoomBounds) {
  return { x: b.x0 + Math.random() * (b.x1 - b.x0), y: b.y0 + Math.random() * (b.y1 - b.y0) };
}

interface GuardRoute {
  target: { x: number; y: number };
  homeCell: Cell;
  bounds: RoomBounds;
  detectionCount: number;
  adapted: boolean;
  wasDetecting: boolean;
  pauseUntil: number;
  /** sessionId of whoever this guard last spotted — it keeps running toward
   * them even through a brief loss of sight, until GUARD_CHASE_FORGET_MS
   * passes with no detection at all. */
  chaseTargetId: string | null;
  lastSeenAt: number;
}

interface ObraSecret {
  isFake: boolean;
  hasTracker: boolean;
}

export class HeistRoom extends Room<HeistState> {
  maxClients = 4;

  private mode: "assalto" | "traidor" = "assalto";
  private traitorSessionId: string | null = null;
  // Decided once, before anyone joins: which join position (1-indexed)
  // secretly becomes the traitor. This makes it a real lottery instead
  // of always picking whoever happens to connect first.
  private specialSlot = 1;

  private inputs = new Map<string, PlayerInput>();
  private invisibleUntil = new Map<string, number>();
  private guardsDisabledUntil = 0;
  private guardRoutes: GuardRoute[] = [];
  private staticWalls: Rect[] = [];
  private statues: { x: number; y: number }[] = [];
  private obraSecrets = new Map<string, ObraSecret>();
  // Overwritten by setupMaze() before anything else reads it — the default
  // here only matters if that ever stops being true.
  private vaultCell: Cell = { col: COLS - 1, row: ROWS - 1 };

  onCreate(options: {
    mode?: string;
    fakeCount?: number;
    trackerCount?: number;
    solo?: boolean;
    private?: boolean;
  }) {
    this.setState(new HeistState());
    this.state.startedAt = Date.now();

    if (options?.mode === "traidor") {
      this.mode = options.mode;
    }
    this.state.mode = this.mode;
    this.maxClients = 4;
    // Solo play has to actually be capped at 1 seat — without this, "Sozinho"
    // just joined the same public matchmaking pool as everyone else and any
    // stranger could land in what looked like a private run.
    if (options?.solo) this.maxClients = 1;
    if (options?.private || options?.solo) this.setPrivate(true);
    this.specialSlot = 1 + Math.floor(Math.random() * this.maxClients);

    this.setupMaze();
    this.setupGuards();
    this.setupStatues();
    this.setupObras(options?.fakeCount, options?.trackerCount);

    this.onMessage("input", (client, message: Partial<PlayerInput>) => {
      this.inputs.set(client.sessionId, {
        x: clamp(Number(message?.x) || 0, -1, 1),
        y: clamp(Number(message?.y) || 0, -1, 1),
        interact: !!message?.interact,
        ability: !!message?.ability,
        secondary: !!message?.secondary,
      });
    });

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), 1000 / 30);
  }

  /** Carves a single-path maze over the room grid — only the spanning-tree
   * edges get a door, every other shared wall stays solid, so plenty of
   * rooms end up as dead ends. */
  private setupMaze() {
    const { connections, vaultCell } = generateMazeConnections(COLS, ROWS);
    this.vaultCell = vaultCell;
    this.state.vaultCol = vaultCell.col;
    this.state.vaultRow = vaultCell.row;

    const addSharedWall = (
      orientation: "vertical" | "horizontal",
      wallPos: number,
      spanStart: number,
      spanEnd: number,
      a: Cell,
      b: Cell
    ) => {
      const connected = connections.has(connectionKey(a, b));
      const span = spanEnd - spanStart;

      if (!connected) {
        const solid: Rect =
          orientation === "vertical"
            ? { x: wallPos - WALL_THICKNESS / 2, y: spanStart, w: WALL_THICKNESS, h: span }
            : { x: spanStart, y: wallPos - WALL_THICKNESS / 2, w: span, h: WALL_THICKNESS };
        this.addWall(solid);
        return;
      }

      // The doorway doesn't have to sit in the middle of the wall — it can
      // open up anywhere along it (with a little clearance from the corners).
      const usable = span - 2 * DOOR_MARGIN - DOOR_GAP_SIZE;
      const gapStart = spanStart + DOOR_MARGIN + Math.random() * Math.max(0, usable);
      const gapEnd = gapStart + DOOR_GAP_SIZE;

      if (orientation === "vertical") {
        this.addWall({ x: wallPos - WALL_THICKNESS / 2, y: spanStart, w: WALL_THICKNESS, h: gapStart - spanStart });
        this.addWall({ x: wallPos - WALL_THICKNESS / 2, y: gapEnd, w: WALL_THICKNESS, h: spanEnd - gapEnd });
        this.addDoor(`${cellKey(a)}|${cellKey(b)}`, {
          x: wallPos - WALL_THICKNESS / 2,
          y: gapStart,
          w: WALL_THICKNESS,
          h: DOOR_GAP_SIZE,
        });
      } else {
        this.addWall({ x: spanStart, y: wallPos - WALL_THICKNESS / 2, w: gapStart - spanStart, h: WALL_THICKNESS });
        this.addWall({ x: gapEnd, y: wallPos - WALL_THICKNESS / 2, w: spanEnd - gapEnd, h: WALL_THICKNESS });
        this.addDoor(`${cellKey(a)}|${cellKey(b)}`, {
          x: gapStart,
          y: wallPos - WALL_THICKNESS / 2,
          w: DOOR_GAP_SIZE,
          h: WALL_THICKNESS,
        });
      }
    };

    // Vertical walls, between horizontally-adjacent rooms
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 1; col++) {
        addSharedWall(
          "vertical",
          (col + 1) * ROOM_SIZE,
          row * ROOM_SIZE,
          (row + 1) * ROOM_SIZE,
          { col, row },
          { col: col + 1, row }
        );
      }
    }

    // Horizontal walls, between vertically-adjacent rooms
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS - 1; row++) {
        addSharedWall(
          "horizontal",
          (row + 1) * ROOM_SIZE,
          col * ROOM_SIZE,
          (col + 1) * ROOM_SIZE,
          { col, row },
          { col, row: row + 1 }
        );
      }
    }
  }

  private addWall(rect: Rect) {
    this.staticWalls.push(rect);
    const wall = new WallState();
    wall.x = rect.x;
    wall.y = rect.y;
    wall.w = rect.w;
    wall.h = rect.h;
    this.state.walls.push(wall);
  }

  private addDoor(id: string, rect: Rect) {
    const door = new DoorState();
    door.id = id;
    door.x = rect.x;
    door.y = rect.y;
    door.w = rect.w;
    door.h = rect.h;
    this.state.doors.push(door);
  }

  private guardedRooms(): Cell[] {
    const rooms: Cell[] = [];
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const isEntrance = col === ENTRANCE_CELL.col && row === ENTRANCE_CELL.row;
        const isVault = col === this.vaultCell.col && row === this.vaultCell.row;
        if (!isEntrance && !isVault) rooms.push({ col, row });
      }
    }
    return rooms;
  }

  private addGuard(col: number, row: number) {
    const bounds: RoomBounds = {
      x0: col * ROOM_SIZE + GUARD_ROOM_INSET,
      y0: row * ROOM_SIZE + GUARD_ROOM_INSET,
      x1: (col + 1) * ROOM_SIZE - GUARD_ROOM_INSET,
      y1: (row + 1) * ROOM_SIZE - GUARD_ROOM_INSET,
    };
    const start = randomPointIn(bounds);

    const route: GuardRoute = {
      target: randomPointIn(bounds),
      homeCell: { col, row },
      bounds,
      detectionCount: 0,
      adapted: false,
      wasDetecting: false,
      pauseUntil: 0,
      chaseTargetId: null,
      lastSeenAt: 0,
    };

    const guard = new GuardState();
    guard.x = start.x;
    guard.y = start.y;
    this.state.guards.push(guard);
    this.guardRoutes.push(route);
  }

  private setupGuards() {
    for (const { col, row } of this.guardedRooms()) {
      // Each guard wanders to a fresh random spot in its room rather than
      // walking a fixed loop, so patrols never feel scripted or all facing
      // the same way.
      this.addGuard(col, row);
      this.addGuard(col, row);
    }
  }

  private setupStatues() {
    for (const { col, row } of this.guardedRooms()) {
      const x0 = col * ROOM_SIZE + STATUE_MARGIN;
      const y0 = row * ROOM_SIZE + STATUE_MARGIN;
      const x1 = (col + 1) * ROOM_SIZE - STATUE_MARGIN;
      const y1 = (row + 1) * ROOM_SIZE - STATUE_MARGIN;

      const x = x0 + Math.random() * (x1 - x0);
      const y = y0 + Math.random() * (y1 - y0);

      this.statues.push({ x, y });
      const statue = new StatueState();
      statue.x = x;
      statue.y = y;
      this.state.statues.push(statue);
    }
  }

  private setupObras(fakeCountRaw?: number, trackerCountRaw?: number) {
    const maxEach = OBRA_POOL.length - 1;
    // `Number(x) || fallback` would silently turn an explicit 0 (no tracker
    // at all, solo-only option) back into 1 — only fall back when the value
    // is actually missing/NaN, not when it's a legitimate 0.
    const normalize = (raw: number | undefined, fallback: number, min: number) => {
      const n = Number(raw);
      return clamp(Number.isFinite(n) ? Math.round(n) : fallback, min, maxEach);
    };
    let fakeCount = normalize(fakeCountRaw, 1, 1);
    let trackerCount = normalize(trackerCountRaw, 1, 0);
    if (fakeCount + trackerCount > OBRA_POOL.length - 1) {
      trackerCount = Math.max(0, OBRA_POOL.length - 1 - fakeCount);
    }

    const cols = 3;
    const cellW = ROOM_SIZE / cols;
    const rows = Math.ceil(OBRA_POOL.length / cols);
    const cellH = ROOM_SIZE / (rows + 1);
    const vaultOriginX = this.vaultCell.col * ROOM_SIZE;
    const vaultOriginY = this.vaultCell.row * ROOM_SIZE;

    const order = shuffled(OBRA_POOL.map((_, i) => i));
    const fakeIndexes = new Set(order.slice(0, fakeCount));
    const trackerIndexes = new Set(order.slice(fakeCount, fakeCount + trackerCount));

    OBRA_POOL.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const obra = new ObraState();
      obra.id = `item${i}`;
      obra.itemType = def.itemType;
      obra.x = vaultOriginX + cellW * (col + 0.5);
      obra.y = vaultOriginY + cellH * (row + 1);
      obra.value = def.value;
      obra.weight = def.weight;
      this.state.obras.push(obra);

      this.obraSecrets.set(obra.id, {
        isFake: fakeIndexes.has(i),
        hasTracker: trackerIndexes.has(i),
      });
    });
  }

  onJoin(client: Client, options: { loadout?: string[]; name?: string }) {
    const joinIndex = this.state.players.size + 1;

    const takenRoles = new Set([...this.state.players.values()].map((p) => p.role));
    const role = ROLES.find((r) => !takenRoles.has(r)) ?? "espectador";

    const player = new PlayerState();
    const trimmedName = typeof options?.name === "string" ? options.name.trim().slice(0, 20) : "";
    player.name = trimmedName || `Jogador ${joinIndex}`;
    player.role = role;
    player.x = ROOM_SIZE / 2;
    player.y = ROOM_SIZE / 2;

    const loadout = Array.isArray(options?.loadout) ? options.loadout : [];
    player.hasSapato = loadout.includes("sapato");
    player.hasFolego = loadout.includes("folego");
    player.hasKitHacker = loadout.includes("kit_hacker");

    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { x: 0, y: 0, interact: false, ability: false, secondary: false });

    if (this.mode === "traidor" && joinIndex === this.specialSlot) {
      this.traitorSessionId = client.sessionId;
      client.send("youAreTraitor", {});
    }

    console.log(`[HeistRoom] ${client.sessionId} entrou como ${role}`);
  }

  onLeave(client: Client) {
    for (const obra of this.state.obras) {
      if (obra.carriedBy === client.sessionId) obra.carriedBy = "";
    }
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.invisibleUntil.delete(client.sessionId);
  }

  private isBlocked(x: number, y: number, ignoreDoors = false): boolean {
    for (const wall of this.staticWalls) {
      if (circleIntersectsRect(x, y, PLAYER_R, wall)) return true;
    }
    if (!ignoreDoors) {
      for (const door of this.state.doors) {
        if (!door.open && circleIntersectsRect(x, y, PLAYER_R, door)) return true;
      }
    }
    for (const statue of this.statues) {
      if (dist(x, y, statue.x, statue.y) < PLAYER_R + STATUE_R) return true;
    }
    return false;
  }

  /** True if a statue sits between the guard and the player, and the player
   * is actually tucked in close behind it — not just coincidentally lined up. */
  private isHiddenBehindStatue(guardX: number, guardY: number, playerX: number, playerY: number): boolean {
    for (const statue of this.statues) {
      if (dist(playerX, playerY, statue.x, statue.y) > STATUE_HIDE_RADIUS) continue;
      if (distToSegment(statue.x, statue.y, guardX, guardY, playerX, playerY) < STATUE_R) return true;
    }
    return false;
  }

  private cellOf(x: number, y: number): Cell {
    return {
      col: clamp(Math.floor(x / ROOM_SIZE), 0, COLS - 1),
      row: clamp(Math.floor(y / ROOM_SIZE), 0, ROWS - 1),
    };
  }

  private tick(dt: number) {
    if (this.state.gameStatus !== "playing") return;

    const now = Date.now();
    this.state.elapsedMs = now - this.state.startedAt;

    // Opening a door takes continuous effort — a door that isn't actively
    // being filled by a hacker this tick snaps its progress back to 0, so
    // letting go of the button always means starting over from scratch.
    const doorsBeingOpened = new Set<string>();
    let sabotageActive = false;

    for (const [sessionId, player] of this.state.players.entries()) {
      const input = this.inputs.get(sessionId);
      if (!input) continue;

      // Expire invisibility
      if (player.invisible && now >= (this.invisibleUntil.get(sessionId) ?? 0)) {
        player.invisible = false;
      }

      let speed = BASE_SPEED;
      if (player.role === "fugitivo") speed *= FUGITIVO_SPEED_MULT;
      if (player.hasFolego) speed *= 1.1;

      // Heavy loot slows you down — unless you're the Fugitivo, built for it.
      if (player.role !== "fugitivo") {
        const carried = this.state.obras.find((o) => o.carriedBy === sessionId);
        if (carried && carried.weight > 1) {
          speed *= 1 - WEIGHT_SPEED_PENALTY * (carried.weight - 1);
        }
      }

      const nx = clamp(player.x + input.x * speed * dt, PLAYER_R, BOUNDS.width - PLAYER_R);
      const ny = clamp(player.y + input.y * speed * dt, PLAYER_R, BOUNDS.height - PLAYER_R);

      if (!this.isBlocked(nx, player.y)) player.x = nx;
      if (!this.isBlocked(player.x, ny)) player.y = ny;

      // Anyone can hold interact near a closed door to open it — the hacker
      // just does it faster, and faster still with the hacker kit equipped.
      if (input.interact) {
        for (const door of this.state.doors) {
          if (door.open) continue;
          const doorPointX = door.x + door.w / 2;
          const doorPointY = door.y + door.h / 2;
          if (dist(player.x, player.y, doorPointX, doorPointY) < DOOR_RADIUS) {
            doorsBeingOpened.add(door.id);
            let fillRate = DOOR_FILL_RATE;
            if (player.role === "hacker") fillRate *= player.hasKitHacker ? HACKER_DOOR_MULT * 1.4 : HACKER_DOOR_MULT;
            door.progress = Math.min(100, door.progress + fillRate * dt);
            if (door.progress >= 100) door.open = true;
            break;
          }
        }
      }

      // Traitor: hold secondary near an open door to sabotage it shut again
      if (this.traitorSessionId === sessionId && input.secondary) {
        for (const door of this.state.doors) {
          if (!door.open) continue;
          const doorPointX = door.x + door.w / 2;
          const doorPointY = door.y + door.h / 2;
          if (dist(player.x, player.y, doorPointX, doorPointY) < DOOR_RADIUS) {
            door.progress = Math.max(0, door.progress - DOOR_FILL_RATE * dt);
            if (door.progress <= 0) door.open = false;
            this.state.alarm = Math.min(100, this.state.alarm + TRAITOR_SABOTAGE_ALARM_RATE * dt);
            sabotageActive = true;
            break;
          }
        }
      }

      // Anyone: pick up one artwork at a time (only reachable once the doors
      // on the way to the vault have been opened, since walls block movement
      // otherwise). You can only carry one piece — grab the small easy one
      // for a safe payout, or risk more time inside for the big one. There's
      // no way to tell which piece is the forgery or has a tracker until
      // it's too late.
      if (input.interact && !this.state.obras.some((o) => o.carriedBy === sessionId)) {
        const target = this.state.obras.find(
          (o) => o.carriedBy === "" && dist(player.x, player.y, o.x, o.y) < PICKUP_RADIUS
        );
        if (target) target.carriedBy = sessionId;
      }

      // Abilities
      if (input.ability && now >= player.abilityCooldownUntil) {
        if (player.role === "fantasma") {
          player.invisible = true;
          this.invisibleUntil.set(sessionId, now + GHOST_INVISIBLE_MS);
          player.abilityCooldownUntil = now + GHOST_COOLDOWN_MS;
        } else if (player.role === "engenheiro") {
          this.guardsDisabledUntil = now + ENGINEER_EMP_MS;
          player.abilityCooldownUntil = now + ENGINEER_COOLDOWN_MS;
        }
      }
    }

    // Nobody kept a hand on it this tick — it swings back shut.
    for (const door of this.state.doors) {
      if (!door.open && door.progress > 0 && !doorsBeingOpened.has(door.id)) {
        door.progress = 0;
      }
    }

    // Each carried artwork follows its carrier
    for (const obra of this.state.obras) {
      if (!obra.carriedBy) continue;
      const carrier = this.state.players.get(obra.carriedBy);
      if (!carrier) continue;

      obra.x = carrier.x;
      obra.y = carrier.y;

      const carrierCell = this.cellOf(carrier.x, carrier.y);
      const inExit =
        carrierCell.col === ENTRANCE_CELL.col &&
        carrierCell.row === ENTRANCE_CELL.row &&
        carrier.x >= EXIT_ZONE.x &&
        carrier.x <= EXIT_ZONE.x + EXIT_ZONE.w &&
        carrier.y >= EXIT_ZONE.y &&
        carrier.y <= EXIT_ZONE.y + EXIT_ZONE.h;

      if (inExit) {
        const secret = this.obraSecrets.get(obra.id);

        if (secret?.isFake) {
          this.state.loseReason = "fake";
          this.state.gameStatus = "lost";
        } else if (secret?.hasTracker) {
          this.state.loseReason = "tracker";
          this.state.gameStatus = "lost";
        } else {
          const payout = obra.value + Math.round((100 - this.state.alarm) * 2);
          const timeMs = Date.now() - this.state.startedAt;

          if (this.mode === "traidor" && obra.carriedBy === this.traitorSessionId) {
            // The traitor made it out alone — the rest of the crew gets nothing.
            this.state.gameStatus = "traitor_won";
            const traitorClient = this.clients.find((c) => c.sessionId === this.traitorSessionId);
            traitorClient?.send("payout", { amount: payout, timeMs });
            this.recordCompletion([this.traitorSessionId], timeMs);
          } else {
            this.state.gameStatus = "won";
            this.broadcast("payout", { amount: payout, timeMs });
            this.recordCompletion([...this.state.players.keys()], timeMs);
          }
        }

        this.lock();
        break;
      }
    }

    this.updateGuards(dt, now, sabotageActive);
  }

  /** Logs one leaderboard entry per given player, all sharing the run's finish time.
   * Fire-and-forget from tick() (which can't await), but the writes inside
   * still happen one at a time — running them concurrently would race on
   * Firestore's read-modify-write and could silently drop an entry. */
  private recordCompletion(sessionIds: string[], timeMs: number) {
    const date = new Date().toISOString();
    (async () => {
      for (const sessionId of sessionIds) {
        const player = this.state.players.get(sessionId);
        if (!player) continue;
        await addScore({ name: player.name, timeMs, mode: this.mode, date });
      }
    })().catch((err) => console.error("[HeistRoom] failed to record completion:", err));
  }

  private updateGuards(dt: number, now: number, sabotageActive: boolean) {
    const guardsActive = now >= this.guardsDisabledUntil;
    let anyDetected = false;
    let bestRiseRate = 0;

    this.state.guards.forEach((guard, i) => {
      const route = this.guardRoutes[i];

      // Who (if anyone) is actually in the beam right now.
      let detected = false;
      let detectedSessionId: string | null = null;
      let bestCloseness = 0;

      if (guardsActive) {
        for (const [sessionId, player] of this.state.players.entries()) {
          if (player.invisible) continue;
          const playerCell = this.cellOf(player.x, player.y);
          if (playerCell.col !== route.homeCell.col || playerCell.row !== route.homeCell.row) continue; // walls block line of sight

          const detectRadius = player.hasSapato ? GUARD_DETECT_RADIUS * 0.7 : GUARD_DETECT_RADIUS;
          const d = dist(guard.x, guard.y, player.x, player.y);
          if (d >= detectRadius) continue;

          // Only what's actually inside the cone counts — nothing behind or
          // beside the guard, no matter how close.
          const angleToPlayer = Math.atan2(player.y - guard.y, player.x - guard.x);
          if (Math.abs(angleDiff(angleToPlayer, guard.angle)) > GUARD_CONE_HALF_ANGLE) continue;

          if (this.isHiddenBehindStatue(guard.x, guard.y, player.x, player.y)) continue;

          const closeness = 1 - d / detectRadius; // 0 at the cone's edge, 1 right up close
          if (closeness > bestCloseness) {
            bestCloseness = closeness;
            detected = true;
            detectedSessionId = sessionId;
          }
        }
      }

      if (detected) {
        route.chaseTargetId = detectedSessionId;
        route.lastSeenAt = now;
      }

      // Once spotted, a guard sprints straight at its target and keeps
      // going even through a brief loss of line-of-sight — it only breaks
      // off the chase after GUARD_CHASE_FORGET_MS with nobody in the beam.
      const chaseTarget = route.chaseTargetId ? this.state.players.get(route.chaseTargetId) : undefined;
      const isChasing = !!chaseTarget && now - route.lastSeenAt < GUARD_CHASE_FORGET_MS;

      if (isChasing && chaseTarget) {
        const dx = chaseTarget.x - guard.x;
        const dy = chaseTarget.y - guard.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          guard.x += (dx / d) * GUARD_CHASE_SPEED * dt;
          guard.y += (dy / d) * GUARD_CHASE_SPEED * dt;
          guard.angle = Math.atan2(dy, dx);
        }
      } else {
        route.chaseTargetId = null;

        if (now >= route.pauseUntil) {
          const dx = route.target.x - guard.x;
          const dy = route.target.y - guard.y;
          const d = Math.hypot(dx, dy);

          if (d < GUARD_WAYPOINT_EPS) {
            route.target = randomPointIn(route.bounds);
            if (route.adapted) {
              // This guard has learned players keep passing through here —
              // it now lingers longer at each stop, scanning the room.
              route.pauseUntil = now + ADAPT_DWELL_MS;
            }
          } else {
            guard.x += (dx / d) * GUARD_SPEED * dt;
            guard.y += (dy / d) * GUARD_SPEED * dt;
            guard.angle = Math.atan2(dy, dx);
          }
        }
      }

      guard.alert = detected || isChasing;
      if (detected) {
        anyDetected = true;
        const rate = ALARM_RISE_MIN + (ALARM_RISE_MAX - ALARM_RISE_MIN) * bestCloseness;
        if (rate > bestRiseRate) bestRiseRate = rate;
      }

      if (detected && !route.wasDetecting) {
        route.detectionCount += 1;
        if (route.detectionCount >= ADAPT_THRESHOLD && !route.adapted) {
          route.adapted = true;
          this.broadcast("guardAdapted", {
            message: "Esse caminho está sendo usado muito. Vou patrulhar aqui.",
          });
        }
      }
      route.wasDetecting = detected;
    });

    if (anyDetected) {
      this.state.alarm = Math.min(100, this.state.alarm + bestRiseRate * dt);
    } else if (!sabotageActive) {
      // Sabotage already bumped the alarm up this tick (above, in the main
      // player loop) — decaying it again right after would cancel that out
      // every single tick, so the alarm would never actually rise from
      // sabotaging with no guard watching.
      this.state.alarm = Math.max(0, this.state.alarm - ALARM_DECAY_RATE * dt);
    }

    if (this.state.alarm >= 100) {
      this.state.loseReason = "guards";
      this.state.gameStatus = "lost";
      this.lock();
    }
  }
}
