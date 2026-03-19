# Upstream Issue Draft

## Title

Proposal: add Gemini Embedding 2 support and discuss a sibling multimodal ingest plugin

## Body

I split the work into two parts instead of turning `memory-lancedb-pro` into an all-in-one multimodal plugin.

Part 1:

- add `gemini-embedding-2-preview` model support
- update chunking/context-limit mappings
- fix CLI/service timer behavior so plugin CLI commands exit cleanly in local runs
- update docs/config hints

Part 2:

- build a separate `memory-multimodal-ingest` plugin
- support `image / audio / video / pdf` ingest
- store vectors + metadata in LanceDB
- keep the core text memory runtime unchanged

Why split it:

- the current upstream project is still optimized around text memory
- multimodal ingestion adds very different storage and pipeline concerns
- a sibling plugin keeps migration reversible and reduces regression risk

Validated locally:

- Gemini Embedding 2 API accepted image/audio/video/pdf inputs
- local OpenClaw plugin ingest succeeded for all four modalities
- LanceDB-backed search worked with text queries against stored media records

Repository with the sibling plugin MVP:

- https://github.com/gexinggexing/memory-multimodal-ingest

If this direction makes sense, I can open:

1. a small PR for `gemini-embedding-2-preview` + CLI/runtime fixes
2. a separate discussion/PR proposal for the sibling multimodal plugin path
