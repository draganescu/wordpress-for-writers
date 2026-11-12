/**
 * The Writer editor: one note's editor, on the page includes/editor.php prints
 * into each of the app's tabs.
 *
 * It's composed from the block editor's public parts instead of reshaping
 * wp-admin's post editor: EditorProvider holds the note, BlockCanvas draws the
 * writing surface with PostTitle and BlockList in it, BlockToolbar sits in the
 * formatting pill at the bottom, PostSavedState and PostPublishButton at the
 * top right, and the notices, the publish panel and the settings sheet are
 * placed where the app wants them. Colors come in through ThemeProvider.
 *
 * It also talks to the app (frame protocol: ready, title, saved, painted,
 * flush, appearance, visibility), saves drafts as you type, and keeps the
 * toolbar above the iOS on-screen keyboard.
 */
( function () {
    const config = window.wfwEditor;
    const root = document.getElementById( 'wfw-editor-root' );
    if ( ! config || ! root ) {
        return;
    }

    const { createElement: el, Fragment, RawHTML, useState, useEffect, useRef, createRoot } = wp.element;
    const { select, dispatch, subscribe, useSelect, useDispatch } = wp.data;
    const { __, _n, sprintf } = wp.i18n;
    const editor = wp.editor;
    const blockEditor = wp.blockEditor;
    const { SlotFillProvider, Popover, Button, TabPanel, ExternalLink } = wp.components;
    const { ShortcutProvider, useShortcut, store: shortcutsStore } = wp.keyboardShortcuts;
    const editorStore = editor.store;
    const blockEditorStore = blockEditor.store;
    const noticesStore = 'core/notices';

    const DRAFT_STATUSES = [ 'draft', 'auto-draft', 'pending' ];
    const AUTOSAVE_DELAY = 1500;
    const inApp = window.parent !== window;

    let appearance = config.appearance || {};

    // ---- Talking to the app ------------------------------------------------

    function post( message ) {
        if ( inApp ) {
            window.parent.postMessage( { source: 'wfw-frame', ...message }, window.location.origin );
        }
    }

    function editorSelect() {
        return select( editorStore );
    }

    function isDraft() {
        return DRAFT_STATUSES.includes( editorSelect().getCurrentPostAttribute( 'status' ) );
    }

    // ---- Appearance ----------------------------------------------------------

    /*
     * The appearance is stamped on <html> as data attributes (the page's own
     * bootstrap script, then the app's "appearance" messages), which the
     * --wfw-* tokens key off. The canvas gets the same attributes, and
     * ThemeProvider gets the resulting accent and background colors.
     */
    const appearanceListeners = new Set();

    function stamp( doc ) {
        if ( ! doc || ! doc.documentElement ) {
            return;
        }
        Object.entries( appearance ).forEach( ( [ key, value ] ) => {
            doc.documentElement.dataset[ 'wfw' + key[ 0 ].toUpperCase() + key.slice( 1 ) ] = value;
        } );
    }

    function themeColors() {
        const style = getComputedStyle( document.documentElement );
        return {
            primary: style.getPropertyValue( '--wfw-accent' ).trim() || undefined,
            background: style.getPropertyValue( '--wfw-editor-bg' ).trim() || undefined,
        };
    }

    function applyAppearance() {
        stamp( document );
        stamp( canvas.doc );
        appearanceListeners.forEach( ( listener ) => listener() );
    }

    // "System" follows the OS setting, so its colors change with it.
    window.matchMedia( '(prefers-color-scheme: dark)' ).addEventListener( 'change', applyAppearance );

    function useThemeColors() {
        const [ colors, setColors ] = useState( themeColors );
        useEffect( () => {
            const listener = () => setColors( themeColors() );
            appearanceListeners.add( listener );
            return () => appearanceListeners.delete( listener );
        }, [] );
        return colors;
    }

    // ---- The canvas ----------------------------------------------------------

    /*
     * The canvas document, handed over by a component rendered inside it, so
     * nothing has to look for the editor's iframe. BlockCanvas can replace its
     * iframe; the component mounts again in the new one.
     */
    const canvas = { doc: null, win: null, frame: null };
    const canvasListeners = new Set();

    function setCanvas( doc ) {
        canvas.doc = doc;
        canvas.win = doc ? doc.defaultView : null;
        canvas.frame = canvas.win ? canvas.win.frameElement : null;
        stamp( doc );
        canvasListeners.forEach( ( listener ) => listener( doc ) );
    }

    // ---- The links above the title -----------------------------------------

    /*
     * Featured image, categories and tags: a row of quiet links above the
     * title, like the cover image prompt in Ghost or Medium. It shows while the
     * pointer is over the title or the title has focus (always, faintly, on
     * touch screens). Each link asks the app to open its panel in place of the
     * editor. A link's label says what the note has: the names of its
     * categories or tags (read through core-data, like the editor's own
     * panels), or an invitation to add some.
     */
    const ICONS = {
        image: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.5h14c.3 0 .5.2.5.5v8.4l-3-2.9c-.3-.3-.8-.3-1 0L11.9 14 9 12c-.3-.2-.6-.2-.8 0l-3.6 2.6V5c-.1-.3.1-.5.4-.5zm14 15H5c-.3 0-.5-.2-.5-.5v-2.4l4.1-3 3 1.9c.3.2.7.2.9-.1L16 12l3.5 3.4V19c0 .3-.2.5-.5.5z',
        categories: 'M12.848 8a1 1 0 0 1-.914-.594l-.723-1.63a.5.5 0 0 0-.447-.276H5a.5.5 0 0 0-.5.5v11.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5v-9A.5.5 0 0 0 19 8h-6.152Zm.612-1.5a.5.5 0 0 1-.462-.31l-.445-1.084A2 2 0 0 0 10.763 4H5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-5.54Z',
        tags: 'M20.5 5.5h-3.1l.7-3.3-1.5-.3-.7 3.6H10l.7-3.3-1.5-.3-.7 3.6H4.5V7h3.7l-.9 4.5H3.5V13h3.5l-.7 3.3 1.5.3.7-3.6H14l-.7 3.3 1.5.3.7-3.6h4V11.5h-3.7l.9-4.5h3.8V5.5Zm-6.2 6h-5.5L9.7 7h5.5l-.9 4.5Z',
    };

    function useTermNames( attribute, taxonomy ) {
        return useSelect( ( s ) => {
            const ids = s( editorStore ).getEditedPostAttribute( attribute ) || [];
            if ( ! ids.length ) {
                return { count: 0, names: null };
            }
            const terms = s( 'core' ).getEntityRecords( 'taxonomy', taxonomy, { include: ids, per_page: ids.length, context: 'view', _fields: 'id,name' } );
            // Term names come HTML-escaped from the REST API.
            const names = terms ? ids.map( ( id ) => terms.find( ( t ) => t.id === id ) ).filter( Boolean ).map( ( t ) => wp.htmlEntities.decodeEntities( t.name || '' ) ).join( ', ' ) : null;
            return { count: ids.length, names };
        }, [ attribute, taxonomy ] );
    }

    function TitleLink( { name, label, message } ) {
        return el( 'button', {
            type: 'button',
            className: 'wfw-title-link wfw-title-link--' + name,
            onClick: () => {
                const id = editorSelect().getCurrentPostId();
                if ( id ) {
                    post( { ...message, id } );
                }
            },
        },
        el( 'svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, focusable: false }, el( 'path', { d: ICONS[ name ] } ) ),
        el( 'span', { title: label }, label ) );
    }

    function TitleLinks() {
        const hasImage = useSelect( ( s ) => !! s( editorStore ).getEditedPostAttribute( 'featured_media' ), [] );
        const categories = useTermNames( 'categories', 'category' );
        const tags = useTermNames( 'tags', 'post_tag' );
        if ( ! inApp || ! ( config.featuredImages || config.categories || config.tags ) ) {
            return null;
        }
        return el( 'div', { className: 'wfw-title-links', contentEditable: false },
            config.featuredImages && el( TitleLink, {
                name: 'image',
                message: { type: 'featured-image' },
                label: hasImage ? __( 'Change featured image', 'wordpress-for-writers' ) : __( 'Add featured image', 'wordpress-for-writers' ),
            } ),
            config.categories && el( TitleLink, {
                name: 'categories',
                message: { type: 'terms', focus: 'categories' },
                label: ! categories.count
                    ? __( 'Add categories', 'wordpress-for-writers' )
                    /* translators: %d: number of categories. */
                    : categories.names || sprintf( _n( '%d category', '%d categories', categories.count, 'wordpress-for-writers' ), categories.count ),
            } ),
            config.tags && el( TitleLink, {
                name: 'tags',
                message: { type: 'terms', focus: 'tags' },
                label: ! tags.count
                    ? __( 'Add tags', 'wordpress-for-writers' )
                    /* translators: %d: number of tags. */
                    : tags.names || sprintf( _n( '%d tag', '%d tags', tags.count, 'wordpress-for-writers' ), tags.count ),
            } )
        );
    }

    // What goes inside the canvas: the title with its links, then the blocks.
    function CanvasContent() {
        const ref = useRef();
        useEffect( () => {
            const doc = ref.current.ownerDocument;
            setCanvas( doc );
            return () => canvas.doc === doc && setCanvas( null );
        }, [] );
        return el( 'div', { ref, className: 'wfw-column' },
            el( 'div', { className: 'wfw-title' }, el( TitleLinks ), el( editor.PostTitle ) ),
            el( blockEditor.BlockList, { className: 'wfw-body' } )
        );
    }

    // ---- Chrome --------------------------------------------------------------

    // Save state and Save / Publish / Update, at the top right.
    function Actions() {
        const { isPublishPanelOpen, isToggle } = useSelect( ( s ) => {
            const store = s( editorStore );
            return {
                isPublishPanelOpen: store.isPublishSidebarOpened(),
                // Published and scheduled notes update in place; the rest go through the publish panel.
                isToggle: ! store.isCurrentPostPublished() && ! store.isCurrentPostScheduled(),
            };
        }, [] );
        const { togglePublishSidebar } = useDispatch( editorStore );
        return el( 'div', { className: 'wfw-actions' },
            el( editor.PostSavedState ),
            el( editor.PostPublishButton, { isToggle, isOpen: isPublishPanelOpen, onToggle: togglePublishSidebar } )
        );
    }

    // The formatting pill: the selected block's toolbar, docked at the bottom.
    function FormattingPill() {
        const hasSelection = useSelect( ( s ) => s( blockEditorStore ).getSelectedBlockClientIds().length > 0, [] );
        if ( ! hasSelection ) {
            return null;
        }
        return el( 'div', { className: 'wfw-pill' }, el( blockEditor.BlockToolbar, { hideDragHandle: true } ) );
    }

    /*
     * Publishing: a small card under the Publish button (a sheet from the
     * bottom on phones) instead of wp-admin's pre-publish sidebar. It holds
     * what a writer decides at that moment, who can read the note and when it
     * goes out, with the editor's own controls for both, and the editor's own
     * Publish / Schedule button. Once the note is out the card closes and the
     * editor's "published" toast offers to view it. The card's open state is
     * the editor's publish sidebar flag, so the header's Publish button
     * (PostPublishButton as a toggle) opens and closes it.
     */
    function PublishRow( { label, value, isOpen, onToggle, children } ) {
        return el( 'div', { className: 'wfw-publish__row' + ( isOpen ? ' is-open' : '' ) },
            el( 'button', { type: 'button', className: 'wfw-publish__toggle', 'aria-expanded': isOpen, onClick: onToggle },
                el( 'span', { className: 'wfw-publish__label' }, label ),
                el( 'span', { className: 'wfw-publish__value' }, value )
            ),
            isOpen && el( 'div', { className: 'wfw-publish__detail' }, children )
        );
    }

    function PublishPanel() {
        const { isOpen, isOut } = useSelect( ( s ) => {
            const store = s( editorStore );
            return {
                isOpen: store.isPublishSidebarOpened(),
                isOut: store.isCurrentPostPublished() || store.isCurrentPostScheduled(),
            };
        }, [] );
        const { closePublishSidebar } = useDispatch( editorStore );
        const [ section, setSection ] = useState( null );
        const card = useRef();

        // Published or scheduled: the card has done its job.
        useEffect( () => {
            if ( isOpen && isOut ) {
                closePublishSidebar();
            }
        }, [ isOpen, isOut ] );

        useEffect( () => {
            if ( ! isOpen ) {
                setSection( null );
                return;
            }
            const focusable = card.current && card.current.querySelector( '.wfw-publish__foot .is-primary' );
            if ( focusable ) {
                focusable.focus();
            }
        }, [ isOpen ] );

        if ( ! isOpen ) {
            return null;
        }
        const toggle = ( name ) => () => setSection( ( open ) => ( open === name ? null : name ) );
        const close = () => closePublishSidebar();

        return el( Fragment, null,
            el( 'div', { className: 'wfw-publish-backdrop', onClick: close } ),
            el( 'div', {
                ref: card,
                className: 'wfw-publish',
                role: 'dialog',
                'aria-label': __( 'Publish', 'wordpress-for-writers' ),
                onKeyDown: ( event ) => {
                    if ( event.key === 'Escape' && ! event.defaultPrevented ) {
                        event.preventDefault();
                        close();
                    }
                },
            },
            el( 'h2', { className: 'wfw-publish__title' }, __( 'Ready to publish?', 'wordpress-for-writers' ) ),
            el( editor.PostVisibilityCheck, {
                render: ( { canEdit } ) => canEdit && el( PublishRow, {
                    label: __( 'Who can read', 'wordpress-for-writers' ),
                    value: el( editor.PostVisibilityLabel ),
                    isOpen: section === 'visibility',
                    onToggle: toggle( 'visibility' ),
                }, el( editor.PostVisibility, { onClose: () => setSection( null ) } ) ),
            } ),
            el( editor.PostScheduleCheck, null, el( PublishRow, {
                label: __( 'When', 'wordpress-for-writers' ),
                value: el( editor.PostScheduleLabel ),
                isOpen: section === 'schedule',
                onToggle: toggle( 'schedule' ),
            }, el( editor.PostSchedule, { onClose: () => setSection( null ) } ) ) ),
            el( 'div', { className: 'wfw-publish__foot' },
                el( Button, { variant: 'tertiary', onClick: close }, __( 'Not yet', 'wordpress-for-writers' ) ),
                el( editor.PostPublishButton )
            ) )
        );
    }

    /*
     * The note's settings and the selected block's, in a sheet at the right
     * that Cmd/Ctrl + Shift + , opens and closes (the editor's own shortcut for
     * its sidebar). Plugins' document setting panels show here too.
     */
    function SettingsSheet( { onClose } ) {
        const hasBlock = useSelect( ( s ) => !! s( blockEditorStore ).getSelectedBlockClientId(), [] );
        const isPublished = useSelect( ( s ) => s( editorStore ).isCurrentPostPublished(), [] );
        const panels = [ 'PostExcerptPanel', 'PostTaxonomiesPanel' ].filter( ( name ) => editor[ name ] );
        const notePanels = el( Fragment, null,
            panels.map( ( name ) => el( editor[ name ], { key: name } ) ),
            editor.PluginDocumentSettingPanel && editor.PluginDocumentSettingPanel.Slot && el( editor.PluginDocumentSettingPanel.Slot ),
            el( 'div', { className: 'wfw-sheet__footer' },
                isPublished && editor.PostSwitchToDraftButton && el( editor.PostSwitchToDraftButton ),
                config.fullEditorUrl && el( ExternalLink, { href: config.fullEditorUrl }, __( 'Open in the full editor', 'wordpress-for-writers' ) )
            )
        );
        return el( 'div', {
            className: 'wfw-sheet wfw-sheet--settings',
            role: 'region',
            'aria-label': __( 'Settings', 'wordpress-for-writers' ),
            onKeyDown: ( event ) => {
                if ( event.key === 'Escape' && ! event.defaultPrevented ) {
                    event.preventDefault();
                    onClose();
                }
            },
        },
            el( 'div', { className: 'wfw-sheet__header' },
                el( 'h2', null, __( 'Settings', 'wordpress-for-writers' ) ),
                el( Button, { icon: 'no-alt', label: __( 'Close settings', 'wordpress-for-writers' ), onClick: onClose, size: 'compact' } )
            ),
            hasBlock
                ? el( TabPanel, {
                    className: 'wfw-sheet__tabs',
                    initialTabName: 'block',
                    tabs: [
                        { name: 'note', title: __( 'Note', 'wordpress-for-writers' ) },
                        { name: 'block', title: __( 'Block', 'wordpress-for-writers' ) },
                    ],
                }, ( tab ) => ( tab.name === 'block' ? el( blockEditor.BlockInspector ) : notePanels ) )
                : notePanels
        );
    }

    /*
     * Notices, drawn from core/notices as the app's own cards (top) and toasts
     * (bottom). Drafts save themselves every few seconds, so their "Draft
     * saved." toast isn't shown; explicit Update/Publish confirmations still are.
     */
    /*
     * Pressing a notice or toast takes focus out of the canvas, but the block
     * editor still thinks the block is selected, so tapping that block again
     * doesn't bring the caret back until something else is selected. Drop the
     * selection along with the focus, as after dismissing the iOS keyboard.
     */
    function dropBlockSelection() {
        const editable = canvas.doc && canvas.doc.activeElement;
        if ( editable && editable.isContentEditable ) {
            editable.blur();
        }
        if ( select( blockEditorStore ).getSelectionStart().clientId ) {
            dispatch( blockEditorStore ).clearSelectedBlock();
        }
    }

    function NoticeContent( { notice } ) {
        return notice.__unstableHTML ? el( RawHTML, null, notice.content ) : notice.content;
    }

    function NoticeActions( { notice, onAction } ) {
        if ( ! notice.actions || ! notice.actions.length ) {
            return null;
        }
        return el( 'span', { className: 'wfw-notice__actions' }, notice.actions.map( ( action, index ) => el( Button, {
            key: index,
            href: action.url,
            // "View Post" after publishing is marked to open in a new tab, as core's own
            // snackbar does; in the frame it would otherwise replace the editor with the post.
            target: action.openInNewTab ? '_blank' : undefined,
            rel: action.openInNewTab ? 'noopener noreferrer' : undefined,
            variant: action.variant === 'primary' ? 'primary' : undefined,
            className: 'wfw-notice__action',
            onClick: () => {
                if ( action.onClick ) {
                    action.onClick();
                }
                if ( onAction ) {
                    onAction();
                }
            },
        }, action.label ) ) );
    }

    function Notices() {
        const notices = useSelect( ( s ) => s( noticesStore ).getNotices().filter( ( n ) => n.type !== 'snackbar' ), [] );
        const { removeNotice } = useDispatch( noticesStore );
        if ( ! notices.length ) {
            return null;
        }
        return el( 'div', { className: 'wfw-notices', onPointerDown: dropBlockSelection }, notices.map( ( notice ) => el( 'div', {
            key: notice.id,
            className: 'wfw-notice is-' + notice.status,
            role: notice.status === 'error' ? 'alert' : 'status',
        },
        el( 'span', { className: 'wfw-notice__content' }, el( NoticeContent, { notice } ) ),
        el( NoticeActions, { notice } ),
        notice.isDismissible && el( Button, {
            className: 'wfw-notice__dismiss',
            icon: 'no-alt',
            size: 'small',
            label: __( 'Dismiss', 'wordpress-for-writers' ),
            onClick: () => removeNotice( notice.id ),
        } ) ) ) );
    }

    const SNACKBAR_TIMEOUT = 10000;

    function Snackbar( { notice } ) {
        const { removeNotice } = useDispatch( noticesStore );
        useEffect( () => {
            const timer = setTimeout( () => removeNotice( notice.id ), SNACKBAR_TIMEOUT );
            return () => clearTimeout( timer );
        }, [ notice ] );
        return el( 'div', { className: 'wfw-toast', role: 'status' },
            el( 'span', null, el( NoticeContent, { notice } ) ),
            el( NoticeActions, { notice, onAction: () => removeNotice( notice.id ) } ) );
    }

    function Snackbars() {
        const notices = useSelect( ( s ) => {
            const draft = DRAFT_STATUSES.includes( s( editorStore ).getCurrentPostAttribute( 'status' ) );
            return s( noticesStore ).getNotices().filter( ( n ) => n.type === 'snackbar' && ! ( draft && n.id === 'editor-save' ) );
        }, [] );
        if ( ! notices.length ) {
            return null;
        }
        return el( 'div', { className: 'wfw-toasts', onPointerDown: dropBlockSelection }, notices.slice( -3 ).map( ( notice ) => el( Snackbar, { key: notice.id, notice } ) ) );
    }

    function Layout() {
        const [ settingsOpen, setSettingsOpen ] = useState( false );
        const colors = useThemeColors();
        const styles = useSelect( ( s ) => s( editorStore ).getEditorSettings().styles, [] );
        const { registerShortcut } = useDispatch( shortcutsStore );

        useEffect( () => {
            registerShortcut( {
                name: 'wfw/toggle-settings',
                category: 'global',
                description: __( 'Show or hide the settings.', 'wordpress-for-writers' ),
                keyCombination: { modifier: 'primaryShift', character: ',' },
            } );
            registerShortcut( {
                name: 'wfw/command-palette',
                category: 'global',
                description: __( 'Open the command palette.', 'wordpress-for-writers' ),
                keyCombination: { modifier: 'primary', character: 'k' },
            } );
        }, [] );
        useShortcut( 'wfw/toggle-settings', ( event ) => {
            event.preventDefault();
            setSettingsOpen( ( open ) => ! open );
        } );
        useShortcut( 'wfw/command-palette', ( event ) => {
            // With text selected, core's link format has Cmd/Ctrl+K, as in wp-admin.
            if ( event.defaultPrevented ) {
                return;
            }
            event.preventDefault();
            post( { type: 'palette' } );
        } );

        const layout = el( 'div', { className: 'wfw-ed' + ( settingsOpen ? ' has-settings' : '' ) },
            el( Notices ),
            el( Actions ),
            el( 'div', { className: 'wfw-canvas' },
                el( blockEditor.BlockCanvas, { height: '100%', styles }, el( CanvasContent ) )
            ),
            el( FormattingPill ),
            el( Snackbars ),
            settingsOpen && el( SettingsSheet, { onClose: () => setSettingsOpen( false ) } ),
            el( PublishPanel ),
            el( editor.PostLockedModal ),
            el( editor.AutosaveMonitor ),
            el( editor.LocalAutosaveMonitor ),
            el( editor.UnsavedChangesWarning ),
            el( editor.EditorKeyboardShortcutsRegister ),
            el( editor.EditorKeyboardShortcuts ),
            el( wp.plugins.PluginArea ),
            el( Popover.Slot )
        );
        return colors.primary && colors.background
            ? el( wp.theme.ThemeProvider, { isRoot: true, color: colors }, layout )
            : layout;
    }

    function WriterEditor() {
        const note = useSelect( ( s ) => s( 'core' ).getEntityRecord( 'postType', config.postType, config.postId ), [] );
        if ( ! note ) {
            return null;
        }
        return el( SlotFillProvider, null,
            el( ShortcutProvider, { className: 'wfw-shortcuts' },
                // The page's own registry (as wp-admin's editor does), so the
                // frame protocol below reads the same stores the editor writes.
                el( editor.EditorProvider, { post: note, settings: config.settings, initialEdits: config.initialEdits, useSubRegistry: false },
                    el( editor.ErrorBoundary, null, el( Layout ) )
                )
            )
        );
    }

    // ---- Visibility (Writer Members) -------------------------------------------

    /*
     * Visibility picker in the note's settings, when a companion plugin (Writer
     * Members) offers options. Saved with the post through the REST API as the
     * post meta it names; shown only for post types that register that meta.
     */
    const visibility = config.visibility;
    if ( visibility && editor.PluginDocumentSettingPanel ) {
        const key = visibility.metaKey;
        const options = [ { value: '', label: __( 'Everyone', 'wordpress-for-writers' ) } ].concat( visibility.options );
        wp.plugins.registerPlugin( 'wfw-visibility', {
            render: function VisibilityPanel() {
                const meta = useSelect( ( s ) => s( editorStore ).getEditedPostAttribute( 'meta' ), [] );
                const { editPost } = useDispatch( editorStore );
                if ( ! meta || ! Object.prototype.hasOwnProperty.call( meta, key ) ) {
                    return null;
                }
                return el( editor.PluginDocumentSettingPanel, { name: 'wfw-visibility', title: __( 'Visibility', 'wordpress-for-writers' ), className: 'wfw-visibility' },
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

    // ---- The iOS on-screen keyboard ------------------------------------------

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
        viewport = inApp ? window.parent.visualViewport : null;
    } catch ( e ) {}
    let keyboard = -1;
    let keyboardFrame = 0;
    let keyboardSettle = 0;

    function isTyping() {
        let focused = document.activeElement;
        while ( focused && focused.tagName === 'IFRAME' ) {
            try {
                focused = focused.contentDocument.activeElement;
            } catch ( e ) {
                return false;
            }
        }
        return !! focused && ( focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test( focused.tagName ) );
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
        [ document, canvas.doc ].forEach( ( doc ) => {
            if ( doc && doc.documentElement ) {
                doc.documentElement.style.setProperty( '--wfw-keyboard', overlap + 'px' );
            }
        } );
    }

    // While the iOS keyboard is up the app shrinks the editor to the space above
    // it (see app.js); bring the caret back into view inside the canvas then,
    // leaving room for the toolbar.
    function keepCaretVisible() {
        const selection = canvas.win && canvas.win.getSelection();
        if ( ! selection || ! selection.rangeCount || ! isTyping() ) {
            return;
        }
        const rect = selection.getRangeAt( 0 ).getBoundingClientRect();
        const limit = canvas.win.innerHeight - 80;
        if ( rect.height && rect.bottom > limit ) {
            canvas.win.scrollBy( 0, rect.bottom - limit );
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
            const focused = document.activeElement;
            if ( focused && focused !== document.body && focused !== canvas.frame ) {
                return;
            }
            dropBlockSelection();
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
        canvasListeners.add( ( doc ) => {
            keyboard = -1;
            if ( ! doc ) {
                return;
            }
            // Typing and moving the caret can scroll the page under the keyboard too.
            [ 'focusin', 'focusout', 'input', 'selectionchange' ].forEach( ( type ) => doc.addEventListener( type, queueKeyboard, true ) );
            doc.defaultView.addEventListener( 'resize', keepCaretVisible );
            queueKeyboard();
        } );
    }

    // ---- Saving and the frame protocol ---------------------------------------

    function waitForSave() {
        return new Promise( ( resolve ) => {
            const unsubscribe = subscribe( () => {
                if ( ! editorSelect().isSavingPost() ) {
                    unsubscribe();
                    resolve();
                }
            } );
        } );
    }

    // Tell the app once the canvas holds the note with our styles applied, so
    // it can fade the editor in instead of showing an unstyled frame.
    let painted = false;
    canvasListeners.add( ( doc ) => {
        if ( painted || ! doc ) {
            return;
        }
        painted = true;
        const send = () => requestAnimationFrame( () => requestAnimationFrame( () => post( { type: 'painted' } ) ) );
        if ( doc.readyState === 'complete' ) {
            send();
        } else {
            doc.defaultView.addEventListener( 'load', send, { once: true } );
        }
    } );

    let ready = false;
    let lastTitle = null;
    let wasSaving = false;
    let autosaveTimer = null;

    subscribe( () => {
        const id = editorSelect().getCurrentPostId();
        if ( ! id ) {
            return;
        }

        if ( ! ready ) {
            ready = true;
            post( { type: 'ready', id } );
        }

        const title = editorSelect().getEditedPostAttribute( 'title' ) || '';
        if ( title !== lastTitle ) {
            if ( lastTitle !== null ) {
                post( { type: 'title', id, title } );
            }
            lastTitle = title;
        }

        const saving = editorSelect().isSavingPost() && ! editorSelect().isAutosavingPost();
        if ( wasSaving && ! saving && editorSelect().didPostSaveRequestSucceed() ) {
            post( { type: 'saved', id, status: editorSelect().getCurrentPostAttribute( 'status' ) } );
        }
        wasSaving = saving;

        // Bear-style: drafts save themselves. Published notes still need an explicit Update.
        clearTimeout( autosaveTimer );
        if ( ! saving && isDraft() && editorSelect().isEditedPostDirty() ) {
            autosaveTimer = setTimeout( () => {
                if ( isDraft() && editorSelect().isEditedPostDirty() && ! editorSelect().isSavingPost() ) {
                    dispatch( editorStore ).savePost();
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

    /*
     * "Exit editor" in the lock dialog is core's way out to the posts list
     * (edit.php). In a tab, that would load wp-admin inside the app, so the
     * click becomes an exit message and the app closes the tab instead. The
     * link is matched by where it goes (this page sits in wp-admin, as edit.php
     * does), not by the dialog's markup: should core change the URL, the link
     * navigates as it does outside the app.
     */
    const ADMIN_POSTS_PATH = new URL( 'edit.php', window.location.href ).pathname;
    document.addEventListener( 'click', ( event ) => {
        const link = event.target.closest && event.target.closest( 'a[href]' );
        if ( ! inApp || ! link || link.target === '_blank' || event.defaultPrevented ) {
            return;
        }
        let url;
        try {
            url = new URL( link.href );
        } catch ( e ) {
            return;
        }
        if ( url.origin !== window.location.origin || url.pathname !== ADMIN_POSTS_PATH ) {
            return;
        }
        event.preventDefault();
        post( { type: 'exit', id: editorSelect().getCurrentPostId() } );
    }, true );

    window.addEventListener( 'message', async ( event ) => {
        if ( event.origin !== window.location.origin || event.source !== window.parent || ! event.data || event.data.source !== 'wfw' ) {
            return;
        }
        const { type, replyTo } = event.data;
        if ( type === 'appearance' ) {
            appearance = event.data.appearance || appearance;
            applyAppearance();
            return;
        }
        if ( type === 'visibility' ) {
            setHidden( !! event.data.hidden );
            return;
        }
        if ( type !== 'flush' ) {
            return;
        }
        if ( ! ready ) {
            post( { replyTo, ok: true } );
            return;
        }
        if ( editorSelect().isSavingPost() ) {
            await waitForSave();
        }
        if ( ! editorSelect().isEditedPostDirty() ) {
            post( { replyTo, ok: true } );
            return;
        }
        if ( isDraft() ) {
            clearTimeout( autosaveTimer );
            await dispatch( editorStore ).savePost();
            post( { replyTo, ok: editorSelect().didPostSaveRequestSucceed() } );
            return;
        }
        post( { replyTo, ok: false } );
    } );

    // ---- Boot ------------------------------------------------------------------

    /*
     * A new note's URL carries the REST nonce the page checked to create the
     * draft. Its job done, it comes out of the address, which from now on names
     * the draft by id as any other note's does: the nonce stays out of referrers
     * (a link out of the frame), history and a reload, which creates nothing new.
     */
    try {
        const url = new URL( window.location.href );
        if ( url.searchParams.has( '_wpnonce' ) ) {
            url.searchParams.delete( '_wpnonce' );
            url.searchParams.set( 'post', String( config.postId ) );
            window.history.replaceState( null, '', url.toString() );
        }
    } catch ( e ) {}

    /*
     * The publish panel stays on, as wp-admin's editor has it. The Writer's
     * preferences are its own (see wfw_editor_enqueue()), which also pins
     * "Top toolbar" and "Distraction free" on: the block toolbar docked in our
     * pill rather than floating over the text, and no in-between inserters.
     */
    dispatch( 'core/preferences' ).setDefaults( 'core', {
        isPublishSidebarEnabled: true,
    } );

    wp.blockLibrary.registerCoreBlocks();
    createRoot( root ).render( el( WriterEditor ) );
} )();
