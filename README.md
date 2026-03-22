# memory-multimodal-ingest

[English](./README.md) | [简体中文](./README_CN.md)

OpenClaw plugin for multimodal memory ingest backed by LanceDB and Gemini Embedding 2.

Status:

- experimental prototype
- maintained independently from `CortexReach/memory-lancedb-pro`
- not an official upstream companion plugin at this stage
- upstream discussion first: [CortexReach/memory-lancedb-pro#275](https://github.com/CortexReach/memory-lancedb-pro/discussions/275)

Current MVP:

- ingest image / video / audio / PDF from local paths or HTTP(S) URLs
- embed via Gemini `gemini-embedding-2-preview`
- store vectors and metadata in LanceDB
- copy original bytes into a local blob directory
- search stored multimodal memories with text queries
- CLI commands under `openclaw memory-media`

What is implemented now:

- plugin registration in OpenClaw
- LanceDB-backed multimodal storage
- local blob persistence
- text-to-media retrieval using Gemini Embedding 2
- verified ingest for `image`, `audio`, `video`, and `pdf`

What is not implemented yet:

- frame-level video chunking
- PDF page chunking
- audio transcription-assisted retrieval
- Files API path for large media
- recall broker integration into `memory-lancedb-pro`

Upstream-facing boundaries:

- explicit plugin config is required under `plugins.entries.memory-multimodal-ingest.config`
- current code still keeps a narrow compatibility fallback for OpenClaw builds where `api.config` is missing in plugin discovery / CLI contexts
- that fallback reads only the plugin's own `memory-multimodal-ingest` entry and should be removable once the SDK consistently passes config
- `metadata` is treated as JSON and validated on ingest
- large-media handling is intentionally out of scope for this MVP
- upstream integration should wait for consensus in discussion `#275` before any attempt to merge this direction into core docs or code

Validated locally:

- `openclaw memory-media ingest /path/to/file`
- `openclaw memory-media stats`
- `openclaw memory-media search "query"`

Related design document:

- [Multimodal plugin framework](./docs/multimodal-plugin-framework.md)

Default config shape:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/Users/yyc/.openclaw/workspace/plugins/memory-multimodal-ingest"
      ]
    },
    "entries": {
      "memory-multimodal-ingest": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "${GEMINI_API_KEY}",
            "model": "gemini-embedding-2-preview",
            "apiBase": "https://generativelanguage.googleapis.com/v1beta",
            "dimensions": 3072
          },
          "dbPath": "/Users/yyc/.openclaw/memory/lancedb-multimodal",
          "blobPath": "/Users/yyc/.openclaw/memory/blobs",
          "maxInlineBytes": 8388608
        }
      }
    }
  }
}
```

Example commands:

```bash
openclaw memory-media ingest /path/to/example.png --preview-text "red square test"
openclaw memory-media ingest /path/to/example.pdf --preview-text "pdf doc test"
openclaw memory-media ingest /path/to/example.mp4 --metadata '{"project":"demo","kind":"clip"}'
openclaw memory-media stats
openclaw memory-media search "red square test" --limit 3
```
