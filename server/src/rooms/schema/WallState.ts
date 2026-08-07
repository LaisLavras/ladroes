import { Schema, type } from "@colyseus/schema";

export class WallState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") w: number = 0;
  @type("number") h: number = 0;
}
