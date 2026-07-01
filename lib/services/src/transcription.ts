import "dotenv/config";
import { DeepgramClient } from "@deepgram/sdk";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const TRANSCRIPTION_OPTIONS = {
  model: "nova-2",
  smart_format: true,
  diarize: true,
  punctuate: true,
  utterances: true,
} as const;

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".mp4"]);

export interface Utterance {
  speaker?: number;
  start?: number;
  end?: number;
  transcript?: string;
  words?: Array<{ word?: string; start?: number; end?: number; confidence?: number }>;
}

export interface DeepgramResponse {
  metadata?: {
    duration?: number;
  };
  results?: {
    utterances?: Utterance[];
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: Array<{ word?: string; start?: number; end?: number; confidence?: number }>;
      }>;
    }>;
  };
}

export interface TranscriptStats {
  durationSec: number | null;
  wordCount: number | null;
  speakerCount: number | null;
  confidence: number | null;
}

export interface TranscriptResult {
  filePath: string;
  filename: string;
  response: DeepgramResponse;
  stats: TranscriptStats;
  fullText: string;
  utterances: Utterance[];
}

export class TranscriptionService {
  private client: DeepgramClient;

  constructor() {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error(
        "DEEPGRAM_API_KEY is not set.\n" +
          "Add it to your environment or create a local .env file:\n" +
          "  DEEPGRAM_API_KEY=your_key_here"
      );
    }
    this.client = new DeepgramClient();
  }

  static supportedExtensions(): ReadonlySet<string> {
    return SUPPORTED_EXTENSIONS;
  }

  async transcribeFile(filePath: string): Promise<TranscriptResult> {
    const filename = path.basename(filePath);
    const audioStream = fs.createReadStream(filePath);

    const response = (await this.client.listen.v1.media.transcribeFile(
      audioStream,
      TRANSCRIPTION_OPTIONS
    )) as DeepgramResponse;

    const stats = this.extractStats(response);
    const utterances = response?.results?.utterances ?? [];
    const fullText = this.buildFullText(response, filename);

    return { filePath, filename, response, stats, fullText, utterances };
  }

  async collectFiles(dir: string): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      throw new Error(
        `Cannot read directory "${dir}". Make sure it exists and is readable.`
      );
    }

    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.collectFiles(fullPath)));
      } else if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        results.push(fullPath);
      }
    }
    return results.sort();
  }

  extractStats(response: DeepgramResponse): TranscriptStats {
    const durationSec = response?.metadata?.duration ?? null;
    const confidence =
      response?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? null;

    const words = response?.results?.channels?.[0]?.alternatives?.[0]?.words;
    const wordCount = words ? words.length : null;

    const utterances = response?.results?.utterances ?? [];
    const speakerIds = new Set(
      utterances.map((u) => u.speaker).filter((s): s is number => s !== undefined)
    );
    const speakerCount = utterances.length > 0 ? speakerIds.size : null;

    return { durationSec, wordCount, speakerCount, confidence };
  }

  buildFullText(response: DeepgramResponse, filename: string): string {
    const lines: string[] = [
      `TRANSCRIPT: ${filename}`,
      `Generated : ${new Date().toISOString()}`,
      "=".repeat(60),
      "",
    ];

    const utterances = response?.results?.utterances;

    if (utterances && utterances.length > 0) {
      lines.push("--- Speaker Diarization ---", "");
      for (const utt of utterances) {
        const speaker = `Speaker ${utt.speaker ?? "?"}`;
        const start = this.formatTimestamp(utt.start ?? 0);
        const end = this.formatTimestamp(utt.end ?? 0);
        lines.push(`[${start} → ${end}] ${speaker}:`);
        lines.push(`  ${utt.transcript ?? ""}`, "");
      }
    } else {
      lines.push("--- Transcript ---", "");
      const transcript =
        response?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        "(no transcript)";
      lines.push(transcript, "");
    }

    const confidence =
      response?.results?.channels?.[0]?.alternatives?.[0]?.confidence;
    if (confidence !== undefined) {
      lines.push(`Confidence: ${(confidence * 100).toFixed(1)}%`);
    }

    return lines.join("\n");
  }

  buildUtteranceText(response: DeepgramResponse): string {
    const utterances = response?.results?.utterances ?? [];
    return utterances
      .map((u) => {
        const speaker = `Speaker ${u.speaker ?? "?"}`;
        const start = this.formatTimestamp(u.start ?? 0);
        return `[${start}] ${speaker}: ${u.transcript ?? ""}`;
      })
      .join("\n");
  }

  private formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3).padStart(6, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }
}
