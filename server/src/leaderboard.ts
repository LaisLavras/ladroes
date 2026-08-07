import fs from "fs";
import path from "path";

export interface LeaderboardEntry {
  name: string;
  timeMs: number;
  mode: string;
  date: string;
}

// Lives next to the server package (not inside src/dist), so it survives
// both `tsx watch` (dev) and the compiled `dist` build the same way.
const FILE_PATH = path.join(__dirname, "..", "leaderboard.json");
const MAX_ENTRIES_PER_MODE = 50;

function readAll(): LeaderboardEntry[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: LeaderboardEntry[]) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.error("[leaderboard] failed to persist:", err);
  }
}

/** Records a finished run and trims each mode's list down to the best times. */
export function addScore(entry: LeaderboardEntry) {
  const entries = readAll();
  entries.push(entry);

  const byMode = new Map<string, LeaderboardEntry[]>();
  for (const e of entries) {
    const list = byMode.get(e.mode) ?? [];
    list.push(e);
    byMode.set(e.mode, list);
  }

  const trimmed: LeaderboardEntry[] = [];
  for (const list of byMode.values()) {
    list.sort((a, b) => a.timeMs - b.timeMs);
    trimmed.push(...list.slice(0, MAX_ENTRIES_PER_MODE));
  }

  writeAll(trimmed);
}

export function getTopScores(mode?: string, limit = 10): LeaderboardEntry[] {
  const entries = readAll().filter((e) => !mode || e.mode === mode);
  entries.sort((a, b) => a.timeMs - b.timeMs);
  return entries.slice(0, limit);
}
