import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
  console.log(`CivicFix production server listening on 0.0.0.0:${port}`);
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  console.error("Error listening on port:", err);
  process.exit(1);
});

