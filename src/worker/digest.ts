import { query } from "@/db";
import { emailReady } from "@/lib/env";
import { sendMail } from "@/lib/mail";

/**
 * The Monday letter: what each owner's brains did last week, in numbers that
 * are worth a click. Sent only when something actually happened — a digest
 * that says "nothing changed" trains its reader to archive the sender.
 */

interface OwnerWeek {
  email: string;
  notes_added: number;
  calls: number;
  flags: number;
  pending: number;
  brains: { title: string; score: number | null; calls: number }[];
}

export async function runDigest(): Promise<number> {
  if (!emailReady) return 0;

  const owners = await query<{ id: string; email: string }>(
    `select distinct u.id, u.email from "user" u
      join brains b on b.owner_id = u.id
     where u."emailVerified"`,
  );

  let sent = 0;
  for (const owner of owners) {
    const [w] = await query<OwnerWeek>(
      `select
         $2::text as email,
         (select count(*)::int from notes n join brains b on b.id = n.brain_id
           where b.owner_id = $1 and n.created_at > now() - interval '7 days'
             and n.status = 'active') as notes_added,
         (select count(*)::int from calls c join brains b on b.id = c.brain_id
           where b.owner_id = $1 and c.created_at > now() - interval '7 days') as calls,
         (select count(*)::int from note_flags f join brains b on b.id = f.brain_id
           where b.owner_id = $1) as flags,
         (select count(*)::int from notes n join brains b on b.id = n.brain_id
           where b.owner_id = $1 and n.status = 'pending') as pending,
         '[]'::jsonb as brains`,
      [owner.id, owner.email],
    );

    // Nothing moved — no mail. The absence is the feature.
    if (w.notes_added === 0 && w.calls === 0 && w.flags === 0 && w.pending === 0) continue;

    const tops = await query<{ title: string; score: number | null; n: number }>(
      `select b.title, b.score,
              (select count(*)::int from calls c
                where c.brain_id = b.id
                  and c.created_at > now() - interval '7 days') as n
         from brains b where b.owner_id = $1
        order by 3 desc limit 5`,
      [owner.id],
    );

    const lines = [
      `Your brains, last 7 days:`,
      ``,
      `  ${w.calls} agent calls · ${w.notes_added} new notes` +
        (w.flags ? ` · ${w.flags} note(s) flagged by agents` : "") +
        (w.pending ? ` · ${w.pending} agent note(s) waiting for review` : ""),
      ``,
      ...tops
        .filter((t) => t.n > 0 || t.score !== null)
        .map(
          (t) =>
            `  ${t.title} — ${t.score === null ? "not examined" : `${t.score}%`} · ${t.n} calls`,
        ),
      ``,
      w.flags || w.pending
        ? `Things waiting on you: https://mozg.sh/brains`
        : `Dashboard: https://mozg.sh/brains`,
    ];

    try {
      await sendMail({
        to: owner.email,
        subject: `mozg week: ${w.calls} calls, ${w.notes_added} new notes`,
        text: lines.join("\n"),
      });
      sent++;
    } catch (err) {
      // One bad address must not kill the run for every other owner.
      console.warn(
        `[digest] ${owner.email} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return sent;
}
