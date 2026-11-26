/**
 * Session logs → changes.
 *
 * A log is JSON Lines: one entry per line, in the order it happened. An edit is
 * two entries — the assistant's `tool_use` and the user entry that carries its
 * `tool_result` — so a change only exists once both are seen. An edit whose
 * result is an error never changed a file and is never stored.
 *
 * The result entry also records who let the change through: a person who was
 * asked, or the configuration (a rule, a permission mode, a classifier). That
 * is the difference between "you approved it in four seconds" and "nobody was
 * asked", and it is a fact from the log rather than a guess from timing.
 *
 * The reader is tolerant on purpose. The log's shape moves between Claude Code
 * versions, so every field is optional here and a line that cannot be read is
 * skipped, never fatal.
 */

import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { countLines, displayPath, moduleOf, risksOf, weightOf } from "./change";
import type { Change } from "./types";

export interface RawLine {
  /** Byte offset of the line in the file. */
  offset: number;
  length: number;
  json: unknown;
}

export interface LinesRead {
  lines: RawLine[];
  /** Where to resume: after the last complete line read. */
  offset: number;
  /** The file shrank since last time and was read from the start. */
  reset: boolean;
}

const CHUNK = 256 * 1024;
/** One log is read no further than this in a single pass; the rest waits. */
const MAX_BYTES = 192 * 1024 * 1024;
/** A line without this cannot hold a tool call or its result. */
export const TOOL_MARKER = '"tool_';

/**
 * Read complete lines from `from` to the end of the file as it is now. A file
 * being written to ends mid-line; that remainder is left for the next read.
 *
 * Only lines that contain `marker` are parsed. Most lines in a log are
 * anything else, and some of those run to a megabyte: a substring test costs
 * a fraction of parsing them.
 */
export async function readLines(path: string, from = 0, marker = TOOL_MARKER, maxBytes = MAX_BYTES): Promise<LinesRead> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    let start = from;
    let reset = false;
    // Shorter than where we left off means a new file under the same name.
    if (from < 0 || from > size) {
      start = 0;
      reset = true;
    }
    const end = Math.min(size, start + maxBytes);
    const lines: RawLine[] = [];
    let buffer: Buffer = Buffer.alloc(0);
    let pos = start;

    while (pos + buffer.length < end) {
      const want = Math.min(CHUNK, end - (pos + buffer.length));
      const chunk = Buffer.alloc(want);
      const { bytesRead } = await handle.read(chunk, 0, want, pos + buffer.length);
      if (!bytesRead) break;
      buffer = buffer.length ? Buffer.concat([buffer, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);

      let consumed = 0;
      for (let nl = buffer.indexOf(10); nl !== -1; nl = buffer.indexOf(10, consumed)) {
        push(lines, buffer.subarray(consumed, nl), pos + consumed, marker);
        consumed = nl + 1;
      }
      if (consumed) {
        buffer = buffer.subarray(consumed);
        pos += consumed;
      }
    }
    return { lines, offset: pos, reset };
  } finally {
    await handle.close();
  }
}

function push(out: RawLine[], bytes: Buffer, offset: number, marker: string): void {
  if (!bytes.length || !bytes.includes(marker)) return;
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch {
    return;
  }
  if (json && typeof json === "object") out.push({ offset, length: bytes.length + 1, json });
}

/** Read one stored line again, to reach the change's text. */
export async function readLineAt(path: string, offset: number, length: number): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, offset);
    const text = buf.subarray(0, bytesRead).toString("utf8");
    try {
      return JSON.parse(text.replace(/\n$/, ""));
    } catch {
      return null;
    }
  } finally {
    await handle.close();
  }
}

// ─── extracting changes ─────────────────────────────────────────────────────

const EDIT_TOOLS: Record<string, Change["tool"]> = {
  edit: "edit",
  multiedit: "multiedit",
  write: "write",
  notebookedit: "notebook",
};

interface Pending {
  toolUseId: string;
  session: string;
  project: string;
  at: string;
  tool: Change["tool"];
  input: Record<string, unknown>;
  source: Change["source"];
}

interface Result {
  at: string | null;
  isError: boolean;
  /** The tool's own structured result, when the entry carries one. */
  result: Record<string, unknown> | null;
  approvedBy: Change["approvedBy"];
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stableId(session: string, toolUseId: string): string {
  return createHash("sha1").update(`${session}:${toolUseId}`).digest("hex").slice(0, 24);
}

/**
 * Who let this call through, from the decision the log recorded for it.
 *
 *   user     a person was asked, for this call, and said yes
 *   auto     nobody was asked at that moment: a rule, the permission mode, a
 *            classifier, or an "always allow" the person clicked some other day
 *   unknown  the log does not say
 *
 * `user_permanent` counts as auto. It sounds like the person, and is a rule
 * they made earlier: the call went through as fast as any other, and reading
 * it as "you approved this" would credit them with a look they never took.
 */
export function approvedBy(entry: Record<string, unknown>): Change["approvedBy"] {
  const d = obj(entry.permissionDecision);
  if (!d) return "unknown";
  const source = str(d.source);
  if (source === "user_temporary" || str(d.grantScope) === "once") return "user";
  if (source === "config" || source === "hook" || source === "user_permanent") return "auto";
  return "unknown";
}

/**
 * The changes in a stretch of log. `path` is the log's own path, so a change
 * can point back at its line; `fallbackSession` names the session when an
 * entry does not.
 */
export function changesFrom(lines: RawLine[], path: string, fallbackSession: string): Change[] {
  const pending = new Map<string, Pending>();
  const out: Change[] = [];

  for (const { json, offset, length } of lines) {
    const entry = obj(json);
    if (!entry) continue;
    const content = obj(entry.message)?.content;
    if (!Array.isArray(content)) continue;

    if (entry.type === "assistant") {
      for (const block of content) {
        const b = obj(block);
        if (!b || b.type !== "tool_use") continue;
        const tool = EDIT_TOOLS[str(b.name).toLowerCase()];
        const toolUseId = str(b.id);
        if (!tool || !toolUseId) continue;
        pending.set(toolUseId, {
          toolUseId,
          // Older versions wrote `session_id`; the two never appear together.
          session: str(entry.sessionId) || str(entry.session_id) || fallbackSession,
          project: str(entry.cwd),
          at: str(entry.timestamp),
          tool,
          input: obj(b.input) ?? {},
          source: { path, offset, length },
        });
      }
      continue;
    }

    if (entry.type === "user") {
      const result: Result = {
        at: str(entry.timestamp),
        isError: false,
        result: obj(entry.toolUseResult),
        approvedBy: approvedBy(entry),
      };
      for (const block of content) {
        const b = obj(block);
        if (!b || b.type !== "tool_result" || !str(b.tool_use_id)) continue;
        const p = pending.get(str(b.tool_use_id));
        if (!p) continue;
        pending.delete(str(b.tool_use_id));
        // An absent flag is a pass: older logs do not carry it.
        if (b.is_error === true) continue;
        const change = build(p, { ...result, isError: false });
        if (change) out.push(change);
      }
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

/** Lines a structured patch says were added and removed, when it says. */
export function patchLines(result: Record<string, unknown> | null): { added: number; removed: number } | null {
  const patch = result?.structuredPatch;
  if (!Array.isArray(patch) || !patch.length) return null;
  let added = 0;
  let removed = 0;
  for (const hunk of patch) {
    const h = obj(hunk);
    if (!h || typeof h.newLines !== "number" || typeof h.oldLines !== "number") return null;
    added += h.newLines;
    removed += h.oldLines;
  }
  return { added, removed };
}

/** What the tool was asked to do, measured in lines. */
export function measure(
  tool: Change["tool"],
  input: Record<string, unknown>,
  result: Record<string, unknown> | null = null,
): { file: string; added: number; removed: number; text: string } | null {
  const exact = patchLines(result);

  if (tool === "edit") {
    const after = str(input.new_string);
    // The patch counts every occurrence a replace-all touched; the strings only show one.
    return {
      file: str(input.file_path),
      added: exact?.added ?? countLines(after),
      removed: exact?.removed ?? countLines(str(input.old_string)),
      text: after,
    };
  }
  if (tool === "multiedit") {
    let added = 0;
    let removed = 0;
    const texts: string[] = [];
    if (Array.isArray(input.edits)) {
      for (const e of input.edits) {
        const edit = obj(e);
        if (!edit) continue;
        added += countLines(str(edit.new_string));
        removed += countLines(str(edit.old_string));
        texts.push(str(edit.new_string));
      }
    }
    return { file: str(input.file_path), added: exact?.added ?? added, removed: exact?.removed ?? removed, text: texts.join("\n") };
  }
  if (tool === "write") {
    const text = str(input.content);
    // A whole-file write: what it replaced is only in the result, and only when the file existed.
    const before = str(result?.originalFile);
    return {
      file: str(input.file_path),
      added: exact?.added ?? countLines(text),
      removed: exact?.removed ?? (before ? countLines(before) : 0),
      text,
    };
  }
  const mode = str(input.edit_mode).toLowerCase();
  const text = str(input.new_source) || str(input.content);
  const file = str(input.notebook_path) || str(input.file_path);
  return {
    file,
    added: mode === "delete" ? 0 : countLines(text),
    removed: mode === "delete" ? countLines(str(input.old_source)) : mode === "replace" ? 1 : 0,
    text,
  };
}

function build(p: Pending, r: Result): Change | null {
  const m = measure(p.tool, p.input, r.result);
  if (!m || !m.file) return null;

  const file = displayPath(m.file, p.project);
  const risks = risksOf(file, m.added, m.removed, m.text.slice(0, 4000));
  const calledAt = Date.parse(p.at);
  const resultAt = Date.parse(r.at ?? "");

  return {
    id: stableId(p.session, p.toolUseId),
    toolUseId: p.toolUseId,
    session: p.session,
    project: p.project,
    file,
    module: moduleOf(file),
    tool: p.tool,
    at: new Date(Number.isNaN(calledAt) ? Date.now() : calledAt).toISOString(),
    added: m.added,
    removed: m.removed,
    weight: weightOf(risks),
    risks,
    // Negative would only mean clock trouble; unknown is null, never zero,
    // because zero reads as "went ahead instantly" and that is a claim.
    goAheadMs: Number.isNaN(calledAt) || Number.isNaN(resultAt) || resultAt < calledAt ? null : resultAt - calledAt,
    approvedBy: r.approvedBy,
    source: p.source,
  };
}

// ─── the text of a change, for the explain-back ─────────────────────────────

export interface ChangeText {
  file: string;
  tool: Change["tool"];
  /** Before/after pairs, one per edited region. */
  parts: { before: string; after: string }[];
}

/** Go back to the log line and read what the change actually said. */
export async function readChangeText(change: Change): Promise<ChangeText | null> {
  let json: unknown;
  try {
    json = await readLineAt(change.source.path, change.source.offset, change.source.length);
  } catch {
    return null;
  }
  const content = obj(obj(json)?.message)?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    const b = obj(block);
    if (!b || b.type !== "tool_use" || b.id !== change.toolUseId) continue;
    const input = obj(b.input) ?? {};
    if (change.tool === "edit") {
      return { file: str(input.file_path), tool: change.tool, parts: [{ before: str(input.old_string), after: str(input.new_string) }] };
    }
    if (change.tool === "multiedit") {
      const parts: ChangeText["parts"] = [];
      if (Array.isArray(input.edits)) {
        for (const e of input.edits) {
          const edit = obj(e);
          if (edit) parts.push({ before: str(edit.old_string), after: str(edit.new_string) });
        }
      }
      return { file: str(input.file_path), tool: change.tool, parts };
    }
    if (change.tool === "write") {
      return { file: str(input.file_path), tool: change.tool, parts: [{ before: "", after: str(input.content) }] };
    }
    return { file: str(input.notebook_path), tool: change.tool, parts: [{ before: "", after: str(input.new_source) }] };
  }
  return null;
}

const CONTEXT = 2;

function split(text: string): string[] {
  return text ? text.replace(/\n$/, "").split("\n") : [];
}

/**
 * The changed lines with a little context, as `-` and `+`. The head and tail
 * the two sides share are dropped: a one-line fix inside a forty-line string
 * is one line to explain, not forty.
 */
export function renderChange(text: ChangeText, maxLines = 48): string {
  const out: string[] = [];
  let shown = 0;
  let hidden = 0;

  for (const { before, after } of text.parts) {
    const a = split(before);
    const b = split(after);
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const block = [
      ...a.slice(Math.max(0, head - CONTEXT), head).map((l) => `  ${l}`),
      ...a.slice(head, a.length - tail).map((l) => `- ${l}`),
      ...b.slice(head, b.length - tail).map((l) => `+ ${l}`),
      ...a.slice(a.length - tail, Math.min(a.length, a.length - tail + CONTEXT)).map((l) => `  ${l}`),
    ];
    if (out.length && block.length) out.push("");
    for (const line of block) {
      if (shown >= maxLines) {
        hidden++;
        continue;
      }
      out.push(line);
      shown++;
    }
  }
  if (hidden) out.push(`… ${hidden} more line${hidden === 1 ? "" : "s"}`);
  return out.join("\n");
}

/**
 * Where to point the question. Chosen from the risk tags and the shape of the
 * change, so the agent asks about the risky part and not about the easy one.
 */
export function hintsFor(change: Pick<Change, "risks">, rendered: string): string[] {
  const out: string[] = [];
  const has = change.risks.includes.bind(change.risks);
  if (has("migration")) out.push("what this does to rows that already exist");
  if (has("payments")) out.push("what happens when the payment is declined, or never answers");
  if (has("auth")) out.push("who can reach this now who could not before");
  if (has("schema")) out.push("which existing rows no longer fit");
  if (has("config")) out.push("what breaks in production if this value is wrong");
  if (/\bcatch\b/.test(rendered)) out.push("what the catch block does with the error");
  if (/\bawait\b/.test(rendered)) out.push("what happens if this call never returns");
  if (/(^|[^\w])if\s*\(/.test(rendered)) out.push("which input takes the new branch, and which skips it");
  if (/\bfor\s*\(|\.map\(|\.forEach\(/.test(rendered)) out.push("what happens when the collection is empty");
  if (!out.length) out.push("what this changes for the code that calls it");
  return out.slice(0, 3);
}
