/**
 * The documentation, in English.
 *
 * One rule for the whole folder: a string in double quotes is a sentence, and
 * is translated; a string in single quotes is a name, a path, a command or a
 * kind, and is left alone. `npm run i18n:check` reads every double-quoted
 * string here as a sentence, so a paragraph is translated as a paragraph, and
 * a new one is noticed the day it is written.
 *
 * A page is a list of blocks, not JSX: the same blocks are rendered as the
 * page and written out as Markdown, for a reader who wants to copy it and for
 * an agent that wants to read it.
 *
 * Nothing in here may go beyond what the code does. Where a rule is stated,
 * it is stated the way the code has it.
 */

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; id: string; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'code'; code: string; label?: string; said?: boolean }
  | { kind: 'note'; tone: 'info' | 'warn'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'term'; term: string; text: string };

export interface Doc {
  /** Empty for the documentation's own first page. */
  slug: string;
  group: string;
  title: string;
  lede: string;
  blocks: Block[];
}

const p = (text: string): Block => ({ kind: 'p', text });
const h = (id: string, text: string): Block => ({ kind: 'h', id, text });
const list = (...items: string[]): Block => ({ kind: 'list', items });
const steps = (...items: string[]): Block => ({ kind: 'steps', items });
const code = (codeText: string, label?: string): Block => ({ kind: 'code', code: codeText, label });
/** A sample of what mozg says, as against what a person types: shown in the language of the page, as the real line is. */
const said = (text: string, label?: string): Block => ({ kind: 'code', code: text, label, said: true });
const note = (text: string): Block => ({ kind: 'note', tone: 'info', text });
const warn = (text: string): Block => ({ kind: 'note', tone: 'warn', text });
const table = (head: string[], rows: string[][]): Block => ({ kind: 'table', head, rows });
const term = (command: string, text: string): Block => ({ kind: 'term', term: command, text });

export const DOC_GROUPS = ["Getting started", "The desk", "How it decides", "Reference"];

export const DOCS: Doc[] = [
  {
    slug: '',
    group: "Getting started",
    title: "What mozg does",
    lede: "What mozg measures, where it reads from, and what it never says.",
    blocks: [
      h('reads', "What mozg reads"),
      p(
        "mozg reads the session logs that Claude Code already writes on your machine, under ~/.claude/projects. Nothing is installed in your editor, and nothing is sent anywhere. For every file the agent changes, mozg notes the file, the folder it sits in, how many lines changed, and who let it through: you, for that one change, or a rule that did not ask.",
      ),
      list(
        "A module is a top-level folder: src/payments, src/auth, db/migrations. A file at the root of the project belongs to the module (root).",
        "A change is one edit or write by the agent. Its size is the lines it added and removed. Lines in a risky place weigh more, so that they count for more: see What a change weighs.",
        "The log also says who let a change through. You approved it means a person was asked for that change and said yes. Nobody was asked means a rule or a mode let it through.",
        "A change that is only words, like a README or a changelog, is noted and not counted: it is in no score, on no map, and nobody is asked to explain it.",
      ),
      h('yours', "What yours means"),
      p(
        "A module is yours once you have explained a change in it: answered one question about it in your own words, and been graded by an examiner that did not write the code. It stays yours until the agent changes 100 lines or more there, and it comes back for a re-check after 1, 3, 7, 14 and 30 days.",
      ),
      h('number', "The number"),
      p(
        "Ownership today is the share of what the agent changed today, by weighted lines, that sits in modules that are yours. A day with nothing changed shows no number, and says so.",
      ),
      h('not', "What it does not do"),
      list(
        "It does not keep your code. It keeps the path and the size of a change, and goes back to the log for the text only when you are about to explain it.",
        "It does not know whether you read a diff, and never says so.",
        "It does not block. Where it asks, you approve or refuse, and it asks once per module per session.",
      ),
      note(
        "Claude Code deletes its own session logs after 30 days. mozg keeps what it read, so your history stays; the text of a change older than that can no longer be shown.",
      ),
    ],
  },
  {
    slug: 'install',
    group: "Getting started",
    title: "Install",
    lede: "Two lines in Claude Code, and no account.",
    blocks: [
      h('before', "Before you start"),
      list("A recent Claude Code.", "Node 20 or newer on the machine, with node on the PATH.", "A project where the agent has edited files, if you want numbers from the first minute."),
      h('install', "Install"),
      steps("Open Claude Code in any folder.", "Add the marketplace and install the plugin:", "Start a session in a project. At its start mozg reads your earlier sessions, so the desk has a past from the first minute."),
      code('/plugin marketplace add egorfedorov/mozg-plugin\n/plugin install mozg@mozg'),
      h('check', "That it works"),
      p(
        "Say status to your agent. It answers with what you own today. Or say desk, and the desk opens in the browser at http://127.0.0.1:4317. If that port is taken, mozg moves up to the next free one and the agent gives you the address.",
      ),
      h('update', "Update and remove"),
      p("Claude Code updates plugins for you. mozg reads what earlier versions wrote, so updating loses nothing."),
      p("To remove it, uninstall the plugin. To remove everything mozg wrote as well, delete the folder ~/.mozg."),
    ],
  },
  {
    slug: 'first-explain-back',
    group: "Getting started",
    title: "Your first explain-back",
    lede: "One question, your own words, about a minute.",
    blocks: [
      h('turn', "The turn"),
      steps(
        "At the end of a turn that left changes in modules you have not explained, mozg says how many.",
        "Say explain. The agent takes the change with the most at stake and asks you one question about it.",
        "Answer in your own words. Short is fine. If you do not know, say so: that is an answer too.",
        "A separate examiner grades it. Explained makes the module yours. Close and Not yet come with a lesson, and the same question once more.",
      ),
      h('say', "What to say to the agent"),
      term('explain', "One round of two explain-backs. For three, the command /mozg:explain with 3."),
      term('status', "What you own today, what the agent changed, and what is worth explaining."),
      term('map', "Every module the agent touched, and whether it asks or runs free there."),
      term('desk', "Opens the desk in the browser."),
      h('rules', "Three rules the agent keeps"),
      list("It never answers for you.", "It never hints. A hint would measure the hint.", "It passes the examiner's verdict through unchanged, a Not yet included."),
      h('after', "Afterwards"),
      p("The desk shows the question, your answer, the examiner's reason, and on a miss the lesson. A re-check comes back after 1, 3, 7, 14 and 30 days."),
      note("There is nothing to lose. A miss keeps the module on the list and takes nothing from the streak."),
    ],
  },
  {
    slug: 'desk',
    group: "The desk",
    title: "Read your desk",
    lede: "The desk is a page on your own machine: what the agent did, what is yours, and what the agent may do next.",
    blocks: [
      h('open', "Opening it"),
      p(
        "Say desk, or open the address the agent gives you: http://127.0.0.1:4317 by default. The desk is served by the plugin, on 127.0.0.1 only, and refreshes itself while its tab is in front.",
      ),
      h('parts', "Its five parts"),
      list(
        "Today. The score, and what it is made of: how many of the modules the agent touched are yours. What the brain says about it, worked out from the numbers beside it, never written in advance. The one thing to do next, with the words to say to the agent for it. The streak and the count of the week, your modules as squares, and the latest cards.",
        "Modules. One row for each module: how much the agent changed there and who let it through, whether it is yours, and whether the agent asks first or runs free there.",
        "Activity. One card is one verdict and one action: a bug found by explaining, a module that became yours, a change nobody was asked about, a module the agent has rewritten since you explained it, a re-check that is due.",
        "History. Every explain-back, newest first, with the lesson on a miss. The day in lines, to copy into a journal or a pull request.",
        "Settings. The language, whether the agent asks before its first edit in a module that is not yours, the nudge at the end of a turn, and which projects are on the desk.",
      ),
      h('map', "Reading the map"),
      p("The squares on Today are your modules. Orange is not explained, green is yours, blue is due for a re-check, hatched is yours but rewritten since."),
      h('projects', "Several projects"),
      p("The desk shows the project with the newest change. If mozg has seen more than one, a list at the top names the one in front."),
    ],
  },
  {
    slug: 'settings',
    group: "The desk",
    title: "Connection and settings",
    lede: "How mozg is attached to your agent, and the three things you can change.",
    blocks: [
      h('connection', "Connection"),
      p("Each line is something a process wrote down when it happened, or a plain not yet with the thing to do about it. Nothing is probed or guessed."),
      list(
        "Plugin. The name and the version of the installed plugin.",
        "MCP. When the agent last called mozg. If it never has, the line says what to do: open a project in Claude Code and say status.",
        "Hooks. When a session last started with the plugin enabled.",
        "Reading. Which folder is read, how many logs, and whether they have all been read.",
        "Notes. Where mozg keeps its own files, and how much is in them.",
      ),
      h('asks', "The agent asks first"),
      p(
        "On by default. Where a module is not yours, the agent's first edit there in a session stops and asks you. Approve, and that edit goes through. Refuse, and the agent moves on. It asks once per module per session, and never in a module that is yours.",
      ),
      p(
        "Runs free means mozg adds no prompt of its own. The permission settings of the session still apply: where Claude Code asks before every edit, it asks there too.",
      ),
      p(
        "In a session started with --dangerously-skip-permissions or --permission-mode dontAsk there is nobody to ask. There mozg keeps quiet, and those changes count as having gone ahead unasked, which is what happened.",
      ),
      h('nudge', "At the end of a turn"),
      table(["Setting", "What happens"], [
        ["Gentle, the default", "A line at the end of a turn, at most once in 20 minutes."],
        ["Firm", "The agent also offers an explain-back before it stops, once per turn."],
        ["Off", "Nothing is said. The desk still fills in."],
      ]),
      h('projects', "Projects on the desk"),
      p("A hidden project is left off the desk and out of every number on it. Its logs are still read, and nothing is deleted. Show it again any time."),
      h('examiner', "The examiner's model"),
      p("The examiner uses the model of the session it is called in. To pin another one, change the model line in the file agents/mozg-examiner.md inside the plugin."),
    ],
  },
  {
    slug: 'ownership',
    group: "How it decides",
    title: "What makes a module yours",
    lede: "The rules, written out, so that the number can be checked by hand.",
    blocks: [
      h('states', "The states of a module"),
      table(["State", "Meaning", "The agent"], [
        ["Not touched", "The agent has never changed it.", "Asks, the first time"],
        ["Not explained", "The agent has changed it, and nobody has explained it.", "Asks first"],
        ["Yours", "Explained, and the agent has changed fewer than 100 lines there since.", "Runs free"],
        ["Re-check due", "Yours, and the next re-check has arrived.", "Runs free"],
        ["Changed since", "Yours once, and the agent has changed 100 lines or more there since.", "Asks first"],
      ]),
      h('weight', "What a change weighs"),
      p("A line counts for more when a mistake there would hurt more. The weights multiply."),
      table(["Risk", "Seen by"], [
        ["Migration, ×2.5", "A migrations folder, a .sql file, or a statement that alters a table inside code"],
        ["Schema, ×2", "A schema, models, entities or types folder, or a .prisma file"],
        ["Auth, ×2", "A path with auth, login, session, password, oauth, jwt or permission in it"],
        ["Payments, ×2", "A path with payment, billing, checkout, invoice, charge, subscription, wallet or ledger in it"],
        ["Configuration, ×1.5", ".env files, Dockerfiles, package.json, lock files, .github, Makefile"],
        ["Size, ×1.5", "A change of 80 lines or more, wherever it is"],
        ["Tests, ×0.5", "A test file, which counts for less"],
      ]),
      h('today', "Ownership today"),
      p(
        "Add up the weighted lines the agent changed today in modules that are yours. Divide by the weighted lines it changed today in all modules. That is the number. A day the agent changed nothing has no number: it is shown empty, not hidden.",
      ),
      p("A change is offered for an explain-back for seven days. After that it is part of the map, and no longer of the list."),
      h('rechecks', "Re-checks"),
      p("A pass is worth more each time it holds. The next question comes after a day, then three, a week, two weeks, a month. A miss starts again from a day."),
      h('asked', "Who was asked"),
      p("The log records who let each change through. mozg says that, and only that."),
      table(["The desk says", "When the log shows"], [
        ["You approved it", "A person approved that one change."],
        ["Nobody was asked", "A rule or a mode let it through, an always-allow rule made earlier included."],
        ["The log does not say", "There is a timing and no decision, or the session was a subagent's and its main log says nothing."],
      ]),
    ],
  },
  {
    slug: 'gate',
    group: "How it decides",
    title: "The gate",
    lede: "Where a module is not yours, the agent asks before it changes it.",
    blocks: [
      h('how', "How it works"),
      steps(
        "The agent is about to edit a file. Before the edit runs, mozg looks at which module the file is in.",
        "If that module is yours, nothing happens: the edit goes on as it would have.",
        "If it is not yours, the edit waits, and Claude Code asks you with mozg's reason: the module, how much the agent has changed there, and how to make it yours.",
        "You approve or refuse. mozg asks about that module once in this session.",
      ),
      h('reason', "What the reason says"),
      said(
        "mozg asks before this change. src/payments is not explained yet: 3 changes by the agent, none talked through. Approve to let this one through. A one-minute explain-back makes the module yours, and mozg asks once per session.",
        "An edit in a module nobody has explained",
      ),
      h('quiet', "Where it keeps quiet"),
      list(
        "In a module that is yours.",
        "Twice in one session about the same module.",
        "In a session that skips permissions, where nobody can be asked.",
        "In a project you have hidden on the desk.",
        "For a file outside the project, or a tool that changes no file.",
        "When you switch it off on the desk.",
      ),
      h('refused', "If you refuse"),
      p("The agent is told that the edit was refused. It is instructed not to work around it: it offers an explain-back, or moves on."),
      h('cost', "What it costs"),
      p("About a tenth of a second before an edit, nearly all of it starting the check. Nothing is sent anywhere."),
    ],
  },
  {
    slug: 'honesty',
    group: "How it decides",
    title: "What mozg never claims",
    lede: "A tool that guesses attention is worse than one that says it does not know.",
    blocks: [
      h('read', "It never says you did not read a change"),
      p("The log records who approved it. It does not record attention, and so mozg has nothing to say about attention. Timing is shown as timing, and never dressed up as reading."),
      h('attention', "It does not score attention"),
      p("There are no points, no levels, and no score for how long you looked at a diff. The logs cannot show that, and a number made from scrolling would be a lie with a decimal point."),
      h('empty', "An empty day is shown, not hidden"),
      p("A day with nothing to own reads as never measured if it is hidden. So it is not hidden: the number is empty, and the desk says the agent changed nothing."),
      h('brain', "The brain says only what the numbers say"),
      p("Every line beside the mascot is worked out from the numbers on the page. A desk at 48% says so, names what it cannot vouch for, and asks for one explain-back. Nothing in it is written in advance."),
      h('streak', "The streak takes nothing away"),
      p("It counts the days with a passed explain-back. A day without one breaks the run and costs nothing: there is no freeze to buy, and nothing to win back."),
      h('sample', "The sample on the site is a sample"),
      p("The board on the landing is the real desk on a made-up session, built by the same code, and labelled as a sample. Every number on it can be traced to a line of that session."),
    ],
  },
  {
    slug: 'commands',
    group: "Reference",
    title: "Commands and tools",
    lede: "What you say to the agent, and what the agent has behind it.",
    blocks: [
      h('say', "What you can say"),
      term('explain', "One round of two explain-backs, on the changes with the most at stake."),
      term('status', "What you own today, what the agent changed, what is worth explaining, and the streak."),
      term('map', "Every module the agent touched, whether you have explained it, and whether it asks or runs free there."),
      term('desk', "The address of the desk, and the browser opened on it."),
      p("They are plain words: the agent recognises them. They also exist as slash commands, /mozg:explain and so on."),
      h('tools', "What the agent can call"),
      table(["Tool", "What it does"], [
        ['mozg_status', "The ownership number, the streak, and what is worth explaining."],
        ['mozg_next', "The next change to explain: the file, the diff, and where to aim the question."],
        ['mozg_record', "Stores the verdict, the reason, and on a miss the lesson."],
        ['mozg_map', "Every module with its state and its rule."],
        ['mozg_desk', "Starts the desk if it is not running, and gives its address."],
      ]),
      h('examiner', "The examiner"),
      p(
        "The examiner is a subagent with its own context and no tools. It receives the change, the question and your answer, and returns a verdict, a reason, the lines the verdict stands on, and on a miss a lesson. It never talks to you directly, and it did not write the code.",
      ),
      h('agents', "Other agents"),
      p("mozg reads Claude Code today, including the subagents and the workflows it starts. Codex, Cursor and the others keep their logs in other shapes."),
    ],
  },
  {
    slug: 'privacy',
    group: "Reference",
    title: "Privacy and data",
    lede: "What mozg reads, what it writes, and what leaves the machine: nothing.",
    blocks: [
      h('table', "In one table"),
      table([], [
        ["Read", "~/.claude/projects, the session logs, and nothing else"],
        ["Written", "~/.mozg, and nothing else"],
        ["Network", "None. The desk listens on 127.0.0.1 and answers only that address"],
      ]),
      h('files', "The files in ~/.mozg"),
      table(["File", "What it holds"], [
        ["changes.ndjson", "Every change the agent made, one per line: the project, the file, the module, the size, the time, who let it through, and a pointer to its line in the log. No source code."],
        ["state.json", "The explain-backs, where each log has been read to, and the settings."],
        ["pulse-*", "When each part of the plugin last ran."],
        ["lock, reading", "So that several processes take turns."],
      ]),
      h('code', "Source code"),
      p(
        "mozg keeps no source code. When an explain-back is about to start, it reads the lines of the change from the log and shows them to the agent for the question. Of them it keeps only the examiner's short quote.",
      ),
      h('model', "The model"),
      p("During an explain-back the lines of the change go to the model through your own Claude Code session, as any edit does. mozg itself sends nothing anywhere."),
      h('server', "The desk"),
      p(
        "The desk accepts exactly one write, the settings, and guards it three ways: the address has to name the machine, the page has to be a local one, and the body has to be JSON, which a page on another site cannot make a browser send here.",
      ),
      h('site', "The site and the chat"),
      p("The pages of this site are files, and nothing more. One small server of mozg's sits beside them for the chat alone: what you type there is kept on it until you or the operator delete the thread, and an email is kept only once you have confirmed it, so that a reply can reach you."),
      p("The plugin never talks to that server. The desk on your machine does not know it exists."),
      h('forget', "To forget everything"),
      p("Delete ~/.mozg. Uninstall the plugin, and nothing is left."),
    ],
  },
  {
    slug: 'troubleshooting',
    group: "Reference",
    title: "Troubleshooting",
    lede: "When a line on the desk says not yet, this is what to do.",
    blocks: [
      h('nothing', "mozg has not seen the agent change anything"),
      list("Open a project in Claude Code and let the agent edit a file. The desk fills in on its own.", "Check that the plugin is enabled, with /plugin."),
      h('mcp', "MCP: no call from the agent yet"),
      p("Say status to the agent inside a project. If it does not know the tool, the plugin is disabled, or Claude Code could not start the server: it needs Node 20 or newer on the PATH."),
      h('hooks', "Hooks: no session has started"),
      p("The hooks run only in a session started after the plugin was enabled. Start a new one."),
      h('reading', "Reading: still reading older sessions"),
      p("A machine with a long history takes a moment. mozg reads the newest first and finishes the rest in the background, and the line changes to all read when it is done."),
      h('gate', "The gate does not ask"),
      list("The module is already yours.", "It has already asked about that module in this session.", "The session skips permissions.", "Asking is switched off on the desk."),
      h('much', "The gate asks too much"),
      p("Explain the modules it asks about: each one then runs free. Or switch it off under Connection and settings. The desk keeps score either way."),
      h('port', "The desk is not at the address given"),
      p("Another program had the port, and mozg moved up to the next free one. Say desk, and the agent gives the right address."),
      h('node', "Node is missing or too old"),
      p("mozg needs Node 20 or newer. Run node --version to see which one is installed."),
      h('report', "Something else"),
      warn("Open an issue on github.com/egorfedorov/mozg with the line from Connection that says not yet. Do not paste session logs: they hold your code."),
    ],
  },
];

/** The page at a path, with the documentation's first page for the empty path. */
export function docAt(slug: string): Doc | null {
  return DOCS.find((doc) => doc.slug === slug.replace(/^\/+|\/+$/g, "")) ?? null;
}

/** The page before and the page after, in the order of the sidebar. */
export function neighbours(doc: Doc): { previous: Doc | null; next: Doc | null } {
  const at = DOCS.indexOf(doc);
  return { previous: DOCS[at - 1] ?? null, next: DOCS[at + 1] ?? null };
}

/** Every path a documentation page lives at. */
export const DOC_PATHS: string[] = DOCS.map((doc) => (doc.slug ? `/docs/${doc.slug}/` : '/docs/'));
