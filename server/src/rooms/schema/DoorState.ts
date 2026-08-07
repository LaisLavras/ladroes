import { Schema, type } from "@colyseus/schema";

export class DoorState extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") w: number = 0;
  @type("number") h: number = 0;
  @type("boolean") open: boolean = false;
  @type("number") progress: number = 0;
}
