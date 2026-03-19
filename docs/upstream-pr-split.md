# Upstream PR Split

## PR 1: Safe Core Updates

Scope:

- add `gemini-embedding-2-preview` to embedding dimension map
- add chunker/context-limit support
- update config schema help text
- update README provider table
- fix background timers so CLI commands terminate in local runs

Reason:

- small review surface
- easy for maintainers to reason about
- no schema breakage

## PR 2: Optional Design Discussion

Scope:

- explain why multimodal support should be a sibling plugin first
- link to the standalone MVP implementation
- discuss integration points with `memory-lancedb-pro`

Reason:

- much larger architectural change
- should be aligned with maintainer expectations before code review
