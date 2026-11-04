( function () {
    const apiFetch = wp.apiFetch;
    const { __, _n, sprintf } = wp.i18n;
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
        check: '<path d="M5 10.5l3 3 7-7"/>',
        chevronDown: '<path d="M6 8l4 4 4-4"/>',
        image: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8.5" r="1.3"/><path d="M3.5 14l4-3.5 3 2.5 2.5-2 3.5 3"/>',
    };

    const STATUS_VIEWS = [
        { type: 'all', label: __( 'Notes', 'wordpress-for-writers' ), icon: 'notes', status: 'publish,future,draft,pending,private' },
        { type: 'draft', label: __( 'Drafts', 'wordpress-for-writers' ), icon: 'draft', status: 'draft,pending' },
        { type: 'publish', label: __( 'Published', 'wordpress-for-writers' ), icon: 'publish', status: 'publish,private' },
        { type: 'future', label: __( 'Scheduled', 'wordpress-for-writers' ), icon: 'future', status: 'future' },
        { type: 'trash', label: __( 'Trash', 'wordpress-for-writers' ), icon: 'trash', status: 'trash' },
    ];

    // Status icon and tooltip for each note in mixed lists. Pending reads as a draft; private stays muted.
    const NOTE_STATUSES = {
        publish: { icon: 'publish', label: __( 'Published', 'wordpress-for-writers' ) },
        future: { icon: 'future', label: __( 'Scheduled', 'wordpress-for-writers' ) },
        draft: { icon: 'draft', label: __( 'Draft', 'wordpress-for-writers' ) },
        pending: { icon: 'draft', label: __( 'Pending review', 'wordpress-for-writers' ) },
        private: { icon: 'publish', label: __( 'Private', 'wordpress-for-writers' ) },
    };

    // List options, like Bear's Sorting and Preview Style menus. Per device, like the other prefs.
    const SORT_FIELDS = [
        { value: 'modified', label: __( 'Date modified', 'wordpress-for-writers' ) },
        { value: 'date', label: __( 'Date created', 'wordpress-for-writers' ) },
        { value: 'title', label: __( 'Title', 'wordpress-for-writers' ) },
    ];
    const PREVIEW_LINES = [
        { value: 0, label: __( 'Title only', 'wordpress-for-writers' ) },
        { value: 1, label: __( 'One line', 'wordpress-for-writers' ) },
        { value: 2, label: __( 'Two lines', 'wordpress-for-writers' ) },
        { value: 3, label: __( 'Three lines', 'wordpress-for-writers' ) },
    ];
    const LIST_DEFAULTS = { orderby: 'modified', order: 'desc', lines: 2, images: true };

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
        list: { ...LIST_DEFAULTS, ...loadPref( 'list', {} ) },
        total: 0,
        listMenu: false,
        // Featured image panel shown in the editor pane: { id, title, current, library, page, totalPages, busy, error }.
        featured: null,
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
            orderby: state.list.orderby,
            order: state.list.order,
            per_page: 30,
            page,
            context: 'edit',
            // Embed featured images; _fields keeps only the link the embed needs, so the response stays small.
            _fields: 'id,title,excerpt,date_gmt,modified_gmt,status,sticky' + ( state.list.images ? ',_links.wp:featuredmedia' : '' ),
        };
        if ( state.list.images ) {
            params._embed = 'wp:featuredmedia';
        }
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
            state.total = parseInt( response.headers.get( 'X-WP-Total' ), 10 ) || 0;
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
            renderListMenu();
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
                <div class="wfw-list__head">
                    <button class="wfw-list__title" data-action="list-menu" aria-haspopup="menu" aria-expanded="false"><span class="wfw-list__label"></span>${ icon( 'chevronDown' ) }</button>
                </div>
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

        sidebar.innerHTML = `
            <div class="wfw-sidebar__head">${ esc( settings.siteName ) }</div>
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
    }

    function renderListHeader() {
        root.querySelector( '.wfw-list__label' ).textContent = viewLabel();
        const items = root.querySelector( '.wfw-list__items' );
        items.style.setProperty( '--wfw-preview-lines', state.list.lines );
        items.classList.toggle( 'is-title-only', ! state.list.lines );
    }

    function orderChoices() {
        return state.list.orderby === 'title'
            ? [ { value: 'asc', label: __( 'A to Z', 'wordpress-for-writers' ) }, { value: 'desc', label: __( 'Z to A', 'wordpress-for-writers' ) } ]
            : [ { value: 'desc', label: __( 'Newest first', 'wordpress-for-writers' ) }, { value: 'asc', label: __( 'Oldest first', 'wordpress-for-writers' ) } ];
    }

    function menuItem( role, checked, key, value, label ) {
        return `<button class="wfw-menu__item" role="${ role }" aria-checked="${ checked }" tabindex="-1" data-action="list-option" data-key="${ key }" data-value="${ esc( value ) }">${ checked ? icon( 'check' ) : '<span class="wfw-menu__spacer"></span>' }<span>${ esc( label ) }</span></button>`;
    }

    function renderListMenu() {
        const head = root.querySelector( '.wfw-list__head' );
        const toggle = head.querySelector( '.wfw-list__title' );
        toggle.setAttribute( 'aria-expanded', state.listMenu ? 'true' : 'false' );
        let menu = head.querySelector( '.wfw-menu' );
        if ( ! state.listMenu ) {
            menu?.remove();
            return;
        }
        if ( ! menu ) {
            menu = document.createElement( 'div' );
            menu.className = 'wfw-menu';
            menu.setAttribute( 'role', 'menu' );
            menu.setAttribute( 'aria-label', __( 'List options', 'wordpress-for-writers' ) );
            head.appendChild( menu );
        }
        const focused = menu.contains( document.activeElement ) ? [ ...menu.querySelectorAll( '.wfw-menu__item' ) ].indexOf( document.activeElement ) : -1;
        const { list } = state;
        /* translators: %d: number of notes in the list. */
        const count = sprintf( _n( '%d note', '%d notes', state.total, 'wordpress-for-writers' ), state.total );
        menu.innerHTML = `
            <div class="wfw-menu__count">${ esc( count ) }</div>
            <div class="wfw-menu__label" id="wfw-menu-sort">${ esc( __( 'Sort by', 'wordpress-for-writers' ) ) }</div>
            <div role="group" aria-labelledby="wfw-menu-sort">${ SORT_FIELDS.map( ( f ) => menuItem( 'menuitemradio', list.orderby === f.value, 'orderby', f.value, f.label ) ).join( '' ) }</div>
            <div class="wfw-menu__sep" role="separator"></div>
            <div role="group" aria-label="${ esc( __( 'Order', 'wordpress-for-writers' ) ) }">${ orderChoices().map( ( o ) => menuItem( 'menuitemradio', list.order === o.value, 'order', o.value, o.label ) ).join( '' ) }</div>
            <div class="wfw-menu__sep" role="separator"></div>
            <div class="wfw-menu__label" id="wfw-menu-preview">${ esc( __( 'Preview', 'wordpress-for-writers' ) ) }</div>
            <div role="group" aria-labelledby="wfw-menu-preview">${ PREVIEW_LINES.map( ( p ) => menuItem( 'menuitemradio', list.lines === p.value, 'lines', p.value, p.label ) ).join( '' ) }</div>
            <div class="wfw-menu__sep" role="separator"></div>
            ${ menuItem( 'menuitemcheckbox', list.images, 'images', '', __( 'Show images', 'wordpress-for-writers' ) ) }`;
        if ( focused >= 0 ) {
            menu.querySelectorAll( '.wfw-menu__item' )[ focused ]?.focus();
        }
    }

    function toggleListMenu( open = ! state.listMenu, { focusFirst = false } = {} ) {
        state.listMenu = open;
        renderListMenu();
        if ( open && focusFirst ) {
            root.querySelector( '.wfw-menu .wfw-menu__item' )?.focus();
        } else if ( ! open && root.querySelector( '.wfw-list__head' ).contains( document.activeElement ) ) {
            root.querySelector( '.wfw-list__title' ).focus();
        }
    }

    // The menu stays open while options change, so preview styles can be compared in place.
    function setListOption( key, value ) {
        const list = state.list;
        if ( key === 'orderby' ) {
            if ( list.orderby === value ) {
                return;
            }
            list.orderby = value;
            list.order = value === 'title' ? 'asc' : 'desc';
        } else if ( key === 'order' ) {
            list.order = value;
        } else if ( key === 'lines' ) {
            list.lines = Number( value );
        } else if ( key === 'images' ) {
            list.images = ! list.images;
        }
        savePref( 'list', list );
        renderListHeader();
        renderListMenu();
        if ( key === 'lines' ) {
            renderListItems();
        } else {
            loadNotes();
        }
    }

    function noteHtml( note ) {
        const title = note.title.raw || htmlToText( note.title.rendered );
        const excerpt = state.list.lines ? htmlToText( note.excerpt.rendered ) : '';
        const isTrash = note.status === 'trash';
        // Drafts, Published, Scheduled and Trash already say the status; mixed lists show it per note.
        const filtered = state.view.type !== 'all' && STATUS_VIEWS.some( ( v ) => v.type === state.view.type );
        const status = filtered ? null : NOTE_STATUSES[ note.status ];
        const statusIcon = status
            ? `<span class="wfw-note__status wfw-note__status--${ esc( note.status ) }" role="img" title="${ esc( status.label ) }" aria-label="${ esc( status.label ) }">${ icon( status.icon ) }</span>`
            : '';
        // Prefer the square crop WordPress makes for thumbnails; the fixed box crops anything else.
        const media = note._embedded?.[ 'wp:featuredmedia' ]?.[ 0 ];
        const sizes = media?.media_details?.sizes || {};
        const thumb = state.list.images && media?.media_type === 'image' ? ( sizes.thumbnail || sizes.medium || media ).source_url : '';
        const date = state.list.orderby === 'date' ? note.date_gmt : note.modified_gmt;
        const thumbImg = `<img class="wfw-note__thumb" src="${ esc( thumb ) }" alt="" width="64" height="64" loading="lazy" />`;
        const actions = isTrash && settings.canDelete
            ? `<span class="wfw-icon-btn" role="button" data-action="restore" data-id="${ note.id }" title="${ esc( __( 'Restore', 'wordpress-for-writers' ) ) }">${ icon( 'restore' ) }</span>
               <span class="wfw-icon-btn" role="button" data-action="delete" data-id="${ note.id }" title="${ esc( __( 'Delete permanently', 'wordpress-for-writers' ) ) }">${ icon( 'close' ) }</span>`
            : isTrash ? '' : `${ FEATURED ? `<span class="wfw-icon-btn" role="button" data-action="featured" data-id="${ note.id }" title="${ esc( __( 'Featured image', 'wordpress-for-writers' ) ) }">${ icon( 'image' ) }</span>` : '' }
               ${ settings.canDelete ? `<span class="wfw-icon-btn" role="button" data-action="trash" data-id="${ note.id }" title="${ esc( __( 'Move to trash', 'wordpress-for-writers' ) ) }">${ icon( 'trash' ) }</span>` : '' }`;

        return `
            <div class="wfw-note${ note.id === state.activeId ? ' is-active' : '' }" role="listitem" tabindex="0" data-action="open" data-id="${ note.id }">
                <div class="wfw-note__title${ title ? '' : ' is-empty' }">${ esc( title || __( 'Untitled', 'wordpress-for-writers' ) ) }</div>
                ${ excerpt ? `<div class="wfw-note__excerpt">${ esc( excerpt ) }</div>` : '' }
                ${ thumb ? ( FEATURED ? `<button class="wfw-note__thumb-btn" data-action="featured" data-id="${ note.id }" title="${ esc( __( 'Change featured image', 'wordpress-for-writers' ) ) }">${ thumbImg }</button>` : thumbImg ) : '' }
                <div class="wfw-note__meta"><span>${ esc( formatDate( date ) ) }</span>${ statusIcon }</div>
                <div class="wfw-note__actions">${ actions }</div>
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
        state.featured?.root.unmount();
        state.featured = null;
        editor.querySelectorAll( 'iframe, .wfw-editor__placeholder, .wfw-editor__loading, .wfw-editor__skeleton, .wfw-media' ).forEach( ( el ) => el.remove() );
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

    // ---- Featured image ----------------------------------------------------

    /*
     * The note's featured image is picked in the editor pane, in place of the
     * editor. The panel is built from @wordpress/components and reads and saves
     * through core-data, like the editor's own featured image control; uploads
     * go through media-utils, which checks the site's allowed types and size
     * limit. Changes save straight to the note, so the panel stays read-only
     * while someone else has the note open (the editor's post lock).
     */
    const FEATURED = ( () => {
        if ( ! settings.featuredImages || ! wp.element?.createRoot || ! wp.components || ! wp.coreData || ! wp.mediaUtils ) {
            return null;
        }
        const { createElement: el, useState, useRef, useEffect } = wp.element;
        const { Button, DropZone, FormFileUpload, Notice, SearchControl, Spinner } = wp.components;
        const { useSelect, useDispatch } = wp.data;
        const coreStore = wp.coreData.store;
        const PER_PAGE = 24;
        const svg = ( d ) => el( 'svg', { viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true }, el( 'path', { d } ) );
        const ICON_UPLOAD = svg( 'M18.5 15v3.5H13V6.7l4.5 4.1 1-1.1-6.2-5.8-5.8 5.8 1 1.1 4-4v11.7h-6V15H4v5h16v-5z' );
        const ICON_IMAGE = svg( 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z' );

        function mediaUrl( media, prefer ) {
            const sizes = media?.media_details?.sizes || {};
            const size = prefer.find( ( name ) => sizes[ name ] );
            return size ? sizes[ size ].source_url : media?.source_url || '';
        }

        // An accessible name for an image tile: its alt text, else its title, else its file name.
        function mediaName( media ) {
            return media.alt_text || htmlToText( media.title?.rendered ) || ( media.source_url || '' ).split( '/' ).pop();
        }

        function Panel( { postId, onBack, onSaved } ) {
            const [ pages, setPages ] = useState( 1 );
            const [ searchInput, setSearchInput ] = useState( '' );
            const [ search, setSearch ] = useState( '' );
            const sentinelRef = useRef( null );
            const [ busy, setBusy ] = useState( '' );
            const [ error, setError ] = useState( '' );
            const uploadedRef = useRef( false );
            const { editEntityRecord, saveEditedEntityRecord, invalidateResolutionForStoreSelector } = useDispatch( coreStore );

            const { post, current, library, libraryLoading, hasMore } = useSelect( ( select ) => {
                const core = select( coreStore );
                const record = core.getEntityRecord( 'postType', 'post', postId );
                const mediaId = record?.featured_media;
                let items = [];
                let loading = false;
                let totalPages = 1;
                for ( let page = 1; page <= pages; page++ ) {
                    const query = { media_type: 'image', per_page: PER_PAGE, page };
                    if ( search ) {
                        query.search = search;
                    }
                    const records = core.getEntityRecords( 'postType', 'attachment', query );
                    loading = loading || records === null;
                    items = items.concat( records || [] );
                    totalPages = core.getEntityRecordsTotalPages?.( 'postType', 'attachment', query ) ?? totalPages;
                }
                return {
                    post: record,
                    current: mediaId ? core.getEntityRecord( 'postType', 'attachment', mediaId ) : null,
                    library: items,
                    libraryLoading: loading,
                    hasMore: pages < totalPages,
                };
            }, [ postId, pages, search ] );

            // Search as you type, a moment after typing stops; each new search starts from page one.
            useEffect( () => {
                const value = searchInput.trim();
                const timer = setTimeout( () => {
                    if ( value !== search ) {
                        setSearch( value );
                        setPages( 1 );
                    }
                }, 300 );
                return () => clearTimeout( timer );
            }, [ searchInput, search ] );

            // Load the next page when the end of the grid scrolls into view. The panel is the scroller.
            useEffect( () => {
                const sentinel = sentinelRef.current;
                if ( ! sentinel || ! hasMore || libraryLoading ) {
                    return;
                }
                const observer = new window.IntersectionObserver( ( [ entry ] ) => {
                    if ( entry.isIntersecting ) {
                        setPages( ( count ) => count + 1 );
                    }
                }, { root: sentinel.closest( '.wfw-media' ), rootMargin: '0px 0px 400px 0px' } );
                observer.observe( sentinel );
                return () => observer.disconnect();
            }, [ hasMore, libraryLoading ] );

            const lockedBy = post?.wfw_locked_by || '';
            const currentId = post?.featured_media || 0;
            const disabled = !! busy || ! post || !! lockedBy;

            async function setImage( mediaId ) {
                setBusy( 'save' );
                setError( '' );
                editEntityRecord( 'postType', 'post', postId, { featured_media: mediaId } );
                try {
                    await saveEditedEntityRecord( 'postType', 'post', postId, { throwOnError: true } );
                    onSaved();
                } catch ( e ) {
                    // Drop the unsaved edit so the panel shows what is really stored.
                    editEntityRecord( 'postType', 'post', postId, { featured_media: currentId } );
                    setError( e?.message || __( 'The image could not be saved.', 'wordpress-for-writers' ) );
                }
                setBusy( '' );
            }

            function upload( files ) {
                if ( disabled || ! files?.length ) {
                    return;
                }
                setBusy( 'upload' );
                setError( '' );
                uploadedRef.current = false;
                wp.mediaUtils.uploadMedia( {
                    filesList: [ files[ 0 ] ],
                    allowedTypes: [ 'image' ],
                    maxUploadFileSize: Number( settings.maxUploadFileSize ) || undefined,
                    wpAllowedMimeTypes: settings.allowedMimeTypes,
                    additionalData: { post: postId },
                    // Called first with a local preview (no id), then with the saved attachment.
                    onFileChange: ( [ media ] ) => {
                        if ( ! media?.id || uploadedRef.current ) {
                            return;
                        }
                        uploadedRef.current = true;
                        invalidateResolutionForStoreSelector( 'getEntityRecords' );
                        setImage( media.id );
                    },
                    onError: ( err ) => {
                        setBusy( '' );
                        setError( err?.message || __( 'The upload failed.', 'wordpress-for-writers' ) );
                    },
                } );
            }

            const title = post ? post.title?.raw || __( 'Untitled', 'wordpress-for-writers' ) : '';
            const status = { upload: __( 'Uploading…', 'wordpress-for-writers' ), save: __( 'Saving…', 'wordpress-for-writers' ) }[ busy ];
            const emptyText = lockedBy
                ? __( 'No featured image.', 'wordpress-for-writers' )
                : settings.canUpload
                ? __( 'No featured image. Upload one, drop it here, or pick from your images below.', 'wordpress-for-writers' )
                : __( 'No featured image. Pick one from your images below.', 'wordpress-for-writers' );

            return el( 'div', { className: 'wfw-media__column' },
                el( 'div', { className: 'wfw-media__head' },
                    el( 'div', { className: 'wfw-media__heading' },
                        el( 'div', { className: 'wfw-media__eyebrow' }, __( 'Featured image', 'wordpress-for-writers' ) ),
                        el( 'h2', { className: 'wfw-media__title' + ( post?.title?.raw ? '' : ' is-empty' ) }, title || ' ' )
                    ),
                    el( Button, { variant: 'secondary', className: 'wfw-media__back', onClick: onBack }, __( 'Back to note', 'wordpress-for-writers' ) )
                ),
                lockedBy && el( Notice, { status: 'warning', isDismissible: false, className: 'wfw-media__notice' },
                    /* translators: %s: name of the user editing the note. */
                    sprintf( __( '%s is editing this note, so its featured image can’t be changed right now.', 'wordpress-for-writers' ), lockedBy )
                ),
                error && el( Notice, { status: 'error', onRemove: () => setError( '' ), className: 'wfw-media__notice' }, error ),
                el( 'div', { className: 'wfw-media__current' + ( current ? '' : ' is-empty' ) },
                    ! post && el( Spinner ),
                    post && current && el( 'img', { src: mediaUrl( current, [ 'large', 'medium_large', 'medium' ] ), alt: current.alt_text || '' } ),
                    post && !! currentId && ! current && el( Spinner ),
                    post && ! currentId && el( 'div', { className: 'wfw-media__empty' }, ICON_IMAGE, el( 'span', null, emptyText ) ),
                    settings.canUpload && ! disabled && el( DropZone, { onFilesDrop: upload, label: __( 'Drop an image to upload it', 'wordpress-for-writers' ) } )
                ),
                post && el( 'div', { className: 'wfw-media__actions' },
                    settings.canUpload && el( FormFileUpload, {
                        accept: 'image/*',
                        onChange: ( event ) => upload( event.currentTarget.files ),
                        render: ( { openFileDialog } ) => el( Button, { variant: 'primary', icon: ICON_UPLOAD, onClick: openFileDialog, disabled, __next40pxDefaultSize: true },
                            currentId ? __( 'Upload new', 'wordpress-for-writers' ) : __( 'Upload', 'wordpress-for-writers' ) ),
                    } ),
                    !! currentId && el( Button, { variant: 'tertiary', isDestructive: true, onClick: () => setImage( 0 ), disabled, __next40pxDefaultSize: true }, __( 'Remove', 'wordpress-for-writers' ) ),
                    status && el( 'span', { className: 'wfw-media__status', role: 'status' }, el( Spinner ), status )
                ),
                el( 'div', {
                    className: 'wfw-media__library-head',
                    // Escape clears a search before it leaves the panel.
                    onKeyDown: ( event ) => {
                        if ( event.key === 'Escape' && searchInput ) {
                            event.preventDefault();
                            setSearchInput( '' );
                        }
                    },
                },
                    el( 'h3', { className: 'wfw-media__label', id: 'wfw-media-library' }, __( 'Your images', 'wordpress-for-writers' ) ),
                    el( SearchControl, {
                        className: 'wfw-media__search',
                        value: searchInput,
                        onChange: setSearchInput,
                        label: __( 'Search images', 'wordpress-for-writers' ),
                        placeholder: __( 'Search images', 'wordpress-for-writers' ),
                        size: 'compact',
                        __nextHasNoMarginBottom: true,
                    } )
                ),
                ! libraryLoading && ! library.length && el( 'p', { className: 'wfw-media__none' },
                    search
                        /* translators: %s: the search terms. */
                        ? sprintf( __( 'No images match “%s”.', 'wordpress-for-writers' ), search )
                        : __( 'No images yet.', 'wordpress-for-writers' )
                ),
                library.length > 0 && el( 'div', { className: 'wfw-media__grid', role: 'list', 'aria-labelledby': 'wfw-media-library', 'aria-busy': libraryLoading },
                    library.map( ( media ) => el( 'div', { key: media.id, role: 'listitem' },
                        el( Button, {
                            className: 'wfw-media__tile',
                            isPressed: media.id === currentId,
                            label: mediaName( media ),
                            showTooltip: false,
                            disabled: disabled && media.id !== currentId,
                            accessibleWhenDisabled: true,
                            onClick: () => media.id !== currentId && setImage( media.id ),
                        }, el( 'img', { src: mediaUrl( media, [ 'thumbnail', 'medium' ] ), alt: '', loading: 'lazy' } ) )
                    ) )
                ),
                hasMore && el( 'div', { ref: sentinelRef, className: 'wfw-media__sentinel', 'aria-hidden': true } ),
                libraryLoading && el( 'div', { className: 'wfw-media__loading' }, el( Spinner ) )
            );
        }

        return { el, Panel };
    } )();

    async function openFeatured( id ) {
        if ( ! FEATURED || ! ( await canLeaveEditor() ) ) {
            return;
        }
        state.activeId = id;
        markActive();
        window.history.replaceState( null, '', '#image=' + id );
        mountEditor( null );
        root.classList.add( 'has-note' );
        const editor = root.querySelector( '.wfw-editor' );
        editor.querySelector( '.wfw-editor__placeholder' )?.remove();
        const host = document.createElement( 'div' );
        host.className = 'wfw-media';
        host.setAttribute( 'role', 'region' );
        host.setAttribute( 'aria-label', __( 'Featured image', 'wordpress-for-writers' ) );
        editor.appendChild( host );
        const panelRoot = wp.element.createRoot( host );
        panelRoot.render( FEATURED.el( FEATURED.Panel, { postId: id, onBack: () => openNote( id ), onSaved: () => loadNotes() } ) );
        state.featured = { id, root: panelRoot };
    }

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
                state.listMenu = false;
                renderListMenu();
                renderSidebar();
                renderListHeader();
                loadNotes();
                break;
            case 'list-menu':
                toggleListMenu( undefined, { focusFirst: event.detail === 0 } );
                break;
            case 'list-option':
                setListOption( target.dataset.key, target.dataset.value );
                break;
            case 'open':
                openNote( id );
                break;
            case 'featured':
                event.stopPropagation();
                openFeatured( id );
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

    document.addEventListener( 'pointerdown', ( event ) => {
        if ( state.listMenu && ! event.target.closest( '.wfw-list__head' ) ) {
            toggleListMenu( false );
        }
    } );

    root.addEventListener( 'keydown', ( event ) => {
        const menu = event.target.closest( '.wfw-menu' );
        if ( menu && ( event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' ) ) {
            event.preventDefault();
            const items = [ ...menu.querySelectorAll( '.wfw-menu__item' ) ];
            const i = items.indexOf( event.target );
            const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[ event.key ];
            items[ ( next + items.length ) % items.length ].focus();
            return;
        }
        if ( event.key === 'Tab' && menu ) {
            toggleListMenu( false );
        }
    } );

    root.addEventListener( 'keydown', ( event ) => {
        if ( event.key === 'Enter' && event.target.classList.contains( 'wfw-note' ) ) {
            openNote( Number( event.target.dataset.id ) );
        }
    } );

    document.addEventListener( 'keydown', ( event ) => {
        if ( event.key === 'Escape' && state.listMenu ) {
            toggleListMenu( false );
        } else if ( event.key === 'Escape' && root.querySelector( '.wfw-sheet' ) ) {
            closeAppearance();
        } else if ( event.key === 'Escape' && state.featured && ! event.defaultPrevented ) {
            openNote( state.featured.id );
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

    const hashMatch = window.location.hash.match( /(note|image)=(\d+)/ );
    if ( hashMatch ) {
        ( hashMatch[ 1 ] === 'image' ? openFeatured : openNote )( Number( hashMatch[ 2 ] ) );
    }
} )();
