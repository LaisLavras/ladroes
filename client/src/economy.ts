export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
}

export const ITEMS: ShopItem[] = [
  { id: "sapato", name: "Sapato Silencioso", desc: "Guardas te detectam 30% mais de perto", cost: 300 },
  { id: "folego", name: "Fôlego Extra", desc: "+10% de velocidade de movimento", cost: 300 },
  { id: "kit_hacker", name: "Kit do Hacker", desc: "Portas abrem 40% mais rápido quando você é o Hacker", cost: 400 },
];

export interface Profile {
  name: string;
  coins: number;
  /** Consumable equipment: item id -> charges left. Each charge is spent the
   * moment a heist starts, whether or not it ends up mattering that run. */
  inventory: Record<string, number>;
  lastMode: string;
  fakeCount: number;
  trackerCount: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  /** 0-100, shown as a percent in the menu's volume stepper. */
  musicVolume: number;
}

const STORAGE_KEY = "museu_profile";

function randomGuestName() {
  return `Convidado${Math.floor(1000 + Math.random() * 9000)}`;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 20) : randomGuestName(),
      coins: Number(parsed.coins) || 0,
      inventory: typeof parsed.inventory === "object" && parsed.inventory !== null ? parsed.inventory : {},
      lastMode: typeof parsed.lastMode === "string" ? parsed.lastMode : "assalto",
      fakeCount: Number(parsed.fakeCount) || 1,
      trackerCount: Number.isFinite(Number(parsed.trackerCount)) ? Number(parsed.trackerCount) : 1,
      musicEnabled: typeof parsed.musicEnabled === "boolean" ? parsed.musicEnabled : true,
      sfxEnabled: typeof parsed.sfxEnabled === "boolean" ? parsed.sfxEnabled : true,
      musicVolume: Number.isFinite(Number(parsed.musicVolume)) ? clamp(Number(parsed.musicVolume), 0, 100) : 70,
    };
  } catch {
    return {
      name: randomGuestName(),
      coins: 0,
      inventory: {},
      lastMode: "assalto",
      fakeCount: 1,
      trackerCount: 1,
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 70,
    };
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
