import { listen } from "@colyseus/tools";
import app from "./app.config";

const port = Number(process.env.PORT) || 2567;

listen(app, port).then(() => {
  console.log(`Servidor Colyseus rodando em ws://localhost:${port}`);
});
