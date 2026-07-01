import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recordingsRouter from "./recordings";
import gemsRouter from "./gems";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/recordings", recordingsRouter);
router.use("/gems", gemsRouter);

export default router;
