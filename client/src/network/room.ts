import { Client, Room } from "colyseus.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";
// Same host as the game server, just over plain HTTP — used for one-off
// requests (like the leaderboard) that don't need a persistent connection.
export const SERVER_HTTP_URL = SERVER_URL.replace(/^ws/, "http");

const client = new Client(SERVER_URL);

export interface JoinOptions {
  name: string;
  loadout: string[];
  mode: string;
  fakeCount: number;
  trackerCount: number;
  /** Caps the room at a single player — guards are automated, so no other
   * human players are needed to make a run playable. */
  solo?: boolean;
}

/** Public matchmaking — joins any open room for this mode, or creates one
 * if none exist. Anyone else picking "Sala Aberta" can land in it too. */
export function joinHeistRoom(options: JoinOptions): Promise<Room> {
  return client.joinOrCreate("heist", options);
}

/** Always creates a fresh room and marks it unlisted, so it never shows up
 * for public matchmaking — only reachable via its roomId (the "code"
 * shared with friends through joinPrivateRoomByCode). */
export function createPrivateRoom(options: JoinOptions): Promise<Room> {
  return client.create("heist", { ...options, private: true });
}

export function joinPrivateRoomByCode(code: string, options: JoinOptions): Promise<Room> {
  return client.joinById(code, options);
}
