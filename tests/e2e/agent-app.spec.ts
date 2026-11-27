/**
 * The app's side of the agent surface (spec/agent): the count of open
 * suggestions on a note's row in the list (editor.md, W5), the writer's style
 * sheet under the account menu (README.md, Q3), and Peek with a pass applied
 * (editor.md). On a site no agent has used the app adds none of it and asks
 * the server for none of it (surface.md, What a site pays).
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Frame, Page } from '@playwright/test';
import {
    createNote,
    openApp,
    paragraph,
    resetSite,
    seedEdit,
    setAgentSeen,
} from './agent-utils';

const row = ( page: Page, note: number ) =>
    page.locator( `.wfw-note[data-id="${ note }"]` );

const count = ( page: Page, note: number ) =>
    row( page, note ).locator( '.wfw-note__suggestions' );

/**
 * Opens a note from the list and gives back its editor's frame, once the
 * editor is up.
 */
async function openInApp( page: Page, note: number ): Promise< Frame > {
    await row( page, note ).click();
    await page.locator( '.wfw-editor iframe:not( .is-loading )' ).waitFor();
    return page.frame( { url: /page=wfw-editor/ } )!;
}

/**
 * Sends the app a message as the editor does (agent.post() in editor.js).
 */
const postFromEditor = ( frame: Frame, message: object ) =>
    frame.evaluate(
        ( data ) =>
            window.parent.postMessage(
                { source: 'wfw-frame', ...data },
                window.location.origin
            ),
        message
    );

const openAccountMenu = ( page: Page ) => page.locator( '#wfw-user' ).click();

const styleSheetItem = ( page: Page ) =>
    page.locator( '#wfw-user-menu' ).getByRole( 'menuitem', { name: 'Style sheet' } );

test.describe( 'The app, on a site an agent has used', () => {
    let noted: number;
    let plain: number;

    test.beforeEach( async ( { requestUtils } ) => {
        await resetSite( requestUtils );
        await setAgentSeen( requestUtils, true );
        plain = await createNote( requestUtils, { title: 'Nothing waits here' } );
        noted = await createNote( requestUtils, {
            title: 'Two things wait here',
            paragraphs: [ 'A first paragraph.', 'A second paragraph.' ],
        } );
        await seedEdit( requestUtils, noted, 'first', 'opening' );
        await seedEdit( requestUtils, noted, 'second', 'closing', [ 1 ] );
    } );

    test( 'a note with open suggestions shows a dot and their count in the list', async ( {
        page,
    } ) => {
        const asked: string[] = [];
        page.on( 'request', ( request ) => asked.push( decodeURIComponent( request.url() ) ) );
        await openApp( page );

        await expect( count( page, noted ) ).toHaveText( '2' );
        await expect( count( page, noted ) ).toHaveAttribute( 'aria-label', '2 suggestions' );
        await expect( count( page, noted ) ).toHaveCSS( 'color', await accent( page ) );
        expect(
            await count( page, noted ).evaluate( ( el ) => {
                const dot = getComputedStyle( el, '::before' );
                return [ dot.width, dot.height, dot.borderRadius ];
            } )
        ).toEqual( [ '6px', '6px', '50%' ] );
        await expect( row( page, plain ) ).toBeVisible();
        await expect( count( page, plain ) ).toHaveCount( 0 );

        // The count came with the list, in the request the list makes anyway.
        const lists = asked.filter( ( url ) => /wp\/v2\/posts[?&].*_fields=[^&]*excerpt/.test( url ) );
        expect( lists.length ).toBeGreaterThan( 0 );
        lists.forEach( ( url ) => expect( url ).toContain( 'wfw_suggestions' ) );
        expect( asked.filter( ( url ) => /wfw\/v1/.test( url ) ) ).toEqual( [] );
    } );

    test( 'the open note’s count follows its editor', async ( { page } ) => {
        await openApp( page );
        await expect( count( page, noted ) ).toHaveText( '2' );
        const frame = await openInApp( page, noted );

        // Review may send the count of its own as it loads: the last word is what shows.
        await expect( async () => {
            await postFromEditor( frame, { type: 'suggestions', count: 1 } );
            await expect( count( page, noted ) ).toHaveText( '1', { timeout: 1000 } );
        } ).toPass();
        await expect( count( page, noted ) ).toHaveAttribute( 'aria-label', '1 suggestion' );
        await expect( count( page, noted ) ).toHaveCount( 1 );

        await expect( async () => {
            await postFromEditor( frame, { type: 'suggestions', count: 0 } );
            await expect( count( page, noted ) ).toHaveCount( 0, { timeout: 1000 } );
        } ).toPass();

        await expect( async () => {
            await postFromEditor( frame, { type: 'suggestions', count: 7 } );
            await expect( count( page, noted ) ).toHaveText( '7', { timeout: 1000 } );
        } ).toPass();
        await expect( count( page, plain ) ).toHaveCount( 0 );

        // Only an editor of the app's own is heard.
        await page.evaluate( () =>
            window.postMessage( { source: 'wfw-frame', type: 'suggestions', count: 99 }, window.location.origin )
        );
        await page.waitForTimeout( 300 );
        await expect( count( page, noted ) ).toHaveText( '7' );
    } );

    test( 'the style sheet is a field under the account menu, saved per user', async ( {
        page,
        requestUtils,
    } ) => {
        await openApp( page );
        await openAccountMenu( page );
        await styleSheetItem( page ).click();

        const sheet = page.getByRole( 'dialog', { name: 'Style sheet' } );
        const field = sheet.getByRole( 'textbox', { name: 'Style sheet' } );
        await expect( field ).toBeFocused();
        await expect( field ).toHaveValue( '' );
        await expect( field ).toHaveAttribute( 'maxlength', '5000' );
        await expect( sheet ).toContainText( 'Up to 5,000 characters.' );
        await expect( page.locator( '#wfw-user-menu' ) ).toBeHidden();

        const text = 'British spelling.\nNever touch the dialogue.';
        const saved = page.waitForResponse(
            ( response ) =>
                /users\/me/.test( decodeURIComponent( response.url() ) ) &&
                response.request().method() === 'POST'
        );
        await field.fill( text );
        expect( ( await saved ).ok() ).toBe( true );
        await page.keyboard.press( 'Escape' );
        await expect( sheet ).toHaveCount( 0 );

        const me = await requestUtils.rest( { path: '/wp/v2/users/me', params: { context: 'edit' } } );
        expect( me.meta.wfw_style_sheet ).toBe( text );

        // It is there again on the next visit.
        await openApp( page );
        await openAccountMenu( page );
        await styleSheetItem( page ).click();
        await expect( field ).toHaveValue( text );

        // It holds no more than the surface stores.
        await field.fill( '' );
        await field.focus();
        await page.keyboard.insertText( 'a'.repeat( 5010 ) );
        expect( ( await field.inputValue() ).length ).toBe( 5000 );
    } );

    test( 'Peek with a pass applied opens a sheet to read, and changes nothing', async ( {
        page,
        requestUtils,
    } ) => {
        const read = () =>
            requestUtils.rest( {
                path: `/wp/v2/posts/${ noted }`,
                params: { context: 'edit', _fields: 'title,content,modified_gmt' },
            } );
        const before = await read();

        await openApp( page );
        const frame = await openInApp( page, noted );
        const writes: string[] = [];
        page.on( 'request', ( request ) => {
            if ( request.method() !== 'GET' && /wp\/v2\/posts/.test( decodeURIComponent( request.url() ) ) ) {
                writes.push( request.method() + ' ' + request.url() );
            }
        } );

        const peek = page.locator( '.wfw-peek' );
        await expect( peek ).toBeHidden();
        await postFromEditor( frame, {
            type: 'peek-pass',
            label: 'Proofread <img src=x onerror="window.wfwLeak = 1">',
            title: 'Two things <b>wait</b> here',
            content:
                paragraph( 'An <em>opening</em> paragraph.' ) +
                paragraph( 'A closing paragraph.' ) +
                '<script>window.wfwLeak = 1;</script><img src="x" onerror="window.wfwLeak = 1"><p data-action="trash" id="wfw-user" contenteditable="true">Still text.</p>',
        } );

        // The sheet, beside the editor, under the pass's label.
        await expect( peek ).toBeVisible();
        await expect( peek.getByRole( 'tab' ) ).toHaveText( 'Proofread <img src=x onerror="window.wfwLeak = 1">' );
        await expect( peek.locator( '.wfw-peek__title' ) ).toHaveText( 'Two things <b>wait</b> here' );
        const body = peek.locator( '.wfw-peek__body' );
        await expect( body.locator( 'p' ) ).toHaveText( [
            'An opening paragraph.',
            'A closing paragraph.',
            'Still text.',
        ] );
        await expect( body.locator( 'em' ) ).toHaveText( 'opening' );
        // The editor gives way once the sheet has slid in.
        await expect( async () => {
            const editorBox = ( await page.locator( '.wfw-editor iframe' ).boundingBox() )!;
            const peekBox = ( await peek.boundingBox() )!;
            expect( peekBox.x ).toBeGreaterThanOrEqual( editorBox.x + editorBox.width - 1 );
        } ).toPass();

        // Read only: nothing in it can be typed into or runs, and its text can be selected.
        expect(
            await body.evaluate( ( el ) => ( {
                editable: [ el, ...el.querySelectorAll( '*' ) ].some(
                    ( node ) => ( node as HTMLElement ).isContentEditable
                ),
                fields: el.querySelectorAll( 'input, textarea, select, script, [data-action], [id]' ).length,
                select: getComputedStyle( el ).userSelect,
                leak: ( window as any ).wfwLeak,
            } ) )
        ).toEqual( { editable: false, fields: 0, select: 'text', leak: undefined } );

        // A pass is no saved note: it cannot be swapped into the editor, kept in every tab or stepped through versions.
        await expect( peek.locator( '[data-action="peek-swap"]' ) ).toBeDisabled();
        await expect( peek.locator( '[data-action="peek-pin"]' ) ).toBeDisabled();
        await expect( peek.locator( '[data-action="peek-versions"]' ) ).toBeDisabled();

        // The next pass takes its place, and the note itself can be peeked at beside it.
        await postFromEditor( frame, {
            type: 'peek-pass',
            label: 'Tighten',
            title: 'Two things wait here',
            content: paragraph( 'Tighter.' ),
        } );
        await expect( peek.getByRole( 'tab' ) ).toHaveText( 'Tighten' );
        await expect( body ).toHaveText( 'Tighter.' );
        await page.locator( '[data-action="peek-this-versions"]' ).click();
        await expect( body ).toContainText( 'A first paragraph.' );
        // Two notes are too many for tabs in a sheet this narrow: they are a menu.
        await peek.locator( '.wfw-peek__switch' ).click();
        await expect( page.locator( '#wfw-peek-menu' ).getByRole( 'menuitemradio' ) ).toHaveText( [ 'Tighten', 'Two things wait here' ] );
        await page.locator( '#wfw-peek-menu' ).getByRole( 'menuitemradio', { name: 'Tighten' } ).click();
        await expect( body ).toHaveText( 'Tighter.' );

        // Only one note is being written: the editor still holds the note as it was.
        await expect(
            page.frameLocator( '.wfw-editor iframe' ).frameLocator( 'iframe[name="editor-canvas"]' ).locator( '.wfw-body' )
        ).toContainText( 'A first paragraph.' );

        // Nothing was saved or changed by it, and it is not kept.
        await page.waitForTimeout( 1000 );
        expect( writes ).toEqual( [] );
        expect( await read() ).toEqual( before );
        const kept = await page.evaluate( () =>
            Object.keys( window.localStorage )
                .filter( ( key ) => /^wfw:\d+:(tabs|peek)$/.test( key ) )
                .map( ( key ) => window.localStorage.getItem( key ) )
                .join( ' ' )
        );
        expect( kept ).not.toContain( 'Tight' );
        await page.reload();
        await page.locator( '.wfw-editor iframe:not( .is-loading )' ).waitFor();
        await expect( peek.getByRole( 'tab' ) ).toHaveText( [ 'Two things wait here' ] );

        // A message that is not from an editor of the app's own opens nothing.
        await peek.locator( '[data-action="peek-close"]' ).click();
        await expect( peek ).toBeHidden();
        await page.evaluate( () =>
            window.postMessage(
                { source: 'wfw-frame', type: 'peek-pass', label: 'Forged', title: 'Forged', content: '<p>Forged</p>' },
                window.location.origin
            )
        );
        await page.waitForTimeout( 500 );
        await expect( peek ).toBeHidden();
    } );
} );

test.describe( 'The app, on a site no agent has used', () => {
    test( 'shows nothing of the surface and asks for nothing', async ( {
        page,
        requestUtils,
    } ) => {
        await resetSite( requestUtils );
        const note = await createNote( requestUtils, { paragraphs: [ 'A first paragraph.' ] } );
        // Stored by hand: without a way in ever used, the site still reads as unused.
        await seedEdit( requestUtils, note, 'first', 'opening' );

        const asked: string[] = [];
        page.on( 'request', ( request ) => asked.push( decodeURIComponent( request.url() ) ) );
        await openApp( page );
        await expect( row( page, note ) ).toBeVisible();
        await page.waitForTimeout( 1000 );

        expect( await page.evaluate( () => ( window as any ).wfwSettings.agent.seen ) ).toBe( 0 );
        await expect( page.locator( '.wfw-note__suggestions' ) ).toHaveCount( 0 );
        expect( asked.filter( ( url ) => /wfw_suggestions|wfw\/v1|wfw_style_sheet/.test( url ) ) ).toEqual( [] );

        await openAccountMenu( page );
        await expect( page.locator( '#wfw-user-menu' ).getByRole( 'menuitem', { name: 'Edit profile' } ) ).toBeVisible();
        await expect( styleSheetItem( page ) ).toHaveCount( 0 );
    } );
} );

test.describe( 'The app on a phone, on a site an agent has used', () => {
    test.use( { viewport: { width: 390, height: 844 } } );

    test( 'shows the count, the style sheet and a pass to read, as anywhere', async ( { page, requestUtils } ) => {
        await resetSite( requestUtils );
        await setAgentSeen( requestUtils, true );
        const note = await createNote( requestUtils, { paragraphs: [ 'A first paragraph.' ] } );
        await seedEdit( requestUtils, note, 'first', 'opening' );

        await openApp( page );
        await expect( row( page, note ).locator( '.wfw-note__suggestions' ) ).toHaveText( '1' );

        // The style sheet is under the account menu, which is in the drawer here.
        await page.locator( '[data-action="toggle-sidebar"]' ).first().click();
        await openAccountMenu( page );
        await expect( styleSheetItem( page ) ).toBeVisible();
        await page.keyboard.press( 'Escape' );
        await page.locator( '[data-action="close-drawer"]' ).click( { position: { x: 380, y: 400 } } );

        // The editor in the app has Review, and a pass can be read in a peek.
        const frame = await openInApp( page, note );
        await expect( page.frameLocator( '.wfw-editor iframe' ).locator( '[data-wfw-suggestions]' ) ).toHaveText( '1 suggestion' );
        await postFromEditor( frame, { type: 'peek-pass', label: 'Proofread', title: 'A note', content: paragraph( 'An opening paragraph.' ) } );
        await expect( page.locator( '.wfw-peek .wfw-peek__body' ) ).toContainText( 'An opening paragraph.' );
    } );
} );

/**
 * The appearance's accent, as a computed colour.
 */
function accent( page: Page ) {
    return page.evaluate( () => {
        const probe = document.createElement( 'span' );
        probe.style.color = 'var( --wfw-accent )';
        document.getElementById( 'wfw-app' )!.appendChild( probe );
        const color = getComputedStyle( probe ).color;
        probe.remove();
        return color;
    } );
}
