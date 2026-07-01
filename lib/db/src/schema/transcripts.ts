import { pgTable, serial, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recordingsTable } from "./recordings";

export const transcriptsTable = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  recordingId: integer("recording_id")
    .notNull()
    .references(() => recordingsTable.id, { onDelete: "cascade" }),
  fullText: text("full_text"),
  utterances: jsonb("utterances"),
  confidence: real("confidence"),
  wordCount: integer("word_count"),
  speakerCount: integer("speaker_count"),
  rawResponse: jsonb("raw_response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTranscriptSchema = createInsertSchema(transcriptsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Transcript = typeof transcriptsTable.$inferSelect;
