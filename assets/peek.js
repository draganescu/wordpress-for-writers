/*
 * Peek: a note to read while writing another. It opens in a sheet over the
 * editor pane, read only, with text that can be selected and searched; the
 * note in the editor stays the only thing being written. The sheet docks
 * where the pane has room (beside the editor when it's wide, under it when
 * it's narrow or tall, and always under it on phones), can be dragged by
 * its header to another edge and resized by its inner edge, and holds a
 * few notes as tabs. A peeked note can step back through its past
 * versions, and swap places with the note in the editor.
 *
 * The sheet shows the note as saved (the site's rendered content, cleaned
 * of anything that runs), set as in the editor (note-flow.css, shared with
 * the canvas). It is the app's own markup rather than another editor, so it
 * opens at once.
 *
 * This file is the whole feature (its styles are peek.css). app.js creates
 * it once with window.wfwPeek( app ) and talks to it only through what that
 * returns (at the end of the file). What it needs of the app, `app`:
 *
 *   root, esc, icon, loadPref, savePref, htmlToText, phoneLayout
 *                        the app's element and helpers
 *   statuses             the post statuses a note can have, for the REST API
 *   blockStylesUrl       core's block styles, loaded with the first peek
 *   current()            the tab in view ({ id, title, peeks, ... }) or null
 *   tabs()               every open tab
 *   panel()              whether a panel has the editor pane to itself
 *   titleOf( id )        a note's title, when the app already knows it
 *   saveTabs()           saves the tabs (and, through saved(), their sheets)
 *   replaceNote( id, title )   puts another note in the tab in view; resolves to whether it did
 *   restoreVersion( { id, title, content, excerpt, date } )
 *                        applies a past version in the note's editor; resolves to whether it could
 *   pickPeek()           opens the command palette asking which note to peek at
 *   placeMenu( box, { x, y } )   puts a menu at a point, inside the window
 *   focusEditor()        gives focus back to the editor
 *
 * A tab's own sheet waits on the tab as tab.peeks = { items, at, folded }
 * while the tab is out of view; nothing else in the app reads it.
 */
window.wfwPeek = function ( app ) {
    const { root, esc, icon, loadPref, savePref, htmlToText, phoneLayout } = app;
    const apiFetch = wp.apiFetch;
    const { __, sprintf } = wp.i18n;

    const PEEK_MAX = 6;
    const PEEK_STRIP = 52; // px: the sheet folded down to its header
    const PEEK_RAIL = 44; // px: the same beside the editor, where the header stands on end
    const PEEK_TOP = 56; // px of the editor a full-height sheet leaves in sight, with the pane's buttons
    const PEEK_EASE = 300; // ms, as in the stylesheet
    const VERSIONS_KEPT = 10; // past versions kept loaded per note, to step back and forth without refetching
    const FIND_MAX = 500; // matches marked at most: a letter or two in a long note would be thousands
    const FIND_WAIT = 150; // ms after typing in Find stops before the note is searched
    const SAVED_REFRESH = 10000; // ms: a note saved again and again (the one being written) refreshes in the sheet at most this often
    const TAB_ROOM = 72; // px: a tab cut shorter than this is too little to read or to tap
    const DOCKS = [ 'right', 'left', 'bottom' ];
    const SIDE = 0.42; // share of the pane a sheet beside the editor takes, at first
    const BOTTOM = 0.5; // and a sheet under it

    // `min` wins when the range is empty (an index into an empty list is 0).
    const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );

    // Note ids as kept in preferences: numbers, at most a sheet's worth.
    const peekIds = ( list ) => ( Array.isArray( list ) ? list : [] ).map( Number ).filter( ( id ) => id > 0 ).slice( 0, PEEK_MAX );

    const peekSaved = loadPref( 'peek', {} ) || {};
    const peek = {
        // { id, title, html, loading, failed, stale, pinned, versions: null | { list, index, cache, stale } }; the pinned ones first.
        items: peekIds( peekSaved.pins ).map( ( id ) => newPeekItem( id, '', true ) ),
        at: 0,
        dock: DOCKS.includes( peekSaved.dock ) ? peekSaved.dock : null, // null: wherever there is room
        side: clamp( Number( peekSaved.side ) || SIDE, 0.2, 0.8 ),
        bottom: clamp( Number( peekSaved.bottom ) || BOTTOM, 0.2, 1 ),
        folded: false,
        find: null, // { query, ranges, at }
    };
    let el = null; // the sheet, once init() has put it in the page
    let menuEl = null; // the menu of the sheet's notes, at the app's root
    let peekMenuOpen = false;
    let shownBody = null; // what the sheet's body shows now, so it is only rebuilt when that changes
    let peekPush = { dock: '', px: 0 };
    let peekPushTimer = 0;
    let shown = null; // where the sheet sits while in sight: { box, dock } (dock null after it was carried off its edge)
    let settleTimer = 0;
    let settleThen = null;
    let savedRefreshTimer = 0;
    let savedRefreshAt = 0;
    let peekFoldedByKeyboard = false;

    function newPeekItem( id, title = '', pinned = false ) {
        return { id, title, html: '', loading: true, failed: false, stale: false, pinned, versions: null };
    }

    function peekItem() {
        return peek.items[ peek.at ] || null;
    }

    // The past version the sheet shows, once loaded; null when it shows the note as it is.
    function shownVersion( item ) {
        const versions = item?.versions;
        return versions?.list && versions.index >= 0 ? versions.cache.get( versions.list[ versions.index ].id ) || null : null;
    }

    const pinnedFirst = ( items ) => [ ...items.filter( ( item ) => item.pinned ), ...items.filter( ( item ) => ! item.pinned ) ];
    const ownPeeks = () => peek.items.filter( ( item ) => ! item.pinned );

    function setLabel( button, label ) {
        button.title = label;
        button.setAttribute( 'aria-label', label );
    }

    // Where the sheet docks and how big it is are the device's; which notes it holds is each tab's, kept with the tabs.
    function savePeek() {
        savePref( 'peek', { dock: peek.dock, side: peek.side, bottom: peek.bottom, pins: peek.items.filter( ( item ) => item.pinned ).map( ( item ) => item.id ) } );
        app.saveTabs();
    }

    /*
     * Each tab has its own sheet: the notes read beside what that tab is
     * writing. `peek` holds the sheet of the tab in view; the others wait on
     * their tabs (tab.peeks) and come back with them. A sheet opened with no
     * tab in view goes to the first tab that comes into view without one.
     */
    const noTabPeeks = { peeks: null };

    // A pinned note stays in the sheet through every tab, ahead of the tab's own; the rest change with the tab.
    function switchPeeks( from, to ) {
        if ( from === to ) {
            return;
        }
        const shown = peekItem();
        const next = ( to || noTabPeeks ).peeks;
        if ( ! from && to && ! next?.items.length ) {
            noTabPeeks.peeks = null;
            return; // The sheet that was open with no tab stays, now this tab's.
        }
        const own = ownPeeks();
        ( from || noTabPeeks ).peeks = { items: own, at: Math.max( 0, own.indexOf( shown ) ), folded: peek.folded };
        const pinned = peek.items.filter( ( item ) => item.pinned );
        const theirs = next?.items || [];
        closePeekFind();
        peek.items = [ ...pinned, ...theirs ];
        if ( shown?.pinned ) {
            peek.at = pinned.indexOf( shown ); // Still being read: it stays in front, as it was.
        } else {
            peek.at = theirs.length ? pinned.length + Math.min( next.at || 0, theirs.length - 1 ) : 0;
            peek.folded = theirs.length ? !! next.folded : peek.folded;
            peekFoldedByKeyboard = false;
        }
        loadTitles();
        freshen();
    }

    // Keeps the note in the sheet across tabs, or hands it back to this tab alone.
    function togglePeekPin() {
        const item = peekItem();
        if ( ! item ) {
            return;
        }
        item.pinned = ! item.pinned;
        peek.items = pinnedFirst( peek.items );
        peek.at = peek.items.indexOf( item );
        savePeek();
        renderPeek();
    }

    function peekShellHtml() {
        const tool = ( action, name, label, extra = '' ) => `<button class="wfw-icon-btn" data-action="${ action }" title="${ esc( label ) }" aria-label="${ esc( label ) }"${ extra }>${ icon( name ) }</button>`;
        return `
            <aside class="wfw-peek" aria-label="${ esc( __( 'Peek', 'wordpress-for-writers' ) ) }" hidden>
                <div class="wfw-peek__grip" aria-hidden="true"></div>
                <div class="wfw-peek__inner">
                <header class="wfw-peek__head">
                    <span class="wfw-peek__handle" aria-hidden="true"></span>
                    <div class="wfw-peek__tabs" role="tablist"></div>
                    <button class="wfw-icon-btn wfw-peek__switch" data-action="peek-switch" aria-haspopup="menu" aria-expanded="false" aria-controls="wfw-peek-menu" title="${ esc( __( 'Switch note', 'wordpress-for-writers' ) ) }" aria-label="${ esc( __( 'Switch note', 'wordpress-for-writers' ) ) }"><span class="wfw-peek__switch-count" aria-hidden="true"></span>${ icon( 'dropdown' ) }</button>
                    <div class="wfw-peek__tools">
                        ${ tool( 'peek-find', 'search', __( 'Find in this note', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-versions', 'restore', __( 'Past versions', 'wordpress-for-writers' ), ' aria-pressed="false"' ) }
                        ${ tool( 'peek-swap', 'swap', __( 'Swap with the note in the editor', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-pin', 'pin', __( 'Keep in every tab', 'wordpress-for-writers' ), ' aria-pressed="false"' ) }
                        ${ tool( 'peek-fold', 'forward', __( 'Put away', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-close', 'close', __( 'Close', 'wordpress-for-writers' ) ) }
                    </div>
                </header>
                <div class="wfw-peek__bar wfw-peek__find" hidden>
                    <label class="wfw-search">${ icon( 'search' ) }<input type="search" placeholder="${ esc( __( 'Find', 'wordpress-for-writers' ) ) }" aria-label="${ esc( __( 'Find in this note', 'wordpress-for-writers' ) ) }" autocomplete="off" spellcheck="false" /></label>
                    <span class="wfw-peek__count" aria-live="polite"></span>
                    ${ tool( 'peek-find-prev', 'back', __( 'Previous match', 'wordpress-for-writers' ) ) }
                    ${ tool( 'peek-find-next', 'forward', __( 'Next match', 'wordpress-for-writers' ) ) }
                </div>
                <div class="wfw-peek__bar wfw-peek__versions" hidden>
                    ${ tool( 'peek-older', 'back', __( 'Older version', 'wordpress-for-writers' ) ) }
                    <span class="wfw-peek__when" aria-live="polite"></span>
                    ${ tool( 'peek-newer', 'forward', __( 'Newer version', 'wordpress-for-writers' ) ) }
                    <button class="wfw-peek__restore" data-action="peek-restore">${ esc( __( 'Restore', 'wordpress-for-writers' ) ) }</button>
                </div>
                <div class="wfw-peek__scroll" tabindex="-1">
                    <article class="wfw-peek__doc"><h1 class="wfw-peek__title"></h1><div class="wfw-peek__body wfw-body"></div></article>
                </div>
                </div>
            </aside>
            <div class="wfw-peek-drop" aria-hidden="true" hidden></div>`;
    }

    /*
     * The site's rendered content, made safe to read inside the app. A note
     * can be someone else's: WordPress lets any author keep ids, data-*
     * attributes, classes and inline styles, which here would reach the app
     * itself (its buttons act on data-action, it finds its menus by id), so
     * only what reads as text, links and images is kept:
     *
     * - nothing that runs, posts or embeds (scripts, frames, forms, SVG animation);
     * - no event handlers, and links and sources only to http(s), mail, phone
     *   and inline images (parsed as the browser would, so "jav&#9;ascript:" is caught);
     * - no ids, names or data-* attributes, and none of the app's own classes.
     *
     * wp.dom.safeHTML only takes out scripts and on* handlers, so it isn't
     * enough here. The sheet also contains what is left (peek.css), so no
     * style can reach past it.
     */
    const PEEK_DROP = 'script, style, link, meta, base, object, embed, iframe, frame, form, input, button, textarea, select, animate, set, animatemotion, animatetransform';
    const PEEK_URL_ATTRS = [ 'href', 'src', 'xlink:href', 'action', 'formaction', 'poster' ];

    function safeUrl( value ) {
        try {
            const { protocol } = new URL( value, document.baseURI );
            return /^(https?|mailto|tel):$/.test( protocol ) || protocol === 'data:' && /^\s*data:image\//i.test( value );
        } catch ( e ) {
            return false;
        }
    }

    function peekFragment( html ) {
        const template = document.createElement( 'template' );
        template.innerHTML = html || '';
        const content = template.content;
        content.querySelectorAll( PEEK_DROP ).forEach( ( node ) => node.remove() );
        content.querySelectorAll( '*' ).forEach( ( node ) => {
            [ ...node.attributes ].forEach( ( attr ) => {
                const name = attr.name.toLowerCase();
                const drop = name.startsWith( 'on' ) || name.startsWith( 'data-' ) || [ 'id', 'name', 'srcdoc', 'contenteditable', 'tabindex', 'autofocus' ].includes( name )
                    || name === 'style' && /expression|url\s*\(/i.test( attr.value )
                    || PEEK_URL_ATTRS.includes( name ) && ! safeUrl( attr.value );
                if ( drop ) {
                    node.removeAttribute( attr.name );
                }
            } );
            [ ...node.classList ].filter( ( name ) => name.startsWith( 'wfw-' ) ).forEach( ( name ) => node.classList.remove( name ) );
            if ( node.localName === 'a' ) {
                // HTML and SVG links alike open on their own, away from the app.
                node.setAttribute( 'target', '_blank' );
                node.setAttribute( 'rel', 'noopener noreferrer' );
            }
        } );
        return content;
    }

    // When a version was saved, in the site's timezone and the writer's own date and time formats: "Today, 9:40 pm".
    function versionWhen( gmt ) {
        const { formats } = wp.date.getSettings();
        const saved = gmt + 'Z';
        const day = ( value ) => wp.date.dateI18n( 'Y-m-d', value );
        const yesterday = new Date( Date.now() - 86400000 );
        const time = wp.date.dateI18n( formats.time, saved );
        if ( day( saved ) === day( new Date() ) ) {
            /* translators: %s: a time of day. */
            return sprintf( __( 'Today, %s', 'wordpress-for-writers' ), time );
        }
        if ( day( saved ) === day( yesterday ) ) {
            /* translators: %s: a time of day. */
            return sprintf( __( 'Yesterday, %s', 'wordpress-for-writers' ), time );
        }
        return wp.date.dateI18n( formats.date, saved ) + ', ' + time;
    }

    async function loadPeek( item ) {
        item.loading = ! item.html;
        item.failed = false;
        item.stale = false;
        renderPeek();
        const id = item.id;
        try {
            const note = await apiFetch( { path: '/wp/v2/posts/' + id + '?context=edit&_fields=title.raw,title.rendered,content.rendered' } );
            if ( item.id !== id ) {
                return;
            }
            item.title = note.title.raw || htmlToText( note.title.rendered );
            item.html = note.content.rendered || '';
        } catch ( e ) {
            if ( item.id !== id ) {
                return;
            }
            item.failed = true;
        }
        item.loading = false;
        renderPeek();
    }

    // The note in front gets its text when it has none yet, or when it has been saved since.
    function freshen() {
        const item = peekItem();
        if ( ! item || ! el || peek.folded ) {
            return;
        }
        // The note as it is now, unless a past version is in front of it.
        if ( ( item.stale || ! item.html && ! item.failed ) && ! ( item.versions?.index >= 0 ) ) {
            loadPeek( item );
        }
        if ( item.versions?.stale && item.versions.list ) {
            addNewVersions( item );
        }
    }

    // Notes that came back with a tab or a reload have no title yet: one request for all of them.
    async function loadTitles() {
        const untitled = peek.items.filter( ( item ) => ! item.title && ! item.html );
        if ( ! untitled.length ) {
            return;
        }
        const notes = await apiFetch( { path: '/wp/v2/posts?' + new URLSearchParams( { include: untitled.map( ( item ) => item.id ).join( ',' ), per_page: PEEK_MAX, status: app.statuses, context: 'edit', _fields: 'id,title' } ) } ).catch( () => [] );
        const titles = new Map( notes.map( ( note ) => [ note.id, note.title.raw || htmlToText( note.title.rendered ) ] ) );
        untitled.forEach( ( item ) => {
            item.title = item.title || titles.get( item.id ) || '';
        } );
        renderPeek();
    }

    /*
     * Tabs want room: on a phone, or once a sheet is too narrow for its
     * notes' titles, the header shows the note in view alone, and a button
     * beside it lists the sheet's notes as a menu, the way Switch tab does
     * for the editors.
     */
    function fitPeekTabs() {
        // Put away, the header shows the one note anyway; measuring waits until the sheet is back.
        if ( ! el || el.hidden || el.classList.contains( 'is-folded' ) ) {
            return;
        }
        let crowded = peek.items.length > 1 && phoneLayout.matches;
        if ( peek.items.length > 1 && ! crowded ) {
            // As tabs, with the button out of the way: is any of them cut too short?
            el.classList.remove( 'is-crowded' );
            crowded = [ ...el.querySelector( '.wfw-peek__tabs' ).children ].some( ( tab ) => tab.scrollWidth > tab.clientWidth && tab.clientWidth < TAB_ROOM );
        }
        el.classList.toggle( 'is-crowded', crowded );
        if ( ! crowded ) {
            closePeekMenu( false );
        }
    }

    function peekMenuHtml() {
        const untitled = __( 'Untitled', 'wordpress-for-writers' );
        return peek.items.map( ( item, i ) => `<button class="wfw-menu__item${ item.title ? '' : ' is-empty' }" role="menuitemradio" aria-checked="${ i === peek.at }" tabindex="-1" data-action="peek-tab" data-index="${ i }">${ i === peek.at ? icon( 'check' ) : '<span class="wfw-menu__spacer"></span>' }<span>${ esc( item.title || untitled ) }</span></button>` ).join( '' );
    }

    // From the keyboard focus goes to the note in view; otherwise to the menu itself, so its keys work from the start.
    function openPeekMenu( { keyboard = false } = {} ) {
        const button = el.querySelector( '.wfw-peek__switch' );
        peekMenuOpen = true;
        menuEl.innerHTML = peekMenuHtml();
        menuEl.hidden = false;
        button.setAttribute( 'aria-expanded', 'true' );
        const rect = button.getBoundingClientRect();
        app.placeMenu( menuEl, { x: rect.left, y: rect.bottom + 4 } );
        ( keyboard ? menuEl.querySelector( '[aria-checked="true"]' ) || menuEl : menuEl ).focus( { preventScroll: true } );
    }

    function closePeekMenu( returnFocus = true ) {
        if ( ! peekMenuOpen ) {
            return;
        }
        peekMenuOpen = false;
        menuEl.hidden = true;
        const button = el.querySelector( '.wfw-peek__switch' );
        button.setAttribute( 'aria-expanded', 'false' );
        if ( returnFocus ) {
            button.focus( { preventScroll: true } );
        }
    }

    function renderPeek() {
        const item = peekItem();
        if ( ! el || ! item ) {
            return;
        }
        const untitled = __( 'Untitled', 'wordpress-for-writers' );
        el.querySelector( '.wfw-peek__tabs' ).innerHTML = peek.items.map( ( other, i ) => `<button class="wfw-peek__tab${ i === peek.at ? ' is-active' : '' }${ other.pinned ? ' is-pinned' : '' }" role="tab" aria-selected="${ i === peek.at }" data-action="peek-tab" data-index="${ i }">${ esc( other.title || untitled ) }</button>` ).join( '' );
        el.querySelector( '.wfw-peek__switch-count' ).textContent = peek.items.length;
        fitPeekTabs();
        if ( peekMenuOpen ) {
            menuEl.innerHTML = peekMenuHtml();
        }
        const version = shownVersion( item );
        const title = el.querySelector( '.wfw-peek__title' );
        const shownTitle = version ? version.title : item.title;
        title.textContent = shownTitle || untitled;
        title.classList.toggle( 'is-empty', ! shownTitle );
        // The body is only rebuilt when what it shows changes, so the reader keeps their place.
        const waiting = item.loading || ( item.versions?.index >= 0 && ! version );
        const body = item.failed ? 'failed' : waiting ? 'loading' : version ? version.html : item.html;
        if ( body !== shownBody ) {
            shownBody = body;
            const box = el.querySelector( '.wfw-peek__body' );
            if ( item.failed ) {
                box.innerHTML = `<p class="wfw-peek__note">${ esc( __( 'This note couldn’t be loaded.', 'wordpress-for-writers' ) ) }</p>`;
            } else if ( waiting ) {
                box.innerHTML = '<div class="wfw-editor__skeleton-column"><span></span><span></span><span></span></div>';
            } else {
                box.replaceChildren( peekFragment( body ) );
            }
            runPeekFind();
        }
        // Its tools: past versions, and swapping (not with itself).
        const versions = el.querySelector( '.wfw-peek__versions' );
        versions.hidden = ! item.versions;
        el.querySelector( '[data-action="peek-versions"]' ).setAttribute( 'aria-pressed', String( !! item.versions ) );
        el.querySelector( '[data-action="peek-swap"]' ).disabled = ! app.current() || app.current().id === item.id || app.panel();
        const pin = el.querySelector( '[data-action="peek-pin"]' );
        pin.setAttribute( 'aria-pressed', String( item.pinned ) );
        setLabel( pin, item.pinned ? __( 'Keep in this tab only', 'wordpress-for-writers' ) : __( 'Keep in every tab', 'wordpress-for-writers' ) );
        if ( item.versions ) {
            const { list, index } = item.versions;
            versions.querySelector( '.wfw-peek__when' ).textContent = ! list
                ? __( 'Loading versions…', 'wordpress-for-writers' )
                : index < 0
                    ? ( list.length ? __( 'Now', 'wordpress-for-writers' ) : __( 'No earlier versions yet', 'wordpress-for-writers' ) )
                    : versionWhen( list[ index ].date_gmt );
            versions.querySelector( '[data-action="peek-older"]' ).disabled = ! list || index >= list.length - 1;
            versions.querySelector( '[data-action="peek-newer"]' ).disabled = ! list || index < 0;
            versions.querySelector( '.wfw-peek__restore' ).disabled = ! version;
        }
    }

    // Core's block styles, for galleries, images and the like in a peeked note: loaded with the first peek.
    function loadBlockStyles() {
        if ( app.blockStylesUrl && ! document.getElementById( 'wp-block-library-css' ) ) {
            const link = document.createElement( 'link' );
            link.id = 'wp-block-library-css';
            link.rel = 'stylesheet';
            link.href = app.blockStylesUrl;
            document.head.appendChild( link );
        }
    }

    // Opens a note in the sheet, or brings it forward if it's there already.
    function peekNote( id, { versions = false } = {} ) {
        if ( ! id ) {
            return;
        }
        loadBlockStyles();
        let at = peek.items.findIndex( ( item ) => item.id === id );
        if ( at < 0 ) {
            if ( peek.items.length >= PEEK_MAX ) {
                peek.items.shift();
            }
            peek.items.push( newPeekItem( id, app.titleOf( id ) ) );
            at = peek.items.length - 1;
        }
        peek.at = at;
        peek.folded = false;
        closePeekFind();
        const item = peek.items[ at ];
        item.stale = true; // Opened again: show it as it is now.
        if ( versions && ! item.versions ) {
            togglePeekVersions();
        }
        root.classList.add( 'has-note' ); // On phones the editor pane, and the sheet with it, shows in place of the list.
        root.classList.remove( 'is-sidebar-open' );
        savePeek();
        layoutPeek();
        freshen();
    }

    function closePeek( index = peek.at ) {
        if ( index < 0 || index >= peek.items.length ) {
            return;
        }
        peek.items.splice( index, 1 );
        peek.at = clamp( peek.at > index ? peek.at - 1 : peek.at, 0, peek.items.length - 1 );
        closePeekFind();
        savePeek();
        if ( peek.items.length ) {
            renderPeek();
            freshen();
        } else if ( ! app.current() ) {
            root.classList.remove( 'has-note' );
        }
        layoutPeek();
    }

    function closeAllPeeks() {
        peek.items = [];
        peek.at = 0;
        closePeekFind();
        savePeek();
        layoutPeek();
    }

    /*
     * Swap: the peeked note goes into the editor and the note that was there
     * comes to the sheet, so there is still one note being written. The editor
     * saves a draft first, so the sheet shows it as it was left.
     */
    async function swapPeek() {
        const item = peekItem();
        const leaving = app.current();
        if ( ! item || ! leaving || leaving.id === item.id || app.panel() ) {
            return;
        }
        const leavingId = leaving.id;
        const leavingTitle = leaving.title;
        el.classList.add( 'is-swapping' );
        setTimeout( () => el.classList.remove( 'is-swapping' ), PEEK_EASE );
        // In this tab, whose sheet it is, even when the note has a tab of its own elsewhere.
        if ( ! ( await app.replaceNote( item.id, item.title ) ) ) {
            return; // The writer kept the note in the editor (unsaved changes to a published note).
        }
        if ( ! leavingId ) {
            closePeek( peek.items.indexOf( item ) );
            return;
        }
        // The pin was the other note's: the one now in the sheet is this tab's. A note in the sheet twice is one too many.
        Object.assign( item, newPeekItem( leavingId, leavingTitle ) );
        peek.items = pinnedFirst( peek.items.filter( ( other ) => other === item || other.id !== leavingId ) );
        peek.at = peek.items.indexOf( item );
        closePeekFind();
        savePeek();
        loadPeek( item );
    }

    // ---- Peek: past versions

    function togglePeekVersions() {
        const item = peekItem();
        if ( ! item ) {
            return;
        }
        item.versions = item.versions ? null : { list: null, index: -1, cache: new Map(), stale: false };
        renderPeek();
        if ( item.versions ) {
            loadPeekVersions( item );
        }
    }

    // The note's saved versions, newest first. `step` opens on the one before the last save.
    function versionsPath( item, count ) {
        return '/wp/v2/posts/' + item.id + '/revisions?context=edit&per_page=' + count + '&_fields=id,date_gmt';
    }

    // The note's saved versions, newest first, opening on the one before the last save.
    async function loadPeekVersions( item ) {
        const versions = item.versions;
        versions.stale = false;
        const list = await apiFetch( { path: versionsPath( item, 100 ) } ).catch( () => [] );
        if ( item.versions === versions ) {
            versions.list = list;
            showPeekVersion( item, Math.min( 1, list.length - 1 ) );
        }
    }

    // Saves since the list was loaded: only the newest few are asked for, and added at its top.
    async function addNewVersions( item ) {
        const versions = item.versions;
        versions.stale = false;
        const newest = await apiFetch( { path: versionsPath( item, 10 ) } ).catch( () => [] );
        if ( item.versions !== versions ) {
            return;
        }
        const known = new Set( versions.list.map( ( v ) => v.id ) );
        const added = newest.filter( ( v ) => ! known.has( v.id ) );
        if ( added.length ) {
            versions.list = [ ...added, ...versions.list ];
            versions.index += versions.index >= 0 ? added.length : 0; // The same version stays in front.
            renderPeek();
        }
    }

    async function showPeekVersion( item, index ) {
        const versions = item.versions;
        if ( ! versions?.list || index < -1 || index >= versions.list.length ) {
            return;
        }
        versions.index = index;
        renderPeek();
        if ( index < 0 ) {
            freshen(); // Back to now, which may have been saved meanwhile.
            return;
        }
        if ( shownVersion( item ) ) {
            return;
        }
        const id = versions.list[ index ].id;
        const revision = await apiFetch( { path: '/wp/v2/posts/' + item.id + '/revisions/' + id + '?context=edit&_fields=date_gmt,title,content,excerpt' } ).catch( () => null );
        if ( ! revision || item.versions !== versions ) {
            return;
        }
        versions.cache.set( id, {
            date: revision.date_gmt,
            title: revision.title.raw || htmlToText( revision.title.rendered ),
            html: revision.content.rendered || '',
            raw: revision.content.raw || '',
            excerpt: revision.excerpt?.raw,
        } );
        if ( versions.cache.size > VERSIONS_KEPT ) {
            versions.cache.delete( versions.cache.keys().next().value ); // The one loaded longest ago.
        }
        renderPeek();
    }

    // Brings the version in the sheet back into its note, in the editor, as an edit Undo takes back.
    async function restorePeekVersion() {
        const item = peekItem();
        const version = shownVersion( item );
        if ( ! version ) {
            return;
        }
        const restore = { id: item.id, title: version.title, content: version.raw, excerpt: version.excerpt, date: versionWhen( version.date ) };
        if ( await app.restoreVersion( restore ) ) {
            showPeekVersion( item, -1 );
        }
    }

    // ---- Peek: find

    function openPeekFind() {
        if ( ! peekItem() ) {
            return;
        }
        if ( peek.folded ) {
            peek.folded = false;
            layoutPeek();
            freshen();
        }
        peek.find = peek.find || { query: '', ranges: [], at: 0 };
        el.querySelector( '.wfw-peek__find' ).hidden = false;
        const input = el.querySelector( '.wfw-peek__find input' );
        input.focus();
        input.select();
    }

    function closePeekFind() {
        peek.find = null;
        window.CSS?.highlights?.delete( 'wfw-peek-find' );
        window.CSS?.highlights?.delete( 'wfw-peek-find-current' );
        if ( el ) {
            el.querySelector( '.wfw-peek__find' ).hidden = true;
            el.querySelector( '.wfw-peek__find input' ).value = '';
            el.querySelector( '.wfw-peek__count' ).textContent = '';
        }
    }

    // Finds the matches in the note (up to FIND_MAX) and marks them all.
    function runPeekFind( { scroll = false } = {} ) {
        const find = peek.find;
        if ( ! el || ! find ) {
            return;
        }
        const query = find.query.toLowerCase();
        const ranges = [];
        if ( query ) {
            const walker = document.createTreeWalker( el.querySelector( '.wfw-peek__doc' ), NodeFilter.SHOW_TEXT );
            search: for ( let node = walker.nextNode(); node; node = walker.nextNode() ) {
                const text = node.nodeValue.toLowerCase();
                for ( let from = text.indexOf( query ); from >= 0; from = text.indexOf( query, from + query.length ) ) {
                    const range = document.createRange();
                    range.setStart( node, from );
                    range.setEnd( node, from + query.length );
                    ranges.push( range );
                    if ( ranges.length >= FIND_MAX ) {
                        break search;
                    }
                }
            }
        }
        find.ranges = ranges;
        find.at = clamp( find.at, 0, ranges.length - 1 );
        if ( window.Highlight && window.CSS?.highlights ) {
            CSS.highlights.set( 'wfw-peek-find', new Highlight( ...ranges ) );
        }
        showPeekMatch( { scroll } );
    }

    // The match in view: it stands out, is counted, and is scrolled to. Stepping through matches only does this.
    function showPeekMatch( { scroll = false } = {} ) {
        const find = peek.find;
        const { ranges } = find;
        const now = ranges[ find.at ];
        if ( window.Highlight && window.CSS?.highlights ) {
            CSS.highlights.set( 'wfw-peek-find-current', new Highlight( ...( now ? [ now ] : [] ) ) );
        }
        const total = ranges.length >= FIND_MAX
            /* translators: %d: the most matches Find marks in a note. */
            ? sprintf( __( '%d+', 'wordpress-for-writers' ), FIND_MAX )
            : String( ranges.length );
        el.querySelector( '.wfw-peek__count' ).textContent = ! find.query
            ? ''
            : ranges.length
                /* translators: 1: the match in view, 2: how many matches there are. */
                ? sprintf( __( '%1$d of %2$s', 'wordpress-for-writers' ), find.at + 1, total )
                : __( 'No matches', 'wordpress-for-writers' );
        if ( now && scroll ) {
            const scroller = el.querySelector( '.wfw-peek__scroll' );
            const rect = now.getBoundingClientRect();
            const bounds = scroller.getBoundingClientRect();
            if ( rect.top < bounds.top + 40 || rect.bottom > bounds.bottom - 40 ) {
                scroller.scrollBy( { top: rect.top - bounds.top - bounds.height / 3, behavior: 'smooth' } );
            }
        }
    }

    function stepPeekFind( by ) {
        const find = peek.find;
        if ( find?.ranges.length ) {
            find.at = ( find.at + by + find.ranges.length ) % find.ranges.length;
            showPeekMatch( { scroll: true } );
        }
    }

    // ---- Peek: where the sheet sits

    function peekBounds() {
        const rect = root.querySelector( '.wfw-editor' ).getBoundingClientRect();
        return { W: rect.width, H: rect.height, left: rect.left, top: rect.top };
    }

    // Beside the editor when the pane is wide, under it when it's narrow or tall; phones only have under.
    function peekDock( { W, H } = peekBounds() ) {
        if ( phoneLayout.matches ) {
            return 'bottom';
        }
        return peek.dock || ( W < 760 || H > W * 1.1 ? 'bottom' : 'right' );
    }

    /*
     * The sheet's box for a dock, in the editor pane's own pixels, and how much
     * of the pane it takes from the editor (`push`): beside the editor while
     * the editor keeps a comfortable width, over it when it wouldn't.
     */
    function peekGeometry( dock, bounds = peekBounds() ) {
        const { W, H } = bounds;
        if ( dock === 'bottom' ) {
            const height = peek.folded ? PEEK_STRIP : Math.round( clamp( H * peek.bottom, 160, H - PEEK_TOP ) );
            return { left: 0, top: H - height, width: W, height, push: Math.min( height, Math.round( H * 0.6 ) ) };
        }
        if ( peek.folded ) {
            return { left: dock === 'left' ? 0 : W - PEEK_RAIL, top: 0, width: PEEK_RAIL, height: H, push: PEEK_RAIL };
        }
        const width = Math.round( clamp( W * peek.side, 300, W - 80 ) );
        return { left: dock === 'left' ? 0 : W - width, top: 0, width, height: H, push: W - width >= 420 ? width : 0 };
    }

    // The same box, slid out past its edge: where the sheet comes from and goes to.
    function peekOffstage( dock, box, { W, H } ) {
        return dock === 'bottom' ? { ...box, top: H } : { ...box, left: dock === 'left' ? -box.width : W };
    }

    function place( target, box ) {
        Object.assign( target.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' } );
    }

    // Placed at once, without easing (a reflow in between, so the next change eases from here).
    function placeStill( box, transform = '' ) {
        el.classList.add( 'is-still' );
        place( el, box );
        el.style.transform = transform;
        el.getBoundingClientRect();
        el.classList.remove( 'is-still' );
    }

    /*
     * The sheet moves by transform only, which the browser animates without
     * laying the note out again on every frame. Between two boxes on the same
     * edge it is laid out once at the larger of them (`cover`), slides, and
     * takes its final size when it has arrived.
     */
    function cover( a, b, dock, { W, H } ) {
        if ( dock === 'bottom' ) {
            const height = Math.max( a.height, b.height );
            return { left: 0, top: H - height, width: W, height };
        }
        const width = Math.max( a.width, b.width );
        return { left: dock === 'left' ? 0 : W - width, top: 0, width, height: H };
    }

    // How far the cover box is moved to show `box`: down, or toward the edge it is docked on.
    function offset( box, big, dock ) {
        if ( dock === 'bottom' ) {
            return `translate3d( 0, ${ box.top - big.top }px, 0 )`;
        }
        const dx = dock === 'left' ? box.left + box.width - big.left - big.width : box.left - big.left;
        return `translate3d( ${ dx }px, 0, 0 )`;
    }

    // Finishes a slide under way at once: the sheet takes its final box.
    function settle() {
        clearTimeout( settleTimer );
        const then = settleThen;
        settleThen = null;
        if ( then ) {
            then();
        }
    }

    function slide( from, to, dock, bounds, then = null ) {
        settle();
        const big = cover( from, to, dock, bounds );
        placeStill( big, offset( from, big, dock ) );
        el.style.transform = offset( to, big, dock );
        settleThen = () => {
            placeStill( to );
            if ( then ) {
                then();
            }
        };
        settleTimer = setTimeout( settle, PEEK_EASE );
    }

    // From somewhere else (where it was let go after being carried) into its box: a move, and its size at once.
    function flip( from, to ) {
        settle();
        placeStill( to, `translate3d( ${ from.left - to.left }px, ${ from.top - to.top }px, 0 )` );
        el.style.transform = '';
    }

    // The editor gives way under the sheet (app.css's inset): after the sheet has slid over it when it grows, at once when it shrinks.
    function setPeekPush( px, dock ) {
        const apply = () => {
            peekPush = { dock, px };
            const editor = root.querySelector( '.wfw-editor' );
            DOCKS.forEach( ( side ) => editor.style.setProperty( '--wfw-editor-inset-' + side, side === dock && px ? px + 'px' : '0px' ) );
        };
        clearTimeout( peekPushTimer );
        if ( px > 0 && ( px > peekPush.px || dock !== peekPush.dock ) ) {
            peekPushTimer = setTimeout( apply, PEEK_EASE );
        } else if ( px !== peekPush.px || dock !== peekPush.dock ) {
            apply();
        }
    }

    function layoutPeek( { animate = true } = {} ) {
        if ( ! el ) {
            return;
        }
        const open = peek.items.length > 0 && ! app.panel();
        if ( ! open && ! shown ) {
            return; // Nothing to place, and nothing to take away.
        }
        const bounds = peekBounds();
        const dock = peekDock( bounds );
        const box = peekGeometry( dock, bounds );
        const fold = el.querySelector( '[data-action="peek-fold"]' );
        setLabel( fold, peek.folded ? __( 'Bring back', 'wordpress-for-writers' ) : __( 'Put away', 'wordpress-for-writers' ) );
        fold.setAttribute( 'aria-expanded', String( ! peek.folded ) );
        el.classList.toggle( 'is-over', box.push < ( dock === 'bottom' ? box.height : box.width ) );
        if ( ! open ) {
            // Goes back out past its edge.
            const { box: last, dock: edge } = shown;
            shown = null;
            slide( last, peekOffstage( edge || dock, last, bounds ), edge || dock, bounds, () => ( el.hidden = true ) );
            setPeekPush( 0, dock );
            return;
        }
        if ( ! bounds.W || ! bounds.H ) {
            return; // The pane is out of the layout (a phone showing the list).
        }
        // Its look for the dock and fold. Folding away, the sheet keeps its full look while it slides, and folds when it's there.
        const look = () => {
            DOCKS.forEach( ( d ) => el.classList.toggle( 'is-' + d, d === dock ) );
            el.classList.toggle( 'is-folded', peek.folded );
        };
        const foldsAway = peek.folded && ! el.classList.contains( 'is-folded' ) && shown?.dock === dock;
        if ( ! foldsAway ) {
            look();
        }
        if ( ! shown ) {
            // Comes in from its edge.
            el.hidden = false;
            renderPeek();
            slide( peekOffstage( dock, box, bounds ), box, dock, bounds );
        } else if ( ! animate ) {
            settle();
            placeStill( box );
        } else if ( shown.dock !== dock ) {
            flip( shown.box, box );
        } else {
            slide( shown.box, box, dock, bounds, foldsAway ? look : null );
        }
        shown = { box, dock };
        setPeekPush( box.push, dock );
    }

    // The header moves the sheet (or, on phones, pulls it up and down); the inner edge resizes it.
    function initPeek() {
        const editor = root.querySelector( '.wfw-editor' );
        editor.insertAdjacentHTML( 'beforeend', peekShellHtml() );
        el = editor.querySelector( '.wfw-peek' );
        // The menu is at the app's root, like its other menus: over the panes, and out of the sheet's own keys.
        root.insertAdjacentHTML( 'beforeend', `<div class="wfw-menu wfw-menu--peek" id="wfw-peek-menu" role="menu" aria-label="${ esc( __( 'Peek', 'wordpress-for-writers' ) ) }" tabindex="-1" hidden></div>` );
        menuEl = root.querySelector( '#wfw-peek-menu' );
        const drop = editor.querySelector( '.wfw-peek-drop' );
        let drag = null;

        const begin = ( event, mode ) => {
            if ( event.button || event.target.closest( 'button:not( .wfw-peek__tab ), input' ) ) {
                return;
            }
            // Nothing of the browser's own starts with it: no text selection, no drag of what's under the pointer.
            event.preventDefault();
            event.stopPropagation();
            try {
                event.currentTarget.setPointerCapture( event.pointerId );
            } catch ( e ) {}
            settle();
            const bounds = peekBounds();
            const dock = peekDock( bounds );
            drag = { mode, dock, bounds, frame: 0, next: null, x: event.clientX, y: event.clientY, box: peekGeometry( dock, bounds ), moved: false, to: dock, size: 0, speed: 0, lastY: event.clientY, lastTime: event.timeStamp };
        };

        const move = ( event ) => {
            if ( ! drag ) {
                return;
            }
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if ( ! drag.moved ) {
                if ( Math.hypot( dx, dy ) < 6 ) {
                    return;
                }
                drag.moved = true;
                root.classList.add( 'is-peek-dragging' );
                if ( drag.mode === 'size' && drag.dock !== 'bottom' ) {
                    // Its text keeps the width it had while the edge moves, and wraps again once, when let go.
                    inner.style.width = el.offsetWidth + 'px';
                    el.classList.add( 'is-sizing' );
                }
                // Under the editor, pulling the header up or down is a resize; carrying it off sideways moves it.
                if ( drag.mode === 'move' && drag.dock === 'bottom' && Math.abs( dy ) > Math.abs( dx ) * 1.2 ) {
                    drag.mode = 'size';
                }
            }
            const { W, H } = drag.bounds;
            if ( drag.mode === 'move' ) {
                // The sheet follows the pointer; a tint shows where it would dock.
                el.style.transform = `translate( ${ dx }px, ${ dy }px )`;
                const x = ( event.clientX - drag.bounds.left ) / W;
                const y = ( event.clientY - drag.bounds.top ) / H;
                drag.to = y > 0.66 ? 'bottom' : x < 0.5 ? 'left' : 'right';
                place( drop, peekGeometry( drag.to, drag.bounds ) );
                drop.hidden = drag.to === drag.dock;
                return;
            }
            if ( drag.dock === 'bottom' ) {
                const dt = event.timeStamp - drag.lastTime;
                if ( dt > 0 ) {
                    drag.speed = ( event.clientY - drag.lastY ) / dt;
                    drag.lastY = event.clientY;
                    drag.lastTime = event.timeStamp;
                }
                drag.size = clamp( drag.box.height - dy, PEEK_STRIP, H - PEEK_TOP );
                drag.next = { ...drag.box, top: H - drag.size, height: drag.size };
            } else {
                drag.size = clamp( drag.box.width + ( drag.dock === 'left' ? dx : -dx ), PEEK_RAIL, W - 80 );
                drag.next = { ...drag.box, left: drag.dock === 'left' ? 0 : W - drag.size, width: drag.size };
            }
            // Pointer events can come faster than frames: the sheet is placed once a frame.
            if ( ! drag.frame ) {
                const sizing = drag;
                sizing.frame = requestAnimationFrame( () => {
                    sizing.frame = 0;
                    place( el, sizing.next );
                } );
            }
        };

        const end = ( event ) => {
            if ( ! drag ) {
                return;
            }
            const done = drag;
            drag = null;
            drop.hidden = true;
            cancelAnimationFrame( done.frame );
            const { W, H } = done.bounds;
            if ( ! done.moved ) {
                if ( event.type !== 'pointerup' || done.mode === 'size' && ! event.target.closest( '.wfw-peek__head' ) ) {
                    return;
                }
                // A tap on another note's tab shows it (the header holds the pointer, so the tab gets no click
                // of its own); anywhere else on the header it folds the sheet away, or brings it back.
                const tab = document.elementFromPoint( event.clientX, event.clientY )?.closest( '.wfw-peek__tab:not( .is-active )' );
                onPeekAction( tab ? 'peek-tab' : 'peek-fold', tab );
                return;
            }
            if ( done.mode === 'move' ) {
                // Let go where it is, then settle into the dock.
                const rect = el.getBoundingClientRect();
                shown = { box: { left: rect.left - done.bounds.left, top: rect.top - done.bounds.top, width: rect.width, height: rect.height }, dock: null };
                peek.dock = done.to;
                peek.folded = false;
            } else {
                // Its text wraps to the new width once, here; it slides on from where it was let go.
                inner.style.width = '';
                el.classList.remove( 'is-sizing' );
                if ( done.next ) {
                    placeStill( done.next );
                    shown = { box: done.next, dock: done.dock };
                }
                if ( done.dock === 'bottom' ) {
                    // A flick carries it on: down folds it, up opens it all the way.
                    const aim = done.size - done.speed * 220;
                    peek.folded = aim < 120;
                    if ( ! peek.folded ) {
                        peek.bottom = aim > H * 0.82 ? 1 : Math.max( 0.2, aim / H );
                    }
                } else {
                    // Dragged down to almost nothing, it is put away.
                    peek.folded = done.size < 200;
                    if ( ! peek.folded ) {
                        peek.side = clamp( done.size / W, 0.2, 0.8 );
                    }
                }
            }
            root.classList.remove( 'is-peek-dragging' );
            savePeek();
            layoutPeek();
            freshen();
        };

        const head = el.querySelector( '.wfw-peek__head' );
        const grip = el.querySelector( '.wfw-peek__grip' );
        const inner = el.querySelector( '.wfw-peek__inner' );
        head.addEventListener( 'pointerdown', ( event ) => begin( event, phoneLayout.matches ? 'size' : 'move' ) );
        grip.addEventListener( 'pointerdown', ( event ) => begin( event, 'size' ) );
        [ head, grip ].forEach( ( part ) => {
            part.addEventListener( 'pointermove', move );
            part.addEventListener( 'pointerup', end );
            part.addEventListener( 'pointercancel', end );
        } );
        // Double-click the edge: back to where the pane would put the sheet, at its usual size.
        grip.addEventListener( 'dblclick', () => {
            peek.dock = null;
            peek.side = SIDE;
            peek.bottom = BOTTOM;
            savePeek();
            layoutPeek();
        } );

        // The note is searched once typing pauses; Enter searches at once, so it never steps through stale matches.
        const input = el.querySelector( '.wfw-peek__find input' );
        let findTimer = 0;
        const search = () => {
            clearTimeout( findTimer );
            findTimer = 0;
            if ( peek.find && peek.find.query !== input.value ) {
                peek.find.query = input.value;
                peek.find.at = 0;
                runPeekFind( { scroll: true } );
            }
        };
        input.addEventListener( 'input', () => {
            clearTimeout( findTimer );
            findTimer = setTimeout( search, FIND_WAIT );
        } );
        el.addEventListener( 'keydown', ( event ) => {
            if ( ( event.metaKey || event.ctrlKey ) && ! event.altKey && event.key.toLowerCase() === 'f' ) {
                event.preventDefault();
                openPeekFind();
            } else if ( ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) && ! event.altKey && event.target.closest( '.wfw-peek__switch' ) ) {
                event.preventDefault();
                openPeekMenu( { keyboard: true } );
            } else if ( event.key === 'Enter' && event.target === input ) {
                event.preventDefault();
                if ( findTimer ) {
                    search();
                } else {
                    stepPeekFind( event.shiftKey ? -1 : 1 );
                }
            } else if ( event.key === 'Escape' ) {
                event.preventDefault();
                event.stopPropagation();
                if ( peek.find ) {
                    closePeekFind();
                    el.querySelector( '.wfw-peek__scroll' ).focus( { preventScroll: true } );
                } else {
                    closePeek();
                    app.focusEditor();
                }
            } else if ( event.altKey && ( event.key === 'ArrowUp' || event.key === 'ArrowDown' ) && peekItem()?.versions ) {
                event.preventDefault();
                showPeekVersion( peekItem(), peekItem().versions.index + ( event.key === 'ArrowDown' ? 1 : -1 ) );
            }
        } );

        // The pane changes size with the window, the sidebar and the phone's keyboard: once a frame at most.
        let frame = 0;
        const relayout = () => {
            if ( ! frame && ( peek.items.length || ! el.hidden ) ) {
                frame = requestAnimationFrame( () => {
                    frame = 0;
                    layoutPeek( { animate: false } );
                } );
            }
        };
        new ResizeObserver( relayout ).observe( editor );
        // The tabs' room changes with the sheet's width; the menu goes with a click or a tap elsewhere,
        // with the window's focus (a click into the editor's frame) and with its size.
        new ResizeObserver( fitPeekTabs ).observe( el.querySelector( '.wfw-peek__tabs' ) );
        document.addEventListener( 'pointerdown', ( event ) => {
            if ( peekMenuOpen && ! event.target.closest( '.wfw-peek__switch, .wfw-menu--peek' ) ) {
                closePeekMenu( false );
            }
        } );
        window.addEventListener( 'blur', () => closePeekMenu( false ) );
        window.addEventListener( 'resize', () => closePeekMenu( false ) );
        // The arrows, Home, End and Space are the app's, for every menu; closing is the menu's own.
        menuEl.addEventListener( 'keydown', ( event ) => {
            if ( event.key === 'Escape' || event.key === 'Tab' ) {
                if ( event.key === 'Escape' ) {
                    event.preventDefault();
                }
                event.stopPropagation();
                closePeekMenu();
            }
        } );
        phoneLayout.addEventListener( 'change', relayout );
        // Notes pinned on an earlier visit.
        if ( peekItem() ) {
            loadBlockStyles();
            loadTitles();
            layoutPeek();
            freshen();
        }
    }

    // What a click in or about the sheet does: from onClick (with its event), the header's taps and the command palette.
    function onPeekAction( action, target, event ) {
        const item = peekItem();
        if ( action !== 'peek-switch' ) {
            // Anything else done in the app puts the menu away; a note picked from it by keyboard leaves focus on its button.
            closePeekMenu( action === 'peek-tab' && menuEl.contains( document.activeElement ) );
        }
        switch ( action ) {
            case 'peek-switch':
                if ( peekMenuOpen ) {
                    closePeekMenu();
                } else {
                    openPeekMenu( { keyboard: event?.detail === 0 } );
                }
                break;
            case 'peek-pick':
                app.pickPeek();
                break;
            case 'peek-this-versions':
                if ( app.current()?.id ) {
                    peekNote( app.current().id, { versions: true } );
                }
                break;
            case 'peek-tab': {
                const index = Number( target.dataset.index );
                if ( index !== peek.at && peek.items[ index ] ) {
                    peek.at = index;
                    closePeekFind();
                    savePeek();
                    renderPeek();
                    freshen();
                }
                break;
            }
            case 'peek-close':
                closePeek();
                break;
            case 'peek-fold':
                peek.folded = ! peek.folded;
                layoutPeek();
                freshen();
                break;
            case 'peek-swap':
                swapPeek();
                break;
            case 'peek-pin':
                togglePeekPin();
                break;
            case 'peek-find':
                if ( peek.find ) {
                    closePeekFind();
                } else {
                    openPeekFind();
                }
                break;
            case 'peek-find-prev':
            case 'peek-find-next':
                stepPeekFind( action === 'peek-find-next' ? 1 : -1 );
                break;
            case 'peek-versions':
                togglePeekVersions();
                break;
            case 'peek-older':
            case 'peek-newer':
                if ( item?.versions ) {
                    showPeekVersion( item, item.versions.index + ( action === 'peek-older' ? 1 : -1 ) );
                }
                break;
            case 'peek-restore':
                restorePeekVersion();
                break;
            default:
                return false;
        }
        return true;
    }

    // A save is a new version, and new text: the note is marked in every sheet, and only the one in front loads it now.
    function onNoteSavedForPeek( id ) {
        const sheets = [ peek, noTabPeeks.peeks, ...app.tabs().map( ( tab ) => tab.peeks ) ];
        sheets.forEach( ( sheet ) => sheet?.items.filter( ( item ) => item.id === id ).forEach( ( item ) => {
            item.stale = true;
            if ( item.versions ) {
                item.versions.stale = true;
            }
        } ) );
        // Autosaves of the note being written come every pause in typing: the sheet catches up with them now and then.
        if ( ! el.hidden && ! savedRefreshTimer ) {
            savedRefreshTimer = setTimeout( () => {
                savedRefreshTimer = 0;
                savedRefreshAt = Date.now();
                freshen();
            }, Math.max( 0, savedRefreshAt + SAVED_REFRESH - Date.now() ) );
        }
    }

    // The keyboard leaves room for one note, the one being written: the sheet folds away under it.
    function onKeyboardForPeek( up ) {
        if ( ! peek.items.length || peekDock() !== 'bottom' ) {
            return;
        }
        if ( up && ! peek.folded && ! el.contains( document.activeElement ) ) {
            peek.folded = true;
            peekFoldedByKeyboard = true;
            layoutPeek();
        } else if ( ! up && peekFoldedByKeyboard ) {
            peekFoldedByKeyboard = false;
            peek.folded = false;
            layoutPeek();
            freshen();
        }
    }

    // ---- What the app sees of it

    // The tab in view changed (`from` to `to`), or the pane did (a panel opened or closed): the sheet follows.
    function paneChanged( from, to ) {
        closePeekMenu( false );
        switchPeeks( from, to );
        layoutPeek();
        renderPeek(); // Swapping is with the note in the editor, which may have changed.
    }

    // A tab's own peeks, as they are kept with the tab across reloads: { peeks: [ ids ], at }, or null.
    function savedPeeks( tab ) {
        const mine = tab === app.current();
        // Its own: the pinned ones are everyone's, and kept apart.
        const own = mine ? ownPeeks() : tab.peeks?.items || [];
        const at = mine ? Math.max( 0, own.indexOf( peekItem() ) ) : tab.peeks?.at || 0;
        return own.length ? { peeks: own.map( ( item ) => item.id ), at } : null;
    }

    // Gives a tab back the sheet savedPeeks() kept for it.
    function restorePeeks( tab, saved ) {
        const ids = peekIds( saved?.peeks );
        if ( ids.length ) {
            tab.peeks = { items: ids.map( ( id ) => newPeekItem( id ) ), at: clamp( Number( saved.at ) || 0, 0, ids.length - 1 ), folded: false };
        }
    }

    // A note that is gone (trashed, deleted) leaves every sheet.
    function forgetPeeks( id ) {
        peek.items.filter( ( item ) => item.id === id ).forEach( ( item ) => closePeek( peek.items.indexOf( item ) ) );
        app.tabs().forEach( ( tab ) => {
            if ( tab.peeks ) {
                tab.peeks.items = tab.peeks.items.filter( ( item ) => item.id !== id );
                tab.peeks.at = clamp( tab.peeks.at, 0, tab.peeks.items.length - 1 );
            }
        } );
    }

    return {
        init: initPeek, // once the app's shell is in the page
        open: peekNote, // ( id, { versions } )
        closeAll: closeAllPeeks,
        isOpen: () => peek.items.length > 0,
        action: onPeekAction, // ( data-action, element, click ): true when it was the sheet's
        paneChanged, // ( from, to ): the tab in view changed, or a panel opened or closed
        noteSaved: onNoteSavedForPeek, // ( id )
        keyboard: onKeyboardForPeek, // ( up ): the on-screen keyboard came or went
        saved: savedPeeks,
        restore: restorePeeks,
        forget: forgetPeeks,
    };
};
