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
    const { Button, Fill, ToolbarButton } = wp.components;
    const { decodeEntities } = wp.htmlEntities;
    const apiFetch = wp.apiFetch;
    const editorStore = wp.editor.store;
    const blockEditorStore = wp.blockEditor.store;
    const noticesStore = 'core/notices';

    const NOTE = 'core/note';
    const SNACKBAR = 'wfw-agent';
    const HIGHLIGHTS = [ 'wfw-passage', 'wfw-edit', 'wfw-active' ];
    // The app's phone layout, as the stub reads it (agent.phone): nothing of the surface shows there.
    const PHONE = agent.phone;
    // A pane this wide has the rail beside the note; a narrower one has the sheet.
    const WIDE = window.matchMedia( '(min-width: 900px)' );
    const POLL = 5000;
    const FRESH = 600;
    const SUGGESTIONS = '/wfw/v1/notes/' + agent.postId + '/suggestions';
    const NOTES = '/wp/v2/comments?context=edit&type=note&status=all&per_page=100&post=' + agent.postId;

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
     * is a newline, the other tags go and entities are decoded.
     */
    const NOT_INLINE = /<(?!\/?(?:a|abbr|b|bdi|bdo|br|code|del|dfn|em|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var)\b)[^>]*>/gi;

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

    // Every block of the note, depth-first, each with its path (surface.md, Reading a note).
    function listBlocks( blocks, prefix = [] ) {
        return named( blocks ).flatMap( ( block, index ) => {
            const path = [ ...prefix, index ];
            return [ { block, path }, ...listBlocks( block.innerBlocks, path ) ];
        } );
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
                const record = create( { html: value.toHTMLString() } );
                const at = record.text ? text.indexOf( record.text.replace( /￼/g, '\n' ) ) : -1;
                return at === -1 ? [] : [ { key, record, at } ];
            } ) );
        }
        return fields.get( block );
    }

    // ---- Placing -------------------------------------------------------------

    // A character is a Unicode code point, as in the store.
    function firstPoints( text, count ) {
        return Array.from( text ).slice( 0, count ).join( '' );
    }

    function lastPoints( text, count ) {
        return Array.from( text ).slice( -count ).join( '' );
    }

    // Where the anchor's quote is in a text, with the same 32 characters around it or alone.
    function quoteStarts( text, anchor, withContext ) {
        const starts = [];
        for ( let at = text.indexOf( anchor.quote ); at !== -1; at = text.indexOf( anchor.quote, at + 1 ) ) {
            if ( ! withContext || ( lastPoints( text.slice( 0, at ), 32 ) === anchor.prefix && firstPoints( text.slice( at + anchor.quote.length ), 32 ) === anchor.suffix ) ) {
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

    /*
     * Where a suggestion's anchor is in the note as it is now (surface.md,
     * Placing): in the block at its path, if that has its name; otherwise
     * wherever in the note the quote stands with the same text around it, if
     * that is one place; otherwise wherever the quote stands, if that is one
     * place. Null is out of date. A suggestion about a whole block is looked
     * for among the top-level blocks, by the start of their text.
     *
     * `list` is the note's blocks as listBlocks() gives them. What comes back
     * is { block, path, order } and, for a passage, { key, record, start, end,
     * offset } too.
     */
    function place( list, suggestion ) {
        const { anchor } = suggestion;
        const entries = list.map( ( entry, order ) => ( { ...entry, order } ) );
        const same = ( entry ) => String( entry.path ) === String( anchor.path ) && entry.block.name === anchor.name;

        if ( suggestion.kind === 'blocks' ) {
            const matches = ( { path, block } ) => path.length === 1 && firstPoints( blockText( block ), 64 ) === anchor.quote;
            const here = entries.find( ( entry ) => same( entry ) && matches( entry ) );
            const found = here ? [ here ] : entries.filter( matches );
            return found.length === 1 ? found[ 0 ] : null;
        }

        const here = entries.find( same );
        const starts = here ? quoteStarts( blockText( here.block ), anchor, true ) : [];
        if ( starts.length ) {
            return passage( here, starts[ 0 ], anchor.quote.length );
        }
        for ( const withContext of [ true, false ] ) {
            const found = entries.flatMap( ( entry ) => quoteStarts( blockText( entry.block ), anchor, withContext ).map( ( start ) => [ entry, start ] ) );
            if ( found.length === 1 ) {
                return passage( found[ 0 ][ 0 ], found[ 0 ][ 1 ], anchor.quote.length );
            }
        }
        return null;
    }

    // ---- Changing the note ---------------------------------------------------

    /*
     * A rich text with a passage replaced. The replacement carries its own
     * inline formatting; formatting that covered the whole passage and that the
     * replacement does not carry goes around it (an ask's marker among them).
     */
    function replaced( { record, start, end }, replacement ) {
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
        return RichTextData.fromHTMLString( toHTMLString( { value: insert( record, next, start, end ) } ) );
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
     * The note's blocks with one suggestion accepted (editor.md, Accepting), or
     * null when it is out of date. Nothing is changed in place: the editor
     * takes the result as an edit, and Peek serializes it. `blocks` is the
     * note's top-level blocks, and the suggestion an `edit` or a `blocks` one.
     */
    function applied( blocks, suggestion ) {
        const { anchor, change } = suggestion;
        const at = anchor && place( listBlocks( blocks ), suggestion );
        if ( anchor && ! at ) {
            return null;
        }
        if ( suggestion.kind === 'edit' ) {
            return mapBlocks( blocks, ( block ) => ( block === at.block ? { [ at.key ]: replaced( at, change.replacement ) } : null ) );
        }
        if ( change.op === 'insert' ) {
            const index = at ? blocks.indexOf( at.block ) + 1 : 0;
            return [ ...blocks.slice( 0, index ), ...wp.blocks.parse( change.markup ), ...blocks.slice( index ) ];
        }
        const rest = blocks.filter( ( block ) => block !== at.block );
        if ( change.op === 'remove' ) {
            return rest;
        }
        // A move names where it goes by the top-level block it follows, as the note is now.
        const after = named( blocks )[ change.after ];
        if ( after === at.block ) {
            return blocks;
        }
        const index = change.after < 0 ? 0 : rest.indexOf( after ) + 1 || rest.length;
        return [ ...rest.slice( 0, index ), at.block, ...rest.slice( index ) ];
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
        const record = create( { html: value.toHTMLString() } );
        const format = { type: NOTE, attributes: { 'data-id': String( id ) } };
        const formats = record.formats.slice();
        for ( let i = start; i < end; i++ ) {
            const stack = formats[ i ] || [];
            formats[ i ] = [ ...stack.filter( ( other ) => other.type === NOTE ), format, ...stack.filter( ( other ) => other.type !== NOTE ) ];
        }
        return RichTextData.fromHTMLString( toHTMLString( { value: { ...record, formats } } ) );
    }

    // A block's attributes that lose a core note's marker (every core note's, with no id), or null when it has none.
    function withoutMarkers( block, id ) {
        let changed = null;
        Object.entries( block.attributes ).forEach( ( [ key, value ] ) => {
            if ( ! ( value instanceof RichTextData ) || value.toHTMLString().indexOf( 'wp-note' ) === -1 ) {
                return;
            }
            const record = create( { html: value.toHTMLString() } );
            const marks = ( format ) => format.type === NOTE && ( id === undefined || format.attributes[ 'data-id' ] === String( id ) );
            if ( ! record.formats.some( ( stack ) => stack && stack.some( marks ) ) ) {
                return;
            }
            const formats = record.formats.map( ( stack ) => stack && stack.filter( ( format ) => ! marks( format ) ) );
            changed = { ...changed, [ key ]: RichTextData.fromHTMLString( toHTMLString( { value: { ...record, formats } } ) ) };
        } );
        return changed;
    }

    /*
     * Ask, in the formatting pill, for the selected block. The pill is the
     * block's toolbar, so the button is a fill of its controls. What it opens
     * is Review's (see startAsk below).
     */
    let startAsk = null;

    function AskButton( { clientId } ) {
        const phone = useMedia( PHONE );
        return ! phone && el( wp.blockEditor.BlockControls, { group: 'other' },
            el( ToolbarButton, { className: 'wfw-ask-button', onClick: () => startAsk( clientId ) }, __( 'Ask', 'wordpress-for-writers' ) ) );
    }

    wp.hooks.addFilter( 'editor.BlockEdit', 'wfw/ask', wp.compose.createHigherOrderComponent( ( BlockEdit ) => ( props ) => el( Fragment, null,
        el( BlockEdit, props ),
        props.isSelected && el( AskButton, { clientId: props.clientId } )
    ), 'withAsk' ) );

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
    function Proposal( { suggestion, blocks, isActive, locked, onAccept } ) {
        const { anchor, change } = suggestion;
        switch ( kindOf( suggestion ) ) {
            case 'edit':
                return el( 'p', { className: 'wfw-card__change' },
                    el( 'del', null, anchor.quote ),
                    change.replacement !== '' && ' ',
                    change.replacement !== '' && el( 'ins', null, plainText( change.replacement ) ) );
            case 'comment':
                return el( 'p', { className: 'wfw-card__quote' }, anchor.quote );
            case 'insert':
                return el( 'p', { className: 'wfw-card__change' }, el( 'ins', null, plainText( change.markup.replace( /<!--[\s\S]*?-->/g, '' ) ) ) );
            case 'remove':
                return el( 'p', { className: 'wfw-card__change' }, el( 'del', null, anchor.quote ) );
            case 'move': {
                const after = change.after >= 0 && named( blocks )[ change.after ];
                return el( Fragment, null,
                    el( 'p', { className: 'wfw-card__quote' }, anchor.quote ),
                    el( 'p', { className: 'wfw-card__note' }, after
                        /* translators: %s: the first words of a block. */
                        ? sprintf( __( 'To after “%s”', 'wordpress-for-writers' ), firstPoints( blockText( after ), 64 ) )
                        : __( 'To the start of the note.', 'wordpress-for-writers' ) ) );
            }
            case 'titles':
                return el( 'ul', { className: 'wfw-card__options' }, change.value.map( ( title, index ) => el( 'li', { key: index },
                    isActive
                        ? el( Button, { variant: 'secondary', disabled: locked, onClick: () => onAccept( title ) }, title )
                        : title ) ) );
            case 'excerpt':
                return el( 'p', { className: 'wfw-card__change' }, el( 'ins', null, change.value ) );
            default:
                return el( Fragment, null,
                    el( 'p', { className: 'wfw-card__change' }, el( 'ins', null, change.value.join( ', ' ) ) ),
                    el( LeftOut, { field: change.field, names: change.value } ) );
        }
    }

    function Card( { suggestion, stale, blocks, isActive, locked, onActivate, onFocus, onAccept, onDismiss, onMove } ) {
        const kind = kindOf( suggestion );
        const canAccept = ! stale && hasAccept( suggestion );
        return el( 'div', {
            className: 'wfw-card' + ( isActive ? ' is-active' : '' ),
            'data-wfw-suggestion': suggestion.id,
            'data-wfw-state': stale ? 'stale' : isActive ? 'active' : 'open',
            role: 'group',
            'aria-label': KINDS[ kind ](),
            tabIndex: 0,
            onClick: onActivate,
            onFocus: ( event ) => event.target === event.currentTarget && onFocus(),
            onKeyDown: ( event ) => {
                if ( event.target !== event.currentTarget ) {
                    return;
                }
                if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
                    onMove( event.key === 'ArrowDown' ? 1 : -1 );
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
            : el( Proposal, { suggestion, blocks, isActive, locked, onAccept } ),
        suggestion.reason && el( 'p', { className: 'wfw-card__reason' }, suggestion.reason ),
        isActive && el( 'div', { className: 'wfw-card__actions' },
            canAccept && el( Button, { variant: 'primary', size: 'compact', disabled: locked, onClick: () => onAccept() }, __( 'Accept', 'wordpress-for-writers' ) ),
            el( Button, { variant: 'tertiary', size: 'compact', disabled: locked, onClick: onDismiss },
                kind === 'comment' && ! stale ? __( 'Resolve', 'wordpress-for-writers' ) : kind === 'titles' && ! stale ? __( 'Keep mine', 'wordpress-for-writers' ) : __( 'Dismiss', 'wordpress-for-writers' ) )
        ) );
    }

    // The cards of a pass under its header: the label, who (an agent, never which), when, and what to do with all of them.
    function Pass( { pass, locked, onAcceptAll, onPeek, children } ) {
        return el( 'section', { className: 'wfw-pass' },
            el( 'header', { className: 'wfw-pass__header' },
                el( 'strong', null, pass.label ),
                el( 'span', { className: 'wfw-pass__meta' },
                    __( 'Agent', 'wordpress-for-writers' ), ' · ', el( 'time', { dateTime: pass.date + 'Z' }, wp.date.humanTimeDiff( pass.date + 'Z' ) ) ),
                el( 'span', { className: 'wfw-pass__actions' },
                    el( Button, { variant: 'link', disabled: locked || ! pass.cards.some( ( card ) => ! card.stale && hasAccept( card.suggestion ) ), onClick: onAcceptAll }, __( 'Accept all', 'wordpress-for-writers' ) ),
                    el( Button, { variant: 'link', onClick: onPeek }, __( 'Peek', 'wordpress-for-writers' ) ) )
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

    // The field Ask opens at the selection: Enter sends, Escape or a press anywhere else closes.
    function AskField( { target, onSend, onClose } ) {
        const [ text, setText ] = useState( '' );
        const [ sending, setSending ] = useState( false );
        const form = useRef();
        useEffect( () => {
            const away = ( event ) => form.current.contains( event.target ) || onClose();
            const docs = [ document, agent.canvas.doc ];
            docs.forEach( ( doc ) => doc.addEventListener( 'pointerdown', away ) );
            return () => docs.forEach( ( doc ) => doc.removeEventListener( 'pointerdown', away ) );
        }, [] );
        const send = ( event ) => {
            event.preventDefault();
            if ( text.trim() && ! sending ) {
                setSending( true );
                onSend( text.trim() ).catch( () => setSending( false ) );
            }
        };
        return el( 'form', {
            ref: form,
            className: 'wfw-ask-field',
            style: { '--wfw-ask-top': target.top + 'px', '--wfw-ask-left': target.left + 'px' },
            onSubmit: send,
        },
        el( 'textarea', {
            autoFocus: true,
            rows: 3,
            maxLength: 600,
            value: text,
            'aria-label': __( 'Your question', 'wordpress-for-writers' ),
            placeholder: target.key ? __( 'Ask about this passage', 'wordpress-for-writers' ) : __( 'Ask about this block', 'wordpress-for-writers' ),
            onChange: ( event ) => setText( event.target.value ),
            onKeyDown: ( event ) => {
                if ( event.key === 'Escape' ) {
                    event.preventDefault();
                    onClose();
                } else if ( event.key === 'Enter' && ! event.shiftKey && ! event.nativeEvent.isComposing ) {
                    send( event );
                }
            },
        } ),
        el( Button, { variant: 'primary', size: 'compact', type: 'submit', disabled: ! text.trim() || sending }, __( 'Leave for an agent', 'wordpress-for-writers' ) ) );
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
        const [ active, setActive ] = useState( null );
        const [ shown, setShown ] = useState( wide );
        const [ asking, setAsking ] = useState( null );

        // ---- What the server holds ---------------------------------------------

        const clock = useRef( { seen: agent.config.seen, skew: agent.config.now - Date.now() / 1000 } );
        const known = useRef( new Set() );
        const asked = useRef( 0 );
        const writes = useRef( 0 );
        const beat = useRef( { open: 0, latest: null } );

        /*
         * Asks for the note's suggestions, and for its core notes too when
         * asked to or when a suggestion is new (it may answer an ask). The
         * core notes are read first: an open one that is no suggestion is an
         * ask, so the suggestions must be at least as new. An answer that a
         * later request or a status on its way to the server has overtaken is
         * dropped.
         */
        async function refresh( everything ) {
            const mine = ++asked.current;
            let answer = everything ? null : await apiFetch( { path: SUGGESTIONS } );
            let threads = null;
            if ( ! answer || answer.suggestions.some( ( suggestion ) => ! known.current.has( suggestion.id ) ) ) {
                threads = await apiFetch( { path: NOTES } );
                answer = await apiFetch( { path: SUGGESTIONS } );
            }
            if ( mine !== asked.current || writes.current ) {
                return;
            }
            known.current = new Set( answer.suggestions.map( ( suggestion ) => suggestion.id ) );
            clock.current = { seen: answer.seen, skew: answer.now - Date.now() / 1000 };
            if ( threads ) {
                setNotes( threads );
            }
            setSuggestions( answer.suggestions );
        }

        function setStatus( id, status ) {
            writes.current++;
            setSuggestions( ( list ) => list.map( ( suggestion ) => ( suggestion.id === id ? { ...suggestion, status } : suggestion ) ) );
            apiFetch( { path: '/wfw/v1/suggestions/' + id, method: 'POST', data: { status } } ).catch( fail ).then( () => {
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
            let hidden = false;
            const stopListening = agent.onMessage( ( message ) => {
                if ( message.type === 'visibility' ) {
                    hidden = !! message.hidden;
                }
            } );
            const polling = () => ! hidden && ! document.hidden && clock.current.seen > 0 && Date.now() / 1000 + clock.current.skew - clock.current.seen < FRESH;
            const timer = setInterval( () => polling() && refresh().catch( () => {} ), POLL );
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
                clock.current = { seen: told.seen, skew: told.now - Date.now() / 1000 };
                if ( told.open !== beat.current.open || ( beat.current.latest !== null && told.latest !== beat.current.latest ) ) {
                    refresh( true ).catch( () => {} );
                }
                beat.current.latest = told.latest;
            } );
            refresh( true ).catch( fail );
            return () => {
                stopListening();
                clearInterval( timer );
                wp.hooks.removeAction( 'heartbeat.send', 'wfw/suggestions' );
                wp.hooks.removeAction( 'heartbeat.tick', 'wfw/suggestions' );
            };
        }, [] );

        // ---- What is shown ---------------------------------------------------------

        const open = useMemo( () => ( suggestions || [] ).filter( ( suggestion ) => suggestion.status === 'open' ), [ suggestions ] );
        beat.current.open = open.length;

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
         */
        const { sections, keys, places } = useMemo( () => {
            const list = listBlocks( blocks );
            const found = new Map( open.map( ( suggestion ) => [ suggestion.id, suggestion.anchor ? place( list, suggestion ) : null ] ) );
            const order = ( a, b ) => a.order[ 0 ] - b.order[ 0 ] || a.order[ 1 ] - b.order[ 1 ];
            const passes = ( ofPass ) => {
                const byPass = new Map();
                ofPass.forEach( ( suggestion ) => {
                    const at = found.get( suggestion.id );
                    const stale = !! suggestion.anchor && ! at;
                    const card = {
                        suggestion,
                        stale,
                        order: stale ? [ Infinity, 1 ] : suggestion.kind === 'details' ? [ Infinity, 0 ] : at ? [ at.order, at.offset || 0 ] : [ -1, 0 ],
                    };
                    if ( ! byPass.has( suggestion.pass ) ) {
                        byPass.set( suggestion.pass, { id: suggestion.pass, label: suggestion.label, date: suggestion.date, cards: [] } );
                    }
                    byPass.get( suggestion.pass ).cards.push( card );
                } );
                return [ ...byPass.values() ].map( ( pass ) => ( { ...pass, cards: pass.cards.sort( order ), order: pass.cards[ 0 ].order } ) ).sort( order );
            };

            const ids = new Set( ( suggestions || [] ).map( ( suggestion ) => suggestion.id ) );
            const asks = notes.filter( ( note ) => ! note.parent && note.status === 'hold' && ! ids.has( note.id ) );
            const all = [
                ...passes( open.filter( ( suggestion ) => ! asks.some( ( ask ) => ask.id === suggestion.ask ) ) ).map( ( pass ) => ( { pass, order: pass.order } ) ),
                ...asks.map( ( ask ) => {
                    const index = list.findIndex( ( { block } ) => noteIds( block.attributes.metadata ).includes( ask.id ) );
                    return {
                        ask,
                        // A thread is shown without the empty children that record a resolve or a reopen.
                        replies: notes.filter( ( note ) => note.parent === ask.id && ! ( note.meta && note.meta._wp_note_status ) && ! open.some( ( suggestion ) => suggestion.id === note.id ) ).sort( ( a, b ) => a.id - b.id ),
                        passes: passes( open.filter( ( suggestion ) => suggestion.ask === ask.id ) ),
                        order: [ index === -1 ? Infinity : index, -1 ],
                    };
                } ),
            ].sort( order );
            const cardKeys = ( pass ) => pass.cards.map( ( card ) => 's' + card.suggestion.id );
            return {
                sections: all,
                keys: all.flatMap( ( section ) => ( section.pass ? cardKeys( section.pass ) : [ 'a' + section.ask.id, ...section.passes.flatMap( cardKeys ) ] ) ),
                places: found,
            };
        }, [ blocks, suggestions, notes ] );

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
         * marks are drawn again from the places above after every render and
         * every change in the canvas, once a frame. The registry and the
         * rules belong to the canvas's own window and document.
         */
        const view = useRef();
        view.current = { open, places, active };
        const ranges = useRef( new Map() );
        const frame = useRef( 0 );

        function draw() {
            frame.current = 0;
            const { doc, win } = agent.canvas;
            if ( ! doc || ! win.Highlight ) {
                return;
            }
            const drawn = Object.fromEntries( HIGHLIGHTS.map( ( name ) => [ name, [] ] ) );
            ranges.current = new Map();
            view.current.open.forEach( ( suggestion ) => {
                const at = view.current.places.get( suggestion.id );
                const range = at && kindOf( suggestion ) !== 'insert' && rangeOf( doc, at );
                if ( ! range ) {
                    return;
                }
                ranges.current.set( suggestion.id, range );
                drawn[ suggestion.kind === 'edit' ? 'wfw-edit' : 'wfw-passage' ].push( range );
                if ( view.current.active === 's' + suggestion.id ) {
                    drawn[ 'wfw-active' ].push( range );
                }
            } );
            HIGHLIGHTS.forEach( ( name, priority ) => {
                const highlight = new win.Highlight( ...drawn[ name ] );
                highlight.priority = priority;
                win.CSS.highlights.set( name, highlight );
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
                        activate( 's' + hit[ 0 ] );
                    } else if ( marker ) {
                        activate( 'a' + marker.dataset.id );
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
                        setActive( 's' + hit[ 0 ] );
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
                if ( doc && win.Highlight ) {
                    HIGHLIGHTS.forEach( ( name ) => win.CSS.highlights.delete( name ) );
                    delete doc.documentElement.dataset.wfwMarks;
                    doc.getElementById( 'wfw-suggest-css' ).remove();
                }
            };
        }, [] );

        // A card was pressed: its passage, or its ask's marker, comes into view.
        function reveal( key ) {
            const { doc, win } = agent.canvas;
            const shownAt = key[ 0 ] === 's' ? ranges.current.get( Number( key.slice( 1 ) ) ) : doc.querySelector( 'mark.wp-note[data-id="' + key.slice( 1 ) + '"]' );
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
            const done = [];
            let next = before;
            list.forEach( ( suggestion ) => {
                const { field, value } = suggestion.change;
                if ( suggestion.kind !== 'details' ) {
                    const result = applied( next, suggestion );
                    if ( ! result ) {
                        return;
                    }
                    next = result;
                } else if ( field === 'titles' ) {
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
            return done.length;
        }

        function acceptOne( suggestion, title ) {
            refocus.current = document.activeElement.matches( '.wfw-card' );
            accept( [ suggestion ], title ).then( ( count ) => count && say( __( 'Accepted.', 'wordpress-for-writers' ), () => dispatch( editorStore ).undo() ) ).catch( fail );
        }

        function acceptAll( pass ) {
            accept( pass.cards.filter( ( card ) => ! card.stale && hasAccept( card.suggestion ) ).map( ( card ) => card.suggestion ) ).then( ( count ) => count && say(
                /* translators: %d: number of suggestions. */
                sprintf( _n( 'Accepted %d suggestion.', 'Accepted %d suggestions.', count, 'wordpress-for-writers' ), count ),
                () => dispatch( editorStore ).undo()
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
            let next = select( blockEditorStore ).getBlocks();
            pass.cards.forEach( ( { suggestion } ) => {
                if ( [ 'edit', 'blocks' ].includes( suggestion.kind ) ) {
                    next = applied( next, suggestion ) || next;
                }
            } );
            agent.post( {
                type: 'peek-pass',
                title: select( editorStore ).getEditedPostAttribute( 'title' ) || '',
                content: wp.blocks.serialize( mapBlocks( next, ( block ) => withoutMarkers( block ) ) ),
                label: pass.label,
            } );
        }

        // ---- Asks ------------------------------------------------------------------

        /*
         * Ask is about the selected text of one rich text, or, with only a
         * caret, about the whole block. The field opens at what is asked about.
         */
        useEffect( () => {
            startAsk = ( clientId ) => {
                const store = select( blockEditorStore );
                const from = store.getSelectionStart();
                const to = store.getSelectionEnd();
                const inline = from.clientId === clientId && to.clientId === clientId && !! from.attributeKey && from.offset !== undefined && to.offset !== undefined && from.offset !== to.offset;
                const { doc, win, frame: canvasFrame } = agent.canvas;
                const box = ( inline ? win.getSelection().getRangeAt( 0 ) : doc.querySelector( '[data-block="' + clientId + '"]' ) ).getBoundingClientRect();
                const origin = canvasFrame.getBoundingClientRect();
                setAsking( {
                    clientId,
                    key: inline ? from.attributeKey : null,
                    start: Math.min( from.offset, to.offset ),
                    end: Math.max( from.offset, to.offset ),
                    top: origin.top + Math.min( box.bottom, win.innerHeight ) + 8,
                    left: origin.left + box.left,
                } );
            };
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
            activate( 'a' + note.id );
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
            setNotes( ( list ) => list.map( ( note ) => ( note.id === ask.id ? { ...note, status: 'approved' } : note ) ) );
        }

        // ---- The chip, the rail or the sheet, and the field --------------------------

        const renderPass = ( pass ) => el( Pass, { key: pass.id, pass, locked, onAcceptAll: () => acceptAll( pass ), onPeek: () => peek( pass ) },
            pass.cards.map( ( { suggestion, stale } ) => el( Card, {
                key: suggestion.id,
                suggestion,
                stale,
                blocks,
                locked,
                isActive: active === 's' + suggestion.id,
                onActivate: () => reveal( 's' + suggestion.id ),
                onFocus: () => setActive( 's' + suggestion.id ),
                onAccept: ( title ) => acceptOne( suggestion, title ),
                onDismiss: () => dismiss( suggestion ),
                onMove: move,
            } ) ) );
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
                el( 'header', { className: 'wfw-review__header' },
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
                        key: 'a' + section.ask.id,
                        ask: section.ask,
                        replies: section.replies,
                        mine: !! user && user.id === section.ask.author,
                        locked,
                        isActive: active === 'a' + section.ask.id,
                        onActivate: () => reveal( 'a' + section.ask.id ),
                        onFocus: () => setActive( 'a' + section.ask.id ),
                        onResolve: () => resolve( section ).catch( fail ),
                        onMove: move,
                    }, section.passes.map( renderPass ) ) ) ) )
            ),
            asking && el( AskField, { target: asking, onSend: sendAsk, onClose: () => setAsking( null ) } )
        );
    }

    // Nothing of the surface shows in the app's phone layout, and nothing is asked of the server there.
    agent.start( function Review() {
        const phone = useMedia( PHONE );
        return ! phone && el( Surface );
    } );
} )();
