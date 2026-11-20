# Fictional company docs

Everything in this folder is made up for testing: the companies, people, prices, policies and salary figures.

- One folder per company. The folder name matches `tenants.id` in `db/001_init.sql` (`acme`, `chai`).
- Each doc starts with front-matter:
  - `title`: shown in citations
  - `access`: `public` (any user of that company) or `restricted` (only allowed roles, from Phase 3)
- Ingestion (Phase 1) should skip this README.
