/**
 * Review: what the writer sees of an agent in the Writer editor, and what they
 * do about it (spec/agent/editor.md). The stub in editor.js loads this file,
 * with suggest.css, only on a site an agent has used or for a note that has a
 * core note; it finds the editor through window.wfwAgent (see "The agent
 * surface" in editor.js) and starts by calling window.wfwAgent.start().
 *
 * Suggestions come from the store's routes (includes/suggestions.php), asks
 * and their replies from core's comments route. A suggestion's passage is
 * looked for in the note as it is now each time the note changes, drawn over
 * the canvas with the CSS Custom Highlight API, and never written into the
 * note. Accepting is an edit of the note in the editor, one step of undo.
 */
( function () {
    const agent = window.wfwAgent;
    const { createElement: el, Fragment, useState, useEffect, useMemo, useRef } = wp.element;
    const { select, dispatch, subscribe, useSelect } = wp.data;
    const { __, _n, sprintf } = wp.i18n;
    const { create, insert, toHTMLString, RichTextData } = wp.richText;
    const { Button, Fill, Popover, ToolbarButton } = wp.components;
    const { decodeEntities } = wp.htmlEntities;
    const apiFetch = wp.apiFetch;
    const editorStore = wp.editor.store;
    const blockEditorStore = wp.blockEditor.store;
    const noticesStore = 'core/notices';

    const NOTE = 'core/note';
    const SNACKBAR = 'wfw-agent';
    const HIGHLIGHTS = [ 'wfw-passage', 'wfw-edit', 'wfw-active' ];
    // A pane this wide has the rail beside the note; a narrower one, a phone's among them, has the sheet.
    const WIDE = window.matchMedia( '(min-width: 900px)' );
    const POLL = 5000;
    const FRESH = 600;
    const SUGGESTIONS = '/wfw/v1/notes/' + agent.postId + '/suggestions';
    const NOTES = '/wp/v2/comments?context=edit&type=note&status=all&per_page=-1&_fields=id,parent,status,author,author_name,content,meta&post=' + agent.postId;

    // Every core note of the note. Its suggestions are core notes too, and soon outnumber a page: apiFetch asks for each page (per_page=-1).
    const coreNotes = () => apiFetch( { path: NOTES } );

    // What the server said of when a way in was last used, with how far its clock is from this one.
    const clockOf = ( { seen, now } ) => ( { seen, skew: now - Date.now() / 1000 } );

    const undo = () => dispatch( editorStore ).undo();

    // The keys of what Review lists: a suggestion's card, and an ask's.
    const cardKey = ( id ) => 's' + id;
    const askKey = ( id ) => 'a' + id;

    // A rich text attribute's value as a record to work on, and a record as an attribute's value again.
    const toRecord = ( value ) => create( { html: value.toHTMLString() } );
    const toData = ( record ) => RichTextData.fromHTMLString( toHTMLString( { value: record } ) );

    // Whether a MediaQueryList matches, now and as it changes.
    function useMedia( media ) {
        const [ matches, setMatches ] = useState( media.matches );
        useEffect( () => {
            const listener = () => setMatches( media.matches );
            media.addEventListener( 'change', listener );
            return () => media.removeEventListener( 'change', listener );
        }, [] );
        return matches;
    }

    // ---- A block's text ------------------------------------------------------

    /*
     * The text an agent was given for a block, worked out as the store does
     * (wfw_rich_text_html() and wfw_rich_text_plain() in suggestions.php) from
     * the block's own saved HTML, without its inner blocks': tags that are not
     * inline formatting split it into runs joined by a newline, a line break
     * is a newline, the other tags go and entities are decoded. The inline
     * tags are the store's own (WFW_INLINE_TAGS), from the page's config.
     */
    const NOT_INLINE = new RegExp( '<(?!\\/?(?:' + agent.config.inlineTags.join( '|' ) + ')\\b)[^>]*>', 'gi' );

    function plainText( html ) {
        const runs = html.split( NOT_INLINE )
            .map( ( run ) => run.replace( /^[\r\n\t]+|[\r\n\t]+$/g, '' ) )
            .filter( ( run ) => ! /^[ \t\n\r\0\v]*$/.test( run ) );
        return decodeEntities( runs.join( '\n' ).replace( /<br\s*\/?>/gi, '\n' ).replace( /<[^>]*>/g, '' ) );
    }

    // Blocks are not changed in place, so a block's text is worked out once.
    const texts = new WeakMap();

    function blockText( block ) {
        if ( ! texts.has( block ) ) {
            texts.set( block, plainText( wp.blocks.getSaveContent( block.name, block.attributes, [] ) ) );
        }
        return texts.get( block );
    }

    // The blocks a path counts: the parser's blocks with no name are the editor's freeform ones.
    function named( blocks ) {
        const freeform = wp.blocks.getFreeformContentHandlerName();
        return blocks.filter( ( block ) => block.name !== freeform );
    }

    // Every block of the note, depth-first, each with its path (surface.md, Reading a note) and its place in the list.
    function listBlocks( blocks ) {
        const list = [];
        const walk = ( some, prefix ) => named( some ).forEach( ( block, index ) => {
            const path = [ ...prefix, index ];
            list.push( { block, path, order: list.length } );
            walk( block.innerBlocks, path );
        } );
        walk( blocks, [] );
        return list;
    }

    // The block at an anchor's path, if it has the anchor's name. A list is indexed once, the first time it is asked.
    const indexes = new WeakMap();

    function blockAt( list, anchor ) {
        if ( ! indexes.has( list ) ) {
            indexes.set( list, new Map( list.map( ( entry ) => [ String( entry.path ) + ' ' + entry.block.name, entry ] ) ) );
        }
        return indexes.get( list ).get( String( anchor.path ) + ' ' + anchor.name );
    }

    /*
     * A block's rich text attributes, each with its text and where that text
     * sits in the block's. An inline image is one character in rich text and
     * the newline between two runs in the block's text.
     */
    const fields = new WeakMap();

    function richTexts( block ) {
        if ( ! fields.has( block ) ) {
            const text = blockText( block );
            fields.set( block, Object.entries( block.attributes ).flatMap( ( [ key, value ] ) => {
                if ( ! ( value instanceof RichTextData ) ) {
                    return [];
                }
                const record = toRecord( value );
                const at = record.text ? text.indexOf( record.text.replace( /￼/g, '\n' ) ) : -1;
                return at === -1 ? [] : [ { key, record, at } ];
            } ) );
        }
        return fields.get( block );
    }

    // ---- Placing -------------------------------------------------------------

    /*
     * A character is a Unicode code point, as in the store. The first `count`
     * of a text from a place in it, and the last `count` up to one: read from
     * twice as many UTF-16 units, which always hold them.
     */
    function firstPoints( text, count, from = 0 ) {
        return Array.from( text.slice( from, from + count * 2 ) ).slice( 0, count ).join( '' );
    }

    function lastPoints( text, count, to = text.length ) {
        return Array.from( text.slice( Math.max( 0, to - count * 2 ), to ) ).slice( -count ).join( '' );
    }

    // Where the anchor's quote is in a text with the same 32 characters before it and after it: on both sides, on one at least, or wherever it is (`sides` is 2, 1 or 0).
    function quoteStarts( text, anchor, sides ) {
        const starts = [];
        // A block with no text (an image an ask is on) gives an empty quote: nowhere, not everywhere.
        if ( ! anchor.quote ) {
            return starts;
        }
        for ( let at = text.indexOf( anchor.quote ); at !== -1; at = text.indexOf( anchor.quote, at + 1 ) ) {
            const before = () => lastPoints( text, 32, at ) === anchor.prefix;
            const after = () => firstPoints( text, 32, at + anchor.quote.length ) === anchor.suffix;
            if ( sides === 0 || ( sides === 1 ? before() || after() : before() && after() ) ) {
                starts.push( at );
            }
        }
        return starts;
    }

    // A passage of a block's text as a place in one of its rich texts, or null when no one rich text holds it.
    function passage( entry, start, length ) {
        const field = richTexts( entry.block ).find( ( { at, record } ) => at <= start && start + length <= at + record.text.length );
        return field ? { ...entry, key: field.key, record: field.record, start: start - field.at, end: start - field.at + length, offset: start } : null;
    }

    // A whole block's anchor among the top-level blocks, by the start of their text: at its path, or the one place it is.
    function placeBlock( list, anchor ) {
        const matches = ( { path, block } ) => path.length === 1 && firstPoints( blockText( block ), 64 ) === anchor.quote;
        const here = blockAt( list, anchor );
        const found = here && matches( here ) ? [ here ] : list.filter( matches );
        return found.length === 1 ? found[ 0 ] : null;
    }

    /*
     * Where a suggestion's anchor is in the note as it is now (surface.md,
     * Placing): in the block at its path, if that has its name, with the same
     * text around it, or on one side of it if that is one place; otherwise
     * wherever in the note the quote stands with the same text around it, if
     * that is one place; otherwise wherever the quote stands, if that is one
     * place. Null is out of date. A suggestion about a whole block is looked
     * for among the top-level blocks, by the start of their text.
     *
     * `list` is the note's blocks as listBlocks() gives them. What comes back
     * is { block, path, order } and, for a passage, { key, record, start, end,
     * offset } too; for a move that goes after a block, that block as `after`.
     */
    function place( list, suggestion ) {
        const { anchor } = suggestion;

        if ( suggestion.kind === 'blocks' ) {
            const at = placeBlock( list, anchor );
            if ( ! at || ! anchor.after ) {
                return at;
            }
            // A move is placed when the block it goes after is found too.
            const after = placeBlock( list, anchor.after );
            return after ? { ...at, after: after.block } : null;
        }

        const here = blockAt( list, anchor );
        if ( here ) {
            const text = blockText( here.block );
            const starts = quoteStarts( text, anchor, 2 );
            if ( starts.length ) {
                return passage( here, starts[ 0 ], anchor.quote.length );
            }
            // An edit accepted beside it changed the text on one side: the other side still tells which it is.
            const beside = quoteStarts( text, anchor, 1 );
            if ( beside.length === 1 ) {
                return passage( here, beside[ 0 ], anchor.quote.length );
            }
        }
        for ( const sides of [ 2, 0 ] ) {
            const found = list.flatMap( ( entry ) => quoteStarts( blockText( entry.block ), anchor, sides ).map( ( start ) => [ entry, start ] ) );
            if ( found.length === 1 ) {
                return passage( found[ 0 ][ 0 ], found[ 0 ][ 1 ], anchor.quote.length );
            }
        }
        return null;
    }

    // ---- Changing the note ---------------------------------------------------

    /*
     * A rich text's value with a passage replaced. The replacement carries its own
     * inline formatting; formatting that covered the whole passage and that the
     * replacement does not carry goes around it (an ask's marker among them).
     */
    function replaced( record, start, end, replacement ) {
        const next = create( { html: replacement } );
        const carried = new Set( next.formats.flat().filter( Boolean ).map( ( format ) => format.type ) );
        const covers = ( format ) => {
            for ( let i = start; i < end; i++ ) {
                if ( ! ( record.formats[ i ] || [] ).some( ( other ) => other.type === format.type && JSON.stringify( other.attributes ) === JSON.stringify( format.attributes ) ) ) {
                    return false;
                }
            }
            return true;
        };
        const around = ( record.formats[ start ] || [] ).filter( ( format ) => ! carried.has( format.type ) && covers( format ) );
        if ( around.length ) {
            for ( let i = 0; i < next.text.length; i++ ) {
                next.formats[ i ] = [ ...around, ...( next.formats[ i ] || [] ) ];
            }
        }
        return insert( record, next, start, end );
    }

    // The tree with each block's attributes passed through change(), which answers null to leave a block as it is.
    function mapBlocks( blocks, change ) {
        return blocks.map( ( block ) => {
            const attributes = change( block );
            const innerBlocks = mapBlocks( block.innerBlocks, change );
            if ( ! attributes && innerBlocks.every( ( inner, index ) => inner === block.innerBlocks[ index ] ) ) {
                return block;
            }
            return { ...block, attributes: { ...block.attributes, ...attributes }, innerBlocks };
        } );
    }

    /*
     * The blocks an insert's markup gives that the editor takes: each valid,
     * and of a type the editor allows (its allowedBlockTypes setting; true is
     * every registered type), its inner blocks too. The rest are left out.
     */
    function insertable( markup ) {
        const allowed = select( blockEditorStore ).getSettings().allowedBlockTypes;
        const takes = ( block ) => block.isValid
            && ( Array.isArray( allowed ) ? allowed.includes( block.name ) : allowed !== false )
            && block.innerBlocks.every( takes );
        return wp.blocks.parse( markup ).filter( takes );
    }

    /*
     * What accepting a suggestion does to the note's blocks (editor.md,
     * Accepting), placed in the note as it is: null when it is out of date,
     * and { suggestion, refused: true } for an insert with no block the editor
     * takes. `list` is what listBlocks() gives for the note's blocks, and the
     * suggestion an `edit` or a `blocks` one. Blocks are named by themselves,
     * not by where they are, so several plans made of one note can be carried
     * out together.
     */
    function planned( list, suggestion ) {
        const { anchor, change } = suggestion;
        const made = change.op === 'insert' ? insertable( change.markup ) : null;
        if ( made && ! made.length ) {
            return { suggestion, refused: true };
        }
        const at = anchor && place( list, suggestion );
        if ( anchor && ! at ) {
            return null;
        }
        if ( suggestion.kind === 'edit' ) {
            return { suggestion, edit: at };
        }
        if ( made ) {
            return { suggestion, insert: made, after: at ? at.block : null };
        }
        if ( change.op === 'remove' ) {
            return { suggestion, remove: at.block };
        }
        if ( change.after < 0 ) {
            return { suggestion, move: at.block, after: null };
        }
        // Where a move goes is a block too, found with the one it moves.
        return at.after ? { suggestion, move: at.block, after: at.after } : null;
    }

    /*
     * The note's blocks with plans carried out as one change, and the
     * suggestions it took. Nothing is changed in place: the editor takes the
     * result as an edit, and Peek serializes it. The blocks are inserted,
     * removed and moved first; then each rich text takes its edits from the
     * last to the first, so none moves another. A plan whose block another
     * removed, or whose passage another edit took, is left out, and so is
     * one that was refused.
     */
    function carriedOut( blocks, plans ) {
        let next = blocks;
        const done = [];
        plans.filter( ( plan ) => plan && ! plan.refused ).forEach( ( plan ) => {
            const block = plan.remove || plan.move;
            if ( plan.edit || ( block && ! next.includes( block ) ) || ( plan.after && ! next.includes( plan.after ) ) ) {
                return;
            }
            const rest = block ? next.filter( ( other ) => other !== block ) : next;
            if ( plan.remove ) {
                next = rest;
            } else if ( plan.after !== block ) {
                const index = plan.after ? rest.indexOf( plan.after ) + 1 : 0;
                next = [ ...rest.slice( 0, index ), ...( plan.insert || [ block ] ), ...rest.slice( index ) ];
            }
            done.push( plan.suggestion );
        } );

        const edits = new Map();
        plans.filter( ( plan ) => plan && plan.edit ).forEach( ( plan ) => {
            const fields = edits.get( plan.edit.block ) || edits.set( plan.edit.block, {} ).get( plan.edit.block );
            fields[ plan.edit.key ] = [ ...( fields[ plan.edit.key ] || [] ), plan ];
        } );
        next = mapBlocks( next, ( block ) => {
            const fields = edits.get( block );
            if ( ! fields ) {
                return null;
            }
            return Object.fromEntries( Object.entries( fields ).map( ( [ key, ofField ] ) => {
                const taken = [];
                ofField.sort( ( a, b ) => a.edit.start - b.edit.start ).forEach( ( plan ) => {
                    if ( ! taken.length || taken[ taken.length - 1 ].edit.end <= plan.edit.start ) {
                        taken.push( plan );
                    }
                } );
                done.push( ...taken.map( ( plan ) => plan.suggestion ) );
                const value = taken.reduceRight( ( record, plan ) => replaced( record, plan.edit.start, plan.edit.end, plan.suggestion.change.replacement ), taken[ 0 ].edit.record );
                return [ key, toData( value ) ];
            } ) );
        } );
        return { blocks: next, done };
    }

    // A term's id by its name, or 0. A tag that does not exist is made when asked to; categories never are.
    async function termId( field, name, make ) {
        const found = await apiFetch( { path: wp.url.addQueryArgs( '/wp/v2/' + field, { search: name, per_page: 100, _fields: 'id,name' } ) } );
        const term = found.find( ( candidate ) => decodeEntities( candidate.name ).toLowerCase() === name.toLowerCase() );
        if ( term || ! make ) {
            return term ? term.id : 0;
        }
        return ( await apiFetch( { path: '/wp/v2/' + field, method: 'POST', data: { name } } ) ).id;
    }

    // As core's tags form decides it: the post says whether its user may make a tag.
    function mayCreateTags() {
        const links = select( editorStore ).getCurrentPost()._links || {};
        return !! links[ 'wp:action-create-tags' ];
    }

    // ---- Asks, in core's shape -------------------------------------------------

    function noteIds( metadata ) {
        return [].concat( ( metadata && metadata.noteId ) ?? [] ).map( Number ).filter( ( id ) => id > 0 );
    }

    // A rich text with core's marker of a core note around a passage, outside the other formats there.
    function withMarker( value, id, start, end ) {
        const record = toRecord( value );
        const format = { type: NOTE, attributes: { 'data-id': String( id ) } };
        const formats = record.formats.slice();
        for ( let i = start; i < end; i++ ) {
            const stack = formats[ i ] || [];
            formats[ i ] = [ ...stack.filter( ( other ) => other.type === NOTE ), format, ...stack.filter( ( other ) => other.type !== NOTE ) ];
        }
        return toData( { ...record, formats } );
    }

    // A block's attributes that lose a core note's marker (every core note's, with no id), or null when it has none.
    function withoutMarkers( block, id ) {
        let changed = null;
        Object.entries( block.attributes ).forEach( ( [ key, value ] ) => {
            if ( ! ( value instanceof RichTextData ) || value.toHTMLString().indexOf( 'wp-note' ) === -1 ) {
                return;
            }
            const record = toRecord( value );
            const marks = ( format ) => format.type === NOTE && ( id === undefined || format.attributes[ 'data-id' ] === String( id ) );
            if ( ! record.formats.some( ( stack ) => stack && stack.some( marks ) ) ) {
                return;
            }
            const formats = record.formats.map( ( stack ) => stack && stack.filter( ( format ) => ! marks( format ) ) );
            changed = { ...changed, [ key ]: toData( { ...record, formats } ) };
        } );
        return changed;
    }

    // Core's icon for a note (`comment` of @wordpress/icons), as its own "Add note" has.
    const NOTE_ICON = el( 'svg', { viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24, 'aria-hidden': true, focusable: false },
        el( 'path', { d: 'M18 4H6c-1.1 0-2 .9-2 2v12.9c0 .6.5 1.1 1.1 1.1.3 0 .5-.1.8-.3L8.5 17H18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm.5 11c0 .3-.2.5-.5.5H7.9l-2.4 2.4V6c0-.3.2-.5.5-.5h12c.3 0 .5.2.5.5v9z' } ) );

    /*
     * Ask, in the formatting pill, for the selected block. The pill is the
     * block's toolbar, so the button is a fill of its controls. Review adds
     * it while it shows, and what it opens is Review's: `onAsk` takes the
     * block's clientId.
     */
    const withAsk = ( onAsk ) => wp.compose.createHigherOrderComponent( ( BlockEdit ) => ( props ) => el( Fragment, null,
        el( BlockEdit, props ),
        props.isSelected && el( wp.blockEditor.BlockControls, { group: 'other' },
            el( ToolbarButton, { className: 'wfw-ask-button', icon: NOTE_ICON, label: __( 'Ask', 'wordpress-for-writers' ), onClick: () => onAsk( props.clientId ) } ) )
    ), 'withAsk' );

    // ---- Marks ---------------------------------------------------------------

    /*
     * The Range of a passage in a rich text's element, counted as rich text
     * counts: a line break and an inline image are one character each, the
     * line break the editor pads an empty line with is none.
     */
    function rangeIn( element, start, end ) {
        const doc = element.ownerDocument;
        const walker = doc.createTreeWalker( element, 5 ); // NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
        const range = doc.createRange();
        let position = 0;
        let started = false;
        let node;
        while ( ( node = walker.nextNode() ) ) {
            const isText = node.nodeType === 3;
            if ( ! isText && ! node.matches( 'br:not([data-rich-text-padding]), img' ) ) {
                continue;
            }
            const length = isText ? node.data.length : 1;
            if ( ! started && start < position + length ) {
                if ( isText ) {
                    range.setStart( node, start - position );
                } else {
                    range.setStartBefore( node );
                }
                started = true;
            }
            if ( started && end <= position + length ) {
                if ( isText ) {
                    range.setEnd( node, end - position );
                } else {
                    range.setEndAfter( node );
                }
                return range;
            }
            position += length;
        }
        return null;
    }

    // The Range of a placed suggestion in the canvas: its passage, or its whole block.
    function rangeOf( doc, at ) {
        const element = doc.querySelector( '[data-block="' + at.block.clientId + '"]' );
        if ( ! element ) {
            return null;
        }
        if ( ! at.key ) {
            const range = doc.createRange();
            range.selectNodeContents( element );
            return range;
        }
        const selector = '[data-wp-block-attribute-key="' + at.key + '"]';
        const field = [ element, ...element.querySelectorAll( selector ) ].find( ( candidate ) => candidate.matches( selector ) && candidate.closest( '[data-block]' ) === element );
        return field ? rangeIn( field, at.start, at.end ) : null;
    }

    // ---- Cards -----------------------------------------------------------------

    const KINDS = {
        edit: () => __( 'Edit', 'wordpress-for-writers' ),
        comment: () => __( 'Comment', 'wordpress-for-writers' ),
        insert: () => __( 'New block', 'wordpress-for-writers' ),
        remove: () => __( 'Remove block', 'wordpress-for-writers' ),
        move: () => __( 'Move block', 'wordpress-for-writers' ),
        titles: () => __( 'Title', 'wordpress-for-writers' ),
        excerpt: () => __( 'Excerpt', 'wordpress-for-writers' ),
        tags: () => __( 'Tags', 'wordpress-for-writers' ),
        categories: () => __( 'Categories', 'wordpress-for-writers' ),
    };

    function kindOf( { kind, change } ) {
        return kind === 'blocks' ? change.op : kind === 'details' ? change.field : kind;
    }

    // Whether a suggestion has an Accept: a comment has Resolve, and titles are chosen from.
    function hasAccept( suggestion ) {
        return ! [ 'comment', 'titles' ].includes( kindOf( suggestion ) );
    }

    // A passage as a reference quotes it: on one line, and no longer than a reader needs to know it.
    function quoted( text ) {
        const line = text.replace( /\s+/g, ' ' ).trim();
        /* translators: %s: a passage of the note. */
        return sprintf( __( '“%s”', 'wordpress-for-writers' ), line.length > 160 ? line.slice( 0, 160 ).trimEnd() + '…' : line );
    }

    // What a suggestion proposes, in a line of plain text.
    function proposalText( suggestion ) {
        const { anchor, change } = suggestion;
        const kind = kindOf( suggestion );
        switch ( kind ) {
            case 'edit':
                return quoted( anchor.quote ) + ' → ' + ( change.replacement === '' ? __( '(removed)', 'wordpress-for-writers' ) : quoted( plainText( change.replacement ) ) );
            case 'comment':
                return quoted( anchor.quote ) + ' — ' + suggestion.reason;
            case 'insert':
                return KINDS[ kind ]() + ': ' + quoted( plainText( change.markup.replace( /<!--[\s\S]*?-->/g, '' ) ) );
            case 'remove':
            case 'move':
                return KINDS[ kind ]() + ': ' + quoted( anchor.quote );
            default:
                return KINDS[ kind ]() + ': ' + [].concat( change.value ).join( ', ' );
        }
    }

    /*
     * A reference to suggestions that the writer pastes to their agent, where
     * they say what they want of them (editor.md, Referring to a suggestion).
     * It names the note and each suggestion by its id, which is what the
     * abilities take, and quotes each so that the writer sees what they pasted.
     */
    function referenceTo( label, suggestions ) {
        const title = select( editorStore ).getEditedPostAttribute( 'title' );
        const note = title
            /* translators: 1: a note's id, 2: its title. */
            ? sprintf( __( 'note %1$d (“%2$s”)', 'wordpress-for-writers' ), agent.postId, title )
            /* translators: %d: a note's id. */
            : sprintf( __( 'note %d', 'wordpress-for-writers' ), agent.postId );
        if ( suggestions.length === 1 ) {
            /* translators: 1: a suggestion's id, 2: the note, as "note 214 (“Its title”)", 3: the label of a pass, such as Proofread. */
            return sprintf( __( 'About suggestion %1$d on %2$s, from the pass “%3$s”:', 'wordpress-for-writers' ), suggestions[ 0 ].id, note, label ) + '\n' + proposalText( suggestions[ 0 ] ) + '\n\n';
        }
        /* translators: 1: the label of a pass, such as Proofread, 2: the note, as "note 214 (“Its title”)". */
        return sprintf( __( 'About the pass “%1$s” on %2$s:', 'wordpress-for-writers' ), label, note ) + '\n' + suggestions.map( ( suggestion ) =>
            /* translators: 1: a suggestion's id, 2: what it proposes. */
            sprintf( __( 'Suggestion %1$d: %2$s', 'wordpress-for-writers' ), suggestion.id, proposalText( suggestion ) ) ).join( '\n' ) + '\n\n';
    }

    /*
     * The async clipboard needs a secure context, and a browser may still
     * refuse it to a frame, as the editor is in the app ("Write permission
     * denied"). Where it is missing or refuses, the text is copied the old
     * way, which asks no permission.
     */
    function writeClipboard( text ) {
        const legacy = () => {
            const field = document.createElement( 'textarea' );
            const focused = document.activeElement;
            field.value = text;
            field.setAttribute( 'readonly', '' );
            field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild( field );
            field.select();
            field.setSelectionRange( 0, text.length );
            const copied = document.execCommand( 'copy' );
            field.remove();
            if ( focused ) {
                focused.focus( { preventScroll: true } );
            }
            if ( ! copied ) {
                throw new Error( __( 'The reference couldn’t be copied.', 'wordpress-for-writers' ) );
            }
        };
        if ( window.isSecureContext && navigator.clipboard ) {
            return navigator.clipboard.writeText( text ).catch( legacy );
        }
        return new Promise( ( resolve ) => resolve( legacy() ) );
    }

    // The terms of a suggestion that accepting leaves out: those not on the site that the user may not make.
    function LeftOut( { field, names } ) {
        const [ missing, setMissing ] = useState( [] );
        useEffect( () => {
            if ( field === 'tags' && mayCreateTags() ) {
                return;
            }
            let gone = false;
            Promise.all( names.map( ( name ) => termId( field, name, false ) ) ).then( ( ids ) => gone || setMissing( names.filter( ( name, index ) => ! ids[ index ] ) ) );
            return () => {
                gone = true;
            };
        }, [] );
        return missing.length > 0 && el( 'p', { className: 'wfw-card__note' },
            /* translators: %s: a list of tag or category names. */
            sprintf( __( 'Not on this site, so left out: %s.', 'wordpress-for-writers' ), missing.join( ', ' ) ) );
    }

    // What a suggestion proposes, as text: nothing an agent wrote is ever set as HTML.
    function Proposal( { suggestion, isActive, locked, onAccept } ) {
        const { anchor, change } = suggestion;
        // Text that would come into the note (`ins`) or go from it (`del`).
        const changed = ( tag, text ) => el( 'p', { className: 'wfw-card__change' }, el( tag, null, text ) );
        switch ( kindOf( suggestion ) ) {
            case 'edit':
                return el( 'p', { className: 'wfw-card__change' },
                    el( 'del', null, anchor.quote ),
                    change.replacement !== '' && ' ',
                    change.replacement !== '' && el( 'ins', null, plainText( change.replacement ) ) );
            case 'comment':
                return el( 'p', { className: 'wfw-card__quote' }, anchor.quote );
            case 'insert':
                return changed( 'ins', plainText( change.markup.replace( /<!--[\s\S]*?-->/g, '' ) ) );
            case 'remove':
                return changed( 'del', anchor.quote );
            case 'move': {
                return el( Fragment, null,
                    el( 'p', { className: 'wfw-card__quote' }, anchor.quote ),
                    el( 'p', { className: 'wfw-card__note' }, change.after >= 0
                        /* translators: %s: the first words of a block. */
                        ? sprintf( __( 'To after “%s”', 'wordpress-for-writers' ), anchor.after.quote )
                        : __( 'To the start of the note.', 'wordpress-for-writers' ) ) );
            }
            case 'titles':
                return el( 'ul', { className: 'wfw-card__options' }, change.value.map( ( title, index ) => el( 'li', { key: index },
                    isActive
                        ? el( Button, { variant: 'secondary', disabled: locked, onClick: () => onAccept( title ) }, title )
                        : title ) ) );
            case 'excerpt':
                return changed( 'ins', change.value );
            default:
                return el( Fragment, null,
                    changed( 'ins', change.value.join( ', ' ) ),
                    el( LeftOut, { field: change.field, names: change.value } ) );
        }
    }

    /*
     * `card` is one of the cards Surface lists: { suggestion, key, at, stale,
     * canAccept, order }. Surface lists them again with every change of the
     * note, so a card is drawn again only when what it shows has changed;
     * `actions` is a ref to what Surface does for a card, the same ref each time.
     */
    const Card = wp.element.memo( function Card( { card, isActive, locked, actions } ) {
        const { suggestion, stale, canAccept } = card;
        const kind = kindOf( suggestion );
        const onAccept = ( title ) => actions.current.accept( suggestion, title );
        const onDismiss = () => actions.current.dismiss( suggestion );
        return el( 'div', {
            className: 'wfw-card' + ( isActive ? ' is-active' : '' ),
            'data-wfw-suggestion': suggestion.id,
            'data-wfw-state': stale ? 'stale' : isActive ? 'active' : 'open',
            role: 'group',
            'aria-label': KINDS[ kind ](),
            tabIndex: 0,
            onClick: () => actions.current.reveal( card.key ),
            onFocus: ( event ) => event.target === event.currentTarget && actions.current.focus( card.key ),
            onKeyDown: ( event ) => {
                if ( event.target !== event.currentTarget ) {
                    return;
                }
                if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
                    actions.current.move( event.key === 'ArrowDown' ? 1 : -1 );
                } else if ( locked ) {
                    return;
                } else if ( event.key === 'Enter' && canAccept ) {
                    onAccept();
                } else if ( event.key === 'Backspace' || event.key === 'Delete' ) {
                    onDismiss();
                } else {
                    return;
                }
                event.preventDefault();
            },
        },
        el( 'span', { className: 'wfw-card__kind' }, KINDS[ kind ]() ),
        stale
            ? el( 'p', { className: 'wfw-card__note' }, __( 'The text has changed since this was suggested.', 'wordpress-for-writers' ) )
            : el( Proposal, { suggestion, isActive, locked, onAccept } ),
        suggestion.reason && el( 'p', { className: 'wfw-card__reason' }, suggestion.reason ),
        isActive && el( 'div', { className: 'wfw-card__actions' },
            canAccept && el( Button, { variant: 'primary', size: 'compact', disabled: locked, onClick: () => onAccept() }, __( 'Accept', 'wordpress-for-writers' ) ),
            el( Button, { variant: 'tertiary', size: 'compact', disabled: locked, onClick: onDismiss },
                kind === 'comment' && ! stale ? __( 'Resolve', 'wordpress-for-writers' ) : kind === 'titles' && ! stale ? __( 'Keep mine', 'wordpress-for-writers' ) : __( 'Dismiss', 'wordpress-for-writers' ) ),
            el( Button, { className: 'wfw-card__refer', icon: 'admin-page', size: 'compact', label: __( 'Copy a reference for your agent', 'wordpress-for-writers' ), onClick: () => actions.current.refer( suggestion.label, [ suggestion ] ) } )
        ) );
    }, ( was, now ) => was.card.suggestion === now.card.suggestion && was.card.stale === now.card.stale && was.card.canAccept === now.card.canAccept && was.isActive === now.isActive && was.locked === now.locked && was.actions === now.actions );

    // The cards of a pass under its header: the label, who (an agent, never which), when, and what to do with all of them.
    function Pass( { pass, locked, onAcceptAll, onPeek, onRefer, children } ) {
        return el( 'section', { className: 'wfw-pass' },
            el( 'header', { className: 'wfw-pass__header' },
                el( 'strong', null, pass.label ),
                el( 'span', { className: 'wfw-pass__meta' },
                    __( 'Agent', 'wordpress-for-writers' ), ' · ', el( 'time', { dateTime: pass.date + 'Z' }, wp.date.humanTimeDiff( pass.date + 'Z' ) ) ),
                el( 'span', { className: 'wfw-pass__actions' },
                    el( Button, { variant: 'link', disabled: locked || ! pass.cards.some( ( card ) => card.canAccept ), onClick: onAcceptAll }, __( 'Accept all', 'wordpress-for-writers' ) ),
                    el( Button, { variant: 'link', onClick: onPeek }, __( 'Peek', 'wordpress-for-writers' ) ),
                    el( Button, { variant: 'link', className: 'wfw-pass__refer', label: __( 'Copy a reference to these suggestions for your agent', 'wordpress-for-writers' ), showTooltip: true, onClick: onRefer }, __( 'Copy', 'wordpress-for-writers' ) ) )
            ),
            children );
    }

    // An ask: the question, what was answered, and Resolve. The suggestions that answer it are cards under it.
    function AskCard( { ask, replies, mine, isActive, locked, onActivate, onFocus, onResolve, onMove, children } ) {
        return el( 'div', {
            className: 'wfw-ask' + ( isActive ? ' is-active' : '' ),
            'data-wfw-ask': ask.id,
            role: 'group',
            tabIndex: 0,
            onClick: ( event ) => event.target.closest( '.wfw-card' ) || onActivate(),
            onFocus: ( event ) => event.target === event.currentTarget && onFocus(),
            onKeyDown: ( event ) => {
                if ( event.target === event.currentTarget && ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) ) {
                    event.preventDefault();
                    onMove( event.key === 'ArrowDown' ? 1 : -1 );
                }
            },
        },
        el( 'span', { className: 'wfw-card__kind' }, mine
            ? __( 'You asked', 'wordpress-for-writers' )
            /* translators: %s: a user's name. */
            : sprintf( __( '%s asked', 'wordpress-for-writers' ), ask.author_name ) ),
        el( 'p', { className: 'wfw-ask__text' }, ask.content.raw ),
        replies.map( ( reply ) => el( 'div', { key: reply.id, className: 'wfw-ask__reply' },
            el( 'strong', null, reply.author_name ),
            el( 'p', { className: 'wfw-ask__text' }, reply.content.raw ) ) ),
        children,
        el( 'div', { className: 'wfw-card__actions' },
            el( Button, { variant: 'tertiary', size: 'compact', disabled: locked, onClick: onResolve }, __( 'Resolve', 'wordpress-for-writers' ) ) ) );
    }

    /*
     * The field Ask opens at what is asked about, in core's popover: it is
     * placed and kept in the window, takes the focus and gives it back, and
     * closes on Escape or when the focus leaves it. Enter sends.
     */
    function AskField( { target, onSend, onClose } ) {
        const [ text, setText ] = useState( '' );
        const [ sending, setSending ] = useState( false );
        const send = ( event ) => {
            event.preventDefault();
            if ( text.trim() && ! sending ) {
                setSending( true );
                onSend( text.trim() ).catch( () => setSending( false ) );
            }
        };
        return el( Popover, { className: 'wfw-ask-popover', anchor: target.anchor, placement: 'bottom-start', offset: 8, focusOnMount: 'firstElement', onClose },
            el( 'form', { className: 'wfw-ask-field', onSubmit: send },
                el( 'textarea', {
                    rows: 3,
                    maxLength: 600,
                    value: text,
                    'aria-label': __( 'Your question', 'wordpress-for-writers' ),
                    placeholder: target.key ? __( 'Ask about this passage', 'wordpress-for-writers' ) : __( 'Ask about this block', 'wordpress-for-writers' ),
                    onChange: ( event ) => setText( event.target.value ),
                    onKeyDown: ( event ) => {
                        if ( event.key === 'Enter' && ! event.shiftKey && ! event.nativeEvent.isComposing ) {
                            send( event );
                        }
                    },
                } ),
                el( Button, { variant: 'primary', size: 'compact', type: 'submit', disabled: ! text.trim() || sending }, __( 'Leave for an agent', 'wordpress-for-writers' ) ) ) );
    }

    // ---- Review ------------------------------------------------------------------

    // The store's errors start with their code, for agents ("not_found: …"); the writer is shown the rest.
    function fail( error ) {
        const message = String( error.message || '' );
        const code = error.code ? error.code + ': ' : '';
        dispatch( noticesStore ).createErrorNotice( code && message.startsWith( code ) ? message.slice( code.length ) : message, { type: 'snackbar', id: SNACKBAR } );
    }

    function say( text, onUndo ) {
        dispatch( noticesStore ).createSuccessNotice( text, {
            type: 'snackbar',
            id: SNACKBAR,
            actions: [ { label: __( 'Undo', 'wordpress-for-writers' ), onClick: onUndo } ],
        } );
    }

    // Whether the note has these values now. Blocks are the same when they are the very same array, as Undo puts back.
    function noteHas( values ) {
        return Object.keys( values ).every( ( key ) => {
            const now = select( editorStore ).getEditedPostAttribute( key );
            return key === 'blocks' ? now === values[ key ] : JSON.stringify( now ) === JSON.stringify( values[ key ] );
        } );
    }

    function Surface() {
        const blocks = useSelect( ( s ) => s( blockEditorStore ).getBlocks(), [] );
        const locked = useSelect( ( s ) => s( editorStore ).isPostLocked(), [] );
        const user = useSelect( ( s ) => s( 'core' ).getCurrentUser(), [] );
        const wide = useMedia( WIDE );
        const [ suggestions, setSuggestions ] = useState( null );
        const [ notes, setNotes ] = useState( [] );
        const [ askIds, setAskIds ] = useState( [] );
        const [ active, setActive ] = useState( null );
        const [ shown, setShown ] = useState( wide );
        const [ asking, setAsking ] = useState( null );

        // ---- What the server holds ---------------------------------------------

        const clock = useRef( clockOf( agent.config ) );
        const known = useRef( new Set() );
        const asked = useRef( 0 );
        const writes = useRef( 0 );
        const latest = useRef( null );

        // What the server last said, as JSON: most answers say it again, and then nothing is set.
        const said = useRef( {} );

        function take( name, value, set ) {
            const json = JSON.stringify( value );
            if ( said.current[ name ] !== json ) {
                said.current[ name ] = json;
                set( value );
            }
        }

        /*
         * Asks for the note's suggestions, and for its core notes too when
         * asked to or when a suggestion is new (it may answer an ask). An
         * answer that a later request or a status on its way to the server
         * has overtaken is dropped.
         */
        async function refresh( everything ) {
            const mine = ++asked.current;
            const answer = await apiFetch( { path: SUGGESTIONS } );
            const threads = everything || answer.suggestions.some( ( suggestion ) => ! known.current.has( suggestion.id ) ) ? await coreNotes() : null;
            if ( mine !== asked.current || writes.current ) {
                return;
            }
            known.current = new Set( answer.suggestions.map( ( suggestion ) => suggestion.id ) );
            clock.current = clockOf( answer );
            if ( threads ) {
                take( 'notes', threads, setNotes );
            }
            take( 'asks', answer.asks, setAskIds );
            take( 'suggestions', answer.suggestions, setSuggestions );
        }

        // A suggestion's statuses reach the server in the order they were set: an accept and its undo may be a moment apart.
        const sending = useRef( new Map() );

        function setStatus( id, status ) {
            writes.current++;
            // Changed here before the server knows: its next answer is taken, whatever it says.
            delete said.current.suggestions;
            setSuggestions( ( list ) => list.map( ( suggestion ) => ( suggestion.id === id ? { ...suggestion, status } : suggestion ) ) );
            const sent = ( sending.current.get( id ) || Promise.resolve() ).then( () => apiFetch( { path: '/wfw/v1/suggestions/' + id, method: 'POST', data: { status } } ).catch( fail ) );
            sending.current.set( id, sent );
            sent.then( () => {
                if ( ! --writes.current ) {
                    refresh().catch( () => {} );
                }
            } );
        }

        /*
         * What a site pays (surface.md): while the editor is in view and a way
         * in was used in the last ten minutes, the suggestions are asked for
         * every five seconds. Outside that, the Heartbeat the editor already
         * runs carries the count and the newest id, and they are asked for
         * when either has changed.
         */
        useEffect( () => {
            const polling = () => ! agent.hidden() && ! document.hidden && clock.current.seen > 0 && Date.now() / 1000 + clock.current.skew - clock.current.seen < FRESH;
            // One poll at a time: a slow answer is waited for, not asked for again.
            let waiting = false;
            const timer = setInterval( () => {
                if ( ! waiting && polling() ) {
                    waiting = true;
                    refresh().catch( () => {} ).finally( () => {
                        waiting = false;
                    } );
                }
            }, POLL );
            wp.hooks.addAction( 'heartbeat.send', 'wfw/suggestions', ( data ) => {
                if ( ! polling() ) {
                    data[ 'wfw-suggestions' ] = { note: agent.postId };
                }
            } );
            wp.hooks.addAction( 'heartbeat.tick', 'wfw/suggestions', ( response ) => {
                const told = response[ 'wfw-suggestions' ];
                if ( ! told ) {
                    return;
                }
                clock.current = clockOf( told );
                if ( told.open !== view.current.cards.length || ( latest.current !== null && told.latest !== latest.current ) ) {
                    refresh( true ).catch( () => {} );
                }
                latest.current = told.latest;
            } );
            refresh( true ).catch( fail );
            return () => {
                clearInterval( timer );
                wp.hooks.removeAction( 'heartbeat.send', 'wfw/suggestions' );
                wp.hooks.removeAction( 'heartbeat.tick', 'wfw/suggestions' );
            };
        }, [] );

        // ---- What is shown ---------------------------------------------------------

        const open = useMemo( () => ( suggestions || [] ).filter( ( suggestion ) => suggestion.status === 'open' ), [ suggestions ] );

        // The app's list shows the count (W5): told once the suggestions are here, then when it changes.
        useEffect( () => {
            if ( suggestions ) {
                agent.post( { type: 'suggestions', count: open.length } );
            }
        }, [ ! suggestions, open.length ] );

        /*
         * The cards, in the order of their passages: the passes that answer
         * no ask and the asks, each ask with the passes that answer it.
         * Details and the suggestions out of date come last in their pass.
         * A card is { suggestion, key, at (its place in the note, or null),
         * stale, canAccept, order }; `cards` is every card, in the order of
         * `open`, and `keys` the keys of the cards and the asks as listed.
         */
        const { sections, cards, keys } = useMemo( () => {
            const list = listBlocks( blocks );
            const made = new Map();
            const order = ( a, b ) => a.order[ 0 ] - b.order[ 0 ] || a.order[ 1 ] - b.order[ 1 ];
            const passes = ( ofPass ) => {
                const byPass = new Map();
                ofPass.forEach( ( suggestion ) => {
                    const at = suggestion.anchor ? place( list, suggestion ) : null;
                    const stale = !! suggestion.anchor && ! at;
                    const card = {
                        suggestion,
                        key: cardKey( suggestion.id ),
                        at,
                        stale,
                        canAccept: ! stale && hasAccept( suggestion ),
                        order: stale ? [ Infinity, 1 ] : suggestion.kind === 'details' ? [ Infinity, 0 ] : at ? [ at.order, at.offset || 0 ] : [ -1, 0 ],
                    };
                    made.set( suggestion.id, card );
                    if ( ! byPass.has( suggestion.pass ) ) {
                        byPass.set( suggestion.pass, { id: suggestion.pass, label: suggestion.label, date: suggestion.date, cards: [] } );
                    }
                    byPass.get( suggestion.pass ).cards.push( card );
                } );
                return [ ...byPass.values() ].map( ( pass ) => ( { ...pass, cards: pass.cards.sort( order ), order: pass.cards[ 0 ].order } ) ).sort( order );
            };

            // The server says which core notes are open asks; one resolved here is no longer on hold.
            const asks = notes.filter( ( note ) => askIds.includes( note.id ) && note.status === 'hold' );
            const all = [
                ...passes( open.filter( ( suggestion ) => ! asks.some( ( ask ) => ask.id === suggestion.ask ) ) ).map( ( pass ) => ( { pass, order: pass.order } ) ),
                ...asks.map( ( ask ) => {
                    const index = list.findIndex( ( { block } ) => noteIds( block.attributes.metadata ).includes( ask.id ) );
                    return {
                        ask,
                        key: askKey( ask.id ),
                        // A thread is shown without the empty children that record a resolve or a reopen.
                        replies: notes.filter( ( note ) => note.parent === ask.id && ! ( note.meta && note.meta._wp_note_status ) && ! open.some( ( suggestion ) => suggestion.id === note.id ) ).sort( ( a, b ) => a.id - b.id ),
                        passes: passes( open.filter( ( suggestion ) => suggestion.ask === ask.id ) ),
                        order: [ index === -1 ? Infinity : index, -1 ],
                    };
                } ),
            ].sort( order );
            const cardKeys = ( pass ) => pass.cards.map( ( card ) => card.key );
            return {
                sections: all,
                cards: open.map( ( suggestion ) => made.get( suggestion.id ) ),
                keys: all.flatMap( ( section ) => ( section.pass ? cardKeys( section.pass ) : [ section.key, ...section.passes.flatMap( cardKeys ) ] ) ),
            };
        }, [ blocks, suggestions, notes, askIds ] );

        /*
         * When the active card goes (accepted, dismissed, resolved), the one
         * that took its place is active. The keyboard stays on the cards.
         */
        const lastKeys = useRef( [] );
        const refocus = useRef( false );
        useEffect( () => {
            if ( active && ! keys.includes( active ) ) {
                setActive( keys[ Math.min( lastKeys.current.indexOf( active ), keys.length - 1 ) ] || null );
            }
            lastKeys.current = keys;
        }, [ keys.join() ] );

        useEffect( () => {
            const card = document.querySelector( '.wfw-review .is-active' );
            if ( ! card ) {
                return;
            }
            card.scrollIntoView( { block: 'nearest' } );
            if ( refocus.current ) {
                refocus.current = false;
                card.focus();
            }
        }, [ active, shown ] );

        // ---- Marks over the canvas (W1) ----------------------------------------------

        /*
         * Ranges do not outlive an edit of their block, so none is kept: the
         * marks are drawn again from the cards above after every render and
         * every change in the canvas, once a frame. The registry and the
         * rules belong to the canvas's own window and document.
         */
        const view = useRef();
        view.current = { cards, active };
        const ranges = useRef( new Map() );
        const marks = useRef( null );
        const frame = useRef( 0 );

        // The canvas's three highlights, made and registered once for its window; each frame fills them again.
        function highlightsOf( win ) {
            if ( ! marks.current || marks.current.win !== win ) {
                marks.current = { win };
                HIGHLIGHTS.forEach( ( name, priority ) => {
                    marks.current[ name ] = new win.Highlight();
                    marks.current[ name ].priority = priority;
                    win.CSS.highlights.set( name, marks.current[ name ] );
                } );
            }
            return marks.current;
        }

        function draw() {
            frame.current = 0;
            const { doc, win } = agent.canvas;
            if ( ! doc || ! win.Highlight ) {
                return;
            }
            const drawn = highlightsOf( win );
            HIGHLIGHTS.forEach( ( name ) => drawn[ name ].clear() );
            ranges.current = new Map();
            view.current.cards.forEach( ( { suggestion, key, at } ) => {
                const range = at && kindOf( suggestion ) !== 'insert' && rangeOf( doc, at );
                if ( ! range ) {
                    return;
                }
                ranges.current.set( key, range );
                drawn[ suggestion.kind === 'edit' ? 'wfw-edit' : 'wfw-passage' ].add( range );
                if ( view.current.active === key ) {
                    drawn[ 'wfw-active' ].add( range );
                }
            } );
            doc.documentElement.dataset.wfwMarks = ranges.current.size;
        }

        function schedule() {
            if ( ! frame.current ) {
                frame.current = requestAnimationFrame( draw );
            }
        }

        useEffect( schedule );

        function activate( key ) {
            setActive( key );
            setShown( true );
        }

        useEffect( () => {
            let observer = null;
            let listeners = null;
            const leave = () => {
                if ( observer ) {
                    observer.disconnect();
                    listeners.abort();
                    observer = null;
                }
            };
            const stopListening = agent.onCanvas( ( doc ) => {
                leave();
                if ( ! doc ) {
                    return;
                }
                const style = doc.createElement( 'link' );
                style.rel = 'stylesheet';
                style.id = 'wfw-suggest-css';
                style.href = agent.config.style;
                doc.head.appendChild( style );

                listeners = new AbortController();
                // A click on a marked passage, or on an ask's marker. Tested against the passage's own boxes: it may wrap.
                doc.addEventListener( 'click', ( event ) => {
                    const hit = [ ...ranges.current ].find( ( [ , range ] ) => [ ...range.getClientRects() ].some( ( box ) => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom ) );
                    const marker = ! hit && event.target.closest && event.target.closest( 'mark.wp-note' );
                    if ( hit ) {
                        activate( hit[ 0 ] );
                    } else if ( marker ) {
                        activate( askKey( marker.dataset.id ) );
                    }
                }, { signal: listeners.signal } );
                // The caret in a marked passage.
                doc.addEventListener( 'selectionchange', () => {
                    const selection = doc.getSelection();
                    if ( ! selection.rangeCount || ! selection.isCollapsed ) {
                        return;
                    }
                    const hit = [ ...ranges.current ].find( ( [ , range ] ) => range.isPointInRange( selection.focusNode, selection.focusOffset ) );
                    if ( hit ) {
                        setActive( hit[ 0 ] );
                    }
                }, { signal: listeners.signal } );
                observer = new MutationObserver( schedule );
                observer.observe( doc.body, { childList: true, subtree: true, characterData: true } );
                schedule();
            } );
            return () => {
                stopListening();
                leave();
                cancelAnimationFrame( frame.current );
                const { doc, win } = agent.canvas;
                marks.current = null;
                if ( doc && win.Highlight ) {
                    HIGHLIGHTS.forEach( ( name ) => win.CSS.highlights.delete( name ) );
                    delete doc.documentElement.dataset.wfwMarks;
                    doc.getElementById( 'wfw-suggest-css' ).remove();
                }
            };
        }, [] );

        // A card was pressed: its passage comes into view, or for an ask's card (`askId`) the ask's marker.
        function reveal( key, askId ) {
            const { doc, win } = agent.canvas;
            const shownAt = askId ? doc.querySelector( 'mark.wp-note[data-id="' + askId + '"]' ) : ranges.current.get( key );
            const box = shownAt && shownAt.getBoundingClientRect();
            if ( box && ( box.top < 0 || box.bottom > win.innerHeight ) ) {
                win.scrollBy( 0, box.top - win.innerHeight / 3 );
            }
            activate( key );
        }

        function move( by ) {
            const next = keys[ keys.indexOf( active ) + by ];
            if ( next ) {
                refocus.current = true;
                setActive( next );
            }
        }

        // ---- Accepting, dismissing and taking either back ------------------------------

        /*
         * Each accept made here, with what the note held before and after it.
         * Undo, the snackbar's or the editor's own, puts back what was before:
         * the suggestions are open again. Redo accepts them again.
         */
        const accepts = useRef( [] );
        useEffect( () => subscribe( () => {
            accepts.current.forEach( ( accept ) => {
                if ( noteHas( accept.undone ? accept.after : accept.before ) ) {
                    accept.undone = ! accept.undone;
                    accept.ids.forEach( ( id ) => setStatus( id, accept.undone ? 'open' : 'accepted' ) );
                }
            } );
        } ), [] );

        /*
         * Accepts suggestions as one edit of the note, so one step of undo
         * (editor.md, Accepting). Those gone out of date on the way (two edits
         * of one passage) are left open. `title` is the one chosen, for a
         * suggestion of titles. Resolves to how many were accepted.
         */
        async function accept( list, title ) {
            const terms = new Map();
            for ( const { id, change } of list.filter( ( suggestion ) => [ 'tags', 'categories' ].includes( kindOf( suggestion ) ) ) ) {
                const make = change.field === 'tags' && mayCreateTags();
                terms.set( id, ( await Promise.all( change.value.map( ( name ) => termId( change.field, name, make ) ) ) ).filter( Boolean ) );
            }

            const edited = ( key ) => select( editorStore ).getEditedPostAttribute( key );
            const before = select( blockEditorStore ).getBlocks();
            const after = {};
            // Every suggestion is placed in the note as it is, so that accepting one does not put its neighbour out of date.
            const ofBlocks = list.filter( ( suggestion ) => suggestion.kind !== 'details' );
            const places = listBlocks( before );
            const plans = ofBlocks.map( ( suggestion ) => planned( places, suggestion ) );
            const { blocks: next, done: taken } = carriedOut( before, plans );
            const done = taken.map( ( suggestion ) => suggestion.id );
            // An insert none of whose blocks the editor takes: it stays open, and the writer is told.
            const refused = plans.some( ( plan ) => plan && plan.refused );
            list.filter( ( suggestion ) => suggestion.kind === 'details' ).forEach( ( suggestion ) => {
                const { field, value } = suggestion.change;
                if ( field === 'titles' ) {
                    after.title = title;
                } else if ( field === 'excerpt' ) {
                    after.excerpt = value;
                } else {
                    after[ field ] = [ ...new Set( [ ...( after[ field ] || edited( field ) || [] ), ...terms.get( suggestion.id ) ] ) ];
                }
                done.push( suggestion.id );
            } );
            if ( next !== before ) {
                after.blocks = next;
            }
            Object.keys( after ).forEach( ( key ) => noteHas( { [ key ]: after[ key ] } ) && delete after[ key ] );
            if ( Object.keys( after ).length ) {
                const was = Object.fromEntries( Object.keys( after ).map( ( key ) => [ key, edited( key ) ] ) );
                // The text too, as the editor's own edits of blocks carry it: blocks alone do not make the note unsaved.
                dispatch( editorStore ).editPost( after.blocks ? { ...after, content: wp.blocks.serialize( after.blocks ) } : after );
                accepts.current.push( { ids: done, before: was, after, undone: false } );
            }
            done.forEach( ( id ) => setStatus( id, 'accepted' ) );
            if ( refused && ! done.length ) {
                throw new Error( __( 'This editor cannot add the blocks suggested.', 'wordpress-for-writers' ) );
            }
            return done.length;
        }

        function acceptOne( suggestion, title ) {
            refocus.current = document.activeElement.matches( '.wfw-card' );
            accept( [ suggestion ], title ).then( ( count ) => count && say( __( 'Accepted.', 'wordpress-for-writers' ), undo ) ).catch( fail );
        }

        function acceptAll( pass ) {
            accept( pass.cards.filter( ( card ) => card.canAccept ).map( ( card ) => card.suggestion ) ).then( ( count ) => count && say(
                /* translators: %d: number of suggestions. */
                sprintf( _n( 'Accepted %d suggestion.', 'Accepted %d suggestions.', count, 'wordpress-for-writers' ), count ),
                undo
            ) ).catch( fail );
        }

        function dismiss( { id } ) {
            refocus.current = document.activeElement.matches( '.wfw-card' );
            setStatus( id, 'dismissed' );
            say( __( 'Dismissed.', 'wordpress-for-writers' ), () => setStatus( id, 'open' ) );
        }

        /*
         * Peek with a pass applied: the note as it would read with every
         * suggestion of the pass accepted, handed to the app, which shows it
         * as any peek. Core's markers of asks are not part of how it reads.
         */
        function peek( pass ) {
            const blocks = select( blockEditorStore ).getBlocks();
            const places = listBlocks( blocks );
            const { blocks: next } = carriedOut( blocks, pass.cards.filter( ( { suggestion } ) => [ 'edit', 'blocks' ].includes( suggestion.kind ) ).map( ( { suggestion } ) => planned( places, suggestion ) ) );
            agent.post( {
                type: 'peek-pass',
                title: select( editorStore ).getEditedPostAttribute( 'title' ) || '',
                content: wp.blocks.serialize( mapBlocks( next, ( block ) => withoutMarkers( block ) ) ),
                label: pass.label,
            } );
        }

        /*
         * Nothing reaches an agent from here: the writer carries it. A
         * reference to the suggestions goes to the clipboard, and the writer
         * pastes it where they talk to their agent and says what they want.
         */
        function refer( label, list ) {
            writeClipboard( referenceTo( label, list ) ).then( () => dispatch( noticesStore ).createSuccessNotice(
                __( 'Copied. Paste it to your agent and say what to change.', 'wordpress-for-writers' ),
                { type: 'snackbar', id: SNACKBAR }
            ) ).catch( fail );
        }

        // ---- Asks ------------------------------------------------------------------

        /*
         * Ask is about the selected text of one rich text, or, with only a
         * caret, about the whole block. The field opens at what is asked about.
         * The button is in the blocks' toolbars while Review shows.
         */
        useEffect( () => {
            const startAsk = ( clientId ) => {
                const store = select( blockEditorStore );
                const from = store.getSelectionStart();
                const to = store.getSelectionEnd();
                const inline = from.clientId === clientId && to.clientId === clientId && !! from.attributeKey && from.offset !== undefined && to.offset !== undefined && from.offset !== to.offset;
                const { doc, win } = agent.canvas;
                setAsking( {
                    clientId,
                    key: inline ? from.attributeKey : null,
                    start: Math.min( from.offset, to.offset ),
                    end: Math.max( from.offset, to.offset ),
                    // The selected text as it is now, or the block: the popover finds either in the canvas.
                    anchor: inline ? win.getSelection().getRangeAt( 0 ).cloneRange() : doc.querySelector( '[data-block="' + clientId + '"]' ),
                } );
            };
            wp.hooks.addFilter( 'editor.BlockEdit', 'wfw/ask', withAsk( startAsk ) );
            return () => wp.hooks.removeFilter( 'editor.BlockEdit', 'wfw/ask' );
        }, [] );

        /*
         * Makes a core note as core's editor does: the comment through core's
         * route, open; its id in the block's metadata.noteId; and, on a
         * selection, core's marker around it. The marker and the attribute are
         * an edit of the note, saved with it.
         */
        async function sendAsk( text ) {
            const note = await apiFetch( { path: '/wp/v2/comments', method: 'POST', data: { post: agent.postId, content: text, status: 'hold', type: 'note', parent: 0 } } ).catch( ( error ) => {
                fail( error );
                throw error;
            } );
            const attributes = select( blockEditorStore ).getBlockAttributes( asking.clientId );
            const next = { metadata: { ...attributes.metadata, noteId: [ ...new Set( [ ...noteIds( attributes.metadata ), note.id ] ) ] } };
            if ( asking.key && attributes[ asking.key ] instanceof RichTextData ) {
                next[ asking.key ] = withMarker( attributes[ asking.key ], note.id, asking.start, asking.end );
            }
            dispatch( blockEditorStore ).updateBlockAttributes( asking.clientId, next );
            setAsking( null );
            await refresh( true );
            activate( askKey( note.id ) );
        }

        /*
         * Resolves an ask as core does: its status, an empty child that
         * records it, and the marker out of the note (the id stays in
         * metadata.noteId). The suggestions still open under it are dismissed.
         */
        async function resolve( { ask, passes } ) {
            await apiFetch( { path: '/wp/v2/comments/' + ask.id, method: 'PUT', data: { status: 'approved' } } );
            await apiFetch( { path: '/wp/v2/comments', method: 'POST', data: { post: agent.postId, content: '', type: 'note', status: 'approved', parent: ask.id, meta: { _wp_note_status: 'resolved' } } } );
            const store = select( blockEditorStore );
            store.getClientIdsWithDescendants().forEach( ( clientId ) => {
                const without = withoutMarkers( store.getBlock( clientId ), ask.id );
                if ( without ) {
                    dispatch( blockEditorStore ).updateBlockAttributes( clientId, without );
                }
            } );
            passes.forEach( ( pass ) => pass.cards.forEach( ( card ) => setStatus( card.suggestion.id, 'dismissed' ) ) );
            delete said.current.notes;
            setNotes( ( list ) => list.map( ( note ) => ( note.id === ask.id ? { ...note, status: 'approved' } : note ) ) );
        }

        // ---- The chip, the rail or the sheet, and the field --------------------------

        // What a card asks of Surface, as it is in this render.
        const actions = useRef();
        actions.current = { reveal, focus: setActive, accept: acceptOne, dismiss, move, refer };

        const renderPass = ( pass ) => el( Pass, { key: pass.id, pass, locked, onAcceptAll: () => acceptAll( pass ), onPeek: () => peek( pass ), onRefer: () => refer( pass.label, pass.cards.map( ( card ) => card.suggestion ) ) },
            pass.cards.map( ( card ) => el( Card, { key: card.key, card, locked, isActive: active === card.key, actions } ) ) );
        const at = keys.indexOf( active );

        return el( Fragment, null,
            open.length > 0 && el( Fill, { name: 'wfw-agent-actions' }, el( 'button', {
                type: 'button',
                className: 'wfw-chip',
                'data-wfw-suggestions': open.length,
                'aria-expanded': shown,
                onClick: () => {
                    setShown( ! shown );
                    setActive( active || keys[ 0 ] );
                },
            },
            /* translators: %d: number of suggestions. */
            sprintf( _n( '%d suggestion', '%d suggestions', open.length, 'wordpress-for-writers' ), open.length ) ) ),
            shown && sections.length > 0 && el( 'aside', { className: 'wfw-review wfw-review--' + ( wide ? 'rail' : 'sheet' ), 'aria-label': __( 'Suggestions', 'wordpress-for-writers' ) },
                el( 'header', { className: 'wfw-sheet__header wfw-review__header' },
                    wide
                        ? el( 'h2', null, __( 'Suggestions', 'wordpress-for-writers' ) )
                        : el( Fragment, null,
                            el( Button, { icon: 'arrow-left-alt2', size: 'compact', label: __( 'Previous', 'wordpress-for-writers' ), disabled: at < 1, onClick: () => setActive( keys[ at - 1 ] ) } ),
                            el( 'span', { className: 'wfw-review__count' },
                                /* translators: 1: the card's place, 2: how many cards. */
                                sprintf( __( '%1$d of %2$d', 'wordpress-for-writers' ), at + 1, keys.length ) ),
                            el( Button, { icon: 'arrow-right-alt2', size: 'compact', label: __( 'Next', 'wordpress-for-writers' ), disabled: at === keys.length - 1, onClick: () => setActive( keys[ at + 1 ] ) } ) ),
                    el( Button, { className: 'wfw-review__close', icon: 'no-alt', size: 'compact', label: __( 'Close suggestions', 'wordpress-for-writers' ), onClick: () => setShown( false ) } )
                ),
                el( 'div', { className: 'wfw-review__list' }, sections.map( ( section ) => ( section.pass
                    ? renderPass( section.pass )
                    : el( AskCard, {
                        key: section.key,
                        ask: section.ask,
                        replies: section.replies,
                        mine: !! user && user.id === section.ask.author,
                        locked,
                        isActive: active === section.key,
                        onActivate: () => reveal( section.key, section.ask.id ),
                        onFocus: () => setActive( section.key ),
                        onResolve: () => resolve( section ).catch( fail ),
                        onMove: move,
                    }, section.passes.map( renderPass ) ) ) ) )
            ),
            asking && el( AskField, { target: asking, onSend: sendAsk, onClose: () => setAsking( null ) } )
        );
    }

    agent.start( Surface );
} )();
