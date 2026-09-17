import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
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

app.use("/api", router);
app.use("/", router);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  const message = err.message || "Internal Server Error";
  res.status(status).json({ error: message });
});

const clientDistPath = path.resolve(process.cwd(), "../civicfix/dist/public");
app.use(express.static(clientDistPath));

app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

export default app;
