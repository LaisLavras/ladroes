import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { GuardState } from "./GuardState";
import { DoorState } from "./DoorState";
import { WallState } from "./WallState";
import { StatueState } from "./StatueState";
import { ObraState } from "./ObraState";

export class HeistState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([GuardState]) guards = new ArraySchema<GuardState>();
  @type([DoorState]) doors = new ArraySchema<DoorState>();
  @type([WallState]) walls = new ArraySchema<WallState>();
  @type([StatueState]) statues = new ArraySchema<StatueState>();
  @type([ObraState]) obras = new ArraySchema<ObraState>();

  @type("number") alarm: number = 0;
  @type("number") startedAt: number = 0;
  // Elapsed time computed server-side (both readings off the same clock) —
  // the client used to do Date.now() - startedAt itself, comparing its own
  // clock against the server's, which went negative whenever the two
  // machines' clocks weren't in perfect sync.
  @type("number") elapsedMs: number = 0;
  @type("string") gameStatus: string = "playing"; // playing | won | lost | traitor_won
  @type("string") loseReason: string = ""; // "" | guards | fake | tracker
  @type("string") mode: string = "assalto"; // assalto | traidor
  @type("number") vaultCol: number = 0;
  @type("number") vaultRow: number = 0;
}
