/**
 * Review in the Writer editor: marks, cards, the chip, the active suggestion,
 * accepting and taking it back, out of date, and what a site pays
 * (spec/agent/editor.md; spec/agent/surface.md, Placing and What a site pays).
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';
import type { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import {
    call,
    createNote,
    openEditor,
    paragraph,
    resetSite,
    seedEdit,
    seedSuggestions,
    setAgentSeen,
} from './agent-utils';

const FIRST = 'I stopped rereading anything until I reached the end.';
const SECOND = 'A second paragraph, with a <strong>bold claim</strong> in it.';
const THIRD = 'The third and last one.';

const card = ( page: Page, id: number ) => page.locator( `[data-wfw-suggestion="${ id }"]` );

const content = ( page: Page ) =>
    page.evaluate( () => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostContent() as string );

const statusOf = async ( requestUtils: RequestUtils, id: number ) =>
    ( await call( requestUtils, 'wfw_suggestion_get', [ id ] ) ).result.status;

// What the canvas has highlighted under a name, as text.
const highlighted = ( page: Page, name: string ) =>
    page.frame( { name: 'editor-canvas' } )!.evaluate(
        ( registry ) => [ ...( ( CSS as any ).highlights.get( registry ) ?? [] ) ].map( ( range: Range ) => range.toString() ).sort(),
        name
    );

const marks = ( page: Page ) => page.frameLocator( 'iframe[name="editor-canvas"]' ).locator( 'html' );

// Puts the caret (or a selection) in the nth paragraph of the canvas, by offsets in its text.
const select = ( page: Page, index: number, start: number, end = start ) =>
    page.frame( { name: 'editor-canvas' } )!.evaluate(
        ( [ nth, from, to ] ) => {
            const block = document.querySelectorAll( 'p[data-block]' )[ nth ] as HTMLElement;
            block.focus();
            const walker = document.createTreeWalker( block, NodeFilter.SHOW_TEXT );
            const range = document.createRange();
            let position = 0;
            let node: Node | null;
            let started = false;
            while ( ( node = walker.nextNode() ) ) {
                const length = ( node as Text ).data.length;
                if ( ! started && from <= position + length ) {
                    range.setStart( node, from - position );
                    started = true;
                }
                if ( started && to <= position + length ) {
                    range.setEnd( node, to - position );
                    break;
                }
                position += length;
            }
            const selection = document.getSelection()!;
            selection.removeAllRanges();
            selection.addRange( range );
        },
        [ index, start, end ]
    );

test.describe( 'Review', () => {
    let note: number;

    test.beforeEach( async ( { page, requestUtils } ) => {
        await resetSite( requestUtils );
        await setAgentSeen( requestUtils, true );
        note = await createNote( requestUtils, { paragraphs: [ FIRST, SECOND, THIRD ] } );
    } );

    test( 'draws marks, cards in the order of their passages, pass headers and the chip', async ( { page, requestUtils } ) => {
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'details', change: { field: 'excerpt', value: 'A short excerpt.' } },
            { kind: 'comment', place: { path: [ 2 ], quote: 'third' }, reason: 'Is it the last?' },
            { kind: 'edit', place: { path: [ 0 ], quote: 'rereading anything' }, change: { replacement: 'rereading' }, reason: 'Tighter.' },
        ] );
        const [ excerpt, comment, edit ] = result!.suggestions;
        const tighten = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 1 ], quote: 'bold claim' }, change: { replacement: 'claim' } },
        ], { label: 'Tighten' } );
        const before = ( await call( requestUtils, 'wfw_test_read', [ note ] ) ).result.content;

        await openEditor( page, note );

        const chip = page.locator( '.wfw-actions [data-wfw-suggestions]' );
        await expect( chip ).toHaveAttribute( 'data-wfw-suggestions', '4' );
        await expect( chip ).toHaveText( '4 suggestions' );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '3' );
        expect( await highlighted( page, 'wfw-edit' ) ).toEqual( [ 'bold claim', 'rereading anything' ] );
        expect( await highlighted( page, 'wfw-passage' ) ).toEqual( [ 'third' ] );

        // The rail, 280px beside the note.
        const rail = page.locator( '.wfw-review--rail' );
        await expect( rail ).toBeVisible();
        expect( ( await rail.boundingBox() )!.width ).toBe( 280 );
        expect( ( await page.locator( '.wfw-canvas' ).boundingBox() )!.width ).toBe( 1440 - 280 );

        const ids = await page.locator( '[data-wfw-suggestion]' ).evaluateAll( ( cards ) => cards.map( ( c ) => Number( c.getAttribute( 'data-wfw-suggestion' ) ) ) );
        expect( ids ).toEqual( [ edit, comment, excerpt, tighten.result!.suggestions[ 0 ] ] );
        for ( const id of ids ) {
            await expect( card( page, id ) ).toHaveAttribute( 'data-wfw-state', 'open' );
        }
        await expect( card( page, edit ) ).toContainText( 'rereading anything' );
        await expect( card( page, edit ) ).toContainText( 'Tighter.' );

        const headers = page.locator( '.wfw-pass__header' );
        await expect( headers ).toHaveCount( 2 );
        await expect( headers.first() ).toContainText( 'Proofread' );
        await expect( headers.first() ).toContainText( 'Agent' );
        await expect( headers.first().locator( 'time' ) ).toBeVisible();
        await expect( headers.first().getByRole( 'button', { name: 'Accept all' } ) ).toBeVisible();
        await expect( headers.first().getByRole( 'button', { name: 'Peek' } ) ).toBeVisible();
        await expect( headers.nth( 1 ) ).toContainText( 'Tighten' );

        // A mark is no part of the note.
        expect( await content( page ) ).toBe( before );
        expect( await content( page ) ).not.toMatch( /wfw|highlight/ );

        // The chip closes the rail and opens it again.
        await chip.click();
        await expect( rail ).toBeHidden();
        await chip.click();
        await expect( rail ).toBeVisible();
    } );

    test( 'makes a suggestion active from its card, its passage and the caret', async ( { page, requestUtils } ) => {
        const first = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        const third = await seedEdit( requestUtils, note, 'third', '3rd', [ 2 ] );
        await openEditor( page, note );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );

        await card( page, first ).click();
        await expect( card( page, first ) ).toHaveAttribute( 'data-wfw-state', 'active' );
        await expect( card( page, first ).getByRole( 'button', { name: 'Accept' } ) ).toBeVisible();
        await expect( card( page, third ).getByRole( 'button', { name: 'Accept' } ) ).toBeHidden();
        await expect.poll( () => highlighted( page, 'wfw-active' ) ).toEqual( [ 'rereading anything' ] );

        // A click on the other passage.
        const at = await page.frame( { name: 'editor-canvas' } )!.evaluate( () => {
            const rect = [ ...( CSS as any ).highlights.get( 'wfw-edit' ) ].find( ( range: Range ) => range.toString() === 'third' ).getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } );
        const frame = ( await page.locator( 'iframe[name="editor-canvas"]' ).boundingBox() )!;
        await page.mouse.click( frame.x + at.x, frame.y + at.y );
        await expect( card( page, third ) ).toHaveAttribute( 'data-wfw-state', 'active' );
        await expect( card( page, first ) ).toHaveAttribute( 'data-wfw-state', 'open' );

        // The caret in the first passage.
        await select( page, 0, 12 );
        await expect( card( page, first ) ).toHaveAttribute( 'data-wfw-state', 'active' );
    } );

    test( 'takes Enter, Backspace and the arrows on a focused card', async ( { page, requestUtils } ) => {
        const first = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        const second = await seedEdit( requestUtils, note, 'bold claim', 'claim', [ 1 ] );
        const third = await seedEdit( requestUtils, note, 'third', '3rd', [ 2 ] );
        await openEditor( page, note );

        await card( page, first ).focus();
        await expect( card( page, first ) ).toHaveAttribute( 'data-wfw-state', 'active' );
        await page.keyboard.press( 'ArrowDown' );
        await expect( card( page, second ) ).toBeFocused();
        await expect( card( page, second ) ).toHaveAttribute( 'data-wfw-state', 'active' );
        await page.keyboard.press( 'ArrowUp' );
        await expect( card( page, first ) ).toBeFocused();

        await page.keyboard.press( 'Enter' );
        await expect( card( page, first ) ).toHaveCount( 0 );
        expect( await content( page ) ).toContain( 'I stopped rereading until I reached the end.' );
        await expect.poll( () => statusOf( requestUtils, first ) ).toBe( 'accepted' );

        // The next card took its place, and the keyboard is still on the cards.
        await expect( card( page, second ) ).toBeFocused();
        await page.keyboard.press( 'Backspace' );
        await expect( card( page, second ) ).toHaveCount( 0 );
        await expect.poll( () => statusOf( requestUtils, second ) ).toBe( 'dismissed' );
        expect( await content( page ) ).toContain( 'bold claim' );

        await expect( card( page, third ) ).toBeFocused();
        await page.keyboard.press( 'Delete' );
        await expect.poll( () => statusOf( requestUtils, third ) ).toBe( 'dismissed' );
        await expect( page.locator( '.wfw-actions [data-wfw-suggestions]' ) ).toHaveCount( 0 );
        await expect( page.locator( '.wfw-review' ) ).toHaveCount( 0 );
    } );

    test( 'accepts an edit with its formatting, and Undo takes it back both ways', async ( { page, requestUtils } ) => {
        // The replacement carries its own formatting; the bold that covered the whole passage goes around it.
        const formatted = await seedEdit( requestUtils, note, 'rereading anything', 'rereading <em>a word</em>' );
        const covered = await seedEdit( requestUtils, note, 'bold claim', 'claim', [ 1 ] );
        const canvas = await openEditor( page, note );

        await card( page, formatted ).click();
        await card( page, formatted ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( page.locator( '.wfw-toast' ) ).toContainText( 'Accepted.' );
        expect( await content( page ) ).toContain( '<p>I stopped rereading <em>a word</em> until I reached the end.</p>' );
        await expect.poll( () => statusOf( requestUtils, formatted ) ).toBe( 'accepted' );
        await expect( card( page, formatted ) ).toHaveCount( 0 );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '1' );

        // The snackbar's Undo.
        await page.locator( '.wfw-toast' ).getByRole( 'button', { name: 'Undo' } ).click();
        expect( await content( page ) ).toContain( `<p>${ FIRST }</p>` );
        await expect.poll( () => statusOf( requestUtils, formatted ) ).toBe( 'open' );
        await expect( card( page, formatted ) ).toHaveAttribute( 'data-wfw-state', /open|active/ );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );

        // The editor's own Undo, and Redo.
        await card( page, covered ).click();
        await card( page, covered ).getByRole( 'button', { name: 'Accept' } ).click();
        expect( await content( page ) ).toContain( 'with a <strong>claim</strong> in it.' );
        await expect.poll( () => statusOf( requestUtils, covered ) ).toBe( 'accepted' );
        await canvas.locator( 'p[data-block]' ).nth( 2 ).click();
        await page.keyboard.press( 'ControlOrMeta+z' );
        expect( await content( page ) ).toContain( 'with a <strong>bold claim</strong> in it.' );
        await expect.poll( () => statusOf( requestUtils, covered ) ).toBe( 'open' );
        await expect( card( page, covered ) ).toBeVisible();
        await page.keyboard.press( 'ControlOrMeta+Shift+z' );
        expect( await content( page ) ).toContain( 'with a <strong>claim</strong> in it.' );
        await expect.poll( () => statusOf( requestUtils, covered ) ).toBe( 'accepted' );
        await expect( card( page, covered ) ).toHaveCount( 0 );
    } );

    test( 'an accepted edit is saved with the draft, by the editor', async ( { page, requestUtils } ) => {
        const edit = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        await openEditor( page, note );
        await card( page, edit ).click();
        await card( page, edit ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect.poll( async () => ( await call( requestUtils, 'wfw_test_read', [ note ] ) ).result.content, { timeout: 15000 } )
            .toContain( 'I stopped rereading until I reached the end.' );
    } );

    test( 'accepts inserted, removed and moved blocks', async ( { page, requestUtils } ) => {
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'blocks', place: { path: [ 0 ] }, change: { op: 'insert', after: 0, markup: paragraph( 'An inserted paragraph.' ) }, reason: 'A bridge.' },
            { kind: 'blocks', change: { op: 'insert', after: -1, markup: '<!-- wp:heading -->\n<h2 class="wp-block-heading">A start</h2>\n<!-- /wp:heading -->' } },
            { kind: 'blocks', place: { path: [ 1 ] }, change: { op: 'remove', block: 1 } },
            { kind: 'blocks', place: { path: [ 2 ] }, change: { op: 'move', block: 2, after: -1 } },
        ], { label: 'Restructure' } );
        const [ insert, start, remove, move ] = result!.suggestions;
        await openEditor( page, note );

        // The blocks to remove and to move are marked whole; an insert has no passage.
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );
        await expect( card( page, insert ) ).toContainText( 'An inserted paragraph.' );
        await expect( card( page, move ) ).toContainText( 'To the start of the note.' );

        const texts = () => page.evaluate( () => ( window as any ).wp.data.select( 'core/block-editor' ).getBlocks().map( ( b: any ) => b.name + ':' + String( b.attributes.content ).replace( /<[^>]+>/g, '' ) ) );
        const accept = async ( id: number ) => {
            await card( page, id ).click();
            await card( page, id ).getByRole( 'button', { name: 'Accept' } ).click();
            await expect( card( page, id ) ).toHaveCount( 0 );
        };

        await accept( insert );
        expect( await texts() ).toEqual( [ 'core/paragraph:' + FIRST, 'core/paragraph:An inserted paragraph.', 'core/paragraph:A second paragraph, with a bold claim in it.', 'core/paragraph:' + THIRD ] );
        await accept( start );
        expect( ( await texts() )[ 0 ] ).toBe( 'core/heading:A start' );
        // The others are still found, though their paths have changed.
        await accept( remove );
        expect( await texts() ).toEqual( [ 'core/heading:A start', 'core/paragraph:' + FIRST, 'core/paragraph:An inserted paragraph.', 'core/paragraph:' + THIRD ] );
        await accept( move );
        expect( await texts() ).toEqual( [ 'core/paragraph:' + THIRD, 'core/heading:A start', 'core/paragraph:' + FIRST, 'core/paragraph:An inserted paragraph.' ] );

        // One step of undo each.
        await page.evaluate( () => ( window as any ).wp.data.dispatch( 'core/editor' ).undo() );
        expect( await texts() ).toEqual( [ 'core/heading:A start', 'core/paragraph:' + FIRST, 'core/paragraph:An inserted paragraph.', 'core/paragraph:' + THIRD ] );
        await expect.poll( () => statusOf( requestUtils, move ) ).toBe( 'open' );
        expect( await statusOf( requestUtils, remove ) ).toBe( 'accepted' );
    } );

    test( 'accepts details: a title of the options, the excerpt, tags and categories', async ( { page, requestUtils } ) => {
        await requestUtils.rest( { method: 'POST', path: '/wp/v2/categories', data: { name: 'Craft' } } ).catch( () => {} );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'details', change: { field: 'titles', value: [ 'To the end', 'No looking back' ] } },
            { kind: 'details', change: { field: 'titles', value: [ 'Another' ] } },
            { kind: 'details', change: { field: 'excerpt', value: 'On not rereading.' } },
            { kind: 'details', change: { field: 'tags', value: [ 'process', 'drafting' ] } },
            { kind: 'details', change: { field: 'categories', value: [ 'Craft', 'Gone since' ] } },
        ], { label: 'Details' } );
        const [ titles, other, excerpt, tags, categories ] = result!.suggestions;
        await openEditor( page, note );
        const edited = ( key: string ) => page.evaluate( ( k ) => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostAttribute( k ), key );
        const names = async ( base: string, ids: number[] ) =>
            ( await Promise.all( ids.map( ( id ) => requestUtils.rest( { path: `/wp/v2/${ base }/${ id }` } ) ) ) ).map( ( term: any ) => term.name ).sort();

        // Titles: the options, and "Keep mine".
        await card( page, titles ).click();
        await expect( card( page, titles ).getByRole( 'button', { name: 'Accept', exact: true } ) ).toHaveCount( 0 );
        await card( page, titles ).getByRole( 'button', { name: 'No looking back' } ).click();
        expect( await edited( 'title' ) ).toBe( 'No looking back' );
        await expect.poll( () => statusOf( requestUtils, titles ) ).toBe( 'accepted' );
        await card( page, other ).click();
        await card( page, other ).getByRole( 'button', { name: 'Keep mine' } ).click();
        await expect.poll( () => statusOf( requestUtils, other ) ).toBe( 'dismissed' );
        expect( await edited( 'title' ) ).toBe( 'No looking back' );

        await card( page, excerpt ).click();
        await card( page, excerpt ).getByRole( 'button', { name: 'Accept' } ).click();
        expect( await edited( 'excerpt' ) ).toBe( 'On not rereading.' );

        // Tags that do not exist are made; a category that does not exist is left out, and the card says so.
        await card( page, tags ).click();
        await card( page, tags ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card( page, tags ) ).toHaveCount( 0 );
        expect( await names( 'tags', await edited( 'tags' ) ) ).toEqual( [ 'drafting', 'process' ] );

        await expect( card( page, categories ) ).toContainText( 'Not on this site, so left out: Gone since.' );
        await card( page, categories ).click();
        await card( page, categories ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card( page, categories ) ).toHaveCount( 0 );
        expect( await names( 'categories', await edited( 'categories' ) ) ).toContain( 'Craft' );

        // Undo takes the categories back and opens the suggestion again.
        await page.locator( '.wfw-toast' ).getByRole( 'button', { name: 'Undo' } ).click();
        expect( await names( 'categories', await edited( 'categories' ) ) ).not.toContain( 'Craft' );
        await expect.poll( () => statusOf( requestUtils, categories ) ).toBe( 'open' );
    } );

    test( 'leaves out a tag the user may not create, and says so', async ( { page, requestUtils } ) => {
        await requestUtils.rest( { method: 'POST', path: '/wp/v2/tags', data: { name: 'process' } } ).catch( () => {} );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'details', change: { field: 'tags', value: [ 'process', 'never made' ] } },
        ], { label: 'Details' } );
        const [ tags ] = result!.suggestions;
        await openEditor( page, note );
        // The post, as core gives it to a user who may not create tags. The card reads it as it is shown.
        await page.evaluate( () => {
            const { select: s, dispatch: d } = ( window as any ).wp.data;
            const post = s( 'core/editor' ).getCurrentPost();
            const links = { ...post._links };
            delete links[ 'wp:action-create-tags' ];
            d( 'core' ).receiveEntityRecords( 'postType', 'post', [ { ...post, _links: links } ] );
        } );
        const chip = page.locator( '.wfw-actions [data-wfw-suggestions]' );
        await chip.click();
        await chip.click();

        await expect( card( page, tags ) ).toContainText( 'Not on this site, so left out: never made.' );
        await card( page, tags ).click();
        await card( page, tags ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card( page, tags ) ).toHaveCount( 0 );
        const ids: number[] = await page.evaluate( () => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostAttribute( 'tags' ) );
        expect( ids ).toHaveLength( 1 );
        const found = await requestUtils.rest( { path: '/wp/v2/tags', params: { search: 'never made' } } );
        expect( found ).toHaveLength( 0 );
    } );

    test( 'accepts all of a pass as one step of undo', async ( { page, requestUtils } ) => {
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 0 ], quote: 'rereading anything' }, change: { replacement: 'rereading' } },
            { kind: 'edit', place: { path: [ 1 ], quote: 'bold claim' }, change: { replacement: 'claim' } },
            { kind: 'details', change: { field: 'excerpt', value: 'On not rereading.' } },
            { kind: 'details', change: { field: 'titles', value: [ 'To the end' ] } },
            { kind: 'comment', place: { path: [ 2 ], quote: 'third' }, reason: 'Is it?' },
            { kind: 'edit', anchor: { path: [ 2 ], name: 'core/paragraph', quote: 'not in the note', prefix: '', suffix: '' }, change: { replacement: 'x' } },
        ] );
        const [ first, second, excerpt, titles, comment, stale ] = result!.suggestions;
        const other = await seedEdit( requestUtils, note, 'third', '3rd', [ 2 ] );
        await openEditor( page, note );
        const edited = ( key: string ) => page.evaluate( ( k ) => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostAttribute( k ), key );

        await page.locator( '.wfw-pass' ).filter( { has: card( page, first ) } ).getByRole( 'button', { name: 'Accept all' } ).click();
        await expect( page.locator( '.wfw-toast' ) ).toContainText( 'Accepted 3 suggestions.' );
        expect( await content( page ) ).toContain( 'I stopped rereading until I reached the end.' );
        expect( await content( page ) ).toContain( 'with a <strong>claim</strong> in it.' );
        expect( await edited( 'excerpt' ) ).toBe( 'On not rereading.' );
        for ( const id of [ first, second, excerpt ] ) {
            await expect.poll( () => statusOf( requestUtils, id ) ).toBe( 'accepted' );
        }
        // Those with no Accept, the one out of date and the other pass stay.
        for ( const id of [ titles, comment, stale, other ] ) {
            expect( await statusOf( requestUtils, id ) ).toBe( 'open' );
            await expect( card( page, id ) ).toBeVisible();
        }

        await page.locator( '.wfw-toast' ).getByRole( 'button', { name: 'Undo' } ).click();
        expect( await content( page ) ).toContain( `<p>${ FIRST }</p>` );
        expect( await content( page ) ).toContain( `<p>${ SECOND }</p>` );
        expect( await edited( 'excerpt' ) ).toBe( '' );
        for ( const id of [ first, second, excerpt ] ) {
            await expect.poll( () => statusOf( requestUtils, id ) ).toBe( 'open' );
            await expect( card( page, id ) ).toBeVisible();
        }
    } );

    test( 'dismisses with a snackbar and Undo, and a comment has Resolve only', async ( { page, requestUtils } ) => {
        const edit = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'comment', place: { path: [ 2 ], quote: 'third' }, reason: 'Is it the last?' },
        ] );
        const [ comment ] = result!.suggestions;
        await openEditor( page, note );

        await card( page, edit ).click();
        await card( page, edit ).getByRole( 'button', { name: 'Dismiss' } ).click();
        await expect( page.locator( '.wfw-toast' ) ).toContainText( 'Dismissed.' );
        await expect( card( page, edit ) ).toHaveCount( 0 );
        await expect.poll( () => statusOf( requestUtils, edit ) ).toBe( 'dismissed' );
        expect( await content( page ) ).toContain( FIRST );

        await page.locator( '.wfw-toast' ).getByRole( 'button', { name: 'Undo' } ).click();
        await expect( card( page, edit ) ).toBeVisible();
        await expect.poll( () => statusOf( requestUtils, edit ) ).toBe( 'open' );

        await card( page, comment ).click();
        await expect( card( page, comment ) ).toContainText( 'Is it the last?' );
        await expect( card( page, comment ).getByRole( 'button' ) ).toHaveText( [ 'Resolve' ] );
        await card( page, comment ).getByRole( 'button', { name: 'Resolve' } ).click();
        await expect.poll( () => statusOf( requestUtils, comment ) ).toBe( 'dismissed' );
    } );

    test( 'shows the cards of a locked note with their actions disabled', async ( { page, requestUtils } ) => {
        const edit = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        await openEditor( page, note );
        await expect( card( page, edit ) ).toBeVisible();
        await page.evaluate( () => ( window as any ).wp.data.dispatch( 'core/editor' ).updatePostLock( { isLocked: true, user: { name: 'Someone else' } } ) );
        // The editor's own dialog about the lock is in the way of a pointer, not of the keyboard.
        await page.evaluate( () => document.querySelector( '.components-modal__screen-overlay' )?.remove() );

        await card( page, edit ).click();
        // (The dialog hid the rest of the page from roles, so the buttons are found by their text.)
        await expect( card( page, edit ).locator( 'button', { hasText: 'Accept' } ) ).toBeDisabled();
        await expect( card( page, edit ).locator( 'button', { hasText: 'Dismiss' } ) ).toBeDisabled();
        await expect( page.locator( 'button', { hasText: 'Accept all' } ) ).toBeDisabled();
        await card( page, edit ).focus();
        await page.keyboard.press( 'Enter' );
        await page.keyboard.press( 'Backspace' );
        await expect( card( page, edit ) ).toBeVisible();
        expect( await content( page ) ).toContain( FIRST );
        expect( await statusOf( requestUtils, edit ) ).toBe( 'open' );
    } );

    test( 'marks a suggestion out of date when its text goes, and brings it back with Undo', async ( { page, requestUtils } ) => {
        const edit = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        const overlapping = await seedEdit( requestUtils, note, 'anything until', 'a thing until' );
        const canvas = await openEditor( page, note );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );

        // Accepting one of two edits that overlap makes the other out of date.
        await card( page, edit ).click();
        await card( page, edit ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card( page, overlapping ) ).toHaveAttribute( 'data-wfw-state', 'stale' );
        await expect( card( page, overlapping ) ).toContainText( 'The text has changed since this was suggested.' );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '0' );
        await card( page, overlapping ).click();
        await expect( card( page, overlapping ).getByRole( 'button' ) ).toHaveText( [ 'Dismiss' ] );

        // Undo brings both back.
        await page.locator( '.wfw-toast' ).getByRole( 'button', { name: 'Undo' } ).click();
        await expect( card( page, overlapping ) ).toHaveAttribute( 'data-wfw-state', /open|active/ );
        await expect( card( page, edit ) ).toBeVisible();
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );

        // So does typing: the passage goes, and comes back.
        await select( page, 0, 12, 14 );
        await page.keyboard.type( 'X' );
        await expect( card( page, edit ) ).toHaveAttribute( 'data-wfw-state', 'stale' );
        await page.keyboard.press( 'ControlOrMeta+z' );
        await expect( card( page, edit ) ).toHaveAttribute( 'data-wfw-state', /open|active/ );

        // A mark follows typing elsewhere in its block, and a passage that moved to another block is still found.
        await select( page, 0, 0 );
        await page.keyboard.type( 'Well, ' );
        await expect.poll( () => highlighted( page, 'wfw-edit' ) ).toEqual( [ 'anything until', 'rereading anything' ] );
        await canvas.locator( 'p[data-block]' ).first().press( 'Home' );
        await page.keyboard.press( 'ControlOrMeta+z' );
        await page.evaluate( () => {
            const { select: s, dispatch: d } = ( window as any ).wp.data;
            const [ first ] = s( 'core/block-editor' ).getBlocks();
            d( 'core/block-editor' ).moveBlockToPosition( first.clientId, '', '', 2 );
        } );
        await expect( card( page, edit ) ).toHaveAttribute( 'data-wfw-state', /open|active/ );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );
        expect( await content( page ) ).not.toMatch( /wfw/ );
    } );

    test( 'asks for suggestions every five seconds while an agent is about, and through the Heartbeat otherwise', async ( { page, requestUtils } ) => {
        const requests: string[] = [];
        page.on( 'request', ( request ) => {
            if ( /wfw(%2F|\/)v1(%2F|\/)notes/.test( request.url() ) ) {
                requests.push( request.url() );
            }
        } );
        await openEditor( page, note );
        await expect.poll( () => requests.length ).toBe( 1 );
        const fresh = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        await expect( card( page, fresh ) ).toBeVisible( { timeout: 8000 } );

        // A way in last used an hour ago: nothing is asked, until the Heartbeat tells of a new suggestion.
        await setAgentSeen( requestUtils, Math.floor( Date.now() / 1000 ) - 3600 );
        await page.reload();
        await page.locator( '.wfw-ed' ).waitFor();
        await expect( card( page, fresh ) ).toBeVisible();
        const settled = requests.length;
        const later = await seedEdit( requestUtils, note, 'third', '3rd', [ 2 ] );
        await page.waitForTimeout( 7000 );
        expect( requests.length ).toBe( settled );
        await expect( card( page, later ) ).toHaveCount( 0 );
        await page.evaluate( () => ( window as any ).wp.heartbeat.connectNow() );
        await expect( card( page, later ) ).toBeVisible( { timeout: 15000 } );
    } );

    test( 'shows the cards as a sheet with previous and next on a narrow pane', async ( { page, requestUtils } ) => {
        const first = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        const third = await seedEdit( requestUtils, note, 'third', '3rd', [ 2 ] );
        await page.setViewportSize( { width: 860, height: 800 } );
        await openEditor( page, note );

        const chip = page.locator( '.wfw-actions [data-wfw-suggestions]' );
        await expect( chip ).toHaveAttribute( 'data-wfw-suggestions', '2' );
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '2' );
        await expect( page.locator( '.wfw-review' ) ).toHaveCount( 0 );

        await chip.click();
        const sheet = page.locator( '.wfw-review--sheet' );
        await expect( sheet ).toBeVisible();
        const box = ( await sheet.boundingBox() )!;
        expect( box.width ).toBe( 860 );
        expect( Math.round( box.y + box.height ) ).toBe( 800 );
        await expect( card( page, first ) ).toBeVisible();
        await expect( card( page, first ) ).toHaveAttribute( 'data-wfw-state', 'active' );
        await expect( card( page, third ) ).toBeHidden();
        await expect( sheet ).toContainText( '1 of 2' );
        await expect( sheet.getByRole( 'button', { name: 'Previous' } ) ).toBeDisabled();

        await sheet.getByRole( 'button', { name: 'Next' } ).click();
        await expect( card( page, third ) ).toBeVisible();
        await expect( card( page, first ) ).toBeHidden();
        await expect( sheet ).toContainText( '2 of 2' );
        await sheet.getByRole( 'button', { name: 'Previous' } ).click();
        await expect( card( page, first ) ).toBeVisible();

        await card( page, first ).getByRole( 'button', { name: 'Accept' } ).click();
        await expect( card( page, third ) ).toBeVisible();
        expect( await content( page ) ).toContain( 'I stopped rereading until I reached the end.' );

        await sheet.getByRole( 'button', { name: 'Close suggestions' } ).click();
        await expect( sheet ).toHaveCount( 0 );

        // A pane 900px wide has the rail.
        await page.setViewportSize( { width: 900, height: 800 } );
        await chip.click();
        await expect( page.locator( '.wfw-review--rail' ) ).toBeVisible();
    } );

    test( 'shows nothing in the phone layout', async ( { page, requestUtils } ) => {
        const edit = await seedEdit( requestUtils, note, 'rereading anything', 'rereading' );
        await page.setViewportSize( { width: 390, height: 844 } );
        const requests: string[] = [];
        page.on( 'request', ( request ) => {
            if ( /wfw(%2F|\/)v1/.test( request.url() ) ) {
                requests.push( request.url() );
            }
        } );
        const canvas = await openEditor( page, note );
        await canvas.locator( 'p[data-block]' ).first().click();
        await expect( page.locator( '.wfw-pill' ) ).toBeVisible();
        await page.waitForTimeout( 6000 );

        await expect( page.locator( '[data-wfw-suggestions]' ) ).toHaveCount( 0 );
        await expect( page.locator( '.wfw-review' ) ).toHaveCount( 0 );
        await expect( page.locator( '.wfw-ask-button' ) ).toHaveCount( 0 );
        expect( await marks( page ).getAttribute( 'data-wfw-marks' ) ).toBeNull();
        expect( await highlighted( page, 'wfw-edit' ) ).toEqual( [] );
        expect( requests ).toEqual( [] );

        // It comes back when the window grows, and goes again.
        await page.setViewportSize( { width: 1000, height: 844 } );
        await expect( card( page, edit ) ).toBeVisible();
        await expect( marks( page ) ).toHaveAttribute( 'data-wfw-marks', '1' );
        await page.setViewportSize( { width: 390, height: 844 } );
        await expect( page.locator( '.wfw-review' ) ).toHaveCount( 0 );
        expect( await marks( page ).getAttribute( 'data-wfw-marks' ) ).toBeNull();
        expect( await highlighted( page, 'wfw-edit' ) ).toEqual( [] );
    } );

    test( 'tells the app the count, and hands it the note with a pass applied', async ( { page, requestUtils } ) => {
        const ask = await requestUtils.rest( { method: 'POST', path: '/wp/v2/comments', data: { post: note, type: 'note', status: 'hold', content: 'Clear?' } } );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: { content: [ paragraph( FIRST ), paragraph( SECOND ), `<!-- wp:paragraph {"metadata":{"noteId":[${ ask.id }]}} -->\n<p>The <mark data-id="${ ask.id }" class="wp-note">third</mark> and last one.</p>\n<!-- /wp:paragraph -->` ].join( '\n\n' ) },
        } );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 0 ], quote: 'rereading anything' }, change: { replacement: 'rereading' } },
            { kind: 'blocks', place: { path: [ 1 ] }, change: { op: 'remove', block: 1 } },
            { kind: 'details', change: { field: 'excerpt', value: 'On not rereading.' } },
        ] );
        const [ edit ] = result!.suggestions;

        await page.addInitScript( () => {
            ( window as any ).wfwHeard = [];
            window.addEventListener( 'message', ( event ) => {
                if ( event.data && event.data.source === 'wfw-frame' && [ 'suggestions', 'peek-pass' ].includes( event.data.type ) ) {
                    ( window as any ).wfwHeard.push( event.data );
                }
            } );
        } );
        await page.goto( `/wp-admin/admin.php?page=wfw#note=${ note }` );
        const frame = page.frameLocator( `iframe[src*="post=${ note }"]` );
        const heard = ( type: string ) => page.evaluate( ( t ) => ( window as any ).wfwHeard.filter( ( m: any ) => m.type === t ), type );

        await expect( frame.locator( `[data-wfw-suggestion="${ edit }"]` ) ).toBeVisible( { timeout: 30000 } );
        await expect.poll( () => heard( 'suggestions' ) ).toEqual( [ { source: 'wfw-frame', type: 'suggestions', count: 3 } ] );

        await frame.getByRole( 'button', { name: 'Peek' } ).click();
        const [ peek ] = await heard( 'peek-pass' );
        expect( Object.keys( peek ).sort() ).toEqual( [ 'content', 'label', 'source', 'title', 'type' ] );
        expect( peek.title ).toBe( 'A note' );
        expect( peek.label ).toBe( 'Proofread' );
        expect( peek.content ).toContain( '<p>I stopped rereading until I reached the end.</p>' );
        expect( peek.content ).not.toContain( 'A second paragraph' );
        // Core's marker of an ask is left out of what is read; its text stays.
        expect( peek.content ).toContain( '<p>The third and last one.</p>' );
        expect( peek.content ).not.toContain( '<mark' );

        // Nothing was changed by it.
        const inFrame = page.frames().find( ( f ) => f.url().includes( 'page=wfw-editor' ) )!;
        const now: string = await inFrame.evaluate( () => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostContent() );
        expect( now ).toContain( FIRST );
        expect( now ).toContain( 'A second paragraph' );
        expect( now ).toContain( 'class="wp-note"' );

        // The app shows it as a peek, beside the editor.
        await expect( page.locator( '.wfw-peek .wfw-peek__body' ) ).toContainText( 'I stopped rereading until I reached the end.' );
        await page.locator( '.wfw-peek [data-action="peek-close"]' ).click();

        await frame.locator( `[data-wfw-suggestion="${ edit }"]` ).click();
        await frame.locator( `[data-wfw-suggestion="${ edit }"]` ).getByRole( 'button', { name: 'Dismiss' } ).click();
        await expect.poll( async () => ( await heard( 'suggestions' ) ).map( ( m: any ) => m.count ) ).toEqual( [ 3, 2 ] );
    } );
} );
