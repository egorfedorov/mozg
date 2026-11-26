/**
 * The questions people ask, with the answers, in groups.
 *
 * The same rule as everywhere in this folder: double quotes are sentences and
 * are translated, single quotes are names and are left alone.
 *
 * An answer says what is true, including where that is less flattering: what
 * is not tested, what is not built, what cannot be known.
 */

export interface QA {
  q: string;
  a: string;
}

export const FAQ: { group: string; items: QA[] }[] = [
  {
    group: 'product',
    items: [
      {
        q: "Does this mean I should use my agent less?",
        a: "No. It means the parts that matter get a minute of your attention after the agent is done. Most changes are fine to let through. The question is for the ones that would hurt if they were wrong.",
      },
      {
        q: "How does it know whether I read the code?",
        a: "It does not know, and it never claims to. The log records who let each change through: you, for that one change, or a rule. What you understand is measured only by asking you, one question at a time.",
      },
      {
        q: "How long does an explain-back take?",
        a: "About a minute. One question about one change, your answer, and the verdict. A round is two of them.",
      },
      {
        q: "Where does the grading happen?",
        a: "Inside your own Claude Code session. A separate examiner agent, with its own context and no tools, reads the change, the question and your answer. There is no API key, and mozg sends nothing anywhere.",
      },
      {
        q: "Does my agent actually behave differently afterwards?",
        a: "Yes. Where a module is not yours, the agent's first edit there in a session stops and asks you, the way Claude Code asks before any edit. You approve or refuse. It asks once per module per session, and not at all in a module you have explained. In a session started with permissions bypassed there is nobody to ask, so it keeps quiet and counts those changes as unasked.",
      },
      {
        q: "Can I switch the asking off?",
        a: "Yes, on the desk. The agent then runs free everywhere, and the desk still keeps score. The end-of-turn nudge has its own setting.",
      },
      {
        q: "What if I get one wrong?",
        a: "Nothing is lost. The examiner says what your answer was missing, in a few plain sentences, and you get the same question once more. If it is still not there, the module stays on the list for another day. There is no streak to lose and nothing to buy back.",
      },
      {
        q: "Which agents does it read?",
        a: "Claude Code today, including the subagents it starts. Codex and Cursor keep their logs in other shapes; they are next.",
      },
    ],
  },
  {
    group: 'data',
    items: [
      {
        q: "Where do I sign in?",
        a: "Nowhere. There is no account. Your desk is a page on your own machine, opened by the plugin, and the agent reaches mozg through MCP inside that plugin. Nothing to sign into, and nothing about you or your code leaves the machine.",
      },
      {
        q: "Is this for my boss?",
        a: "No. Everything stays in a folder on your machine, and the desk is served on 127.0.0.1 only. There is no account, so there is nothing to share from.",
      },
      {
        q: "Is my code sent to a model?",
        a: "Only during an explain-back, and through your own Claude Code session: the agent shows the change to the model to ask its question, as it shows any edit. mozg itself keeps no code and sends nothing anywhere.",
      },
      {
        q: "What happens when Claude Code deletes its logs?",
        a: "Claude Code keeps its session logs for 30 days and then deletes them. mozg keeps what it read, so your history and your explain-backs stay. Only the text of a change older than that can no longer be shown.",
      },
      {
        q: "Does it work on several projects, or several machines?",
        a: "Several projects on one machine, yes: the desk shows a chip for each. Machines do not sync, because nothing leaves the machine.",
      },
      {
        q: "Which systems does it run on?",
        a: "Wherever Claude Code and Node 20 or newer do. It is built and tested on macOS. Windows and Linux are not tested yet.",
      },
    ],
  },
  {
    group: 'price',
    items: [
      {
        q: "What does it cost?",
        a: "The plugin is free. Each explain-back spends a little of the Claude subscription you already have, on one short examiner call.",
      },
      {
        q: "What is in Pro, and when can I buy it?",
        a: "Pro adds other agents, a check before you push, rules of your own and a report for the week. It is not on sale yet, and every Pro feature on the pricing page is marked planned until it exists.",
      },
      {
        q: "Will it be a subscription?",
        a: "As planned now: five dollars a month, or forty-nine a year. If you cancel, what you have keeps working, because there is no server to pay for.",
      },
    ],
  },
];

/** The names of the groups, as shown above them. */
export const FAQ_GROUP: Record<string, string> = { product: "The product", data: "Data and privacy", price: "Price" };
