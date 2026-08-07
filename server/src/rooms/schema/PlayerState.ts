import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") name: string = "Jogador";
  @type("string") role: string = "";
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("boolean") invisible: boolean = false;
  @type("number") abilityCooldownUntil: number = 0;

  // Loadout purchased in the shop, applied for this match only.
  @type("boolean") hasSapato: boolean = false;
  @type("boolean") hasFolego: boolean = false;
  @type("boolean") hasKitHacker: boolean = false;
}
