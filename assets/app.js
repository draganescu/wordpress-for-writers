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
        updates: '<path d="m11.3 17.2-5-5c-.1-.1-.1-.3 0-.4l2.3-2.3-1.1-1-2.3 2.3c-.7.7-.7 1.8 0 2.5l5 5H7.5v1.5h5.3v-5.2h-1.5v2.6zm7.5-6.4-5-5h2.7V4.2h-5.2v5.2h1.5V6.8l5 5c.1.1.1.3 0 .4l-2.3 2.3 1.1 1.1 2.3-2.3c.6-.7.6-1.9-.1-2.5z"/>', // update
        dashboard: '<path d="M12 5a8 8 0 0 1 3.842.984L14.726 7.1a6.502 6.502 0 0 0-7.323 1.303 6.5 6.5 0 0 0 0 9.194l-1.06 1.06A8 8 0 0 1 12 5Zm7.021 4.168a8 8 0 0 1-1.364 9.49l-1.06-1.061a6.5 6.5 0 0 0 1.307-7.312l1.117-1.117ZM17.47 6.47a.75.75 0 1 1 1.06 1.06l-5.083 5.082a1.5 1.5 0 1 1-1.06-1.06L17.47 6.47Z"/>', // dashboard
        logout: '<path d="M16.8 5h-7c-1.1 0-2 .9-2 2v1.5h1.5V7c0-.3.2-.5.5-.5h7c.3 0 .5.2.5.5v10c0 .3-.2.5-.5.5h-7c-.3 0-.5-.2-.5-.5v-1.5H7.8V17c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z" transform="matrix(-1 0 0 1 22.8 0)"/><path d="M11 14.5l1.1 1.1 3-3 .5-.5-.6-.6-3-3-1 1 1.7 1.7H5v1.5h7.7L11 14.5z" transform="translate(4.4 0)"/>', // login, flipped
        plugin: '<path d="M10.5 4v4h3V4H15v4h1.5a1 1 0 0 1 1 1v4l-3 4v2a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2l-3-4V9a1 1 0 0 1 1-1H9V4h1.5zm.5 12.5v2h2v-2l3-4v-3H8v3l3 4z"/>', // plugins
        profile: '<path fill-rule="evenodd" clip-rule="evenodd" d="M7.25 16.437a6.5 6.5 0 1 1 9.5 0V16A2.75 2.75 0 0 0 14 13.25h-4A2.75 2.75 0 0 0 7.25 16v.437Zm1.5 1.193a6.47 6.47 0 0 0 3.25.87 6.47 6.47 0 0 0 3.25-.87V16c0-.69-.56-1.25-1.25-1.25h-4c-.69 0-1.25.56-1.25 1.25v1.63ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm10-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>', // comment-author-avatar
        dropdown: '<path d="m15.99 10.889-3.988 3.418-3.988-3.418.976-1.14 3.012 2.582 3.012-2.581.976 1.139Z"/>', // chevron-down-small
        check: '<path d="M16.7 7.1l-6.3 8.5-3.3-2.5-.9 1.2 4.5 3.4L17.9 8z"/>', // check
        image: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z"/>', // image
        open: '<path d="m19 7-3-3-8.5 8.5-1 4 4-1L19 7Zm-7 11.5H5V20h7v-1.5Z"/>', // pencil
        view: '<path d="M3.99961 13C4.67043 13.3354 4.6703 13.3357 4.67017 13.3359L4.67298 13.3305C4.67621 13.3242 4.68184 13.3135 4.68988 13.2985C4.70595 13.2686 4.7316 13.2218 4.76695 13.1608C4.8377 13.0385 4.94692 12.8592 5.09541 12.6419C5.39312 12.2062 5.84436 11.624 6.45435 11.0431C7.67308 9.88241 9.49719 8.75 11.9996 8.75C14.502 8.75 16.3261 9.88241 17.5449 11.0431C18.1549 11.624 18.6061 12.2062 18.9038 12.6419C19.0523 12.8592 19.1615 13.0385 19.2323 13.1608C19.2676 13.2218 19.2933 13.2686 19.3093 13.2985C19.3174 13.3135 19.323 13.3242 19.3262 13.3305L19.3291 13.3359C19.3289 13.3357 19.3288 13.3354 19.9996 13C20.6704 12.6646 20.6703 12.6643 20.6701 12.664L20.6697 12.6632L20.6688 12.6614L20.6662 12.6563L20.6583 12.6408C20.6517 12.6282 20.6427 12.6108 20.631 12.5892C20.6078 12.5459 20.5744 12.4852 20.5306 12.4096C20.4432 12.2584 20.3141 12.0471 20.1423 11.7956C19.7994 11.2938 19.2819 10.626 18.5794 9.9569C17.1731 8.61759 14.9972 7.25 11.9996 7.25C9.00203 7.25 6.82614 8.61759 5.41987 9.9569C4.71736 10.626 4.19984 11.2938 3.85694 11.7956C3.68511 12.0471 3.55605 12.2584 3.4686 12.4096C3.42484 12.4852 3.39142 12.5459 3.36818 12.5892C3.35656 12.6108 3.34748 12.6282 3.34092 12.6408L3.33297 12.6563L3.33041 12.6614L3.32948 12.6632L3.32911 12.664C3.32894 12.6643 3.32879 12.6646 3.99961 13ZM11.9996 16C13.9326 16 15.4996 14.433 15.4996 12.5C15.4996 10.567 13.9326 9 11.9996 9C10.0666 9 8.49961 10.567 8.49961 12.5C8.49961 14.433 10.0666 16 11.9996 16Z"/>', // seen
        link: '<path d="M10 17.389H8.444A5.194 5.194 0 1 1 8.444 7H10v1.5H8.444a3.694 3.694 0 0 0 0 7.389H10v1.5ZM14 7h1.556a5.194 5.194 0 0 1 0 10.39H14v-1.5h1.556a3.694 3.694 0 0 0 0-7.39H14V7Zm-4.5 6h5v-1.5h-5V13Z"/>', // link
        duplicate: '<path fill-rule="evenodd" clip-rule="evenodd" d="M5 4.5h11a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5ZM3 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm17 3v10.75c0 .69-.56 1.25-1.25 1.25H6v1.5h12.75a2.75 2.75 0 0 0 2.75-2.75V8H20Z"/>', // copy
        pin: '<path d="m21.5 9.1-6.6-6.6-4.2 5.6c-1.2-.1-2.4.1-3.6.7-.1 0-.1.1-.2.1-.5.3-.9.6-1.2.9l3.7 3.7-5.7 5.7v1.1h1.1l5.7-5.7 3.7 3.7c.4-.4.7-.8.9-1.2.1-.1.1-.2.2-.3.6-1.1.8-2.4.6-3.6l5.6-4.1zm-7.3 3.5.1.9c.1.9 0 1.8-.4 2.6l-6-6c.8-.4 1.7-.5 2.6-.4l.9.1L15 4.9 19.1 9l-4.9 3.6z"/>', // pin
    };

    // A tag's icon in the sidebar, like the # its list title starts with.
    const TAG_ICON = '<span class="wfw-nav__hash">#</span>';

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
        // The panel shown in the editor pane in place of a note's editor (its featured image, or its
        // categories and tags): { id, root }.
        panel: null,
        // Categories and tags pinned to the main menu, in pin order: { taxonomy, id, name, link }.
        pins: settings.pinnedTerms || [],
    };

    const APPEARANCE_CHOICES = {
        font: [ [ 'serif', __( 'Serif', 'wordpress-for-writers' ) ], [ 'sans', __( 'Sans', 'wordpress-for-writers' ) ], [ 'mono', __( 'Mono', 'wordpress-for-writers' ) ] ],
        size: [ [ 'small', __( 'Small', 'wordpress-for-writers' ) ], [ 'medium', __( 'Medium', 'wordpress-for-writers' ) ], [ 'large', __( 'Large', 'wordpress-for-writers' ) ] ],
        width: [ [ 'narrow', __( 'Narrow', 'wordpress-for-writers' ) ], [ 'medium', __( 'Medium', 'wordpress-for-writers' ) ], [ 'wide', __( 'Wide', 'wordpress-for-writers' ) ] ],
    };
    const appearance = { ...settings.appearance.current };

    const compactLayout = window.matchMedia( '(max-width: 1100px)' );

    /*
     * The open editors, listed under Editing now: the one in view, and those
     * opened with "Open in new tab", which keep running out of sight so each
     * keeps its place, undo history and unsaved changes. Each is
     * { key, id, title, frame, ready, stale, revealTimer, hiddenSince }: id is
     * null for a new note until it's first saved, and frame is null until the tab
     * is first shown (tabs come back after a reload without loading every editor
     * at once). hiddenSince is when the tab last went out of view, for
     * unloadIdleTabs.
     *
     * A note can be open in several tabs. Only the tab in view is edited, so
     * leaving one of them saves a draft's changes, and a twin that missed a save
     * (stale) loads the note again when it next comes into view.
     */
    let tabs = [];
    let current = null;
    // Each tab is a whole block editor, so only so many stay open.
    const MAX_TABS = 6;
    let tabSeq = 0;
    let pendingReplies = {};
    let replySeq = 0;
    let listRequest = 0;

    // ---- Utilities ---------------------------------------------------------

    /*
     * Preferences live in the browser, under the user's id: on a shared browser
     * one account doesn't see another's open tabs or view. (Core keeps its own
     * editor preferences the same way.)
     */
    function prefKey( key ) {
        return 'wfw:' + settings.userId + ':' + key;
    }

    function loadPref( key, fallback ) {
        try {
            const value = window.localStorage.getItem( prefKey( key ) );
            return value === null ? fallback : JSON.parse( value );
        } catch ( e ) {
            return fallback;
        }
    }

    function savePref( key, value ) {
        try {
            window.localStorage.setItem( prefKey( key ), JSON.stringify( value ) );
        } catch ( e ) {}
    }

    // The keys from before preferences were kept per user; what they held is dropped.
    try {
        [ 'view', 'sidebarHidden', 'collapsed', 'list', 'tabs' ].forEach( ( key ) => window.localStorage.removeItem( 'wfw:' + key ) );
    } catch ( e ) {}

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
        const { name } = termFor( state.view );
        if ( ! name ) {
            return '';
        }
        // Match the sidebar: tags are marked with a #, categories with a folder icon.
        return isCategory ? name : '# ' + name;
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
            apiFetch( { path: '/wp/v2/categories?per_page=100&orderby=name&_fields=id,name,parent,count,link' } ).catch( () => [] ),
            apiFetch( { path: '/wp/v2/tags?per_page=100&orderby=name&_fields=id,name,count,link' } ).catch( () => [] ),
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
            // Each note's image, featured or from its content, is one small field, worked out only while images show.
            _fields: 'id,title,excerpt,date_gmt,modified_gmt,status,sticky' + ( state.list.images ? ',wfw_thumbnail' : '' ),
        };
        if ( state.view.type === 'category' ) {
            params.categories = state.view.id;
        } else if ( state.view.type === 'tag' ) {
            params.tags = state.view.id;
        }
        if ( state.search ) {
            params.search = state.search;
        }
        // Each note's permalink, for View post and Copy link in its context menu.
        params._fields += ',link';
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
            contextTarget(); // Rings the note an open context menu is for again.
        }
    }

    function refresh() {
        return Promise.all( [ loadNotes(), loadCounts(), loadTerms() ] );
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
            <div class="wfw-menu wfw-menu--context" id="wfw-context-menu" role="menu" tabindex="-1" hidden></div>
            <div class="wfw-toast" role="status"></div>
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
        const menuItem = ( href, iconName, text, extra = '' ) => `<a class="wfw-menu__item" role="menuitem" tabindex="-1" data-action="menu-item" href="${ esc( href ) }">${ icon( iconName ) }<span>${ esc( text ) }</span>${ extra }</a>`;
        // Core's update notices are hidden here, so pending updates show as a dot on the
        // account button and the first item in its menu (only for people who can update).
        const updates = Number( settings.updatesCount ) || 0;
        const updatesText = sprintf( _n( '%d update available', '%d updates available', updates, 'wordpress-for-writers' ), updates );
        const updatesDot = updates ? `<span class="wfw-user__dot" title="${ esc( updatesText ) }"></span>` : '';
        // Drafts' autosaves re-render the sidebar every few seconds, and pinning
        // does too. Keep its scroll position, and focus on the same control or, when
        // that's gone (an item just unpinned), the one now in its place. The open
        // account menu itself survives via userMenuOpen.
        const controls = () => [ ...sidebar.querySelectorAll( 'a, button' ) ];
        const focusedControl = controls().indexOf( document.activeElement );
        const focusedKey = focusedControl >= 0 ? controlKey( document.activeElement ) : '';
        const scrollTop = sidebar.querySelector( '.wfw-sidebar__scroll' )?.scrollTop || 0;
        const statusNav = STATUS_VIEWS.map( ( v ) => navButton( { type: v.type }, v.label, icon( v.icon ), state.counts[ v.type ] ) ).join( '' );
        // Pinned categories and tags, which also stay in their sections, look as they do there.
        const pinned = state.pins
            .map( ( pin ) => {
                const view = viewOf( pin );
                return navButton( view, termFor( view ).name, view.type === 'category' ? icon( 'folder' ) : TAG_ICON );
            } )
            .join( '' );
        const tags = state.tags
            .map( ( t ) => navButton( { type: 'tag', id: t.id }, t.name, TAG_ICON ) )
            .join( '' );
        const editing = editingNowHtml();
        const siteIcon = settings.siteIcon ? `<img class="wfw-sidebar__icon" src="${ esc( settings.siteIcon ) }" alt="" />` : '';

        sidebar.innerHTML = `
            <div class="wfw-sidebar__head">${ siteIcon }<span class="wfw-sidebar__name">${ esc( settings.siteName ) }</span></div>
            <div class="wfw-sidebar__scroll">
                ${ editing }
                ${ statusNav }
                ${ pinned ? `<div class="wfw-sidebar__pins" role="group" aria-label="${ esc( __( 'Pinned', 'wordpress-for-writers' ) ) }">${ pinned }</div>` : '' }
                ${ state.categories.length ? sidebarSection( 'categories', __( 'Categories', 'wordpress-for-writers' ), categoryTree( 0, 0 ) ) : '' }
                ${ state.tags.length ? sidebarSection( 'tags', __( 'Tags', 'wordpress-for-writers' ), tags ) : '' }
            </div>
            <div class="wfw-sidebar__foot">
                <button class="wfw-user" id="wfw-user" data-action="user-menu" aria-haspopup="menu" aria-expanded="${ userMenuOpen ? 'true' : 'false' }" aria-controls="wfw-user-menu"${ updates ? ` aria-description="${ esc( updatesText ) }"` : '' }>${ avatar }<span class="wfw-user__name" title="${ esc( settings.userName ) }">${ esc( settings.userName ) }</span>${ updatesDot }${ icon( 'dropdown' ) }</button>
                <div class="wfw-menu" id="wfw-user-menu" role="menu" aria-labelledby="wfw-user"${ userMenuOpen ? '' : ' hidden' }>
                    ${ updates ? menuItem( settings.adminUrl + 'update-core.php', 'updates', __( 'Updates', 'wordpress-for-writers' ), `<span class="wfw-menu__badge" aria-hidden="true">${ updates }</span><span class="screen-reader-text">${ esc( updatesText ) }</span>` ) + '<div class="wfw-menu__separator" role="separator"></div>' : '' }
                    ${ menuItem( settings.adminUrl + 'index.php?wfw_classic=1', 'dashboard', __( 'Go to admin', 'wordpress-for-writers' ) ) }
                    ${ menuItem( settings.adminUrl + 'profile.php', 'profile', __( 'Edit profile', 'wordpress-for-writers' ) ) }
                    ${ ( settings.links || [] ).map( ( l ) => menuItem( l.url, ICONS[ l.icon ] ? l.icon : 'dashboard', l.label ) ).join( '' ) }
                    <div class="wfw-menu__separator" role="separator"></div>
                    ${ menuItem( settings.logoutUrl, 'logout', sprintf( __( 'Log out %s', 'wordpress-for-writers' ), settings.userName ) ) }
                </div>
                <a class="wfw-icon-btn" href="${ esc( settings.siteUrl ) }" target="_blank" rel="noopener" ${ label( __( 'View site', 'wordpress-for-writers' ) ) }>${ icon( 'external' ) }</a>
                <button class="wfw-icon-btn" data-action="appearance" ${ label( __( 'Appearance', 'wordpress-for-writers' ) ) }>${ icon( 'appearance' ) }</button>
            </div>
        `;
        revealSiteIcon( sidebar.querySelector( '.wfw-sidebar__icon' ) );
        sidebar.querySelector( '.wfw-sidebar__scroll' ).scrollTop = scrollTop;
        if ( focusedControl >= 0 ) {
            const after = controls();
            ( after.find( ( el ) => controlKey( el ) === focusedKey ) || after[ Math.min( focusedControl, after.length - 1 ) ] ).focus( { preventScroll: true } );
        }
        contextTarget(); // Rings the item an open context menu is for again.
    }

    // Tells the sidebar's controls apart across renders: what they do and to
    // what, and whether they're the pinned copy of a category or tag.
    function controlKey( el ) {
        return [ el.dataset.action, el.dataset.type, el.dataset.id, el.dataset.section, el.dataset.tab, el.getAttribute( 'href' ), !! el.closest( '.wfw-sidebar__pins' ) ].join( '|' );
    }

    /*
     * Editing now: the open editors as vertical tabs, first in the sidebar,
     * shown whenever a note is open, even just one, so the list doesn't come and
     * go. Each tab has a close button, and a middle click closes it too.
     */
    function editingNowHtml() {
        if ( ! tabs.length ) {
            return '';
        }
        const items = tabs.map( ( tab ) => {
            // A panel (featured image, categories and tags) counts as its note's tab, which stays marked while it's open.
            const active = tab === current;
            const title = tab.title || __( 'Untitled', 'wordpress-for-writers' );
            return `
                <div class="wfw-tab${ active ? ' is-active' : '' }" data-tab="${ tab.key }" role="listitem">
                    <button class="wfw-nav${ active ? ' is-active' : '' }" data-action="tab" data-tab="${ tab.key }"${ active ? ' aria-current="true"' : '' }>
                        <span class="wfw-nav__icon">${ icon( 'open' ) }</span>
                        <span class="wfw-nav__label${ tab.title ? '' : ' is-empty' }">${ esc( title ) }</span>
                    </button>
                    <button class="wfw-icon-btn wfw-tab__close" data-action="close-tab" data-tab="${ tab.key }" aria-label="${ esc( sprintf( __( 'Close %s', 'wordpress-for-writers' ), title ) ) }" title="${ esc( __( 'Close', 'wordpress-for-writers' ) ) }">${ icon( 'close' ) }</button>
                </div>`;
        } ).join( '' );
        return `
            <div class="wfw-sidebar__tabs">
                <div class="wfw-sidebar__heading" id="wfw-tabs-heading">${ esc( __( 'Editing now', 'wordpress-for-writers' ) ) }</div>
                <div role="list" aria-labelledby="wfw-tabs-heading">${ items }</div>
            </div>`;
    }

    function tabByKey( key ) {
        return tabs.find( ( t ) => t.key === Number( key ) );
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
        // The featured image, else an image from the note's content (includes/thumbnails.php); the fixed box crops it square.
        // Only a featured image opens the featured image panel. One from the content is part of the row, which opens the note.
        const thumb = state.list.images ? note.wfw_thumbnail : null;
        const date = state.list.orderby === 'date' ? note.date_gmt : note.modified_gmt;
        const thumbImg = thumb ? `<img class="wfw-note__thumb" src="${ esc( thumb.url ) }" alt="" width="64" height="64" loading="lazy" />` : '';
        const actions = isTrash && settings.canDelete
            ? `<span class="wfw-icon-btn" role="button" data-action="restore" data-id="${ note.id }" title="${ esc( __( 'Restore', 'wordpress-for-writers' ) ) }">${ icon( 'restore' ) }</span>
               <span class="wfw-icon-btn" role="button" data-action="delete" data-id="${ note.id }" title="${ esc( __( 'Delete permanently', 'wordpress-for-writers' ) ) }">${ icon( 'close' ) }</span>`
            : isTrash || ! settings.canDelete ? '' : `<span class="wfw-icon-btn" role="button" data-action="trash" data-id="${ note.id }" title="${ esc( __( 'Move to trash', 'wordpress-for-writers' ) ) }">${ icon( 'trash' ) }</span>`;

        return `
            <div class="wfw-note${ note.id === state.activeId ? ' is-active' : '' }" role="listitem" tabindex="0" data-action="open" data-id="${ note.id }">
                <div class="wfw-note__title${ title ? '' : ' is-empty' }">${ esc( title || __( 'Untitled', 'wordpress-for-writers' ) ) }</div>
                ${ excerpt ? `<div class="wfw-note__excerpt">${ esc( excerpt ) }</div>` : '' }
                ${ FEATURED && thumb?.source === 'featured' ? `<button class="wfw-note__thumb-btn" data-action="featured" data-id="${ note.id }" title="${ esc( __( 'Change featured image', 'wordpress-for-writers' ) ) }">${ thumbImg }</button>` : thumbImg }
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
        // A thumbnail that fails to load, like a content image from another site that is gone, is dropped rather than shown broken.
        container.querySelectorAll( '.wfw-note__thumb' ).forEach( ( img ) => {
            img.addEventListener( 'error', () => ( img.closest( '.wfw-note__thumb-btn' ) || img ).remove() );
        } );
    }

    function markActive() {
        root.querySelectorAll( '.wfw-note' ).forEach( ( el ) => {
            el.classList.toggle( 'is-active', Number( el.dataset.id ) === state.activeId );
        } );
    }

    // ---- Editor frame ------------------------------------------------------

    function ask( message, timeout, tab = current ) {
        if ( ! tab?.frame?.contentWindow ) {
            return Promise.resolve( null );
        }
        const replyTo = ++replySeq;
        return new Promise( ( resolve ) => {
            pendingReplies[ replyTo ] = resolve;
            tab.frame.contentWindow.postMessage( { source: 'wfw', replyTo, ...message }, window.location.origin );
            setTimeout( () => {
                if ( pendingReplies[ replyTo ] ) {
                    delete pendingReplies[ replyTo ];
                    resolve( null );
                }
            }, timeout );
        } );
    }

    // Saves a draft's last changes before its editor goes; a published note's unsaved changes are the writer's call.
    async function canLeaveEditor( tab = current ) {
        if ( ! tab?.ready ) {
            return true;
        }
        const reply = await ask( { type: 'flush' }, 8000, tab );
        if ( ! reply || reply.ok ) {
            return true;
        }
        return window.confirm( __( 'This published note has unsaved changes. Discard them?', 'wordpress-for-writers' ) );
    }

    // Placeholder shown in the editor's colors while a note loads: its title from
    // the list (or its tab) and a few faint lines, so switching notes never flashes white.
    function skeletonHtml( tab ) {
        const listed = tab?.id && root.querySelector( `.wfw-note[data-id="${ tab.id }"] .wfw-note__title:not(.is-empty)` );
        const title = listed ? listed.textContent : tab?.title;
        const body = tab?.id ? '<span></span><span></span><span></span>' : '';
        return `<div class="wfw-editor__skeleton" aria-hidden="true"><div class="wfw-editor__skeleton-column">${ title ? `<div class="wfw-editor__skeleton-title">${ esc( title ) }</div>` : '' }${ body }</div></div>`;
    }

    function clearEditorPane() {
        const editor = root.querySelector( '.wfw-editor' );
        state.panel?.root.unmount();
        state.panel = null;
        editor.querySelectorAll( '.wfw-editor__placeholder, .wfw-editor__loading, .wfw-editor__skeleton, .wfw-panel' ).forEach( ( el ) => el.remove() );
        return editor;
    }

    // A tab's frame stays transparent until its canvas has painted with our
    // styles (or a timeout passes), then fades in over the skeleton.
    function revealEditor( tab ) {
        clearTimeout( tab?.revealTimer );
        if ( ! tab?.frame ) {
            return;
        }
        tab.frame.classList.remove( 'is-loading' );
        if ( tab !== current ) {
            return;
        }
        root.querySelectorAll( '.wfw-editor__loading, .wfw-editor__skeleton' ).forEach( ( el ) => {
            el.classList.add( 'is-done' );
            setTimeout( () => el.remove(), 250 );
        } );
    }

    // A new note takes the REST nonce, which the editor page checks before
    // creating the draft; the API client keeps it current.
    function editorSrc( id ) {
        if ( id ) {
            return settings.editorUrl + '&post=' + id;
        }
        const nonce = wp.apiFetch.nonceMiddleware?.nonce || window.wpApiSettings?.nonce || '';
        return settings.editorUrl + '&_wpnonce=' + encodeURIComponent( nonce );
    }

    function dropFrame( tab ) {
        clearTimeout( tab.revealTimer );
        tab.frame?.remove();
        tab.frame = null;
        tab.ready = false;
        tab.hiddenSince = 0;
    }

    /*
     * Hides or shows a tab's editor. Out of view, an editor keeps running (its
     * place, undo history and unsaved changes stay), so it's told, and slows its
     * heartbeat; and the time it went out of view is kept, so an editor idle
     * for long enough is unloaded (unloadIdleTabs).
     */
    function setHidden( tab, hidden ) {
        if ( ! tab.frame ) {
            return;
        }
        tab.frame.classList.toggle( 'is-hidden', hidden );
        tab.hiddenSince = hidden ? tab.hiddenSince || Date.now() : 0;
        postVisibility( tab );
    }

    function postVisibility( tab ) {
        tab.frame?.contentWindow?.postMessage( { source: 'wfw', type: 'visibility', hidden: tab.frame.classList.contains( 'is-hidden' ) }, window.location.origin );
    }

    // How long an editor stays loaded out of view.
    const IDLE_UNLOAD = 10 * 60 * 1000;

    /*
     * Editors out of view for a while are unloaded, giving back their memory and
     * their heartbeat requests; the tab loads its note again when next shown. A
     * draft's last changes were saved on the way out of its tab, and are saved
     * again here to be sure. A published note's unsaved changes keep their
     * editor, since nothing else holds them.
     */
    async function unloadIdleTabs() {
        const idle = tabs.filter( ( t ) => t !== current && t.frame && t.hiddenSince && Date.now() - t.hiddenSince > IDLE_UNLOAD );
        for ( const tab of idle ) {
            // The tab may have come into view, or gone, while the save ran.
            if ( ( await canLeaveEditor( tab ) ) && tab !== current && tab.frame && tabs.includes( tab ) ) {
                dropFrame( tab );
            }
        }
    }

    setInterval( unloadIdleTabs, 60 * 1000 );

    // Loads the tab's note into a fresh editor, in place of the one it had.
    function loadTab( tab ) {
        dropFrame( tab );
        tab.stale = false;
        tab.frame = document.createElement( 'iframe' );
        // aria-label rather than title: Safari shows an iframe's title as a hover tooltip.
        tab.frame.setAttribute( 'aria-label', __( 'Editor', 'wordpress-for-writers' ) );
        tab.frame.classList.add( 'is-loading' );
        tab.frame.classList.toggle( 'is-hidden', tab !== current );
        tab.hiddenSince = tab !== current ? Date.now() : 0;
        tab.frame.src = editorSrc( tab.id );
        root.querySelector( '.wfw-editor' ).appendChild( tab.frame );
        tab.revealTimer = setTimeout( () => revealEditor( tab ), 8000 );
    }

    // Other tabs with the same note open.
    function twinsOf( tab ) {
        return tab?.id ? tabs.filter( ( t ) => t !== tab && t.id === tab.id ) : [];
    }

    // Puts the tab in view. The others stay loaded behind it, hidden.
    async function showTab( tab ) {
        const previous = current;
        // A draft's changes are saved on the way out when its note is open in
        // another tab, so that tab picks them up (the save marks it stale).
        if ( previous && previous !== tab && previous.ready && twinsOf( previous ).length ) {
            await ask( { type: 'flush' }, 8000, previous );
        }
        // A tab whose note was saved from another tab since it loaded starts over
        // from the saved note, unless it holds unsaved changes of its own (a
        // published note's), which stay, with a word about the other tab.
        if ( tab?.stale && tab.frame ) {
            tab.stale = false;
            const reply = tab.ready ? await ask( { type: 'flush' }, 8000, tab ) : null;
            if ( ! reply || reply.ok ) {
                dropFrame( tab );
            } else {
                showToast( __( 'This note was changed in another tab', 'wordpress-for-writers' ) );
            }
        }
        const editor = clearEditorPane();
        current = tab;
        state.activeId = tab ? tab.id : null;
        tabs.forEach( ( t ) => setHidden( t, t !== tab ) );
        root.classList.toggle( 'has-note', !! tab );
        if ( ! tab ) {
            editor.insertAdjacentHTML( 'beforeend', `<div class="wfw-editor__placeholder">${ icon( 'notes' ) }<span>${ esc( __( 'Select a note or start a new one', 'wordpress-for-writers' ) ) }</span></div>` );
        } else if ( ! tab.frame || tab.frame.classList.contains( 'is-loading' ) ) {
            editor.insertAdjacentHTML( 'beforeend', '<div class="wfw-editor__loading"></div>' + skeletonHtml( tab ) );
            if ( ! tab.frame ) {
                loadTab( tab );
            }
        }
        window.history.replaceState( null, '', tab?.id ? '#note=' + tab.id : window.location.pathname + window.location.search );
        markActive();
        saveTabs();
        renderSidebar();
    }

    function tabFor( id ) {
        return id ? tabs.find( ( t ) => t.id === id ) : null;
    }

    function noteTitle( id ) {
        const note = state.notes.find( ( n ) => n.id === id );
        return note ? note.title.raw || htmlToText( note.title.rendered ) : '';
    }

    function addTab( id, title = noteTitle( id ) ) {
        const tab = { key: ++tabSeq, id, title, frame: null, ready: false, stale: false, revealTimer: 0, hiddenSince: 0 };
        // Next to the tab in view, like a browser's new tab from a link.
        const at = tabs.indexOf( current );
        tabs.splice( at < 0 ? tabs.length : at + 1, 0, tab );
        return tab;
    }

    // Opens the note in the tab in view, as a click on it in the list does. A note
    // that already has a tab is shown there instead (the one in view, if it's one
    // of them): "Open in new tab" is the way to open a note twice.
    async function openNote( id ) {
        const open = current?.id === id ? current : tabFor( id );
        if ( open ) {
            if ( open !== current || ! open.frame || state.panel ) {
                showTab( open );
            }
            root.classList.add( 'has-note' );
            return;
        }
        const here = tabToReuse();
        if ( here ) {
            if ( ! ( await canLeaveEditor( here ) ) ) {
                return;
            }
            here.id = id;
            here.title = noteTitle( id );
            dropFrame( here );
            showTab( here );
            return;
        }
        showTab( addTab( id ) );
    }

    // The tab a note opens in when it isn't opened in a new one: the tab in view,
    // or, with none in view and every tab taken, the last one.
    function tabToReuse() {
        return current || ( tabs.length >= MAX_TABS ? tabs[ tabs.length - 1 ] : null );
    }

    // "Open in new tab": the note gets another editor of its own under Editing now,
    // even when it's open already, and comes into view.
    function openNoteInTab( id ) {
        if ( tabs.length >= MAX_TABS ) {
            showToast( sprintf(
                /* translators: %d: how many notes can be open in tabs at once. */
                __( 'Up to %d notes can be open at once. Close one to open another.', 'wordpress-for-writers' ),
                MAX_TABS
            ) );
            return;
        }
        showTab( addTab( id ) );
    }

    async function newNote() {
        const reuse = tabToReuse();
        if ( reuse && ! ( await canLeaveEditor( reuse ) ) ) {
            return;
        }
        const tab = reuse || addTab( null, '' );
        tab.id = null;
        tab.title = '';
        dropFrame( tab );
        showTab( tab );
    }

    // Closes a tab's editor, after saving a draft's last changes. The next tab
    // down (or, for the last one, the one above) comes into view in its place.
    async function closeTab( tab, { save = true } = {} ) {
        if ( save && ! ( await canLeaveEditor( tab ) ) ) {
            return;
        }
        const at = tabs.indexOf( tab );
        if ( at < 0 ) {
            return;
        }
        dropFrame( tab );
        tabs.splice( at, 1 );
        if ( tab === current ) {
            showTab( tabs[ at ] || tabs[ at - 1 ] || null );
        } else {
            saveTabs();
            renderSidebar();
        }
    }

    /*
     * Tabs are kept per device, like the other view preferences, and reopen after
     * a reload. Only the note ids are kept: the titles come from the site when the
     * tabs are restored, so the browser holds nothing of what the notes say.
     */
    function saveTabs() {
        savePref( 'tabs', tabs.filter( ( t ) => t.id ).map( ( t ) => ( { id: t.id } ) ) );
    }

    // A title changes with every keystroke in it: those are saved once typing pauses.
    const saveTabTitles = debounce( saveTabs, 500 );

    /*
     * Tabs restored from the last visit, minus notes that have since been trashed
     * or deleted. They show as Untitled until the site confirms them and gives
     * their titles; the tabs it doesn't confirm, or all of them when it can't be
     * asked, are dropped rather than kept on trust.
     */
    async function restoreTabs() {
        const saved = ( loadPref( 'tabs', [] ) || [] ).filter( ( t ) => t && Number( t.id ) > 0 );
        if ( ! saved.length ) {
            return;
        }
        const restored = saved.slice( 0, MAX_TABS ).map( ( t ) => addTab( Number( t.id ), '' ) );
        renderSidebar();
        const ids = restored.map( ( t ) => t.id );
        const notes = await apiFetch( {
            path: '/wp/v2/posts?' + new URLSearchParams( { include: ids.join( ',' ), per_page: 100, status: STATUS_VIEWS[ 0 ].status, context: 'edit', _fields: 'id,title' } ),
        } ).catch( () => null );
        const found = new Map( ( notes || [] ).map( ( n ) => [ n.id, n.title.raw || htmlToText( n.title.rendered ) ] ) );
        tabs = tabs.filter( ( t ) => ! restored.includes( t ) || found.has( t.id ) || t === current );
        tabs.forEach( ( t ) => {
            if ( found.has( t.id ) ) {
                t.title = found.get( t.id );
            }
        } );
        saveTabs();
        renderSidebar();
    }

    // A note that went to the trash or was deleted closes its tabs, with nothing to save.
    function closeNoteTab( id ) {
        tabs.filter( ( t ) => t.id === id ).forEach( ( t ) => closeTab( t, { save: false } ) );
    }

    function setTabTitle( tab, title ) {
        tab.title = title;
        const label = root.querySelector( `.wfw-tab[data-tab="${ tab.key }"] .wfw-nav__label` );
        if ( label ) {
            label.textContent = title || __( 'Untitled', 'wordpress-for-writers' );
            label.classList.toggle( 'is-empty', ! title );
        }
        saveTabTitles();
    }

    window.addEventListener( 'message', ( event ) => {
        if ( event.origin !== window.location.origin || ! event.data || event.data.source !== 'wfw-frame' ) {
            return;
        }
        // Every tab's editor talks to the app; only the one in view gets to steer it.
        const tab = tabs.find( ( t ) => t.frame && t.frame.contentWindow === event.source );
        if ( ! tab ) {
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
                tab.ready = true;
                postAppearance( tab );
                postVisibility( tab ); // An editor that loaded behind a panel starts out hidden.
                if ( data.id && tab.id !== data.id ) {
                    tab.id = data.id;
                    if ( tab === current ) {
                        state.activeId = data.id;
                        markActive();
                    }
                }
                break;
            }
            case 'painted': {
                revealEditor( tab );
                break;
            }
            case 'title': {
                const el = root.querySelector( `.wfw-note[data-id="${ data.id }"] .wfw-note__title` );
                if ( el ) {
                    el.textContent = data.title || __( 'Untitled', 'wordpress-for-writers' );
                    el.classList.toggle( 'is-empty', ! data.title );
                }
                [ tab, ...twinsOf( tab ) ].forEach( ( t ) => setTabTitle( t, data.title || '' ) );
                break;
            }
            case 'saved': {
                tab.id = data.id;
                twinsOf( tab ).forEach( ( t ) => ( t.stale = true ) );
                if ( tab === current ) {
                    state.activeId = data.id;
                    window.history.replaceState( null, '', '#note=' + data.id );
                }
                saveTabs();
                loadNotes();
                loadCounts();
                break;
            }
            case 'featured-image': {
                if ( FEATURED && data.id && tab === current ) {
                    openFeatured( data.id );
                }
                break;
            }
            case 'terms': {
                if ( TERMS && data.id && tab === current ) {
                    openTerms( data.id, data.focus );
                }
                break;
            }
            case 'escape': {
                if ( state.focus && tab === current ) {
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
                }, { root: sentinel.closest( '.wfw-panel' ), rootMargin: '0px 0px 400px 0px' } );
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

            return el( 'div', { className: 'wfw-panel__column' },
                el( 'div', { className: 'wfw-panel__head' },
                    el( 'div', { className: 'wfw-panel__heading' },
                        el( 'div', { className: 'wfw-panel__eyebrow' }, __( 'Featured image', 'wordpress-for-writers' ) ),
                        el( 'h2', { className: 'wfw-panel__title' + ( post?.title?.raw ? '' : ' is-empty' ) }, title || ' ' )
                    ),
                    el( Button, { variant: 'secondary', className: 'wfw-panel__back', onClick: onBack }, __( 'Back to note', 'wordpress-for-writers' ) )
                ),
                lockedBy && el( Notice, { status: 'warning', isDismissible: false, className: 'wfw-panel__notice' },
                    /* translators: %s: name of the user editing the note. */
                    sprintf( __( '%s is editing this note, so its featured image can’t be changed right now.', 'wordpress-for-writers' ), lockedBy )
                ),
                error && el( Notice, { status: 'error', onRemove: () => setError( '' ), className: 'wfw-panel__notice' }, error ),
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
                    status && el( 'span', { className: 'wfw-panel__status', role: 'status' }, el( Spinner ), status )
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
                    el( 'h3', { className: 'wfw-panel__label', id: 'wfw-media-library' }, __( 'Your images', 'wordpress-for-writers' ) ),
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

    // ---- Categories and tags -----------------------------------------------

    /*
     * The note's categories and tags are set in the editor pane, in place of
     * the editor, in a form built from @wordpress/components that reads and
     * saves through core-data, like the editor's own panels: a checklist of the
     * site's categories, with room to add one, and a token field for tags, with
     * the most used ones offered below it. Each change saves straight to the
     * note, so the form stays read-only while someone else has the note open
     * (the editor's post lock).
     */
    const TERMS = ( () => {
        const terms = settings.terms || {};
        if ( ! ( terms.categories || terms.tags ) || ! wp.element?.createRoot || ! wp.components || ! wp.coreData ) {
            return null;
        }
        const { createElement: el, useState, useRef, useEffect, useMemo, Fragment } = wp.element;
        const { Button, CheckboxControl, FormTokenField, Notice, SelectControl, SearchControl, Spinner, TextControl } = wp.components;
        const { useSelect, useDispatch } = wp.data;
        const coreStore = wp.coreData.store;
        // Same queries as the editor's own panels, so the lists are shared with them.
        const CATEGORY_QUERY = { per_page: -1, orderby: 'name', order: 'asc', context: 'view', _fields: 'id,name,parent' };
        const POPULAR_TAGS_QUERY = { per_page: 20, orderby: 'count', order: 'desc', hide_empty: true, context: 'view', _fields: 'id,name,count' };
        const SUGGESTIONS = 20;
        // Past this many categories the checklist gets a filter, as the editor's panel does.
        const FILTER_FROM = 8;

        // Term names come HTML-escaped from the REST API.
        const name = ( term ) => htmlToText( term.name );
        const sameIds = ( a, b ) => a.length === b.length && a.every( ( id ) => b.includes( id ) );

        function Panel( { postId, focus, onBack, onSaved } ) {
            const [ filter, setFilter ] = useState( '' );
            const [ newName, setNewName ] = useState( '' );
            const [ newParent, setNewParent ] = useState( 0 );
            const [ tagInput, setTagInput ] = useState( '' );
            const [ tagSearch, setTagSearch ] = useState( '' );
            const [ saving, setSaving ] = useState( 0 );
            const pendingRef = useRef( 0 );
            const [ adding, setAdding ] = useState( false );
            const [ error, setError ] = useState( '' );
            const columnRef = useRef( null );
            const focusedRef = useRef( false );
            // Every tag seen so far, by id, so the note's tags keep their names while a list reloads.
            const knownRef = useRef( new Map() );
            const { editEntityRecord, saveEditedEntityRecord, saveEntityRecord } = useDispatch( coreStore );

            const { post, stored, categories, noteTags, popularTags, matchingTags } = useSelect( ( select ) => {
                const core = select( coreStore );
                const stored = core.getEntityRecord( 'postType', 'post', postId );
                // The record with this form's unsaved edits on top, so a change shows at once.
                const edited = stored ? core.getEditedEntityRecord( 'postType', 'post', postId ) : null;
                const tagIds = edited?.tags || [];
                return {
                    post: edited,
                    stored, // The edited record's title is a plain string; the heading reads the stored one.
                    categories: terms.categories ? core.getEntityRecords( 'taxonomy', 'category', CATEGORY_QUERY ) : [],
                    noteTags: terms.tags && tagIds.length
                        ? core.getEntityRecords( 'taxonomy', 'post_tag', { include: tagIds, per_page: tagIds.length, context: 'view', _fields: 'id,name' } )
                        : [],
                    popularTags: terms.tags ? core.getEntityRecords( 'taxonomy', 'post_tag', POPULAR_TAGS_QUERY ) : [],
                    matchingTags: terms.tags && tagSearch
                        ? core.getEntityRecords( 'taxonomy', 'post_tag', { search: tagSearch, per_page: SUGGESTIONS, orderby: 'count', order: 'desc', context: 'view', _fields: 'id,name' } )
                        : null,
                };
            }, [ postId, tagSearch ] );

            [ noteTags, popularTags, matchingTags ].forEach( ( list ) => ( list || [] ).forEach( ( t ) => knownRef.current.set( t.id, name( t ) ) ) );

            // Tags are looked up as you type, a moment after typing stops.
            useEffect( () => {
                const value = tagInput.trim();
                const timer = setTimeout( () => setTagSearch( value ), 300 );
                return () => clearTimeout( timer );
            }, [ tagInput ] );

            // The categories in tree order, each with its depth, walked once per list.
            const categoryRows = useMemo( () => {
                const children = new Map();
                ( categories || [] ).forEach( ( c ) => children.set( c.parent, [ ...( children.get( c.parent ) || [] ), c ] ) );
                const walk = ( parent, depth ) => ( children.get( parent ) || [] ).flatMap( ( term ) => [ { term, depth }, ...walk( term.id, depth + 1 ) ] );
                return walk( 0, 0 );
            }, [ categories ] );

            const lockedBy = post?.wfw_locked_by || '';
            const disabled = ! post || !! lockedBy;
            const categoryIds = post?.categories || [];
            const tagIds = post?.tags || [];

            // The part of the form the link above the title was for gets focus once it has loaded.
            useEffect( () => {
                if ( focusedRef.current || ! post || ! columnRef.current || ( focus !== 'tags' && ! categories ) ) {
                    return;
                }
                const target = focus === 'tags'
                    ? columnRef.current.querySelector( '.components-form-token-field__input' )
                    : columnRef.current.querySelector( '.wfw-terms__choice input, .wfw-terms__add input' );
                if ( target ) {
                    focusedRef.current = true;
                    target.focus();
                }
            } );

            // Saves a change to the note's terms. Changes made while one saves are
            // kept as edits and go with the next save (core-data serializes them).
            async function save( edits ) {
                editEntityRecord( 'postType', 'post', postId, edits );
                pendingRef.current += 1;
                setSaving( pendingRef.current );
                setError( '' );
                let failed = false;
                try {
                    await saveEditedEntityRecord( 'postType', 'post', postId, { throwOnError: true } );
                    onSaved();
                } catch ( e ) {
                    failed = true;
                    setError( e?.message || __( 'The change could not be saved.', 'wordpress-for-writers' ) );
                }
                pendingRef.current -= 1;
                // Once every save is through, the form shows what is really stored: a failed
                // change is dropped, and a note left with no category gets the default one.
                if ( ! pendingRef.current && ( failed || edits.categories ) ) {
                    const stored = wp.data.select( coreStore ).getEntityRecord( 'postType', 'post', postId );
                    if ( stored ) {
                        editEntityRecord( 'postType', 'post', postId, { categories: stored.categories, tags: stored.tags } );
                    }
                }
                setSaving( pendingRef.current );
            }

            function toggleCategory( id, checked ) {
                save( { categories: checked ? [ ...categoryIds, id ] : categoryIds.filter( ( c ) => c !== id ) } );
            }

            // Makes a term, or finds the one that already has that name.
            async function createTerm( taxonomy, data ) {
                try {
                    return await saveEntityRecord( 'taxonomy', taxonomy, data, { throwOnError: true } );
                } catch ( e ) {
                    if ( e?.code === 'term_exists' && e.data?.term_id ) {
                        return { id: e.data.term_id, ...data };
                    }
                    throw e;
                }
            }

            async function addCategory( event ) {
                event.preventDefault();
                const value = newName.trim();
                if ( ! value || adding || disabled ) {
                    return;
                }
                setAdding( true );
                setError( '' );
                try {
                    const term = await createTerm( 'category', { name: value, parent: newParent || 0 } );
                    setNewName( '' );
                    setNewParent( 0 );
                    if ( ! categoryIds.includes( term.id ) ) {
                        save( { categories: [ ...categoryIds, term.id ] } );
                    }
                } catch ( e ) {
                    setError( e?.message || __( 'The category could not be added.', 'wordpress-for-writers' ) );
                }
                setAdding( false );
            }

            // The token field hands back names; unknown ones become new tags.
            async function changeTags( tokens ) {
                if ( disabled ) {
                    return;
                }
                const byName = new Map( [ ...knownRef.current ].map( ( [ id, n ] ) => [ n.toLowerCase(), id ] ) );
                const ids = [];
                const missing = [];
                tokens.forEach( ( token ) => {
                    const value = String( typeof token === 'string' ? token : token?.value || '' ).trim();
                    const id = value && byName.get( value.toLowerCase() );
                    if ( id ) {
                        if ( ! ids.includes( id ) ) {
                            ids.push( id );
                        }
                    } else if ( value ) {
                        missing.push( value );
                    }
                } );
                if ( missing.length && ! terms.canAddTags ) {
                    setError( __( 'Only existing tags can be used on this site.', 'wordpress-for-writers' ) );
                } else if ( missing.length ) {
                    setAdding( true );
                    for ( const value of missing ) {
                        try {
                            const term = await createTerm( 'post_tag', { name: value } );
                            knownRef.current.set( term.id, name( term ) );
                            if ( ! ids.includes( term.id ) ) {
                                ids.push( term.id );
                            }
                        } catch ( e ) {
                            setError( e?.message || __( 'The tag could not be added.', 'wordpress-for-writers' ) );
                        }
                    }
                    setAdding( false );
                }
                if ( ! sameIds( ids, tagIds ) ) {
                    save( { tags: ids } );
                }
            }

            function choice( term, depth ) {
                return el( 'div', { key: term.id, className: 'wfw-terms__choice', style: { paddingLeft: depth * 24 } },
                    el( CheckboxControl, {
                        label: name( term ),
                        checked: categoryIds.includes( term.id ),
                        onChange: ( checked ) => toggleCategory( term.id, checked ),
                        disabled,
                        __nextHasNoMarginBottom: true,
                    } )
                );
            }

            // The checklist follows the categories' tree; while filtering, it's the matches, flat.
            const query = filter.trim().toLowerCase();
            const choices = query
                ? ( categories || [] ).filter( ( c ) => name( c ).toLowerCase().includes( query ) ).map( ( c ) => choice( c, 0 ) )
                : categoryRows.map( ( { term, depth } ) => choice( term, depth ) );
            const parentOptions = categoryRows.map( ( { term, depth } ) => ( { value: String( term.id ), label: ' '.repeat( depth * 3 ) + name( term ) } ) );

            const tagNames = tagIds.map( ( id ) => knownRef.current.get( id ) ).filter( Boolean );
            const suggestions = ( ( tagSearch ? matchingTags : popularTags ) || [] ).map( name ).filter( ( n ) => ! tagNames.includes( n ) );
            const popular = ( popularTags || [] ).filter( ( t ) => ! tagIds.includes( t.id ) );

            const title = stored ? stored.title?.raw || __( 'Untitled', 'wordpress-for-writers' ) : '';
            const eyebrow = terms.categories && terms.tags
                ? __( 'Categories and tags', 'wordpress-for-writers' )
                : terms.categories ? __( 'Categories', 'wordpress-for-writers' ) : __( 'Tags', 'wordpress-for-writers' );
            const status = adding ? __( 'Adding…', 'wordpress-for-writers' ) : saving ? __( 'Saving…', 'wordpress-for-writers' ) : '';

            return el( 'div', { className: 'wfw-panel__column', ref: columnRef },
                el( 'div', { className: 'wfw-panel__head' },
                    el( 'div', { className: 'wfw-panel__heading' },
                        el( 'div', { className: 'wfw-panel__eyebrow' }, eyebrow ),
                        el( 'h2', { className: 'wfw-panel__title' + ( stored?.title?.raw ? '' : ' is-empty' ) }, title || ' ' )
                    ),
                    el( Button, { variant: 'secondary', className: 'wfw-panel__back', onClick: onBack }, __( 'Back to note', 'wordpress-for-writers' ) )
                ),
                lockedBy && el( Notice, { status: 'warning', isDismissible: false, className: 'wfw-panel__notice' },
                    /* translators: %s: name of the user editing the note. */
                    sprintf( __( '%s is editing this note, so its categories and tags can’t be changed right now.', 'wordpress-for-writers' ), lockedBy )
                ),
                error && el( Notice, { status: 'error', onRemove: () => setError( '' ), className: 'wfw-panel__notice' }, error ),
                ! post && el( 'div', { className: 'wfw-terms__loading' }, el( Spinner ) ),
                post && terms.categories && el( 'section', { className: 'wfw-terms__section' },
                    el( 'div', { className: 'wfw-terms__section-head' },
                        el( 'h3', { className: 'wfw-panel__label', id: 'wfw-terms-categories' }, __( 'Categories', 'wordpress-for-writers' ) ),
                        categories && categories.length > FILTER_FROM && el( SearchControl, {
                            className: 'wfw-terms__filter',
                            value: filter,
                            onChange: setFilter,
                            label: __( 'Search categories', 'wordpress-for-writers' ),
                            placeholder: __( 'Search categories', 'wordpress-for-writers' ),
                            size: 'compact',
                            __nextHasNoMarginBottom: true,
                        } )
                    ),
                    ! categories && el( 'div', { className: 'wfw-terms__loading' }, el( Spinner ) ),
                    categories && ! categories.length && el( 'p', { className: 'wfw-terms__none' }, __( 'No categories yet.', 'wordpress-for-writers' ) ),
                    choices.length > 0 && el( 'div', { className: 'wfw-terms__choices', role: 'group', 'aria-labelledby': 'wfw-terms-categories' }, choices ),
                    query && categories?.length > 0 && ! choices.length && el( 'p', { className: 'wfw-terms__none' },
                        /* translators: %s: the search terms. */
                        sprintf( __( 'No categories match “%s”.', 'wordpress-for-writers' ), filter.trim() )
                    ),
                    terms.canAddCategories && ! lockedBy && el( 'form', { className: 'wfw-terms__add', onSubmit: addCategory },
                        el( TextControl, {
                            className: 'wfw-terms__add-name',
                            label: __( 'New category', 'wordpress-for-writers' ),
                            hideLabelFromVision: true,
                            placeholder: __( 'New category', 'wordpress-for-writers' ),
                            value: newName,
                            onChange: setNewName,
                            disabled: disabled || adding,
                            __next40pxDefaultSize: true,
                            __nextHasNoMarginBottom: true,
                        } ),
                        categories?.length > 0 && el( SelectControl, {
                            className: 'wfw-terms__add-parent',
                            label: __( 'Parent category', 'wordpress-for-writers' ),
                            hideLabelFromVision: true,
                            value: String( newParent ),
                            options: [ { value: '0', label: __( '— Parent category —', 'wordpress-for-writers' ) }, ...parentOptions ],
                            onChange: ( value ) => setNewParent( Number( value ) ),
                            disabled: disabled || adding,
                            __next40pxDefaultSize: true,
                            __nextHasNoMarginBottom: true,
                        } ),
                        el( Button, { type: 'submit', variant: 'secondary', disabled: disabled || adding || ! newName.trim(), __next40pxDefaultSize: true },
                            __( 'Add category', 'wordpress-for-writers' ) )
                    )
                ),
                post && terms.tags && el( 'section', { className: 'wfw-terms__section' },
                    el( FormTokenField, {
                        className: 'wfw-terms__tags',
                        label: __( 'Tags', 'wordpress-for-writers' ),
                        value: tagNames,
                        suggestions,
                        maxSuggestions: SUGGESTIONS,
                        onChange: changeTags,
                        onInputChange: setTagInput,
                        placeholder: __( 'Add a tag', 'wordpress-for-writers' ),
                        disabled,
                        __experimentalShowHowTo: false,
                        __next40pxDefaultSize: true,
                        __nextHasNoMarginBottom: true,
                        messages: {
                            added: __( 'Tag added.', 'wordpress-for-writers' ),
                            removed: __( 'Tag removed.', 'wordpress-for-writers' ),
                            remove: __( 'Remove tag', 'wordpress-for-writers' ),
                            __experimentalInvalid: __( 'Invalid tag', 'wordpress-for-writers' ),
                        },
                    } ),
                    popular.length > 0 && el( Fragment, null,
                        el( 'h3', { className: 'wfw-panel__label wfw-terms__popular-label', id: 'wfw-terms-popular' }, __( 'Your tags', 'wordpress-for-writers' ) ),
                        el( 'div', { className: 'wfw-terms__chips', role: 'group', 'aria-labelledby': 'wfw-terms-popular' },
                            popular.map( ( t ) => el( Button, {
                                key: t.id,
                                className: 'wfw-terms__chip',
                                variant: 'tertiary',
                                size: 'compact',
                                disabled,
                                onClick: () => save( { tags: [ ...tagIds, t.id ] } ),
                            }, '# ' + name( t ) ) )
                        )
                    )
                ),
                status && el( 'div', { className: 'wfw-panel__status wfw-terms__status', role: 'status' }, el( Spinner ), status )
            );
        }

        return { el, Panel };
    } )();

    /*
     * Shows a panel in the editor pane in place of the note's editor: its
     * featured image ('image') or its categories and tags ('terms'). The panel
     * saves straight to the note, so the note's own editors save first and go,
     * and load again (with the changes) when next shown. Other tabs keep
     * running behind the panel.
     */
    async function openPanel( id, kind, props = {} ) {
        const module = kind === 'image' ? FEATURED : TERMS;
        if ( ! module ) {
            return;
        }
        const open = tabs.filter( ( t ) => t.id === id );
        for ( const tab of open ) {
            if ( ! ( await canLeaveEditor( tab ) ) ) {
                return;
            }
        }
        open.forEach( dropFrame );
        if ( open.length && ! open.includes( current ) ) {
            current = open[ 0 ];
        }
        state.activeId = id;
        markActive();
        window.history.replaceState( null, '', '#' + kind + '=' + id );
        const editor = clearEditorPane();
        tabs.forEach( ( t ) => setHidden( t, true ) );
        root.classList.add( 'has-note' );
        renderSidebar();
        const host = document.createElement( 'div' );
        host.className = 'wfw-panel';
        host.setAttribute( 'role', 'region' );
        host.setAttribute( 'aria-label', kind === 'image' ? __( 'Featured image', 'wordpress-for-writers' ) : __( 'Categories and tags', 'wordpress-for-writers' ) );
        editor.appendChild( host );
        const panelRoot = wp.element.createRoot( host );
        panelRoot.render( module.el( module.Panel, { ...props, postId: id, onBack: () => openNote( id ), onSaved: () => { loadNotes(); if ( kind === 'terms' ) { loadTerms(); } } } ) );
        state.panel = { id, root: panelRoot };
    }

    function openFeatured( id ) {
        return openPanel( id, 'image' );
    }

    // focus: 'categories' or 'tags', the part of the form to start in.
    function openTerms( id, focus ) {
        return openPanel( id, 'terms', { focus } );
    }

    // ---- Appearance --------------------------------------------------------

    function applyAppearance() {
        Object.entries( appearance ).forEach( ( [ key, value ] ) => {
            document.documentElement.dataset[ 'wfw' + key[ 0 ].toUpperCase() + key.slice( 1 ) ] = value;
        } );
        tabs.forEach( postAppearance );
    }

    // Every tab's editor follows the appearance, in view or not.
    function postAppearance( tab ) {
        tab.frame?.contentWindow?.postMessage( { source: 'wfw', type: 'appearance', appearance }, window.location.origin );
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

    // Keys for both kinds of .wfw-menu: this one and the context menus below.
    root.addEventListener( 'keydown', ( event ) => {
        const onButton = event.target.closest( '.wfw-user' );
        const menu = event.target.closest( '.wfw-menu' );
        if ( ! onButton && ! menu ) {
            return;
        }
        // Each closes back to where it opened: this one to its button, a context menu to its note or item.
        const isContext = !! menu?.classList.contains( 'wfw-menu--context' );
        const close = isContext ? () => closeContextMenu() : () => closeUserMenu();
        if ( event.key === 'Escape' && ( isContext || userMenuOpen ) ) {
            event.preventDefault();
            event.stopPropagation();
            close();
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
                // A context menu opened by pointer has focus itself, with no item picked yet: ArrowUp starts from the end.
                const next = { ArrowDown: index + 1, ArrowUp: index < 0 ? -1 : index - 1, Home: 0, End: -1 }[ event.key ];
                items[ ( next + items.length ) % items.length ].focus();
                break;
            }
            case 'Tab':
                // Focus goes back to the button (or note), and the browser's Tab then moves on from there.
                close();
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

    // ---- Context menus -----------------------------------------------------

    /*
     * Right-click menus for the notes in the list and the categories and tags in
     * the sidebar. Each is the account menu's .wfw-menu, with its keys (above),
     * in one element at the app's root, outside the panes that re-render. It opens
     * at the pointer and stays inside the window. The context-menu key and
     * Shift+F10 open it for the focused note or item. On touch screens a two-finger
     * tap opens it for notes and sidebar items alike, and a long press does for
     * sidebar items. A long press on a note is left to the browser for selecting
     * text, since the note's own buttons are the touch path. Like the block
     * editor's List View, everything goes through the one opener that the
     * browser's contextmenu event uses: a trackpad's two-finger tap and Android's
     * long press already arrive as that event, but no browser sends it for two
     * fingers on a touch screen, so that gesture is recognized here. The
     * editor keeps the browser's menu: its canvas is another document, so these
     * listeners never hear from it.
     */
    const NOTE_ITEM = '.wfw-note';
    const TERM_ITEM = '.wfw-nav[data-action="view"]:is( [data-type="category"], [data-type="tag"] )';

    // The open menu: what it acts on, read as it opens, and the element it belongs to.
    let contextMenu = null;

    function contextMenuEl() {
        return root.querySelector( '.wfw-menu--context' );
    }

    /*
     * The post's link with preview=true, the way get_preview_post_link() builds it.
     * The editor's own preview goes through an autosave instead, but only notes
     * that aren't published get this item, and the app saves those as drafts
     * while they're written, so the preview shows what the list does.
     */
    function previewUrl( link ) {
        const url = new URL( link, window.location.href );
        url.searchParams.set( 'preview', 'true' );
        return url.href;
    }

    // Items are { command } buttons or { href } links; null is a separator.
    function noteMenuItems( note ) {
        if ( note.status === 'trash' ) {
            // The same actions, for the same people, as the note's own buttons.
            return settings.canDelete ? [
                { command: 'restore', icon: 'restore', label: __( 'Restore', 'wordpress-for-writers' ) },
                { command: 'delete', icon: 'close', label: __( 'Delete permanently', 'wordpress-for-writers' ) },
            ] : [];
        }
        const published = note.status === 'publish' || note.status === 'private';
        const items = [
            { command: 'open', icon: 'open', label: __( 'Open', 'wordpress-for-writers' ) },
            // A tab of the app's own, under Editing now, rather than another browser tab.
            { command: 'open-tab', icon: 'external', label: __( 'Open in new tab', 'wordpress-for-writers' ) },
            { command: 'duplicate', icon: 'duplicate', label: __( 'Duplicate', 'wordpress-for-writers' ) },
        ];
        if ( note.link ) {
            items.push(
                null,
                published
                    ? { href: note.link, icon: 'view', label: __( 'View post', 'wordpress-for-writers' ) }
                    : { href: previewUrl( note.link ), icon: 'view', label: __( 'Preview', 'wordpress-for-writers' ) },
                { command: 'copy-link', icon: 'link', label: __( 'Copy link', 'wordpress-for-writers' ) }
            );
        }
        if ( settings.canDelete ) {
            items.push( null, { command: 'trash', icon: 'trash', label: __( 'Move to trash', 'wordpress-for-writers' ) } );
        }
        return items;
    }

    // The same for a category or tag, whether it's the one in the main menu or in its section.
    function termMenuItems( view ) {
        const { link } = termFor( view );
        const items = [ pinFor( view )
            ? { command: 'unpin', icon: 'pin', label: __( 'Unpin from main menu', 'wordpress-for-writers' ) }
            : { command: 'pin', icon: 'pin', label: __( 'Pin to main menu', 'wordpress-for-writers' ) } ];
        if ( link ) {
            items.push( { href: link, icon: 'view', label: __( 'View on site', 'wordpress-for-writers' ) } );
        }
        return items;
    }

    // Links are real links, so they open in a new tab past any popup blocker, and Cmd-click works.
    function contextItemHtml( item ) {
        if ( ! item ) {
            return '<div class="wfw-menu__separator" role="separator"></div>';
        }
        const content = `${ icon( item.icon ) }<span>${ esc( item.label ) }</span>`;
        return item.href
            ? `<a class="wfw-menu__item" role="menuitem" tabindex="-1" data-action="context-item" href="${ esc( item.href ) }" target="_blank" rel="noopener">${ content }</a>`
            : `<button class="wfw-menu__item" role="menuitem" tabindex="-1" data-action="context-item" data-command="${ esc( item.command ) }">${ content }</button>`;
    }

    function describeContextTarget( el ) {
        if ( el.matches( NOTE_ITEM ) ) {
            const note = state.notes.find( ( n ) => n.id === Number( el.dataset.id ) );
            return note && { kind: 'note', id: note.id, note, label: el.querySelector( '.wfw-note__title' )?.textContent, items: noteMenuItems( note ) };
        }
        const view = { type: el.dataset.type, id: Number( el.dataset.id ) };
        const inPins = !! el.closest( '.wfw-sidebar__pins' );
        return { kind: 'term', ...view, inPins, label: el.querySelector( '.wfw-nav__label' )?.textContent, items: termMenuItems( view ) };
    }

    // Opens the menu for a note or sidebar item at `point`, or below the item
    // without one (keyboard, touch). From the keyboard focus goes to the first
    // item; otherwise to the menu itself, so its keys work from the start.
    function openContextMenu( el, { point = null, keyboard = false } = {} ) {
        const menu = describeContextTarget( el );
        if ( ! menu?.items.length ) {
            return false;
        }
        closeContextMenu( { focus: false } );
        const box = contextMenuEl();
        const rect = el.getBoundingClientRect();
        contextMenu = { ...menu, target: el, keyboard, top: rect.top, left: rect.left, index: [ ...root.querySelectorAll( NOTE_ITEM ) ].indexOf( el ) };
        box.innerHTML = menu.items.map( contextItemHtml ).join( '' );
        box.setAttribute( 'aria-label', menu.label || '' );
        box.hidden = false;
        el.classList.add( 'has-menu' );
        placeContextMenu( box, point || { x: rect.left + 12, y: rect.top + Math.min( rect.height, 36 ) } );
        ( keyboard ? box.querySelector( '[role="menuitem"]' ) : box ).focus( { preventScroll: true } );
        return true;
    }

    // Like a native menu: right of and below the point, flipped to the other side
    // where it would leave the window, and never past the window's edges.
    function placeContextMenu( box, { x, y } ) {
        const margin = 8;
        const bounds = root.getBoundingClientRect();
        box.style.maxHeight = bounds.height - margin * 2 + 'px';
        box.style.left = '0px';
        box.style.top = '0px';
        const { width, height } = box.getBoundingClientRect();
        const left = x + width > bounds.right - margin ? x - width : x;
        const top = y + height > bounds.bottom - margin ? y - height : y;
        box.style.left = Math.max( bounds.left + margin, Math.min( left, bounds.right - margin - width ) ) + 'px';
        box.style.top = Math.max( bounds.top + margin, Math.min( top, bounds.bottom - margin - height ) ) + 'px';
    }

    // The element the open menu belongs to. Drafts' autosaves re-render the list
    // and sidebar under it, so it's found again by what it shows (and for a
    // pinned category or tag, by which of its two copies it was), and ringed again.
    function contextTarget() {
        if ( contextMenu && ! contextMenu.target.isConnected ) {
            const selector = contextMenu.kind === 'note'
                ? `${ NOTE_ITEM }[data-id="${ contextMenu.id }"]`
                : `.wfw-nav[data-action="view"][data-type="${ contextMenu.type }"][data-id="${ contextMenu.id }"]`;
            const found = [ ...root.querySelectorAll( selector ) ].find( ( el ) => !! el.closest( '.wfw-sidebar__pins' ) === !! contextMenu.inPins );
            if ( ! found ) {
                return null;
            }
            found.classList.add( 'has-menu' );
            contextMenu.target = found;
        }
        return contextMenu?.target || null;
    }

    function closeContextMenu( { focus = true } = {} ) {
        if ( ! contextMenu ) {
            return;
        }
        const target = contextTarget();
        target?.classList.remove( 'has-menu' );
        contextMenuEl().hidden = true;
        contextMenu = null;
        if ( focus ) {
            target?.focus( { preventScroll: true } );
        }
    }

    function runContextCommand( command ) {
        const menu = contextMenu;
        closeContextMenu();
        switch ( command ) {
            case 'open':
                openNote( menu.id );
                break;
            case 'open-tab':
                openNoteInTab( menu.id );
                break;
            case 'duplicate':
                duplicateNote( menu.id );
                break;
            case 'copy-link':
                copyLink( menu.note.link );
                break;
            case 'trash':
                refocusNotes( trashNote( menu.id ), menu );
                break;
            case 'restore':
                refocusNotes( restoreNote( menu.id ), menu );
                break;
            case 'delete':
                refocusNotes( deleteNote( menu.id ), menu );
                break;
            case 'pin':
            case 'unpin':
                setPinned( menu, command === 'pin' );
                break;
        }
    }

    // When a note chosen from the keyboard leaves the list, focus moves to the note now in its place.
    async function refocusNotes( action, menu ) {
        await action;
        const active = document.activeElement;
        if ( menu.keyboard && ( ! active || active === document.body ) ) {
            const notes = root.querySelectorAll( NOTE_ITEM );
            notes[ Math.min( menu.index, notes.length - 1 ) ]?.focus();
        }
    }

    async function copyLink( url ) {
        try {
            await writeClipboard( url );
            showToast( __( 'Link copied', 'wordpress-for-writers' ) );
        } catch ( e ) {
            showToast( __( 'The link couldn’t be copied', 'wordpress-for-writers' ) );
        }
    }

    // The async clipboard needs a secure context. Sites on plain http, other than localhost, copy the old way.
    function writeClipboard( text ) {
        if ( window.isSecureContext && navigator.clipboard ) {
            return navigator.clipboard.writeText( text );
        }
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
        focused?.focus( { preventScroll: true } );
        return copied ? Promise.resolve() : Promise.reject( new Error( 'copy' ) );
    }

    // A short message at the foot of the window, also read out by screen readers.
    let toastTimer = 0;

    function showToast( message ) {
        const toast = root.querySelector( '.wfw-toast' );
        clearTimeout( toastTimer );
        toast.textContent = message;
        toast.classList.add( 'is-visible' );
        toastTimer = setTimeout( () => {
            toast.classList.remove( 'is-visible' );
            toastTimer = setTimeout( () => ( toast.textContent = '' ), 200 );
        }, 2000 );
    }

    // A long press on a sidebar item opens its menu on touch screens, which have
    // no right-click. Lifting that finger is then not a tap: it would choose the
    // item, and take focus from the menu.
    let longPress = null;
    let pressOpened = false;
    let lastPointerType = '';

    function cancelLongPress() {
        clearTimeout( longPress?.timer );
        longPress = null;
    }

    document.addEventListener( 'pointerdown', ( event ) => {
        lastPointerType = event.pointerType;
        pressOpened = false;
    }, true );

    root.addEventListener( 'pointerdown', ( event ) => {
        cancelLongPress();
        const el = event.pointerType === 'touch' ? event.target.closest( TERM_ITEM ) : null;
        if ( el ) {
            longPress = {
                x: event.clientX,
                y: event.clientY,
                timer: setTimeout( () => {
                    longPress = null;
                    pressOpened = openContextMenu( el );
                }, 500 ),
            };
        }
    } );

    root.addEventListener( 'pointermove', ( event ) => {
        if ( longPress && Math.hypot( event.clientX - longPress.x, event.clientY - longPress.y ) > 10 ) {
            cancelLongPress();
        }
    } );

    root.addEventListener( 'pointerup', cancelLongPress );
    root.addEventListener( 'pointercancel', cancelLongPress );

    root.addEventListener( 'touchend', ( event ) => {
        if ( pressOpened ) {
            pressOpened = false;
            event.preventDefault();
        }
    } );

    /*
     * A two-finger tap: a second finger lands soon after the first, neither moves,
     * and both lift soon after. The menu is for the item under the first finger
     * (or the second, when the first missed), and opens when the last one lifts.
     * Neither finger's tap chooses the item, and three fingers are no tap at all.
     */
    const TWO_FINGER_GAP = 250; // ms between the two fingers landing
    const TWO_FINGER_TAP = 500; // ms from the first landing to the last lifting
    const touches = new Map();
    let twoFinger = null;
    let suppressClick = false;

    root.addEventListener( 'pointerdown', ( event ) => {
        if ( event.pointerType !== 'touch' ) {
            return;
        }
        touches.set( event.pointerId, { x: event.clientX, y: event.clientY } );
        const el = event.target.closest( `${ NOTE_ITEM }, ${ TERM_ITEM }` );
        if ( touches.size === 1 ) {
            suppressClick = false;
            twoFinger = { el, start: event.timeStamp, both: false };
        } else if ( touches.size === 2 && twoFinger && event.timeStamp - twoFinger.start < TWO_FINGER_GAP ) {
            twoFinger.both = true;
            twoFinger.el = twoFinger.el || el;
            suppressClick = true;
        } else {
            twoFinger = null;
        }
    } );

    root.addEventListener( 'pointermove', ( event ) => {
        const from = touches.get( event.pointerId );
        if ( twoFinger && from && Math.hypot( event.clientX - from.x, event.clientY - from.y ) > 10 ) {
            twoFinger = null;
        }
    } );

    root.addEventListener( 'pointerup', ( event ) => {
        if ( ! touches.delete( event.pointerId ) || touches.size ) {
            return;
        }
        const tap = twoFinger;
        twoFinger = null;
        if ( tap?.both && tap.el && event.timeStamp - tap.start < TWO_FINGER_TAP ) {
            cancelLongPress();
            pressOpened = openContextMenu( tap.el );
        }
    } );

    root.addEventListener( 'pointercancel', ( event ) => {
        touches.delete( event.pointerId );
        twoFinger = null;
    } );

    // Where a browser still makes a click of one of the fingers, it doesn't open the note or view.
    root.addEventListener( 'click', ( event ) => {
        if ( suppressClick ) {
            suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
        }
    }, true );

    root.addEventListener( 'contextmenu', ( event ) => {
        // No browser menu over ours.
        if ( contextMenuEl().contains( event.target ) ) {
            event.preventDefault();
            return;
        }
        const el = event.target.closest( `${ NOTE_ITEM }, ${ TERM_ITEM }` );
        if ( ! el ) {
            return;
        }
        // Text selected in a note keeps the browser's menu, to copy it. So does a long press on a note (Android).
        const touch = ( event.pointerType || lastPointerType ) === 'touch';
        const selection = window.getSelection();
        if ( el.matches( NOTE_ITEM ) && ( touch || ( ! selection.isCollapsed && el.contains( selection.anchorNode ) ) ) ) {
            return;
        }
        // Android's own long press may come after ours has opened the menu.
        if ( contextMenu?.target === el ) {
            event.preventDefault();
            return;
        }
        cancelLongPress();
        // With nothing to offer (a note in the Trash, for someone who can't delete), the browser's menu shows.
        if ( openContextMenu( el, { point: touch ? null : { x: event.clientX, y: event.clientY } } ) ) {
            event.preventDefault();
            pressOpened = touch;
        }
    } );

    root.addEventListener( 'keydown', ( event ) => {
        if ( event.key !== 'ContextMenu' && ! ( event.key === 'F10' && event.shiftKey ) ) {
            return;
        }
        const el = event.target.closest( `${ NOTE_ITEM }, ${ TERM_ITEM }` );
        if ( contextMenuEl().contains( event.target ) || ( el && openContextMenu( el, { keyboard: true } ) ) ) {
            event.preventDefault();
        }
    } );

    // A click outside closes the menu without moving focus, and so does the window
    // losing focus (a click into the editor). Resizing closes it, and so does a
    // scroll that moves its note or item, but not a re-render that keeps it put.
    document.addEventListener( 'pointerdown', ( event ) => {
        if ( contextMenu && ! contextMenuEl().contains( event.target ) ) {
            closeContextMenu( { focus: false } );
        }
    } );
    window.addEventListener( 'blur', () => closeContextMenu( { focus: false } ) );
    window.addEventListener( 'resize', () => closeContextMenu( { focus: contextMenuEl().contains( document.activeElement ) } ) );
    document.addEventListener( 'scroll', ( event ) => {
        if ( ! contextMenu || contextMenuEl().contains( event.target ) ) {
            return;
        }
        const rect = contextTarget()?.getBoundingClientRect();
        if ( ! rect || rect.top !== contextMenu.top || rect.left !== contextMenu.left ) {
            closeContextMenu( { focus: contextMenuEl().contains( document.activeElement ) } );
        }
    }, true );

    // ---- Pinned categories and tags ----------------------------------------

    /*
     * Categories and tags pinned from their context menus show in the main menu,
     * below the built-in views, in the order they were pinned. They're saved per
     * user, like appearance; includes/pinned-terms.php has the user meta, and
     * leaves out terms that have since been deleted.
     */
    const TAXONOMIES = { category: 'category', tag: 'post_tag' };

    function viewOf( pin ) {
        return { type: pin.taxonomy === 'category' ? 'category' : 'tag', id: pin.id };
    }

    function pinFor( view ) {
        return state.pins.find( ( pin ) => pin.taxonomy === TAXONOMIES[ view.type ] && pin.id === view.id );
    }

    // A category's or tag's name and archive link, from the sidebar's lists or,
    // before they load and past their first 100 terms, from its pin.
    function termFor( view ) {
        const term = ( view.type === 'category' ? state.categories : state.tags ).find( ( t ) => t.id === view.id ) || pinFor( view );
        return { name: term?.name || '', link: term?.link || '' };
    }

    function setPinned( view, pinned ) {
        const pin = pinFor( view );
        state.pins = state.pins.filter( ( p ) => p !== pin );
        if ( pinned ) {
            state.pins.push( { taxonomy: TAXONOMIES[ view.type ], id: view.id, ...termFor( view ) } );
        }
        renderSidebar();
        savePins();
    }

    // One save at a time, each sending the pins as they are by then, so the last stored is the latest.
    let pinsSaved = Promise.resolve();

    function savePins() {
        pinsSaved = pinsSaved
            .then( () => apiFetch( {
                path: '/wp/v2/users/me',
                method: 'POST',
                data: { meta: { [ settings.pinnedTermsKey ]: state.pins.map( ( { taxonomy, id } ) => ( { taxonomy, id } ) ) } },
            } ) )
            .catch( () => {
                // The pins stay as they are on screen, so the writer can try again; a reload would drop them.
                showToast( __( 'Pins couldn’t be saved', 'wordpress-for-writers' ) );
            } );
    }

    // ---- Actions -----------------------------------------------------------

    function toggleFocus() {
        state.focus = ! state.focus;
        applyLayout();
    }

    async function trashNote( id ) {
        await apiFetch( { path: '/wp/v2/posts/' + id, method: 'DELETE' } );
        closeNoteTab( id );
        await refresh();
    }

    /*
     * A copy of the note as a new draft: its title (marked as a copy), content,
     * excerpt, categories, tags, featured image, format and visibility (the meta a
     * companion plugin gates the note with, so a members-only note doesn't come
     * back as one for everyone). Sticky, the date and the password stay with the
     * original. The copy opens in the tab in view.
     */
    async function duplicateNote( id ) {
        try {
            const note = await apiFetch( { path: '/wp/v2/posts/' + id + '?context=edit' } );
            const title = note.title.raw.trim();
            const metaKey = settings.visibility?.metaKey;
            const data = {
                status: 'draft',
                title: title
                    /* translators: %s: the title of the note being duplicated. */
                    ? sprintf( __( '%s (copy)', 'wordpress-for-writers' ), title )
                    : '',
                content: note.content.raw,
                excerpt: note.excerpt.raw,
                categories: note.categories,
                tags: note.tags,
                featured_media: note.featured_media,
                format: note.format,
            };
            if ( metaKey && note.meta && metaKey in note.meta ) {
                data.meta = { [ metaKey ]: note.meta[ metaKey ] };
            }
            const copy = await apiFetch( {
                path: '/wp/v2/posts',
                method: 'POST',
                data,
            } );
            await refresh();
            openNote( copy.id );
        } catch ( e ) {
            showToast( __( 'The note couldn’t be duplicated', 'wordpress-for-writers' ) );
        }
    }

    async function restoreNote( id ) {
        await apiFetch( { path: '/wp/v2/posts/' + id, method: 'POST', data: { status: 'draft' } } );
        await refresh();
    }

    async function deleteNote( id ) {
        if ( ! window.confirm( __( 'Delete this note permanently? This cannot be undone.', 'wordpress-for-writers' ) ) ) {
            return;
        }
        await apiFetch( { path: '/wp/v2/posts/' + id + '?force=true', method: 'DELETE' } );
        closeNoteTab( id );
        await refresh();
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
                // Cmd- or Ctrl-click opens the note in a tab of its own, as it would a link in a browser.
                if ( event.metaKey || event.ctrlKey ) {
                    openNoteInTab( id );
                } else {
                    openNote( id );
                }
                break;
            case 'tab': {
                const tab = tabByKey( target.dataset.tab );
                root.classList.remove( 'is-sidebar-open' );
                if ( tab ) {
                    showTab( tab );
                    root.classList.add( 'has-note' );
                }
                break;
            }
            case 'close-tab': {
                const tab = tabByKey( target.dataset.tab );
                if ( tab ) {
                    closeTab( tab );
                }
                break;
            }
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
            case 'context-item':
                if ( target.dataset.command ) {
                    runContextCommand( target.dataset.command );
                } else {
                    closeContextMenu(); // A link, which the browser goes on to follow.
                }
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

    // A middle click opens a note in a new tab and closes a tab, as in a browser.
    // Its mousedown would start the browser's autoscroll there instead.
    const MIDDLE_CLICK = '.wfw-note, .wfw-tab';
    root.addEventListener( 'mousedown', ( event ) => {
        if ( event.button === 1 && event.target.closest( MIDDLE_CLICK ) ) {
            event.preventDefault();
        }
    } );
    root.addEventListener( 'auxclick', ( event ) => {
        const el = event.button === 1 && event.target.closest( MIDDLE_CLICK );
        if ( ! el ) {
            return;
        }
        event.preventDefault();
        if ( el.matches( '.wfw-tab' ) ) {
            const tab = tabByKey( el.dataset.tab );
            if ( tab ) {
                closeTab( tab );
            }
        } else {
            openNoteInTab( Number( el.dataset.id ) );
        }
    } );

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
        } else if ( event.key === 'Escape' && state.panel && ! event.defaultPrevented ) {
            openNote( state.panel.id );
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
    // the active item is in sight, unless it's pinned and in sight already.
    // Folding it later in the session is left alone.
    const activeSection = { category: 'categories', tag: 'tags' }[ state.view.type ];
    if ( activeSection && state.collapsed[ activeSection ] && ! pinFor( state.view ) ) {
        state.collapsed[ activeSection ] = false;
        savePref( 'collapsed', state.collapsed );
    }

    renderShell();
    renderSidebar();
    renderListHeader();
    refresh();

    restoreTabs();

    const hashMatch = window.location.hash.match( /(note|image|terms)=(\d+)/ );
    if ( hashMatch ) {
        ( { image: openFeatured, terms: openTerms, note: openNote }[ hashMatch[ 1 ] ] )( Number( hashMatch[ 2 ] ) );
    }
} )();
