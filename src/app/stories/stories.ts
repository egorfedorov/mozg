import { msg } from "@/lib/msg";
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

export type StoryArtKind =
  | "style"
  | "closed"
  | "platform"
  | "maintainer"
  | "agency"
  | "solo"
  | "everywhere";

export interface Story {
  id: string;
  who: string;
  /**
   * The person the story is about.
   *
   * Composites, and the page says so out loud — inventing a customer and quoting
   * them would be a fabricated testimonial, which is a different thing from a
   * worked example. What makes a persona useful is that the problem and the
   * resolution are concrete enough to recognise yourself in.
   */
  person: {
    name: string;
    role: string;
    /** The sentence they would say before. */
    problem: string;
    /** What changed, in the same voice. */
    resolution: string;
    /** File in /public/stories. */
    portrait: string;
  };
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
    who: msg("An artist, a teacher, anyone with a method"),
    title: msg("He sold the method, not the paintings"),
    person: {
      name: "Íris",
      role: msg("illustrator and art director, twenty years of it"),
      problem:
        msg("\u201cI can teach my method to one apprentice at a time, and I have run out of time. Every generator gives me the average of everyone, which is exactly what my clients pay me not to be.\u201d"),
      resolution:
        msg("\u201cThe method is a brain now. It scored 84%, which told me which of my own rules I had never actually written down. People buy it, their agents work the way I work, and I keep 95%.\u201d"),
      portrait: "/stories/artist.webp",
    },
    oneLine: msg("A style becomes a brain, and the brain earns while he sleeps"),
    accent: "var(--color-riso-red)",
    art: "style",
    body: [
      msg("Picasso could paint a Picasso in an afternoon. What took a lifetime was the method behind it — how a figure gets broken into planes, when a colour is allowed to lie, which rules to violate and in what order. He sold canvases. The method he could only give away in a studio, one apprentice at a time."),
      msg("The modern version of that person has the same asset and the same problem. They have a way of working — how they light a scene, how they name things in code, how they structure a lesson, what makes their game feel like theirs — and it lives in their head and in a folder of examples. Models trained on the whole internet produce the average of everyone. The average is exactly what they are paid not to make."),
      msg("So they turn the method into a brain: not the artefacts, the decisions behind them. Each rule becomes a note with its reason attached; each example becomes a note whose body is the working thing, kept whole. Then they price it. Anyone who buys it points their own agent at it and gets work made the way they make it — and the exam score on the page is the proof that the brain actually holds the method rather than a description of it."),
      msg("Ninety-five per cent of every sale goes to the author. The brain keeps being theirs, keeps being updated by them, and stops being a thing that can only be taught in a room."),
    ],
    moment: {
      ask: msg("\"Draw the key art for my level. I do not know how to describe what I want, just make it look like the rest of the game.\""),
      without:
        msg("A competent illustration that could belong to any game: even lighting, a smooth gradient sky, every figure whole and symmetrical. It looks like the average of every image ever made, because that is what it is."),
      withBrain:
        msg("It searches the method first and comes back with the rules by name: one broken plane per figure, warm rim light on the subject only, background cooled two steps, no gradients — the studio bans them. Then it draws to those rules and says which ones it applied, so the artist can argue with a decision instead of with a picture."),
    },
    steps: [
      msg("brain_create with a goal written as the question a buyer will ask: not \"my style\" but \"answer how to compose, light and colour a scene the way this studio does\"."),
      msg("Feed it what already exists: /mozg:train reads your notes, briefs and finished work from a local folder on your own CLI subscription — the material never leaves your machine, only the distilled notes do."),
      msg("Sit the exam. The score and the list of failed questions tell you which parts of your method you have never actually written down; that list is your next hour of work."),
      msg("Price it on the brain's page, publish, and the catalogue does the rest. Buyers connect it over MCP; you keep 95% and keep editing it."),
    ],
    limit:
      msg("A brain teaches decisions, not hands. It will make another person's agent choose the way you choose — it will not reproduce a signature, and it cannot stop a buyer from learning from what they bought. That is what teaching has always been."),
  },
  {
    id: "the-closed-company",
    who: msg("A company with software nobody outside has ever seen"),
    title: msg("They taught the AI their own program, and it never left the building"),
    person: {
      name: "Marek",
      role: msg("platform lead at a 200-person insurer"),
      problem:
        msg("\u201cOur billing service was never on the internet, so every answer the AI gives about it is invented \u2014 confidently. Three people know how it really works and they spend their day being a helpdesk.\u201d"),
      resolution:
        msg("\u201cThe manual, the runbooks and the ticket decisions are one private brain, taught from our own machines. Forty people ask it instead of asking them. Nothing raw left the building.\u201d"),
      portrait: "/stories/company.webp",
    },
    oneLine: msg("Internal documentation as a private brain, on their own key"),
    accent: "var(--color-riso-blue)",
    art: "closed",
    body: [
      msg("An internal system has one manual, three people who really understand it, and forty who ask them questions. The AI everybody now has on their desk is useless here by definition: the program was never on the internet, so no model has ever seen it. Every answer it gives about the system is invented, confidently."),
      msg("The manual is not the problem — they have one. The problem is that it is a hundred pages nobody reads, and its answers cannot be found in the two minutes an engineer actually has. Pasting it into a chat costs the whole context window and still loses the one paragraph that mattered."),
      msg("So it becomes a private brain. The docs, the runbooks, the decisions made in tickets, the conventions that exist only in code review — all of it distilled into notes and searchable by every agent the company connects. Private means private: the brain is not in the catalogue, cannot be found, and is readable only by the addresses invited to it."),
      msg("Two paths for keeping the material inside. Teach it locally, where an agent on the company's own subscription reads the documents on a company machine and only finished notes cross the wire; or set the company's own API key so the extraction runs against their provider and their contract rather than ours. Either way the brain answers the forty people, and the three stop being a helpdesk."),
    ],
    moment: {
      ask: msg("\"Billing failed with error 42 for this customer. What do I do?\""),
      without:
        msg("A confident paragraph about HTTP status codes and generic retry advice. Error 42 exists only inside this company, so every word of it is invention — and it reads exactly like knowledge."),
      withBrain:
        msg("\"42 is the retry queue being full — it is not the customer's card. The runbook says: check the queue depth first, drain it with the maintenance job, and only then re-run the invoice. It also warns that re-running before draining double-charges, which happened in March.\" A new engineer just answered like the third person who knows the system."),
    },
    steps: [
      msg("Create the brain private (the default) and write the goal as the question the team keeps asking: \"answer how our billing service behaves — the endpoints, the retry rules, the fields nobody documents\"."),
      msg("Teach it without uploading raw material: /mozg:train in the repository, on your own agent subscription. Only the notes are sent, and every note is scanned for secrets and PII on the way in and again at publication."),
      msg("Or, if you would rather paste URLs and let it read: settings → your own API key, and the extraction runs on your provider under your agreement."),
      msg("Invite the team by email address; each person connects their own agent with their own token, so removing somebody removes only their access."),
      msg("Self-hosting is the strict version: the whole thing runs in your own Docker, with your database and no outside dependency at all."),
    ],
    limit:
      msg("Nothing here makes a compliance decision for you. The extraction step calls a model unless you teach locally, so if your rule is \"no third party ever sees this text\", teach locally or self-host — and read docs/SELFHOST.md before promising anybody it is airtight."),
  },
  {
    id: "shipping-a-game",
    who: msg("A studio shipping on somebody else's platform"),
    title: msg("The platform changed its API. The brain noticed; the model did not"),
    person: {
      name: "Dima",
      role: msg("slot developer, two-person studio"),
      problem:
        msg("\u201cThe platform's docs move weekly and the model answers from last year. I found out during submission, which is the most expensive place to find out.\u201d"),
      resolution:
        msg("\u201cPlatform brain from the catalogue, studio brain of our own. The agent asks before it guesses \u2014 and it proposed anticipation on the third reel before I knew the word.\u201d"),
      portrait: "/stories/studio.webp",
    },
    oneLine: msg("Platform docs plus house conventions, both scored, both current"),
    accent: "var(--color-riso-green)",
    art: "platform",
    body: [
      msg("Shipping a slot game on a platform like Stake Engine means living inside somebody else's contract: a wallet API with exact endpoint shapes, a maths package that must validate before it uploads, an approval checklist that fails a build for a missing disclaimer. All of it documented, all of it moving."),
      msg("An agent asked about that platform answers from training data. Training data has a date, and platform docs changed after it — so the endpoint it confidently writes is last year's, the maths file it generates fails validation for a field that got renamed, and the studio finds out during submission."),
      msg("Two brains fix it, and they are different in kind. One holds the platform: built from the documentation repository, re-read when pages change, split so a question about the wallet lands in the wallet brain rather than competing with the frontend guide. The other holds the studio: the conventions, the pitfalls hit twice, the reason a mechanic was cut — the knowledge that exists nowhere but in the team."),
      msg("The agent asks before it guesses, and the brain says what it does not know. That second part is the one that saves a submission: a gap list is an honest \"check the docs yourself here\", where a model's silence is not."),
    ],
    moment: {
      ask: msg("\"When two scatters land, the spin should feel more exciting. I do not know how these games do that — make it good.\""),
      without:
        msg("A screen shake and a louder sound on the win, added after the reels have already stopped. It has no idea that the excitement in a slot happens *before* the outcome, so the moment it was asked about is the one moment it leaves empty."),
      withBrain:
        msg("It searches the platform and studio brains and comes back with the name of the thing: anticipation. \"With two scatters visible, the remaining reel slows and its anticipation animation plays until it stops — that is where the tension lives. Your studio brain says anticipation only fires from the third reel on and never on a guaranteed loss, and the platform's event contract wants it emitted as its own event so the frontend can play it during the spin.\" Then it builds that. The person who asked had never heard the word, and got what a veteran would have specified."),
    },
    steps: [
      msg("Take the platform brain from the catalogue — the official docs are already there, free, with a score and a gap list. library_add puts it on your shelf from the CLI."),
      msg("Create your own studio brain beside it, and let the agent write to it as you work: brain_write saves the convention you just settled, brain_feedback flags a note that turned out to be wrong."),
      msg("Run /mozg:sync so the project carries a map of both, and every session starts knowing they exist without spending a call to find out."),
      msg("When the platform ships a change, /mozg:update re-reads its pages; only the pages that actually changed cost anything, and the notes from an old page are superseded rather than deleted so you can see what it used to say."),
    ],
    limit:
      msg("A brain scoring 70% is right about seven questions in ten and honest about the rest — it is not a substitute for reading the approval checklist before you submit. Use the gap list as the list of things to verify by hand."),
  },
  {
    id: "the-maintainer",
    who: msg("Whoever maintains a library or a set of docs"),
    title: msg("Every question her docs could not answer arrived as a list"),
    person: {
      name: "Ada",
      role: msg("maintainer of a mid-sized open-source library"),
      problem:
        msg("\u201cI cannot see which page confused a reader, and most of my readers are agents now. They invent an answer, then open an issue that costs me an hour.\u201d"),
      resolution:
        msg("\u201cThe brain sits an exam on my docs and classifies every failure. Searches that found nothing become questions. My roadmap arrives as a list instead of as issues.\u201d"),
      portrait: "/stories/maintainer.webp",
    },
    oneLine: msg("The exam turns real agent searches into a documentation roadmap"),
    // Not yellow: #ffe800 as text on paper is invisible, and this accent is used
    // for an eyebrow and a quote rule, not a fill.
    accent: "var(--ink)",
    art: "maintainer",
    body: [
      msg("A maintainer's documentation is judged by a reader she never meets, and now most of those readers are agents. She has no idea which page confused them, which answer they invented instead, or which question her docs simply do not contain."),
      msg("Publishing her docs as a brain changes what she can see. The brain sits its own exam — questions generated from the goal, graded against what retrieval actually returns — so the score is a measurement of her documentation, not of her writing. Failures come back classified: material that is absent, a page too thin to answer, an answer that exists but ranks below something adjacent. Three different fixes, named."),
      msg("Then the readers add to it. When an agent searches the brain and gets nothing useful, that query becomes an exam question — so the next sitting measures what people actually asked and could not get. A corrections trickle in from agents that found a note contradicting reality, and she reviews them like pull requests."),
      msg("The public score and gap list do something else, too: they tell a developer deciding whether to trust the brain exactly how far to trust it. Nobody has to take her word for it."),
    ],
    moment: {
      ask: msg("\"Configure the cache the way this library wants it. I am following a blog post from last year.\""),
      without:
        msg("The option name from that blog post, which was renamed two releases ago. The code runs, the cache silently does nothing, and the developer blames the library — then opens an issue that costs the maintainer an hour."),
      withBrain:
        msg("The current option, its type and its default, quoted from today's docs, plus the sentence that saves the issue: \"the old name still parses and is ignored, which is why your cache looked configured\". And when the docs genuinely do not cover something, the brain says so instead of guessing — the maintainer sees that question appear in her gap list."),
    },
    steps: [
      msg("Point brain_add_source at the docs repository or the site root, and let the crawler read the source markdown rather than the rendered shell — API tables arrive as data instead of as pictures of tables."),
      msg("Write the goal as the promise you want measured. The exam is generated from it, so \"answer configuration questions with the exact option name, type and default\" produces a harder and more useful exam than \"be about my library\"."),
      msg("Publish it. Free is fine and normal — the catalogue is free — and the score plus the gap list are on the page for anyone to read."),
      msg("Work the gap list like an issue tracker: absent material wants a source, a thin note wants deepening, a ranking problem wants the question's own words in the note."),
    ],
    limit:
      msg("The exam measures whether an answer can be retrieved, not whether your library is well designed. A brain at 95% on bad docs means the bad docs are consistently findable."),
  },
  {
    id: "the-agency",
    who: msg("An agency, a consultancy, anyone with many clients"),
    title: msg("Twelve projects, twelve brains, no more onboarding by shoulder-tap"),
    person: {
      name: "Noor",
      role: msg("technical lead at a twelve-client agency"),
      problem:
        msg("\u201cOur real product is context, and it lives in people's heads. Every new developer learns it by tapping a shoulder, and every agent session starts as a stranger.\u201d"),
      resolution:
        msg("\u201cOne brain per project, filled as the work happens. A dormant project comes back with its reasoning intact, and a finished one leaves as a file the client keeps.\u201d"),
      portrait: "/stories/agency.webp",
    },
    oneLine: msg("Conventions that outlive staff turnover and every context reset"),
    accent: "var(--color-riso-red)",
    art: "agency",
    body: [
      msg("An agency's real product is context. Twelve clients, twelve stacks, twelve sets of rules about naming, deployment, and which library is banned because of an incident three years ago. A new developer learns it by asking someone; an agent never learns it at all, which is why its first pull request always looks like a stranger wrote it."),
      msg("One brain per project fixes both. It is filled as work happens rather than in a documentation sprint: when a convention gets settled in review, the agent writes the note; when a pitfall costs an afternoon, the agent writes the note. Nobody sets aside a Friday for it."),
      msg("The value shows up at the seams. A developer joining reads the brain instead of a person's memory. An agent starting a session searches it instead of guessing. A project going dormant for six months comes back with its reasoning intact — and when it ends for good, the whole brain exports as a CLAUDE.md or an AGENTS.md the client keeps, with no account and no subscription."),
    ],
    moment: {
      ask: msg("\"Add a delete endpoint to this client's API.\""),
      without:
        msg("A textbook handler: 204 on success, a bare error string, a library the client banned after an incident, and no audit row. Every line is defensible in general and wrong here — and it takes a reviewer twenty minutes to explain why, again."),
      withBrain:
        msg("The client's own shape: soft delete because nothing is ever really deleted in this system, the house error envelope with its code list, an audit row written in the same transaction, and the banned library avoided with the reason attached. The pull request looks like the team wrote it, because the team's reasoning is what it read."),
    },
    steps: [
      msg("One brain per project, named after it, with a goal describing the project's own rules rather than its technology."),
      msg("Let the work fill it: brain_write from the agent whenever a convention is settled, /mozg:teach when the knowledge is in somebody's head and needs interviewing out of it."),
      msg("Share by email to the people on that project; each connects their own agent with their own token, and access ends when the person does."),
      msg("On handover, export the brain as CLAUDE.md, AGENTS.md or a Claude Skill. The client keeps a file that works with no account — and if they ever want it live again, the brain is still here."),
    ],
    limit:
      msg("Twelve brains is twelve things to keep current. A brain nobody has taught in three months has an old score and says so, which is better than a stale context file — but it is still stale, and the honest move is to retire it rather than let an agent trust it."),
  },
{
    id: "the-solo-builder",
    who: msg("Somebody building software without being a developer"),
    title: msg("She could not tell when the AI was lying to her"),
    oneLine: msg("A beginner gets a professional's answer, and can check it"),
    accent: "var(--color-riso-blue)",
    art: "solo",
    person: {
      name: "Kat",
      role: msg("founder, first product, no engineering background"),
      problem:
        msg("\u201cThe agent writes code faster than I can read it. When it is wrong I find out days later, and I have no way to tell the difference \u2014 it sounds equally sure both times.\u201d"),
      resolution:
        msg("\u201cNow it searches a brain for the framework I am on and quotes the current option, with a score on it. When the brain does not know, it says so \u2014 and that sentence is worth more to me than the code.\u201d"),
      portrait: "/stories/solo.webp",
    },
    body: [
      msg("The most common person building software today cannot read the output. They describe what they want, the agent writes it, and the thing either works or it does not. When it does not, the reason is somewhere in a file they cannot audit."),
      msg("The failure that hurts is not a crash \u2014 a crash is honest. It is the code that runs against an option renamed two versions ago, or a pattern the framework abandoned, written with total confidence because the model learned it before the change. A developer would notice. This person cannot."),
      msg("A brain gives them the one thing they were missing: a source that is dated and scored. The agent quotes the current option and says where it came from; when the brain has no answer, it says that instead of inventing one. The beginner does not become an expert \u2014 they become somebody who can tell a fact from a guess, which is most of what expertise buys you here."),
    ],
    moment: {
      ask: msg("\u201cAdd login to my app. I do not know what any of the options mean \u2014 just do it properly.\u201d"),
      without:
        msg("A tutorial from a year ago: an auth pattern the framework has since replaced, a session cookie without the flags that stop it being stolen, and no way for her to know any of that. It runs, which is the problem."),
      withBrain:
        msg("The current pattern, quoted from this month's documentation, with the two settings that matter named and explained in a sentence each \u2014 and one honest line: \u201cthe brain does not cover social login for this framework, so verify that part.\u201d She knows exactly which part to have somebody check."),
    },
    steps: [
      msg("Start from /basics if the words are new \u2014 it explains agents, MCP and brains without assuming any of them."),
      msg("Take the brain for whatever you are building with from the catalogue. Free, and the score tells you how much to trust it before you rely on it."),
      msg("Connect your agent once, then keep asking in your own words. You do not need the vocabulary; the brain has it."),
      msg("When something goes wrong, ask the agent to search the brain and quote the source. \u201cWhere did you get that\u201d is a question it can now answer."),
    ],
    limit:
      msg("A brain does not make code correct \u2014 it makes the knowledge behind it current and checkable. Somebody still has to read the important parts, and a brain that says \u201cI do not cover this\u201d is telling you where to find that somebody."),
  },
  {
    id: "every-agent",
    who: msg("Anyone who uses more than one agent, or changes agent"),
    title: msg("She taught it once, and switched tools without losing it"),
    oneLine: msg("Knowledge that is not locked to whoever made your agent"),
    accent: "var(--ink)",
    art: "everywhere",
    person: {
      name: "Mira",
      role: msg("senior engineer, three agents open on any given day"),
      problem:
        msg("\u201cI taught Claude our conventions, then the team moved to a different tool and it knew nothing. Built-in memory belongs to whoever built the agent, not to me.\u201d"),
      resolution:
        msg("\u201cThe conventions live in a brain now. Every agent I connect reads the same one, and when I switch tools I lose nothing but the keyboard shortcuts.\u201d"),
      portrait: "/stories/everywhere.webp",
    },
    body: [
      msg("Every agent has memory now, and every one of those memories belongs to the company that made it. Teach one tool your conventions and the next knows nothing. Change tools \u2014 which everybody has done at least once in the past year \u2014 and you teach it all again."),
      msg("There is a quieter version of the same problem: two agents at the same time. One writes code, one reviews it, and they disagree about a convention because only one of them was ever told. The disagreement looks like a technical dispute and is really a filing problem."),
      msg("A brain sits outside all of them. It is reached over MCP, which every serious agent now speaks, so the same knowledge answers Claude Code, Codex, Cursor and whatever ships next quarter. And if you leave the product entirely, the brain exports as a file that keeps working with no account at all \u2014 which is the only honest form a promise like this can take."),
    ],
    moment: {
      ask: msg("\u201cWhy did the review agent flag this? The one that wrote it said it was fine.\u201d"),
      without:
        msg("Two agents with two private memories, each confident. Somebody spends twenty minutes arbitrating a disagreement that exists only because the convention was written down in one place and not the other."),
      withBrain:
        msg("Both read the same note, and it has a date and a reason attached: \u201cwe stopped doing it that way in March, because of the incident in the note below.\u201d The dispute ends in the time it takes to read one paragraph, and the answer does not depend on which tool asked."),
    },
    steps: [
      msg("Put the conventions in a brain rather than in one agent's memory \u2014 the agent can write them there itself with brain_write as they get settled."),
      msg("Connect every agent you use to the same brain. One command each; they all speak MCP."),
      msg("/mozg:sync writes the shelf into the project, so a new tool on a new machine starts knowing what exists."),
      msg("Export whenever you like \u2014 CLAUDE.md, AGENTS.md or a Skill. Leaving is meant to be cheap; that is what makes staying a choice."),
    ],
    limit:
      msg("MCP is the reason this works, so an agent that does not speak it is out of reach \u2014 for those, the export is the answer, and an export is a snapshot with all the staleness that implies."),
  },
];
