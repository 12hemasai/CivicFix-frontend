import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`[API REQUEST] ${req.method} ${req.originalUrl} - STATUS: ${res.statusCode} - CONTENT-TYPE: ${res.get('Content-Type')}`);
  });
  next();
});

// Set default Content-Type for all /api endpoints
app.use("/api", (req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.use("/api", router);
app.use("/", router);

// Explicit 404 for unhandled /api requests
app.use("/api", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(404).json({ error: "API route not found" });
});

// Resolve client dist path safely
const candidateDistPaths = [
  path.resolve(process.cwd(), "artifacts/civicfix/dist/public"),
  path.resolve(process.cwd(), "../civicfix/dist/public"),
  path.resolve(__dirname, "../../civicfix/dist/public"),
  path.resolve(__dirname, "../../../artifacts/civicfix/dist/public"),
  path.resolve(__dirname, "../artifacts/civicfix/dist/public"),
  path.resolve(__dirname, "../civicfix/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];
const clientDistPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, "index.html"))) || candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0];

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// Fallback: Only serve index.html for non-API GET/HEAD requests
app.use((req, res, next) => {
  const isApi = req.originalUrl.startsWith("/api") || req.path.startsWith("/api") || req.url.startsWith("/api");
  const isJsonExpected = req.headers.accept?.includes("application/json") || req.headers["content-type"]?.includes("application/json");

  if (isApi || isJsonExpected || (req.method !== "GET" && req.method !== "HEAD")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
    return;
  }

  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(404).json({ error: "Frontend application build not found" });
  }
});

// Global error handler - must be last
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  const status = typeof err.status === "number" ? err.status : (err.name === "MulterError" ? 400 : 500);
  const message = err.message || "Internal Server Error";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json({ error: message });
});

export default app;
