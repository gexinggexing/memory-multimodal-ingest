# Multimodal Embedding Plugin Framework

## Goal

Add multimodal memory to the upgraded `memory-lancedb-pro` stack without overloading the core text-memory path.

Target outcome:

- keep the existing text memory plugin stable
- add multimodal ingestion as an extension/plugin layer
- use `gemini-embedding-2-preview` as the default multimodal embedding provider
- keep LanceDB as the storage/index layer for cross-modal retrieval

## Recommended Split

Use a two-plugin design instead of forcing all new logic into the current plugin.

### Plugin A: `memory-lancedb-pro`

Keep this as the core memory runtime:

- memory lifecycle hooks
- smart extraction for text conversations
- recall injection
- scoring, rerank, decay, scope isolation
- CLI and maintenance commands

### Plugin B: `memory-multimodal-ingest`

Create a new plugin responsible for multimodal assets:

- image / video / audio / PDF ingestion
- file normalization and MIME detection
- media chunking
- embedding generation via Gemini Embedding 2
- writing media records into LanceDB
- optional file/blob sidecar storage

This keeps the core memory plugin focused and lets you evolve multimodal support independently.

## Storage Model

Use one LanceDB table per embedding space.

### Option 1: Separate tables

- `memories_text`
- `memories_multimodal`

Pros:

- easiest migration path
- avoids mixing old text-only rows with new multimodal rows
- lets retrieval logic be tuned separately

### Option 2: Unified table

Store both text and media rows together with a `content_type` field:

- `text`
- `image`
- `video`
- `audio`
- `pdf`

Extra fields:

- `source_uri`
- `mime_type`
- `modality`
- `caption`
- `ocr_text`
- `transcript`
- `segment_index`
- `segment_start_ms`
- `segment_end_ms`
- `preview_text`
- `metadata`

Recommendation: start with separate tables, then unify only if cross-modal ranking needs a single pipeline.

## Plugin API Surface

Add a dedicated tool family for multimodal memory.

- `memory_media_store`
- `memory_media_search`
- `memory_media_list`
- `memory_media_delete`

Suggested input shapes:

- image: file path or URL
- video: file path or URL plus chunking options
- audio: file path or URL plus transcript options
- pdf: file path or URL plus page chunking options

Keep `memory_store` text-only. Do not overload it with media unions unless you are ready to refactor the current prompt/tooling contract.

## Ingestion Pipeline

### Image

1. Resolve file or download URL
2. Validate MIME and size
3. Generate a preview/caption if needed
4. Embed raw image or image+caption with Gemini Embedding 2
5. Store vector + metadata + source pointer

### Video

1. Resolve file
2. Sample frames and segment timeline
3. Optionally extract audio transcript
4. Embed representative frames or segments
5. Store segment-level rows

### Audio

1. Resolve file
2. Transcribe if useful
3. Embed raw audio segments or transcript+audio representations
4. Store segment-level rows

### PDF

1. Resolve file
2. Split by page or page ranges
3. Extract OCR/text when available
4. Embed page-level content
5. Store page-level rows

## Retrieval Design

Use a broker pattern:

- text query enters `memory-lancedb-pro`
- broker queries text memory and multimodal memory in parallel
- results are normalized into a shared score shape
- optional reranker merges final ranking

Suggested retrieval stages:

1. text memory search
2. multimodal vector search
3. metadata filter by modality/scope/project
4. score normalization
5. rerank
6. inject top results as concise summaries, not raw blobs

## Config Shape

Add a separate config block under the new plugin:

```json
{
  "plugins": {
    "entries": {
      "memory-multimodal-ingest": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openai-compatible",
            "apiKey": "${GEMINI_API_KEY}",
            "model": "gemini-embedding-2-preview",
            "baseURL": "https://generativelanguage.googleapis.com/v1beta/openai/",
            "dimensions": 3072
          },
          "dbPath": "/Users/yyc/.openclaw/memory/lancedb-multimodal",
          "blobPath": "/Users/yyc/.openclaw/memory/blobs",
          "modalities": {
            "image": true,
            "video": true,
            "audio": true,
            "pdf": true
          }
        }
      }
    }
  }
}
```

## Migration Path

Phase 1:

- upgrade core `memory-lancedb-pro`
- keep text memory behavior unchanged

Phase 2:

- add `memory-multimodal-ingest`
- ingest media into a separate LanceDB path

Phase 3:

- add retrieval broker
- merge text + media recall into one injection layer

Phase 4:

- add maintenance commands
- re-embed / rebuild / compact / export for media rows

## Implementation Checklist

- add a `MultimodalEmbedder` abstraction instead of reusing the text-only helper blindly
- add MIME-aware file loaders
- add media chunkers for video/audio/PDF
- add LanceDB schema for modality metadata
- add a retrieval broker in the core memory plugin
- add config validation and UI hints
- add test fixtures for image, audio, video, and PDF ingestion

## Recommendation

Do not refactor the current plugin into an all-in-one multimodal plugin on the first pass.

Ship in this order:

1. upgrade the core plugin
2. add a separate multimodal ingest plugin
3. bridge retrieval after ingestion is stable

That gives you a reversible migration path and keeps text memory reliable while you build the multimodal layer.
