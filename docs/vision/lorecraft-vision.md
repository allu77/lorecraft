## UI and features

I am a GM in and RPG game, building and running a campaign. I store all info about my campaign in an Obsidian vault, so all text content is in MD format. I probably have already Wikilinks in my notes to link concepts. I want to get help from AI/LLM to create new ideas and entities for my campaign (e.g. NPCs, Locations, Monsters, Sessions and so on).

Lorecraft is the tool that will help me.

- It can access my Obsidian vault 
	- Initially it needs to run locally and the vault will be on the same file
	- In the future, I will be able to access Lorecraft from anywhere and content will be synced (e.g. via file sharing services?)
	- Eventually, it might become a publicly available service/SaaS accessible via a subscription. But this is just a dream. Let’s keep it in mind but do not obsess/over-index on this.
- It can build a new note from scratch (e.g. a new NPC)
	- When creating a new note, it will ask me questions and gather context from my vault. E.g when creating a new NPC, it might ask me if the NPC belongs to a known faction, where is the NPC located, what is the overall role in the campaign and so on. Once Lorecraft collected this info, it might for example look into details about the faction, understand the faction’s goals, allies, enemies, connections with the PCs and so on, to generate a consistent NPC.
	- Lorecraft will have specialized AI Agents/Prompts/Skills (implementation details to be defined) for each entity that a note can refer to (e.g. NPCs, Objects, Locations, Monsters, ...)
	- It will maintain a consistent tone/style across the whole campaign. E.g. is my campaign is based on an comic/satyrical setting as Discworld, it won’t generate a Ravenloft-like vampire NPC, but something closer to those in Terry Pratchett’s _Carpe Jugulum_ novel.
	- It will propose an initial version and I can chat with Lorecraft and ask for changes
	- Once approved, it will save such note in the campaign vault, where I can apply manual edits.
- I can work with Lorecraft to expand or improve existing notes
	- I can refer Lorecraft to a specific note in my vault and ask for to change it (I will provide specific asks via natural laguage)
	- The same logic as for building a new note applies here (asking clarifying questions, autonomously exploring the lore of the campaign)
- It can generate visuals for me, e.g.:
	- Portrait of an NPC (starting from his/her description)
	- Visual representation of a magic object
	- Visuals also will have a consistent style across the campaign.
- I can have a generic conversation/chat with Lorecraft about my whole campaign. 
	- Lorecraft will explore my campaign vault to ground its knowledge.
	- As an outcome of this conversation, actions might be triggered. E.g. I asked Lorecraft to analyze the content of a note that describes a village and tell me which kind of NPCs I should add to it. Eventually at some stage, new notes for such NPCs will need to be created. Or I am asking Lorecraft to check the chronicles of my game sessions and to brainstorm on where I can bring the campaign going forward, and as an outcome we will need to generate notes for new locations.
		- When available, Lorecraft will trigger it’s specialized abilities to create new entities

## Configuration

Lorecraft is highly configurable from the GM, without need to change the code or complex configuration files (such files can exist but they are minimal). The majority of the configuration happens via MD files, that the GM can maintain in Obsidian.

- Overall campaign style and high level plot is maintained in specific note. Lorecraft must always be consistent with it.
- The kind of notes that  Lorecraft can create/edit, are defined as templates in Obsidian.
	- Lorecraft reads the template and understands the structure of the note it is supposed to generate.
	- The template contains instructions on how to generate the note. These are specified as Obsidian comments (`%% .... %%`) so that they are stripped from read mode. The comments can contain for example (but not limited to, other ideas might come up in the future)
		- List of inputs that Lorecraft needs to have before generating a note of that type.
		- Additional instructions for the LLM (in the form of a prompt that will be injected in the standard prompt)
		- List of notes that need to be injected as context for the LLM
- There is not a wired set of note types supported by Lorecraft. Every GM will have its own needs. He/She can simply drop a template in the vault and have Lorecraft specialize on it.
- Lorecraft will come with a set of pre-defined templates as a starter pack. These are based on a generic fantasy setting, D&D 5.5ed as the rules system


## Tech stack

- Language: TypeScript
- LLM infrastructure: Amazon Bedrock to start with - I might switch to some other providers in the future
- Agentic framework: the user experience smells of agentic to me. It will for sure require tool use (e.g. for vault exploration and probably to ask user inputs in a structured form). If that’s the case we need consider an existing framework and not start from scratch. Strands Agents SDK is an option, as I am starting with Bedrock but it supports also 3rd party providers, and has support fro TypeScript. But I am open to other frameworks if they fit better. Need to explore this.
- Vault exploration. This will require for sure:
	- ability to resolve a wikilnk (i.e. note name without full path)
	- keyword based search in the vault
	- semantic based search in the vault (embeddings, vector search, ...). 
	- We start with something local, with persistence (don’t want to re-index, re-generate embeddings every time). 
		- We need to be able to trigger refreshes for new/modified content. Manual is ok at the beginning (only re-index new or modified notes with option for full re-index). Automatic in the longer term.
		- For embeddings, we consider both local and cloud-based models. Need to explore this.
- Monorepo:
	- pnpm as package manager
	- turoborepo as the build system
- UI: React. Maybe NextJS? But I am open to other variants. Need to explore this.
- Backend: Not sure about which framework/helper is needed here. Is it enough to use the api framwork of nextjs? Do we need something different? What are pro/cons? Need to explore this. Keep in mind we will need streaming support for the LLM output.

## High Level roadmap

### MVP 

- Text based from CLI (kind of claude code, with less bells & whistles). User can send `/generate` command to trigger a specialized agent. E.g. `/generate npc name:foo faction:bar location:homestead`
- No auth/security needed, runs only locally
- No image generation capability
- No generic conversation, multi-agent orchestration
- Only wikilink resolution for vault exploration
- Specialized agent/prompt capablities:
	- Consider overall campaign style/tone
	- Read custom prompt from the template comments
	- Assess input required (from template syntax), validate is all is available. If not
		- first explore the vault for context
		- if not found, ask the user
	- Once all input is provided, explore the vault for additional context (recursively as needed). E.g. npc belongs to the thieves guild faction, read the thieves guild note. Thieves guild note mentions some important NPC that lives in the same location as the new NPC, read that other NPC note
	- Once all context is provided, generate a note and propose to user.
	- User can ask for changes, this goes on interatively

### v0.1

- Add text/keyword search

### v0.2 

- Add embeddings for semantic search

### v0.3 

- Add generic converstaion and multi-agent orchestration

### v0.4

- Add minimal UI
	- MD visualization (read only)
	- Chat interface
