/**
 * Asks in the Writer editor: made in core's shape on a selection or a whole
 * block, shown with their replies, answered by suggestions, and resolved as
 * core resolves a core note (spec/agent/editor.md, Asks; README.md, spike S1).
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import {
    FIRST,
    askMarker,
    call,
    content,
    createAsk,
    createNote,
    openEditor,
    paragraph,
    resetSite,
    seedSuggestions,
    select,
    setAgentSeen,
} from './agent-utils';

const SECOND = 'A second paragraph.';

const notes = ( requestUtils: RequestUtils, note: number ): Promise< any[] > =>
    requestUtils.rest( { path: '/wp/v2/comments', params: { post: note, type: 'note', status: 'all', context: 'edit', per_page: 100 } } );

test.describe( 'Asks', () => {
    let note: number;

    test.beforeEach( async ( { requestUtils } ) => {
        await resetSite( requestUtils );
        await setAgentSeen( requestUtils, true );
        note = await createNote( requestUtils, { paragraphs: [ FIRST, SECOND ] } );
    } );

    test( 'Ask on a selection makes a core note in core\'s shape', async ( { page, requestUtils } ) => {
        await openEditor( page, note );
        await select( page, 0, 10, 28 );
        await page.locator( '.wfw-pill .wfw-ask-button' ).click();

        const field = page.locator( '.wfw-ask-field textarea' );
        await expect( field ).toBeFocused();
        await expect( field ).toHaveAttribute( 'maxlength', '600' );
        await expect( page.locator( '.wfw-ask-field' ).getByRole( 'button', { name: 'Leave for an agent' } ) ).toBeDisabled();

        // Esc closes, and nothing is made.
        await field.fill( 'Never sent' );
        await page.keyboard.press( 'Escape' );
        await expect( page.locator( '.wfw-ask-field' ) ).toHaveCount( 0 );
        expect( await notes( requestUtils, note ) ).toHaveLength( 0 );

        // Enter sends.
        await select( page, 0, 10, 28 );
        await page.locator( '.wfw-pill .wfw-ask-button' ).click();
        await page.locator( '.wfw-ask-field textarea' ).fill( 'Is this too absolute?' );
        await page.keyboard.press( 'Enter' );

        const asked = page.locator( '[data-wfw-ask]' );
        await expect( asked ).toContainText( 'You asked' );
        await expect( asked ).toContainText( 'Is this too absolute?' );
        await expect( asked.getByRole( 'button', { name: 'Resolve' } ) ).toBeVisible();
        await expect( page.locator( '.wfw-ask-field' ) ).toHaveCount( 0 );

        // The comment, as core's editor makes it: an open core note with no parent and nothing of ours.
        const [ made ] = await notes( requestUtils, note );
        expect( made.type ).toBe( 'note' );
        expect( made.status ).toBe( 'hold' );
        expect( made.parent ).toBe( 0 );
        expect( made.content.raw ).toBe( 'Is this too absolute?' );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ made.id ] ) ).result ).toBeNull();

        // The marker and the block's attribute, an edit of the note.
        const edited = await content( page );
        expect( edited ).toContain( `<!-- wp:paragraph {"metadata":{"noteId":[${ made.id }]}} -->` );
        expect( edited ).toContain( `<p>I stopped ${ askMarker( made.id, 'rereading anything' ) } until I reached the end.</p>` );

        // Saved with the note, and an agent reads the ask on its passage.
        await expect.poll( async () => ( await call( requestUtils, 'wfw_test_read', [ note ] ) ).result.content, { timeout: 15000 } ).toContain( 'class="wp-note"' );
        expect( ( await call( requestUtils, 'wfw_test_ask_anchor', [ note, made.id ] ) ).result.quote ).toBe( 'rereading anything' );

        // It is there after a reload, from the note's own core note.
        await setAgentSeen( requestUtils, false );
        await page.reload();
        await expect( page.locator( `[data-wfw-ask="${ made.id }"]` ) ).toContainText( 'Is this too absolute?' );
    } );

    test( 'Ask with only a caret is about the whole block', async ( { page, requestUtils } ) => {
        await openEditor( page, note );
        await select( page, 1, 3, 3 );
        await page.locator( '.wfw-pill .wfw-ask-button' ).click();
        await page.locator( '.wfw-ask-field textarea' ).fill( 'Does this paragraph earn its place?' );
        await page.locator( '.wfw-ask-field' ).getByRole( 'button', { name: 'Leave for an agent' } ).click();

        await expect( page.locator( '[data-wfw-ask]' ) ).toContainText( 'Does this paragraph earn its place?' );
        const [ made ] = await notes( requestUtils, note );
        const edited = await content( page );
        expect( edited ).toContain( `<!-- wp:paragraph {"metadata":{"noteId":[${ made.id }]}} -->\n<p>${ SECOND }</p>` );
        expect( edited ).not.toContain( '<mark' );
    } );

    test( 'shows an ask made in wp-admin with its replies, and a reply that is a suggestion as a card', async ( { page, requestUtils } ) => {
        const ask = await createAsk( requestUtils, note, 'Is "anything" right here?' );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: { content: [ `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>I stopped ${ askMarker( ask, 'rereading anything' ) } until I reached the end.</p>\n<!-- /wp:paragraph -->`, paragraph( SECOND ) ].join( '\n\n' ) },
        } );
        await createAsk( requestUtils, note, 'I think so, but check.', ask );
        // A thread's events are not replies.
        await requestUtils.rest( { method: 'POST', path: '/wp/v2/comments', data: { post: note, type: 'note', status: 'approved', content: '', parent: ask, meta: { _wp_note_status: 'reopen' } } } );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 0 ], quote: 'rereading anything' }, change: { replacement: 'rereading a word' }, reason: 'More exact.' },
        ], { label: 'Answer', ask } );
        const [ answer ] = result!.suggestions;

        const canvas = await openEditor( page, note );
        const asked = page.locator( `[data-wfw-ask="${ ask }"]` );
        await expect( asked ).toContainText( 'You asked' );
        await expect( asked ).toContainText( 'Is "anything" right here?' );
        await expect( asked.locator( '.wfw-ask__reply' ) ).toHaveCount( 1 );
        await expect( asked.locator( '.wfw-ask__reply' ) ).toContainText( 'I think so, but check.' );

        // Core's own marker is drawn on the passage, and the suggestion has its mark over it.
        await expect( canvas.locator( `mark.wp-note[data-id="${ ask }"]` ) ).toHaveText( 'rereading anything' );
        await expect( canvas.locator( 'html' ) ).toHaveAttribute( 'data-wfw-marks', '1' );
        const card = asked.locator( `[data-wfw-suggestion="${ answer }"]` );
        await expect( card ).toContainText( 'rereading a word' );
        await expect( asked.locator( '.wfw-pass__header' ) ).toContainText( 'Answer' );
        await expect( page.locator( '.wfw-actions [data-wfw-suggestions]' ) ).toHaveAttribute( 'data-wfw-suggestions', '1' );

        // A click on the marker makes the ask's card active.
        await canvas.locator( `mark.wp-note[data-id="${ ask }"]` ).click();
        await expect( page.locator( '.wfw-review .is-active' ) ).toHaveCount( 1 );

        // Accepting the answer keeps the ask's marker around the new words.
        await card.click();
        await card.getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card ).toHaveCount( 0 );
        expect( await content( page ) ).toContain( `<p>I stopped ${ askMarker( ask, 'rereading a word' ) } until I reached the end.</p>` );
        await expect.poll( async () => ( await call( requestUtils, 'wfw_suggestion_get', [ answer ] ) ).result.status ).toBe( 'accepted' );
        await expect( asked ).toBeVisible();
    } );

    test( 'Resolve does what core does, and dismisses the replies still open', async ( { page, requestUtils } ) => {
        const ask = await createAsk( requestUtils, note, 'Is "anything" right here?' );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: { content: [ `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>I stopped ${ askMarker( ask, 'rereading anything' ) } until I reached the end.</p>\n<!-- /wp:paragraph -->`, paragraph( SECOND ) ].join( '\n\n' ) },
        } );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 0 ], quote: 'rereading anything' }, change: { replacement: 'rereading a word' } },
            { kind: 'comment', place: { path: [ 0 ], quote: 'rereading anything' }, reason: 'It reads as absolute.' },
        ], { label: 'Answer', ask } );
        const elsewhere = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 1 ], quote: 'second' }, change: { replacement: '2nd' } },
        ] );

        await openEditor( page, note );
        const asked = page.locator( `[data-wfw-ask="${ ask }"]` );
        await expect( asked.locator( '[data-wfw-suggestion]' ) ).toHaveCount( 2 );
        await asked.locator( ':scope > .wfw-card__actions' ).getByRole( 'button', { name: 'Resolve' } ).click();
        await expect( asked ).toHaveCount( 0 );

        // The marker is out, the id stays in the block's attribute.
        const edited = await content( page );
        expect( edited ).toContain( `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>${ FIRST }</p>` );

        // The ask is approved, with an empty child that records it.
        const all = await notes( requestUtils, note );
        expect( all.find( ( n ) => n.id === ask ).status ).toBe( 'approved' );
        const event = all.find( ( n ) => n.parent === ask && n.meta && n.meta._wp_note_status === 'resolved' );
        expect( event.content.raw ).toBe( '' );
        expect( event.status ).toBe( 'approved' );

        for ( const id of result!.suggestions ) {
            await expect.poll( async () => ( await call( requestUtils, 'wfw_suggestion_get', [ id ] ) ).result.status ).toBe( 'dismissed' );
        }
        const other = elsewhere.result!.suggestions[ 0 ];
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ other ] ) ).result.status ).toBe( 'open' );
        await expect( page.locator( `[data-wfw-suggestion="${ other }"]` ) ).toBeVisible();
        await expect( page.locator( '.wfw-actions [data-wfw-suggestions]' ) ).toHaveAttribute( 'data-wfw-suggestions', '1' );
    } );

    test( 'Ask is not offered on a site no agent has used, until the note has a core note', async ( { page, requestUtils } ) => {
        await setAgentSeen( requestUtils, false );
        const canvas = await openEditor( page, note );
        await canvas.locator( 'p[data-block]' ).first().click();
        await expect( page.locator( '.wfw-pill' ) ).toBeVisible();
        await expect( page.locator( '.wfw-ask-button' ) ).toHaveCount( 0 );

        await createAsk( requestUtils, note, 'Made in wp-admin.' );
        await page.reload();
        await page.frameLocator( 'iframe[name="editor-canvas"]' ).locator( 'p[data-block]' ).first().click();
        await expect( page.locator( '.wfw-pill .wfw-ask-button' ) ).toBeVisible();
        await expect( page.locator( '[data-wfw-ask]' ) ).toContainText( 'Made in wp-admin.' );
    } );
} );
