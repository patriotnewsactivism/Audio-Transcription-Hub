import "dotenv/config";
import OpenAI from "openai";
import type { Utterance } from "./transcription";

export type GemType = "action_item" | "customer_insight" | "sentiment_peak" | "key_quote" | "decision";

export interface ExtractedGem {
  type: GemType;
  title: string;
  content: string;
  startTime: number | null;
  endTime: number | null;
  speaker: string | null;
  metadata: {
    confidence: number;
    topics: string[];
  };
}

export interface AnalysisResult {
  gems: ExtractedGem[];
  summary: string;
  overallSentiment: "positive" | "neutral" | "negative";
}

const SYSTEM_PROMPT = `You are an expert call analyst. Your task is to analyze a conversation transcript and extract "hidden gems" — valuable insights that would be useful for business intelligence, coaching, and follow-up.

For each transcript, identify:

1. **Action Items** — Tasks, commitments, or follow-ups that someone agreed to do. Include who is responsible and by when.
2. **Customer Insights** — Pain points, feature requests, competitor mentions, budget discussions, or buying signals.
3. **Sentiment Peaks** — Moments where the emotional tone shifted notably (frustration, excitement, confusion, relief).
4. **Key Quotes** — Memorable or important statements that capture the essence of the conversation.
5. **Decisions** — Conclusions, agreements, or choices made during the call.

Output a JSON object with this exact structure:
{
  "gems": [
    {
      "type": "action_item" | "customer_insight" | "sentiment_peak" | "key_quote" | "decision",
      "title": "Short label (max 10 words)",
      "content": "The full gem text — what was said, agreed, or observed",
      "startTime": <timestamp in seconds from the transcript, or null>,
      "endTime": <timestamp in seconds from the transcript, or null>,
      "speaker": "Speaker X or null",
      "metadata": {
        "confidence": <0.0 to 1.0>,
        "topics": ["topic1", "topic2"]
      }
    }
  ],
  "summary": "A 2-3 sentence summary of the overall conversation",
  "overallSentiment": "positive" | "neutral" | "negative"
}

Be thorough but accurate. Only include gems you are confident about. Each gem's content should be a direct quote or a faithful paraphrase.`;

export class GemAnalysisService {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not set.\n" +
          "Add it to your environment or create a local .env file:\n" +
          "  OPENAI_API_KEY=your_key_here"
      );
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async analyzeTranscript(
    utterances: Utterance[],
    filename: string
  ): Promise<AnalysisResult> {
    const transcriptText = this.formatUtterancesForLLM(utterances, filename);

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcriptText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(raw) as AnalysisResult;

    if (!parsed.gems || !Array.isArray(parsed.gems)) {
      throw new Error("Invalid analysis response: missing gems array");
    }

    return parsed;
  }

  async analyzeTranscriptChunked(
    utterances: Utterance[],
    filename: string,
    chunkSize = 80
  ): Promise<AnalysisResult> {
    if (utterances.length <= chunkSize) {
      return this.analyzeTranscript(utterances, filename);
    }

    const chunks: Utterance[][] = [];
    for (let i = 0; i < utterances.length; i += chunkSize) {
      chunks.push(utterances.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
      chunks.map((chunk, i) =>
        this.analyzeTranscript(chunk, `${filename} (part ${i + 1}/${chunks.length})`)
      )
    );

    const allGems = results.flatMap((r) => r.gems);
    const summary = results.map((r) => r.summary).join(" ");
    const sentiments = results.map((r) => r.overallSentiment);
    const negativeCount = sentiments.filter((s) => s === "negative").length;
    const positiveCount = sentiments.filter((s) => s === "positive").length;
    const overallSentiment =
      negativeCount > positiveCount ? "negative" : positiveCount > 0 ? "positive" : "neutral";

    return { gems: allGems, summary, overallSentiment };
  }

  private formatUtterancesForLLM(utterances: Utterance[], filename: string): string {
    const lines = [`Transcript: ${filename}`, ""];
    for (const u of utterances) {
      const speaker = `Speaker ${u.speaker ?? "?"}`;
      const ts = this.formatTs(u.start ?? 0);
      lines.push(`[${ts}] ${speaker}: ${u.transcript ?? ""}`);
    }
    return lines.join("\n");
  }

  private formatTs(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
}
