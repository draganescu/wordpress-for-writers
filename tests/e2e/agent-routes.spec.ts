/**
 * The editor's two routes, who may call them, what core's own routes show of
 * a suggestion, and the count on the posts the app lists
 * (spec/agent/surface.md: Who may call, Records, Routes for the editor).
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import {
    call,
    createAsk,
    createNote,
    resetSite,
    restAs,
    seedEdit,
    seedSuggestions,
    setAgentSeen,
} from './agent-utils';

const META = [
    '_wfw_kind',
    '_wfw_status',
    '_wfw_pass',
    '_wfw_pass_label',
    '_wfw_source',
    '_wfw_anchor',
    '_wfw_change',
    '_wfw_reason',
    '_wfw_settled',
];

test.describe( 'Routes for the editor', () => {
    let users: Record< string, number >;
    let note: number;
    let suggestion: number;

    test.beforeEach( async ( { requestUtils } ) => {
        users = await resetSite( requestUtils );
        await setAgentSeen( requestUtils, true );
        note = await createNote( requestUtils, {
            paragraphs: [
                'I stopped rereading anything until I reached the end.',
                'A second paragraph.',
            ],
            author: users.wfw_author,
        } );
        suggestion = await seedEdit( requestUtils, note, 'rereading anything', 'rereading <em>a word</em>' );
    } );

    test( 'GET lists the open suggestions with all the editor needs', async () => {
        const admin = await restAs( 'admin' );
        const before = Math.floor( Date.now() / 1000 );
        const { status, body } = await admin( 'GET', `/wfw/v1/notes/${ note }/suggestions` );
        expect( status ).toBe( 200 );
        expect( Object.keys( body ).sort() ).toEqual( [ 'asks', 'now', 'seen', 'suggestions' ] );
        expect( body.asks ).toEqual( [] );
        expect( body.seen ).toBeGreaterThan( before - 120 );
        expect( body.now ).toBeGreaterThan( before - 120 );
        expect( body.suggestions ).toHaveLength( 1 );
        const [ first ] = body.suggestions;
        expect( first ).toEqual( {
            id: suggestion,
            note,
            kind: 'edit',
            status: 'open',
            pass: expect.stringMatching( /^[0-9a-f-]{36}$/ ),
            label: 'Proofread',
            anchor: {
                path: [ 0 ],
                name: 'core/paragraph',
                quote: 'rereading anything',
                prefix: 'I stopped ',
                suffix: ' until I reached the end.',
            },
            change: { replacement: 'rereading <em>a word</em>' },
            reason: 'Reads better.',
            author: { id: 1, name: 'admin' },
            date: expect.stringMatching( /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/ ),
            ask: 0,
        } );
        await admin.dispose();
    } );

    test( 'POST sets the status and nothing of the note', async ( { requestUtils } ) => {
        const author = await restAs( 'wfw_author' );
        const post = async () =>
            ( await author( 'GET', `/wp/v2/posts/${ note }?context=edit` ) ).body;
        const original = await post();

        let answer = await author( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'accepted' } );
        expect( answer.status ).toBe( 200 );
        expect( answer.body.id ).toBe( suggestion );
        expect( answer.body.status ).toBe( 'accepted' );

        // The note is as it was: accepting is the editor's edit, not the route's.
        const after = await post();
        expect( after.content.raw ).toBe( original.content.raw );
        expect( after.modified_gmt ).toBe( original.modified_gmt );
        expect( after.title.raw ).toBe( original.title.raw );

        // Settled in the last day: still listed, so it can be taken back. Core reads it as resolved.
        let list = await author( 'GET', `/wfw/v1/notes/${ note }/suggestions` );
        expect( list.body.suggestions.map( ( s: any ) => [ s.id, s.status ] ) ).toEqual( [ [ suggestion, 'accepted' ] ] );
        let stored = await call( requestUtils, 'wfw_test_meta', [ suggestion ] );
        expect( Number( stored.result._wfw_settled ) ).toBeGreaterThan( 0 );
        expect( ( await author( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` ) ).body.status ).toBe( 'approved' );
        expect( ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result ).toBe( 0 );

        answer = await author( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'open' } );
        expect( answer.body.status ).toBe( 'open' );
        stored = await call( requestUtils, 'wfw_test_meta', [ suggestion ] );
        expect( stored.result._wfw_settled ).toBeUndefined();
        expect( ( await author( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` ) ).body.status ).toBe( 'hold' );
        expect( ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result ).toBe( 1 );

        answer = await author( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'dismissed' } );
        expect( answer.body.status ).toBe( 'dismissed' );

        // The writer cannot withdraw (that is the maker's), nor set anything else.
        answer = await author( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'withdrawn' } );
        expect( answer.status ).toBe( 400 );
        answer = await author( 'POST', `/wfw/v1/suggestions/${ suggestion }`, {} );
        expect( answer.status ).toBe( 400 );

        // One settled more than a day ago is no longer listed.
        await requestUtils.rest( {
            method: 'POST',
            path: '/wfw-test/v1/call',
            data: { fn: 'wfw_test_settle', args: [ suggestion, Math.floor( Date.now() / 1000 ) - 2 * 86400 ] },
        } );
        list = await author( 'GET', `/wfw/v1/notes/${ note }/suggestions` );
        expect( list.body.suggestions ).toEqual( [] );
        await author.dispose();
    } );

    test( 'a withdrawn suggestion stays withdrawn', async ( { requestUtils } ) => {
        const withdrawn = await call( requestUtils, 'wfw_suggestions_withdraw', [ note, [ suggestion ] ] );
        expect( withdrawn.result ).toEqual( { withdrawn: [ suggestion ] } );
        const admin = await restAs( 'admin' );
        const answer = await admin( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'open' } );
        expect( answer.status ).toBe( 409 );
        expect( answer.body.code ).toBe( 'withdrawn' );
        await admin.dispose();
    } );

    test( 'a note that is not the user\'s is not found, as a missing one is', async ( { requestUtils } ) => {
        const missing = 987654;
        const trashed = await createNote( requestUtils, { author: users.wfw_author } );
        await requestUtils.rest( { method: 'DELETE', path: `/wp/v2/posts/${ trashed }` } );
        const page = ( await requestUtils.rest( {
            method: 'POST',
            path: '/wp/v2/pages',
            data: { title: 'A page', status: 'draft' },
        } ) ).id;

        const message = ( id: number ) => `not_found: Note ${ id } was not found.`;
        // Another Author cannot edit the note; a Subscriber cannot use Writer; a visitor is nobody.
        for ( const login of [ 'wfw_author2', 'wfw_subscriber', null ] ) {
            const user = await restAs( login );
            for ( const id of [ note, missing ] ) {
                const answer = await user( 'GET', `/wfw/v1/notes/${ id }/suggestions` );
                expect( answer.status, `${ login } ${ id }` ).toBe( 404 );
                expect( answer.body.code ).toBe( 'not_found' );
                expect( answer.body.message ).toBe( message( id ) );
                expect( answer.body.suggestions ).toBeUndefined();
            }
            for ( const id of [ suggestion, missing ] ) {
                const answer = await user( 'POST', `/wfw/v1/suggestions/${ id }`, { status: 'accepted' } );
                expect( answer.status, `${ login } ${ id }` ).toBe( 404 );
                expect( answer.body.code ).toBe( 'not_found' );
                expect( answer.body.message ).toBe( `not_found: Suggestion ${ id } was not found.` );
            }
            await user.dispose();
        }
        // Nothing was accepted on the way.
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ suggestion ] ) ).result.status ).toBe( 'open' );

        // For the note's own writer: a note in the Trash, a page and a missing id are one answer too.
        const author = await restAs( 'wfw_author' );
        expect( ( await author( 'GET', `/wfw/v1/notes/${ note }/suggestions` ) ).status ).toBe( 200 );
        const admin = await restAs( 'admin' );
        for ( const id of [ trashed, page, missing ] ) {
            const answer = await admin( 'GET', `/wfw/v1/notes/${ id }/suggestions` );
            expect( answer.status, String( id ) ).toBe( 404 );
            expect( answer.body.message ).toBe( message( id ) );
        }
        // A core note that is no suggestion is not one to set.
        const ask = ( await admin( 'POST', '/wp/v2/comments', { post: note, type: 'note', status: 'hold', content: 'Why?' } ) ).body.id;
        expect( ( await admin( 'POST', `/wfw/v1/suggestions/${ ask }`, { status: 'accepted' } ) ).status ).toBe( 404 );
        await author.dispose();
        await admin.dispose();
    } );

    test( 'core\'s comment routes neither show nor take a suggestion\'s meta', async ( { requestUtils } ) => {
        const admin = await restAs( 'admin' );

        // The store holds all of it.
        const { result: stored } = await call( requestUtils, 'wfw_test_meta', [ suggestion ] );
        expect( Object.keys( stored ).sort() ).toEqual( META.filter( ( key ) => key !== '_wfw_settled' ).sort() );
        expect( stored._wfw_status ).toBe( 'open' );

        // Core lists the suggestion as a core note, open, with none of it.
        const list = await admin( 'GET', `/wp/v2/comments?post=${ note }&type=note&status=all&context=edit` );
        expect( list.status ).toBe( 200 );
        const listed = list.body.find( ( comment: any ) => comment.id === suggestion );
        expect( listed.type ).toBe( 'note' );
        expect( listed.status ).toBe( 'hold' );
        expect( listed.content.raw ).toBe( 'Suggests: “rereading a word”\nReads better.' );
        const one = await admin( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` );
        for ( const comment of [ listed, one.body ] ) {
            expect( JSON.stringify( comment ) ).not.toContain( '_wfw_' );
            for ( const key of META ) {
                expect( comment.meta?.[ key ] ).toBeUndefined();
            }
        }

        // Nor does it take any: not one key at a time, and not on a new comment.
        for ( const key of META ) {
            await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { meta: { [ key ]: 'accepted' } } );
        }
        expect( ( await call( requestUtils, 'wfw_test_meta', [ suggestion ] ) ).result ).toEqual( stored );
        const forged = await admin( 'POST', '/wp/v2/comments', {
            post: note,
            type: 'note',
            status: 'hold',
            content: 'Not an agent.',
            meta: { _wfw_kind: 'edit', _wfw_status: 'open' },
        } );
        if ( forged.status === 201 ) {
            expect( ( await call( requestUtils, 'wfw_test_meta', [ forged.body.id ] ) ).result ).toEqual( {} );
            expect( ( await call( requestUtils, 'wfw_suggestion_get', [ forged.body.id ] ) ).result ).toBeNull();
        }
        const list2 = await admin( 'GET', `/wfw/v1/notes/${ note }/suggestions` );
        expect( list2.body.suggestions.map( ( s: any ) => s.id ) ).toEqual( [ suggestion ] );

        // The ordinary comment list and the public count know nothing of it.
        const comments = await admin( 'GET', `/wp/v2/comments?post=${ note }&context=edit` );
        expect( comments.body ).toEqual( [] );
        await admin.dispose();
    } );

    test( 'resolving a suggestion in wp-admin dismisses it, and reopening opens it', async ( { requestUtils } ) => {
        const admin = await restAs( 'admin' );
        // What core's editor sends to resolve a core note, and to reopen it.
        await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { status: 'approved' } );
        let stored = ( await call( requestUtils, 'wfw_test_meta', [ suggestion ] ) ).result;
        expect( stored._wfw_status ).toBe( 'dismissed' );
        expect( Number( stored._wfw_settled ) ).toBeGreaterThan( 0 );
        expect( ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result ).toBe( 0 );

        await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { status: 'hold' } );
        stored = ( await call( requestUtils, 'wfw_test_meta', [ suggestion ] ) ).result;
        expect( stored._wfw_status ).toBe( 'open' );
        expect( stored._wfw_settled ).toBeUndefined();
        await admin.dispose();
    } );

    test( 'core\'s comment route does not move a suggestion or change whose it is', async ( { requestUtils } ) => {
        const admin = await restAs( 'admin' );
        const elsewhere = await createNote( requestUtils );
        const ask = await createAsk( requestUtils, note );
        const before = ( await admin( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` ) ).body;
        for ( const change of [
            { post: elsewhere },
            { author: users.wfw_author2 },
            { author_name: 'Somebody else' },
            { author_email: 'else@example.test' },
            { author_url: 'https://example.test/' },
            { parent: ask },
            { status: 'approved', post: elsewhere },
        ] ) {
            const answer = await admin( 'POST', `/wp/v2/comments/${ suggestion }`, change );
            expect( answer.status, JSON.stringify( change ) ).toBe( 403 );
        }
        const after = ( await admin( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` ) ).body;
        expect( after ).toEqual( before );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ suggestion ] ) ).result ).toMatchObject( { note, status: 'open', ask: 0, author: { id: before.author } } );

        // What wp-admin's editor sends still goes through: the same values with a new status, and new text.
        const resolved = await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { status: 'approved', post: note, author: before.author, parent: 0 } );
        expect( resolved.status ).toBe( 200 );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ suggestion ] ) ).result.status ).toBe( 'dismissed' );
        expect( ( await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { content: 'Reworded.' } ) ).status ).toBe( 200 );
        await admin.dispose();
    } );

    test( 'settling a suggestion emails nobody', async ( { requestUtils } ) => {
        // The note is an Author's; the admin made the suggestion and settles it, which core would write to the Author about.
        const admin = await restAs( 'admin' );
        const mails = async () => ( await call( requestUtils, 'wfw_test_mails' ) ).result;
        expect( await mails() ).toBe( 0 );
        for ( const status of [ 'accepted', 'open', 'dismissed', 'open' ] ) {
            expect( ( await admin( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status } ) ).status ).toBe( 200 );
        }
        expect( await mails() ).toBe( 0 );

        // Resolved in wp-admin's editor it is core's doing, and core writes.
        await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { status: 'approved' } );
        expect( await mails() ).toBeGreaterThan( 0 );
        await admin.dispose();
    } );

    test( 'wfw_suggestions counts the open ones, in the edit context only', async ( { requestUtils } ) => {
        await seedSuggestions( requestUtils, note, [
            { kind: 'comment', place: { path: [ 1 ], quote: 'second' }, reason: 'Is it the second?' },
            { kind: 'details', change: { field: 'tags', value: [ 'process' ] } },
        ] );
        await requestUtils.rest( { method: 'POST', path: `/wp/v2/posts/${ note }`, data: { status: 'publish' } } );
        const quiet = await createNote( requestUtils, { status: 'publish' } );

        const admin = await restAs( 'admin' );
        const edit = await admin( 'GET', `/wp/v2/posts/${ note }?context=edit` );
        expect( edit.body.wfw_suggestions ).toBe( 3 );
        const list = await admin( 'GET', '/wp/v2/posts?context=edit&status=any&_fields=id,wfw_suggestions' );
        expect( list.body.find( ( post: any ) => post.id === note ).wfw_suggestions ).toBe( 3 );
        expect( list.body.find( ( post: any ) => post.id === quiet ).wfw_suggestions ).toBe( 0 );

        // A settled one no longer counts.
        await admin( 'POST', `/wfw/v1/suggestions/${ suggestion }`, { status: 'dismissed' } );
        expect( ( await admin( 'GET', `/wp/v2/posts/${ note }?context=edit` ) ).body.wfw_suggestions ).toBe( 2 );

        // Outside the edit context the field is not there: for a signed-in reader and for a visitor.
        const view = await admin( 'GET', `/wp/v2/posts/${ note }` );
        expect( view.status ).toBe( 200 );
        expect( 'wfw_suggestions' in view.body ).toBe( false );
        const embed = await admin( 'GET', `/wp/v2/posts/${ note }?context=embed` );
        expect( 'wfw_suggestions' in embed.body ).toBe( false );
        const visitor = await restAs( null );
        const seen = await visitor( 'GET', `/wp/v2/posts/${ note }` );
        expect( seen.status ).toBe( 200 );
        expect( 'wfw_suggestions' in seen.body ).toBe( false );
        expect( ( await visitor( 'GET', `/wp/v2/posts/${ note }?context=edit` ) ).status ).toBe( 401 );
        await admin.dispose();
        await visitor.dispose();
    } );

    test( 'a suggestion that was accepted is not reopened from wp-admin', async ( { requestUtils } ) => {
        await call( requestUtils, 'wfw_suggestion_set_status', [ suggestion, 'accepted' ] );
        const admin = await restAs( 'admin' );
        await admin( 'POST', `/wp/v2/comments/${ suggestion }`, { status: 'hold' } );
        expect( ( await call( requestUtils, 'wfw_test_meta', [ suggestion ] ) ).result._wfw_status ).toBe( 'accepted' );
        // Its comment is resolved again, so no editor reads it as an open core note.
        expect( ( await admin( 'GET', `/wp/v2/comments/${ suggestion }?context=edit` ) ).body.status ).toBe( 'approved' );
        await admin.dispose();
    } );
} );
