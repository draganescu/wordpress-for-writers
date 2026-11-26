# Agent surface

The part of the plugin that lets an AI agent help with a note. An agent reads notes and proposes changes to them; the writer accepts or dismisses each proposal in the Writer editor. This folder is the spec. Nothing in it is built yet.

Design page, with mockups of the editor: https://claude.ai/artifact/34M5BULQXSTbWe9sgmg2oo. Where it differs from this folder, this folder is right.

| File | Holds |
|---|---|
| `surface.md` | The parts, the records, how a proposal finds its place in a note, the ways in, `wp writer`, and what a site pays |
| `abilities.md` | The closed list of abilities: inputs, results, errors, and the guide an agent is given |
| `editor.md` | What the writer sees and does: marks, cards, accepting, asks |

## The rule

**The agent never changes a note. It suggests, and the writer accepts.**

No ability creates, edits, publishes, schedules, trashes or deletes a note, changes its title, excerpt, categories or tags, takes a post lock, or accepts a suggestion. Accepting is an edit made in the Writer editor, as typing it would be: Undo takes it back, a draft autosaves it, and a published note holds it as unsaved changes until Update.

## Terms

| Term | Meaning |
|---|---|
| Note | A post, as everywhere in the app |
| Suggestion | One proposal an agent made for a note: a text edit, a block change, a detail (title, excerpt, tags, categories) or a comment with no change |
| Pass | The suggestions one ability call made together, with a label such as "Proofread" |
| Ask | A question the writer left on a passage of a note, for an agent to answer |
| Way in | What carries an agent's call to an ability: the MCP Adapter, `wp writer`, later WebMCP |

"Note" in core's sense (the block comments of WordPress 6.9 and 7.1) is always written "core note" in this folder.

## Decisions

| ID | Decision | Instead of | Why |
|---|---|---|---|
| A1 | The plugin gains an agent surface, in the main plugin. | A companion plugin. | Any agent should be able to work with Writer, so the surface is the plugin's and is the same for all of them. |
| A2 | The surface is a layer of abilities (the Abilities API). Ways in carry calls and hold no tools of their own. | Tools declared in a file of the plugin's own and run in the page, as WordPress for Designers has them. | A note is text in the database. An ability can read it and store a proposal with no editor open, so there is no relay and no open browser to require. |
| A3 | The agent never changes a note (The rule). | An agent that edits drafts directly. | The words are the writer's. Review is the only path from a proposal to the note. |
| A4 | Suggest-only, with no exception: an agent cannot start a note. | A `note-new` ability that makes a draft. | Decided by the product owner, 26 November 2026. The writer starts the note; an agent can then suggest blocks for it. |
| A5 | Asks are in the first version. | Suggestions first, asks later. | Decided by the product owner. Asks are how AI editing starts from inside the note, and they need no model on the site. |
| A6 | Asks and the replies to them are core notes. | A store of the plugin's own for everything. | Decided by the product owner. Core gives the thread, the author, the resolved state, the cleanup, the marker that survives edits and its removal from the public page; and an ask then shows in wp-admin's editor too. |
| A7 | A suggestion that answers no ask is a core note too, with no parent and no marker in the content. It is placed by its quoted text (A9). | A comment type of the plugin's own, `wfw_suggestion`, for these. | Decided by the product owner, 26 November 2026: one store. Core's marker lives in `post_content`, and an agent does not write there (A3), so these have none. The cost is accepted: wp-admin's editor lists a core note with no marker as "Original block deleted." |
| A8 | Title, excerpt, tags and categories are suggested like everything else. | Applying tags and categories to a draft directly. | Decided by the product owner. One rule for everything an agent proposes. |
| A9 | A suggestion is placed by a block path, the quoted passage and the text around it, and is looked for again each time the editor shows it. One that cannot be found is out of date and cannot be accepted. | Block ids, or character offsets. | Blocks of a note have no lasting id, and the writer goes on writing between the proposal and the review. |
| A10 | A site no agent has used pays nothing: no request, no script and no control is added until a way in is first used on the site. | Loading the review code with every editor. | The editor's weight is the writer's, and most sites will never connect an agent. |
| A11 | What the writer sees does not depend on the way in. | Marks per harness. | One surface. |

## Open questions

| ID | Question | Leaning |
|---|---|---|
| Q2 | Is Ask shown on a site no agent has used? | No (A10): it appears once a way in has been used, or once the note has a core note. |
| Q3 | Where does the writer keep the style sheet that `writer/guide` returns? | A text field under the user menu of the Writer sidebar, saved per user. |
| Q4 | Does `wp writer` stay once WP-CLI has a command of its own for abilities? | It goes, apart from `wp writer guide`. |

## Spikes

Throwaway proofs, run before the part that depends on each is built.

| | Proves | Passes when |
|---|---|---|
| S1 | The Writer editor can make a core note on a selection in core's own shape. | An ask made in the Writer editor shows in wp-admin's editor on the same passage, with its replies, and one made in wp-admin shows in the Writer editor. The spike reports what core writes: the marker, the block's `metadata.noteId`, the comment. |
| S2 | Marks can be drawn over the canvas without touching content. | The CSS Custom Highlight API marks a range inside the canvas iframe in Chrome, Firefox and Safari on macOS and on iOS, the mark follows typing elsewhere in the block, and the serialized content is unchanged. |
| S3 | A core note with no marker does no harm in wp-admin. | With unasked suggestions on a note opened in wp-admin's editor: they are listed, labelled "Original block deleted.", the editor saves and reloads with them unchanged, and resolving one there shows as dismissed in the Writer editor. None shows on the public page, in comment counts or in feeds. |
| S4 | An ability round-trips through the MCP Adapter. | `writer/note-get` and a failing `writer/suggest-edits` reach an MCP client with the result unchanged and the error code readable. |

## Build order

Each step is usable on its own.

1. The store (`surface.md`, Records) and the read abilities, with `wp writer`.
2. The suggest abilities.
3. The editor: marks, cards, accepting and Undo, the counts.
4. Asks.
5. The style sheet, and Peek with a pass applied.
