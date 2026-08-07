import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface LeaderboardEntry {
  name: string;
  timeMs: number;
  mode: string;
  date: string;
}

const MAX_ENTRIES_PER_MODE = 50;

// Render's disk gets wiped on every deploy/restart, so the local JSON file
// only survives as a fallback for local dev — in production the scores live
// in Firestore instead, set up via FIREBASE_SERVICE_ACCOUNT (the JSON key
// downloaded from Firebase Console > Project Settings > Service Accounts).
const FILE_PATH = path.join(__dirname, "..", "leaderboard.json");
const FIRESTORE_DOC = "leaderboard/entries";

let db: Firestore | null = null;
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (serviceAccountRaw) {
  try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    db = getFirestore();
    console.log("[leaderboard] using Firestore for persistence");
  } catch (err) {
    console.error("[leaderboard] failed to init Firebase, falling back to local file:", err);
  }
} else {
  console.log("[leaderboard] FIREBASE_SERVICE_ACCOUNT not set, using local file (won't survive a redeploy)");
}

function readAllLocal(): LeaderboardEntry[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllLocal(entries: LeaderboardEntry[]) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.error("[leaderboard] failed to persist locally:", err);
  }
}

async function readAll(): Promise<LeaderboardEntry[]> {
  if (!db) return readAllLocal();
  try {
    const snap = await db.doc(FIRESTORE_DOC).get();
    const data = snap.data();
    return Array.isArray(data?.all) ? data.all : [];
  } catch (err) {
    console.error("[leaderboard] failed to read from Firestore:", err);
    return [];
  }
}

async function writeAll(entries: LeaderboardEntry[]) {
  if (!db) {
    writeAllLocal(entries);
    return;
  }
  try {
    await db.doc(FIRESTORE_DOC).set({ all: entries });
  } catch (err) {
    console.error("[leaderboard] failed to write to Firestore:", err);
  }
}

/** Records a finished run and trims each mode's list down to the best times. */
export async function addScore(entry: LeaderboardEntry) {
  const entries = await readAll();
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

  await writeAll(trimmed);
}

export async function getTopScores(mode?: string, limit = 10): Promise<LeaderboardEntry[]> {
  const entries = await readAll();
  const filtered = entries.filter((e) => !mode || e.mode === mode);
  filtered.sort((a, b) => a.timeMs - b.timeMs);
  return filtered.slice(0, limit);
}
