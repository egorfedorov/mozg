---
description: Interview the user to close a brain's exam gaps, and write the answers in
argument-hint: <brain handle>
---

The brain named by `$1` fails part of its exam — and for knowledge that lives
in the user's head rather than in any document, the only way in is asking.

1. Call `brain_brief` on `$1` and read the **known gaps**. If there are none,
   say the brain passes everything and stop.
2. Pick the 3–5 most central gaps and interview the user about them, one
   question at a time, in plain language: "What does your webhook retry
   policy actually do?" Follow up until you have the concrete values — names,
   numbers, orders, rules — not vibes.
3. After each answered topic, save it with `brain_write`: a searchable title,
   the user's answer restated as a self-contained fact, the right kind
   (usually `rule` or `fact`), a category matching the gap's category.
4. Skip anything the user says they don't know or want to skip — write down
   nothing invented.
5. Close by listing what was saved and telling the user the exam re-runs on
   its own; the score should move on the next sitting.

Ten minutes of this turns "the brain fails 6 questions" into "the brain holds
six facts nobody had ever written down" — which is the whole point.
