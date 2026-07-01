import { Router, type IRouter } from "express";
import { db, setupDatabase, gemsTable, transcriptsTable, recordingsTable, eq, like, and, desc } from "@workspace/db";

const router: IRouter = Router();

// GET /gems — cross-recording gem search
router.get("/", async (req, res, next) => {
  try {
    await setupDatabase();
    const typeFilter = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const limitNum = parseInt(req.query.limit as string, 10) || 50;
    const offsetNum = parseInt(req.query.offset as string, 10) || 0;

    const conditions = [];
    if (typeFilter) {
      conditions.push(eq(gemsTable.type, typeFilter));
    }
    if (search) {
      conditions.push(like(gemsTable.content, `%${search}%`));
    }

    const base = db
      .select({
        gem: gemsTable,
        transcript: transcriptsTable,
        recording: recordingsTable,
      })
      .from(gemsTable)
      .innerJoin(transcriptsTable, eq(gemsTable.transcriptId, transcriptsTable.id))
      .innerJoin(recordingsTable, eq(transcriptsTable.recordingId, recordingsTable.id));

    const query = conditions.length > 0
      ? base.where(and(...conditions))
      : base;

    const results = await (query as typeof base)
      .orderBy(desc(gemsTable.createdAt))
      .limit(limitNum)
      .offset(offsetNum);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

export default router;
