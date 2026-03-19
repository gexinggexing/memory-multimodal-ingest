import { createHash } from "node:crypto";
import { basename, extname, join } from "node:path";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createMediaCli } from "./src/cli.js";
import { MultimodalEmbedder } from "./src/embedder.js";
import { extensionFromMimeType, inferMimeType, modalityFromMimeType, type MediaModality } from "./src/mime.js";
import { MediaStore } from "./src/store.js";

interface PluginConfig {
  embedding: {
    apiKey: string;
    model?: string;
    apiBase?: string;
    dimensions?: number;
  };
  dbPath?: string;
  blobPath?: string;
  maxInlineBytes?: number;
  modalities?: Partial<Record<MediaModality, boolean>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const envValue = process.env[key];
    if (!envValue) throw new Error(`Environment variable ${key} is not set`);
    return envValue;
  });
}

function parseString(
  source: Record<string, unknown>,
  key: string,
  fallback?: string,
): string | undefined {
  const value = source[key];
  if (typeof value === "string" && value.trim()) {
    return resolveEnvVars(value.trim());
  }
  return fallback;
}

function parsePositiveInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

function parseMetadata(metadata: string | undefined): string {
  const raw = metadata?.trim() || "{}";
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch (error) {
    throw new Error(`metadata must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function derivePreviewText(source: string): string {
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      const filename = basename(url.pathname, extname(url.pathname));
      return filename || url.hostname;
    } catch {
      return source;
    }
  }
  return basename(source, extname(source));
}

function loadConfigCompatibilityFallback(): Record<string, unknown> | null {
  try {
    const cfgPath = process.env.OPENCLAW_CONFIG_PATH || `${process.env.HOME}/.openclaw/openclaw.json`;
    const raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    const plugins = asRecord(raw.plugins);
    const entries = asRecord(plugins?.entries);
    const entry = asRecord(entries?.["memory-multimodal-ingest"]);
    return asRecord(entry?.config);
  } catch {
    return null;
  }
}

function parsePluginConfig(value: unknown): PluginConfig {
  const raw = asRecord(value);
  const inlineCfg = asRecord(raw?.config) || raw;
  const cfg = asRecord(inlineCfg?.embedding) ? inlineCfg : loadConfigCompatibilityFallback();
  if (!cfg) {
    throw new Error("memory-multimodal-ingest config is required");
  }

  const embedding = asRecord(cfg.embedding);
  if (!embedding) {
    throw new Error("embedding config is required");
  }

  const apiKey = parseString(embedding, "apiKey");
  if (!apiKey) {
    throw new Error("embedding.apiKey is required");
  }

  const model = parseString(embedding, "model", "gemini-embedding-2-preview");
  if (!model) {
    throw new Error("embedding.model is required");
  }

  return {
    embedding: {
      apiKey,
      model,
      apiBase: parseString(embedding, "apiBase", parseString(embedding, "baseURL", "https://generativelanguage.googleapis.com/v1beta")),
      dimensions: parsePositiveInteger(embedding, "dimensions", 3072),
    },
    dbPath: parseString(cfg, "dbPath"),
    blobPath: parseString(cfg, "blobPath"),
    maxInlineBytes: parsePositiveInteger(cfg, "maxInlineBytes", 8 * 1024 * 1024),
    modalities: asRecord(cfg.modalities) as Partial<Record<MediaModality, boolean>> | undefined,
  };
}

async function readSourceBytes(source: string): Promise<{ bytes: Uint8Array; sourceUri: string; hintedMimeType?: string }> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to download ${source}: ${res.status} ${res.statusText}`);
    }
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      sourceUri: source,
      hintedMimeType: res.headers.get("content-type") || undefined
    };
  }

  return {
    bytes: new Uint8Array(await readFile(source)),
    sourceUri: source
  };
}

async function persistBlob(blobPath: string, id: string, mimeType: string, bytes: Uint8Array): Promise<string> {
  await mkdir(blobPath, { recursive: true });
  const filePath = join(blobPath, `${id}${extensionFromMimeType(mimeType)}`);
  await writeFile(filePath, Buffer.from(bytes));
  return filePath;
}

const plugin = {
  id: "memory-multimodal-ingest",
  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.config);
    const resolvedDbPath = api.resolvePath(config.dbPath || "~/.openclaw/memory/lancedb-multimodal");
    const resolvedBlobPath = api.resolvePath(config.blobPath || "~/.openclaw/memory/blobs");
    const embedder = new MultimodalEmbedder({
      apiKey: config.embedding.apiKey,
      model: config.embedding.model || "gemini-embedding-2-preview",
      apiBase: config.embedding.apiBase || "https://generativelanguage.googleapis.com/v1beta",
      dimensions: config.embedding.dimensions || 3072
    });
    const store = new MediaStore({
      dbPath: resolvedDbPath,
      vectorDim: embedder.dimensions
    });

    const ingest = async (
      source: string,
      options?: { previewText?: string; scope?: string; metadata?: string; modality?: MediaModality }
    ) => {
      const loaded = await readSourceBytes(source);
      if (loaded.bytes.byteLength > (config.maxInlineBytes || 8 * 1024 * 1024)) {
        throw new Error(`File too large for current inline_data MVP: ${loaded.bytes.byteLength} bytes`);
      }
      const mimeType = inferMimeType(source, loaded.hintedMimeType);
      if (!mimeType) {
        throw new Error(`Could not infer MIME type for ${source}`);
      }
      const modality = options?.modality || modalityFromMimeType(mimeType);
      if (!modality) {
        throw new Error(`Unsupported modality for MIME type ${mimeType}`);
      }
      if (config.modalities?.[modality] === false) {
        throw new Error(`Modality ${modality} is disabled by config`);
      }

      const previewText = options?.previewText?.trim() || derivePreviewText(loaded.sourceUri);
      const vector = await embedder.embedInlineDataWithText(mimeType, loaded.bytes, previewText);
      const digest = createHash("sha256").update(loaded.bytes).digest("hex");
      const blobId = createHash("sha256").update(`${digest}:${Date.now()}`).digest("hex").slice(0, 16);
      const savedBlobPath = await persistBlob(resolvedBlobPath, blobId, mimeType, loaded.bytes);
      return store.store({
        modality,
        mimeType,
        sourceUri: loaded.sourceUri,
        blobPath: savedBlobPath,
        previewText,
        scope: options?.scope || "global",
        metadata: parseMetadata(options?.metadata),
        contentHash: digest,
        vector
      });
    };

    api.registerTool({
      name: "memory_media_store",
      label: "Memory Media Store",
      description: "Store an image, video, audio file, or PDF in multimodal memory.",
      parameters: Type.Object({
        source: Type.String({ description: "Local file path or HTTP/HTTPS URL" }),
        previewText: Type.Optional(Type.String()),
        scope: Type.Optional(Type.String()),
        metadata: Type.Optional(Type.String()),
        modality: Type.Optional(Type.Union([
          Type.Literal("image"),
          Type.Literal("video"),
          Type.Literal("audio"),
          Type.Literal("pdf")
        ]))
      }),
      async execute(_toolCallId, params) {
        try {
          const entry = await ingest((params as any).source, {
            previewText: (params as any).previewText,
            scope: (params as any).scope,
            metadata: (params as any).metadata,
            modality: (params as any).modality
          });
          return {
            content: [{ type: "text", text: `Stored ${entry.modality} memory ${entry.id.slice(0, 8)} from ${entry.sourceUri}` }],
            details: entry
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Multimodal memory store failed: ${error instanceof Error ? error.message : String(error)}` }],
            details: { error: String(error) }
          };
        }
      }
    }, { name: "memory_media_store" });

    api.registerTool({
      name: "memory_media_search",
      label: "Memory Media Search",
      description: "Search multimodal memories with a text query.",
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Optional(Type.Number()),
        scope: Type.Optional(Type.String()),
        modality: Type.Optional(Type.Union([
          Type.Literal("image"),
          Type.Literal("video"),
          Type.Literal("audio"),
          Type.Literal("pdf")
        ]))
      }),
      async execute(_toolCallId, params) {
        try {
          const vector = await embedder.embedText((params as any).query);
          const results = await store.search(
            vector,
            Math.trunc((params as any).limit || 5),
            (params as any).modality,
            (params as any).scope,
            (params as any).query,
          );
          return {
            content: [{ type: "text", text: `Found ${results.length} multimodal memories` }],
            details: results
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Multimodal memory search failed: ${error instanceof Error ? error.message : String(error)}` }],
            details: { error: String(error) }
          };
        }
      }
    }, { name: "memory_media_search" });

    api.registerTool({
      name: "memory_media_list",
      label: "Memory Media List",
      description: "List stored multimodal memories.",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number()),
        scope: Type.Optional(Type.String()),
        modality: Type.Optional(Type.Union([
          Type.Literal("image"),
          Type.Literal("video"),
          Type.Literal("audio"),
          Type.Literal("pdf")
        ]))
      }),
      async execute(_toolCallId, params) {
        const rows = await store.list(Math.trunc((params as any).limit || 20), (params as any).modality, (params as any).scope);
        return {
          content: [{ type: "text", text: `Listed ${rows.length} multimodal memories` }],
          details: rows
        };
      }
    }, { name: "memory_media_list" });

    api.registerTool({
      name: "memory_media_delete",
      label: "Memory Media Delete",
      description: "Delete a stored multimodal memory by id.",
      parameters: Type.Object({
        id: Type.String()
      }),
      async execute(_toolCallId, params) {
        const deleted = await store.delete((params as any).id);
        return {
          content: [{ type: "text", text: deleted ? `Deleted ${(params as any).id}` : `Not found: ${(params as any).id}` }],
          details: { deleted }
        };
      }
    }, { name: "memory_media_delete" });

    api.registerCli(
      createMediaCli({
        store,
        embedder,
        ingest
      }),
      { commands: ["memory-media"] }
    );

    api.logger.info(
      `memory-multimodal-ingest: plugin registered (db: ${resolvedDbPath}, model: ${config.embedding.model || "gemini-embedding-2-preview"})`
    );
  }
};

export default plugin;
