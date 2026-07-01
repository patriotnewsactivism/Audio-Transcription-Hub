/**
 * Deepgram Bulk Transcription + Analysis Script
 *
 * Reads all audio/video files from ./input, transcribes them concurrently
 * via the Deepgram nova-2 model, and optionally analyzes transcripts for
 * hidden gems (action items, insights, sentiment, quotes, decisions).
 *
 * Writes per-file .txt and .json results plus a summary.csv to ./output.
 * Optionally persists results to the database.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run transcribe [options]
 *
 * Options:
 *   --concurrency <n>   Max simultaneous API calls (default: 3)
 *   --force             Re-transcribe files that already have output
 *   --input <dir>       Override the input directory (default: ./input)
 *   --output <dir>      Override the output directory (default: ./output)
 *   --analyze           Run gem analysis after transcription (requires OPENAI_API_KEY)
 *   --save-db           Save results to the database
 *
 * Required env vars:
 *   DEEPGRAM_API_KEY — Deepgram API key
 *   OPENAI_API_KEY — (only if using --analyze) OpenAI API key
 */

import "dotenv/config";
import { TranscriptionService, GemAnalysisService } from "@workspace/services";
import { db, setupDatabase, recordingsTable, transcriptsTable, gemsTable, eq } from "@workspace/db";
import pLimit from "p-limit";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): {
  concurrency: number;
  force: boolean;
  inputDir: string;
  outputDir: string;
  analyze: boolean;
  saveDb: boolean;
} {
  const args = process.argv.slice(2);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(__dirname, "../..");

  let concurrency = 3;
  let force = false;
  let inputDir = path.join(ROOT, "input");
  let outputDir = path.join(ROOT, "output");
  let analyze = false;
  let saveDb = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (isNaN(n) || n < 1) {
        console.error("--concurrency must be a positive integer");
        process.exit(1);
      }
      concurrency = n;
    } else if (args[i] === "--force") {
      force = true;
    } else if (args[i] === "--input" && args[i + 1]) {
      inputDir = path.resolve(args[++i]);
    } else if (args[i] === "--output" && args[i + 1]) {
      outputDir = path.resolve(args[++i]);
    } else if (args[i] === "--analyze") {
      analyze = true;
    } else if (args[i] === "--save-db") {
      saveDb = true;
    }
  }

  return { concurrency, force, inputDir, outputDir, analyze, saveDb };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultStatus = "success" | "skipped" | "error";

interface FileResult {
  file: string;
  relativePath: string;
  status: ResultStatus;
  error?: string;
  durationSec?: number | null;
  wordCount?: number | null;
  speakerCount?: number | null;
  confidence?: number | null;
  gemsCount?: number;
}

// ---------------------------------------------------------------------------
// Progress tracker
// ---------------------------------------------------------------------------

class Progress {
  private total: number;
  private done = 0;
  private succeeded = 0;
  private skipped = 0;
  private failed = 0;
  private startTime = Date.now();

  constructor(total: number) {
    this.total = total;
  }

  log(result: FileResult): void {
    this.done++;
    if (result.status === "success") this.succeeded++;
    else if (result.status === "skipped") this.skipped++;
    else this.failed++;

    const pct = Math.round((this.done / this.total) * 100);
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const rate = this.done / elapsedSec;
    const remaining = this.total - this.done;
    const etaSec = rate > 0 && remaining > 0 ? remaining / rate : 0;
    const eta = etaSec > 0 ? ` · ETA ${formatDuration(etaSec)}` : "";

    const icon =
      result.status === "success" ? "✓" : result.status === "skipped" ? "–" : "✗";
    const label = `[${this.done}/${this.total}] ${pct}%${eta}`;
    const gemsInfo = result.gemsCount !== undefined ? ` · ${result.gemsCount} gems` : "";
    console.log(`${icon} ${label}${gemsInfo}  ${result.file}`);
    if (result.status === "error") {
      console.error(`  └─ ${result.error}`);
    }
  }

  summary(): { succeeded: number; skipped: number; failed: number; elapsed: string } {
    return {
      succeeded: this.succeeded,
      skipped: this.skipped,
      failed: this.failed,
      elapsed: formatDuration((Date.now() - this.startTime) / 1000),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatHms(seconds: number | null): string {
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function outputBasePath(filePath: string, inputDir: string, outputDir: string): string {
  const rel = path.relative(inputDir, filePath);
  const withoutExt = rel.slice(0, rel.length - path.extname(rel).length);
  return path.join(outputDir, withoutExt);
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

async function writeSummaryCsv(
  results: FileResult[],
  outputDir: string
): Promise<void> {
  const headers = [
    "file", "status", "duration", "duration_sec", "word_count",
    "speaker_count", "confidence_pct", "gems_count", "error",
  ];

  const rows = [
    headers.join(","),
    ...results.map((r) =>
      csvRow([
        r.relativePath,
        r.status,
        formatHms(r.durationSec ?? null),
        r.durationSec?.toFixed(2) ?? null,
        r.wordCount ?? null,
        r.speakerCount ?? null,
        r.confidence !== null && r.confidence !== undefined
          ? (r.confidence * 100).toFixed(1)
          : null,
        r.gemsCount ?? null,
        r.error ?? null,
      ])
    ),
  ];

  const csvPath = path.join(outputDir, "summary.csv");
  await fsp.writeFile(csvPath, rows.join("\n") + "\n", "utf-8");
  console.log(`\nSummary written → ${csvPath}`);
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  transcriptionSvc: TranscriptionService,
  gemSvc: GemAnalysisService | null,
  inputDir: string,
  outputDir: string,
  force: boolean,
  saveDb: boolean
): Promise<FileResult> {
  const filename = path.basename(filePath);
  const relativePath = path.relative(inputDir, filePath);
  const basePath = outputBasePath(filePath, inputDir, outputDir);
  const txtPath = `${basePath}.txt`;
  const jsonPath = `${basePath}.json`;

  if (!force) {
    const [txtExists, jsonExists] = await Promise.all([
      fsp.access(txtPath).then(() => true).catch(() => false),
      fsp.access(jsonPath).then(() => true).catch(() => false),
    ]);

    if (txtExists && jsonExists) {
      try {
        const raw = await fsp.readFile(jsonPath, "utf-8");
        const response = JSON.parse(raw);
        const stats = transcriptionSvc.extractStats(response);
        return {
          file: filename,
          relativePath,
          status: "skipped",
          durationSec: stats.durationSec,
          wordCount: stats.wordCount,
          speakerCount: stats.speakerCount,
          confidence: stats.confidence,
        };
      } catch {
        return { file: filename, relativePath, status: "skipped" };
      }
    }
  }

  try {
    await fsp.mkdir(path.dirname(basePath), { recursive: true });

    const result = await transcriptionSvc.transcribeFile(filePath);
    const { stats } = result;

    await Promise.all([
      fsp.writeFile(jsonPath, JSON.stringify(result.response, null, 2), "utf-8"),
      fsp.writeFile(txtPath, result.fullText, "utf-8"),
    ]);

    let gemsCount: number | undefined;

    // Save to database
    if (saveDb) {
      await setupDatabase();
      const [recording] = await db
        .insert(recordingsTable)
        .values({
          filename,
          filePath,
          fileSize: (await fsp.stat(filePath)).size,
          duration: stats.durationSec,
          status: "transcribed",
        })
        .returning();

      const [transcript] = await db
        .insert(transcriptsTable)
        .values({
          recordingId: recording.id,
          fullText: result.fullText,
          utterances: result.response?.results?.utterances as any,
          confidence: stats.confidence,
          wordCount: stats.wordCount,
          speakerCount: stats.speakerCount,
          rawResponse: result.response as any,
        })
        .returning();

      if (gemSvc && transcript) {
        const utterances = result.response?.results?.utterances ?? [];
        const analysis = await gemSvc.analyzeTranscriptChunked(utterances, filename);

        for (const gem of analysis.gems) {
          await db.insert(gemsTable).values({
            transcriptId: transcript.id,
            type: gem.type,
            title: gem.title,
            content: gem.content,
            metadata: gem.metadata as any,
            startTime: gem.startTime,
            endTime: gem.endTime,
            speaker: gem.speaker,
          });
        }

        gemsCount = analysis.gems.length;

        await db
          .update(recordingsTable)
          .set({ status: "analyzed", updatedAt: new Date() })
          .where(eq(recordingsTable.id, recording.id));
      }
    }

    // Run analysis without DB
    if (gemSvc && !saveDb) {
      const utterances = result.response?.results?.utterances ?? [];
      const analysis = await gemSvc.analyzeTranscriptChunked(utterances, filename);
      gemsCount = analysis.gems.length;

      await fsp.writeFile(
        `${basePath}.gems.json`,
        JSON.stringify(analysis, null, 2),
        "utf-8"
      );
    }

    return {
      file: filename,
      relativePath,
      status: "success",
      durationSec: stats.durationSec,
      wordCount: stats.wordCount,
      speakerCount: stats.speakerCount,
      confidence: stats.confidence,
      gemsCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { file: filename, relativePath, status: "error", error: message };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { concurrency, force, inputDir, outputDir, analyze, saveDb } = parseArgs();

  const transcriptionSvc = new TranscriptionService();
  const gemSvc = analyze ? new GemAnalysisService() : null;

  await fsp.mkdir(outputDir, { recursive: true });

  const files = await transcriptionSvc.collectFiles(inputDir);

  if (files.length === 0) {
    const supported = [...TranscriptionService.supportedExtensions()];
    console.log(
      `No supported files found in "${inputDir}".\n` +
        `Supported: ${supported.join(", ")}`
    );
    return;
  }

  console.log(
    `\nDeepgram Bulk Transcription` +
      (analyze ? " + Gem Analysis" : "") + `\n` +
      `${"─".repeat(44)}\n` +
      `Files found : ${files.length}\n` +
      `Concurrency : ${concurrency}\n` +
      `Model       : nova-2  (smart_format · diarize · punctuate)\n` +
      (analyze ? `Analysis    : GPT-4o-mini  (action items, insights, sentiment, quotes, decisions)\n` : "") +
      `Resume mode : ${force ? "off (--force re-transcribes all)" : "on (skips existing outputs)"}\n` +
      `Save to DB  : ${saveDb ? "yes" : "no"}\n` +
      `Input       : ${inputDir}\n` +
      `Output      : ${outputDir}\n` +
      `${"─".repeat(44)}\n`
  );

  const progress = new Progress(files.length);
  const allResults: FileResult[] = [];
  const limit = pLimit(concurrency);

  await Promise.allSettled(
    files.map((fp) =>
      limit(async () => {
        const result = await processFile(
          fp, transcriptionSvc, gemSvc, inputDir, outputDir, force, saveDb
        );
        progress.log(result);
        allResults.push(result);
        return result;
      })
    )
  );

  allResults.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  await writeSummaryCsv(allResults, outputDir);

  const { succeeded, skipped, failed, elapsed } = progress.summary();

  console.log(
    `${"─".repeat(44)}\n` +
      `Done in ${elapsed}\n` +
      `  ✓ ${succeeded} transcribed\n` +
      `  – ${skipped} skipped (already done)\n` +
      (failed > 0 ? `  ✗ ${failed} failed\n` : "") +
      `Output: ${outputDir}\n`
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected fatal error:", err);
  process.exit(1);
});
