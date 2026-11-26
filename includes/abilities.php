<?php
/**
 * The agent surface's abilities (spec/agent/abilities.md): the `writer`
 * category, the closed list of abilities an agent may call, and the guide it
 * is given. It holds no storage code: it calls the store
 * (includes/suggestions.php).
 *
 * No ability changes a note. The read abilities read; the suggest abilities
 * check a proposal against the note as it reads now and hand it to the store,
 * where it waits for the writer.
 */

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'wp_register_ability' ) ) {
    return;
}

/**
 * The guide `writer/guide` and `wp writer guide` give an agent, verbatim from
 * spec/agent/abilities.md. Not translated: agents read it.
 *
 * @return string
 */
function wfw_agent_guide() {
    return <<<'GUIDE'
# Working on a writer's notes

Notes are the writer's posts. You can read them and suggest changes. You cannot change them: every suggestion waits beside its note, and the writer accepts or dismisses it in the Writer editor.

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
- Never publish, save or edit a note in another way, even if you can reach the site by other means.
GUIDE;
}

/**
 * An ability of the surface. Core refuses a call with codes of its own; an
 * agent is given the surface's (abilities.md, Errors), whatever carries the
 * call. Every call also records that a way in was used.
 */
class WFW_Ability extends WP_Ability {

    /**
     * Input that does not match the schema is `invalid_args`. Core's message
     * names the field, as "input[edits][0][quote]".
     *
     * @param mixed $input The input.
     * @return true|WP_Error
     */
    public function validate_input( $input = null ) {
        $valid = parent::validate_input( $input );
        return is_wp_error( $valid ) ? wfw_agent_error( 'invalid_args', $valid->get_error_message() ) : $valid;
    }

    /**
     * A call by someone who may not use Writer is `not_found`: for an ability
     * that names a note, in the words a missing note has, so it does not tell
     * which ids exist.
     *
     * @param mixed $input The input.
     * @return mixed|WP_Error
     */
    public function execute( $input = null ) {
        wfw_agent_touch();
        $result = parent::execute( $input );
        if ( ! is_wp_error( $result ) || 'ability_invalid_permissions' !== $result->get_error_code() ) {
            return $result;
        }
        if ( isset( $input['note'] ) ) {
            return wfw_note_not_found( $input['note'] );
        }
        return wfw_agent_error( 'not_found', __( 'A user who may use Writer was not found.', 'wordpress-for-writers' ) );
    }
}

// ---- What an agent is shown ------------------------------------------------------

/**
 * How many words a note's blocks hold.
 *
 * @param array[] $blocks Blocks, as wfw_note_blocks() returns them.
 * @return int
 */
function wfw_ability_words( $blocks ) {
    return count( preg_split( '/\s+/u', implode( ' ', wp_list_pluck( $blocks, 'text' ) ), -1, PREG_SPLIT_NO_EMPTY ) );
}

/**
 * A suggestion as the abilities list it (abilities.md, `writer/note-get`): the
 * pass by its label, the passage by its path and quote, and the change's own
 * fields beside them.
 *
 * @param array $suggestion A suggestion, as wfw_suggestion_from_comment() gives it.
 * @return array array( 'id', 'kind', 'status', 'pass', 'path' => int[]|null, 'quote' => string, …the change, 'reason' ).
 */
function wfw_ability_suggestion( $suggestion ) {
    return array(
        'id'     => $suggestion['id'],
        'kind'   => $suggestion['kind'],
        'status' => $suggestion['status'],
        'pass'   => $suggestion['label'],
        'path'   => $suggestion['anchor'] ? $suggestion['anchor']['path'] : null,
        'quote'  => $suggestion['anchor'] ? $suggestion['anchor']['quote'] : '',
    ) + $suggestion['change'] + array( 'reason' => $suggestion['reason'] );
}

/**
 * Where an edit or a comment goes (abilities.md, `writer/suggest-edits`): the
 * quoted passage in the block at `path`, or, with no quote, the passage of the
 * ask it answers.
 *
 * @param WP_Post $note   The note.
 * @param array[] $blocks Its blocks, as wfw_note_read() gave them.
 * @param array   $place  array( 'path' => int[], 'quote' => string, 'occurrence' => int ), each optional.
 * @param int     $ask_id The ask the call answers, or 0.
 * @return array|WP_Error array( 'anchor' => array, 'start' => int, 'end' => int ), the two in characters of the
 *                        block's text; `invalid_args` or `not_found`.
 */
function wfw_ability_passage( $note, $blocks, $place, $ask_id ) {
    if ( isset( $place['quote'] ) ) {
        if ( ! isset( $place['path'] ) ) {
            return wfw_agent_error( 'invalid_args', __( 'path is required with quote.', 'wordpress-for-writers' ) );
        }
        $found = wfw_suggestion_locate( $blocks, $place['path'], $place['quote'], isset( $place['occurrence'] ) ? $place['occurrence'] : 0 );
        if ( is_wp_error( $found ) ) {
            return $found;
        }
        return array(
            'anchor' => wfw_anchor_at( $found['block'], $found['start'], $found['length'] ),
            'start'  => $found['start'],
            'end'    => $found['start'] + $found['length'],
        );
    }
    if ( ! $ask_id ) {
        return wfw_agent_error( 'invalid_args', __( 'quote is required unless ask is given.', 'wordpress-for-writers' ) );
    }
    $passage = wfw_ask_passage( $note, $ask_id );
    if ( is_wp_error( $passage ) ) {
        return $passage;
    }
    return array(
        'anchor' => $passage['anchor'],
        'start'  => $passage['start'],
        'end'    => $passage['start'] + mb_strlen( $passage['anchor']['quote'] ),
    );
}

// ---- Read ------------------------------------------------------------------------

/**
 * `writer/guide`.
 *
 * @return array array( 'guide' => string, 'style' => string ).
 */
function wfw_ability_guide() {
    return array(
        'guide' => wfw_agent_guide(),
        'style' => wfw_get_style_sheet(),
    );
}

/**
 * `writer/notes-list`: the notes the user may edit, 20 a page, newest change
 * first. As core decides `edit_post`: without `edit_others_posts` the notes are
 * the user's own, and without `edit_published_posts` none that is published or
 * scheduled.
 *
 * @param array $input array( 'status', 'search', 'category', 'tag', 'page' ), each optional.
 * @return array|WP_Error array( 'notes' => array[], 'pages' => int, the pages of the query ); `not_found` for a term.
 */
function wfw_ability_notes_list( $input ) {
    $statuses = empty( $input['status'] ) || 'any' === $input['status'] ? array( 'draft', 'pending', 'publish', 'future', 'private' ) : array( $input['status'] );
    if ( ! current_user_can( 'edit_published_posts' ) ) {
        $statuses = array_diff( $statuses, array( 'publish', 'future' ) );
    }
    if ( ! $statuses ) {
        return array(
            'notes' => array(),
            'pages' => 0,
        );
    }
    $args = array(
        'post_type'           => 'post',
        'post_status'         => $statuses,
        'posts_per_page'      => 20,
        'paged'               => isset( $input['page'] ) ? (int) $input['page'] : 1,
        'orderby'             => 'modified',
        'order'               => 'DESC',
        'ignore_sticky_posts' => true,
    );
    if ( isset( $input['search'] ) ) {
        $args['s'] = $input['search'];
    }
    if ( ! current_user_can( 'edit_others_posts' ) ) {
        $args['author'] = get_current_user_id();
    }
    foreach ( array( 'category', 'tag' ) as $field ) {
        if ( ! isset( $input[ $field ] ) ) {
            continue;
        }
        $taxonomy = 'tag' === $field ? 'post_tag' : 'category';
        $term     = get_term_by( 'slug', $input[ $field ], $taxonomy );
        $term     = $term ? $term : get_term_by( 'name', $input[ $field ], $taxonomy );
        if ( ! $term ) {
            return wfw_agent_error(
                'not_found',
                'tag' === $field
                    /* translators: %s: the name of a tag. */
                    ? sprintf( __( 'Tag %s was not found.', 'wordpress-for-writers' ), $input[ $field ] )
                    /* translators: %s: the name of a category. */
                    : sprintf( __( 'Category %s was not found.', 'wordpress-for-writers' ), $input[ $field ] )
            );
        }
        // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- one page of notes by a term, as the note list asks.
        $args['tax_query'][] = array(
            'taxonomy' => $taxonomy,
            'terms'    => $term->term_id,
        );
    }
    $query = new WP_Query( $args );
    // The query follows core's rules for the user's role; a note it found that the user may still not edit is left out.
    $notes = array_filter( $query->posts, function ( $note ) {
        return current_user_can( 'edit_post', $note->ID );
    } );
    return array(
        'notes' => array_map( function ( $note ) {
            return array(
                'id'          => $note->ID,
                'title'       => $note->post_title,
                'status'      => $note->post_status,
                'modified'    => wfw_note_modified( $note ),
                'words'       => wfw_ability_words( wfw_note_blocks( $note->post_content ) ),
                'suggestions' => wfw_suggestions_count_open( $note->ID ),
                'asks'        => wfw_asks_count_open( $note->ID ),
            );
        }, array_values( $notes ) ),
        'pages' => (int) $query->max_num_pages,
    );
}

/**
 * `writer/note-get`: one note as text, with its open asks and suggestions.
 *
 * @param array $input array( 'note' => int ).
 * @return array|WP_Error array( 'note' => array, 'blocks' => array[], 'asks' => array[], 'suggestions' => array[] ).
 */
function wfw_ability_note_get( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    $read = wfw_note_read( $note );
    return array(
        'note'        => array(
            'id'         => $note->ID,
            'title'      => $read['title'],
            'status'     => $note->post_status,
            'excerpt'    => $read['excerpt'],
            'categories' => wp_get_post_terms( $note->ID, 'category', array( 'fields' => 'names' ) ),
            'tags'       => wp_get_post_terms( $note->ID, 'post_tag', array( 'fields' => 'names' ) ),
            'modified'   => $read['modified'],
            'words'      => wfw_ability_words( $read['blocks'] ),
            'from'       => $read['from'],
        ),
        'blocks'      => $read['blocks'],
        'asks'        => wfw_note_asks( $note ),
        'suggestions' => array_map( 'wfw_ability_suggestion', wfw_suggestions_get( $note->ID, array(
            'status' => 'open',
            'number' => 0,
        ) ) ),
    );
}

/**
 * `writer/library-get`: the site's categories and tags. A category's `parent`
 * is its parent's slug, or the empty string.
 *
 * @return array array( 'categories' => array[], 'tags' => array[] ).
 */
function wfw_ability_library_get() {
    $categories = get_terms( array(
        'taxonomy'   => 'category',
        'hide_empty' => false,
    ) );
    $slugs      = wp_list_pluck( $categories, 'slug', 'term_id' );
    return array(
        'categories' => array_map( function ( $term ) use ( $slugs ) {
            return array(
                'name'   => $term->name,
                'slug'   => $term->slug,
                'count'  => $term->count,
                'parent' => isset( $slugs[ $term->parent ] ) ? $slugs[ $term->parent ] : '',
            );
        }, $categories ),
        'tags'       => array_map( function ( $term ) {
            return array(
                'name'  => $term->name,
                'slug'  => $term->slug,
                'count' => $term->count,
            );
        }, get_terms( array(
            'taxonomy'   => 'post_tag',
            'hide_empty' => false,
        ) ) ),
    );
}

/**
 * `writer/suggestions-list`: what became of a note's suggestions, the newest
 * 100.
 *
 * @param array $input array( 'note' => int, 'status' => string, optional ).
 * @return array|WP_Error array( 'suggestions' => array[] ), each as wfw_ability_suggestion() with `date`, and
 *                        `ask` where it answers one.
 */
function wfw_ability_suggestions_list( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    return array(
        'suggestions' => array_map( function ( $suggestion ) {
            $listed = wfw_ability_suggestion( $suggestion ) + array( 'date' => $suggestion['date'] );
            if ( $suggestion['ask'] ) {
                $listed['ask'] = $suggestion['ask'];
            }
            return $listed;
        }, wfw_suggestions_get( $note->ID, array( 'status' => isset( $input['status'] ) ? $input['status'] : 'any' ) ) ),
    );
}

// ---- Suggest ---------------------------------------------------------------------

/**
 * `writer/suggest-edits`: one pass of text edits. Each is placed in the note
 * as it reads now, and no two may overlap in a block.
 *
 * @param array $input array( 'note' => int, 'ask' => int, optional, 'pass' => string, 'edits' => array[] ).
 * @return array|WP_Error array( 'pass' => string, 'suggestions' => int[] ).
 */
function wfw_ability_suggest_edits( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    $read        = wfw_note_read( $note );
    $ask_id      = isset( $input['ask'] ) ? (int) $input['ask'] : 0;
    $places      = array();
    $suggestions = array();
    foreach ( array_values( $input['edits'] ) as $index => $edit ) {
        $place = wfw_ability_passage( $note, $read['blocks'], $edit, $ask_id );
        if ( is_wp_error( $place ) ) {
            return $place;
        }
        foreach ( $places as $other => $taken ) {
            if ( $taken['anchor']['path'] === $place['anchor']['path'] && $place['start'] < $taken['end'] && $taken['start'] < $place['end'] ) {
                /* translators: 1, 2: the positions of two edits in the input, 3: a block's path, such as [4]. */
                return wfw_agent_error( 'invalid_args', sprintf( __( 'edits[%1$d] and edits[%2$d] overlap in block %3$s.', 'wordpress-for-writers' ), $other, $index, wfw_path_label( $place['anchor']['path'] ) ) );
            }
        }
        $places[]      = $place;
        $suggestions[] = array(
            'kind'   => 'edit',
            'anchor' => $place['anchor'],
            'change' => array( 'replacement' => $edit['replacement'] ),
            'reason' => isset( $edit['reason'] ) ? $edit['reason'] : '',
        );
    }
    return wfw_suggestions_create( $note->ID, array(
        'label' => $input['pass'],
        'ask'   => $ask_id,
    ), $suggestions );
}

/**
 * `writer/suggest-blocks`: insert, remove or move whole top-level blocks. A
 * block to insert must be one the Writer editor offers.
 *
 * @param array $input array( 'note' => int, 'ask' => int, optional, 'pass' => string, 'changes' => array[] ).
 * @return array|WP_Error array( 'pass' => string, 'suggestions' => int[] ).
 */
function wfw_ability_suggest_blocks( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    $read        = wfw_note_read( $note );
    $offered     = wfw_allowed_block_types( true );
    $suggestions = array();
    foreach ( $input['changes'] as $change ) {
        $clean = wfw_sanitize_suggestion_change( 'blocks', $change );
        if ( is_wp_error( $clean ) ) {
            return $clean;
        }
        if ( 'insert' === $clean['op'] ) {
            foreach ( wfw_note_walk( $clean['markup'] ) as $block ) {
                if ( ! in_array( $block['name'], $offered, true ) ) {
                    /* translators: %s: the name of a block, such as core/columns. */
                    return wfw_agent_error( 'not_allowed', sprintf( __( 'The Writer editor does not offer the block %s.', 'wordpress-for-writers' ), $block['name'] ) );
                }
            }
        }
        // The block the change is about: the one named, or for an insert the one it goes after. The start of the note is no block.
        $about  = 'insert' === $clean['op'] ? $clean['after'] : $clean['block'];
        $anchor = $about < 0 ? null : wfw_block_anchor( $read['blocks'], array( $about ) );
        if ( is_wp_error( $anchor ) ) {
            return $anchor;
        }
        if ( 'move' === $clean['op'] && $clean['after'] >= 0 ) {
            $after = wfw_block_at( $read['blocks'], array( $clean['after'] ) );
            if ( is_wp_error( $after ) ) {
                return $after;
            }
        }
        $suggestions[] = array(
            'kind'   => 'blocks',
            'anchor' => $anchor,
            'change' => $clean,
            'reason' => isset( $change['reason'] ) ? $change['reason'] : '',
        );
    }
    return wfw_suggestions_create( $note->ID, array(
        'label' => $input['pass'],
        'ask'   => isset( $input['ask'] ) ? (int) $input['ask'] : 0,
    ), $suggestions );
}

/**
 * `writer/suggest-details`: a title, an excerpt, tags or categories, one
 * suggestion for each given, in a pass labelled "Details".
 *
 * @param array $input array( 'note' => int, 'ask' => int, 'titles' => string[], 'excerpt' => string,
 *                     'tags' => string[], 'categories' => string[], 'reason' => string ), all but `note` optional.
 * @return array|WP_Error array( 'pass' => string, 'suggestions' => int[] ).
 */
function wfw_ability_suggest_details( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    foreach ( isset( $input['categories'] ) ? $input['categories'] : array() as $name ) {
        if ( ! get_term_by( 'name', $name, 'category' ) ) {
            /* translators: %s: the name of a category. */
            return wfw_agent_error( 'not_found', sprintf( __( 'Category %s was not found.', 'wordpress-for-writers' ), $name ) );
        }
    }
    $suggestions = array();
    foreach ( array( 'titles', 'excerpt', 'tags', 'categories' ) as $field ) {
        if ( isset( $input[ $field ] ) ) {
            $suggestions[] = array(
                'kind'   => 'details',
                'change' => array(
                    'field' => $field,
                    'value' => $input[ $field ],
                ),
                'reason' => isset( $input['reason'] ) ? $input['reason'] : '',
            );
        }
    }
    if ( ! $suggestions ) {
        return wfw_agent_error( 'invalid_args', __( 'One of titles, excerpt, tags or categories is required.', 'wordpress-for-writers' ) );
    }
    return wfw_suggestions_create( $note->ID, array(
        // Stored in English, as agents read it back: the pass's label in abilities.md.
        'label' => 'Details',
        'ask'   => isset( $input['ask'] ) ? (int) $input['ask'] : 0,
    ), $suggestions );
}

/**
 * `writer/comment`: a remark on a passage, with no change proposed, in a pass
 * of its own labelled "Comment".
 *
 * @param array $input array( 'note' => int, 'ask' => int, 'path' => int[], 'quote' => string, 'occurrence' => int,
 *                     'text' => string ); the passage as for an edit.
 * @return array|WP_Error array( 'pass' => string, 'suggestions' => int[] ).
 */
function wfw_ability_comment( $input ) {
    $note = wfw_agent_note( $input['note'] );
    if ( is_wp_error( $note ) ) {
        return $note;
    }
    $read   = wfw_note_read( $note );
    $ask_id = isset( $input['ask'] ) ? (int) $input['ask'] : 0;
    $place  = wfw_ability_passage( $note, $read['blocks'], $input, $ask_id );
    if ( is_wp_error( $place ) ) {
        return $place;
    }
    return wfw_suggestions_create( $note->ID, array(
        // Stored in English, as agents read it back: the pass's label in abilities.md.
        'label' => 'Comment',
        'ask'   => $ask_id,
    ), array(
        array(
            'kind'   => 'comment',
            'anchor' => $place['anchor'],
            'reason' => $input['text'],
        ),
    ) );
}

/**
 * `writer/suggestions-withdraw`.
 *
 * @param array $input array( 'note' => int, 'suggestions' => int[] ).
 * @return array|WP_Error array( 'withdrawn' => int[] ).
 */
function wfw_ability_suggestions_withdraw( $input ) {
    return wfw_suggestions_withdraw( $input['note'], $input['suggestions'] );
}

// ---- The registry ----------------------------------------------------------------

add_action( 'wp_abilities_api_categories_init', function () {
    wp_register_ability_category( 'writer', array(
        'label'       => 'Writer',
        'description' => 'Read a writer\'s notes and suggest changes to them. The writer accepts or dismisses each suggestion in the Writer editor.',
    ) );
} );

/*
 * The closed list (abilities.md). Labels and descriptions are not translated:
 * agents read them. `meta.mcp.public` offers each to the MCP Adapter;
 * `show_in_rest` is left unset, so core's REST route for abilities has none.
 */
add_action( 'wp_abilities_api_init', function () {
    $note    = array(
        'type'        => 'integer',
        'description' => 'The id of the note.',
    );
    $ask     = array(
        'type'        => 'integer',
        'description' => 'The id of the ask this answers. The suggestions are stored as replies to it.',
    );
    $pass    = array(
        'type'        => 'string',
        'minLength'   => 1,
        'maxLength'   => 40,
        'description' => 'The label the writer sees: "Proofread", "Tighten".',
    );
    $reason  = array(
        'type'        => 'string',
        'maxLength'   => 300,
        'description' => 'Why. Shown to the writer.',
    );
    $passage = array(
        'path'       => array(
            'type'        => 'array',
            'items'       => array(
                'type'    => 'integer',
                'minimum' => 0,
            ),
            'minItems'    => 1,
            'description' => 'The block, as its path in writer/note-get. Required unless ask is given and quote is not.',
        ),
        'quote'      => array(
            'type'        => 'string',
            'minLength'   => 1,
            'maxLength'   => 2000,
            'description' => 'The passage, exactly as it reads in the block\'s text. Required unless ask is given: the passage is then the ask\'s.',
        ),
        'occurrence' => array(
            'type'        => 'integer',
            'minimum'     => 1,
            'description' => 'Which one, 1 for the first, when quote occurs more than once in the block.',
        ),
    );
    $strings = function ( $most, $longest, $description ) {
        return array(
            'type'        => 'array',
            'items'       => array(
                'type'      => 'string',
                'maxLength' => $longest,
            ),
            'minItems'    => 1,
            'maxItems'    => $most,
            'description' => $description,
        );
    };

    $abilities = array(
        'writer/guide'                => array(
            'label'       => 'Guide',
            'description' => 'How to work on this site: the steps and the rules for suggesting changes to a writer\'s notes, and the writer\'s style sheet. Read it first.',
            'execute'     => 'wfw_ability_guide',
            'readonly'    => true,
        ),
        'writer/notes-list'           => array(
            'label'       => 'List notes',
            'description' => 'Find notes the user may edit, 20 a page, newest change first.',
            'execute'     => 'wfw_ability_notes_list',
            'readonly'    => true,
            'properties'  => array(
                'status'   => array(
                    'type'        => 'string',
                    'enum'        => array( 'draft', 'pending', 'publish', 'future', 'any' ),
                    'description' => 'Default any, which leaves out the Trash.',
                ),
                'search'   => array(
                    'type'        => 'string',
                    'maxLength'   => 200,
                    'description' => 'Words to search the notes for.',
                ),
                'category' => array(
                    'type'        => 'string',
                    'description' => 'A category\'s name or slug.',
                ),
                'tag'      => array(
                    'type'        => 'string',
                    'description' => 'A tag\'s name or slug.',
                ),
                'page'     => array(
                    'type'        => 'integer',
                    'minimum'     => 1,
                    'description' => 'The page, 1 by default.',
                ),
            ),
        ),
        'writer/note-get'             => array(
            'label'       => 'Get note',
            'description' => 'One note as text: its blocks, each with its path, text and html, the asks the writer left on it, and its open suggestions.',
            'execute'     => 'wfw_ability_note_get',
            'readonly'    => true,
            'properties'  => array( 'note' => $note ),
            'required'    => array( 'note' ),
        ),
        'writer/library-get'          => array(
            'label'       => 'Get library',
            'description' => 'The site\'s categories and tags. Suggest terms from this list.',
            'execute'     => 'wfw_ability_library_get',
            'readonly'    => true,
        ),
        'writer/suggestions-list'     => array(
            'label'       => 'List suggestions',
            'description' => 'What became of the suggestions made for a note, the newest 100, so you learn what this writer dismisses.',
            'execute'     => 'wfw_ability_suggestions_list',
            'readonly'    => true,
            'properties'  => array(
                'note'   => $note,
                'status' => array(
                    'type'        => 'string',
                    'enum'        => array( 'open', 'accepted', 'dismissed', 'withdrawn', 'any' ),
                    'description' => 'Default any.',
                ),
            ),
            'required'    => array( 'note' ),
        ),
        'writer/suggest-edits'        => array(
            'label'       => 'Suggest edits',
            'description' => 'One pass of text edits to a note. Each replaces a quoted passage. The note is not changed: the writer accepts or dismisses each edit.',
            'execute'     => 'wfw_ability_suggest_edits',
            'readonly'    => false,
            'properties'  => array(
                'note'  => $note,
                'ask'   => $ask,
                'pass'  => $pass,
                'edits' => array(
                    'type'        => 'array',
                    'minItems'    => 1,
                    'maxItems'    => 50,
                    'description' => 'The edits. To add text, quote the words it goes beside and give them back with the addition. Two edits must not overlap in a block.',
                    'items'       => array(
                        'type'                 => 'object',
                        'properties'           => $passage + array(
                            'replacement' => array(
                                'type'        => 'string',
                                'maxLength'   => 4000,
                                'description' => 'What replaces the passage. The empty string removes it. It may hold the inline formatting a block\'s html shows: strong, em, a with href, code, s, sub, sup. Anything else is removed.',
                            ),
                            'reason'      => $reason,
                        ),
                        'required'             => array( 'replacement' ),
                        'additionalProperties' => false,
                    ),
                ),
            ),
            'required'    => array( 'note', 'pass', 'edits' ),
        ),
        'writer/suggest-blocks'       => array(
            'label'       => 'Suggest blocks',
            'description' => 'Suggest inserting, removing or moving whole top-level blocks of a note. The note is not changed: the writer accepts or dismisses each change.',
            'execute'     => 'wfw_ability_suggest_blocks',
            'readonly'    => false,
            'properties'  => array(
                'note'    => $note,
                'ask'     => $ask,
                'pass'    => $pass,
                'changes' => array(
                    'type'     => 'array',
                    'minItems' => 1,
                    'maxItems' => 20,
                    'items'    => array(
                        'type'                 => 'object',
                        'properties'           => array(
                            'op'     => array(
                                'type' => 'string',
                                'enum' => array( 'insert', 'remove', 'move' ),
                            ),
                            'block'  => array(
                                'type'        => 'integer',
                                'minimum'     => 0,
                                'description' => 'The top-level block to remove or move.',
                            ),
                            'after'  => array(
                                'type'        => 'integer',
                                'minimum'     => -1,
                                'description' => 'The top-level block an inserted or moved block goes after. -1 is the start of the note.',
                            ),
                            'markup' => array(
                                'type'        => 'string',
                                'maxLength'   => 20000,
                                'description' => 'The block markup to insert, of blocks the Writer editor offers.',
                            ),
                            'reason' => $reason,
                        ),
                        'required'             => array( 'op' ),
                        'additionalProperties' => false,
                    ),
                ),
            ),
            'required'    => array( 'note', 'pass', 'changes' ),
        ),
        'writer/suggest-details'      => array(
            'label'       => 'Suggest details',
            'description' => 'Suggest a title, an excerpt, tags or categories for a note: at least one of the four. The note is not changed: the writer accepts or dismisses each.',
            'execute'     => 'wfw_ability_suggest_details',
            'readonly'    => false,
            'properties'  => array(
                'note'       => $note,
                'ask'        => $ask,
                'titles'     => $strings( 5, 200, 'Options for the title. The writer picks one or keeps theirs.' ),
                'excerpt'    => array(
                    'type'      => 'string',
                    'maxLength' => 600,
                ),
                'tags'       => $strings( 10, 100, 'Tags to add, by name.' ),
                'categories' => $strings( 5, 100, 'Categories to add, by name. Each must exist.' ),
                'reason'     => $reason,
            ),
            'required'    => array( 'note' ),
        ),
        'writer/comment'              => array(
            'label'       => 'Comment',
            'description' => 'A remark on a passage of a note, with no change proposed: a question for the writer, a fact to check.',
            'execute'     => 'wfw_ability_comment',
            'readonly'    => false,
            'properties'  => array(
                'note' => $note,
                'ask'  => $ask,
            ) + $passage + array(
                'text' => array(
                    'type'        => 'string',
                    'minLength'   => 1,
                    'maxLength'   => 600,
                    'description' => 'The remark.',
                ),
            ),
            'required'    => array( 'note', 'text' ),
        ),
        'writer/suggestions-withdraw' => array(
            'label'       => 'Withdraw suggestions',
            'description' => 'Withdraw suggestions you made for a note. Each named one that is open becomes withdrawn.',
            'execute'     => 'wfw_ability_suggestions_withdraw',
            'readonly'    => false,
            'properties'  => array(
                'note'        => $note,
                'suggestions' => array(
                    'type'     => 'array',
                    'items'    => array( 'type' => 'integer' ),
                    'minItems' => 1,
                    'maxItems' => 200,
                ),
            ),
            'required'    => array( 'note', 'suggestions' ),
        ),
    );

    foreach ( $abilities as $name => $ability ) {
        $args = array(
            'label'               => $ability['label'],
            'description'         => $ability['description'],
            'category'            => 'writer',
            'ability_class'       => 'WFW_Ability',
            'execute_callback'    => $ability['execute'],
            // Who may call (surface.md). The note an ability names is checked where it is read: wfw_agent_note().
            'permission_callback' => function () {
                return is_user_logged_in() && wfw_user_can_write();
            },
            'meta'                => array(
                'mcp'         => array( 'public' => true ),
                'annotations' => array(
                    'readonly'    => $ability['readonly'],
                    'destructive' => false,
                ),
            ),
        );
        // An ability with no input has no schema.
        if ( isset( $ability['properties'] ) ) {
            $args['input_schema'] = array(
                'type'                 => 'object',
                'properties'           => $ability['properties'],
                'additionalProperties' => false,
            );
            if ( isset( $ability['required'] ) ) {
                $args['input_schema']['required'] = $ability['required'];
            } else {
                // Every field is optional: a call with no input is one with none of them.
                $args['input_schema']['default'] = array();
            }
        }
        wp_register_ability( $name, $args );
    }
} );
