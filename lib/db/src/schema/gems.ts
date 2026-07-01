import { pgTable, serial, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transcriptsTable } from "./transcripts";

export const gemsTable = pgTable("gems", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcript_id")
    .notNull()
    .references(() => transcriptsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  startTime: real("start_time"),
  endTime: real("end_time"),
  speaker: text("speaker"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGemSchema = createInsertSchema(gemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertGem = z.infer<typeof insertGemSchema>;
export type Gem = typeof gemsTable.$inferSelect;
