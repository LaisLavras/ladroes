import { Schema, type } from "@colyseus/schema";

export class ObraState extends Schema {
  @type("string") id: string = "";
  @type("string") itemType: string = "dinheiro"; // dinheiro | quadro | vaso | caneta | relogio | colar | moeda | escultura | coroa
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") value: number = 0;
  @type("number") weight: number = 1;
  @type("string") carriedBy: string = "";
}
