import type { Command } from "commander";
import type { MediaModality } from "./mime.js";
import type { MediaStore } from "./store.js";
import type { MultimodalEmbedder } from "./embedder.js";

export interface MediaCliContext {
  store: MediaStore;
  embedder: MultimodalEmbedder;
  ingest: (
    source: string,
    options?: {
      previewText?: string;
      scope?: string;
      metadata?: string;
      modality?: MediaModality;
    },
  ) => Promise<any>;
}

export function registerMediaCli(program: Command, context: MediaCliContext): void {
  const { store, embedder, ingest } = context;
  const memory = program
    .command("memory-media")
    .description("Multimodal memory management commands");

  memory
    .command("ingest <source>")
    .option("--preview-text <text>")
    .option("--scope <scope>", "Memory scope", "global")
    .option("--metadata <json>", "Metadata JSON string", "{}")
    .option("--modality <modality>", "Force modality")
    .action(async (source, options) => {
      const entry = await ingest(source, {
        previewText: options.previewText,
        scope: options.scope,
        metadata: options.metadata,
        modality: options.modality as MediaModality | undefined,
      });
      console.log(JSON.stringify(entry, null, 2));
    });

  memory
    .command("search <query>")
    .option("--limit <n>", "Max results", "5")
    .option("--modality <modality>")
    .option("--scope <scope>")
    .action(async (query, options) => {
      const vector = await embedder.embedText(query);
      const results = await store.search(
        vector,
        parseInt(options.limit, 10) || 5,
        options.modality as MediaModality | undefined,
        options.scope,
        query,
      );
      console.log(JSON.stringify(results, null, 2));
    });

  memory
    .command("list")
    .option("--limit <n>", "Max results", "20")
    .option("--modality <modality>")
    .option("--scope <scope>")
    .action(async (options) => {
      const rows = await store.list(
        parseInt(options.limit, 10) || 20,
        options.modality as MediaModality | undefined,
        options.scope,
      );
      console.log(JSON.stringify(rows, null, 2));
    });

  memory
    .command("delete <id>")
    .action(async (id) => {
      const deleted = await store.delete(id);
      console.log(JSON.stringify({ deleted }, null, 2));
      if (!deleted) process.exitCode = 1;
    });

  memory
    .command("stats")
    .action(async () => {
      console.log(JSON.stringify(await store.stats(), null, 2));
    });
}

export function createMediaCli(context: MediaCliContext) {
  return ({ program }: { program: Command }) => registerMediaCli(program, context);
}
