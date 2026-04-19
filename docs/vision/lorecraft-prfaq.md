# LORECRAFT - Press Release / FAQ

> **Working Backwards Document - Confidential**
> Version 0.5 - April 2026

---

## PRESS RELEASE

### Lorecraft Gives Game Masters an AI Co-Author That Knows Their Campaign

**FOR IMMEDIATE RELEASE**

Lorecraft is a new open-source tool that lets tabletop RPG Game Masters generate deeply lore-consistent campaign content - NPCs, locations, factions, monsters, session notes - directly from their Obsidian vault. Unlike generic AI assistants, Lorecraft reads the GM's own notes before it writes a single word, ensuring every new character feels like it belongs to the world already built.

Game Masters spend hours wrestling with a tension every creative knows: the blank page, and the fear of breaking what they've already built. A new NPC must fit the faction's goals, echo the campaign's tone, and not contradict three sessions of established lore. Generic AI tools don't know any of that - they write in a vacuum. Lorecraft solves this by treating the vault as the ground truth and the LLM as its interpreter.

Starting today, GMs can run Lorecraft from the command line alongside their Obsidian vault. They open a free-form chat session, type a request in natural language - or use slash commands for structured generation - and Lorecraft autonomously explores the vault, resolves wikilinks, reads faction notes and location files, and then proposes a fully formed, campaign-consistent note. The GM refines it in conversation, then copies the final Markdown into their vault. Nothing is written without approval.

> *"I spend more time keeping the lore consistent than actually running the game. Lorecraft just reads the notes and writes something that sounds like it was always part of the world."*
> - GM in early testing

Lorecraft is template-driven: each note type (NPC, Location, Monster, Session, etc.) is defined by an Obsidian template the GM controls. Templates contain generation instructions as Obsidian comments - invisible in read mode, but read by Lorecraft at generation time. There is no hardcoded list of supported entity types. GMs can drop any template into the vault and Lorecraft will adapt to it. Lorecraft ships with a starter pack tuned for D&D 5.5e fantasy settings, but adapts immediately to any genre or system by swapping templates and the campaign style document.

Under the hood, a single AI agent handles all generation. Its system prompt is dynamically assembled from the campaign style document, the template's embedded instructions, and the context gathered from the vault. From the GM's perspective, generating an NPC feels different from generating a Location - because the injected context and instructions are different. The agent framework is the same.

A locally hosted web UI - available in a later release - adds a Markdown preview panel and a persistent chat interface, keeping everything on the GM's machine with no subscriptions or cloud accounts required.

Lorecraft is free and open source. The roadmap leads from a CLI MVP through keyword search, semantic search, multi-agent orchestration, and an image generation pipeline for NPC portraits and object illustrations - all configurable, all local-first.

> **Availability:** CLI MVP available now for local installation. Web UI (locally hosted) targeted for a later release. No subscription required. Requires Node.js 20+ and either AWS credentials for Amazon Bedrock, an Anthropic API key, or a local model via Ollama.

---

## FREQUENTLY ASKED QUESTIONS

---

### Customer & Problem

**Who is Lorecraft for?**

Lorecraft is for tabletop RPG Game Masters who use Obsidian to manage their campaign lore and want AI-assisted content generation that stays consistent with what they've already built. The primary audience is GMs who maintain structured, wikilinked notes - the kind of people who already invest in their vault as a creative system.

Lorecraft is not for GMs who want a general-purpose AI chatbot. It is specifically designed around the Obsidian vault as the source of truth. Without a vault, the tool's core value proposition doesn't exist.

---

**What problem does Lorecraft actually solve?**

Three interconnected problems that every active GM knows:

- **Blank-page friction.** Generating a new NPC, location, or encounter from scratch takes time and creative energy that often stalls session prep.
- **Lore consistency.** A generic AI assistant has no idea that the thieves' guild is led by a half-elf illusionist, that the city guard is corrupt, or that the campaign tone is darkly comedic rather than heroic. It writes in a vacuum. Lorecraft doesn't.
- **Manual cross-referencing.** Before writing anything, a conscientious GM reads related notes to avoid contradictions. Lorecraft automates exactly this step - it resolves wikilinks and reads related notes before generating anything.

---

**What does a “good” vault look like?**

Lorecraft works best with:
- Separate notes for entities (NPCs, locations, factions)
- Explicit wikilinks between notes
- A campaign style document

Sparse or loosely connected vaults will still work, but results may be more generic. Future versions will improve this via keyword and semantic search.

---

**Can I use Lorecraft to start a brand new campaign from scratch?**

Not as its primary use case. Lorecraft is designed to expand an existing vault, not to build one from zero. When there are no notes to traverse, no wikilinks to follow, and no style document to inject, the tool has no lore foundation to work from — it degenerates into a generic AI assistant, which is exactly what Lorecraft is not trying to be.

For GMs starting a new campaign, the recommended workflow is:

1. Use a general-purpose AI assistant (Claude, ChatGPT, or similar) to develop the initial campaign framework: setting, tone, factions, major NPCs, world history. Store the results in one or more Markdown files in the vault.
2. Write a campaign style document capturing the tone, genre, rules, and inspirations.
3. From that point, use Lorecraft to expand further — generating additional NPCs, fleshing out locations, building out factions — with the initial notes as the lore foundation.

Lorecraft begins delivering real value once a critical mass of interconnected notes exists. The richer the vault, the better the output.

> **Tracked future capability:** A bootstrapping or "campaign setup" mode where Lorecraft guides the GM through building the initial style document and seed notes interactively. This would meaningfully expand the addressable audience. Not planned before the multi-agent orchestration phase (v0.3), which is the prerequisite for that kind of guided conversation.

---

**Why Obsidian specifically? Can I use Lorecraft with other note-taking tools?**

Obsidian was chosen because it is the most popular vault-based note tool among structured-notes GMs, its files are plain Markdown on disk, and its wikilink syntax (`[[ ]]`) provides a queryable relationship graph that Lorecraft can traverse. The comment syntax (`%% ... %%`) is also Obsidian-specific and is used for generation instructions in templates.

In practice, Lorecraft reads plain Markdown files from a directory. Any tool that produces Markdown files with wikilinks could work. However, Lorecraft is not tested against Logseq, Notion exports, or other vaults - compatibility is not guaranteed and is not a near-term roadmap priority.

---

### Product & Features

**What can Lorecraft generate today (MVP)?**

In the CLI MVP, Lorecraft can:

- Generate any note type for which a template exists in the vault (NPCs, Locations, Monsters, Factions, Sessions - or any custom type the GM defines).
- Accept generation requests via free-form chat or slash commands (e.g. `/generate npc name:"Mira Shadowcloak" faction:"Thieves Guild"`).
- Autonomously read the vault to collect context: it resolves wikilinks, reads related notes recursively, and incorporates the campaign style document before generating.
- Ask the GM for missing input when required context is not found in the vault.
- Propose a Markdown note and iterate on it through conversation until the GM is satisfied.

What it cannot do in the MVP:

- Write to the vault autonomously - the GM copies the final note manually.
- Perform keyword or semantic search - only wikilink resolution is supported.
- Generate images.
- Orchestrate multiple agents in a single workflow.

> **Known limitation:** The quality of context gathering in the MVP depends entirely on the density of wikilinks in the vault. GMs with richly linked notes will get noticeably better results than those with sparse or loosely connected vaults. This is expected behaviour, not a bug. It is the primary motivation for adding keyword search in v0.1.

---

**How does Lorecraft maintain campaign tone and style?**

The GM maintains a campaign style document in the vault - a Markdown note describing the setting, tone, genre, inspirations, and any hard rules (e.g. *"this campaign has no resurrection magic"*, *"the tone is darkly comedic like Pratchett, not grimdark"*). Lorecraft reads this document at the start of every generation session and injects it into the agent's system prompt.

Lorecraft does not perform active lore-contradiction detection. It relies on the context it explicitly reads - the template, the style document, and the notes it traverses via wikilinks - to stay consistent. The GM remains the final arbiter of consistency. Active contradiction detection may be revisited once semantic search is available in v0.2.

---

**What if I keep giving Lorecraft the same corrections? Can it remember my preferences?**

Not automatically — Lorecraft has no persistent memory across sessions. Each generation session starts fresh from the vault content.

The intended mechanism for capturing recurring preferences is the campaign style document. If a GM finds themselves repeatedly telling Lorecraft the same things ("keep NPC descriptions under 150 words", "never invent a character's age, leave it blank"), those instructions belong in the style document — they are campaign-level preferences, and the style document is exactly where campaign-level instructions live. Think of it the way Claude Code's `CLAUDE.md` works: a plain-text file the tool always reads, where standing instructions accumulate over time. The GM is also the memory system, at least for now. When a generation session produces a correction worth keeping, the GM adds it to the style document.

Future versions may automate this — Lorecraft could propose additions to the style document when it detects a pattern of similar corrections — but this is not on the near-term roadmap.

> **Tracked future capability:** Session-level learning and automatic style document updates. Not planned before v0.3.

---

**How do "specialized agents" work? Is there one agent per note type?**

No. There is a single AI agent. Its apparent specialization comes entirely from its dynamically assembled system prompt, which is composed of:

1. The **campaign style document** - sets tone, genre, and world rules.
2. The **template's embedded instructions** - the Obsidian comments (`%% ... %%`) inside the relevant template, which contain entity-specific directives, required inputs, and notes to inject as context.
3. The **vault context** gathered at runtime - notes reached by traversing wikilinks from the target entity.

From the GM's perspective, running `/generate npc` feels different from `/generate location` because the injected instructions and context are different. Under the hood, the same agent loop handles both. This architecture keeps the codebase simple and makes it trivial to support new note types: the GM drops a new template into the vault, and Lorecraft's behaviour adapts without any code changes.

---

**How do templates work? Do I have to write them?**

Templates are standard Obsidian Markdown files with addition of instructions for the agent, embedded in **Obsidian comments** (`%% ... %%`). These comments are invisible in Obsidian's read mode and do not appear in the generated note.

- **Custom prompt**: For the agent will be enclosed with a proper syntax in the comments (e.g. `%% == AGENT PROMPT == [...] %%`). This prompt will be embedded as part of the agent system prompt and can be used to provide specific instructions to the agent.
- **Generic comments**: Can be used to provide instructions to the agent on how to fill in specific sections of the template.
- **Note injection**: `@[[note-name]]` syntax in a comment will inject the whole content of that note in the comment before the template is evaluated.

Lorecraft ships with a starter pack of templates for a generic D&D 5.5e fantasy setting: NPC, Location, Monster, Faction, Session, and a few others. GMs can use these as-is, modify them, or create entirely new templates for custom entity types.

Writing a template is straightforward Markdown. A GM comfortable with Obsidian should be able to create a new template in under fifteen minutes by adapting an existing one.

---

**How does Lorecraft decide which notes are relevant?**

Lorecraft builds context in layers:
1. Core inputs (style doc, template, explicit references)
2. Wikilink traversal
3. (Future) keyword and semantic search
4. Context budget filtering

Explicit relationships are prioritized over inferred ones.

---

**How does a generated note get into my vault?**

- **MVP:** Manually. Lorecraft proposes the final Markdown in the CLI chat window. The GM copies it and pastes it into a new note in Obsidian. This is intentional - it keeps the MVP scope tight and ensures the GM reviews every word before it enters the vault.
- **Web UI release:** Lorecraft writes the approved note directly to the vault filesystem after explicit GM confirmation. Read operations (wikilink resolution, context gathering) are always autonomous; write operations always require a clear approval step.

---

**What does the web UI look like?**

The web UI is a locally hosted single-user application (Next.js, no internet required after initial setup). It provides:

- A chat interface replacing the CLI, with the same slash command support and free-form conversation.
- A Markdown preview panel showing the proposed note rendered as it will appear in Obsidian.
- An approve-and-save action that writes the note to the vault with confirmation.

The UI is intentionally minimal. It is not an Obsidian replacement - it is a generation workspace that complements the vault. The GM continues to use Obsidian for reading, editing, and managing notes.

---

**What about image generation for NPC portraits and objects?**

Image generation is on the roadmap but not in the MVP or the web UI release. When it arrives, it will work from the description field in an NPC or object note, generating a portrait or illustration in a visual style defined by the GM in a configuration document (analogous to the campaign style document for text).

> **Expectation management:** Maintaining a visually consistent art style across a campaign with diffusion models is genuinely hard without fine-tuning. Lorecraft will produce thematically appropriate illustrations, not guaranteed style-consistent artwork. This distinction should be communicated clearly in documentation.

---

**Can Lorecraft edit or expand an existing note, or does it only create new ones?**

Both are on the roadmap, but editing existing notes is not in the MVP. The MVP scope is creation only: Lorecraft generates a new note and proposes it for the GM to copy into the vault.

Editing existing notes arrives in v0.5 (or later). The capability will work as follows: the GM points Lorecraft at a specific note in the vault and describes what they want changed in natural language ("expand the backstory section", "add a secret the NPC is hiding", "rewrite the description to be more menacing"). Lorecraft reads the note, applies the same vault-exploration logic it uses for creation — traversing wikilinks, gathering related context, reading the style document — and proposes a revised version. The GM reviews the diff and approves before anything is written back to the vault.

The underlying mechanism is identical to creation: same agent, same context assembly, same iterative refinement loop. The difference is the input (an existing note rather than a blank template) and the output (a modified version of that note rather than a new one).

> **Tracked future capability:** Editing existing notes. Targeted for v0.5 or later, after the web UI and direct filesystem write capability are in place.

---

### Technical Architecture

**What is the recommended agentic framework?**

**Vercel AI SDK (latest version).** Reasons:

- **TypeScript maturity.** Production-grade, 20M+ monthly downloads, stable API.
- **Provider abstraction.** Supports Amazon Bedrock, Anthropic direct, OpenAI, Google, and others via a unified interface. Switching providers is a one-line change - satisfying the "Bedrock first, easy to swap" requirement.
- **Streaming.** First-class streaming support works identically in Node.js (CLI MVP) and Next.js (web UI), avoiding a framework switch between phases.
- **Human-in-the-loop.** AI SDK v6 ships native tool execution approval flows - exactly the pattern needed for write-to-vault operations.
- **MCP support.** Full MCP client support available if Lorecraft later exposes vault tools as an MCP server.

> **On Strands Agents SDK:** Strands is a natural fit for AWS-heavy deployments and its TypeScript SDK is gaining features rapidly. Its `VercelModel` adapter also means the two frameworks are not mutually exclusive. Revisit Strands for the multi-agent orchestration phase (v0.3) once its TypeScript SDK reaches stable release.

---

**Why Amazon Bedrock? Is there vendor lock-in?**

Bedrock is the starting point because the author is an AWS practitioner with existing credentials and familiarity. Lock-in risk is low: with the Vercel AI SDK as the abstraction layer, switching providers requires changing one import and one environment variable.

One real concern: AWS credential setup adds friction for GMs who are not AWS users. The recommended mitigation is to make the provider configurable via a `.env` file, with documented examples for:

- **Amazon Bedrock** (default, requires AWS credentials)
- **Anthropic direct** (requires Anthropic API key)
- **Ollama** (local, no account required - recommended for community distribution)

---

**How much does Lorecraft cost to run? How do I keep track?**

The honest answer is: it depends, and the exact figures require a working prototype to measure. The cost per generation request is a function of three variables: the model chosen, the size of the context assembled from the vault, and the length of the iterative conversation. A single `/generate npc` request on a dense vault could consume tens of thousands of tokens if wikilink traversal pulls in many related notes. With a cloud provider (Bedrock, Anthropic direct), that has a real dollar cost.

What Lorecraft will do from day one is report token consumption after each generation — input tokens, output tokens, and estimated cost at the current provider's rates. This gives GMs full visibility and lets them understand the cost profile of their own vault and usage patterns over time.

The main levers available to control cost are:

- **Model choice.** Smaller, cheaper models (e.g. Claude Haiku, local Ollama models) are significantly less expensive than frontier models. For most generation tasks, a mid-tier model is sufficient.
- **Context budget.** The context budget manager caps the tokens allocated to vault context per request. Lowering this cap reduces cost at the expense of less context.
- **Ollama.** Running a local model via Ollama eliminates per-token cloud costs entirely, at the cost of hardware requirements and potentially lower output quality.

> **Tracked decision:** Cost reporting is a day-one feature, not a later addition. A GM should never be surprised by their bill.

---

**How does vault exploration work? What is the search roadmap?**

Vault exploration progresses across releases:

- **MVP - Wikilink resolution only.** Given `[[Thieves Guild]]`, Lorecraft scans the vault directory for `Thieves Guild.md` (case-insensitive, path-agnostic). Sufficient to traverse the explicit relationship graph the GM has already built. Acknowledged limitation: notes relevant to a query but not explicitly linked will not be found.

- **v0.1 - Keyword search.** A full-text index over all vault notes allows Lorecraft to find relevant notes even without a wikilink. Implementation: a lightweight local index (e.g. Fuse.js or a simple inverted index) stored in `.lorecraft/` and refreshed on demand.

- **v0.2 - Semantic search.** Embeddings + vector search enable similarity-based retrieval. Implementation: a persistent local vector store (e.g. LanceDB or sqlite-vec) with embeddings from a local model (via Ollama) or a cloud embedding API. The index is incremental - only new or modified notes are re-indexed.

> **Tracked open decision (v0.2): local vs. cloud embeddings.** This is an architectural choice with real trade-offs that needs resolution before v0.2 begins.
> - **Local models** (e.g. `nomic-embed-text` via Ollama): zero cost, no data leaves the machine, important for GMs who consider their campaign lore private. Lower quality than frontier embedding models, requires local hardware capable of running the model.
> - **Cloud embedding APIs** (e.g. OpenAI, Voyage, Cohere): higher quality embeddings, no local hardware requirement, but cost money per token and require sending vault content to a third-party server. Privacy-conscious GMs may object.
> The recommended default is local embeddings via Ollama, consistent with the local-first principle. Cloud embeddings should be available as an opt-in for GMs who prioritise quality over privacy.

---

**How does Lorecraft stay current as the vault evolves?**

The vault changes after every session: new NPCs are created, factions shift allegiance, characters die. Lorecraft needs to reflect these changes or it will generate content based on stale lore.

The approach evolves across releases:

- **MVP:** Fully manual. Wikilink resolution always reads files directly from disk, so it is always current — no index to go stale. The GM owns the vault and knows what has changed.
- **v0.1 (keyword index) and v0.2 (semantic index):** The GM issues an explicit refresh command (e.g. `/index refresh`) to update the index. A full re-index is also available. Lorecraft will surface a warning when it detects that the index was last updated before recent vault changes, prompting the GM to refresh before generating.
- **Longer term:** Lorecraft will monitor the vault directory for file changes and update the index automatically in the background, without GM intervention.

> **Note:** In the MVP, there is nothing to go stale. This is one of the underrated advantages of wikilink-only exploration — it is always reading live files.

---

**What is the approach to context window management?**

Recursive wikilink traversal can pull in a large number of notes. With a dense vault, the context sent to the LLM may become very large, increasing cost and potentially exceeding model limits.

Lorecraft needs a context budget manager from the start - a mechanism to:

- Limit total tokens allocated to vault context per generation request.
- Prioritize which notes to include (e.g. directly linked notes over transitively linked ones; notes explicitly listed in the template instructions over notes found incidentally).
- Truncate or summarize lower-priority notes when the budget is exceeded.

> **Tracked decision:** Context budget management is a day-one architectural concern, not a later optimization. Its absence would cause silent quality degradation on large vaults and unpredictable cost spikes.

---

**Should Lorecraft use a monorepo (pnpm + Turborepo)?**

Not for the MVP. A monorepo structure (e.g. `packages/cli`, `packages/core`, `packages/web`) only pays off when there is genuine shared code across multiple build targets. For the MVP, a single pnpm package is sufficient.

> **Tracked decision:** Structure the code with clear internal module boundaries (`src/core/`, `src/cli/`, `src/agents/`) from the start. Migrate to a Turborepo monorepo when the web UI is introduced and shared packages become real. Turborepo is the planned build system at that point - the transition cost will be low if internal boundaries are respected early.

---

**What is the recommended backend for the web UI?**

Next.js App Router. Reasons:

- The Vercel AI SDK is designed to work with Next.js API routes for streaming. The `useChat` hook on the client pairs directly with a `/api/chat` route, handling streaming, message history, and tool call display without additional wiring.
- Single dependency - Next.js covers routing, API, and React rendering. No separate server alongside a Vite/React frontend.
- Local deployment - Next.js runs perfectly as a local server (`next dev` or `next start`). There is no requirement to deploy to Vercel or any cloud.

> **Alternative worth noting:** For a minimal-scope web UI (chat + Markdown preview only), a Vite + React + small Express/Fastify server is a legitimate lighter-weight alternative with faster cold starts and less tooling complexity. If the web UI scope creeps beyond the current definition, revisit this choice.

---

### Risks & Open Questions

**What are the biggest risks?**

- **Context window limits.** Recursive wikilink traversal on a dense vault can produce very large contexts. A context budget manager is needed from day one (see above).
- **Sparse vault problem.** Output quality is directly proportional to vault richness and link density. GMs with sparse or loosely connected notes will get worse results. This must be communicated clearly in onboarding documentation to avoid disappointment.
- **Template authoring friction.** The template system is powerful but requires the GM to understand Obsidian comment syntax and Lorecraft's instruction format. Poor templates produce poor output. The starter pack must be high quality, and template authoring must be well documented.
- **LLM prompt injection via vault content.** Lorecraft injects vault content directly into LLM prompts. Accidental adversarial content in a note (unlikely in a personal vault) could influence generation in unintended ways. Low risk for personal use; relevant if vault sharing features are ever added.

---

**What assumptions deserve scrutiny?**

> **"The vault is internally consistent."**
> Lorecraft treats the vault as ground truth. It does not scan for contradictions between notes, detect placeholder content ("TBD", "unknown"), or flag conflicts between session logs and faction notes. It will ingest whatever it finds and generate accordingly. This is an explicit out-of-scope decision for now: vault consistency is the GM's responsibility. Automated consistency checking — scanning notes for logical conflicts and surfacing them to the GM — is a viable future feature, particularly once semantic search is available, but is not planned in the current roadmap.

> **"Wikilinks are sufficient for MVP context gathering."**
> This holds if the GM's vault is densely linked. It fails for GMs who write notes in isolation and link them retroactively. The MVP should document this limitation explicitly and position keyword search (v0.1) as the near-term fix, not a distant enhancement.

> **"Image generation can be visually consistent."**
> Diffusion models are notoriously difficult to constrain to a consistent art style without fine-tuning. A style reference image and a detailed style prompt help but do not guarantee consistency. Manage expectations accordingly.

> **"Manual copy-paste in the MVP is acceptable."**
> It is for a solo GM building the tool. It may be the primary friction point for community GMs evaluating Lorecraft. If early feedback confirms this, move filesystem writes into the MVP at the cost of scope expansion - the capability will exist in the codebase anyway.

> **"The locally hosted web UI is safe to run on a home network."**
> The web UI should listen only on `localhost` by default and the documentation should explicitly state it is not hardened for network exposure. This is a one-line configuration decision that avoids a potential security issue if a GM shares their machine or network.

---

**What is explicitly out of scope?**

- Real-time collaboration (multiple GMs editing simultaneously).
- Player-facing features - Lorecraft is a GM tool only.
- Cloud sync or SaaS hosting (deliberately deferred; local-first through the web UI phase). Remote access via file-sync services — e.g. running the vault on a NAS synced to a cloud drive — is a viable self-hosted workaround and may be documented, but is not a supported configuration in the near term.
- Rules adjudication - Lorecraft generates narrative and descriptive content, not rules rulings.
- VTT integration (Foundry VTT, Roll20, etc.) - possible in a future phase, not planned.
- Multi-vault support - one vault per Lorecraft instance.

---

### Roadmap Summary

| Phase | Milestone | Key Capabilities |
|---|---|---|
| **MVP** | CLI Tool | Free-form chat + slash commands, wikilink resolution, template-driven generation, dynamic system prompt assembly, campaign style injection, iterative refinement, manual vault copy |
| **v0.1** | Keyword Search | Full-text index over vault; Lorecraft finds relevant notes without explicit wikilinks |
| **v0.2** | Semantic Search | Persistent local vector store (LanceDB or sqlite-vec), embedding-based retrieval, incremental re-indexing |
| **v0.3** | Multi-Agent Orchestration | Generic campaign conversation, orchestration of multiple generation tasks from a single conversation turn, triggered specialized context assembly |
| **v0.4** | Local Web UI | Next.js locally hosted app: chat interface, Markdown preview, approve-and-save to vault, direct filesystem writes |
| **v0.5** | Note Editing | Edit and expand existing vault notes: point Lorecraft at a note, describe changes in natural language, review proposed diff, approve to write back |

---

*Lorecraft - Working Backwards Document - Confidential*
