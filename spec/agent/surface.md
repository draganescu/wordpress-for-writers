# Surface

The parts of the agent surface, what it stores, and how a call reaches it. Read `README.md` first for the rule, the terms and the decisions (A1 to A11).

Names, values and limits in this file are the spec's own choice unless a line cites core. A builder may propose better ones; they do not change silently.

## Parts

| Part | Where | Responsibility |
|---|---|---|
| Store | `includes/suggestions.php` | The records below, the functions that read and write them, and the REST routes the editor uses |
| Abilities | `includes/abilities.php` | The category, the abilities of `abilities.md` and the guide. Holds no storage code: it calls the store |
| `wp writer` | `includes/abilities-cli.php`, loaded only under WP-CLI | The command below |
| Review | `assets/suggest.js`, `assets/suggest.css` | `editor.md`. Loaded by the editor on demand |
| Stub | In `assets/editor.js` | Decides whether Review is loaded, and nothing else of the surface |

The three PHP files and the two assets can be deleted together, with the stub, and the plugin works as it did before.

Core, as read in WordPress 7.1.5:

- The Abilities API (since 6.9): `wp_register_ability_category()` on `wp_abilities_api_categories_init`, `wp_register_ability()` on `wp_abilities_api_init`. `permission_callback` is required. `required_capabilities` is not in 7.1 and is not used.
- Core notes: comments of the type `note`, left out of comment queries unless asked for by type, and then listed in full only with a status too (`'type' => 'note', 'status' => 'all'`): by type alone only the approved, which are the resolved, come back. Its editor lists a core note that no block or marker names as "Original block deleted."
- A core note on a text selection (since 7.1) is anchored in raw content by a `<mark>` with the class `wp-note` and the id in `data-id` (core writes `<mark data-id="N" class="wp-note">`; a reader parses the tag and matches no literal string), which `wp_strip_inline_note_markers()` removes from rendered output, and its id is in the block's `metadata.noteId` as well. A core note on a whole block is named in `metadata.noteId` alone. `metadata.noteId` is an array of integers; core reads a bare number too.
- The resolved state is the top-level comment's own status: `comment_approved` 0 (REST `hold`) is open, 1 (REST `approved`) is resolved. Core's REST route makes an open core note only when asked for the status `hold`, and requires `edit_post` on the note's post. `_wp_note_status` (`resolved` or `reopen`) is written only on a new child comment with empty content that records the event; the top-level comment has no such meta. Resolving takes the marker out and leaves the id in `metadata.noteId`; deleting removes both.
- Replies are child comments; the empty children that carry `_wp_note_status` are events, not replies. Trashing or deleting a top-level core note takes its children with it.
- A core note made through core's REST route emails the post's author and those it mentions (the option `wp_notes_notify`). One inserted with `wp_insert_comment()` emails nobody.

## Who may call

- Every ability's `permission_callback` requires a logged-in user who passes `wfw_user_can_write()`.
- The `permission_callback` checks only that. A caller who fails it is answered `not_found` by `execute()`: by an ability that names a note as for a note that is not theirs (`Note {id} was not found.`), so it does not tell which ids exist, and by the others with `A user who may use Writer was not found.` A way in that checks permission itself, as the MCP Adapter does, answers in its own words and the call does not count as a use of the site.
- An ability that names a note also requires, where it reads the note, `current_user_can( 'edit_post', $id )`, that the post's type is `post`, and that it is not in the Trash. A note that fails any of these is `not_found`, with one message, so an ability does not tell which ids exist (as the editor page does).
- What signs an agent in is the site's: an application password, an OAuth server, `--user` under WP-CLI. The surface has no sign-in of its own and names no agent product.

## Records

### Suggestions

One comment per suggestion.

| Field | Value |
|---|---|
| `comment_post_ID` | The note |
| `comment_type` | `note`: every suggestion is a core note (A6, A7). One that answers an ask has the ask as `comment_parent`. One that answers none has no parent, and no marker in the content |
| `user_id`, `comment_author` | The user the call ran as |
| `comment_approved` | `0` while the suggestion is `open`, as core reads an open core note; `1` once it is `accepted`, `dismissed` or `withdrawn`, so wp-admin's editor lists it as resolved. The store keeps the two in step |
| `comment_content` | Plain text a person can read with no editor of ours: for a text edit, `Suggests: “{replacement}”` and the reason on the next line; for the other kinds, the reason or the comment itself, and with no reason a line that says what is proposed ("Suggests removing a block."). It is HTML where core shows it, so what an agent wrote is escaped in it |
| `comment_agent` | `wfw-agent/{source}` when stored. Core overwrites it with the browser's user agent on any REST update of the comment, so it holds only until wp-admin's editor touches the row (spike S3): `_wfw_source` is the record |

Comment meta, none of it shown in core's REST routes:

| Key | Holds |
|---|---|
| `_wfw_kind` | `edit`, `blocks`, `details` or `comment` |
| `_wfw_status` | `open`, `accepted`, `dismissed` or `withdrawn` |
| `_wfw_pass` | A UUID shared by the suggestions of one call |
| `_wfw_pass_label` | The pass's label, at most 40 characters |
| `_wfw_source` | The label of the way in: `cli` under WP-CLI, otherwise `abilities` |
| `_wfw_anchor` | JSON, see Placing |
| `_wfw_change` | JSON, the proposal itself, in the shape `abilities.md` gives for its kind; `{}` for a `comment` |
| `_wfw_reason` | The reason, as plain text; for a `comment`, the remark itself |
| `_wfw_settled` | The time the suggestion last left `open`, as a Unix timestamp. Absent while it is open |

A comment is an agent's when it has `_wfw_kind`. Nothing else decides it.

Core keeps `note` comments out of comment queries, counts and the public page; the surface adds nothing for that. A suggestion with no parent has no marker, so wp-admin's editor lists it as "Original block deleted." (A7, spike S3). A suggestion resolved there (core sets its `comment_approved` to 1) becomes `dismissed`, and one reopened there (back to 0) becomes `open` again: the store follows `transition_comment_status`. One that was accepted or withdrawn is not reopened from there: its comment is put back as resolved.

Nobody is emailed when the surface stores a suggestion or settles one. It is inserted with `wp_insert_comment()`, not through core's REST route, and the store keeps core from notifying the post's author while it sets the comment's status (`notify_post_author`). Core emails the post's author only when someone else resolves, reopens or replies to a suggestion in wp-admin's editor (the option `wp_notes_notify`), with the suggestion's text as a new note (spike S3).

Core's comments route does not move a suggestion: an update of one that would change its note, its author (the user, the name, the email or the URL) or its parent is refused, 403 (`rest_preprocess_comment`). Its status and its text stay core's to change.

The store keeps the limits `abilities.md` gives for a change (`markup`, `excerpt`, each title, tag and category), whoever calls it.

Limits: a note holds at most 200 open suggestions. A call that would pass it fails with `too_many` and stores nothing.

### Asks

An ask is a core note with no parent and no `_wfw_kind`, made by the editor through core's own REST route, in core's own shape (`editor.md`, spike S1). The surface adds nothing to it. A core note made in wp-admin's editor is an ask too. An ask is open while its `comment_approved` is 0. Its replies are its children, without the empty ones that carry `_wp_note_status`.

### Writer

| User meta | Holds |
|---|---|
| `wfw_style_sheet` | The style sheet `writer/guide` returns as `style` (`README.md`, Q3): plain text with its line breaks, at most 5000 characters. Shown in the user's REST `meta` in the `edit` context, and saved by the app as the appearance is: `POST /wp/v2/users/me` with `{ "meta": { "wfw_style_sheet": "…" } }`. Removed on uninstall |

### Site

| Option | Holds |
|---|---|
| `wfw_agent_seen` | The time a way in was last used on this site, as a Unix timestamp. Set by every ability call and every `wp writer` subcommand. Not autoloaded. Removed on uninstall |

Uninstall also deletes every comment that has `_wfw_kind`, with its meta. Asks and other core notes stay: they are the site's.

## Reading a note

What an agent is given as a note's text, and what a suggestion is checked against.

- The source is the post, or the calling user's autosave of it when that is newer (`wp_get_post_autosave( $id, $user_id )`).
- The content is parsed with `parse_blocks()`. Blocks with no name are left out and do not count.
- A **path** is an array of zero-based indexes: the first picks a top-level block, each further one an inner block of the previous. Blocks are listed depth-first.
- A block's **html** is its own rich text, without its inner blocks', with its inline formatting: core note markers are removed, and so is every tag that is not inline formatting (inline are `a`, `abbr`, `b`, `bdi`, `bdo`, `br`, `code`, `del`, `dfn`, `em`, `i`, `ins`, `kbd`, `mark`, `q`, `s`, `samp`, `small`, `span`, `strong`, `sub`, `sup`, `time`, `u`, `var`). Where such a tag stood between two runs of text (a pullquote's text and its citation, the cells of a table), the runs are joined by one newline. The line breaks and tabs that serialized markup leaves at the ends of a run are trimmed; runs of only white space are dropped.
- A block's **text** is the plain text of that html: a `br` is a newline, tags are removed, entities decoded, nothing else changed. A block with no text of its own (an image with no caption, a list, a separator) has the empty string.
- A character, wherever this folder counts them, is a Unicode code point.

A path names a place, not a block's identity. An agent that holds a path from earlier reads the note again before it suggests.

## Placing

How a suggestion finds its passage (A9).

When a suggestion is stored, the ability checks it against the note as read above and writes `_wfw_anchor`:

```json
{
    "path": [ 4 ],
    "name": "core/paragraph",
    "quote": "I stopped rereading anything until I reached the end.",
    "prefix": " would ever read it, and ",
    "suffix": ""
}
```

- `quote` is at most 2000 characters, not empty, and must occur in the text of the block at `path`. If it occurs more than once, the input's `occurrence` (1 for the first) is required; without it, or with one past the last, the call fails with `invalid_args`. Occurrences may overlap: each is looked for from one character after the start of the one before.
- `prefix` and `suffix` are the 32 characters of the block's text before and after the passage, fewer at the block's edges. The ability works them out; an agent does not send them.
- A suggestion about a whole block (`blocks`) has the block's `path` and `name`, as `quote` the first 64 characters of its text, and empty `prefix` and `suffix`. A block inserted at the start of the note (`after` is -1) has no anchor. A move's anchor also holds, as `after`, the anchor of the block it goes after, and is out of date when either block is not found.
- A suggestion about a detail (`details`) has no anchor.
- A suggestion that answers an ask and gives no `quote` takes the ask's passage: the text inside its marker, or, for an id that no marker carries, the whole text of the block whose `metadata.noteId` holds it. An ask the note no longer names has no passage, and such a suggestion fails with `not_found`.

When the editor shows a suggestion it looks for the passage in the note as it is now, unsaved edits included:

1. In the block at `path`, if it has that `name`: the `quote` with the same `prefix` and `suffix`. Failing that, the `quote` with the same `prefix` or the same `suffix`, if exactly one place in the block matches: an edit accepted beside a passage changes the text on one side of it.
2. Otherwise in every block of the note: the `quote` with the same `prefix` and `suffix`, if exactly one place matches.
3. Otherwise in every block: the `quote` alone, if exactly one place matches.

A suggestion not found by these is **out of date**. Out of date is worked out in the editor each time and is never stored: the passage may come back with Undo.

## Ways in

| Way in | State | What it needs from the plugin |
|---|---|---|
| The MCP Adapter plugin | Works once the abilities exist | `meta.mcp.public` true on each ability. The surface calls nothing of the adapter's |
| `wp writer` | Built with the abilities | Below |
| WebMCP | Later | Registers the same abilities in the editor page. Not built, and nothing here is shaped to prevent it |

`meta.show_in_rest` is not set: the abilities are not offered over core's REST route for abilities. A later way in that needs it decides that then.

## `wp writer`

Registered with `WP_CLI::add_command( 'writer', … )` only under WP-CLI. Three subcommands. Each prints one JSON document to standard output and nothing else, except `guide`. The exit code is 0 on success and 1 on failure.

| Subcommand | Does |
|---|---|
| `wp writer guide` | Prints the guide of `abilities.md` as plain text, with the style sheet of the user given by `--user`, if any |
| `wp writer abilities` | Prints the abilities as a JSON array of `{ "name", "description", "input" }`, read from the registry |
| `wp writer call <name> [--input=<json>]` | Runs one ability as the user given by `--user`, through `wp_get_ability()` and its `execute()`. `<name>` is the ability's name with or without the leading `writer/`. Prints `{ "ok": true, "result": … }` or `{ "ok": false, "error": { "code", "message" } }` |

`call` without `--user` fails with `not_found`, as a logged-out call does. An `--input` that is not JSON is `invalid_args`. A name that is no ability of the surface is `not_found`: `Ability writer/{name} was not found.` `guide` prints the guide and, when the user has a style sheet, a blank line, `# The writer's style sheet`, a blank line and the style sheet.

## What a site pays (A10)

- Where `wfw_agent_seen` does not exist and the note has no core note, the editor page loads nothing of the surface and sends no request for it. It learns both from its config when it loads (`wfwEditor.agent`: `seen`, `notes`, `now`, and only when Review is to be loaded `script`, `style`, `domain`, `translations`). If a way in is first used while the app is open, the app learns of it from the first `suggestions` message that counts a suggestion. The app learns of the site from `wfwSettings.agent` (`seen`, `styleSheet`, `styleSheetMax`) and adds no control while `seen` is 0.
- On a phone (A12) the editor page loads nothing of the surface either, and the app asks for no `wfw_suggestions` and adds no control.
- Otherwise the stub loads Review. While the editor is in view and `wfw_agent_seen` is less than 10 minutes old, Review asks for the note's suggestions every 5 seconds. Outside that it learns of new ones from the Heartbeat the editor already runs.
- Registering the abilities costs what `wp_register_ability()` costs, on requests where the Abilities API fires its hooks.

## Routes for the editor

Under `wfw/v1`, called with the REST nonce, requiring what Who may call requires for the note.

| Route | Does |
|---|---|
| `GET /wfw/v1/notes/{id}/suggestions` | `{ "suggestions": [ … ], "seen", "now" }`: the note's suggestions that are `open`, all of them, and of those settled in the last day the newest 100, newest first as one list, each as `{ "id", "note", "kind", "status", "pass" (the UUID), "label" (the pass's), "anchor" (or null), "change", "reason", "author": { "id", "name" }, "date" (GMT), "ask" (its id, or 0) }`; `seen` is `wfw_agent_seen` and `now` the server's clock |
| `POST /wfw/v1/suggestions/{id}` | Sets `_wfw_status` to `accepted`, `dismissed` or back to `open`, with `_wfw_settled` and the comment's status in step (Records), and answers with the suggestion. Body: `{ "status": … }`. It changes nothing of the note: the note is changed by the editor. A `withdrawn` suggestion stays withdrawn: 409, `withdrawn` |

A note or a suggestion that is not the user's, or does not exist, is 404 with the code `not_found` on both, with one message.

While Review does not ask for itself, it sends `wfw-suggestions: { "note": id }` with the Heartbeat and is answered `{ "note", "open", "latest", "seen", "now" }`: the count of open suggestions and the highest suggestion id on the note.

`GET` and `POST` on core's own comments route carry asks and their replies.

The posts the app lists carry a count of open suggestions in a REST field, `wfw_suggestions`, present only in the `edit` context.
