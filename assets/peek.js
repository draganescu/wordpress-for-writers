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
 * of anything that runs), in the editor's typography. It is the app's own
 * markup rather than another editor, so it opens at once.
 *
 * This file is the whole feature (its styles are peek.css). app.js creates
 * it once with window.wfwPeek( app ) and talks to it only through what that
 * returns (at the end of the file). What it needs of the app, `app`:
 *
 *   root, esc, icon, loadPref, savePref, htmlToText, phoneLayout
 *                        the app's element and helpers
 *   current()            the tab in view ({ id, title, peeks, ... }) or null
 *   tabs()               every open tab
 *   panel()              whether a panel has the editor pane to itself
 *   titleOf( id )        a note's title, when the app already knows it
 *   saveTabs()           saves the tabs (and, through saved(), their sheets)
 *   replaceNote( id, title )   puts another note in the tab in view; resolves to whether it did
 *   restoreVersion( { id, title, content, excerpt, date } )
 *                        applies a past version in the note's editor; resolves to whether it could
 *   pickPeek()           opens the command palette asking which note to peek at
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
    const peekSaved = loadPref( 'peek', {} ) || {};
    const peek = {
        // { id, title, html, loading, failed, pinned, versions: null | { list, index }, version }; the pinned ones first.
        items: ( Array.isArray( peekSaved.pins ) ? peekSaved.pins : [] ).map( Number ).filter( ( id ) => id > 0 ).slice( 0, PEEK_MAX ).map( ( id ) => ( { ...newPeekItem( id ), pinned: true } ) ),
        at: 0,
        dock: [ 'right', 'left', 'bottom' ].includes( peekSaved.dock ) ? peekSaved.dock : null, // null: wherever there is room
        side: Math.min( 0.8, Math.max( 0.2, Number( peekSaved.side ) || 0.42 ) ),
        bottom: Math.min( 1, Math.max( 0.2, Number( peekSaved.bottom ) || 0.5 ) ),
        folded: false,
        shown: false,
        find: null, // { query, ranges, at }
    };
    let peekPush = { dock: '', px: 0 };
    let peekPushTimer = 0;
    let peekHideTimer = 0;
    let peekFoldedByKeyboard = false;

    function peekEl() {
        return root.querySelector( '.wfw-peek' );
    }

    function peekItem() {
        return peek.items[ peek.at ] || null;
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
        const pinned = peek.items.filter( ( item ) => item.pinned );
        const own = peek.items.filter( ( item ) => ! item.pinned );
        const next = ( to || noTabPeeks ).peeks;
        if ( ! from && to && ! next?.items.length ) {
            noTabPeeks.peeks = null;
            return; // The sheet that was open with no tab stays, now this tab's.
        }
        ( from || noTabPeeks ).peeks = { items: own, at: Math.max( 0, own.indexOf( shown ) ), folded: peek.folded };
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
        loadUnreadPeeks( shown?.pinned ? null : peekItem() );
    }

    // Notes that came back with a tab or a reload have no title or text yet; `again` is loaded
    // either way, as it may have been saved since it was last in view.
    function loadUnreadPeeks( again = null ) {
        peek.items.filter( ( item ) => item === again || ! item.html && ! item.failed ).forEach( loadPeek );
    }

    // Keeps the note in the sheet across tabs, or hands it back to this tab alone.
    function togglePeekPin() {
        const item = peekItem();
        if ( ! item ) {
            return;
        }
        item.pinned = ! item.pinned;
        peek.items = [ ...peek.items.filter( ( other ) => other.pinned ), ...peek.items.filter( ( other ) => ! other.pinned ) ];
        peek.at = peek.items.indexOf( item );
        savePeek();
        renderPeek();
    }

    function newPeekItem( id, title = '' ) {
        return { id, title, html: '', loading: true, failed: false, versions: null, version: null };
    }

    function peekShellHtml() {
        const t = ( text ) => esc( text );
        const tool = ( action, name, label, extra = '' ) => `<button class="wfw-icon-btn" data-action="${ action }" title="${ t( label ) }" aria-label="${ t( label ) }"${ extra }>${ icon( name ) }</button>`;
        return `
            <aside class="wfw-peek" aria-label="${ t( __( 'Peek', 'wordpress-for-writers' ) ) }" hidden>
                <div class="wfw-peek__grip" aria-hidden="true"></div>
                <div class="wfw-peek__inner">
                <header class="wfw-peek__head">
                    <span class="wfw-peek__handle" aria-hidden="true"></span>
                    <div class="wfw-peek__tabs" role="tablist"></div>
                    <div class="wfw-peek__tools">
                        ${ tool( 'peek-find', 'search', __( 'Find in this note', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-versions', 'versions', __( 'Past versions', 'wordpress-for-writers' ), ' aria-pressed="false"' ) }
                        ${ tool( 'peek-swap', 'swap', __( 'Swap with the note in the editor', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-pin', 'pin', __( 'Keep in every tab', 'wordpress-for-writers' ), ' aria-pressed="false"' ) }
                        ${ tool( 'peek-fold', 'forward', __( 'Put away', 'wordpress-for-writers' ) ) }
                        ${ tool( 'peek-close', 'close', __( 'Close', 'wordpress-for-writers' ) ) }
                    </div>
                </header>
                <div class="wfw-peek__bar wfw-peek__find" hidden>
                    <input type="search" placeholder="${ t( __( 'Find', 'wordpress-for-writers' ) ) }" aria-label="${ t( __( 'Find in this note', 'wordpress-for-writers' ) ) }" autocomplete="off" spellcheck="false" />
                    <span class="wfw-peek__count" aria-live="polite"></span>
                    ${ tool( 'peek-find-prev', 'back', __( 'Previous match', 'wordpress-for-writers' ) ) }
                    ${ tool( 'peek-find-next', 'forward', __( 'Next match', 'wordpress-for-writers' ) ) }
                </div>
                <div class="wfw-peek__bar wfw-peek__versions" hidden>
                    ${ tool( 'peek-older', 'back', __( 'Older version', 'wordpress-for-writers' ) ) }
                    <span class="wfw-peek__when" aria-live="polite"></span>
                    ${ tool( 'peek-newer', 'forward', __( 'Newer version', 'wordpress-for-writers' ) ) }
                    <button class="wfw-peek__restore" data-action="peek-restore">${ t( __( 'Restore', 'wordpress-for-writers' ) ) }</button>
                </div>
                <div class="wfw-peek__scroll" tabindex="-1">
                    <article class="wfw-peek__doc"><h1 class="wfw-peek__title"></h1><div class="wfw-peek__body"></div></article>
                </div>
                </div>
            </aside>
            <div class="wfw-peek-drop" aria-hidden="true" hidden></div>`;
    }

    // The site's rendered content, minus anything that runs or posts: it is only read here.
    function peekFragment( html ) {
        const doc = new DOMParser().parseFromString( '<body>' + ( html || '' ) + '</body>', 'text/html' );
        doc.querySelectorAll( 'script, style, link, meta, base, object, embed, iframe, form, input, button, textarea, select' ).forEach( ( el ) => el.remove() );
        doc.querySelectorAll( '*' ).forEach( ( el ) => {
            [ ...el.attributes ].forEach( ( attr ) => {
                const name = attr.name.toLowerCase();
                if ( name.startsWith( 'on' ) || name === 'srcdoc' || name === 'contenteditable' || name === 'style' && /expression|url\s*\(/i.test( attr.value ) ) {
                    el.removeAttribute( attr.name );
                } else if ( [ 'href', 'src', 'action', 'formaction', 'xlink:href' ].includes( name ) && /^\s*(javascript|data|vbscript):/i.test( attr.value ) && ! /^\s*data:image\//i.test( attr.value ) ) {
                    el.removeAttribute( attr.name );
                }
            } );
            if ( el.tagName === 'A' ) {
                el.setAttribute( 'target', '_blank' );
                el.setAttribute( 'rel', 'noopener' );
            }
        } );
        const fragment = document.createDocumentFragment();
        [ ...doc.body.childNodes ].forEach( ( node ) => fragment.appendChild( document.importNode( node, true ) ) );
        return fragment;
    }

    // "Today, 21:10", "Yesterday, 08:40", "Wed 11 Nov, 22:15": when a version was saved.
    function versionWhen( gmt ) {
        const date = new Date( gmt + 'Z' );
        const time = date.toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit' } );
        const days = Math.round( ( new Date().setHours( 0, 0, 0, 0 ) - new Date( date ).setHours( 0, 0, 0, 0 ) ) / 86400000 );
        if ( days === 0 ) {
            /* translators: %s: a time of day. */
            return sprintf( __( 'Today, %s', 'wordpress-for-writers' ), time );
        }
        if ( days === 1 ) {
            /* translators: %s: a time of day. */
            return sprintf( __( 'Yesterday, %s', 'wordpress-for-writers' ), time );
        }
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        if ( date.getFullYear() !== new Date().getFullYear() ) {
            options.year = 'numeric';
        }
        return date.toLocaleDateString( [], options ) + ', ' + time;
    }

    async function loadPeek( item ) {
        item.loading = ! item.html;
        item.failed = false;
        renderPeek();
        const id = item.id;
        try {
            const note = await apiFetch( { path: '/wp/v2/posts/' + id + '?context=edit&_fields=id,title,content,status' } );
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

    function renderPeek() {
        const box = peekEl();
        const item = peekItem();
        if ( ! box || ! item ) {
            return;
        }
        const untitled = __( 'Untitled', 'wordpress-for-writers' );
        box.querySelector( '.wfw-peek__tabs' ).innerHTML = peek.items.map( ( other, i ) => `<button class="wfw-peek__tab${ i === peek.at ? ' is-active' : '' }${ other.pinned ? ' is-pinned' : '' }" role="tab" aria-selected="${ i === peek.at }" data-action="peek-tab" data-index="${ i }">${ esc( other.title || untitled ) }</button>` ).join( '' );
        const version = item.versions && item.versions.index >= 0 ? item.version : null;
        const title = box.querySelector( '.wfw-peek__title' );
        const body = box.querySelector( '.wfw-peek__body' );
        const shown = version ? version.title : item.title;
        title.textContent = shown || untitled;
        title.classList.toggle( 'is-empty', ! shown );
        body.replaceChildren();
        if ( item.failed ) {
            body.innerHTML = `<p class="wfw-peek__note">${ esc( __( 'This note couldn’t be loaded.', 'wordpress-for-writers' ) ) }</p>`;
        } else if ( item.loading || ( item.versions && item.versions.index >= 0 && ! version ) ) {
            body.innerHTML = '<div class="wfw-peek__loading"><span></span><span></span><span></span></div>';
        } else {
            body.appendChild( peekFragment( version ? version.html : item.html ) );
        }
        // Its tools: past versions, and swapping (not with itself).
        const versions = box.querySelector( '.wfw-peek__versions' );
        versions.hidden = ! item.versions;
        box.querySelector( '[data-action="peek-versions"]' ).setAttribute( 'aria-pressed', item.versions ? 'true' : 'false' );
        box.querySelector( '[data-action="peek-swap"]' ).disabled = ! app.current() || app.current().id === item.id || !! app.panel();
        const pin = box.querySelector( '[data-action="peek-pin"]' );
        const pinLabel = item.pinned ? __( 'Keep in this tab only', 'wordpress-for-writers' ) : __( 'Keep in every tab', 'wordpress-for-writers' );
        pin.setAttribute( 'aria-pressed', item.pinned ? 'true' : 'false' );
        pin.title = pinLabel;
        pin.setAttribute( 'aria-label', pinLabel );
        if ( item.versions ) {
            const { list, index } = item.versions;
            const when = versions.querySelector( '.wfw-peek__when' );
            when.textContent = ! list
                ? __( 'Loading versions…', 'wordpress-for-writers' )
                : index < 0
                    ? ( list.length ? __( 'Now', 'wordpress-for-writers' ) : __( 'No earlier versions yet', 'wordpress-for-writers' ) )
                    : versionWhen( list[ index ].date_gmt );
            versions.querySelector( '[data-action="peek-older"]' ).disabled = ! list || index >= list.length - 1;
            versions.querySelector( '[data-action="peek-newer"]' ).disabled = ! list || index < 0;
            versions.querySelector( '.wfw-peek__restore' ).disabled = ! version;
        }
        runPeekFind();
    }

    // Opens a note in the sheet, or brings it forward if it's there already.
    function peekNote( id, { versions = false } = {} ) {
        if ( ! id ) {
            return;
        }
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
        loadPeek( item );
        if ( versions && ! item.versions ) {
            togglePeekVersions();
        }
        root.classList.add( 'has-note' ); // On phones the editor pane, and the sheet with it, shows in place of the list.
        root.classList.remove( 'is-sidebar-open' );
        savePeek();
        layoutPeek();
    }

    function closePeek( index = peek.at ) {
        if ( index < 0 || index >= peek.items.length ) {
            return;
        }
        peek.items.splice( index, 1 );
        peek.at = Math.max( 0, Math.min( peek.at > index ? peek.at - 1 : peek.at, peek.items.length - 1 ) );
        closePeekFind();
        savePeek();
        if ( peek.items.length ) {
            renderPeek();
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
        peekEl().classList.add( 'is-swapping' );
        setTimeout( () => peekEl()?.classList.remove( 'is-swapping' ), PEEK_EASE );
        // In this tab, whose sheet it is, even when the note has a tab of its own elsewhere.
        if ( ! ( await app.replaceNote( item.id, item.title ) ) ) {
            return; // The writer kept the note in the editor (unsaved changes to a published note).
        }
        if ( leavingId ) {
            // The pin was the other note's: the one now in the sheet is this tab's.
            Object.assign( item, { id: leavingId, title: leavingTitle, html: '', versions: null, version: null, pinned: false } );
            peek.items = [ ...peek.items.filter( ( other ) => other.pinned ), ...peek.items.filter( ( other ) => ! other.pinned ) ];
            // A note in the sheet twice is one too many.
            peek.items = peek.items.filter( ( other ) => other === item || other.id !== leavingId );
            peek.at = peek.items.indexOf( item );
            closePeekFind();
            savePeek();
            loadPeek( item );
        } else {
            closePeek( peek.items.indexOf( item ) );
        }
    }

    // ---- Peek: past versions

    function togglePeekVersions() {
        const item = peekItem();
        if ( ! item ) {
            return;
        }
        if ( item.versions ) {
            item.versions = null;
            item.version = null;
            renderPeek();
            return;
        }
        item.versions = { list: null, index: -1, cache: {} };
        renderPeek();
        loadPeekVersions( item, { step: true } );
    }

    // The note's saved versions, newest first. `step` opens on the one before the last save.
    async function loadPeekVersions( item, { step = false } = {} ) {
        const versions = item.versions;
        const kept = versions.list && versions.index >= 0 ? versions.list[ versions.index ].id : 0;
        const list = await apiFetch( { path: '/wp/v2/posts/' + item.id + '/revisions?context=edit&per_page=100&_fields=id,date_gmt' } ).catch( () => [] );
        if ( item.versions !== versions ) {
            return;
        }
        versions.list = list;
        if ( step ) {
            showPeekVersion( item, Math.min( 1, list.length - 1 ) );
        } else {
            versions.index = kept ? list.findIndex( ( v ) => v.id === kept ) : -1;
            renderPeek();
        }
    }

    async function showPeekVersion( item, index ) {
        const versions = item.versions;
        if ( ! versions?.list || index < -1 || index >= versions.list.length ) {
            return;
        }
        versions.index = index;
        item.version = index < 0 ? null : versions.cache[ versions.list[ index ].id ] || null;
        renderPeek();
        if ( index < 0 || item.version ) {
            return;
        }
        const id = versions.list[ index ].id;
        const revision = await apiFetch( { path: '/wp/v2/posts/' + item.id + '/revisions/' + id + '?context=edit&_fields=id,date_gmt,title,content,excerpt' } ).catch( () => null );
        if ( ! revision || item.versions !== versions ) {
            return;
        }
        versions.cache[ id ] = {
            id,
            date: revision.date_gmt,
            title: revision.title.raw || htmlToText( revision.title.rendered ),
            html: revision.content.rendered || '',
            raw: revision.content.raw || '',
            excerpt: revision.excerpt ? revision.excerpt.raw : undefined,
        };
        if ( versions.index === index ) {
            item.version = versions.cache[ id ];
            renderPeek();
        }
    }

    // Brings the version in the sheet back into its note, in the editor, as an edit Undo takes back.
    async function restorePeekVersion() {
        const item = peekItem();
        const version = item?.version;
        if ( ! version ) {
            return;
        }
        const restore = { id: item.id, title: version.title, content: version.raw, excerpt: version.excerpt, date: versionWhen( version.date ) };
        if ( ! ( await app.restoreVersion( restore ) ) ) {
            return;
        }
        showPeekVersion( item, -1 );
    }

    // ---- Peek: find

    function openPeekFind() {
        const box = peekEl();
        if ( ! peekItem() ) {
            return;
        }
        if ( peek.folded ) {
            peek.folded = false;
            layoutPeek();
        }
        peek.find = peek.find || { query: '', ranges: [], at: 0 };
        box.querySelector( '.wfw-peek__find' ).hidden = false;
        const input = box.querySelector( '.wfw-peek__find input' );
        input.focus();
        input.select();
    }

    function closePeekFind() {
        const box = peekEl();
        peek.find = null;
        window.CSS?.highlights?.delete( 'wfw-peek-find' );
        window.CSS?.highlights?.delete( 'wfw-peek-find-current' );
        if ( box ) {
            box.querySelector( '.wfw-peek__find' ).hidden = true;
            box.querySelector( '.wfw-peek__find input' ).value = '';
            box.querySelector( '.wfw-peek__count' ).textContent = '';
        }
    }

    // Marks every match in the note; the current one stands out and is scrolled to.
    function runPeekFind( { scroll = false } = {} ) {
        const box = peekEl();
        const find = peek.find;
        if ( ! box || ! find ) {
            return;
        }
        const query = find.query.toLowerCase();
        const ranges = [];
        if ( query ) {
            const walker = document.createTreeWalker( box.querySelector( '.wfw-peek__doc' ), NodeFilter.SHOW_TEXT );
            for ( let node = walker.nextNode(); node; node = walker.nextNode() ) {
                const text = node.nodeValue.toLowerCase();
                for ( let from = text.indexOf( query ); from >= 0; from = text.indexOf( query, from + query.length ) ) {
                    const range = document.createRange();
                    range.setStart( node, from );
                    range.setEnd( node, from + query.length );
                    ranges.push( range );
                }
            }
        }
        find.ranges = ranges;
        find.at = Math.max( 0, Math.min( find.at, ranges.length - 1 ) );
        const now = ranges[ find.at ];
        if ( window.Highlight && window.CSS?.highlights ) {
            CSS.highlights.set( 'wfw-peek-find', new Highlight( ...ranges ) );
            CSS.highlights.set( 'wfw-peek-find-current', new Highlight( ...( now ? [ now ] : [] ) ) );
        }
        box.querySelector( '.wfw-peek__count' ).textContent = ! query
            ? ''
            : ranges.length
                /* translators: 1: the match in view, 2: how many matches there are. */
                ? sprintf( __( '%1$d of %2$d', 'wordpress-for-writers' ), find.at + 1, ranges.length )
                : __( 'No matches', 'wordpress-for-writers' );
        if ( now && scroll ) {
            const scroller = box.querySelector( '.wfw-peek__scroll' );
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
            runPeekFind( { scroll: true } );
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
            const height = peek.folded ? PEEK_STRIP : Math.round( Math.min( H - PEEK_TOP, Math.max( 160, H * peek.bottom ) ) );
            return { left: 0, top: H - height, width: W, height, push: Math.min( height, Math.round( H * 0.6 ) ) };
        }
        if ( peek.folded ) {
            return { left: dock === 'left' ? 0 : W - PEEK_RAIL, top: 0, width: PEEK_RAIL, height: H, push: PEEK_RAIL };
        }
        const width = Math.round( Math.min( W - 80, Math.max( 300, W * peek.side ) ) );
        return { left: dock === 'left' ? 0 : W - width, top: 0, width, height: H, push: W - width >= 420 ? width : 0 };
    }

    // The same box, slid out past its edge: where the sheet comes from and goes to.
    function peekOffstage( dock, box, { W, H } ) {
        return dock === 'bottom' ? { ...box, top: H } : { ...box, left: dock === 'left' ? -box.width : W };
    }

    function placePeek( box ) {
        const el = peekEl();
        el.style.left = box.left + 'px';
        el.style.top = box.top + 'px';
        el.style.width = box.width + 'px';
        el.style.height = box.height + 'px';
    }

    // The editor gives way under the sheet: after the sheet has slid over it when it grows, at once when it shrinks.
    function setPeekPush( px, dock ) {
        const apply = () => {
            peekPush = { dock, px };
            root.querySelector( '.wfw-editor' ).style.setProperty( '--wfw-peek-push', px + 'px' );
            [ 'right', 'left', 'bottom' ].forEach( ( d ) => root.classList.toggle( 'is-push-' + d, px > 0 && d === dock ) );
        };
        clearTimeout( peekPushTimer );
        if ( px > 0 && ( px > peekPush.px || dock !== peekPush.dock ) ) {
            peekPushTimer = setTimeout( apply, PEEK_EASE );
        } else {
            apply();
        }
    }

    function layoutPeek( { animate = true } = {} ) {
        const el = peekEl();
        if ( ! el ) {
            return;
        }
        const open = peek.items.length > 0 && ! app.panel();
        const bounds = peekBounds();
        const dock = peekDock( bounds );
        const box = peekGeometry( dock, bounds );
        root.classList.toggle( 'has-peek', open );
        [ 'right', 'left', 'bottom' ].forEach( ( d ) => el.classList.toggle( 'is-' + d, d === dock ) );
        el.classList.toggle( 'is-folded', peek.folded );
        const fold = el.querySelector( '[data-action="peek-fold"]' );
        const foldLabel = peek.folded ? __( 'Bring back', 'wordpress-for-writers' ) : __( 'Put away', 'wordpress-for-writers' );
        fold.title = foldLabel;
        fold.setAttribute( 'aria-label', foldLabel );
        fold.setAttribute( 'aria-expanded', peek.folded ? 'false' : 'true' );
        el.classList.toggle( 'is-over', box.push < ( dock === 'bottom' ? box.height : box.width ) );
        clearTimeout( peekHideTimer );
        if ( ! open ) {
            if ( peek.shown ) {
                peek.shown = false;
                placePeek( peekOffstage( dock, box, bounds ) );
                peekHideTimer = setTimeout( () => ( el.hidden = true ), PEEK_EASE );
            }
            setPeekPush( 0, dock );
            return;
        }
        if ( ! bounds.W || ! bounds.H ) {
            return; // The pane is out of the layout (a phone showing the list).
        }
        if ( ! peek.shown ) {
            // Comes in from its edge.
            peek.shown = true;
            el.hidden = false;
            el.classList.add( 'is-still' );
            placePeek( peekOffstage( dock, box, bounds ) );
            el.getBoundingClientRect();
            el.classList.remove( 'is-still' );
            renderPeek();
        } else if ( ! animate ) {
            el.classList.add( 'is-still' );
            placePeek( box );
            el.getBoundingClientRect();
            el.classList.remove( 'is-still' );
        }
        placePeek( box );
        setPeekPush( box.push, dock );
    }

    // The header moves the sheet (or, on phones, pulls it up and down); the inner edge resizes it.
    function initPeek() {
        const editor = root.querySelector( '.wfw-editor' );
        editor.insertAdjacentHTML( 'beforeend', peekShellHtml() );
        const el = peekEl();
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
            const bounds = peekBounds();
            const dock = peekDock( bounds );
            drag = { mode, dock, bounds, x: event.clientX, y: event.clientY, box: peekGeometry( dock, bounds ), moved: false, to: dock, size: 0, speed: 0, lastY: event.clientY, lastTime: event.timeStamp };
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
                const target = peekGeometry( drag.to, drag.bounds );
                Object.assign( drop.style, { left: target.left + 'px', top: target.top + 'px', width: target.width + 'px', height: target.height + 'px' } );
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
                drag.size = Math.min( H - PEEK_TOP, Math.max( PEEK_STRIP, drag.box.height - dy ) );
                placePeek( { ...drag.box, top: H - drag.size, height: drag.size } );
            } else {
                drag.size = Math.min( W - 80, Math.max( PEEK_RAIL, drag.box.width + ( drag.dock === 'left' ? dx : -dx ) ) );
                placePeek( { ...drag.box, left: drag.dock === 'left' ? 0 : W - drag.size, width: drag.size } );
            }
        };

        const end = ( event ) => {
            if ( ! drag ) {
                return;
            }
            const done = drag;
            drag = null;
            drop.hidden = true;
            const { W, H } = done.bounds;
            if ( ! done.moved ) {
                // A tap on another note's tab shows it (the header holds the pointer, so the tab gets no click
                // of its own); anywhere else on the header it folds the sheet under the editor, or brings it back.
                const tab = document.elementFromPoint( event.clientX, event.clientY )?.closest( '.wfw-peek__tab:not( .is-active )' );
                if ( event.type !== 'pointerup' || done.mode === 'size' && ! event.target.closest( '.wfw-peek__head' ) ) {
                    return;
                }
                if ( tab ) {
                    onPeekAction( 'peek-tab', tab );
                } else if ( done.mode === 'move' || peek.folded || done.dock === 'bottom' ) {
                    peek.folded = ! peek.folded;
                    layoutPeek();
                }
                return;
            }
            if ( done.mode === 'move' ) {
                // Let go where it is, then settle into the dock.
                const rect = el.getBoundingClientRect();
                el.style.transform = '';
                placePeek( { left: rect.left - done.bounds.left, top: rect.top - done.bounds.top, width: rect.width, height: rect.height } );
                el.getBoundingClientRect();
                peek.dock = done.to;
                peek.folded = false;
            } else if ( done.dock === 'bottom' ) {
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
                    peek.side = Math.min( 0.8, Math.max( 0.2, done.size / W ) );
                }
            }
            root.classList.remove( 'is-peek-dragging' );
            savePeek();
            layoutPeek();
        };

        const head = el.querySelector( '.wfw-peek__head' );
        const grip = el.querySelector( '.wfw-peek__grip' );
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
            peek.side = 0.42;
            peek.bottom = 0.5;
            savePeek();
            layoutPeek();
        } );

        const input = el.querySelector( '.wfw-peek__find input' );
        input.addEventListener( 'input', () => {
            if ( peek.find ) {
                peek.find.query = input.value;
                peek.find.at = 0;
                runPeekFind( { scroll: true } );
            }
        } );
        el.addEventListener( 'keydown', ( event ) => {
            if ( ( event.metaKey || event.ctrlKey ) && ! event.altKey && event.key.toLowerCase() === 'f' ) {
                event.preventDefault();
                openPeekFind();
            } else if ( event.key === 'Enter' && event.target === input ) {
                event.preventDefault();
                stepPeekFind( event.shiftKey ? -1 : 1 );
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

        new ResizeObserver( () => layoutPeek( { animate: false } ) ).observe( editor );
        phoneLayout.addEventListener( 'change', () => layoutPeek( { animate: false } ) );
        // Notes pinned on an earlier visit.
        if ( peekItem() ) {
            loadUnreadPeeks();
            layoutPeek();
        }
    }

    // What a click in or about the sheet does (from onClick).
    function onPeekAction( action, target ) {
        const item = peekItem();
        switch ( action ) {
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
                    if ( ! peekItem().html ) {
                        loadPeek( peekItem() );
                    } else {
                        renderPeek();
                    }
                }
                break;
            }
            case 'peek-close':
                closePeek();
                break;
            case 'peek-fold':
                peek.folded = ! peek.folded;
                layoutPeek();
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

    // A save is a new version, and new text for a sheet showing that note.
    function onNoteSavedForPeek( id ) {
        peek.items.filter( ( item ) => item.id === id ).forEach( ( item ) => {
            if ( item.versions ) {
                loadPeekVersions( item );
            }
            if ( item === peekItem() || item.html ) {
                loadPeek( item );
            }
        } );
    }

    // The keyboard leaves room for one note, the one being written: the sheet folds away under it.
    function onKeyboardForPeek( up ) {
        if ( ! peek.items.length || peekDock() !== 'bottom' ) {
            return;
        }
        if ( up && ! peek.folded && ! peekEl().contains( document.activeElement ) ) {
            peek.folded = true;
            peekFoldedByKeyboard = true;
            layoutPeek();
        } else if ( ! up && peekFoldedByKeyboard ) {
            peekFoldedByKeyboard = false;
            peek.folded = false;
            layoutPeek();
        }
    }

    // ---- What the app sees of it

    // A tab's own peeks, as they are kept with the tab across reloads: { peeks: [ ids ], at }, or null.
    function savedPeeks( tab ) {
        const mine = tab === app.current();
        // Its own: the pinned ones are everyone's, and kept apart.
        const own = mine ? peek.items.filter( ( item ) => ! item.pinned ) : tab.peeks?.items || [];
        const at = mine ? Math.max( 0, own.indexOf( peekItem() ) ) : tab.peeks?.at || 0;
        return own.length ? { peeks: own.map( ( item ) => item.id ), at } : null;
    }

    // Gives a tab back the sheet savedPeeks() kept for it.
    function restorePeeks( tab, saved ) {
        const ids = ( Array.isArray( saved?.peeks ) ? saved.peeks : [] ).map( Number ).filter( ( id ) => id > 0 ).slice( 0, PEEK_MAX );
        if ( ids.length ) {
            tab.peeks = { items: ids.map( ( id ) => newPeekItem( id ) ), at: Math.max( 0, Math.min( Number( saved.at ) || 0, ids.length - 1 ) ), folded: false };
        }
    }

    // A note that is gone (trashed, deleted) leaves every sheet.
    function forgetPeeks( id ) {
        peek.items.filter( ( item ) => item.id === id ).forEach( ( item ) => closePeek( peek.items.indexOf( item ) ) );
        app.tabs().forEach( ( tab ) => {
            if ( tab.peeks ) {
                tab.peeks.items = tab.peeks.items.filter( ( item ) => item.id !== id );
                tab.peeks.at = Math.max( 0, Math.min( tab.peeks.at, tab.peeks.items.length - 1 ) );
            }
        } );
    }

    return {
        init: initPeek, // once the app's shell is in the page
        open: peekNote, // ( id, { versions } )
        closeAll: closeAllPeeks,
        swap: swapPeek,
        isOpen: () => peek.items.length > 0,
        action: onPeekAction, // ( data-action, element ): true when the click was the sheet's
        layout: layoutPeek, // the pane changed: a tab came into view, a panel opened or closed
        render: renderPeek,
        switchTabs: switchPeeks, // ( from, to ): the tab in view changed
        noteSaved: onNoteSavedForPeek, // ( id )
        keyboard: onKeyboardForPeek, // ( up ): the on-screen keyboard came or went
        saved: savedPeeks,
        restore: restorePeeks,
        forget: forgetPeeks,
    };
};
