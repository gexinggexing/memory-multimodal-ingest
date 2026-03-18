import type * as LanceDB from "@lancedb/lancedb";
import { randomUUID } from "node:crypto";
import { modalityFromMimeType, type MediaModality } from "./mime.js";

export interface MediaMemoryEntry {
  id: string;
  modality: MediaModality;
  mimeType: string;
  sourceUri: string;
  blobPath: string;
  previewText: string;
  scope: string;
  timestamp: number;
  metadata: string;
  contentHash: string;
  vector: number[];
}

export interface MediaSearchResult {
  entry: MediaMemoryEntry;
  score: number;
}

export interface MediaStoreConfig {
  dbPath: string;
  vectorDim: number;
}

const TABLE_NAME = "media_memories";
let lancedbImportPromise: Promise<typeof import("@lancedb/lancedb")> | null = null;

async function loadLanceDB(): Promise<typeof import("@lancedb/lancedb")> {
  if (!lancedbImportPromise) {
    lancedbImportPromise = import("@lancedb/lancedb");
  }
  return lancedbImportPromise;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export class MediaStore {
  private readonly config: MediaStoreConfig;
  private db: LanceDB.Connection | null = null;
  private table: LanceDB.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: MediaStoreConfig) {
    this.config = config;
  }

  async ensureInitialized(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const lancedb = await loadLanceDB();
    const db = await lancedb.connect(this.config.dbPath);
    let table: LanceDB.Table;
    try {
      table = await db.openTable(TABLE_NAME);
    } catch {
      const schemaRow: MediaMemoryEntry = {
        id: "__schema__",
        modality: "image",
        mimeType: "image/png",
        sourceUri: "",
        blobPath: "",
        previewText: "",
        scope: "global",
        timestamp: 0,
        metadata: "{}",
        contentHash: "",
        vector: Array.from({ length: this.config.vectorDim }).fill(0)
      };
      table = await db.createTable(TABLE_NAME, [schemaRow]);
      await table.delete('id = "__schema__"');
    }

    const sample = await table.query().limit(1).toArray();
    if (sample.length > 0 && sample[0]?.vector?.length && sample[0].vector.length !== this.config.vectorDim) {
      throw new Error(`Vector dimension mismatch: table=${sample[0].vector.length}, config=${this.config.vectorDim}`);
    }

    this.db = db;
    this.table = table;
  }

  async store(entry: Omit<MediaMemoryEntry, "id" | "timestamp">): Promise<MediaMemoryEntry> {
    await this.ensureInitialized();
    const full: MediaMemoryEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now()
    };
    await this.table!.add([full]);
    return full;
  }

  async list(limit = 20, modality?: MediaModality, scope?: string): Promise<MediaMemoryEntry[]> {
    await this.ensureInitialized();
    let query = this.table!.query().limit(Math.max(1, Math.min(limit, 100)));
    const conditions: string[] = [];
    if (modality) conditions.push(`modality = '${escapeSqlLiteral(modality)}'`);
    if (scope) conditions.push(`scope = '${escapeSqlLiteral(scope)}'`);
    if (conditions.length > 0) {
      query = query.where(conditions.join(" AND "));
    }
    const rows = await query.toArray();
    return rows.filter((row) => row.id !== "__schema__").map(this.rowToEntry);
  }

  async getById(id: string): Promise<MediaMemoryEntry | null> {
    await this.ensureInitialized();
    const rows = await this.table!.query().where(`id = '${escapeSqlLiteral(id)}'`).limit(1).toArray();
    if (rows.length === 0) return null;
    return this.rowToEntry(rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.table!.delete(`id = '${escapeSqlLiteral(id)}'`);
    return true;
  }

  async search(queryVector: number[], limit = 10, modality?: MediaModality, scope?: string, queryText?: string): Promise<MediaSearchResult[]> {
    await this.ensureInitialized();
    let query = this.table!.vectorSearch(queryVector).distanceType("cosine").limit(Math.max(1, Math.min(limit * 10, 100)));
    const conditions: string[] = [];
    if (modality) conditions.push(`modality = '${escapeSqlLiteral(modality)}'`);
    if (scope) conditions.push(`scope = '${escapeSqlLiteral(scope)}'`);
    if (conditions.length > 0) {
      query = query.where(conditions.join(" AND "));
    }
    const rows = await query.toArray();
    const tokens = (queryText || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    return rows
      .filter((row) => row.id !== "__schema__")
      .map((row) => {
        const entry = this.rowToEntry(row);
        let score = 1 / (1 + Number(row._distance ?? 0));
        if (tokens.length > 0) {
          const haystack = `${entry.previewText} ${entry.sourceUri}`.toLowerCase();
          let hits = 0;
          for (const token of tokens) {
            if (haystack.includes(token)) hits++;
          }
          if (hits > 0) {
            score += 0.35 * (hits / tokens.length);
          }
        }
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async stats(): Promise<{ totalCount: number; modalityCounts: Record<string, number>; scopeCounts: Record<string, number> }> {
    await this.ensureInitialized();
    const rows = await this.table!.query().select(["id", "modality", "scope"]).limit(10000).toArray();
    const modalityCounts: Record<string, number> = {};
    const scopeCounts: Record<string, number> = {};
    let totalCount = 0;
    for (const row of rows) {
      if (row.id === "__schema__") continue;
      totalCount++;
      const modality = String(row.modality || modalityFromMimeType(String(row.mimeType || "")) || "unknown");
      const scope = String(row.scope || "global");
      modalityCounts[modality] = (modalityCounts[modality] || 0) + 1;
      scopeCounts[scope] = (scopeCounts[scope] || 0) + 1;
    }
    return { totalCount, modalityCounts, scopeCounts };
  }

  private rowToEntry(row: any): MediaMemoryEntry {
    return {
      id: String(row.id),
      modality: String(row.modality) as MediaModality,
      mimeType: String(row.mimeType),
      sourceUri: String(row.sourceUri),
      blobPath: String(row.blobPath),
      previewText: String(row.previewText || ""),
      scope: String(row.scope || "global"),
      timestamp: Number(row.timestamp || 0),
      metadata: String(row.metadata || "{}"),
      contentHash: String(row.contentHash || ""),
      vector: Array.from(row.vector as Iterable<number>)
    };
  }
}
