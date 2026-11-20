-- Phase 1: documents + chunks for RAG.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Conversation memory tables are created separately by LangGraph's setup() in the `langgraph` schema
-- (not exposed by Supabase's public API).

-- Supabase keeps extensions in the `extensions` schema, which is on the default search path.
create extension if not exists vector with schema extensions;

create table documents (
  id          bigint generated always as identity primary key,
  tenant_id   text not null references tenants(id),
  source_path text not null,            -- 'acme/plans-and-billing.md': where the doc came from
  title       text not null,            -- shown in citations
  access      text not null check (access in ('public', 'restricted')),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, source_path)       -- re-ingesting a doc updates it instead of adding a copy
);

create table chunks (
  id              bigint generated always as identity primary key,
  tenant_id       text not null references tenants(id),   -- repeated from documents so retrieval
                                                           -- and Phase 3 RLS need no join
  document_id     bigint not null references documents(id) on delete cascade,
  chunk_index     int not null,                            -- position within the document
  content         text not null,                           -- stored without the embedding prefix
  embedding       vector(768) not null,
  embedding_model text not null,                           -- vectors from different models don't match
  unique (document_id, chunk_index)
);

-- Approximate nearest-neighbour search by cosine distance (the <=> operator).
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- Same rule as orders: RLS on, no policies, so the public REST API sees nothing.
alter table documents enable row level security;
alter table chunks    enable row level security;
