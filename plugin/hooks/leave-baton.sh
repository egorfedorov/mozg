#!/usr/bin/env bash
# Runs just before the context is compacted: the last moment at which the
# session still remembers what it was doing.
#
# This is the gap the handoff table was built for and nothing was closing. An
# agent leaves a baton when it *decides* to stop — but the far more common
# ending is not a decision: the context fills up, compaction takes the working
# state, and what survives is a summary written for continuing the conversation
# rather than for a different agent on a different machine tomorrow. Nobody
# thinks to leave a baton at the moment they are about to lose the reason to.
#
# So: say it here, once, offline, in two lines. No network, no state, no
# opinion about whether the work is worth a baton — the agent knows that and
# this hook cannot.
#
# Silent unless this project actually has brains on its shelf. A reminder to
# use a tool the agent has no brain for is pure noise, and noise at compaction
# time is the most expensive noise there is.
set -u

[ -f .mozg/brains.md ] || exit 0
grep -q '^- ' .mozg/brains.md 2>/dev/null || exit 0

# The first shelf handle, so the reminder names a real brain rather than a
# placeholder the agent has to go and resolve.
brain=$(sed -n 's/^- \([^ ]*\).*/\1/p' .mozg/brains.md | head -1)

cat <<EOF
mozg: this context is about to be compacted — working state is what compaction
loses first. If this session is mid-task, leave a baton before it goes:
brain_handoff {"brain": "${brain:-<handle>}", "action": "leave", "title": "…", "context": "status, decisions made, next step, file paths"}
Write the context for an agent with zero memory of today. Durable lessons go to
brain_write instead; batons are working state and expire in 7 days. If the task
is finished, or nothing is in flight, ignore this.
EOF
exit 0
