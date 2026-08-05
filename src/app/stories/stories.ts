/**
 * The five stories, as data.
 *
 * Kept out of the page so the writing can be edited without touching layout, and
 * so the index at the top of the page cannot drift from the articles below it —
 * both read this list.
 *
 * Rules for anything added here: a real starting point (something the person
 * already has), steps that name actual product surfaces, and an honest limit.
 * A sixth story that cannot manage all three does not belong on this page.
 */

export type StoryArtKind = "style" | "closed" | "platform" | "maintainer" | "agency";

export interface Story {
  id: string;
  who: string;
  title: string;
  oneLine: string;
  accent: string;
  art: StoryArtKind;
  body: string[];
  /**
   * The same request, answered twice.
   *
   * This is the whole argument in three lines, and it is the part readers
   * actually understand: somebody asks for something in their own words, an
   * agent without the brain gives the average answer, and an agent with it
   * proposes the thing a professional would — naming a term the asker did not
   * know existed. A page of prose cannot do what one of these does.
   */
  moment: { ask: string; without: string; withBrain: string };
  steps: string[];
  limit: string;
}

export const STORIES: Story[] = [
  {
    id: "the-artist",
    who: "An artist, a teacher, anyone with a method",
    title: "He sold the method, not the paintings",
    oneLine: "A style becomes a brain, and the brain earns while he sleeps",
    accent: "var(--color-riso-red)",
    art: "style",
    body: [
      "Picasso could paint a Picasso in an afternoon. What took a lifetime was the method behind it — how a figure gets broken into planes, when a colour is allowed to lie, which rules to violate and in what order. He sold canvases. The method he could only give away in a studio, one apprentice at a time.",
      "The modern version of that person has the same asset and the same problem. They have a way of working — how they light a scene, how they name things in code, how they structure a lesson, what makes their game feel like theirs — and it lives in their head and in a folder of examples. Models trained on the whole internet produce the average of everyone. The average is exactly what they are paid not to make.",
      "So they turn the method into a brain: not the artefacts, the decisions behind them. Each rule becomes a note with its reason attached; each example becomes a note whose body is the working thing, kept whole. Then they price it. Anyone who buys it points their own agent at it and gets work made the way they make it — and the exam score on the page is the proof that the brain actually holds the method rather than a description of it.",
      "Ninety-five per cent of every sale goes to the author. The brain keeps being theirs, keeps being updated by them, and stops being a thing that can only be taught in a room.",
    ],
    moment: {
      ask: "\"Draw the key art for my level. I do not know how to describe what I want, just make it look like the rest of the game.\"",
      without:
        "A competent illustration that could belong to any game: even lighting, a smooth gradient sky, every figure whole and symmetrical. It looks like the average of every image ever made, because that is what it is.",
      withBrain:
        "It searches the method first and comes back with the rules by name: one broken plane per figure, warm rim light on the subject only, background cooled two steps, no gradients — the studio bans them. Then it draws to those rules and says which ones it applied, so the artist can argue with a decision instead of with a picture.",
    },
    steps: [
      "brain_create with a goal written as the question a buyer will ask: not \"my style\" but \"answer how to compose, light and colour a scene the way this studio does\".",
      "Feed it what already exists: /mozg:train reads your notes, briefs and finished work from a local folder on your own CLI subscription — the material never leaves your machine, only the distilled notes do.",
      "Sit the exam. The score and the list of failed questions tell you which parts of your method you have never actually written down; that list is your next hour of work.",
      "Price it on the brain's page, publish, and the catalogue does the rest. Buyers connect it over MCP; you keep 95% and keep editing it.",
    ],
    limit:
      "A brain teaches decisions, not hands. It will make another person's agent choose the way you choose — it will not reproduce a signature, and it cannot stop a buyer from learning from what they bought. That is what teaching has always been.",
  },
  {
    id: "the-closed-company",
    who: "A company with software nobody outside has ever seen",
    title: "They taught the AI their own program, and it never left the building",
    oneLine: "Internal documentation as a private brain, on their own key",
    accent: "var(--color-riso-blue)",
    art: "closed",
    body: [
      "An internal system has one manual, three people who really understand it, and forty who ask them questions. The AI everybody now has on their desk is useless here by definition: the program was never on the internet, so no model has ever seen it. Every answer it gives about the system is invented, confidently.",
      "The manual is not the problem — they have one. The problem is that it is a hundred pages nobody reads, and its answers cannot be found in the two minutes an engineer actually has. Pasting it into a chat costs the whole context window and still loses the one paragraph that mattered.",
      "So it becomes a private brain. The docs, the runbooks, the decisions made in tickets, the conventions that exist only in code review — all of it distilled into notes and searchable by every agent the company connects. Private means private: the brain is not in the catalogue, cannot be found, and is readable only by the addresses invited to it.",
      "Two paths for keeping the material inside. Teach it locally, where an agent on the company's own subscription reads the documents on a company machine and only finished notes cross the wire; or set the company's own API key so the extraction runs against their provider and their contract rather than ours. Either way the brain answers the forty people, and the three stop being a helpdesk.",
    ],
    moment: {
      ask: "\"Billing failed with error 42 for this customer. What do I do?\"",
      without:
        "A confident paragraph about HTTP status codes and generic retry advice. Error 42 exists only inside this company, so every word of it is invention — and it reads exactly like knowledge.",
      withBrain:
        "\"42 is the retry queue being full — it is not the customer's card. The runbook says: check the queue depth first, drain it with the maintenance job, and only then re-run the invoice. It also warns that re-running before draining double-charges, which happened in March.\" A new engineer just answered like the third person who knows the system.",
    },
    steps: [
      "Create the brain private (the default) and write the goal as the question the team keeps asking: \"answer how our billing service behaves — the endpoints, the retry rules, the fields nobody documents\".",
      "Teach it without uploading raw material: /mozg:train in the repository, on your own agent subscription. Only the notes are sent, and every note is scanned for secrets and PII on the way in and again at publication.",
      "Or, if you would rather paste URLs and let it read: settings → your own API key, and the extraction runs on your provider under your agreement.",
      "Invite the team by email address; each person connects their own agent with their own token, so removing somebody removes only their access.",
      "Self-hosting is the strict version: the whole thing runs in your own Docker, with your database and no outside dependency at all.",
    ],
    limit:
      "Nothing here makes a compliance decision for you. The extraction step calls a model unless you teach locally, so if your rule is \"no third party ever sees this text\", teach locally or self-host — and read docs/SELFHOST.md before promising anybody it is airtight.",
  },
  {
    id: "shipping-a-game",
    who: "A studio shipping on somebody else's platform",
    title: "The platform changed its API. The brain noticed; the model did not",
    oneLine: "Platform docs plus house conventions, both scored, both current",
    accent: "var(--color-riso-green)",
    art: "platform",
    body: [
      "Shipping a slot game on a platform like Stake Engine means living inside somebody else's contract: a wallet API with exact endpoint shapes, a maths package that must validate before it uploads, an approval checklist that fails a build for a missing disclaimer. All of it documented, all of it moving.",
      "An agent asked about that platform answers from training data. Training data has a date, and platform docs changed after it — so the endpoint it confidently writes is last year's, the maths file it generates fails validation for a field that got renamed, and the studio finds out during submission.",
      "Two brains fix it, and they are different in kind. One holds the platform: built from the documentation repository, re-read when pages change, split so a question about the wallet lands in the wallet brain rather than competing with the frontend guide. The other holds the studio: the conventions, the pitfalls hit twice, the reason a mechanic was cut — the knowledge that exists nowhere but in the team.",
      "The agent asks before it guesses, and the brain says what it does not know. That second part is the one that saves a submission: a gap list is an honest \"check the docs yourself here\", where a model's silence is not.",
    ],
    moment: {
      ask: "\"When two scatters land, the spin should feel more exciting. I do not know how these games do that — make it good.\"",
      without:
        "A screen shake and a louder sound on the win, added after the reels have already stopped. It has no idea that the excitement in a slot happens *before* the outcome, so the moment it was asked about is the one moment it leaves empty.",
      withBrain:
        "It searches the platform and studio brains and comes back with the name of the thing: anticipation. \"With two scatters visible, the remaining reel slows and its anticipation animation plays until it stops — that is where the tension lives. Your studio brain says anticipation only fires from the third reel on and never on a guaranteed loss, and the platform's event contract wants it emitted as its own event so the frontend can play it during the spin.\" Then it builds that. The person who asked had never heard the word, and got what a veteran would have specified.",
    },
    steps: [
      "Take the platform brain from the catalogue — the official docs are already there, free, with a score and a gap list. library_add puts it on your shelf from the CLI.",
      "Create your own studio brain beside it, and let the agent write to it as you work: brain_write saves the convention you just settled, brain_feedback flags a note that turned out to be wrong.",
      "Run /mozg:sync so the project carries a map of both, and every session starts knowing they exist without spending a call to find out.",
      "When the platform ships a change, /mozg:update re-reads its pages; only the pages that actually changed cost anything, and the notes from an old page are superseded rather than deleted so you can see what it used to say.",
    ],
    limit:
      "A brain scoring 70% is right about seven questions in ten and honest about the rest — it is not a substitute for reading the approval checklist before you submit. Use the gap list as the list of things to verify by hand.",
  },
  {
    id: "the-maintainer",
    who: "Whoever maintains a library or a set of docs",
    title: "Every question her docs could not answer arrived as a list",
    oneLine: "The exam turns real agent searches into a documentation roadmap",
    // Not yellow: #ffe800 as text on paper is invisible, and this accent is used
    // for an eyebrow and a quote rule, not a fill.
    accent: "var(--ink)",
    art: "maintainer",
    body: [
      "A maintainer's documentation is judged by a reader she never meets, and now most of those readers are agents. She has no idea which page confused them, which answer they invented instead, or which question her docs simply do not contain.",
      "Publishing her docs as a brain changes what she can see. The brain sits its own exam — questions generated from the goal, graded against what retrieval actually returns — so the score is a measurement of her documentation, not of her writing. Failures come back classified: material that is absent, a page too thin to answer, an answer that exists but ranks below something adjacent. Three different fixes, named.",
      "Then the readers add to it. When an agent searches the brain and gets nothing useful, that query becomes an exam question — so the next sitting measures what people actually asked and could not get. A corrections trickle in from agents that found a note contradicting reality, and she reviews them like pull requests.",
      "The public score and gap list do something else, too: they tell a developer deciding whether to trust the brain exactly how far to trust it. Nobody has to take her word for it.",
    ],
    moment: {
      ask: "\"Configure the cache the way this library wants it. I am following a blog post from last year.\"",
      without:
        "The option name from that blog post, which was renamed two releases ago. The code runs, the cache silently does nothing, and the developer blames the library — then opens an issue that costs the maintainer an hour.",
      withBrain:
        "The current option, its type and its default, quoted from today's docs, plus the sentence that saves the issue: \"the old name still parses and is ignored, which is why your cache looked configured\". And when the docs genuinely do not cover something, the brain says so instead of guessing — the maintainer sees that question appear in her gap list.",
    },
    steps: [
      "Point brain_add_source at the docs repository or the site root, and let the crawler read the source markdown rather than the rendered shell — API tables arrive as data instead of as pictures of tables.",
      "Write the goal as the promise you want measured. The exam is generated from it, so \"answer configuration questions with the exact option name, type and default\" produces a harder and more useful exam than \"be about my library\".",
      "Publish it. Free is fine and normal — the catalogue is free — and the score plus the gap list are on the page for anyone to read.",
      "Work the gap list like an issue tracker: absent material wants a source, a thin note wants deepening, a ranking problem wants the question's own words in the note.",
    ],
    limit:
      "The exam measures whether an answer can be retrieved, not whether your library is well designed. A brain at 95% on bad docs means the bad docs are consistently findable.",
  },
  {
    id: "the-agency",
    who: "An agency, a consultancy, anyone with many clients",
    title: "Twelve projects, twelve brains, no more onboarding by shoulder-tap",
    oneLine: "Conventions that outlive staff turnover and every context reset",
    accent: "var(--color-riso-red)",
    art: "agency",
    body: [
      "An agency's real product is context. Twelve clients, twelve stacks, twelve sets of rules about naming, deployment, and which library is banned because of an incident three years ago. A new developer learns it by asking someone; an agent never learns it at all, which is why its first pull request always looks like a stranger wrote it.",
      "One brain per project fixes both. It is filled as work happens rather than in a documentation sprint: when a convention gets settled in review, the agent writes the note; when a pitfall costs an afternoon, the agent writes the note. Nobody sets aside a Friday for it.",
      "The value shows up at the seams. A developer joining reads the brain instead of a person's memory. An agent starting a session searches it instead of guessing. A project going dormant for six months comes back with its reasoning intact — and when it ends for good, the whole brain exports as a CLAUDE.md or an AGENTS.md the client keeps, with no account and no subscription.",
    ],
    moment: {
      ask: "\"Add a delete endpoint to this client's API.\"",
      without:
        "A textbook handler: 204 on success, a bare error string, a library the client banned after an incident, and no audit row. Every line is defensible in general and wrong here — and it takes a reviewer twenty minutes to explain why, again.",
      withBrain:
        "The client's own shape: soft delete because nothing is ever really deleted in this system, the house error envelope with its code list, an audit row written in the same transaction, and the banned library avoided with the reason attached. The pull request looks like the team wrote it, because the team's reasoning is what it read.",
    },
    steps: [
      "One brain per project, named after it, with a goal describing the project's own rules rather than its technology.",
      "Let the work fill it: brain_write from the agent whenever a convention is settled, /mozg:teach when the knowledge is in somebody's head and needs interviewing out of it.",
      "Share by email to the people on that project; each connects their own agent with their own token, and access ends when the person does.",
      "On handover, export the brain as CLAUDE.md, AGENTS.md or a Claude Skill. The client keeps a file that works with no account — and if they ever want it live again, the brain is still here.",
    ],
    limit:
      "Twelve brains is twelve things to keep current. A brain nobody has taught in three months has an old score and says so, which is better than a stale context file — but it is still stale, and the honest move is to retire it rather than let an agent trust it.",
  },
];
