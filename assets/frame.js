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
     * Featured image: the settings sidebar is hidden, so give the image its own
     * button beside Save. It opens core's featured image control (set, replace,
     * remove) in a popover. The header is re-rendered by the editor, so the
     * button lives in its own React root and is put back whenever it drops out.
     */
    function mountFeaturedImage() {
        const { createElement: el, createRoot } = wp.element;
        const { Dropdown, Button } = wp.components;
        const { PostFeaturedImage, PostFeaturedImageCheck } = wp.editor;
        const { useSelect } = wp.data;
        const { __ } = wp.i18n;
        if ( ! createRoot || ! Dropdown || ! PostFeaturedImage ) {
            return;
        }

        // @wordpress/icons `image`.
        const imageIcon = el( 'svg', { viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24, 'aria-hidden': true },
            el( 'path', { d: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z' } )
        );

        function FeaturedImageButton() {
            const hasImage = useSelect( ( s ) => !! s( 'core/editor' ).getEditedPostAttribute( 'featured_media' ), [] );
            const label = hasImage ? __( 'Change featured image', 'wordpress-for-writers' ) : __( 'Add featured image', 'wordpress-for-writers' );
            return el( PostFeaturedImageCheck, null,
                el( Dropdown, {
                    className: 'wfw-featured-image',
                    contentClassName: 'wfw-featured-image__popover',
                    popoverProps: { placement: 'bottom-end', offset: 8 },
                    renderToggle: ( { isOpen, onToggle } ) => el( Button, {
                        className: 'wfw-featured-image__toggle' + ( hasImage ? ' has-image' : '' ),
                        icon: imageIcon,
                        label,
                        showTooltip: true,
                        onClick: onToggle,
                        'aria-expanded': isOpen,
                    } ),
                    renderContent: () => el( 'div', { className: 'wfw-featured-image__content' }, el( PostFeaturedImage ) ),
                } )
            );
        }

        let host = null;
        const attach = () => {
            const header = document.querySelector( '.editor-header__settings' );
            if ( ! header || ( host && host.parentNode === header ) ) {
                return;
            }
            if ( ! host ) {
                host = document.createElement( 'div' );
                host.className = 'wfw-featured-image-host';
                createRoot( host ).render( el( FeaturedImageButton ) );
            }
            header.prepend( host );
        };
        new MutationObserver( attach ).observe( document.body, { childList: true, subtree: true } );
        attach();
    }

    mountFeaturedImage();

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
            dispatch( 'core/preferences' )?.set( 'core/edit-post', 'welcomeGuide', false );
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
