# In the editor

What the writer sees of an agent, and what they do about it. Read `README.md` for the rule and `surface.md` for the records and Placing. Mockups: https://claude.ai/artifact/34M5BULQXSTbWe9sgmg2oo.

Everything here is drawn by Review (`assets/suggest.js`, `assets/suggest.css`), which the editor loads on demand (`surface.md`, What a site pays). Strings are translated like every other string of the plugin. Colours come from the appearance's `--wfw-*` tokens.

## Marks

| ID | Mark | What | When |
|---|---|---|---|
| W1 | Passage | The passage a suggestion is about is highlighted in `--wfw-mark`. For an edit it is also struck through. The mark is drawn over the canvas with the CSS Custom Highlight API (spike S2) and is never part of the note's content | For each open suggestion that has a passage and is not out of date |
| W2 | Card | One card per open suggestion, in a rail beside the note, in the order of their passages; details and out-of-date suggestions come last. A card shows its kind, the proposal and the reason | While the note has open suggestions or unresolved asks |
| W3 | Pass header | Above the cards of a pass: its label, "Agent", the time, and "Accept all" | For each pass with an open suggestion |
| W4 | Chip | Beside Save: "{n} suggestions". A click opens the rail, or the sheet on a narrow pane | While the note has open suggestions |
| W5 | List count | A dot and the count on the note's row in the note list | While the note has open suggestions. The editor tells the app with a `suggestions` message; for notes not open, the app reads the `wfw_suggestions` REST field |
| W6 | Ask | Core's own marker on the passage, and a card "You asked" with the question, its replies and Resolve | For each unresolved ask |

A core note marker (`mark.wp-note`) is content, and is drawn by the `core/note` format the editor already registers. W1 is not content.

The rail is 280px wide beside the note when the editor pane is at least 900px wide. Below that the cards are a sheet at the foot of the editor, showing the active card, with previous and next. The rail and the sheet each have a Close control, and the chip opens them again. With asks and no open suggestions there is no chip, and Close is the only way to hide the rail. On a phone nothing of Review shows (A12): the stub does not load it there, and Review shows nothing while a window it was loaded in is as narrow as a phone.

The marks do not depend on the way in (A11). Nothing shows which agent product made a suggestion: the surface does not know it.

## Active suggestion

One suggestion is active at a time. Its passage is underlined in `--wfw-accent` over a stronger tint (`--wfw-accent` mixed into `--wfw-mark`), and its card shows its actions. The CSS Custom Highlight API paints a background and text decorations only: no browser draws an outline, a border or a shadow in `::highlight()` (spike S2).

- A click on a marked passage or on a card makes it active and scrolls the other into view.
- Putting the caret in a marked passage makes it active.
- With a card in focus: Enter accepts, Backspace or Delete dismisses, the down and up arrows move to the next and previous card.

## Accepting

Accepting changes the note in the editor and nowhere else (A3).

| Kind | Accepting does |
|---|---|
| `edit` | Replaces the passage in its block's rich text with the replacement |
| `blocks` | Inserts the parsed blocks, removes the block, or moves it to after the block the suggestion named, wherever that block is now. Of the parsed blocks only those that are valid and of a type the editor allows are inserted (its `allowedBlockTypes` setting), inner blocks included. When none is left nothing is inserted, a snackbar says so and the suggestion stays open |
| `details`, titles | The card lists the options. Choosing one sets the title. "Keep mine" dismisses |
| `details`, excerpt | Sets the excerpt |
| `details`, tags and categories | Adds the terms to the note, as the categories and tags form does. A tag that does not exist is created if the user may; otherwise it is left out and the card says so |
| `comment` | Has no Accept. Its one action is Resolve, which dismisses it |

- Each accept is one step of undo in the editor.
- After the edit the suggestion's status is set to `accepted` (`surface.md`, Routes for the editor) and a snackbar says "Accepted." with Undo. Undo takes the edit back and sets the status to `open`. The editor's own Undo (Cmd/Ctrl+Z) does the same.
- "Accept all" accepts every suggestion of the pass that has an Accept and is not out of date, as one step of undo, with one snackbar: "Accepted {n} suggestions." Each is placed in the note as it was before any of them: blocks are inserted, removed and moved first, then each passage is replaced, so accepting one does not put another out of date. Of two that overlap, the first is accepted.
- Dismiss sets the status to `dismissed`, with a snackbar and Undo.
- A draft autosaves the accepted change as it does typing. A published note keeps it as unsaved changes until Update.
- A suggestion is accepted only into the note the editor shows. If the note is locked by another user, the cards show and their actions are disabled.

Formatting: the replacement carries its own inline formatting. Formatting that covered the whole replaced passage and that the replacement does not carry is applied to the replacement.

## Out of date

A suggestion whose passage is not found (`surface.md`, Placing) has no W1. Its card reads "The text has changed since this was suggested." and offers Dismiss only. It is checked again whenever the note's content changes, so Undo can bring it back.

Two open edits whose passages overlap: accepting one makes the other out of date.

## Asks

- With text selected, the formatting pill offers **Ask**. It opens a field at the selection: the question, at most 600 characters, and "Leave for an agent". Enter sends, Esc closes.
- Sending makes a core note on the selection, as core's editor does (spike S1): the comment through core's REST route with the status `hold` (an open core note), core's marker in the block (`<mark data-id="N" class="wp-note">`) and the id added to the block's `metadata.noteId`, an array. The marker and the attribute are an edit of the note, saved with it like any other.
- With no selection and the caret in a block, Ask is about the whole block: the id goes in `metadata.noteId` alone.
- An agent's answer shows under the ask as a reply. A reply that is a suggestion has W1 on its passage and Accept and Dismiss on its card, as any suggestion.
- Resolve on the ask's card does what core does: it sets the ask's status to `approved`, adds an empty child comment with `_wp_note_status` `resolved` to record it, and takes the marker out (the id stays in `metadata.noteId`). Replies still open are dismissed. A thread is shown without those empty children.
- Ask is offered only once a way in has been used on the site, or once the note has a core note (`README.md`, Q2).

There is no model on the site and nothing here calls one: an ask waits until an agent reads the note.

## Peek with a pass applied

W3 has a second action, "Peek". It opens a peek sheet beside the editor that shows the note as it would read with every suggestion of that pass accepted. The editor works the text out and hands it to the app, which shows it as any peek: read only, with selectable text. Nothing is changed by it.

The sheet holds the text as it was when Peek was pressed; pressing Peek again replaces it. A sheet holds one pass.

## Messages

Between the editor frame and the app, in the shapes the two already use (`source: 'wfw-frame'` and `source: 'wfw'`).

| From | Type | Carries |
|---|---|---|
| Editor | `suggestions` | `count`, the note's open suggestions, sent once Review has them and whenever the count changes. The app takes it from any open tab's editor, for that tab's note |
| Editor | `peek-pass` | `title`, `content`, `label`, for Peek with a pass applied. `content` is the note's block markup with the pass applied and core note markers taken out. The app takes it only from the editor in view, cleans it as it does any peek, and keeps none of it |

## For tests

- The chip has `data-wfw-suggestions` with the count.
- A card has `data-wfw-suggestion` with the id, and `data-wfw-state` of `open`, `active` or `stale`.
- An ask's card has `data-wfw-ask` with the ask's id.
- The Ask button in the block toolbar has the class `wfw-ask-button`.
- The canvas document's root has `data-wfw-marks` with the number of W1 marks drawn.
