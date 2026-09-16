import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeProblemRouter from "./analyze-problem";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeProblemRouter);

export default router;
