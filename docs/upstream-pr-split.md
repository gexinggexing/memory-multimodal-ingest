# Upstream PR Split

## Historical Note

The original plan was to split the upstream path into a small core PR plus a larger multimodal design discussion.

That no longer reflects the current state:

- the original `Part 1` core changes are now effectively present in upstream `master`
- an attempt to add the experimental multimodal prototype to the main README was closed as premature
- maintainers asked to keep converging in discussion `#275` first

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

Current recommendation:

- keep discussion `#275` as the main convergence point
- do not propose core README placement again until the direction is considered mature enough upstream
