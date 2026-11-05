/**
 * Runs inside the block editor when it is embedded in the Writer app.
 * Reports title changes and saves to the parent, autosaves drafts, and
 * answers "flush" requests before the parent switches notes.
 */
( function () {
    if ( window.parent === window ) {
        return;
    }

    const { select, dispatch, subscribe } = wp.data;
    const DRAFT_STATUSES = [ 'draft', 'auto-draft', 'pending' ];
    const AUTOSAVE_DELAY = 1500;

    let appearance = ( window.wfwFrame && window.wfwFrame.appearance ) || {};

    /*
     * Visibility picker in the note's settings sidebar, when a companion
     * plugin (Writer Members) offers options. Saved with the post through the
     * REST API as the post meta it names; shown only for post types that
     * register that meta.
     */
    const visibility = window.wfwFrame && window.wfwFrame.visibility;
    const SettingPanel = ( wp.editor && wp.editor.PluginDocumentSettingPanel ) || ( wp.editPost && wp.editPost.PluginDocumentSettingPanel );
    if ( visibility && wp.plugins && SettingPanel ) {
        const el = wp.element.createElement;
        const { __ } = wp.i18n;
        const key = visibility.metaKey;
        const options = [ { value: '', label: __( 'Everyone', 'wordpress-for-writers' ) } ].concat( visibility.options );

        wp.plugins.registerPlugin( 'wfw-visibility', {
            render: function VisibilityPanel() {
                const meta = wp.data.useSelect( ( s ) => s( 'core/editor' ).getEditedPostAttribute( 'meta' ), [] );
                const { editPost } = wp.data.useDispatch( 'core/editor' );
                if ( ! meta || ! Object.prototype.hasOwnProperty.call( meta, key ) ) {
                    return null;
                }
                return el(
                    SettingPanel,
                    { name: 'wfw-visibility', title: __( 'Visibility', 'wordpress-for-writers' ), className: 'wfw-visibility' },
                    el( wp.components.SelectControl, {
                        label: __( 'Who can read the whole note', 'wordpress-for-writers' ),
                        value: meta[ key ] || '',
                        options,
                        onChange: ( value ) => editPost( { meta: { ...meta, [ key ]: value } } ),
                        __nextHasNoMarginBottom: true,
                        __next40pxDefaultSize: true,
                    } )
                );
            },
        } );
    }

    function stamp( doc ) {
        if ( ! doc || ! doc.documentElement ) {
            return;
        }
        Object.entries( appearance ).forEach( ( [ key, value ] ) => {
            doc.documentElement.dataset[ 'wfw' + key[ 0 ].toUpperCase() + key.slice( 1 ) ] = value;
        } );
    }

    // The canvas iframe is created (and sometimes re-created) by the editor;
    // stamp the appearance attributes on its root whenever it appears or loads.
    function stampCanvas() {
        const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
        if ( ! canvas ) {
            return;
        }
        if ( ! canvas.dataset.wfwWatched ) {
            canvas.dataset.wfwWatched = '1';
            canvas.addEventListener( 'load', () => stamp( canvas.contentDocument ) );
        }
        stamp( canvas.contentDocument );
    }

    new MutationObserver( stampCanvas ).observe( document.body, { childList: true, subtree: true } );

    /*
     * Keep the bottom toolbar above the on-screen keyboard. iOS Safari (browser
     * and home-screen app) overlays the keyboard on the page without resizing
     * the layout viewport, so position: fixed; bottom stays hidden behind it.
     * The top window's visual viewport is the part actually visible; the overlap
     * between it and this frame's bottom edge becomes --wfw-keyboard, in this
     * document and in the canvas. Only applied while text is focused, since iOS
     * can leave the visual viewport short after the keyboard closes.
     */
    // Chromium cross-origin isolates the editor (Document-Isolation-Policy), which
    // blocks access to the parent. It resizes for the keyboard on its own anyway
    // (interactive-widget=resizes-content), so there is nothing to measure there.
    let viewport = null;
    try {
        viewport = window.parent.visualViewport;
    } catch ( e ) {}
    let keyboard = -1;
    let keyboardFrame = 0;
    let keyboardSettle = 0;

    function isTyping() {
        let el = document.activeElement;
        while ( el && el.tagName === 'IFRAME' ) {
            try {
                el = el.contentDocument.activeElement;
            } catch ( e ) {
                return false;
            }
        }
        return !! el && ( el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test( el.tagName ) );
    }

    function measureKeyboard() {
        keyboardFrame = 0;
        let overlap = 0;
        if ( viewport && window.frameElement && isTyping() ) {
            const bottom = window.frameElement.getBoundingClientRect().bottom;
            overlap = Math.max( 0, Math.round( bottom - ( viewport.offsetTop + viewport.height ) ) );
        }
        if ( performance.now() < keyboardSettle ) {
            keyboardFrame = requestAnimationFrame( measureKeyboard );
        }
        if ( overlap === keyboard ) {
            return;
        }
        keyboard = overlap;
        const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
        [ document, canvas && canvas.contentDocument ].forEach( ( doc ) => {
            if ( doc && doc.documentElement ) {
                doc.documentElement.style.setProperty( '--wfw-keyboard', overlap + 'px' );
            }
        } );
    }

    // While the iOS keyboard is up the app shrinks the editor to the space above
    // it (see app.js); bring the caret back into view inside the canvas then,
    // leaving room for the toolbar.
    function keepCaretVisible() {
        const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
        const win = canvas && canvas.contentWindow;
        const selection = win && win.getSelection();
        if ( ! selection || ! selection.rangeCount || ! isTyping() ) {
            return;
        }
        const rect = selection.getRangeAt( 0 ).getBoundingClientRect();
        const limit = win.innerHeight - 80;
        if ( rect.height && rect.bottom > limit ) {
            win.scrollBy( 0, rect.bottom - limit );
        }
    }

    // iOS reports the keyboard in steps while it animates, and its own scrolling
    // to keep the caret in view doesn't always fire an event at the end. So after
    // any change keep measuring every frame for a moment rather than trusting the
    // last event, which could leave the toolbar parked behind the keyboard.
    function queueKeyboard() {
        keyboardSettle = performance.now() + 800;
        if ( ! keyboardFrame ) {
            keyboardFrame = requestAnimationFrame( measureKeyboard );
        }
    }

    // Dismissing the iOS keyboard (Done) leaves the block selected: the toolbar
    // stays up, and tapping that block again doesn't bring the caret back until
    // something else is selected (tapping empty canvas "fixes" it). So once the
    // keyboard has gone from open to closed, drop focus and selection, unless
    // focus moved to a control in the editor chrome. Keyboard state is judged
    // against the tallest viewport seen, after resizing settles: iPhones resize
    // in several small steps while the keyboard animates.
    let fullHeight = viewport ? viewport.height : 0;
    let fullWidth = viewport ? viewport.width : 0;
    let keyboardOpen = false;
    let settleTimer = 0;

    function clearStaleSelection() {
        if ( viewport.width !== fullWidth ) {
            fullWidth = viewport.width;
            fullHeight = 0;
        }
        fullHeight = Math.max( fullHeight, viewport.height );
        clearTimeout( settleTimer );
        settleTimer = setTimeout( () => {
            if ( viewport.height < fullHeight - 150 ) {
                keyboardOpen = true;
                return;
            }
            if ( ! keyboardOpen || viewport.height < fullHeight - 80 ) {
                return;
            }
            keyboardOpen = false;
            const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
            const focused = document.activeElement;
            if ( focused && focused !== document.body && focused !== canvas ) {
                return;
            }
            const editable = canvas && canvas.contentDocument && canvas.contentDocument.activeElement;
            if ( editable && editable.isContentEditable ) {
                editable.blur();
            }
            dispatch( 'core/block-editor' ).clearSelectedBlock();
        }, 250 );
    }

    if ( viewport ) {
        viewport.addEventListener( 'resize', clearStaleSelection );
        viewport.addEventListener( 'resize', queueKeyboard );
        viewport.addEventListener( 'scroll', queueKeyboard );
        // Focus moves inside the canvas iframe; focusin/out don't cross into this document.
        [ 'focusin', 'focusout' ].forEach( ( type ) => {
            document.addEventListener( type, queueKeyboard, true );
            window.parent.document.addEventListener( type, queueKeyboard, true );
        } );
        new MutationObserver( () => {
            const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
            if ( canvas && ! canvas.dataset.wfwKeyboard ) {
                canvas.dataset.wfwKeyboard = '1';
                const watch = () => {
                    keyboard = -1;
                    // Typing and moving the caret can scroll the page under the keyboard too.
                    [ 'focusin', 'focusout', 'input', 'selectionchange' ].forEach( ( type ) => canvas.contentDocument.addEventListener( type, queueKeyboard, true ) );
                    canvas.contentWindow.addEventListener( 'resize', keepCaretVisible );
                    queueKeyboard();
                };
                canvas.addEventListener( 'load', watch );
                if ( canvas.contentDocument && canvas.contentDocument.readyState !== 'loading' ) {
                    watch();
                }
            }
        } ).observe( document.body, { childList: true, subtree: true } );
    }

    /*
     * Featured image, categories and tags: a row of quiet links above the
     * title, like the cover image prompt in Ghost or Medium. It shows while the
     * pointer is over the title or the title has focus (always, faintly, on
     * touch screens). Each link asks the app to open its panel in place of the
     * editor: the featured image panel, or the categories and tags form, open
     * on the part that was clicked. The row sits in the canvas, absolutely
     * positioned, so the title doesn't move. The editor re-renders the title
     * wrapper, so the row is put back when it drops out.
     *
     * A link's label says what the note has: the names of its categories or
     * tags (read through core-data, like the editor's own panels), or an
     * invitation to add some.
     */
    function mountTitleLinks() {
        const config = window.wfwFrame || {};
        const { __, _n, sprintf } = wp.i18n;
        const svg = ( d ) => '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
        const LINKS = [
            {
                key: 'image',
                enabled: !! config.featuredImages,
                icon: svg( 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z' ),
                message: { type: 'featured-image' },
                label() {
                    return editor().getEditedPostAttribute( 'featured_media' )
                        ? __( 'Change featured image', 'wordpress-for-writers' )
                        : __( 'Add featured image', 'wordpress-for-writers' );
                },
            },
            {
                key: 'categories',
                enabled: !! config.categories,
                icon: svg( 'M12.848 8a1 1 0 0 1-.914-.594l-.723-1.63a.5.5 0 0 0-.447-.276H5a.5.5 0 0 0-.5.5v11.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5v-9A.5.5 0 0 0 19 8h-6.152Zm.612-1.5a.5.5 0 0 1-.462-.31l-.445-1.084A2 2 0 0 0 10.763 4H5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-5.54Z' ),
                message: { type: 'terms', focus: 'categories' },
                label() {
                    return termNames( 'categories', 'category', __( 'Add categories', 'wordpress-for-writers' ),
                        /* translators: %d: number of categories. */
                        ( n ) => sprintf( _n( '%d category', '%d categories', n, 'wordpress-for-writers' ), n ) );
                },
            },
            {
                key: 'tags',
                enabled: !! config.tags,
                icon: svg( 'M20.5 5.5h-3.1l.7-3.3-1.5-.3-.7 3.6H10l.7-3.3-1.5-.3-.7 3.6H4.5V7h3.7l-.9 4.5H3.5V13h3.5l-.7 3.3 1.5.3.7-3.6H14l-.7 3.3 1.5.3.7-3.6h4V11.5h-3.7l.9-4.5h3.8V5.5Zm-6.2 6h-5.5L9.7 7h5.5l-.9 4.5Z' ),
                message: { type: 'terms', focus: 'tags' },
                label() {
                    return termNames( 'tags', 'post_tag', __( 'Add tags', 'wordpress-for-writers' ),
                        /* translators: %d: number of tags. */
                        ( n ) => sprintf( _n( '%d tag', '%d tags', n, 'wordpress-for-writers' ), n ) );
                },
            },
        ].filter( ( item ) => item.enabled );

        if ( ! LINKS.length ) {
            return;
        }

        // The names of the note's terms, comma separated; a count while they load.
        // The stores hand back the same arrays until they change, so the last
        // result is kept per attribute and reused while they stay the same.
        const named = {};
        function termNames( attribute, taxonomy, empty, count ) {
            const ids = editor().getEditedPostAttribute( attribute ) || [];
            if ( ! ids.length ) {
                return empty;
            }
            const terms = select( 'core' ).getEntityRecords( 'taxonomy', taxonomy, { include: ids, per_page: ids.length, context: 'view', _fields: 'id,name' } );
            if ( ! terms ) {
                return count( ids.length );
            }
            const last = named[ attribute ];
            if ( last && last.ids === ids && last.terms === terms ) {
                return last.text;
            }
            // Term names come HTML-escaped from the REST API.
            const names = ids.map( ( id ) => terms.find( ( t ) => t.id === id ) ).filter( Boolean ).map( ( t ) => wp.htmlEntities.decodeEntities( t.name || '' ) );
            const text = names.length ? names.join( ', ' ) : count( ids.length );
            named[ attribute ] = { ids, terms, text };
            return text;
        }

        let row = null;
        let labels = {};

        function label() {
            if ( ! row ) {
                return;
            }
            LINKS.forEach( ( item ) => {
                const text = item.label();
                if ( text !== labels[ item.key ] ) {
                    labels[ item.key ] = text;
                    const span = row.querySelector( '[data-link="' + item.key + '"] span' );
                    span.textContent = text;
                    span.title = text;
                }
            } );
        }

        const watched = new WeakSet();

        // The canvas iframe loads after this script runs and can be re-created, so
        // each new canvas document is watched for the title wrapper (re)appearing.
        function watch( doc ) {
            if ( doc && doc.body && ! watched.has( doc ) ) {
                watched.add( doc );
                new MutationObserver( attach ).observe( doc.body, { childList: true, subtree: true } );
            }
        }

        function attach() {
            const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
            if ( ! canvas ) {
                return;
            }
            if ( ! canvas.dataset.wfwTitleLinks ) {
                canvas.dataset.wfwTitleLinks = '1';
                canvas.addEventListener( 'load', attach );
            }
            const doc = canvas.contentDocument;
            watch( doc );
            const wrapper = doc && doc.querySelector( '.editor-visual-editor__post-title-wrapper' );
            if ( ! wrapper || ( row && row.parentNode === wrapper ) ) {
                return;
            }
            if ( ! row || row.ownerDocument !== doc ) {
                row = doc.createElement( 'div' );
                row.className = 'wfw-title-links';
                row.contentEditable = 'false';
                LINKS.forEach( ( item ) => {
                    const link = doc.createElement( 'button' );
                    link.type = 'button';
                    link.className = 'wfw-title-link wfw-title-link--' + item.key;
                    link.dataset.link = item.key;
                    link.innerHTML = item.icon + '<span></span>';
                    link.addEventListener( 'click', () => {
                        const id = editor().getCurrentPostId();
                        if ( id ) {
                            post( { ...item.message, id } );
                        }
                    } );
                    row.appendChild( link );
                } );
                labels = {};
            }
            wrapper.prepend( row );
            label();
        }

        new MutationObserver( attach ).observe( document.body, { childList: true, subtree: true } );
        // Store updates also come as the editor first renders the title.
        subscribe( () => {
            attach();
            label();
        } );
        attach();
    }

    mountTitleLinks();

    function post( message ) {
        window.parent.postMessage( { source: 'wfw-frame', ...message }, window.location.origin );
    }

    function editor() {
        return select( 'core/editor' );
    }

    function isDraft() {
        return DRAFT_STATUSES.includes( editor().getCurrentPostAttribute( 'status' ) );
    }

    function waitForSave() {
        return new Promise( ( resolve ) => {
            const unsubscribe = subscribe( () => {
                if ( ! editor().isSavingPost() ) {
                    unsubscribe();
                    resolve();
                }
            } );
        } );
    }

    // Tell the app once the canvas holds the content with our styles applied,
    // so it can fade the editor in instead of showing an unstyled frame.
    function postPainted( tries = 0 ) {
        const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );
        const doc = canvas ? canvas.contentDocument : document;
        const loaded = doc && doc.readyState === 'complete' && doc.querySelector( '.editor-styles-wrapper .is-root-container' );
        if ( ! loaded && tries < 100 ) {
            setTimeout( () => postPainted( tries + 1 ), 50 );
            return;
        }
        requestAnimationFrame( () => requestAnimationFrame( () => post( { type: 'painted' } ) ) );
    }

    /*
     * No Welcome Guide in the app's editor (it also loads its pictures from
     * s.w.org). The editor switches the guide on with an in-memory default when
     * it initializes on DOM ready, after this script has run, so that default
     * is turned back off as soon as it's set, before the editor first renders.
     * Defaults aren't saved, so wp-admin's own editor still shows the guide to
     * anyone who hasn't closed it there. Setting the preference itself didn't
     * stick for a new user: with nothing saved yet, their preferences load
     * late, from a REST request, and replace whatever was set before them.
     *
     * The guide is closed whenever it comes on, including on purpose: the app
     * hides the editor's options menu (frame.css), so the only way left to open
     * it here is the command palette, and the app has no use for it.
     */
    const preferences = select( 'core/preferences' );
    let closingGuide = false;
    subscribe( () => {
        if ( closingGuide || ! preferences.get( 'core/edit-post', 'welcomeGuide' ) ) {
            return;
        }
        closingGuide = true;
        dispatch( 'core/preferences' ).setDefaults( 'core/edit-post', { welcomeGuide: false } );
        // Still on: the guide was saved open (opened from the editor's options
        // menu and never closed). Close it, as its own close button would.
        if ( preferences.get( 'core/edit-post', 'welcomeGuide' ) ) {
            dispatch( 'core/preferences' ).set( 'core/edit-post', 'welcomeGuide', false );
        }
        closingGuide = false;
    }, 'core/preferences' );

    let ready = false;
    let lastTitle = null;
    let wasSaving = false;
    let autosaveTimer = null;

    subscribe( () => {
        const id = editor().getCurrentPostId();
        if ( ! id ) {
            return;
        }

        if ( ! ready ) {
            ready = true;
            // Dock the block toolbar in the (bottom) header instead of floating over text.
            // Defaults are in-memory only, so the user's own editor preference is untouched.
            // Applied here because the editor sets its own defaults during initialization.
            // The sidebar toggle is hidden too, so default the settings sidebar to closed
            // (the editor defaults it open on wide screens). Cmd/Ctrl+Shift+, reopens it.
            dispatch( 'core/preferences' )?.setDefaults( 'core', { fixedToolbar: true, isComplementaryAreaVisible: false } );
            post( { type: 'ready', id } );
            postPainted();
        }

        // Same switch distraction-free mode flips: it turns off the in-between
        // inserter and insertion point. Set on the block-editor store only (no
        // preference), and re-applied because the editor provider resets settings.
        if ( ! select( 'core/block-editor' ).getSettings().isDistractionFree ) {
            dispatch( 'core/block-editor' ).updateSettings( { isDistractionFree: true } );
        }

        const title = editor().getEditedPostAttribute( 'title' ) || '';
        if ( title !== lastTitle ) {
            if ( lastTitle !== null ) {
                post( { type: 'title', id, title } );
            }
            lastTitle = title;
        }

        const saving = editor().isSavingPost() && ! editor().isAutosavingPost();
        if ( wasSaving && ! saving && editor().didPostSaveRequestSucceed() ) {
            post( { type: 'saved', id, status: editor().getCurrentPostAttribute( 'status' ) } );
        }
        wasSaving = saving;

        // Drafts save themselves every few seconds, so "Draft saved." toasts would
        // pile up over the toolbar. Explicit Update/Publish confirmations still show.
        if ( isDraft() ) {
            const notice = select( 'core/notices' ).getNotices().find( ( n ) => n.id === 'editor-save' && n.type === 'snackbar' );
            if ( notice ) {
                dispatch( 'core/notices' ).removeNotice( notice.id );
            }
        }

        // Bear-style: drafts save themselves. Published notes still need an explicit Update.
        clearTimeout( autosaveTimer );
        if ( ! saving && isDraft() && editor().isEditedPostDirty() ) {
            autosaveTimer = setTimeout( () => {
                if ( isDraft() && editor().isEditedPostDirty() && ! editor().isSavingPost() ) {
                    dispatch( 'core/editor' ).savePost();
                }
            }, AUTOSAVE_DELAY );
        }
    } );

    /*
     * In a tab behind another, the editor keeps running with nothing to show, so
     * its heartbeat slows to every two minutes, as core's does in a window
     * without focus: the post lock (150 seconds) still holds, with a fraction of
     * the requests. Back in view, the interval goes back to what it was.
     */
    const HIDDEN_HEARTBEAT = 120;
    let shownInterval = 0;

    function setHidden( hidden ) {
        const heartbeat = window.wp && window.wp.heartbeat;
        if ( ! heartbeat ) {
            return;
        }
        if ( hidden && ! shownInterval ) {
            shownInterval = heartbeat.interval() || 60;
            heartbeat.interval( HIDDEN_HEARTBEAT );
        } else if ( ! hidden && shownInterval ) {
            heartbeat.interval( shownInterval );
            shownInterval = 0;
        }
    }

    window.addEventListener( 'message', async ( event ) => {
        if ( event.origin !== window.location.origin || event.source !== window.parent || ! event.data || event.data.source !== 'wfw' ) {
            return;
        }
        const { type, replyTo } = event.data;
        if ( type === 'appearance' ) {
            appearance = event.data.appearance || appearance;
            stamp( document );
            stampCanvas();
            return;
        }
        if ( type === 'visibility' ) {
            setHidden( !! event.data.hidden );
            return;
        }
        if ( type !== 'flush' ) {
            return;
        }
        if ( editor().isSavingPost() ) {
            await waitForSave();
        }
        if ( ! editor().isEditedPostDirty() ) {
            post( { replyTo, ok: true } );
            return;
        }
        if ( isDraft() ) {
            clearTimeout( autosaveTimer );
            await dispatch( 'core/editor' ).savePost();
            post( { replyTo, ok: editor().didPostSaveRequestSucceed() } );
            return;
        }
        post( { replyTo, ok: false } );
    } );
} )();
