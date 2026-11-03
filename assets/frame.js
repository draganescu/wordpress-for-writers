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
    const viewport = window.parent.visualViewport;
    let keyboard = -1;
    let keyboardFrame = 0;

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

    function queueKeyboard() {
        if ( ! keyboardFrame ) {
            keyboardFrame = requestAnimationFrame( measureKeyboard );
        }
    }

    if ( viewport ) {
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
                    [ 'focusin', 'focusout' ].forEach( ( type ) => canvas.contentDocument.addEventListener( type, queueKeyboard, true ) );
                    queueKeyboard();
                };
                canvas.addEventListener( 'load', watch );
                if ( canvas.contentDocument && canvas.contentDocument.readyState !== 'loading' ) {
                    watch();
                }
            }
        } ).observe( document.body, { childList: true, subtree: true } );
    }

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
