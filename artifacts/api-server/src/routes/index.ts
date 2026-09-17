import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeProblemRouter from "./analyze-problem";
import findAuthorityRouter from "./find-authority";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeProblemRouter);
router.use(findAuthorityRouter);

export default router;
