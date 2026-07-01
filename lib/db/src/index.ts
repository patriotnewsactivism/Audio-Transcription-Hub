import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pglite: PGlite | undefined;

function createDb(): PgliteDatabase<typeof schema> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const pgDb = drizzle(pool, { schema });
    return pgDb as unknown as PgliteDatabase<typeof schema>;
  }

  const dataDir = process.env.PGLITE_DATA_DIR || "./.local/pglite";
  _pglite = new PGlite(dataDir);
  return drizzlePglite(_pglite, { schema });
}

const _db = createDb();

export const db = _db;
export const pglite = _pglite;
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : undefined;

let _schemaSetup = false;

export async function setupDatabase(): Promise<void> {
  if (_schemaSetup) return;
  if (!_pglite) return;

  const sql = `
    CREATE TABLE IF NOT EXISTS recordings (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      duration REAL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id SERIAL PRIMARY KEY,
      recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      full_text TEXT,
      utterances JSONB,
      confidence REAL,
      word_count INTEGER,
      speaker_count INTEGER,
      raw_response JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS gems (
      id SERIAL PRIMARY KEY,
      transcript_id INTEGER NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB,
      start_time REAL,
      end_time REAL,
      speaker TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  await _pglite.exec(sql);
  _schemaSetup = true;
}

export * from "./schema";
export { eq, ne, gt, gte, lt, lte, like, ilike, and, or, not, isNull, isNotNull, inArray, notInArray, between, asc, desc, sql } from "drizzle-orm";
