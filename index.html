# RXP Guide Editor

A browser-based editor for building and editing **RestedXP (RXP) speedrunning guides**, made for the WoW Classic Era / Hardcore community.

Load a guide `.lua` file, browse and edit its steps (by hand or with AI help), preview how each step looks in-game, and download the finished file. It has a built-in WoW Classic database so you can drop in real quest / NPC / item / spell IDs and coordinates without ever leaving the editor or memorizing a number.

Made by **Rook**. Questions, bugs, or ideas? Reach out to **rookgalaxy_** on Discord, or find me on the **Kamisayo Speedruns** server.

---

## For guide authors

**You do not need to install anything or touch any code.** Just open the link in your browser (Chrome, Edge, Firefox, or Safari) and you're ready.

### Do I need anything to use it?

- **Editing guides by hand:** no. Loading guides, browsing steps, the quick-insert menus, the preview, reordering, and downloading all work with nothing extra.
- **AI-assisted editing only:** this one feature talks to Anthropic's AI, which charges a small amount per edit, so it needs your own **API key**. See "Using AI editing" below. Everything else is free and works without it.

### The basics

1. **Open the editor** in your browser.
2. **Load a guide** — drag a `.lua` file onto the page, or click to browse for one.
3. If the file has several guides in it, pick which one to work on from the **dropdown at the top**.
4. **Click a step** in the left list to see and edit it. The **gear "Setup" entry** at the top of the list is the guide's config block (its name, the next section, class/faction tags).
5. When you're done, click **Download .lua** to save the whole file back out — all sub-guides and your edits included.

### Quick-insert menus (the time-savers)

When you're editing a step's raw text, type one of these characters to search the built-in database and drop in the right value — no IDs to look up:

| Type | For | Example |
|------|-----|---------|
| `@` | NPCs | `@Regthar` inserts a `.goto` with coordinates, or the NPC name |
| `#` | Quests | `#Counterattack` inserts the quest ID |
| `:` | Items | `:Linen Cloth` inserts the item ID or a coloured loot token |
| `!` | Spells | `!Sinister Strike` inserts the spell ID, with the right rank |
| `*` | Icons | `*sword` lets you browse icons by name and insert one |
| `~` | Formatting | the chat-bubble "Talk to" prefix, warnings, loot/buy text |
| `.` | Directives | all the RXP step directives, as ready-to-fill templates |

In the menu: **Up/Down** to move, **Enter** inserts the name, **Shift+Enter** the ID or `.goto`, **Cmd/Ctrl+Enter** the fuller snippet. Multi-word names work fine (e.g. `:Tough Wolf Meat`) — the menu closes on its own once you type past a real match.

There's a **Help** button in the top-right of the editor with all of this too.

### Using AI editing (optional)

The AI can rewrite a step from a plain-English description ("change this to turn in the quest at the flight master and then fly to Auberdine") and fills in the real IDs for you. It's optional and costs a little money per edit.

1. Get an Anthropic API key at **console.anthropic.com** (sign up, add a small amount of credit — a few dollars goes a long way, since most lookups are free and only the AI step costs anything).
2. Paste the key into the editor when it asks (top-right). It stays in your browser only.
3. Describe your change and submit. You'll see what the AI is doing, and you **review every change as a before/after diff** before it's applied.
4. The cost meter in the top bar shows how much you've spent this session.

---

## For whoever hosts the editor (Rook, or a helper)

The editor is a small web app. The easiest path is to host it once so authors just get a link.

### Option A — host it for free on Vercel (recommended, ~10 minutes)

1. Put this project folder in a GitHub repository (github.com, New repository, upload the files).
2. Go to **vercel.com**, sign in with GitHub, click **New Project**, and import that repository.
3. Vercel detects the setup automatically — no settings to change. Click **Deploy**.
4. You'll get a public link (like `your-project.vercel.app`) to share with guide authors.

No server secrets or environment variables are needed, because each author supplies their own API key in the browser.

(Netlify and Cloudflare Pages work the same way if you prefer them.)

### Option B — run it on your own computer

You need **Node.js** installed (the LTS version from **nodejs.org**). Then, in a terminal opened inside this project folder:

```bash
npm install      # one time only — downloads the building blocks
npm run dev      # starts the editor
```

It will print a local address (usually `http://localhost:5173`) — open that in your browser. Press **Ctrl+C** in the terminal to stop it. Next time, you only need `npm run dev` again.

This only works on your own machine; nobody else can reach it. For others to use it, host it (Option A).

### A note on privacy & cost

- Authors' API keys live in their own browser and are sent only to Anthropic when they use AI editing. The editor has no backend and stores nothing.
- The WoW Classic database is bundled into the app, so quest/NPC/item/spell/icon lookups are instant, free, and need no internet. Only icon **images** and the optional AI feature use the network.

---

## Updating the bundled game data

The editor targets **Classic Era / Hardcore**. If the data ever needs refreshing, see `scripts/README.md` for how the quest/NPC/item, spell, and icon lookups are generated.

## For developers

`npm test` runs the unit suite (no dependencies — uses Node's built-in test runner). It covers guide parsing/serialisation, the multi-guide split & recompile, the diff, the trigger detection, and the bundled database lookups. The AI editing flow is exercised manually with a real API key.
