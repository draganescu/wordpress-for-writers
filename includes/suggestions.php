<?php
/**
 * The agent surface's store (spec/agent/surface.md): what an agent proposed for
 * a note, kept beside the note until the writer accepts or dismisses it.
 *
 * A suggestion is a core note (a comment of the type `note`) that carries the
 * `_wfw_kind` comment meta. Core keeps a core note's resolved state in the
 * comment's own status: on hold (`comment_approved` 0) is open, approved (1)
 * is resolved. A suggestion is stored on hold and its comment status is kept
 * in step with `_wfw_status`, so wp-admin's editor agrees with the Writer's.
 *
 * This file holds the records, the functions that read and write them, how a
 * note is read as text and how a suggestion finds its passage in it, the two
 * REST routes the Writer editor calls, and what the editor page and the app
 * are told when they load.
 *
 * Nothing here changes a note: no function or route edits a post. Accepting a
 * suggestion is an edit made in the Writer editor, which then only records
 * here that it was accepted.
 *
 * The abilities (includes/abilities.php) and `wp writer`
 * (includes/abilities-cli.php) hold no storage code: they call these functions.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The most open suggestions a note holds. A pass that would go over it is
 * refused whole (`too_many`).
 */
const WFW_SUGGESTIONS_MAX_OPEN = 200;

/**
 * The longest style sheet a writer can keep, in characters.
 */
const WFW_STYLE_SHEET_MAX = 5000;

/**
 * The longest each text of a suggestion may be, in characters: what the
 * abilities' schemas say (includes/abilities.php) and what the store checks
 * again, whoever calls it.
 */
const WFW_PASS_LABEL_MAX  = 40;
const WFW_REASON_MAX      = 300;
const WFW_COMMENT_MAX     = 600;
const WFW_QUOTE_MAX       = 2000;
const WFW_REPLACEMENT_MAX = 4000;
const WFW_MARKUP_MAX      = 20000;
const WFW_TITLE_MAX       = 200;
const WFW_TERM_MAX        = 100;
const WFW_EXCERPT_MAX     = 600;

/**
 * The inline tags a block's rich text is read with: its `html` keeps them and
 * every other tag ends a run of text.
 */
const WFW_INLINE_TAGS = 'a|abbr|b|bdi|bdo|br|code|del|dfn|em|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var';

// ---- Errors ------------------------------------------------------------------

/**
 * An error of the agent surface, in the one shape every ability returns
 * (spec/agent/abilities.md, Errors): the code, and a message that starts with
 * the code, since what carries an ability to an agent may pass on the message
 * alone.
 *
 * @param string $code    `invalid_args`, `not_found`, `not_allowed`, `not_yours`, `too_many` or `failed`.
 * @param string $message The message without the code, such as "Note 214 was not found.".
 * @return WP_Error Its data is array( 'status' => int ), the HTTP status the REST routes answer with.
 */
function wfw_agent_error( $code, $message ) {
    $statuses = array(
        'invalid_args' => 400,
        'not_found'    => 404,
        'not_allowed'  => 400,
        'not_yours'    => 403,
        'too_many'     => 409,
        'failed'       => 500,
    );
    return new WP_Error( $code, $code . ': ' . $message, array( 'status' => $statuses[ $code ] ) );
}

// ---- The site ------------------------------------------------------------------

/**
 * When a way in was last used on this site.
 *
 * @return int A Unix timestamp, or 0 when no agent has used the site.
 */
function wfw_agent_seen() {
    return (int) get_option( 'wfw_agent_seen', 0 );
}

/**
 * Records that a way in was used now. Every ability call and every `wp writer`
 * subcommand calls it; nothing else does. The option is not autoloaded.
 *
 * @return int The time stored.
 */
function wfw_agent_touch() {
    $now = time();
    update_option( 'wfw_agent_seen', $now, false );
    return $now;
}

// ---- Who may call --------------------------------------------------------------

/**
 * The note an ability or a route names, if it is the user's to work on
 * (surface.md, Who may call): the user is signed in and can use Writer, the
 * post exists, is a post, is not in the Trash, and the user may edit it. A
 * note that fails any of these is `not_found`, with one message, so nothing
 * tells which ids exist.
 *
 * @param int $note_id The post id.
 * @return WP_Post|WP_Error The note, or `not_found`: "Note {id} was not found."
 */
function wfw_agent_note( $note_id ) {
    $note_id = (int) $note_id;
    $user_id = get_current_user_id();
    $note    = $note_id > 0 ? get_post( $note_id ) : null;
    if (
        ! $user_id
        || ! wfw_user_can_write( $user_id )
        || ! $note
        || 'post' !== $note->post_type
        || 'trash' === $note->post_status
        || ! user_can( $user_id, 'edit_post', $note->ID )
    ) {
        return wfw_note_not_found( $note_id );
    }
    return $note;
}

/**
 * The error for a note that is not the user's to work on, whatever the reason.
 *
 * @param int $note_id The id asked for.
 * @return WP_Error `not_found`: "Note {id} was not found."
 */
function wfw_note_not_found( $note_id ) {
    /* translators: %d: the id of a note. */
    return wfw_agent_error( 'not_found', sprintf( __( 'Note %d was not found.', 'wordpress-for-writers' ), (int) $note_id ) );
}

// ---- The style sheet -------------------------------------------------------------

/**
 * A style sheet as stored: plain text with its line breaks, at most
 * WFW_STYLE_SHEET_MAX characters.
 *
 * @param mixed $value What was sent.
 * @return string
 */
function wfw_sanitize_style_sheet( $value ) {
    return mb_substr( is_string( $value ) ? wfw_plain_text( $value, true ) : '', 0, WFW_STYLE_SHEET_MAX );
}

/**
 * The style sheet a writer keeps for agents (spec/agent/README.md, Q3): how
 * they want their notes worked on, returned by `writer/guide` as `style`.
 * Stored in the user meta `wfw_style_sheet`, which the app saves through the
 * REST API as it saves the appearance, sanitised as it is stored
 * (wfw_sanitize_style_sheet()).
 *
 * @return string The current user's style sheet, or the empty string.
 */
function wfw_get_style_sheet() {
    $user_id = get_current_user_id();
    return $user_id ? (string) get_user_meta( $user_id, 'wfw_style_sheet', true ) : '';
}

add_action( 'init', function () {
    register_meta( 'user', 'wfw_style_sheet', array(
        'type'              => 'string',
        'single'            => true,
        'default'           => '',
        'sanitize_callback' => 'wfw_sanitize_style_sheet',
        'show_in_rest'      => array(
            'schema' => array(
                'type'      => 'string',
                'context'   => array( 'edit' ),
                'maxLength' => WFW_STYLE_SHEET_MAX,
            ),
        ),
    ) );

    /*
     * A suggestion's meta is the surface's own: registered so that core's
     * comment routes neither show it nor take it (no show_in_rest, and nobody
     * passes the edit_comment_meta check). The functions below write it directly.
     */
    foreach ( wfw_suggestion_meta_keys() as $key ) {
        register_meta( 'comment', $key, array(
            'type'          => 'string',
            'single'        => true,
            'show_in_rest'  => false,
            'auth_callback' => '__return_false',
        ) );
    }
} );

// ---- Reading a note --------------------------------------------------------------

/**
 * A block's rich text with its inline formatting (surface.md, Reading a
 * note): core note markers come out, every tag that is not inline formatting
 * comes out, and where such a tag stood between two runs of text (a
 * pullquote's text and its citation, the cells of a table) the runs are joined
 * by a newline. The line breaks and tabs serialized markup has at a run's ends
 * are not text and are trimmed.
 *
 * @param string $html A block's own HTML, without its inner blocks'.
 * @return string
 */
function wfw_rich_text_html( $html ) {
    $html = wp_strip_inline_note_markers( (string) $html );
    $runs = array();
    foreach ( preg_split( '~<(?!/?(?:' . WFW_INLINE_TAGS . ')\b)[^>]*>~i', $html ) as $run ) {
        $run = trim( $run, "\r\n\t" );
        if ( '' !== trim( $run ) ) {
            $runs[] = $run;
        }
    }
    return implode( "\n", $runs );
}

/**
 * The plain text of rich text: a line break is a newline, tags are removed and
 * entities decoded. Nothing else changes.
 *
 * @param string $html Rich text, as wfw_rich_text_html() returns it.
 * @return string
 */
function wfw_rich_text_plain( $html ) {
    $text = preg_replace( '~<br\s*/?>~i', "\n", (string) $html );
    $text = preg_replace( '~<[^>]*>~', '', $text );
    return html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
}

/**
 * A block's text, from its own HTML: what an agent is given as its `text`.
 *
 * @param string $raw A block's own HTML, without its inner blocks'.
 * @return string
 */
function wfw_block_text( $raw ) {
    return wfw_rich_text_plain( wfw_rich_text_html( $raw ) );
}

/**
 * Every named block of a note's content, depth-first, each with its path and
 * what the parser gave for it. Blocks with no name are left out and do not
 * count in a path.
 *
 * @param string $content Block markup.
 * @return array[] Each array( 'path' => int[], 'name' => string, 'attrs' => array, 'raw' => string ), `raw` being the block's own HTML.
 */
function wfw_note_walk( $content ) {
    return wfw_blocks_walk( parse_blocks( (string) $content ) );
}

/**
 * wfw_note_walk(), of content already parsed.
 *
 * @param array[] $blocks Blocks, as parse_blocks() returns them.
 * @return array[] As wfw_note_walk().
 */
function wfw_blocks_walk( $blocks ) {
    $found = array();
    $walk  = function ( $blocks, $prefix ) use ( &$walk, &$found ) {
        $index = 0;
        foreach ( $blocks as $block ) {
            if ( empty( $block['blockName'] ) ) {
                continue;
            }
            $path    = array_merge( $prefix, array( $index ) );
            $found[] = array(
                'path'  => $path,
                'name'  => $block['blockName'],
                'attrs' => is_array( $block['attrs'] ) ? $block['attrs'] : array(),
                'raw'   => (string) $block['innerHTML'],
            );
            if ( ! empty( $block['innerBlocks'] ) ) {
                $walk( $block['innerBlocks'], $path );
            }
            ++$index;
        }
    };
    $walk( $blocks, array() );
    return $found;
}

/**
 * A note's content as the blocks an agent is given (surface.md, Reading a
 * note), depth-first.
 *
 * @param string $content Block markup.
 * @return array[] Each array( 'path' => int[], 'name' => string, 'text' => string, 'html' => string ).
 */
function wfw_note_blocks( $content ) {
    return array_map( function ( $block ) {
        $html = wfw_rich_text_html( $block['raw'] );
        return array(
            'path' => $block['path'],
            'name' => $block['name'],
            'text' => wfw_rich_text_plain( $html ),
            'html' => $html,
        );
    }, wfw_note_walk( $content ) );
}

/**
 * When a note, or an autosave of it, was last changed: GMT, as
 * "2026-11-26T18:37:00". From the local time: a draft never saved again has no
 * post_modified_gmt.
 *
 * @param WP_Post $post The post or the autosave.
 * @return string
 */
function wfw_note_modified( $post ) {
    return (string) mysql_to_rfc3339( get_gmt_from_date( $post->post_modified ) );
}

/**
 * A note as an agent reads it: the post, or the current user's autosave of it
 * when that is newer. It checks nothing about who asks; call wfw_agent_note()
 * first.
 *
 * @param WP_Post $note The note.
 * @return array array( 'from' => 'note'|'autosave', 'title' => string, 'excerpt' => string, 'content' => string,
 *               'modified' => string (GMT, as "2026-11-26T18:37:00"), 'blocks' => array[] as wfw_note_blocks() ).
 */
function wfw_note_read( $note ) {
    $user_id  = get_current_user_id();
    $source   = $note;
    $from     = 'note';
    $autosave = $user_id ? wp_get_post_autosave( $note->ID, $user_id ) : false;
    if ( $autosave && mysql2date( 'U', $autosave->post_modified_gmt, false ) > mysql2date( 'U', $note->post_modified_gmt, false ) ) {
        $source = $autosave;
        $from   = 'autosave';
    }
    return array(
        'from'     => $from,
        'title'    => $source->post_title,
        'excerpt'  => $source->post_excerpt,
        'content'  => $source->post_content,
        'modified' => wfw_note_modified( $source ),
        'blocks'   => wfw_note_blocks( $source->post_content ),
    );
}

// ---- Placing -------------------------------------------------------------------

/**
 * A path as messages print it: "[4]", "[2,0]".
 */
function wfw_path_label( $path ) {
    return '[' . implode( ',', array_map( 'intval', (array) $path ) ) . ']';
}

/**
 * The block at a path, among blocks as wfw_note_blocks() returns them.
 *
 * @param array[] $blocks The note's blocks.
 * @param int[]   $path   The path.
 * @return array|WP_Error The block, or `not_found`: "Block {path} was not found."
 */
function wfw_block_at( $blocks, $path ) {
    $path = array_map( 'intval', array_values( (array) $path ) );
    foreach ( $blocks as $block ) {
        if ( $block['path'] === $path ) {
            return $block;
        }
    }
    /* translators: %s: a block's path, such as [4]. */
    return wfw_agent_error( 'not_found', sprintf( __( 'Block %s was not found.', 'wordpress-for-writers' ), wfw_path_label( $path ) ) );
}

/**
 * Where a quoted passage is in a block's text (surface.md, Placing).
 * Characters are Unicode code points. Occurrences are counted from 1 and may
 * overlap: each is looked for from one character after the start of the last.
 *
 * @param array[] $blocks     The note's blocks, as wfw_note_blocks() returns them.
 * @param int[]   $path       The block.
 * @param string  $quote      The passage, as it reads in the block's `text`: 1 to WFW_QUOTE_MAX characters.
 * @param int     $occurrence Which one, when the quote occurs more than once; 0 when not given.
 * @return array|WP_Error array( 'block' => array, 'start' => int, 'length' => int ), in characters of the block's text.
 *                        `not_found` when the block or the passage is missing; `invalid_args` for a quote that is
 *                        empty or too long, a missing `occurrence` where one is needed, or one past the last.
 */
function wfw_suggestion_locate( $blocks, $path, $quote, $occurrence = 0 ) {
    $block = wfw_block_at( $blocks, $path );
    if ( is_wp_error( $block ) ) {
        return $block;
    }
    $quote  = (string) $quote;
    $length = mb_strlen( $quote );
    if ( $length < 1 || $length > WFW_QUOTE_MAX ) {
        /* translators: %d: a number of characters. */
        return wfw_agent_error( 'invalid_args', sprintf( __( 'quote must be 1 to %d characters.', 'wordpress-for-writers' ), WFW_QUOTE_MAX ) );
    }
    $label  = wfw_path_label( $block['path'] );
    $starts = array();
    $from   = 0;
    while ( false !== ( $at = strpos( $block['text'], $quote, $from ) ) ) { // phpcs:ignore Generic.CodeAnalysis.AssignmentInCondition, WordPress.CodeAnalysis.AssignmentInCondition -- the usual strpos() loop.
        $starts[] = $at;
        $from     = $at + 1;
    }
    if ( ! $starts ) {
        /* translators: %s: a block's path, such as [4]. */
        return wfw_agent_error( 'not_found', sprintf( __( 'The quoted text was not found in block %s. Read the note again.', 'wordpress-for-writers' ), $label ) );
    }
    $occurrence = (int) $occurrence;
    if ( $occurrence < 1 && count( $starts ) > 1 ) {
        /* translators: 1: how many times, 2: a block's path, such as [4]. */
        return wfw_agent_error( 'invalid_args', sprintf( __( 'occurrence is required: the quoted text occurs %1$d times in block %2$s.', 'wordpress-for-writers' ), count( $starts ), $label ) );
    }
    if ( $occurrence > count( $starts ) ) {
        /* translators: 1: the occurrence asked for, 2: how many times, 3: a block's path, such as [4]. */
        return wfw_agent_error( 'invalid_args', sprintf( __( 'occurrence is %1$d, but the quoted text occurs %2$d times in block %3$s.', 'wordpress-for-writers' ), $occurrence, count( $starts ), $label ) );
    }
    return array(
        'block'  => $block,
        // The offsets strpos() gave are bytes; a passage is placed in characters.
        'start'  => mb_strlen( substr( $block['text'], 0, $starts[ max( 1, $occurrence ) - 1 ] ) ),
        'length' => $length,
    );
}

/**
 * The anchor of a passage at a known place in a block's text, as `_wfw_anchor`
 * stores it (surface.md, Placing): the block's path and name, the quote, and
 * the 32 characters of the block's text before and after it, fewer at the
 * block's edges.
 *
 * @param array $block  A block, as wfw_note_blocks() returns it.
 * @param int   $start  Where the passage starts, in characters.
 * @param int   $length How long it is, in characters.
 * @return array array( 'path' => int[], 'name' => string, 'quote' => string, 'prefix' => string, 'suffix' => string ).
 */
function wfw_anchor_at( $block, $start, $length ) {
    $before = min( 32, $start );
    return array(
        'path'   => $block['path'],
        'name'   => $block['name'],
        'quote'  => mb_substr( $block['text'], $start, $length ),
        'prefix' => mb_substr( $block['text'], $start - $before, $before ),
        'suffix' => mb_substr( $block['text'], $start + $length, 32 ),
    );
}

/**
 * The anchor of a whole block: its path and name, and as quote the first 64
 * characters of its text. Prefix and suffix are empty.
 *
 * @param array[] $blocks The note's blocks, as wfw_note_blocks() returns them.
 * @param int[]   $path   The block.
 * @return array|WP_Error array( 'path', 'name', 'quote', 'prefix', 'suffix' ), or `not_found`: "Block {path} was not found."
 */
function wfw_block_anchor( $blocks, $path ) {
    $block = wfw_block_at( $blocks, $path );
    if ( is_wp_error( $block ) ) {
        return $block;
    }
    return array(
        'path'   => $block['path'],
        'name'   => $block['name'],
        'quote'  => mb_substr( $block['text'], 0, 64 ),
        'prefix' => '',
        'suffix' => '',
    );
}

/**
 * The ids a block names in `metadata.noteId`: core writes an array of
 * integers, and reads a bare number too.
 */
function wfw_block_note_ids( $attrs ) {
    $ids = $attrs['metadata']['noteId'] ?? array();
    return array_values( array_filter( array_map( 'intval', is_array( $ids ) ? $ids : array( $ids ) ) ) );
}

/**
 * The passage of each core note that the content names. A core note on a
 * selection has a marker in the block, a `<mark>` with the class `wp-note` and
 * the id in `data-id`, and its id in the block's `metadata.noteId` as well: its
 * passage is the text inside the marker. A core note on a whole block is named
 * in `metadata.noteId` alone: its passage is the block's whole text. (Resolving
 * an inline core note takes its marker out and leaves the id in the attribute,
 * so a resolved one reads as its whole block.)
 *
 * @param string $content Block markup, markers included.
 * @return array<int, array> By core note id, each array( 'anchor' => array, as wfw_anchor_at() returns it,
 *                           'start' => int, where the passage starts in the block's text, in characters ).
 */
function wfw_note_marked_passages( $content ) {
    $passages = array();
    $blocks   = wfw_note_walk( $content );
    $passage  = function ( $block, $text, $start, $length ) {
        return array(
            'anchor' => wfw_anchor_at(
                array(
                    'path' => $block['path'],
                    'name' => $block['name'],
                    'text' => $text,
                ),
                $start,
                $length
            ),
            'start'  => $start,
        );
    };
    foreach ( $blocks as $block ) {
        foreach ( wfw_block_markers( $block['raw'] ) as $id => $at ) {
            if ( ! isset( $passages[ $id ] ) ) {
                $passages[ $id ] = $passage( $block, $at['text'], $at['start'], $at['length'] );
            }
        }
    }
    // What is left names a whole block.
    foreach ( $blocks as $block ) {
        foreach ( wfw_block_note_ids( $block['attrs'] ) as $id ) {
            if ( ! isset( $passages[ $id ] ) ) {
                $text            = wfw_block_text( $block['raw'] );
                $passages[ $id ] = $passage( $block, $text, 0, mb_strlen( $text ) );
            }
        }
    }
    return $passages;
}

/**
 * The core note markers in a block's own HTML, each with where its passage is
 * in the block's text. A marker with no text inside, or with no end, is left
 * out; of two with one id, the first that has a passage counts.
 *
 * @param string $raw A block's own HTML, markers included.
 * @return array<int, array> By core note id, each array( 'text' => string, the block's text, 'start' => int,
 *                           'length' => int ), the two in characters.
 */
function wfw_block_markers( $raw ) {
    $markers = array();
    if ( false === strpos( $raw, 'wp-note' ) || ! preg_match_all( '~<mark\b[^>]*>~i', $raw, $openers ) ) {
        return $markers;
    }
    $ends = array( "\x02", "\x03" );
    foreach ( array_unique( $openers[0] ) as $opener ) {
        // Parsed, not matched as a literal: core writes data-id before class, and either may be quoted either way.
        $tag = new WP_HTML_Tag_Processor( $opener );
        if ( ! $tag->next_tag( 'mark' ) || ! $tag->has_class( 'wp-note' ) ) {
            continue;
        }
        $id = (int) $tag->get_attribute( 'data-id' );
        if ( ! $id || isset( $markers[ $id ] ) ) {
            continue;
        }
        /*
         * The marker's two ends become two control characters that pass
         * through the reading untouched, so the passage is found in the same
         * text an agent is given, wherever other tags and markers fall.
         */
        $marked = '';
        $stack  = array();
        $rest   = $raw;
        while ( preg_match( '~<(/?)mark\b[^>]*>~i', $rest, $found, PREG_OFFSET_CAPTURE ) ) {
            $marked .= substr( $rest, 0, $found[0][1] );
            $rest    = substr( $rest, $found[0][1] + strlen( $found[0][0] ) );
            if ( '/' === $found[1][0] ) {
                $marked .= array_pop( $stack ) ? "\x03" : $found[0][0];
            } else {
                $ours    = $found[0][0] === $opener;
                $stack[] = $ours;
                $marked .= $ours ? "\x02" : $found[0][0];
            }
        }
        $text  = wfw_block_text( $marked . $rest );
        $start = strpos( $text, "\x02" );
        $end   = false === $start ? false : strpos( $text, "\x03", $start );
        if ( false === $end ) {
            continue;
        }
        $inside = str_replace( $ends, '', substr( $text, $start, $end - $start ) );
        if ( '' !== $inside ) {
            $markers[ $id ] = array(
                'text'   => str_replace( $ends, '', $text ),
                'start'  => mb_strlen( str_replace( $ends, '', substr( $text, 0, $start ) ) ),
                'length' => mb_strlen( $inside ),
            );
        }
    }
    return $markers;
}

// ---- Asks ------------------------------------------------------------------------

/**
 * The query for a note's open asks: core notes with no parent that no agent
 * made. An open one is on hold; core approves a core note to resolve it. Core notes
 * are only listed by type and with a status: by type alone, only the resolved
 * come back.
 */
function wfw_asks_query( $note_id ) {
    return array(
        'post_id'    => (int) $note_id,
        'type'       => 'note',
        'status'     => 'hold',
        'parent'     => 0,
        'orderby'    => 'comment_ID',
        'order'      => 'ASC',
        // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one note's core notes, a handful of rows.
        'meta_query' => array(
            array(
                'key'     => '_wfw_kind',
                'compare' => 'NOT EXISTS',
            ),
        ),
    );
}

/**
 * The asks of a note that are not resolved, each with its passage in the note
 * as the user reads it.
 *
 * @param WP_Post $note    The note.
 * @param string  $content Its content as the user reads it: wfw_note_read()'s `content`.
 * @return array[] Each array( 'id' => int, 'text' => string, 'path' => int[]|null, 'quote' => string, 'replies' => int ).
 *                 `path` is null and `quote` empty for an ask the note no longer names. `replies` leaves out the
 *                 empty children core adds to record a resolve or a reopen (they carry `_wp_note_status`).
 */
function wfw_note_asks( $note, $content ) {
    $asks = get_comments( wfw_asks_query( $note->ID ) );
    if ( ! $asks ) {
        return array();
    }
    $passages = wfw_note_marked_passages( $content );
    return array_map( function ( $ask ) use ( $passages ) {
        $id = (int) $ask->comment_ID;
        return array(
            'id'      => $id,
            'text'    => wfw_rich_text_plain( $ask->comment_content ),
            'path'    => $passages[ $id ]['anchor']['path'] ?? null,
            'quote'   => $passages[ $id ]['anchor']['quote'] ?? '',
            'replies' => (int) get_comments( array(
                'post_id'    => (int) $ask->comment_post_ID,
                'type'       => 'note',
                'status'     => 'all',
                'parent'     => $id,
                'count'      => true,
                // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one thread.
                'meta_query' => array(
                    array(
                        'key'     => '_wp_note_status',
                        'compare' => 'NOT EXISTS',
                    ),
                ),
            ) ),
        );
    }, $asks );
}

/**
 * How many asks of a note are not resolved.
 *
 * @param int $note_id The note.
 * @return int
 */
function wfw_asks_count_open( $note_id ) {
    return (int) get_comments( wfw_asks_query( $note_id ) + array( 'count' => true ) );
}

/**
 * An ask of a note: a core note on it with no parent that no agent made,
 * resolved or not.
 *
 * @param int $note_id The note.
 * @param int $ask_id  The core note's id.
 * @return WP_Comment|WP_Error The ask, or `not_found`: "Ask {id} was not found."
 */
function wfw_ask_get( $note_id, $ask_id ) {
    $ask = $ask_id > 0 ? get_comment( (int) $ask_id ) : null;
    if (
        ! $ask
        || 'note' !== $ask->comment_type
        || (int) $ask->comment_post_ID !== (int) $note_id
        || (int) $ask->comment_parent
        || in_array( $ask->comment_approved, array( 'trash', 'spam' ), true )
        || metadata_exists( 'comment', $ask->comment_ID, '_wfw_kind' )
    ) {
        /* translators: %d: the id of an ask. */
        return wfw_agent_error( 'not_found', sprintf( __( 'Ask %d was not found.', 'wordpress-for-writers' ), (int) $ask_id ) );
    }
    return $ask;
}

/**
 * The passage an ask is about, for a suggestion that answers it and quotes
 * nothing (surface.md, Placing).
 *
 * @param WP_Post $note    The note.
 * @param int     $ask_id  The ask.
 * @param string  $content The note's content as the user reads it: wfw_note_read()'s `content`.
 * @return array|WP_Error array( 'anchor' => array, as wfw_anchor_at() returns it, 'start' => int, where the
 *                        passage starts in its block's text, in characters ); `not_found` when the ask does not
 *                        exist ("Ask {id} was not found.") or its marker is no longer in the note
 *                        ("The passage of ask {id} was not found. Read the note again.").
 */
function wfw_ask_passage( $note, $ask_id, $content ) {
    $ask = wfw_ask_get( $note->ID, $ask_id );
    if ( is_wp_error( $ask ) ) {
        return $ask;
    }
    $passages = wfw_note_marked_passages( $content );
    if ( ! isset( $passages[ (int) $ask_id ] ) ) {
        /* translators: %d: the id of an ask. */
        return wfw_agent_error( 'not_found', sprintf( __( 'The passage of ask %d was not found. Read the note again.', 'wordpress-for-writers' ), (int) $ask_id ) );
    }
    return $passages[ (int) $ask_id ];
}

/**
 * Whether a note has a core note of any kind: an ask, a reply or a suggestion.
 * With `wfw_agent_seen`, it decides whether the editor loads Review.
 *
 * @param int $note_id The note.
 * @return bool
 */
function wfw_note_has_core_note( $note_id ) {
    return (bool) get_comments( array(
        'post_id'                   => (int) $note_id,
        'type'                      => 'note',
        'status'                    => 'all',
        'number'                    => 1,
        'fields'                    => 'ids',
        'update_comment_meta_cache' => false,
    ) );
}

// ---- Sanitising ------------------------------------------------------------------

/**
 * Plain text as it was typed: what core's text sanitisers leave of it, with
 * the `<` they wrote as `&lt;` put back. They write one that opens no tag so,
 * for text on its way into HTML. A label, a reason, a title or a style sheet
 * is never set as HTML: it is shown as text, where the entity would show as
 * it is.
 *
 * @param string $raw       What was sent.
 * @param bool   $multiline Whether its line breaks are kept (sanitize_textarea_field()) or it is one line
 *                          (sanitize_text_field()).
 * @return string
 */
function wfw_plain_text( $raw, $multiline = false ) {
    return str_replace( '&lt;', '<', $multiline ? sanitize_textarea_field( $raw ) : sanitize_text_field( $raw ) );
}

/**
 * The replacement of a text edit: the inline formatting abilities.md allows
 * (`strong`, `em`, `a` with `href`, `code`, `s`, `sub`, `sup`) and nothing else.
 *
 * @param mixed $html What was sent.
 * @return string
 */
function wfw_sanitize_replacement( $html ) {
    return wp_kses( is_string( $html ) ? $html : '', array(
        'strong' => array(),
        'em'     => array(),
        'a'      => array( 'href' => true ),
        'code'   => array(),
        's'      => array(),
        'sub'    => array(),
        'sup'    => array(),
    ) );
}

/**
 * Block markup an agent proposes to insert: what a post may hold for a user
 * who cannot post unfiltered HTML, whoever the agent runs as.
 *
 * @param mixed $markup What was sent.
 * @return string
 */
function wfw_sanitize_block_markup( $markup ) {
    return trim( wp_kses_post( is_string( $markup ) ? $markup : '' ) );
}

/**
 * A suggestion's change, in the shape abilities.md gives for its kind, with
 * every value sanitised and nothing else kept:
 *
 * - `edit`: array( 'replacement' => string ), at most WFW_REPLACEMENT_MAX characters.
 * - `blocks`: array( 'op' => 'insert', 'after' => int, 'markup' => string ),
 *   array( 'op' => 'remove', 'block' => int ) or array( 'op' => 'move', 'block' => int, 'after' => int ).
 *   Markup is at most WFW_MARKUP_MAX characters, and holds blocks the Writer editor offers and nothing
 *   between them.
 * - `details`: array( 'field' => 'titles'|'tags'|'categories', 'value' => string[] ) or
 *   array( 'field' => 'excerpt', 'value' => string ). A title is at most WFW_TITLE_MAX characters, a tag or a
 *   category WFW_TERM_MAX, the excerpt WFW_EXCERPT_MAX.
 * - `comment`: array().
 *
 * It does not check a block against the note or a category against the site:
 * the ability does.
 *
 * @param string $kind   The suggestion's kind.
 * @param mixed  $change What was sent.
 * @return array|WP_Error The change, `invalid_args` naming the field, or `not_allowed` for markup with a block
 *                        the Writer editor does not offer.
 */
function wfw_sanitize_suggestion_change( $kind, $change ) {
    $change = is_array( $change ) ? $change : array();
    if ( 'comment' === $kind ) {
        return array();
    }
    if ( 'edit' === $kind ) {
        if ( ! isset( $change['replacement'] ) || ! is_string( $change['replacement'] ) || mb_strlen( $change['replacement'] ) > WFW_REPLACEMENT_MAX ) {
            /* translators: %d: a number of characters. */
            return wfw_agent_error( 'invalid_args', sprintf( __( 'replacement must be a string of at most %d characters.', 'wordpress-for-writers' ), WFW_REPLACEMENT_MAX ) );
        }
        return array( 'replacement' => wfw_sanitize_replacement( $change['replacement'] ) );
    }
    if ( 'blocks' === $kind ) {
        $op    = $change['op'] ?? '';
        $clean = array( 'op' => $op );
        if ( ! in_array( $op, array( 'insert', 'remove', 'move' ), true ) ) {
            return wfw_agent_error( 'invalid_args', __( 'op must be insert, remove or move.', 'wordpress-for-writers' ) );
        }
        if ( 'insert' !== $op ) {
            if ( ! isset( $change['block'] ) || ! is_numeric( $change['block'] ) || $change['block'] < 0 ) {
                return wfw_agent_error( 'invalid_args', __( 'block must be 0 or more.', 'wordpress-for-writers' ) );
            }
            $clean['block'] = (int) $change['block'];
        }
        if ( 'remove' !== $op ) {
            if ( ! isset( $change['after'] ) || ! is_numeric( $change['after'] ) || $change['after'] < -1 ) {
                return wfw_agent_error( 'invalid_args', __( 'after must be -1 or more.', 'wordpress-for-writers' ) );
            }
            $clean['after'] = (int) $change['after'];
        }
        if ( 'insert' === $op ) {
            $markup = isset( $change['markup'] ) && is_string( $change['markup'] ) ? $change['markup'] : '';
            if ( mb_strlen( $markup ) > WFW_MARKUP_MAX ) {
                /* translators: %d: a number of characters. */
                return wfw_agent_error( 'invalid_args', sprintf( __( 'markup must be at most %d characters.', 'wordpress-for-writers' ), WFW_MARKUP_MAX ) );
            }
            $clean['markup'] = wfw_sanitize_block_markup( $markup );
            $parsed          = parse_blocks( $clean['markup'] );
            $named           = false;
            $loose           = false;
            foreach ( $parsed as $block ) {
                if ( ! empty( $block['blockName'] ) ) {
                    $named = true;
                } elseif ( '' !== trim( $block['innerHTML'] ) ) {
                    $loose = true;
                }
            }
            if ( ! $named ) {
                return wfw_agent_error( 'invalid_args', __( 'markup holds no block.', 'wordpress-for-writers' ) );
            }
            // What stands between blocks has no name: the editor would make a Classic block of it, which it does not offer.
            if ( $loose ) {
                return wfw_agent_error( 'invalid_args', __( 'markup holds text outside a block.', 'wordpress-for-writers' ) );
            }
            $offered = wfw_allowed_block_types( true );
            foreach ( wfw_blocks_walk( $parsed ) as $block ) {
                if ( ! in_array( $block['name'], $offered, true ) ) {
                    /* translators: %s: the name of a block, such as core/columns. */
                    return wfw_agent_error( 'not_allowed', sprintf( __( 'The Writer editor does not offer the block %s.', 'wordpress-for-writers' ), $block['name'] ) );
                }
            }
        }
        return $clean;
    }
    if ( 'details' === $kind ) {
        $field = $change['field'] ?? '';
        $value = $change['value'] ?? null;
        if ( 'excerpt' === $field ) {
            if ( ! is_string( $value ) ) {
                return wfw_agent_error( 'invalid_args', __( 'excerpt must be a string.', 'wordpress-for-writers' ) );
            }
            if ( mb_strlen( $value ) > WFW_EXCERPT_MAX ) {
                /* translators: %d: a number of characters. */
                return wfw_agent_error( 'invalid_args', sprintf( __( 'excerpt must be at most %d characters.', 'wordpress-for-writers' ), WFW_EXCERPT_MAX ) );
            }
            return array(
                'field' => $field,
                'value' => wfw_plain_text( $value, true ),
            );
        }
        if ( ! in_array( $field, array( 'titles', 'tags', 'categories' ), true ) ) {
            return wfw_agent_error( 'invalid_args', __( 'field must be titles, excerpt, tags or categories.', 'wordpress-for-writers' ) );
        }
        $values = array_values( array_filter( array_map( 'wfw_plain_text', array_filter( (array) $value, 'is_string' ) ), 'strlen' ) );
        if ( ! $values ) {
            /* translators: %s: the name of a field, such as tags. */
            return wfw_agent_error( 'invalid_args', sprintf( __( '%s must hold at least one string.', 'wordpress-for-writers' ), $field ) );
        }
        $longest = 'titles' === $field ? WFW_TITLE_MAX : WFW_TERM_MAX;
        foreach ( $values as $one ) {
            if ( mb_strlen( $one ) > $longest ) {
                /* translators: 1: the name of a field, such as tags, 2: a number of characters. */
                return wfw_agent_error( 'invalid_args', sprintf( __( '%1$s must hold strings of at most %2$d characters.', 'wordpress-for-writers' ), $field, $longest ) );
            }
        }
        return array(
            'field' => $field,
            'value' => $values,
        );
    }
    return wfw_agent_error( 'invalid_args', __( 'kind must be edit, blocks, details or comment.', 'wordpress-for-writers' ) );
}

/**
 * An anchor as stored: its five fields and nothing else, but for a move the
 * anchor of the block it goes after, as `after`.
 *
 * @param mixed $anchor What was computed (wfw_anchor_at() and friends).
 * @return array|null Null for anything that is not an anchor.
 */
function wfw_sanitize_anchor( $anchor ) {
    if ( ! is_array( $anchor ) || ! isset( $anchor['path'], $anchor['name'], $anchor['quote'] ) || ! is_array( $anchor['path'] ) ) {
        return null;
    }
    $clean = array(
        'path'   => array_map( 'intval', array_values( $anchor['path'] ) ),
        'name'   => (string) $anchor['name'],
        'quote'  => (string) $anchor['quote'],
        'prefix' => (string) ( $anchor['prefix'] ?? '' ),
        'suffix' => (string) ( $anchor['suffix'] ?? '' ),
    );
    // A move's anchor also names the block it goes after.
    $after = isset( $anchor['after'] ) ? wfw_sanitize_anchor( array_diff_key( (array) $anchor['after'], array( 'after' => 1 ) ) ) : null;
    return $after ? $clean + array( 'after' => $after ) : $clean;
}

// ---- Suggestions -----------------------------------------------------------------

/**
 * The comment meta of a suggestion (surface.md, Records).
 *
 * @return string[]
 */
function wfw_suggestion_meta_keys() {
    return array( '_wfw_kind', '_wfw_status', '_wfw_pass', '_wfw_pass_label', '_wfw_source', '_wfw_anchor', '_wfw_change', '_wfw_reason', '_wfw_settled' );
}

/**
 * What a suggestion's comment says to a person reading it with no editor of
 * ours, in wp-admin's list of core notes. A comment's content is HTML there,
 * and nothing filters it on the way in (wp_insert_comment()), so the text an
 * agent gave is escaped.
 */
function wfw_suggestion_content( $kind, $change, $reason ) {
    $reason = esc_html( $reason );
    if ( 'edit' === $kind ) {
        /* translators: %s: the text an agent proposes. */
        $content = sprintf( __( 'Suggests: “%s”', 'wordpress-for-writers' ), esc_html( wfw_rich_text_plain( $change['replacement'] ) ) );
        return '' === $reason ? $content : $content . "\n" . $reason;
    }
    if ( '' !== $reason ) {
        return $reason;
    }
    if ( 'blocks' === $kind ) {
        $lines = array(
            'insert' => __( 'Suggests adding a block.', 'wordpress-for-writers' ),
            'remove' => __( 'Suggests removing a block.', 'wordpress-for-writers' ),
            'move'   => __( 'Suggests moving a block.', 'wordpress-for-writers' ),
        );
        return $lines[ $change['op'] ];
    }
    $value = esc_html( implode( ', ', (array) $change['value'] ) );
    switch ( $change['field'] ) {
        case 'titles':
            /* translators: %s: one or more titles. */
            return sprintf( __( 'Suggests the title: %s', 'wordpress-for-writers' ), $value );
        case 'excerpt':
            /* translators: %s: an excerpt. */
            return sprintf( __( 'Suggests the excerpt: %s', 'wordpress-for-writers' ), $value );
        case 'tags':
            /* translators: %s: one or more tags. */
            return sprintf( __( 'Suggests the tags: %s', 'wordpress-for-writers' ), $value );
        default:
            /* translators: %s: one or more categories. */
            return sprintf( __( 'Suggests the categories: %s', 'wordpress-for-writers' ), $value );
    }
}

/**
 * Stores one pass: the suggestions one ability call made together. It is
 * stored whole or not at all, and it changes nothing of the note. Each is
 * inserted with wp_insert_comment(), on hold (open, as core reads a core
 * note): nobody is emailed, as they are for a core note made through core's
 * REST route.
 *
 * The caller has already checked each suggestion against the note and worked
 * out its anchor (wfw_anchor_at(), wfw_block_anchor(), wfw_ask_passage()).
 * This checks who is asking, the ask, the label and the limit, and sanitises
 * every value on the way in (wfw_sanitize_suggestion_change()).
 *
 * @param int   $note_id     The note.
 * @param array $pass        array( 'label' => string, 1 to WFW_PASS_LABEL_MAX characters; 'ask' => int, the ask the pass answers, 0 or
 *                           left out for none ). The current user makes it.
 * @param array $suggestions 1 or more of array( 'kind' => 'edit'|'blocks'|'details'|'comment';
 *                           'anchor' => array|null, required for `edit` and `comment`, null for `details` and for a
 *                           block inserted at the start of the note; 'change' => array, as
 *                           wfw_sanitize_suggestion_change() takes it; 'reason' => string, at most WFW_REASON_MAX
 *                           characters, or for a `comment` the remark itself, 1 to WFW_COMMENT_MAX characters ).
 * @return array|WP_Error array( 'pass' => string (a UUID), 'suggestions' => int[] (the ids, in the order given) ).
 *                        `not_found` for the note or the ask, `invalid_args` for a value, `not_allowed` for a
 *                        block the Writer editor does not offer, `too_many` past the limit, `failed` when the
 *                        database refused a write (nothing is then left stored).
 */
function wfw_suggestions_create( $note_id, $pass, $suggestions ) {
    $pass    = is_array( $pass ) ? $pass : array();
    $user_id = get_current_user_id();
    $note    = wfw_agent_note( $note_id );
    if ( is_wp_error( $note ) ) {
        return $note;
    }

    $label = isset( $pass['label'] ) && is_string( $pass['label'] ) ? wfw_plain_text( $pass['label'] ) : '';
    if ( '' === $label || mb_strlen( $label ) > WFW_PASS_LABEL_MAX ) {
        /* translators: %d: a number of characters. */
        return wfw_agent_error( 'invalid_args', sprintf( __( 'pass must be 1 to %d characters.', 'wordpress-for-writers' ), WFW_PASS_LABEL_MAX ) );
    }
    // The way in this request came through.
    $source = defined( 'WP_CLI' ) && WP_CLI ? 'cli' : 'abilities';
    $ask_id = ! empty( $pass['ask'] ) ? (int) $pass['ask'] : 0;
    if ( $ask_id ) {
        $ask = wfw_ask_get( $note->ID, $ask_id );
        if ( is_wp_error( $ask ) ) {
            return $ask;
        }
    }

    if ( ! is_array( $suggestions ) || ! $suggestions ) {
        return wfw_agent_error( 'invalid_args', __( 'A pass holds at least one suggestion.', 'wordpress-for-writers' ) );
    }
    $rows = array();
    foreach ( array_values( $suggestions ) as $suggestion ) {
        $suggestion = is_array( $suggestion ) ? $suggestion : array();
        $kind       = $suggestion['kind'] ?? '';
        $change     = wfw_sanitize_suggestion_change( $kind, $suggestion['change'] ?? null );
        if ( is_wp_error( $change ) ) {
            return $change;
        }
        $anchor = 'details' === $kind ? null : wfw_sanitize_anchor( $suggestion['anchor'] ?? null );
        if ( ! $anchor && in_array( $kind, array( 'edit', 'comment' ), true ) ) {
            return wfw_agent_error( 'invalid_args', __( 'path and quote are required.', 'wordpress-for-writers' ) );
        }
        $reason = isset( $suggestion['reason'] ) && is_string( $suggestion['reason'] ) ? $suggestion['reason'] : '';
        if ( 'comment' === $kind ) {
            $reason = wfw_plain_text( $reason, true );
            if ( '' === $reason || mb_strlen( $reason ) > WFW_COMMENT_MAX ) {
                /* translators: %d: a number of characters. */
                return wfw_agent_error( 'invalid_args', sprintf( __( 'text must be 1 to %d characters.', 'wordpress-for-writers' ), WFW_COMMENT_MAX ) );
            }
        } else {
            $reason = wfw_plain_text( $reason );
            if ( mb_strlen( $reason ) > WFW_REASON_MAX ) {
                /* translators: %d: a number of characters. */
                return wfw_agent_error( 'invalid_args', sprintf( __( 'reason must be at most %d characters.', 'wordpress-for-writers' ), WFW_REASON_MAX ) );
            }
        }
        $rows[] = compact( 'kind', 'change', 'anchor', 'reason' );
    }

    $open = wfw_suggestions_count_open( $note->ID );
    if ( $open + count( $rows ) > WFW_SUGGESTIONS_MAX_OPEN ) {
        /* translators: %d: a number of suggestions. */
        return wfw_agent_error( 'too_many', sprintf( __( 'This note already has %d open suggestions.', 'wordpress-for-writers' ), $open ) );
    }

    $user  = get_userdata( $user_id );
    $uuid  = wp_generate_uuid4();
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    $ids   = array();
    foreach ( $rows as $row ) {
        // wp_insert_comment() and the meta it adds expect slashed data.
        $id = wp_insert_comment( wp_slash( array(
            'comment_post_ID'      => $note->ID,
            'comment_type'         => 'note',
            'comment_parent'       => $ask_id,
            'user_id'              => $user_id,
            'comment_author'       => $user->display_name,
            'comment_author_email' => $user->user_email,
            'comment_author_url'   => $user->user_url,
            'comment_approved'     => 0,
            'comment_content'      => wfw_suggestion_content( $row['kind'], $row['change'], $row['reason'] ),
            'comment_agent'        => 'wfw-agent/' . $source,
            'comment_meta'         => array(
                '_wfw_kind'       => $row['kind'],
                '_wfw_status'     => 'open',
                '_wfw_pass'       => $uuid,
                '_wfw_pass_label' => $label,
                '_wfw_source'     => $source,
                '_wfw_anchor'     => $row['anchor'] ? wp_json_encode( $row['anchor'], $flags ) : '',
                '_wfw_change'     => wp_json_encode( (object) $row['change'], $flags ),
                '_wfw_reason'     => $row['reason'],
            ),
        ) ) );
        if ( ! $id ) {
            foreach ( $ids as $stored ) {
                wp_delete_comment( $stored, true );
            }
            return wfw_agent_error( 'failed', __( 'The suggestions could not be stored. Nothing was stored.', 'wordpress-for-writers' ) );
        }
        $ids[] = (int) $id;
    }

    return array(
        'pass'        => $uuid,
        'suggestions' => $ids,
    );
}

/**
 * A suggestion, from its comment.
 *
 * @param WP_Comment $comment A comment that has `_wfw_kind`.
 * @return array array( 'id' => int, 'note' => int, 'kind' => string, 'status' => string, 'pass' => string (the UUID),
 *               'label' => string (the pass's label), 'anchor' => array|null,
 *               'change' => array (empty for a `comment`), 'reason' => string (for a `comment`, the remark),
 *               'author' => array( 'id' => int, 'name' => string ), 'date' => string (GMT, as "2026-11-26T18:37:00"),
 *               'ask' => int (the ask it answers, or 0) ).
 */
function wfw_suggestion_from_comment( $comment ) {
    $id     = (int) $comment->comment_ID;
    $anchor = json_decode( (string) get_comment_meta( $id, '_wfw_anchor', true ), true );
    $change = json_decode( (string) get_comment_meta( $id, '_wfw_change', true ), true );
    return array(
        'id'     => $id,
        'note'   => (int) $comment->comment_post_ID,
        'kind'   => (string) get_comment_meta( $id, '_wfw_kind', true ),
        'status' => (string) get_comment_meta( $id, '_wfw_status', true ),
        'pass'   => (string) get_comment_meta( $id, '_wfw_pass', true ),
        'label'  => (string) get_comment_meta( $id, '_wfw_pass_label', true ),
        'anchor' => is_array( $anchor ) ? $anchor : null,
        'change' => is_array( $change ) ? $change : array(),
        'reason' => (string) get_comment_meta( $id, '_wfw_reason', true ),
        'author' => array(
            'id'   => (int) $comment->user_id,
            'name' => (string) $comment->comment_author,
        ),
        'date'   => (string) mysql_to_rfc3339( $comment->comment_date_gmt ),
        'ask'    => (int) $comment->comment_parent,
    );
}

/**
 * The error for an id that is not a suggestion's, or not one the user may see.
 *
 * @param int $id The id asked for.
 * @return WP_Error `not_found`: "Suggestion {id} was not found."
 */
function wfw_suggestion_not_found( $id ) {
    /* translators: %d: the id of a suggestion. */
    return wfw_agent_error( 'not_found', sprintf( __( 'Suggestion %d was not found.', 'wordpress-for-writers' ), (int) $id ) );
}

/**
 * One suggestion by its id. It checks nothing about who asks.
 *
 * @param int $id The suggestion's id (its comment's).
 * @return array|null The suggestion, as wfw_suggestion_from_comment() gives it, or null when the id is not a suggestion's.
 */
function wfw_suggestion_get( $id ) {
    $comment = $id > 0 ? get_comment( (int) $id ) : null;
    if ( ! $comment || 'note' !== $comment->comment_type || ! in_array( (string) $comment->comment_approved, array( '0', '1' ), true ) || ! metadata_exists( 'comment', $comment->comment_ID, '_wfw_kind' ) ) {
        return null;
    }
    return wfw_suggestion_from_comment( $comment );
}

/**
 * A note's suggestions, newest first. It checks nothing about who asks; call
 * wfw_agent_note() first.
 *
 * @param int   $note_id The note.
 * @param array $args    array( 'status' => 'any' (the default), one of `open`, `accepted`, `dismissed`, `withdrawn`,
 *                       or an array of them; 'since' => int, a Unix timestamp: with it, only those settled at or
 *                       after that time, so none that is `open`; 'number' => int, how many at most, 100 by
 *                       default, 0 for all ).
 * @return array[] Suggestions, as wfw_suggestion_from_comment() gives them.
 */
function wfw_suggestions_get( $note_id, $args = array() ) {
    $args     = wp_parse_args( $args, array(
        'status' => 'any',
        'since'  => 0,
        'number' => 100,
    ) );
    $all      = array( 'open', 'accepted', 'dismissed', 'withdrawn' );
    $statuses = 'any' === $args['status'] ? $all : array_values( array_intersect( $all, (array) $args['status'] ) );
    if ( ! $statuses ) {
        return array();
    }
    $meta = array(
        array(
            'key'     => '_wfw_kind',
            'compare' => 'EXISTS',
        ),
        array(
            'key'     => '_wfw_status',
            'value'   => $statuses,
            'compare' => 'IN',
        ),
    );
    if ( $args['since'] ) {
        $meta[] = array(
            'key'     => '_wfw_settled',
            'value'   => (int) $args['since'],
            'compare' => '>=',
            'type'    => 'UNSIGNED',
        );
    }
    $comments = get_comments( array(
        'post_id'    => (int) $note_id,
        'type'       => 'note',
        'status'     => 'all',
        'orderby'    => 'comment_ID',
        'order'      => 'DESC',
        'number'     => (int) $args['number'],
        'meta_query' => $meta, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- one note's core notes.
    ) );
    return array_map( 'wfw_suggestion_from_comment', $comments );
}

/**
 * How many suggestions of a note are open.
 *
 * @param int $note_id The note.
 * @return int
 */
function wfw_suggestions_count_open( $note_id ) {
    return (int) get_comments( array(
        'post_id'    => (int) $note_id,
        'type'       => 'note',
        'status'     => 'all',
        'count'      => true,
        'meta_key'   => '_wfw_status', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one note's core notes.
        'meta_value' => 'open', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- as above.
    ) );
}

/**
 * Writes a suggestion's status with the time it was settled, which the two
 * always change together: `_wfw_settled` takes the time a suggestion leaves
 * `open` and is removed when it is open again.
 *
 * @param int    $id     The suggestion.
 * @param string $status `open`, `accepted`, `dismissed` or `withdrawn`.
 */
function wfw_suggestion_write_status( $id, $status ) {
    update_comment_meta( $id, '_wfw_status', $status );
    if ( 'open' === $status ) {
        delete_comment_meta( $id, '_wfw_settled' );
    } else {
        update_comment_meta( $id, '_wfw_settled', time() );
    }
}

/**
 * Sets a comment's own status and emails nobody. Core emails a post's author
 * when a comment of theirs is approved; settling a suggestion is no news.
 *
 * @param int    $id     The comment.
 * @param string $status `hold` or `approve`, as wp_set_comment_status() takes it.
 */
function wfw_comment_set_status_quietly( $id, $status ) {
    add_filter( 'notify_post_author', '__return_false', 999 );
    wp_set_comment_status( $id, $status );
    remove_filter( 'notify_post_author', '__return_false', 999 );
}

/**
 * Sets a suggestion's status, and nothing of the note: the note is changed by
 * the editor, never here. It checks nothing about who asks.
 *
 * The comment's own status is kept in step, as core reads a core note:
 * approved (resolved) once settled, on hold while open.
 *
 * @param int    $id     The suggestion.
 * @param string $status `open`, `accepted`, `dismissed` or `withdrawn`; the caller has checked it is one of them.
 * @return array|WP_Error The suggestion as it is now, or `not_found` ("Suggestion {id} was not found.").
 */
function wfw_suggestion_set_status( $id, $status ) {
    $id = (int) $id;
    if ( ! wfw_suggestion_get( $id ) ) {
        return wfw_suggestion_not_found( $id );
    }
    // The meta first: the transition_comment_status hook below then finds nothing to do.
    wfw_suggestion_write_status( $id, $status );
    wfw_comment_set_status_quietly( $id, 'open' === $status ? 'hold' : 'approve' );
    return wfw_suggestion_get( $id );
}

/**
 * Withdraws suggestions their maker no longer stands by: each named one that
 * is `open` becomes `withdrawn`. Nothing is withdrawn unless every one named is
 * a suggestion of this note that the current user made.
 *
 * @param int   $note_id The note.
 * @param int[] $ids     The suggestions.
 * @return array|WP_Error array( 'withdrawn' => int[] ), the ones that were open. `not_found` for the note or for
 *                        an id that is not a suggestion of it ("Suggestion {id} was not found."); `not_yours`
 *                        ("Suggestion {id} was made by someone else.").
 */
function wfw_suggestions_withdraw( $note_id, $ids ) {
    $user_id = get_current_user_id();
    $note    = wfw_agent_note( $note_id );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    $ids  = array_unique( array_map( 'intval', (array) $ids ) );
    $open = array();
    _prime_comment_caches( $ids, true );
    foreach ( $ids as $id ) {
        $suggestion = wfw_suggestion_get( $id );
        if ( ! $suggestion || $suggestion['note'] !== $note->ID ) {
            return wfw_suggestion_not_found( $id );
        }
        if ( $suggestion['author']['id'] !== $user_id ) {
            /* translators: %d: the id of a suggestion. */
            return wfw_agent_error( 'not_yours', sprintf( __( 'Suggestion %d was made by someone else.', 'wordpress-for-writers' ), $id ) );
        }
        if ( 'open' === $suggestion['status'] ) {
            $open[] = $id;
        }
    }
    wp_defer_comment_counting( true );
    foreach ( $open as $id ) {
        wfw_suggestion_set_status( $id, 'withdrawn' );
    }
    wp_defer_comment_counting( false );
    return array( 'withdrawn' => $open );
}

/**
 * A suggestion resolved in wp-admin's editor is dismissed, and one reopened
 * there is open again: core approves a core note to resolve it and puts it on
 * hold to reopen it, and the suggestion's own status follows. One that was
 * accepted or withdrawn stays so: its comment is put back as it was.
 */
add_action( 'transition_comment_status', function ( $new_status, $old_status, $comment ) {
    if ( 'note' !== $comment->comment_type || ! metadata_exists( 'comment', $comment->comment_ID, '_wfw_kind' ) ) {
        return;
    }
    $status = get_comment_meta( $comment->comment_ID, '_wfw_status', true );
    if ( 'approved' === $new_status && 'open' === $status ) {
        wfw_suggestion_write_status( $comment->comment_ID, 'dismissed' );
    } elseif ( 'unapproved' === $new_status && 'dismissed' === $status ) {
        wfw_suggestion_write_status( $comment->comment_ID, 'open' );
    } elseif ( 'unapproved' === $new_status && in_array( $status, array( 'accepted', 'withdrawn' ), true ) ) {
        // An accepted edit is in the note, and a withdrawn suggestion is its maker's: neither is reopened from there.
        wfw_comment_set_status_quietly( $comment->comment_ID, 'approve' );
    }
}, 10, 3 );

/**
 * Core's comments route does not move a suggestion or give it to someone else:
 * an update of one that would change its note, its author or the ask it
 * answers is refused. Its status and its text stay core's to change, which is
 * how wp-admin's editor resolves and reopens it.
 */
add_filter( 'rest_preprocess_comment', function ( $prepared, $request ) {
    $id = (int) ( $request['id'] ?? 0 );
    if ( is_wp_error( $prepared ) || ! $id || ! metadata_exists( 'comment', $id, '_wfw_kind' ) ) {
        return $prepared;
    }
    $comment = get_comment( $id );
    foreach ( array( 'comment_post_ID', 'user_id', 'comment_author', 'comment_author_email', 'comment_author_url', 'comment_parent' ) as $field ) {
        if ( isset( $prepared[ $field ] ) && (string) $prepared[ $field ] !== (string) $comment->$field ) {
            return new WP_Error( 'wfw_suggestion_fixed', __( 'A suggestion stays on its note, with the author it has.', 'wordpress-for-writers' ), array( 'status' => 403 ) );
        }
    }
    return $prepared;
}, 10, 2 );

// ---- Routes for the editor -------------------------------------------------------

/**
 * A suggestion as the routes send it: wfw_suggestion_from_comment() with
 * `change` always an object.
 */
function wfw_suggestion_for_rest( $suggestion ) {
    $suggestion['change'] = (object) $suggestion['change'];
    return $suggestion;
}

add_action( 'rest_api_init', function () {
    /*
     * The note's suggestions that are open, and those settled in the last day
     * (so the editor can still take an accept or a dismissal back): of these,
     * the newest 100. And the ids of its open asks.
     */
    register_rest_route( 'wfw/v1', '/notes/(?P<id>\d+)/suggestions', array(
        'methods'             => 'GET',
        'permission_callback' => function ( WP_REST_Request $request ) {
            $note = wfw_agent_note( (int) $request['id'] );
            return is_wp_error( $note ) ? $note : true;
        },
        'callback'            => function ( WP_REST_Request $request ) {
            $suggestions = array_merge(
                wfw_suggestions_get( (int) $request['id'], array(
                    'status' => 'open',
                    'number' => 0,
                ) ),
                wfw_suggestions_get( (int) $request['id'], array(
                    'status' => array( 'accepted', 'dismissed', 'withdrawn' ),
                    'since'  => time() - DAY_IN_SECONDS,
                    'number' => 100,
                ) )
            );
            // Newest first, as one list.
            usort( $suggestions, function ( $one, $other ) {
                return $other['id'] - $one['id'];
            } );
            return array(
                'suggestions' => array_map( 'wfw_suggestion_for_rest', $suggestions ),
                // The note's open asks, by id: Review reads the asks themselves from core's comments route.
                'asks'        => array_map( 'intval', get_comments( wfw_asks_query( (int) $request['id'] ) + array( 'fields' => 'ids' ) ) ),
                // When a way in was last used, and the server's clock to read it against.
                'seen'        => wfw_agent_seen(),
                'now'         => time(),
            );
        },
    ) );

    /*
     * Records what the writer did with a suggestion. One answer for a
     * suggestion that doesn't exist and for one on a note that isn't the
     * user's. A withdrawn suggestion is its maker's to take back, not the
     * writer's, so it stays withdrawn.
     */
    register_rest_route( 'wfw/v1', '/suggestions/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'permission_callback' => function ( WP_REST_Request $request ) {
            $suggestion = wfw_suggestion_get( (int) $request['id'] );
            if ( ! $suggestion || is_wp_error( wfw_agent_note( $suggestion['note'] ) ) ) {
                return wfw_suggestion_not_found( $request['id'] );
            }
            return true;
        },
        'args'                => array(
            'status' => array(
                'type'     => 'string',
                'enum'     => array( 'accepted', 'dismissed', 'open' ),
                'required' => true,
            ),
        ),
        'callback'            => function ( WP_REST_Request $request ) {
            $suggestion = wfw_suggestion_get( (int) $request['id'] );
            if ( $suggestion && 'withdrawn' === $suggestion['status'] ) {
                return new WP_Error( 'withdrawn', __( 'This suggestion was withdrawn.', 'wordpress-for-writers' ), array( 'status' => 409 ) );
            }
            $suggestion = wfw_suggestion_set_status( (int) $request['id'], $request['status'] );
            return is_wp_error( $suggestion ) ? $suggestion : wfw_suggestion_for_rest( $suggestion );
        },
    ) );

    /*
     * The count of open suggestions on each post the app lists (W5). A site no
     * agent has used has none, and is not asked.
     */
    register_rest_field( 'post', 'wfw_suggestions', array(
        'get_callback' => function ( $post ) {
            return wfw_agent_seen() && current_user_can( 'edit_post', $post['id'] ) ? wfw_suggestions_count_open( $post['id'] ) : 0;
        },
        'schema'       => array(
            'description' => __( 'How many suggestions wait on the post.', 'wordpress-for-writers' ),
            'type'        => 'integer',
            'context'     => array( 'edit' ),
            'readonly'    => true,
        ),
    ) );
} );

/**
 * Review learns of new suggestions from the Heartbeat the editor already runs,
 * when it is not asking for them itself. It sends `wfw-suggestions` with the
 * note's id and gets back what it needs to decide whether to ask again:
 * array( 'note' => int, 'open' => int, 'latest' => int (the highest suggestion id on the note, 0 for none),
 * 'seen' => int, 'now' => int ). Nothing is answered for a note that is not the user's.
 */
add_filter( 'heartbeat_received', function ( $response, $data ) {
    if ( empty( $data['wfw-suggestions']['note'] ) ) {
        return $response;
    }
    $note = wfw_agent_note( (int) $data['wfw-suggestions']['note'] );
    if ( is_wp_error( $note ) ) {
        return $response;
    }
    $latest                      = wfw_suggestions_get( $note->ID, array( 'number' => 1 ) );
    $response['wfw-suggestions'] = array(
        'note'   => $note->ID,
        'open'   => wfw_suggestions_count_open( $note->ID ),
        'latest' => $latest ? $latest[0]['id'] : 0,
        'seen'   => wfw_agent_seen(),
        'now'    => time(),
    );
    return $response;
}, 10, 2 );

// ---- What the pages are told -----------------------------------------------------

/**
 * `wfwEditor.agent`: what the editor page knows of the surface when it loads
 * (surface.md, What a site pays). The stub in editor.js loads Review when
 * `seen` or `notes` holds, and only then are the other keys there:
 *
 * - `seen` (int): when a way in was last used on the site, 0 for never.
 * - `notes` (bool): whether the note has a core note.
 * - `now` (int): the server's clock, to read `seen` against.
 * - `script`, `style` (string): where Review is (assets/suggest.js, assets/suggest.css).
 * - `domain` (string) and `translations` (object|null): Review's strings, in
 *   the shape wp.i18n.setLocaleData() takes, since a script loaded on demand
 *   gets none from WordPress.
 * - `inlineTags` (string[]): WFW_INLINE_TAGS, the tags a block's text is read
 *   with, so Review reads a block as the store does.
 *
 * @param WP_Post $post The note the editor shows.
 * @return array
 */
function wfw_agent_editor_data( $post ) {
    $data = array(
        'seen'  => wfw_agent_seen(),
        'notes' => 'auto-draft' !== $post->post_status && wfw_note_has_core_note( $post->ID ),
        'now'   => time(),
    );
    if ( ! $data['seen'] && ! $data['notes'] ) {
        return $data;
    }

    // Registered, never enqueued: the stub loads it, and this is how its translations are found.
    wp_register_script( 'wfw-suggest', WFW_URL . 'assets/suggest.js', array(), wfw_asset_version( 'assets/suggest.js' ), true );
    $domain       = wfw_text_domain();
    $translations = json_decode( (string) load_script_textdomain( 'wfw-suggest', $domain ), true );

    return $data + array(
        'script'       => add_query_arg( 'ver', wfw_asset_version( 'assets/suggest.js' ), WFW_URL . 'assets/suggest.js' ),
        'style'        => add_query_arg( 'ver', wfw_asset_version( 'assets/suggest.css' ), WFW_URL . 'assets/suggest.css' ),
        'domain'       => $domain,
        'translations' => $translations['locale_data'][ $domain ] ?? $translations['locale_data']['messages'] ?? null,
        'inlineTags'   => explode( '|', WFW_INLINE_TAGS ),
    );
}

/**
 * `wfwSettings.agent`: what the app knows of the surface when it loads.
 *
 * - `seen` (int): when a way in was last used on the site, 0 for never. The
 *   app adds nothing of the surface (the style sheet's field) while it is 0.
 * - `styleSheet` (string): the user's style sheet. The app saves it as it
 *   saves the appearance: POST /wp/v2/users/me with
 *   { "meta": { "wfw_style_sheet": "…" } }.
 * - `styleSheetMax` (int): the most characters it holds.
 *
 * @return array
 */
function wfw_agent_app_data() {
    return array(
        'seen'          => wfw_agent_seen(),
        'styleSheet'    => wfw_get_style_sheet(),
        'styleSheetMax' => WFW_STYLE_SHEET_MAX,
    );
}
