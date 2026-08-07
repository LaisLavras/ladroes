import config from "@colyseus/tools";
import cors from "cors";
import { HeistRoom } from "./rooms/HeistRoom";
import { getTopScores } from "./leaderboard";

export default config({
  initializeGameServer: (gameServer) => {
    // filterBy ensures joinOrCreate only reuses an existing room when its
    // game mode matches — otherwise a player picking "Traidor" could land in
    // someone else's "Assalto" match.
    gameServer.define("heist", HeistRoom).filterBy(["mode"]);
  },

  initializeExpress: (app) => {
    app.use(cors());

    app.get("/", (_req, res) => {
      res.send("Servidor de Ladroes de Museu no ar.");
    });

    app.get("/leaderboard", (req, res) => {
      const mode = typeof req.query.mode === "string" ? req.query.mode : undefined;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      res.json(getTopScores(mode, limit));
    });
  },
});
