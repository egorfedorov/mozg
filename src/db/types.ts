/** Row shapes. Kept in lockstep with src/db/migrations/*.sql by hand. */

export type Plan = "free" | "pro" | "team";
export type Visibility = "private" | "link" | "public";
export type License = "nc" | "mit" | "proprietary";
export type SourceKind = "image" | "text" | "url" | "file";
export type SourceStatus = "queued" | "processing" | "ready" | "failed" | "rejected";
export type NoteKind = "fact" | "rule" | "layout" | "example" | "pitfall";
export type NoteStatus = "active" | "pending" | "superseded" | "rejected";
export type GrantRole = "viewer" | "contributor";

export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  plan: Plan;
  handle: string | null;
}

export interface Brain {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  goal: string | null;
  color: string;
  /** Catalogue field — see src/lib/topics.ts. Free text; unknown reads as "other". */
  topic: string;
  /** Groups this brain under another. One level only; see 0006_families.sql. */
  parent_id: string | null;
  visibility: Visibility;
  license: License;
  score: number | null;
  score_at: Date | null;
  review_required: boolean;
  note_count: number;
  source_count: number;
  /** 0 means free. Access to a paid brain is bought once, from balance. */
  price_cents: number;
  sales_count: number;
  created_at: Date;
  updated_at: Date;
}

export type LedgerKind =
  | "topup"
  | "purchase"
  | "earning"
  | "payout"
  | "refund"
  | "adjustment";

export interface LedgerEntry {
  id: string;
  user_id: string;
  /** Signed: positive credits, negative debits. */
  amount_cents: number;
  kind: LedgerKind;
  brain_id: string | null;
  purchase_id: string | null;
  external_ref: string | null;
  note: string | null;
  created_at: Date;
}

export interface Purchase {
  id: string;
  brain_id: string;
  buyer_id: string;
  seller_id: string;
  price_cents: number;
  seller_cents: number;
  created_at: Date;
}

export interface Source {
  id: string;
  brain_id: string;
  kind: SourceKind;
  storage_key: string | null;
  original_name: string | null;
  mime: string | null;
  bytes: number | null;
  url: string | null;
  status: SourceStatus;
  reject_reason: string | null;
  findings: Finding[] | null;
  error: string | null;
  note_count: number;
  cost_cents: number | null;
  /** Cached extraction so a queue retry skips the paid step; see 0011. */
  extract_payload: unknown;
  created_at: Date;
  processed_at: Date | null;
}

export interface Note {
  id: string;
  brain_id: string;
  source_id: string | null;
  title: string;
  body: string;
  category: string | null;
  kind: NoteKind;
  confidence: number;
  author: "ingest" | "human" | "agent" | "consolidated";
  agent_client: string | null;
  status: NoteStatus;
  superseded_by: string | null;
  created_at: Date;
}

export interface Chunk {
  id: string;
  brain_id: string;
  note_id: string;
  content: string;
  token_count: number;
}

export interface Check {
  id: string;
  brain_id: string;
  category: string;
  question: string;
  expect: string;
  weight: number;
  origin: "generated" | "manual";
  enabled: boolean;
}

export interface CheckRun {
  id: string;
  brain_id: string;
  score: number | null;
  model: string | null;
  cost_cents: number | null;
  status: "running" | "done" | "failed";
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
}

export interface Grant {
  id: string;
  brain_id: string;
  email: string;
  role: GrantRole;
  accepted_by: string | null;
  invited_by: string;
  invited_at: Date;
}

export interface McpToken {
  id: string;
  user_id: string;
  token_hash: string;
  prefix: string;
  name: string | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** A masked secret-scan hit. `sample` is already redacted — never store raw. */
export interface Finding {
  rule: string;
  label: string;
  sample: string;
  line?: number;
}
