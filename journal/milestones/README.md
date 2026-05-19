# Milestones

This folder stores durable raw milestone notes created only for large updates, architecture decisions, migration completions, major debugging postmortems, or workflow changes worth preserving in the wiki/Obsidian raw store.

Routine commits should not create files here. Routine post-commit summaries stay local under `.context/project-memory/changes/` and must not be ingested into Obsidian/wiki.

## Milestone flow

1. Mark a commit as a milestone with `[milestone]` or `[wiki]`, set `PROJECT_MEMORY_FORCE_MILESTONE=1` for a deliberate write test, or create `.context/project-memory/MILESTONE` before committing.
2. The project-memory hook writes a draft raw note to `journal/milestones/YYYY-MM-DD-<slug>.md`.
3. Before wiki/Obsidian ingestion, replace TODO placeholders with a concise human summary, verification, and lessons/decisions.
4. Mark the note ready only after review.
5. Ingest only ready milestone files, never draft notes and never routine `.context/project-memory/changes/` entries.
6. After ingestion, record the Obsidian raw path/link and mark the note ingested when practical.

## Status metadata

Generated milestone notes should start as draft:

```yaml
---
status: draft
ready_for_wiki: false
wiki_ingested: false
---
```

A reviewed note can be changed to:

```yaml
---
status: ready
ready_for_wiki: true
wiki_ingested: false
---
```

After successful Obsidian ingestion, update to `wiki_ingested: true` and include a source/link if available.

## Obsidian ingestion command shape

Use `/cycle-context` or a deliberate save/checkpoint pass to ingest reviewed milestone notes with the Obsidian memory tool:

```text
obsidian_memory {
  operation: "ingest",
  title: "<Milestone title>",
  content: "<reviewed milestone note content>",
  source: "journal/milestones/<file>.md",
  tags: "project-memory,milestone"
}
```

Compile raw content into a wiki article only after curation. Do not use routine hook summaries as wiki inputs.
