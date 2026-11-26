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
- Core notes: comments of the type `note`, left out of comment queries unless asked for by type. A core note on a text selection (since 7.1) is anchored in raw content by `<mark class="wp-note" data-id="N">`, which `wp_strip_inline_note_markers()` removes from rendered output. A core note on a whole block is named in the block's `metadata.noteId`. Replies are child comments; trashing or deleting a top-level core note takes its replies with it. The resolved state is the comment meta `_wp_note_status`.

## Who may call

- Every ability's `permission_callback` requires a logged-in user who passes `wfw_user_can_write()`.
- An ability that names a note also requires `current_user_can( 'edit_post', $id )`, that the post's type is `post`, and that it is not in the Trash. A note that fails any of these is `not_found`, with one message, so an ability does not tell which ids exist (as the editor page does).
- What signs an agent in is the site's: an application password, an OAuth server, `--user` under WP-CLI. The surface has no sign-in of its own and names no agent product.

## Records

### Suggestions

One comment per suggestion.

| Field | Value |
|---|---|
| `comment_post_ID` | The note |
| `comment_type` | `note` when the suggestion answers an ask (A6), with `comment_parent` the ask. Otherwise `wfw_suggestion` (A7), with no parent |
| `user_id`, `comment_author` | The user the call ran as |
| `comment_approved` | `1` |
| `comment_content` | Plain text a person can read with no editor of ours: for a text edit, `Suggests: “{replacement}”` and the reason on the next line; for the other kinds, the reason or the comment itself |
| `comment_agent` | `wfw-agent/{source}` |

Comment meta, none of it shown in core's REST routes:

| Key | Holds |
|---|---|
| `_wfw_kind` | `edit`, `blocks`, `details` or `comment` |
| `_wfw_status` | `open`, `accepted`, `dismissed` or `withdrawn` |
| `_wfw_pass` | A UUID shared by the suggestions of one call |
| `_wfw_pass_label` | The pass's label, at most 40 characters |
| `_wfw_source` | The label of the way in: `cli` under WP-CLI, otherwise `abilities` |
| `_wfw_anchor` | JSON, see Placing |
| `_wfw_change` | JSON, the proposal itself, in the shape `abilities.md` gives for its kind |

A comment is an agent's when it has `_wfw_kind`. Nothing else decides it.

`wfw_suggestion` comments are kept out of every comment query that does not ask for the type by name, as core keeps `note` out, and out of comment counts (spike S3). They are deleted with their note, as comments are.

Limits: a note holds at most 200 open suggestions. A call that would pass it fails with `too_many` and stores nothing.

### Asks

An ask is a core note with no parent and no `_wfw_kind`, made by the editor through core's own REST route, in core's own shape (`editor.md`, spike S1). The surface adds nothing to it. A core note made in wp-admin's editor is an ask too.

### Site

| Option | Holds |
|---|---|
| `wfw_agent_seen` | The time a way in was last used on this site, as a Unix timestamp. Set by every ability call and every `wp writer` subcommand. Not autoloaded. Removed on uninstall |

Uninstall also deletes every `wfw_suggestion` comment and the `_wfw_*` meta of every other comment. Core notes stay: they are the site's.

## Reading a note

What an agent is given as a note's text, and what a suggestion is checked against.

- The source is the post, or the calling user's autosave of it when that is newer (`wp_get_post_autosave( $id, $user_id )`).
- The content is parsed with `parse_blocks()`. Blocks with no name are left out and do not count.
- A **path** is an array of zero-based indexes: the first picks a top-level block, each further one an inner block of the previous. Blocks are listed depth-first.
- A block's **text** is the plain text of its own rich text, without its inner blocks': tags and core note markers removed, entities decoded, nothing else changed. A block with no text of its own (an image with no caption, a list, a separator) has the empty string.
- A block's **html** is the same rich text with its inline formatting, markers removed.

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

- `quote` is at most 2000 characters, not empty, and must occur in the text of the block at `path`. If it occurs more than once, the input's `occurrence` (1 for the first) is required; without it the call fails with `invalid_args`.
- `prefix` and `suffix` are the 32 characters of the block's text before and after the passage, fewer at the block's edges. The ability works them out; an agent does not send them.
- A suggestion about a whole block (`blocks`) has the block's `path` and `name`, and as `quote` the first 64 characters of its text.
- A suggestion about a detail (`details`) has no anchor.
- A suggestion that answers an ask and gives no `quote` takes the ask's passage: the text inside its marker, or the whole block's text for an ask on a block.

When the editor shows a suggestion it looks for the passage in the note as it is now, unsaved edits included:

1. In the block at `path`, if it has that `name`: the `quote` with the same `prefix` and `suffix`.
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

`call` without `--user` fails with `not_found`, as a logged-out call does. An `--input` that is not JSON is `invalid_args`.

## What a site pays (A10)

- Where `wfw_agent_seen` does not exist and the note has no core note, the editor page loads nothing of the surface and sends no request for it. It learns both from its config when it loads (`wfwEditor.agent`).
- Otherwise the stub loads Review. While the editor is in view and `wfw_agent_seen` is less than 10 minutes old, Review asks for the note's suggestions every 5 seconds. Outside that it learns of new ones from the Heartbeat the editor already runs.
- Registering the abilities costs what `wp_register_ability()` costs, on requests where the Abilities API fires its hooks.

## Routes for the editor

Under `wfw/v1`, called with the REST nonce, requiring what Who may call requires for the note.

| Route | Does |
|---|---|
| `GET /wfw/v1/notes/{id}/suggestions` | The note's suggestions that are `open`, and those settled in the last day, each with its kind, status, pass, anchor, change, reason, author and date, and the ask it answers |
| `POST /wfw/v1/suggestions/{id}` | Sets `_wfw_status` to `accepted`, `dismissed` or back to `open`. Body: `{ "status": … }`. It changes nothing else: the note is changed by the editor |

`GET` and `POST` on core's own comments route carry asks and their replies.

The posts the app lists carry a count of open suggestions in a REST field, `wfw_suggestions`, present only in the `edit` context.
