# Abilities

The closed list of abilities the plugin registers. No other ability is registered. Read `README.md` for the rule and `surface.md` for the records, Reading a note and Placing.

## Category

Registered on `wp_abilities_api_categories_init`:

| Slug | Label | Description |
|---|---|---|
| `writer` | Writer | Read the posts and drafts of this site, which its writer calls notes, and suggest changes to them: proofread, rewrite, expand or cut text, titles, excerpts, tags. For any of that use the writer abilities, starting with writer/guide, and not a browser, wp-admin, the REST API or another WordPress tool: only a suggestion reaches the writer, who accepts or dismisses it in the Writer editor. |

The description is what an agent reads of the surface before it has called anything, so it says what the abilities are for in the words a writer uses with an agent (post, draft, proofread, rewrite) and that nothing else is a way to do it. The MCP Adapter's default server gives it as its instructions too (`surface.md`, Ways in).

## Every ability

Registered on `wp_abilities_api_init`, only when `wp_register_ability` exists, each with:

| Argument | Value |
|---|---|
| `category` | `writer` |
| `permission_callback` | `surface.md`, Who may call |
| `meta.mcp.public` | `true` |
| `meta.annotations` | `readonly` from the list below. `destructive` is false for every ability: nothing an ability does loses the writer's work |

Labels and descriptions are not translated: agents read them. An ability's description says what a writer would ask for that it answers ("the way to edit the text of a note: proofread, rewrite, expand"), and the read abilities say that they, not a browser, are how a note is found and read: an agent that can reach the site another way chooses by these words. The labels are Guide, List notes, Get note, Get library, List suggestions, Suggest edits, Suggest blocks, Suggest details, Comment and Withdraw suggestions.

Core (7.1) answers a bad input with `ability_invalid_input` and a refused permission with `ability_invalid_permissions`, and drops the error a `permission_callback` returns. The abilities are registered with an `ability_class` of the plugin's own that turns the first into `invalid_args`, with core's wording of what is wrong, and the second into `not_found`. Input schemas take no field they do not name: an unknown field is `invalid_args`.

| Ability | Kind | `readonly` |
|---|---|---|
| `writer/guide` | Read | true |
| `writer/notes-list` | Read | true |
| `writer/note-get` | Read | true |
| `writer/library-get` | Read | true |
| `writer/suggestions-list` | Read | true |
| `writer/suggest-edits` | Suggest | false |
| `writer/suggest-blocks` | Suggest | false |
| `writer/suggest-details` | Suggest | false |
| `writer/comment` | Suggest | false |
| `writer/suggestions-withdraw` | Suggest | false |

## Errors

An error is a `WP_Error` whose code is the code below and whose message is the code, a colon, a space and the message: `not_found: Note 214 was not found.` What carries abilities to an agent may pass on the message alone, so the code is in it.

| Code | When | Message |
|---|---|---|
| `invalid_args` | The input does not match the schema, or breaks a rule stated for a field | What is wrong, naming the field |
| `not_found` | A note, ask, suggestion, block path, quoted passage or category named in the input does not exist, or the note is not the user's to edit | `{Thing} {value} was not found.`; for a passage, `The quoted text was not found in block {path}. Read the note again.` |
| `not_allowed` | `suggest-blocks` holds a block the Writer editor does not offer | `The Writer editor does not offer the block {name}.` |
| `not_yours` | `suggestions-withdraw` names a suggestion another user made | `Suggestion {id} was made by someone else.` |
| `too_many` | The note would hold more than 200 open suggestions | `This note already has {n} open suggestions.` |
| `failed` | The database refused a write | `The suggestions could not be stored. Nothing was stored.` |

A call that fails stores nothing: a pass is stored whole or not at all.

## Read

### `writer/guide`

How to work on this site. No input. Result: `{ "guide": "…", "style": "…" }`, where `guide` is the text of Guide below and `style` is the calling user's style sheet, or the empty string (`README.md`, Q3).

### `writer/notes-list`

Find notes the user may edit.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `status` | `draft`, `pending`, `publish`, `future` or `any` | no | Default `any`: drafts, pending, published, scheduled and private notes, as the app's Notes view, without the Trash |
| `search` | string, at most 200 characters | no | As the note list's search |
| `category`, `tag` | string | no | A term's name or slug. One that does not exist is `not_found` |
| `page` | integer, 1 or more | no | 20 notes a page, newest change first |

Result: `{ "notes": [ { "id", "title", "status", "modified", "words", "suggestions", "asks" } ], "pages": 3 }`. `suggestions` and `asks` count the open ones. `pages` counts the pages of the query; a note it finds that the user may not edit (`edit_post`) is left out of its page, which then holds fewer than 20.

### `writer/note-get`

One note as text.

| Field | Type | Required |
|---|---|---|
| `note` | integer | yes |

Result:

```json
{
    "note": {
        "id": 214, "title": "The case for writing badly first", "status": "draft",
        "excerpt": "", "categories": [ "Craft" ], "tags": [ "process" ],
        "modified": "2026-11-26T18:37:00", "words": 412, "from": "note"
    },
    "blocks": [
        { "path": [ 0 ], "name": "core/paragraph", "text": "Every draft I have ever finished…", "html": "Every draft I have ever finished…" }
    ],
    "asks": [
        { "id": 88, "text": "Is this metaphor doing too much?", "path": [ 6 ], "quote": "A bad first draft is a map drawn from memory.", "replies": 0 }
    ],
    "suggestions": [
        { "id": 91, "kind": "edit", "status": "open", "pass": "Tighten", "path": [ 4 ], "quote": "…", "replacement": "…", "reason": "…" }
    ]
}
```

`from` is `autosave` when the user's autosave was read. `blocks` is as Reading a note gives it. `asks` lists the core notes with no parent that are not resolved (`comment_approved` 0) and that no agent made; `replies` leaves out the empty children core adds to record a resolve or a reopen. An ask the note no longer names has `path` null and an empty `quote`. `suggestions` lists the open ones.

### `writer/library-get`

The site's categories and tags: `{ "categories": [ … ], "tags": [ … ] }`, each term as `{ "name", "slug", "count" }`, a category also with `parent`, its parent's slug or the empty string. No input. An agent suggests terms from this list.

### `writer/suggestions-list`

What became of suggestions, so an agent learns what this writer dismisses.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `note` | integer | yes | |
| `status` | `open`, `accepted`, `dismissed`, `withdrawn` or `any` | no | Default `any` |

Result: `{ "suggestions": [ … ] }`, each as in `note-get`, with `status`, `date` and `ask` where it answers one. The newest 100.

A suggestion in a result carries its change's own fields beside `id`, `kind`, `status`, `pass` and `reason`: `replacement` for an edit; `op`, `block`, `after` and `markup` for blocks; `field` and `value` for a detail. `path` is null and `quote` the empty string where it has no anchor.

## Suggest

Every suggest ability takes these two fields beside its own:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `note` | integer | yes | |
| `ask` | integer | no | The ask this answers. The suggestions are stored as replies to it (A6) |

Each returns `{ "pass": "uuid", "suggestions": [ id, … ] }`.

### `writer/suggest-edits`

One pass of text edits.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `pass` | string, 1 to 40 characters | yes | The label the writer sees: "Proofread", "Tighten" |
| `edits` | array of 1 to 50 edits | yes | |

An edit:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `path` | path | yes, unless `ask` is given and `quote` is not | The block |
| `quote` | string, 1 to 2000 characters | yes, unless `ask` is given | The passage to replace, as it reads in the block's `text` |
| `occurrence` | integer, 1 or more | when `quote` occurs more than once in the block | Which one |
| `replacement` | string, at most 4000 characters | yes | What replaces it. The empty string removes the passage. It may hold the inline formatting a block's `html` shows: `strong`, `em`, `a` with `href`, `code`, `s`, `sub`, `sup`. Anything else is removed |
| `reason` | string, at most 300 characters | no | Shown on the card |

To add text, quote the words it goes beside and give them back with the addition. Two edits of one call must not overlap in a block: that is `invalid_args`.

`_wfw_change` is `{ "replacement": "…" }`.

### `writer/suggest-blocks`

Insert, remove or move whole top-level blocks.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `pass` | string, 1 to 40 characters | yes | |
| `changes` | array of 1 to 20 changes | yes | |

A change:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `op` | `insert`, `remove` or `move` | yes | |
| `block` | integer, 0 or more | for `remove` and `move` | The top-level block |
| `after` | integer, -1 or more | for `insert` and `move` | The top-level block it goes after. -1 is the start of the note |
| `markup` | string of block markup, at most 20000 characters | for `insert` | Parsed with `parse_blocks()`. Every block in it must be one `wfw_allowed_block_types()` offers, else `not_allowed`. Markup that yields no block is `invalid_args`, and so is markup that holds anything but white space outside a block (`markup holds text outside a block.`) |
| `reason` | string, at most 300 characters | no | |

`_wfw_change` is the change without `reason`. The anchor is that of the block named by `block`, or by `after` for an insert.

### `writer/suggest-details`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `titles` | array of 1 to 5 strings, each at most 200 characters | at least one of the four | Options for the title. The writer picks one or keeps theirs |
| `excerpt` | string, at most 600 characters | | |
| `tags` | array of 1 to 10 strings, each at most 100 characters | | Tags to add, by name |
| `categories` | array of 1 to 5 strings, each at most 100 characters | | Categories to add, by name. Each must exist, else `not_found` |
| `reason` | string, at most 300 characters | no | |

One suggestion is stored for each of the four fields given, in one pass labelled "Details". `_wfw_change` is `{ "field": "titles", "value": [ … ] }`, and so on.

### `writer/comment`

A remark on a passage, with no change proposed: a question for the writer, a fact to check. It is stored as a pass labelled "Comment". The two labels the surface gives itself, "Details" and "Comment", are stored in English whatever the site's language, as the labels agents read back.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `path`, `quote`, `occurrence` | as for an edit | as for an edit | The passage |
| `text` | string, 1 to 600 characters | yes | The remark |

### `writer/suggestions-withdraw`

| Field | Type | Required |
|---|---|---|
| `note` | integer | yes |
| `suggestions` | array of 1 to 200 integers | yes |

Sets each named suggestion that is `open` to `withdrawn`. One the calling user did not make is `not_yours`, and nothing is withdrawn. Result: `{ "withdrawn": [ id, … ] }`. It takes no `ask`.

## Guide

The text `writer/guide` returns as `guide`, verbatim:

```text
# Working on a writer's notes

Notes are the writer's posts and drafts. You can read them and suggest changes. You cannot change them: every suggestion waits beside its note, and the writer accepts or dismisses it in the Writer editor.

Whatever the writer asks of a post, a draft or a note on this site (read it, proofread it, rewrite, expand or cut a passage, a title, tags), do it with the `writer/` abilities and nothing else. A browser, wp-admin, the REST API and other WordPress tools are not ways to do it, even when you can reach the site by them: what they change, the writer never reviews.

How to work:
1. Read the style sheet that came with this text, if there is one, and follow it.
2. Run `writer/note-get` for the note. Read its asks first: an ask is a question the writer left on a passage, for you.
3. Answer an ask with `writer/suggest-edits` or `writer/comment`, passing its id as `ask`.
4. Suggest other changes only if the writer asked you for them in this conversation.
5. Say what you suggested and how many suggestions wait in the note.

Rules:
- Quote a passage exactly as it reads in the block's `text`. If a call fails with `not_found`, the note has changed: read it again.
- Keep each edit small. Ten edits of a phrase each are easier to accept than one that rewrites a paragraph.
- Give a short reason with an edit. It is shown to the writer.
- Keep the formatting a passage had: a block's `html` shows it.
- One pass is one call. Label it with what it does: "Proofread", "Tighten", "Fact check".
- Suggest tags and categories from `writer/library-get`.
- Run `writer/suggestions-list` before a second pass on a note, and do not suggest again what the writer dismissed.
- When the writer names a suggestion ("suggestion 91 on note 214"), it is one of yours that they want changed. Find it by its `id` in `writer/note-get`, withdraw it with `writer/suggestions-withdraw`, and suggest what they asked for in its place.
- Never read, publish, save or edit a note in another way.
```
