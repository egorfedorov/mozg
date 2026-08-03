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
  visibility: Visibility;
  license: License;
  score: number | null;
  score_at: Date | null;
  review_required: boolean;
  note_count: number;
  source_count: number;
  created_at: Date;
  updated_at: Date;
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
  author: "ingest" | "human" | "agent";
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
