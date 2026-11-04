( function () {
    const apiFetch = wp.apiFetch;
    const { __, _n, sprintf } = wp.i18n;
    const settings = window.wfwSettings;
    const root = document.getElementById( 'wfw-app' );

    // Glyphs from @wordpress/icons 15.2.0 (GPL-2.0-or-later), the filled 24x24 set
    // WordPress 7.1's editor ships; each line ends with the icon's name there. The
    // package has no log-out glyph, so `logout` is `login` with its door flipped.
    const ICONS = {
        notes: '<path d="M15.5 7.5h-7V9h7V7.5Zm-7 3.5h7v1.5h-7V11Zm7 3.5h-7V16h7v-1.5Z"/><path d="M17 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM7 5.5h10a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5Z"/>', // page
        draft: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 18.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm8 4a4 4 0 0 0 4-4H8a4 4 0 0 0 4 4Z"/>', // drafts
        publish: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 18.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm11.53-1.47-1.06-1.06L11 12.94l-1.47-1.47-1.06 1.06L11 15.06l4.53-4.53Z"/>', // published
        future: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 18.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm9 1V8h-1.5v3.5h-2V13H13Z"/>', // scheduled
        trash: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 5.5A2.25 2.25 0 0 0 9.878 7h4.244A2.251 2.251 0 0 0 12 5.5ZM12 4a3.751 3.751 0 0 0-3.675 3H5v1.5h1.27l.818 8.997a2.75 2.75 0 0 0 2.739 2.501h4.347a2.75 2.75 0 0 0 2.738-2.5L17.73 8.5H19V7h-3.325A3.751 3.751 0 0 0 12 4Zm4.224 4.5H7.776l.806 8.861a1.25 1.25 0 0 0 1.245 1.137h4.347a1.25 1.25 0 0 0 1.245-1.137l.805-8.861Z"/>', // trash
        folder: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.848 8a1 1 0 0 1-.914-.594l-.723-1.63a.5.5 0 0 0-.447-.276H5a.5.5 0 0 0-.5.5v11.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5v-9A.5.5 0 0 0 19 8h-6.152Zm.612-1.5a.5.5 0 0 1-.462-.31l-.445-1.084A2 2 0 0 0 10.763 4H5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-5.54Z"/>', // file
        search: '<path d="M13 5c-3.3 0-6 2.7-6 6 0 1.4.5 2.7 1.3 3.7l-3.8 3.8 1.1 1.1 3.8-3.8c1 .8 2.3 1.3 3.7 1.3 3.3 0 6-2.7 6-6S16.3 5 13 5zm0 10.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z"/>', // search
        compose: '<path d="M18.5 5.5V8H20V5.5h2.5V4H20V1.5h-1.5V4H16v1.5h2.5zM12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6h-1.5v6a.5.5 0 01-.5.5H6a.5.5 0 01-.5-.5V6a.5.5 0 01.5-.5h6V4z"/>', // add-card
        sidebar: '<path fill-rule="evenodd" clip-rule="evenodd" d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM8.5 18.5H6c-.3 0-.5-.2-.5-.5V6c0-.3.2-.5.5-.5h2.5v13zm10-.5c0 .3-.2.5-.5.5h-8v-13h8c.3 0 .5.2.5.5v12z"/>', // drawer-left
        focus: '<path d="M7 18h4.5v1.5h-7v-7H6V17L17 6h-4.5V4.5h7v7H18V7L7 18Z"/>', // resize-corner-ne
        restore: '<path d="M13.75 4.194a8 8 0 0 0-4.812.415l-.301.132a8 8 0 0 0-3.203 2.692L4 6.001v4h4L6.517 8.516q.333-.526.758-.977l.011-.012q.341-.359.733-.662l.025-.02a6.5 6.5 0 0 1 2.469-1.172l.034-.008q.117-.027.236-.05l.015-.002q.32-.06.65-.088.08-.008.16-.013a7 7 0 0 1 .323-.01L12 5.5h.05l.203.005.101.003q.146.008.293.023l.12.014.158.02q.103.015.205.033l.058.011q.107.02.212.043l.068.016a6.5 6.5 0 0 1 1.447.521l.02.01a7 7 0 0 1 .452.25l.02.014a7 7 0 0 1 .468.317l.07.054a7 7 0 0 1 .403.334l.034.03q.091.084.18.172l.047.045q.293.294.548.627l.03.038.07.097.096.135q.037.053.072.107a6 6 0 0 1 .167.265l.042.073q.236.411.413.857l.027.07a6.5 6.5 0 0 1 .418 2.014 6.6 6.6 0 0 1-.034 1.04 6 6 0 0 1-.063.424q-.109.597-.32 1.152-.016.034-.028.07a6.5 6.5 0 0 1-.413.856l-.042.073a6 6 0 0 1-.327.497l-.087.118-.02.028a7 7 0 0 1-.526.604l-.035.035-.035.032q-.089.088-.18.172l-.034.03a7 7 0 0 1-.38.317l-.093.071q-.09.067-.183.13l-.076.053q-.112.076-.227.146-.218.133-.446.247l-.028.015-.192.093-.081.036a6.5 6.5 0 0 1-1.184.396l-.058.012a7 7 0 0 1-.475.087q-.08.012-.157.02l-.122.014q-.145.015-.292.023l-.136.005-.139.003L12 18.5q-.053-.002-.104-.003l-.127-.004-.162-.007q-.08-.005-.159-.013a7 7 0 0 1-.65-.088q-.008 0-.015-.002a7 7 0 0 1-.236-.05l-.034-.008a6.5 6.5 0 0 1-4.14-3.077l-1.3.75a8 8 0 0 0 3.564 3.26l.301.131a8 8 0 0 0 11.055-7.061l.007-.33c0-1.76-.581-3.473-1.653-4.87l-.206-.256a8 8 0 0 0-4.07-2.6zM12 7.75a.75.75 0 0 0-.75.75V12a.75.75 0 0 0 .218.529l1.282-.839-1.28.84 2.5 2.5a.75.75 0 1 0 1.06-1.06l-2.28-2.28V8.5a.75.75 0 0 0-.75-.75"/>', // backup
        close: '<path d="m13.06 12 6.47-6.47-1.06-1.06L12 10.94 5.53 4.47 4.47 5.53 10.94 12l-6.47 6.47 1.06 1.06L12 13.06l6.47 6.47 1.06-1.06L13.06 12Z"/>', // close
        back: '<path d="M14.6 7l-1.2-1L8 12l5.4 6 1.2-1-4.6-5z"/>', // chevron-left
        external: '<path d="M19.5 4.5h-7V6h4.44l-5.97 5.97 1.06 1.06L18 7.06v4.44h1.5v-7Zm-13 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3H17v3a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h3V5.5h-3Z"/>', // external
        appearance: '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.289 4.836A1 1 0 0111.275 4h1.306a1 1 0 01.987.836l.244 1.466c.787.26 1.503.679 2.108 1.218l1.393-.522a1 1 0 011.216.437l.653 1.13a1 1 0 01-.23 1.273l-1.148.944a6.025 6.025 0 010 2.435l1.149.946a1 1 0 01.23 1.272l-.653 1.13a1 1 0 01-1.216.437l-1.394-.522c-.605.54-1.32.958-2.108 1.218l-.244 1.466a1 1 0 01-.987.836h-1.306a1 1 0 01-.986-.836l-.244-1.466a5.995 5.995 0 01-2.108-1.218l-1.394.522a1 1 0 01-1.217-.436l-.653-1.131a1 1 0 01.23-1.272l1.149-.946a6.026 6.026 0 010-2.435l-1.148-.944a1 1 0 01-.23-1.272l.653-1.131a1 1 0 011.217-.437l1.393.522a5.994 5.994 0 012.108-1.218l.244-1.466zM14.929 12a3 3 0 11-6 0 3 3 0 016 0z"/>', // cog
        dashboard: '<path d="M12 5a8 8 0 0 1 3.842.984L14.726 7.1a6.502 6.502 0 0 0-7.323 1.303 6.5 6.5 0 0 0 0 9.194l-1.06 1.06A8 8 0 0 1 12 5Zm7.021 4.168a8 8 0 0 1-1.364 9.49l-1.06-1.061a6.5 6.5 0 0 0 1.307-7.312l1.117-1.117ZM17.47 6.47a.75.75 0 1 1 1.06 1.06l-5.083 5.082a1.5 1.5 0 1 1-1.06-1.06L17.47 6.47Z"/>', // dashboard
        logout: '<path d="M16.8 5h-7c-1.1 0-2 .9-2 2v1.5h1.5V7c0-.3.2-.5.5-.5h7c.3 0 .5.2.5.5v10c0 .3-.2.5-.5.5h-7c-.3 0-.5-.2-.5-.5v-1.5H7.8V17c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z" transform="matrix(-1 0 0 1 22.8 0)"/><path d="M11 14.5l1.1 1.1 3-3 .5-.5-.6-.6-3-3-1 1 1.7 1.7H5v1.5h7.7L11 14.5z" transform="translate(4.4 0)"/>', // login, flipped
        profile: '<path fill-rule="evenodd" clip-rule="evenodd" d="M7.25 16.437a6.5 6.5 0 1 1 9.5 0V16A2.75 2.75 0 0 0 14 13.25h-4A2.75 2.75 0 0 0 7.25 16v.437Zm1.5 1.193a6.47 6.47 0 0 0 3.25.87 6.47 6.47 0 0 0 3.25-.87V16c0-.69-.56-1.25-1.25-1.25h-4c-.69 0-1.25.56-1.25 1.25v1.63ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm10-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>', // comment-author-avatar
        dropdown: '<path d="m15.99 10.889-3.988 3.418-3.988-3.418.976-1.14 3.012 2.582 3.012-2.581.976 1.139Z"/>', // chevron-down-small
        check: '<path d="M16.7 7.1l-6.3 8.5-3.3-2.5-.9 1.2 4.5 3.4L17.9 8z"/>', // check
        image: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z"/>', // image
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
        collapsed: loadPref( 'collapsed', {} ),
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
        return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[ name ] + '</svg>';
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
        const isCategory = state.view.type === 'category';
        const list = isCategory ? state.categories : state.tags;
        const term = list.find( ( t ) => t.id === state.view.id );
        if ( ! term ) {
            return '';
        }
        // Match the sidebar: tags are marked with a #, categories with a folder icon.
        return isCategory ? term.name : '# ' + term.name;
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
                    <button class="wfw-icon-btn" data-action="new" title="${ esc( __( 'New note', 'wordpress-for-writers' ) ) }">${ icon( 'compose' ) }</button>
                </div>
                <div class="wfw-list__head">
                    <button class="wfw-list__title" data-action="list-menu" aria-haspopup="menu" aria-expanded="false"><span class="wfw-list__label"></span>${ icon( 'dropdown' ) }</button>
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

    // Categories and Tags fold away under a heading that works like a nav item.
    function sidebarSection( key, label, items ) {
        const open = ! state.collapsed[ key ];
        return `
            <button class="wfw-nav wfw-sidebar__section" data-action="toggle-section" data-section="${ esc( key ) }" aria-expanded="${ open ? 'true' : 'false' }" aria-controls="wfw-section-${ esc( key ) }">
                <span class="wfw-nav__icon wfw-sidebar__chevron">${ icon( 'back' ) }</span>
                <span class="wfw-nav__label">${ esc( label ) }</span>
            </button>
            <div class="wfw-sidebar__items" id="wfw-section-${ esc( key ) }">${ items }</div>`;
    }

    function renderSidebar() {
        const sidebar = root.querySelector( '.wfw-sidebar' );
        const avatar = settings.avatarUrl
            ? `<img class="wfw-user__avatar" src="${ esc( settings.avatarUrl ) }" alt="" />`
            : `<span class="wfw-user__avatar">${ esc( Array.from( settings.userName.trim() )[ 0 ] ) }</span>`;
        const label = ( text ) => `title="${ esc( text ) }" aria-label="${ esc( text ) }"`;
        const menuItem = ( href, iconName, text ) => `<a class="wfw-menu__item" role="menuitem" tabindex="-1" data-action="menu-item" href="${ esc( href ) }">${ icon( iconName ) }<span>${ esc( text ) }</span></a>`;
        // Drafts' autosaves re-render the sidebar every few seconds: keep focus on
        // the same footer control (the open menu itself survives via userMenuOpen).
        const footControls = () => [ ...sidebar.querySelectorAll( '.wfw-sidebar__foot :is( a, button )' ) ];
        const focusedControl = footControls().indexOf( document.activeElement );
        const statusNav = STATUS_VIEWS.map( ( v ) => navButton( { type: v.type }, v.label, icon( v.icon ), state.counts[ v.type ] ) ).join( '' );
        const tags = state.tags
            .map( ( t ) => navButton( { type: 'tag', id: t.id }, t.name, '<span class="wfw-nav__hash">#</span>' ) )
            .join( '' );
        const siteIcon = settings.siteIcon ? `<img class="wfw-sidebar__icon" src="${ esc( settings.siteIcon ) }" alt="" />` : '';

        sidebar.innerHTML = `
            <div class="wfw-sidebar__head">${ siteIcon }<span class="wfw-sidebar__name">${ esc( settings.siteName ) }</span></div>
            <div class="wfw-sidebar__scroll">
                ${ statusNav }
                ${ state.categories.length ? sidebarSection( 'categories', __( 'Categories', 'wordpress-for-writers' ), categoryTree( 0, 0 ) ) : '' }
                ${ state.tags.length ? sidebarSection( 'tags', __( 'Tags', 'wordpress-for-writers' ), tags ) : '' }
            </div>
            <div class="wfw-sidebar__foot">
                <button class="wfw-user" id="wfw-user" data-action="user-menu" aria-haspopup="menu" aria-expanded="${ userMenuOpen ? 'true' : 'false' }" aria-controls="wfw-user-menu">${ avatar }<span class="wfw-user__name" title="${ esc( settings.userName ) }">${ esc( settings.userName ) }</span>${ icon( 'dropdown' ) }</button>
                <div class="wfw-menu" id="wfw-user-menu" role="menu" aria-labelledby="wfw-user"${ userMenuOpen ? '' : ' hidden' }>
                    ${ menuItem( settings.adminUrl + 'index.php?wfw_classic=1', 'dashboard', __( 'Go to admin', 'wordpress-for-writers' ) ) }
                    ${ menuItem( settings.adminUrl + 'profile.php', 'profile', __( 'Edit profile', 'wordpress-for-writers' ) ) }
                    <div class="wfw-menu__separator" role="separator"></div>
                    ${ menuItem( settings.logoutUrl, 'logout', sprintf( __( 'Log out %s', 'wordpress-for-writers' ), settings.userName ) ) }
                </div>
                <a class="wfw-icon-btn" href="${ esc( settings.siteUrl ) }" target="_blank" rel="noopener" ${ label( __( 'View site', 'wordpress-for-writers' ) ) }>${ icon( 'external' ) }</a>
                <button class="wfw-icon-btn" data-action="appearance" ${ label( __( 'Appearance', 'wordpress-for-writers' ) ) }>${ icon( 'appearance' ) }</button>
            </div>
        `;
        revealSiteIcon( sidebar.querySelector( '.wfw-sidebar__icon' ) );
        if ( focusedControl >= 0 ) {
            footControls()[ focusedControl ].focus();
        }
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

    function listMenuItem( role, checked, key, value, label ) {
        return `<button class="wfw-list-menu__item" role="${ role }" aria-checked="${ checked }" tabindex="-1" data-action="list-option" data-key="${ key }" data-value="${ esc( value ) }">${ checked ? icon( 'check' ) : '<span class="wfw-list-menu__spacer"></span>' }<span>${ esc( label ) }</span></button>`;
    }

    function renderListMenu() {
        const head = root.querySelector( '.wfw-list__head' );
        const toggle = head.querySelector( '.wfw-list__title' );
        toggle.setAttribute( 'aria-expanded', state.listMenu ? 'true' : 'false' );
        let menu = head.querySelector( '.wfw-list-menu' );
        if ( ! state.listMenu ) {
            menu?.remove();
            return;
        }
        if ( ! menu ) {
            menu = document.createElement( 'div' );
            menu.className = 'wfw-list-menu';
            menu.setAttribute( 'role', 'menu' );
            menu.setAttribute( 'aria-label', __( 'List options', 'wordpress-for-writers' ) );
            head.appendChild( menu );
        }
        const focused = menu.contains( document.activeElement ) ? [ ...menu.querySelectorAll( '.wfw-list-menu__item' ) ].indexOf( document.activeElement ) : -1;
        const { list } = state;
        /* translators: %d: number of notes in the list. */
        const count = sprintf( _n( '%d note', '%d notes', state.total, 'wordpress-for-writers' ), state.total );
        menu.innerHTML = `
            <div class="wfw-list-menu__count">${ esc( count ) }</div>
            <div class="wfw-list-menu__label" id="wfw-list-menu-sort">${ esc( __( 'Sort by', 'wordpress-for-writers' ) ) }</div>
            <div role="group" aria-labelledby="wfw-list-menu-sort">${ SORT_FIELDS.map( ( f ) => listMenuItem( 'menuitemradio', list.orderby === f.value, 'orderby', f.value, f.label ) ).join( '' ) }</div>
            <div class="wfw-list-menu__sep" role="separator"></div>
            <div role="group" aria-label="${ esc( __( 'Order', 'wordpress-for-writers' ) ) }">${ orderChoices().map( ( o ) => listMenuItem( 'menuitemradio', list.order === o.value, 'order', o.value, o.label ) ).join( '' ) }</div>
            <div class="wfw-list-menu__sep" role="separator"></div>
            <div class="wfw-list-menu__label" id="wfw-list-menu-preview">${ esc( __( 'Preview', 'wordpress-for-writers' ) ) }</div>
            <div role="group" aria-labelledby="wfw-list-menu-preview">${ PREVIEW_LINES.map( ( p ) => listMenuItem( 'menuitemradio', list.lines === p.value, 'lines', p.value, p.label ) ).join( '' ) }</div>
            <div class="wfw-list-menu__sep" role="separator"></div>
            ${ listMenuItem( 'menuitemcheckbox', list.images, 'images', '', __( 'Show images', 'wordpress-for-writers' ) ) }`;
        if ( focused >= 0 ) {
            menu.querySelectorAll( '.wfw-list-menu__item' )[ focused ]?.focus();
        }
    }

    function toggleListMenu( open = ! state.listMenu, { focusFirst = false } = {} ) {
        state.listMenu = open;
        renderListMenu();
        if ( open && focusFirst ) {
            root.querySelector( '.wfw-list-menu .wfw-list-menu__item' )?.focus();
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
            : isTrash || ! settings.canDelete ? '' : `<span class="wfw-icon-btn" role="button" data-action="trash" data-id="${ note.id }" title="${ esc( __( 'Move to trash', 'wordpress-for-writers' ) ) }">${ icon( 'trash' ) }</span>`;

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
            case 'featured-image': {
                if ( FEATURED && data.id ) {
                    openFeatured( data.id );
                }
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
            // The last pages read and the list made from them, so the selector returns
            // the same array until a page changes (useSelect compares by reference).
            const libraryRef = useRef( { pages: [], items: [] } );
            const [ busy, setBusy ] = useState( '' );
            const [ error, setError ] = useState( '' );
            const uploadedRef = useRef( false );
            const { editEntityRecord, saveEditedEntityRecord, invalidateResolutionForStoreSelector } = useDispatch( coreStore );

            const { post, current, library, libraryLoading, hasMore } = useSelect( ( select ) => {
                const core = select( coreStore );
                const record = core.getEntityRecord( 'postType', 'post', postId );
                const mediaId = record?.featured_media;
                const pageRecords = [];
                let loading = false;
                let totalPages = 1;
                for ( let page = 1; page <= pages; page++ ) {
                    const query = { media_type: 'image', per_page: PER_PAGE, page };
                    if ( search ) {
                        query.search = search;
                    }
                    const records = core.getEntityRecords( 'postType', 'attachment', query );
                    loading = loading || records === null;
                    pageRecords.push( records );
                    totalPages = core.getEntityRecordsTotalPages?.( 'postType', 'attachment', query ) ?? totalPages;
                }
                const last = libraryRef.current;
                if ( pageRecords.length !== last.pages.length || pageRecords.some( ( records, i ) => records !== last.pages[ i ] ) ) {
                    libraryRef.current = { pages: pageRecords, items: pageRecords.flatMap( ( records ) => records || [] ) };
                }
                return {
                    post: record,
                    current: mediaId ? core.getEntityRecord( 'postType', 'attachment', mediaId ) : null,
                    library: libraryRef.current.items,
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

    // ---- Account menu ------------------------------------------------------

    // The avatar and name open a menu of account links that follows the WAI-ARIA
    // menu button pattern. It opens upward from the sidebar's footer.
    let userMenuOpen = false;

    function syncUserMenu() {
        root.querySelector( '.wfw-user' )?.setAttribute( 'aria-expanded', userMenuOpen ? 'true' : 'false' );
        const menu = root.querySelector( '.wfw-menu' );
        if ( menu ) {
            menu.hidden = ! userMenuOpen;
        }
    }

    // Focuses item `index` once open; a negative index counts from the end.
    function openUserMenu( index = 0 ) {
        userMenuOpen = true;
        syncUserMenu();
        const items = root.querySelectorAll( '.wfw-menu [role="menuitem"]' );
        items[ ( index + items.length ) % items.length ]?.focus();
    }

    function closeUserMenu( returnFocus = true ) {
        if ( ! userMenuOpen ) {
            return;
        }
        userMenuOpen = false;
        syncUserMenu();
        if ( returnFocus ) {
            root.querySelector( '.wfw-user' )?.focus();
        }
    }

    root.addEventListener( 'keydown', ( event ) => {
        const onButton = event.target.closest( '.wfw-user' );
        const menu = event.target.closest( '.wfw-menu' );
        if ( ! onButton && ! menu ) {
            return;
        }
        if ( event.key === 'Escape' && userMenuOpen ) {
            event.preventDefault();
            event.stopPropagation();
            closeUserMenu();
            return;
        }
        if ( onButton ) {
            if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
                event.preventDefault();
                openUserMenu( event.key === 'ArrowDown' ? 0 : -1 );
            }
            return;
        }
        const items = [ ...menu.querySelectorAll( '[role="menuitem"]' ) ];
        const index = items.indexOf( event.target );
        switch ( event.key ) {
            case 'ArrowDown':
            case 'ArrowUp':
            case 'Home':
            case 'End': {
                event.preventDefault();
                const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: -1 }[ event.key ];
                items[ ( next + items.length ) % items.length ].focus();
                break;
            }
            case 'Tab':
                // Focus goes back to the button, and the browser's Tab then moves on from there.
                closeUserMenu();
                break;
            case ' ':
                event.preventDefault();
                event.target.click();
                break;
        }
    } );

    // A click outside closes the menu. So does the page losing focus, which is how
    // a click into the editor's iframe shows up here.
    document.addEventListener( 'pointerdown', ( event ) => {
        if ( userMenuOpen && ! event.target.closest( '.wfw-user, .wfw-menu' ) ) {
            closeUserMenu( false );
        }
    } );
    window.addEventListener( 'blur', () => closeUserMenu( false ) );

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
            case 'toggle-section': {
                // Flipped in place rather than re-rendered, so keyboard focus stays on the heading.
                const key = target.dataset.section;
                state.collapsed[ key ] = ! state.collapsed[ key ];
                savePref( 'collapsed', state.collapsed );
                target.setAttribute( 'aria-expanded', state.collapsed[ key ] ? 'false' : 'true' );
                break;
            }
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
            case 'user-menu':
                if ( userMenuOpen ) {
                    closeUserMenu();
                } else {
                    openUserMenu();
                }
                break;
            case 'menu-item':
                closeUserMenu();
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
        const menu = event.target.closest( '.wfw-list-menu' );
        if ( menu && ( event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' ) ) {
            event.preventDefault();
            const items = [ ...menu.querySelectorAll( '.wfw-list-menu__item' ) ];
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

    // Reopen a folded section that holds the restored category or tag view, so
    // the active item is in sight. Folding it later in the session is left alone.
    const activeSection = { category: 'categories', tag: 'tags' }[ state.view.type ];
    if ( activeSection && state.collapsed[ activeSection ] ) {
        state.collapsed[ activeSection ] = false;
        savePref( 'collapsed', state.collapsed );
    }

    renderShell();
    renderSidebar();
    renderListHeader();
    refresh();

    const hashMatch = window.location.hash.match( /(note|image)=(\d+)/ );
    if ( hashMatch ) {
        ( hashMatch[ 1 ] === 'image' ? openFeatured : openNote )( Number( hashMatch[ 2 ] ) );
    }
} )();
