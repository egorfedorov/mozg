---
description: A one-minute explain-back on the riskiest change your agent left in a module you have not explained
argument-hint: [how many, default 2]
---

Run an explain-back session: $1 rounds if a number is given, otherwise two.

For each round:

1. Call `mozg_next`. It returns one change: the file, the diff, and where to aim the question.
2. Ask the user ONE question about that change, in your own words and in the language the user writes to you in (the tool's text may be in another). Then stop and wait for the answer. Do not answer it yourself, do not hint, do not explain the code first, and do not ask two questions at once.
3. When the user answers, grade it with the `mozg-examiner` subagent. Pass it the change's diff, the question, and the answer exactly as the person gave it, and name the language the answer is in: the examiner writes its verdict in that language.
4. Call `mozg_record` with the change id, the question, the answer, and the examiner's verdict: `verdict`, `why`, `evidence`, `lesson`, `bug_found`, `bug_note`. The lesson is the desk's record of what a miss taught, so pass it whenever the examiner gave one. Pass the verdict as the examiner gave it. Do not soften a `not_yet`, and do not skip the record because the answer was short.
5. Tell the user the result in one or two sentences, in your own words and in their language: what is theirs now, or what was missing, and any bug that turned up.

If the verdict was not a pass, `mozg_record` asks you to teach once. Tell the user what the answer was missing in two or three plain sentences, without judging them. Ask the SAME question again, and record the new answer and verdict. Two answers at most per round: if `mozg_record` then says to stop, start the next round.

Then start the next round.

If the user says they have no time, or declines, stop after the current step. Nothing is lost: the module stays on the list.
If `mozg_next` says nothing is worth explaining, say so and stop.
