# Question sources

Import batches live here locally only: `data/questions/<topic>-<source>.json`, one JSON array per
source. They are **git-ignored on purpose** so a scraped corpus never lands in the repository or its
history.

These files feed `pnpm content:import`; the live bank is Postgres (the private `content` schema) and
nothing here is served at runtime. Format, authoring rules and the import/verify/wipe workflow are
written down outside the repo, in the vault note `raw/quizapp/question-bank-guide.md`.
