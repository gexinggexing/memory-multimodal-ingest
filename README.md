# memory-multimodal-ingest

OpenClaw plugin for multimodal memory ingest backed by LanceDB and Gemini Embedding 2.

Current MVP:

- ingest image / video / audio / PDF from local paths or HTTP(S) URLs
- embed via Gemini `gemini-embedding-2-preview`
- store vectors and metadata in LanceDB
- copy original bytes into a local blob directory
- search stored multimodal memories with text queries
- CLI commands under `openclaw memory-media`

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
