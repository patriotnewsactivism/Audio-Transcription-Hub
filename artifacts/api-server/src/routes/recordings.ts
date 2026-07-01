import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { db, setupDatabase, recordingsTable, transcriptsTable, gemsTable, eq, desc } from "@workspace/db";
import { TranscriptionService, GemAnalysisService } from "@workspace/services";
import fsp from "node:fs/promises";

const router: IRouter = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "input");
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

function getTranscriptionService(): TranscriptionService {
  return new TranscriptionService();
}

function getGemService(): GemAnalysisService {
  return new GemAnalysisService();
}

// POST /recordings/upload — upload an audio file
router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    await setupDatabase();
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    await fsp.mkdir(UPLOAD_DIR, { recursive: true });

    const [recording] = await db
      .insert(recordingsTable)
      .values({
        filename: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        status: "uploaded",
      })
      .returning();

    res.status(201).json(recording);
  } catch (err) {
    next(err);
  }
});

// GET /recordings — list all recordings
router.get("/", async (_req, res, next) => {
  try {
    await setupDatabase();
    const recordings = await db.select().from(recordingsTable).orderBy(
      desc(recordingsTable.createdAt),
    );
    res.json(recordings);
  } catch (err) {
    next(err);
  }
});

// GET /recordings/:id — get recording with transcript and gems
router.get("/:id", async (req, res, next) => {
  try {
    await setupDatabase();
    const id = parseInt(req.params.id, 10);
    const [recording] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!recording) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    const [transcript] = await db
      .select()
      .from(transcriptsTable)
      .where(eq(transcriptsTable.recordingId, id));

    const gems = transcript
      ? await db.select().from(gemsTable).where(eq(gemsTable.transcriptId, transcript.id))
      : [];

    res.json({ recording, transcript: transcript ?? null, gems });
  } catch (err) {
    next(err);
  }
});

// DELETE /recordings/:id — delete recording and related data
router.delete("/:id", async (req, res, next) => {
  try {
    await setupDatabase();
    const id = parseInt(req.params.id, 10);
    const [recording] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!recording) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    await db.delete(recordingsTable).where(eq(recordingsTable.id, id));

    // Clean up file
    try {
      await fsp.unlink(recording.filePath);
    } catch { /* file may already be gone */ }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /recordings/:id/transcribe — transcribe a recording
router.post("/:id/transcribe", async (req, res, next) => {
  try {
    await setupDatabase();
    const id = parseInt(req.params.id, 10);
    const [recording] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!recording) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    // Check if already transcribed
    const [existing] = await db
      .select()
      .from(transcriptsTable)
      .where(eq(transcriptsTable.recordingId, id));

    if (existing) {
      res.json({ transcript: existing, status: "already_transcribed" });
      return;
    }

    // Update status to transcribing
    await db
      .update(recordingsTable)
      .set({ status: "transcribing", updatedAt: new Date() })
      .where(eq(recordingsTable.id, id));

    try {
      const svc = getTranscriptionService();
      const result = await svc.transcribeFile(recording.filePath);

      const utterances = result.response?.results?.utterances ?? [];

      const [transcript] = await db
        .insert(transcriptsTable)
        .values({
          recordingId: id,
          fullText: result.fullText,
          utterances: utterances as any,
          confidence: result.stats.confidence,
          wordCount: result.stats.wordCount,
          speakerCount: result.stats.speakerCount,
          rawResponse: result.response as any,
        })
        .returning();

      await db
        .update(recordingsTable)
        .set({ status: "transcribed", duration: result.stats.durationSec, updatedAt: new Date() })
        .where(eq(recordingsTable.id, id));

      res.json({ transcript, status: "transcribed" });
    } catch (err) {
      await db
        .update(recordingsTable)
        .set({ status: "error", error: String(err), updatedAt: new Date() })
        .where(eq(recordingsTable.id, id));
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /recordings/:id/analyze — analyze a transcript for gems
router.post("/:id/analyze", async (req, res, next) => {
  try {
    await setupDatabase();
    const id = parseInt(req.params.id, 10);
    const [recording] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!recording) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    const [transcript] = await db
      .select()
      .from(transcriptsTable)
      .where(eq(transcriptsTable.recordingId, id));

    if (!transcript) {
      res.status(400).json({ error: "Recording not yet transcribed" });
      return;
    }

    // Check if already analyzed
    const existingGems = await db
      .select()
      .from(gemsTable)
      .where(eq(gemsTable.transcriptId, transcript.id));

    if (existingGems.length > 0) {
      res.json({ gems: existingGems, status: "already_analyzed" });
      return;
    }

    await db
      .update(recordingsTable)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(recordingsTable.id, id));

    try {
      const utterances = (transcript.utterances as any[]) ?? [];
      const svc = getGemService();
      const analysis = await svc.analyzeTranscriptChunked(utterances, recording.filename);

      const insertedGems = [];
      for (const gem of analysis.gems) {
        const [inserted] = await db
          .insert(gemsTable)
          .values({
            transcriptId: transcript.id,
            type: gem.type,
            title: gem.title,
            content: gem.content,
            metadata: gem.metadata as any,
            startTime: gem.startTime,
            endTime: gem.endTime,
            speaker: gem.speaker,
          })
          .returning();
        insertedGems.push(inserted);
      }

      await db
        .update(recordingsTable)
        .set({ status: "analyzed", updatedAt: new Date() })
        .where(eq(recordingsTable.id, id));

      res.json({ gems: insertedGems, status: "analyzed", summary: analysis.summary, overallSentiment: analysis.overallSentiment });
    } catch (err) {
      await db
        .update(recordingsTable)
        .set({ status: "error", error: String(err), updatedAt: new Date() })
        .where(eq(recordingsTable.id, id));
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// GET /recordings/:id/gems — get gems for a recording
router.get("/:id/gems", async (req, res, next) => {
  try {
    await setupDatabase();
    const id = parseInt(req.params.id, 10);
    const typeFilter = req.query.type as string | undefined;

    const [transcript] = await db
      .select()
      .from(transcriptsTable)
      .where(eq(transcriptsTable.recordingId, id));

    if (!transcript) {
      res.status(404).json({ error: "No transcript found for this recording" });
      return;
    }

    let query = db.select().from(gemsTable).where(eq(gemsTable.transcriptId, transcript.id));

    const gems = await query;
    const filtered = typeFilter ? gems.filter((g) => g.type === typeFilter) : gems;

    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

export default router;
