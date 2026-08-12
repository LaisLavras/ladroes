import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Stamped into the built bundle so the running app can show exactly which
// commit it was built from — the simplest way to tell, just by looking at
// the live site, whether the latest push has actually made it into the
// deploy (vs. still sitting local or mid-deploy).
function commitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(commitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
