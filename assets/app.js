( function () {
    const apiFetch = wp.apiFetch;
    const { __, sprintf } = wp.i18n;
    const settings = window.wfwSettings;
    const root = document.getElementById( 'wfw-app' );

    const ICONS = {
        notes: '<path d="M4 3h8l4 4v10H4z"/><path d="M12 3v4h4"/>',
        draft: '<path d="M13.5 3.5l3 3L7 16H4v-3z"/>',
        publish: '<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>',
        future: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
        trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
        folder: '<path d="M3 5h5l2 2h7v9H3z"/>',
        search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
        compose: '<path d="M11 4H4v12h12V9"/><path d="M14.5 2.5l3 3L11 12H8V9z"/>',
        sidebar: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M8 4v12"/>',
        focus: '<path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4"/>',
        restore: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M4 3v3h3"/>',
        close: '<path d="M5 5l10 10M15 5L5 15"/>',
        back: '<path d="M12.5 4L6.5 10l6 6"/>',
        external: '<path d="M11 4h5v5M16 4l-7 7M14 12v4H4V6h4"/>',
        palette: '<path d="M10 3a7 7 0 1 0 0 14c1 0 1.5-.7 1.5-1.4 0-1-.9-1.3-.9-2.1 0-.8.6-1.3 1.4-1.3H14a3 3 0 0 0 3-3C17 5.6 13.9 3 10 3z"/><circle cx="6.5" cy="9" r=".8"/><circle cx="9" cy="6" r=".8"/><circle cx="12.5" cy="6.5" r=".8"/>',
    };

    const STATUS_VIEWS = [
        { type: 'all', label: __( 'Notes', 'wordpress-for-writers' ), icon: 'notes', status: 'publish,future,draft,pending,private' },
        { type: 'draft', label: __( 'Drafts', 'wordpress-for-writers' ), icon: 'draft', status: 'draft,pending' },
        { type: 'publish', label: __( 'Published', 'wordpress-for-writers' ), icon: 'publish', status: 'publish,private' },
        { type: 'future', label: __( 'Scheduled', 'wordpress-for-writers' ), icon: 'future', status: 'future' },
        { type: 'trash', label: __( 'Trash', 'wordpress-for-writers' ), icon: 'trash', status: 'trash' },
    ];

    const state = {
        view: loadPref( 'view', { type: 'all' } ),
        search: '',
        notes: [],
        page: 1,
        totalPages: 1,
        loading: false,
        activeId: null,
        counts: {},
        categories: [],
        tags: [],
        sidebarHidden: loadPref( 'sidebarHidden', false ),
        focus: false,
    };

    const APPEARANCE_CHOICES = {
        font: [ [ 'serif', __( 'Serif', 'wordpress-for-writers' ) ], [ 'sans', __( 'Sans', 'wordpress-for-writers' ) ], [ 'mono', __( 'Mono', 'wordpress-for-writers' ) ] ],
        size: [ [ 'small', __( 'Small', 'wordpress-for-writers' ) ], [ 'medium', __( 'Medium', 'wordpress-for-writers' ) ], [ 'large', __( 'Large', 'wordpress-for-writers' ) ] ],
        width: [ [ 'narrow', __( 'Narrow', 'wordpress-for-writers' ) ], [ 'medium', __( 'Medium', 'wordpress-for-writers' ) ], [ 'wide', __( 'Wide', 'wordpress-for-writers' ) ] ],
    };
    const appearance = { ...settings.appearance.current };

    const compactLayout = window.matchMedia( '(max-width: 1100px)' );

    let frame = null;
    let frameReady = false;
    let revealTimer = 0;
    let pendingReplies = {};
    let replySeq = 0;
    let listRequest = 0;

    // ---- Utilities ---------------------------------------------------------

    function loadPref( key, fallback ) {
        try {
            const value = window.localStorage.getItem( 'wfw:' + key );
            return value === null ? fallback : JSON.parse( value );
        } catch ( e ) {
            return fallback;
        }
    }

    function savePref( key, value ) {
        try {
            window.localStorage.setItem( 'wfw:' + key, JSON.stringify( value ) );
        } catch ( e ) {}
    }

    function esc( value ) {
        return String( value ?? '' ).replace( /[&<>"']/g, ( c ) => ( {
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ c ] ) );
    }

    function icon( name ) {
        return '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICONS[ name ] + '</svg>';
    }

    // DOMParser builds an inert document: unlike innerHTML on a detached element,
    // images don't load and inline handlers (onerror etc.) never run.
    function htmlToText( html ) {
        const doc = new DOMParser().parseFromString( html || '', 'text/html' );
        return ( doc.body.textContent || '' ).replace( /\s+/g, ' ' ).replace( /\s*\[…\]\s*$/, '…' ).trim();
    }

    function formatDate( iso ) {
        const date = new Date( iso + 'Z' );
        const now = new Date();
        if ( date.toDateString() === now.toDateString() ) {
            return date.toLocaleTimeString( [], { hour: 'numeric', minute: '2-digit' } );
        }
        const opts = { month: 'short', day: 'numeric' };
        if ( date.getFullYear() !== now.getFullYear() ) {
            opts.year = 'numeric';
        }
        return date.toLocaleDateString( [], opts );
    }

    function debounce( fn, wait ) {
        let t;
        return ( ...args ) => {
            clearTimeout( t );
            t = setTimeout( () => fn( ...args ), wait );
        };
    }

    function sameView( a, b ) {
        return a.type === b.type && a.id === b.id;
    }

    function currentStatus() {
        const view = STATUS_VIEWS.find( ( v ) => v.type === state.view.type );
        return view ? view.status : STATUS_VIEWS[ 0 ].status;
    }

    function viewLabel() {
        const view = STATUS_VIEWS.find( ( v ) => v.type === state.view.type );
        if ( view ) {
            return view.label;
        }
        const list = state.view.type === 'category' ? state.categories : state.tags;
        const term = list.find( ( t ) => t.id === state.view.id );
        return term ? '#' + term.name : '';
    }

    // ---- Data --------------------------------------------------------------

    async function fetchTotal( params ) {
        const response = await apiFetch( {
            path: '/wp/v2/posts?' + new URLSearchParams( { ...params, per_page: 1, context: 'edit', _fields: 'id' } ),
            parse: false,
        } );
        return parseInt( response.headers.get( 'X-WP-Total' ), 10 ) || 0;
    }

    async function loadCounts() {
        const entries = await Promise.all(
            STATUS_VIEWS.map( async ( v ) => [ v.type, await fetchTotal( { status: v.status } ).catch( () => 0 ) ] )
        );
        state.counts = Object.fromEntries( entries );
        renderSidebar();
    }

    async function loadTerms() {
        const [ categories, tags ] = await Promise.all( [
            apiFetch( { path: '/wp/v2/categories?per_page=100&orderby=name&_fields=id,name,parent,count' } ).catch( () => [] ),
            apiFetch( { path: '/wp/v2/tags?per_page=100&orderby=name&_fields=id,name,count' } ).catch( () => [] ),
        ] );
        state.categories = categories;
        state.tags = tags;
        renderSidebar();
        renderListHeader();
    }

    async function loadNotes( { append = false } = {} ) {
        const requestId = ++listRequest;
        state.loading = true;
        const page = append ? state.page + 1 : 1;
        const params = {
            status: currentStatus(),
            orderby: 'modified',
            order: 'desc',
            per_page: 30,
            page,
            context: 'edit',
            _fields: 'id,title,excerpt,modified_gmt,status,sticky',
        };
        if ( state.view.type === 'category' ) {
            params.categories = state.view.id;
        } else if ( state.view.type === 'tag' ) {
            params.tags = state.view.id;
        }
        if ( state.search ) {
            params.search = state.search;
        }
        if ( ! append ) {
            renderListItems();
        }
        try {
            const response = await apiFetch( { path: '/wp/v2/posts?' + new URLSearchParams( params ), parse: false } );
            const items = await response.json();
            if ( requestId !== listRequest ) {
                return;
            }
            state.totalPages = parseInt( response.headers.get( 'X-WP-TotalPages' ), 10 ) || 1;
            state.page = page;
            state.notes = append ? state.notes.concat( items ) : items;
        } catch ( e ) {
            if ( requestId === listRequest && ! append ) {
                state.notes = [];
            }
        }
        if ( requestId === listRequest ) {
            state.loading = false;
            renderListItems();
        }
    }

    function refresh() {
        loadNotes();
        loadCounts();
        loadTerms();
    }

    // ---- Rendering ---------------------------------------------------------

    function renderShell() {
        root.innerHTML = `
            <aside class="wfw-sidebar" aria-label="${ esc( __( 'Library', 'wordpress-for-writers' ) ) }"></aside>
            <section class="wfw-list">
                <div class="wfw-list__bar">
                    <button class="wfw-icon-btn" data-action="toggle-sidebar" title="${ esc( __( 'Toggle sidebar', 'wordpress-for-writers' ) ) }">${ icon( 'sidebar' ) }</button>
                    <label class="wfw-search">${ icon( 'search' ) }<input type="search" placeholder="${ esc( __( 'Search', 'wordpress-for-writers' ) ) }" /></label>
                    <button class="wfw-icon-btn wfw-icon-btn--accent" data-action="new" title="${ esc( __( 'New note', 'wordpress-for-writers' ) ) }">${ icon( 'compose' ) }</button>
                </div>
                <div class="wfw-list__title"></div>
                <div class="wfw-list__items" role="list"></div>
            </section>
            <div class="wfw-scrim" data-action="close-drawer"></div>
            <main class="wfw-editor">
                <button class="wfw-back" data-action="back">${ icon( 'back' ) }${ esc( __( 'Notes', 'wordpress-for-writers' ) ) }</button>
                <button class="wfw-icon-btn wfw-focus-toggle" data-action="toggle-focus" title="${ esc( __( 'Focus mode', 'wordpress-for-writers' ) ) }">${ icon( 'focus' ) }</button>
                <div class="wfw-editor__placeholder">${ icon( 'notes' ) }<span>${ esc( __( 'Select a note or start a new one', 'wordpress-for-writers' ) ) }</span></div>
            </main>
        `;

        root.addEventListener( 'click', onClick );
        root.querySelector( '.wfw-search input' ).addEventListener( 'input', debounce( ( e ) => {
            state.search = e.target.value.trim();
            loadNotes();
        }, 250 ) );
        const items = root.querySelector( '.wfw-list__items' );
        items.addEventListener( 'scroll', () => {
            if ( ! state.loading && state.page < state.totalPages && items.scrollTop + items.clientHeight > items.scrollHeight - 200 ) {
                loadNotes( { append: true } );
            }
        } );
        applyLayout();
    }

    function applyLayout() {
        root.classList.toggle( 'is-sidebar-hidden', state.sidebarHidden );
        root.classList.toggle( 'is-focus', state.focus );
    }

    function navButton( view, label, iconHtml, count ) {
        const active = sameView( view, state.view );
        return `
            <button class="wfw-nav${ active ? ' is-active' : '' }" data-action="view" data-type="${ view.type }" data-id="${ view.id || '' }">
                <span class="wfw-nav__icon">${ iconHtml }</span>
                <span class="wfw-nav__label">${ esc( label ) }</span>
                ${ count ? `<span class="wfw-nav__count">${ count }</span>` : '' }
            </button>`;
    }

    function categoryTree( parent, depth ) {
        return state.categories
            .filter( ( c ) => c.parent === parent )
            .map( ( c ) => {
                const label = c.name;
                const indent = depth ? `<span style="width:${ depth * 12 }px;display:inline-block"></span>` : '';
                const html = navButton( { type: 'category', id: c.id }, label, indent + icon( 'folder' ) );
                return html + categoryTree( c.id, depth + 1 );
            } )
            .join( '' );
    }

    function renderSidebar() {
        const sidebar = root.querySelector( '.wfw-sidebar' );
        const statusNav = STATUS_VIEWS.map( ( v ) => navButton( { type: v.type }, v.label, icon( v.icon ), state.counts[ v.type ] ) ).join( '' );
        const tags = state.tags
            .map( ( t ) => navButton( { type: 'tag', id: t.id }, t.name, '<span class="wfw-nav__hash">#</span>' ) )
            .join( '' );
        const siteIcon = settings.siteIcon ? `<img class="wfw-sidebar__icon" src="${ esc( settings.siteIcon ) }" alt="" />` : '';

        sidebar.innerHTML = `
            <div class="wfw-sidebar__head">${ siteIcon }<span class="wfw-sidebar__name">${ esc( settings.siteName ) }</span></div>
            <div class="wfw-sidebar__scroll">
                ${ statusNav }
                ${ state.categories.length ? `<div class="wfw-sidebar__section">${ esc( __( 'Categories', 'wordpress-for-writers' ) ) }</div>${ categoryTree( 0, 0 ) }` : '' }
                ${ state.tags.length ? `<div class="wfw-sidebar__section">${ esc( __( 'Tags', 'wordpress-for-writers' ) ) }</div>${ tags }` : '' }
            </div>
            <div class="wfw-sidebar__foot">
                <button data-action="appearance">${ esc( __( 'Appearance', 'wordpress-for-writers' ) ) }</button>
                <a href="${ esc( settings.siteUrl ) }" target="_blank" rel="noopener">${ esc( __( 'View site', 'wordpress-for-writers' ) ) } ↗</a>
                <a href="${ esc( settings.adminUrl + 'index.php?wfw_classic=1' ) }">${ esc( __( 'Classic dashboard', 'wordpress-for-writers' ) ) }</a>
                <a href="${ esc( settings.logoutUrl ) }">${ esc( sprintf( __( 'Log out %s', 'wordpress-for-writers' ), settings.userName ) ) }</a>
            </div>
        `;
        revealSiteIcon( sidebar.querySelector( '.wfw-sidebar__icon' ) );
    }

    // The site icon stays invisible until it has loaded, and is dropped if it fails, so an empty box never shows.
    function revealSiteIcon( img ) {
        if ( ! img ) {
            return;
        }
        const settle = () => {
            if ( img.naturalWidth ) {
                img.classList.add( 'is-loaded' );
            } else {
                settings.siteIcon = ''; // Leave it out of later renders too.
                img.remove();
            }
        };
        if ( img.complete ) {
            settle();
        } else {
            img.addEventListener( 'load', settle );
            img.addEventListener( 'error', settle );
        }
    }

    function renderListHeader() {
        root.querySelector( '.wfw-list__title' ).textContent = viewLabel();
    }

    function noteHtml( note ) {
        const title = note.title.raw || htmlToText( note.title.rendered );
        const excerpt = htmlToText( note.excerpt.rendered );
        const isTrash = note.status === 'trash';
        const badge = [ 'publish', 'future', 'private', 'pending' ].includes( note.status )
            ? `<span class="wfw-badge wfw-badge--${ note.status }">${ esc( { publish: __( 'Published', 'wordpress-for-writers' ), future: __( 'Scheduled', 'wordpress-for-writers' ), private: __( 'Private', 'wordpress-for-writers' ), pending: __( 'Pending', 'wordpress-for-writers' ) }[ note.status ] ) }</span>`
            : '';
        const actions = isTrash
            ? `<span class="wfw-icon-btn" role="button" data-action="restore" data-id="${ note.id }" title="${ esc( __( 'Restore', 'wordpress-for-writers' ) ) }">${ icon( 'restore' ) }</span>
               <span class="wfw-icon-btn" role="button" data-action="delete" data-id="${ note.id }" title="${ esc( __( 'Delete permanently', 'wordpress-for-writers' ) ) }">${ icon( 'close' ) }</span>`
            : `<span class="wfw-icon-btn" role="button" data-action="trash" data-id="${ note.id }" title="${ esc( __( 'Move to trash', 'wordpress-for-writers' ) ) }">${ icon( 'trash' ) }</span>`;

        return `
            <div class="wfw-note${ note.id === state.activeId ? ' is-active' : '' }" role="listitem" tabindex="0" data-action="open" data-id="${ note.id }">
                <div class="wfw-note__title${ title ? '' : ' is-empty' }">${ esc( title || __( 'Untitled', 'wordpress-for-writers' ) ) }</div>
                ${ excerpt ? `<div class="wfw-note__excerpt">${ esc( excerpt ) }</div>` : '' }
                <div class="wfw-note__meta"><span>${ esc( formatDate( note.modified_gmt ) ) }</span>${ badge }</div>
                ${ settings.canDelete ? `<div class="wfw-note__actions">${ actions }</div>` : '' }
            </div>`;
    }

    function renderListItems() {
        const container = root.querySelector( '.wfw-list__items' );
        if ( state.loading && ! state.notes.length ) {
            container.innerHTML = '';
            return;
        }
        if ( ! state.notes.length ) {
            container.innerHTML = `<div class="wfw-empty">${ esc( state.search ? __( 'No matching notes', 'wordpress-for-writers' ) : __( 'No notes here yet', 'wordpress-for-writers' ) ) }</div>`;
            return;
        }
        container.innerHTML = state.notes.map( noteHtml ).join( '' );
    }

    function markActive() {
        root.querySelectorAll( '.wfw-note' ).forEach( ( el ) => {
            el.classList.toggle( 'is-active', Number( el.dataset.id ) === state.activeId );
        } );
    }

    // ---- Editor frame ------------------------------------------------------

    function ask( message, timeout ) {
        if ( ! frame || ! frame.contentWindow ) {
            return Promise.resolve( null );
        }
        const replyTo = ++replySeq;
        return new Promise( ( resolve ) => {
            pendingReplies[ replyTo ] = resolve;
            frame.contentWindow.postMessage( { source: 'wfw', replyTo, ...message }, window.location.origin );
            setTimeout( () => {
                if ( pendingReplies[ replyTo ] ) {
                    delete pendingReplies[ replyTo ];
                    resolve( null );
                }
            }, timeout );
        } );
    }

    async function canLeaveEditor() {
        if ( ! frameReady ) {
            return true;
        }
        const reply = await ask( { type: 'flush' }, 8000 );
        if ( ! reply || reply.ok ) {
            return true;
        }
        return window.confirm( __( 'This published note has unsaved changes. Discard them?', 'wordpress-for-writers' ) );
    }

    // Placeholder shown in the editor's colors while a note loads: its title from
    // the list and a few faint lines, so switching notes never flashes white.
    function skeletonHtml() {
        const title = state.activeId && root.querySelector( `.wfw-note[data-id="${ state.activeId }"] .wfw-note__title:not(.is-empty)` );
        const body = state.activeId ? '<span></span><span></span><span></span>' : '';
        return `<div class="wfw-editor__skeleton" aria-hidden="true"><div class="wfw-editor__skeleton-column">${ title ? `<div class="wfw-editor__skeleton-title">${ esc( title.textContent ) }</div>` : '' }${ body }</div></div>`;
    }

    // The new frame stays transparent until its canvas has painted with our
    // styles (or a timeout passes), then fades in over the skeleton.
    function revealEditor() {
        clearTimeout( revealTimer );
        if ( ! frame ) {
            return;
        }
        frame.classList.remove( 'is-loading' );
        root.querySelectorAll( '.wfw-editor__loading, .wfw-editor__skeleton' ).forEach( ( el ) => {
            el.classList.add( 'is-done' );
            setTimeout( () => el.remove(), 250 );
        } );
    }

    function mountEditor( src ) {
        const editor = root.querySelector( '.wfw-editor' );
        editor.querySelectorAll( 'iframe, .wfw-editor__placeholder, .wfw-editor__loading, .wfw-editor__skeleton' ).forEach( ( el ) => el.remove() );
        clearTimeout( revealTimer );
        frameReady = false;
        root.classList.toggle( 'has-note', !! src );
        if ( ! src ) {
            frame = null;
            editor.insertAdjacentHTML( 'beforeend', `<div class="wfw-editor__placeholder">${ icon( 'notes' ) }<span>${ esc( __( 'Select a note or start a new one', 'wordpress-for-writers' ) ) }</span></div>` );
            return;
        }
        editor.insertAdjacentHTML( 'beforeend', '<div class="wfw-editor__loading"></div>' + skeletonHtml() );
        frame = document.createElement( 'iframe' );
        // aria-label rather than title: Safari shows an iframe's title as a hover tooltip.
        frame.setAttribute( 'aria-label', __( 'Editor', 'wordpress-for-writers' ) );
        frame.classList.add( 'is-loading' );
        frame.src = src;
        editor.appendChild( frame );
        revealTimer = setTimeout( revealEditor, 8000 );
    }

    async function openNote( id ) {
        if ( id === state.activeId && frame ) {
            root.classList.add( 'has-note' );
            return;
        }
        if ( ! ( await canLeaveEditor() ) ) {
            return;
        }
        state.activeId = id;
        markActive();
        window.history.replaceState( null, '', '#note=' + id );
        mountEditor( settings.adminUrl + 'post.php?post=' + id + '&action=edit&wfw_frame=1' );
    }

    async function newNote() {
        if ( ! ( await canLeaveEditor() ) ) {
            return;
        }
        state.activeId = null;
        markActive();
        window.history.replaceState( null, '', window.location.pathname + window.location.search );
        mountEditor( settings.adminUrl + 'post-new.php?wfw_frame=1' );
    }

    window.addEventListener( 'message', ( event ) => {
        if ( event.origin !== window.location.origin || ! event.data || event.data.source !== 'wfw-frame' ) {
            return;
        }
        if ( ! frame || event.source !== frame.contentWindow ) {
            return;
        }
        const data = event.data;
        if ( data.replyTo && pendingReplies[ data.replyTo ] ) {
            pendingReplies[ data.replyTo ]( data );
            delete pendingReplies[ data.replyTo ];
            return;
        }
        switch ( data.type ) {
            case 'ready': {
                frameReady = true;
                applyAppearance();
                if ( data.id && state.activeId !== data.id ) {
                    state.activeId = data.id;
                    markActive();
                }
                break;
            }
            case 'painted': {
                revealEditor();
                break;
            }
            case 'title': {
                const el = root.querySelector( `.wfw-note[data-id="${ data.id }"] .wfw-note__title` );
                if ( el ) {
                    el.textContent = data.title || __( 'Untitled', 'wordpress-for-writers' );
                    el.classList.toggle( 'is-empty', ! data.title );
                }
                break;
            }
            case 'saved': {
                state.activeId = data.id;
                window.history.replaceState( null, '', '#note=' + data.id );
                loadNotes();
                loadCounts();
                break;
            }
            case 'escape': {
                if ( state.focus ) {
                    toggleFocus();
                }
                break;
            }
        }
    } );

    // ---- Appearance --------------------------------------------------------

    function applyAppearance() {
        Object.entries( appearance ).forEach( ( [ key, value ] ) => {
            document.documentElement.dataset[ 'wfw' + key[ 0 ].toUpperCase() + key.slice( 1 ) ] = value;
        } );
        if ( frame && frame.contentWindow ) {
            frame.contentWindow.postMessage( { source: 'wfw', type: 'appearance', appearance }, window.location.origin );
        }
    }

    const saveAppearance = debounce( () => {
        apiFetch( { path: '/wp/v2/users/me', method: 'POST', data: { meta: { wfw_appearance: appearance } } } ).catch( () => {} );
    }, 400 );

    function renderAppearanceSheet() {
        const themes = settings.appearance.themes
            .map( ( t ) => `
                <button class="wfw-theme${ appearance.theme === t.id ? ' is-active' : '' }" data-action="set-appearance" data-key="theme" data-value="${ esc( t.id ) }">
                    <span class="wfw-theme__preview" style="background:${ esc( t.id === 'system' ? `linear-gradient(135deg, ${ t.swatch[ 0 ] } 50%, ${ t.swatch[ 1 ] } 50%)` : t.swatch[ 0 ] ) }">
                        <i style="background:${ esc( t.id === 'system' ? '#8d8b88' : t.swatch[ 1 ] ) }"></i>
                        <i style="background:${ esc( t.id === 'system' ? '#8d8b88' : t.swatch[ 1 ] ) }"></i>
                        <i style="background:${ esc( t.id === 'system' ? '#8d8b88' : t.swatch[ 1 ] ) }"></i>
                        <span class="wfw-theme__dot" style="background:${ esc( t.swatch[ 2 ] ) }"></span>
                    </span>
                    ${ esc( t.label ) }
                </button>` )
            .join( '' );
        const segmented = ( key, label ) => `
            <div class="wfw-sheet__label">${ esc( label ) }</div>
            <div class="wfw-segmented">
                ${ APPEARANCE_CHOICES[ key ].map( ( [ value, text ] ) => `<button class="${ appearance[ key ] === value ? 'is-active' : '' }" data-action="set-appearance" data-key="${ key }" data-value="${ value }">${ esc( text ) }</button>` ).join( '' ) }
            </div>`;

        return `
            <div class="wfw-sheet__card" role="dialog" aria-modal="true" aria-label="${ esc( __( 'Appearance', 'wordpress-for-writers' ) ) }">
                <div class="wfw-sheet__head">
                    <span>${ esc( __( 'Appearance', 'wordpress-for-writers' ) ) }</span>
                    <button class="wfw-icon-btn" data-action="close-sheet" title="${ esc( __( 'Close', 'wordpress-for-writers' ) ) }">${ icon( 'close' ) }</button>
                </div>
                <div class="wfw-sheet__label">${ esc( __( 'Theme', 'wordpress-for-writers' ) ) }</div>
                <div class="wfw-themes">${ themes }</div>
                ${ segmented( 'font', __( 'Font', 'wordpress-for-writers' ) ) }
                ${ segmented( 'size', __( 'Text size', 'wordpress-for-writers' ) ) }
                ${ segmented( 'width', __( 'Line width', 'wordpress-for-writers' ) ) }
            </div>`;
    }

    function openAppearance() {
        let sheet = root.querySelector( '.wfw-sheet' );
        if ( ! sheet ) {
            sheet = document.createElement( 'div' );
            sheet.className = 'wfw-sheet';
            sheet.dataset.action = 'close-sheet';
            root.appendChild( sheet );
        }
        sheet.innerHTML = renderAppearanceSheet();
    }

    function closeAppearance() {
        root.querySelector( '.wfw-sheet' )?.remove();
    }

    function setAppearance( key, value ) {
        appearance[ key ] = value;
        applyAppearance();
        saveAppearance();
        openAppearance();
    }

    // ---- Actions -----------------------------------------------------------

    function toggleFocus() {
        state.focus = ! state.focus;
        applyLayout();
    }

    async function trashNote( id ) {
        await apiFetch( { path: '/wp/v2/posts/' + id, method: 'DELETE' } );
        if ( id === state.activeId ) {
            state.activeId = null;
            mountEditor( null );
        }
        refresh();
    }

    async function restoreNote( id ) {
        await apiFetch( { path: '/wp/v2/posts/' + id, method: 'POST', data: { status: 'draft' } } );
        refresh();
    }

    async function deleteNote( id ) {
        if ( ! window.confirm( __( 'Delete this note permanently? This cannot be undone.', 'wordpress-for-writers' ) ) ) {
            return;
        }
        await apiFetch( { path: '/wp/v2/posts/' + id + '?force=true', method: 'DELETE' } );
        if ( id === state.activeId ) {
            state.activeId = null;
            mountEditor( null );
        }
        refresh();
    }

    function onClick( event ) {
        const target = event.target.closest( '[data-action]' );
        if ( ! target || ! root.contains( target ) ) {
            return;
        }
        const id = Number( target.dataset.id ) || undefined;
        switch ( target.dataset.action ) {
            case 'view':
                state.view = id ? { type: target.dataset.type, id } : { type: target.dataset.type };
                savePref( 'view', state.view );
                root.classList.remove( 'is-sidebar-open' );
                renderSidebar();
                renderListHeader();
                loadNotes();
                break;
            case 'open':
                openNote( id );
                break;
            case 'new':
                newNote();
                break;
            case 'trash':
                event.stopPropagation();
                trashNote( id );
                break;
            case 'restore':
                event.stopPropagation();
                restoreNote( id );
                break;
            case 'delete':
                event.stopPropagation();
                deleteNote( id );
                break;
            case 'toggle-sidebar':
                if ( compactLayout.matches ) {
                    root.classList.toggle( 'is-sidebar-open' );
                    break;
                }
                state.sidebarHidden = ! state.sidebarHidden;
                savePref( 'sidebarHidden', state.sidebarHidden );
                applyLayout();
                break;
            case 'close-drawer':
                root.classList.remove( 'is-sidebar-open' );
                break;
            case 'back':
                root.classList.remove( 'has-note' );
                break;
            case 'toggle-focus':
                toggleFocus();
                break;
            case 'appearance':
                openAppearance();
                break;
            case 'set-appearance':
                setAppearance( target.dataset.key, target.dataset.value );
                break;
            case 'close-sheet':
                if ( event.target === target || target.classList.contains( 'wfw-icon-btn' ) ) {
                    closeAppearance();
                }
                break;
        }
    }

    root.addEventListener( 'keydown', ( event ) => {
        if ( event.key === 'Enter' && event.target.classList.contains( 'wfw-note' ) ) {
            openNote( Number( event.target.dataset.id ) );
        }
    } );

    document.addEventListener( 'keydown', ( event ) => {
        if ( event.key === 'Escape' && root.querySelector( '.wfw-sheet' ) ) {
            closeAppearance();
        } else if ( event.key === 'Escape' && state.focus ) {
            toggleFocus();
        }
    } );

    /*
     * iOS Safari doesn't resize the fixed app for the keyboard, then scrolls the
     * page to keep the caret in view, which pushes the top bar off screen and
     * the editor's toolbar under the keyboard. While the keyboard is up, undo
     * that scroll and size the app to exactly the visible area, so the editor
     * scrolls inside itself instead. The keyboard is judged against the tallest
     * viewport seen: iOS 26 keeps innerHeight full height, iOS 27 shrinks it.
     */
    const visible = window.visualViewport;
    if ( visible ) {
        let fullHeight = 0;
        let fullWidth = 0;
        const fitToKeyboard = () => {
            if ( visible.width !== fullWidth ) {
                fullWidth = visible.width;
                fullHeight = 0;
            }
            fullHeight = Math.max( fullHeight, window.innerHeight, visible.height );
            const keyboardUp = fullHeight - visible.height > 80 && visible.scale < 1.01;
            if ( keyboardUp && ( window.scrollY || visible.offsetTop ) ) {
                window.scrollTo( 0, 0 );
            }
            root.classList.toggle( 'has-keyboard', keyboardUp );
            root.style.top = keyboardUp ? visible.offsetTop + 'px' : '';
            root.style.height = keyboardUp ? visible.height + 'px' : '';
        };
        visible.addEventListener( 'resize', fitToKeyboard );
        visible.addEventListener( 'scroll', fitToKeyboard );
        window.addEventListener( 'scroll', fitToKeyboard );
    }

    // ---- Boot --------------------------------------------------------------

    renderShell();
    renderSidebar();
    renderListHeader();
    refresh();

    const hashMatch = window.location.hash.match( /note=(\d+)/ );
    if ( hashMatch ) {
        openNote( Number( hashMatch[ 1 ] ) );
    }
} )();
