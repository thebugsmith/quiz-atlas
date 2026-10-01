# Question sources

Import batches live here locally only: `data/questions/<topic>-<source>.json`, one JSON array per
source.

These files feed `pnpm content:import`; the live bank is Postgres (the private `content` schema) and
nothing here is served at runtime.
