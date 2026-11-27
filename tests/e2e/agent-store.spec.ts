/**
 * The store's functions (includes/suggestions.php), called in a web request
 * through the test plugin: reading a note, placing a suggestion, storing a
 * pass, asks, withdrawing, the style sheet and uninstall
 * (spec/agent/surface.md: Records, Reading a note, Placing).
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import {
    askMarker,
    call,
    createAsk,
    createNote,
    paragraph,
    readNote,
    resetSite,
    restAs,
    seedEdit,
    seedSuggestions,
    setAgentSeen,
} from './agent-utils';

test.describe( 'The store', () => {
    let users: Record< string, number >;

    test.beforeEach( async ( { requestUtils } ) => {
        users = await resetSite( requestUtils );
    } );

    test( 'a note is read as blocks with paths, text and html', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, {
            content: [
                paragraph( 'Plain &amp; <strong>bold</strong>, a <a href="https://example.org/">link</a><br>and a new line.' ),
                '<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>First item</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>Second <em>item</em></li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->',
                '<p>Classic text with no block.</p>',
                '<!-- wp:image -->\n<figure class="wp-block-image"><img src="https://example.org/a.png" alt=""/></figure>\n<!-- /wp:image -->',
                '<!-- wp:pullquote -->\n<figure class="wp-block-pullquote"><blockquote><p>Write badly first.</p><cite>Someone</cite></blockquote></figure>\n<!-- /wp:pullquote -->',
            ].join( '\n\n' ),
        } );
        const read = await readNote( requestUtils, note );
        expect( read.from ).toBe( 'note' );
        expect( read.title ).toBe( 'A note' );
        expect( read.blocks ).toEqual( [
            {
                path: [ 0 ],
                name: 'core/paragraph',
                text: 'Plain & bold, a link\nand a new line.',
                html: 'Plain &amp; <strong>bold</strong>, a <a href="https://example.org/">link</a><br>and a new line.',
            },
            { path: [ 1 ], name: 'core/list', text: '', html: '' },
            { path: [ 1, 0 ], name: 'core/list-item', text: 'First item', html: 'First item' },
            { path: [ 1, 1 ], name: 'core/list-item', text: 'Second item', html: 'Second <em>item</em>' },
            // The classic text has no block name: left out, and not counted.
            { path: [ 2 ], name: 'core/image', text: '', html: '' },
            { path: [ 3 ], name: 'core/pullquote', text: 'Write badly first.\nSomeone', html: 'Write badly first.\nSomeone' },
        ] );
    } );

    test( 'a passage is placed by its block, its quote and the text around it', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, {
            paragraphs: [
                'Nobody would ever read it, and I stopped rereading anything until I reached the end.',
                'The end, the end, and the end again. Ünïcödé 🙂 stays whole.',
            ],
        } );
        const { blocks } = await readNote( requestUtils, note );
        const anchor = ( ...args: any[] ) => call( requestUtils, 'wfw_test_anchor', [ blocks, ...args ] );

        expect( ( await anchor( [ 0 ], 'I stopped rereading anything until I reached the end.' ) ).result ).toEqual( {
            path: [ 0 ],
            name: 'core/paragraph',
            quote: 'I stopped rereading anything until I reached the end.',
            prefix: 'Nobody would ever read it, and ',
            suffix: '',
        } );
        // 32 characters each side, fewer at the edges; characters, not bytes.
        expect( ( await anchor( [ 1 ], '🙂' ) ).result ).toEqual( {
            path: [ 1 ],
            name: 'core/paragraph',
            quote: '🙂',
            prefix: 'end, and the end again. Ünïcödé ',
            suffix: ' stays whole.',
        } );
        expect( ( await anchor( [ 0 ], 'reached' ) ).result.prefix ).toBe( 'pped rereading anything until I ' );

        // More than once: `occurrence` is required, and picks.
        let answer = await anchor( [ 1 ], 'the end' );
        expect( answer.error.code ).toBe( 'invalid_args' );
        expect( answer.error.message ).toBe( 'invalid_args: occurrence is required: the quoted text occurs 2 times in block [1].' );
        expect( ( await anchor( [ 1 ], 'the end', 2 ) ).result.prefix ).toBe( 'The end, the end, and ' );
        expect( ( await anchor( [ 1 ], 'the end', 3 ) ).error.code ).toBe( 'invalid_args' );

        answer = await anchor( [ 0 ], 'never written' );
        expect( answer.error ).toEqual( {
            code: 'not_found',
            message: 'not_found: The quoted text was not found in block [0]. Read the note again.',
            data: { status: 404 },
        } );
        expect( ( await anchor( [ 7 ], 'the end' ) ).error.message ).toBe( 'not_found: Block [7] was not found.' );
        expect( ( await anchor( [ 0 ], '' ) ).error.code ).toBe( 'invalid_args' );

        // A whole block: its path, its name and its first 64 characters.
        expect( ( await call( requestUtils, 'wfw_block_anchor', [ blocks, [ 0 ] ] ) ).result ).toEqual( {
            path: [ 0 ],
            name: 'core/paragraph',
            quote: 'Nobody would ever read it, and I stopped rereading anything unti',
            prefix: '',
            suffix: '',
        } );
    } );

    test( 'a pass is stored as open core notes, sanitised, and whole or not at all', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, {
            paragraphs: [ 'One sentence. Another sentence.', 'A second paragraph.' ],
            author: users.wfw_author,
        } );
        const stored = await seedSuggestions(
            requestUtils,
            note,
            [
                {
                    kind: 'edit',
                    place: { path: [ 0 ], quote: 'One sentence.' },
                    change: { replacement: 'One <strong>short</strong> <a href="https://example.org/" onclick="x()">sentence</a>.<script>alert(1)</script><span class="x">!</span>' },
                    reason: 'Shorter <b>is</b> better.',
                },
                {
                    kind: 'blocks',
                    place: { path: [ 1 ] },
                    change: { op: 'insert', after: 1, markup: paragraph( 'New <em>words</em>.<script>alert(1)</script>' ), extra: 'dropped' },
                },
                { kind: 'blocks', change: { op: 'insert', after: -1, markup: paragraph( 'An opening.' ) } },
                { kind: 'blocks', place: { path: [ 1 ] }, change: { op: 'move', block: 1, after: -1 }, reason: 'It reads better first.' },
                { kind: 'details', change: { field: 'titles', value: [ 'A <i>better</i> title', 'Another' ] } },
                { kind: 'details', change: { field: 'excerpt', value: 'An excerpt.' } },
                { kind: 'comment', place: { path: [ 1 ], quote: 'second' }, reason: 'Is it really the second?\nCheck.' },
            ],
            { label: '  Tighten <b>up</b> ', as: 'wfw_author' }
        );
        expect( stored.error ).toBeUndefined();
        expect( stored.result!.pass ).toMatch( /^[0-9a-f-]{36}$/ );
        expect( stored.result!.suggestions ).toHaveLength( 7 );

        // Newest first; the oldest is the edit.
        const { result: list } = await call( requestUtils, 'wfw_suggestions_get', [ note ] );
        const byId = Object.fromEntries( list.map( ( s: any ) => [ s.id, s ] ) );
        const [ edit, insert, opening, move, titles, excerpt, comment ] = stored.result!.suggestions.map( ( id ) => byId[ id ] );
        expect( list.map( ( s: any ) => s.id ) ).toEqual( [ ...stored.result!.suggestions ].reverse() );

        expect( edit ).toMatchObject( {
            note,
            kind: 'edit',
            status: 'open',
            pass: stored.result!.pass,
            label: 'Tighten up',
            change: { replacement: 'One <strong>short</strong> <a href="https://example.org/">sentence</a>.alert(1)!' },
            reason: 'Shorter is better.',
            author: { id: users.wfw_author, name: 'Author' },
            ask: 0,
        } );
        // The way in is on the record, and nothing says it was settled.
        const { result: meta } = await call( requestUtils, 'wfw_test_meta', [ edit.id ] );
        expect( meta._wfw_source ).toBe( 'abilities' );
        expect( meta._wfw_settled ).toBeUndefined();
        expect( insert.change ).toEqual( { op: 'insert', after: 1, markup: paragraph( 'New <em>words</em>.alert(1)' ) } );
        expect( insert.anchor ).toMatchObject( { path: [ 1 ], name: 'core/paragraph', quote: 'A second paragraph.' } );
        expect( opening.anchor ).toBeNull();
        expect( move.change ).toEqual( { op: 'move', block: 1, after: -1 } );
        expect( titles.change ).toEqual( { field: 'titles', value: [ 'A better title', 'Another' ] } );
        expect( titles.anchor ).toBeNull();
        expect( excerpt.change ).toEqual( { field: 'excerpt', value: 'An excerpt.' } );
        expect( comment ).toMatchObject( { kind: 'comment', change: [], reason: 'Is it really the second?\nCheck.' } );
        expect( comment.anchor.quote ).toBe( 'second' );

        // What a person reads in wp-admin's list of core notes; each is open there (on hold), by the user the call ran as.
        const admin = await restAs( 'admin' );
        const core = ( await admin( 'GET', `/wp/v2/comments?post=${ note }&type=note&status=all&context=edit&per_page=100&order=asc` ) ).body;
        expect( core.map( ( c: any ) => c.content.raw ) ).toEqual( [
            'Suggests: “One short sentence.alert(1)!”\nShorter is better.',
            'Suggests adding a block.',
            'Suggests adding a block.',
            'It reads better first.',
            'Suggests the title: A better title, Another',
            'Suggests the excerpt: An excerpt.',
            'Is it really the second?\nCheck.',
        ] );
        expect( new Set( core.map( ( c: any ) => c.status ) ) ).toEqual( new Set( [ 'hold' ] ) );
        expect( new Set( core.map( ( c: any ) => c.author ) ) ).toEqual( new Set( [ users.wfw_author ] ) );
        expect( new Set( core.map( ( c: any ) => c.author_user_agent ) ) ).toEqual( new Set( [ 'wfw-agent/abilities' ] ) );

        // The note itself was not touched.
        const post = ( await admin( 'GET', `/wp/v2/posts/${ note }?context=edit` ) ).body;
        expect( post.content.raw ).toBe( [ paragraph( 'One sentence. Another sentence.' ), paragraph( 'A second paragraph.' ) ].join( '\n\n' ) );
        await admin.dispose();

        // A pass with one bad suggestion stores none of it.
        const count = async () => ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result;
        expect( await count() ).toBe( 7 );
        for ( const [ bad, code ] of [
            [ { kind: 'edit', place: { path: [ 0 ], quote: 'Another' }, change: {} }, 'invalid_args' ],
            [ { kind: 'edit', change: { replacement: 'x' } }, 'invalid_args' ],
            [ { kind: 'edit', place: { path: [ 0 ], quote: 'Another' }, change: { replacement: 'x' }, reason: 'r'.repeat( 301 ) }, 'invalid_args' ],
            [ { kind: 'blocks', change: { op: 'insert', after: 0, markup: '<p>No block here.</p>' } }, 'invalid_args' ],
            [ { kind: 'blocks', change: { op: 'explode', block: 0 } }, 'invalid_args' ],
            [ { kind: 'details', change: { field: 'slug', value: 'x' } }, 'invalid_args' ],
            [ { kind: 'comment', place: { path: [ 0 ], quote: 'Another' }, reason: '' }, 'invalid_args' ],
            [ { kind: 'rewrite', change: {} }, 'invalid_args' ],
            // The limits (abilities.md), which the store keeps whoever calls it.
            [ { kind: 'blocks', change: { op: 'insert', after: 0, markup: paragraph( 'x'.repeat( 20000 ) ) } }, 'invalid_args' ],
            [ { kind: 'blocks', change: { op: 'insert', after: 0, markup: paragraph( 'A block.' ) + '\n\nText beside it.' } }, 'invalid_args' ],
            [ { kind: 'details', change: { field: 'excerpt', value: 'x'.repeat( 601 ) } }, 'invalid_args' ],
            [ { kind: 'details', change: { field: 'titles', value: [ 'Fine', 'x'.repeat( 201 ) ] } }, 'invalid_args' ],
            [ { kind: 'details', change: { field: 'tags', value: [ 'x'.repeat( 101 ) ] } }, 'invalid_args' ],
            [ { kind: 'details', change: { field: 'categories', value: [ 'x'.repeat( 101 ) ] } }, 'invalid_args' ],
        ] as const ) {
            const answer = await seedSuggestions( requestUtils, note, [
                { kind: 'edit', place: { path: [ 0 ], quote: 'Another' }, change: { replacement: 'One more' } },
                bad as any,
            ] );
            expect( answer.error?.code, JSON.stringify( bad ) ).toBe( code );
            expect( answer.error?.message.startsWith( code + ': ' ) ).toBe( true );
        }
        expect( ( await seedSuggestions( requestUtils, note, [], {} ) ).error?.code ).toBe( 'invalid_args' );
        expect( ( await seedSuggestions( requestUtils, note, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ], { label: 'x'.repeat( 41 ) } ) ).error?.code ).toBe( 'invalid_args' );
        expect( await count() ).toBe( 7 );

        // Who may call: not another Author, not a Subscriber, and a missing note reads the same.
        for ( const as of [ 'wfw_author2', 'wfw_subscriber' ] ) {
            const answer = await seedSuggestions( requestUtils, note, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ], { as } );
            expect( answer.error ).toEqual( { code: 'not_found', message: `not_found: Note ${ note } was not found.`, data: { status: 404 } } );
        }
        expect( ( await seedSuggestions( requestUtils, 987654, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ] ) ).error?.message ).toBe( 'not_found: Note 987654 was not found.' );
        expect( await count() ).toBe( 7 );
    } );

    test( 'a note holds at most 200 open suggestions', async ( { requestUtils } ) => {
        test.slow();
        const note = await createNote( requestUtils );
        const many = ( n: number ) =>
            Array.from( { length: n }, ( _, i ) => ( { kind: 'details' as const, change: { field: 'excerpt', value: `Excerpt ${ i }` } } ) );
        expect( ( await seedSuggestions( requestUtils, note, many( 199 ) ) ).result!.suggestions ).toHaveLength( 199 );
        const over = await seedSuggestions( requestUtils, note, many( 2 ) );
        expect( over.error ).toEqual( {
            code: 'too_many',
            message: 'too_many: This note already has 199 open suggestions.',
            data: { status: 409 },
        } );
        expect( ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result ).toBe( 199 );
        expect( ( await seedSuggestions( requestUtils, note, many( 1 ) ) ).result!.suggestions ).toHaveLength( 1 );
    } );

    test( 'asks are open core notes no agent made, each with its passage', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'Placeholder.' ] } );
        const inline = await createAsk( requestUtils, note, 'Is this metaphor doing too much?' );
        const block = await createAsk( requestUtils, note, 'Cut this?' );
        const resolved = await createAsk( requestUtils, note, 'Done already.' );
        const gone = await createAsk( requestUtils, note, 'About text since deleted.' );
        const reply = await createAsk( requestUtils, note, 'I think so.', inline );

        // As core's editor writes them: a marker and the id in metadata.noteId for a selection, the attribute alone for a block.
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: {
                content: [
                    `<!-- wp:paragraph {"metadata":{"noteId":[${ inline },${ resolved }]}} -->\n<p>Before. ${ askMarker( inline, 'A bad first <em>draft</em> is a map.' ) } After it.</p>\n<!-- /wp:paragraph -->`,
                    `<!-- wp:paragraph {"metadata":{"noteId":${ block }}} -->\n<p>A whole block.</p>\n<!-- /wp:paragraph -->`,
                ].join( '\n\n' ),
            },
        } );
        // Resolving, as core does it: the root is approved, and an empty child records the event.
        const admin = await restAs( 'admin' );
        await admin( 'POST', `/wp/v2/comments/${ resolved }`, { status: 'approved' } );
        const event = await admin( 'POST', '/wp/v2/comments', { post: note, type: 'note', parent: inline, content: '', meta: { _wp_note_status: 'reopen' } } );
        expect( event.status ).toBe( 201 );

        // Markers are not text: the note reads without them.
        const read = await readNote( requestUtils, note );
        expect( read.blocks[ 0 ].text ).toBe( 'Before. A bad first draft is a map. After it.' );
        expect( read.blocks[ 0 ].html ).toBe( 'Before. A bad first <em>draft</em> is a map. After it.' );

        // An agent answers the inline ask without quoting: the suggestion takes the ask's passage.
        const anchor = await call( requestUtils, 'wfw_test_ask_anchor', [ note, inline ] );
        expect( anchor.result ).toEqual( {
            path: [ 0 ],
            name: 'core/paragraph',
            quote: 'A bad first draft is a map.',
            prefix: 'Before. ',
            suffix: ' After it.',
        } );
        const answer = await seedSuggestions(
            requestUtils,
            note,
            [ { kind: 'edit', anchor: anchor.result, change: { replacement: 'A first draft is a map.' } } ],
            { label: 'Answer', ask: inline }
        );
        expect( answer.error ).toBeUndefined();
        const suggestion = ( await call( requestUtils, 'wfw_suggestion_get', [ answer.result!.suggestions[ 0 ] ] ) ).result;
        expect( suggestion.ask ).toBe( inline );

        const asks = ( await call( requestUtils, 'wfw_test_asks', [ note ] ) ).result;
        expect( asks ).toEqual( [
            // A reply and the agent's answer; the empty child that records the reopen is no reply.
            { id: inline, text: 'Is this metaphor doing too much?', path: [ 0 ], quote: 'A bad first draft is a map.', replies: 2 },
            { id: block, text: 'Cut this?', path: [ 1 ], quote: 'A whole block.', replies: 0 },
            { id: gone, text: 'About text since deleted.', path: null, quote: '', replies: 0 },
        ] );
        expect( ( await call( requestUtils, 'wfw_asks_count_open', [ note ] ) ).result ).toBe( 3 );
        expect( ( await call( requestUtils, 'wfw_test_ask_anchor', [ note, block ] ) ).result.quote ).toBe( 'A whole block.' );
        expect( ( await call( requestUtils, 'wfw_test_ask_anchor', [ note, gone ] ) ).error.message ).toBe(
            `not_found: The passage of ask ${ gone } was not found. Read the note again.`
        );

        // What is not an ask of this note cannot be answered: a reply, a suggestion, another note's ask, a missing id.
        const elsewhere = await createAsk( requestUtils, await createNote( requestUtils ), 'Elsewhere.' );
        for ( const ask of [ reply, suggestion.id, elsewhere, 987654 ] ) {
            const refused = await seedSuggestions( requestUtils, note, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ], { ask } );
            expect( refused.error?.message, String( ask ) ).toBe( `not_found: Ask ${ ask } was not found.` );
        }
        await admin.dispose();
    } );

    test( 'only its maker withdraws a suggestion, and only an open one', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ] } );
        const other = await createNote( requestUtils );
        const mine = await seedEdit( requestUtils, note, 'One', 'A' );
        const settled = await seedEdit( requestUtils, note, 'Another', 'One more' );
        const elsewhere = await seedEdit( requestUtils, other, 'One', 'A' );
        await call( requestUtils, 'wfw_suggestion_set_status', [ settled, 'accepted' ] );
        const editors = ( await seedSuggestions( requestUtils, note, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ], { as: 'wfw_author' } ) ).error;
        // An Author cannot edit the admin's note, so cannot suggest on it either.
        expect( editors?.code ).toBe( 'not_found' );

        const withdraw = ( ids: number[], as?: string ) => call( requestUtils, 'wfw_suggestions_withdraw', [ note, ids ], as );
        expect( ( await withdraw( [ mine, elsewhere ] ) ).error.message ).toBe( `not_found: Suggestion ${ elsewhere } was not found.` );
        expect( ( await withdraw( [ mine ], 'wfw_author' ) ).error.code ).toBe( 'not_found' );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ mine ] ) ).result.status ).toBe( 'open' );

        // Made by someone else: nothing is withdrawn, not even one's own.
        const shared = await createNote( requestUtils, { author: users.wfw_author, paragraphs: [ 'One sentence.' ] } );
        const theirs = ( await seedSuggestions( requestUtils, shared, [ { kind: 'details', change: { field: 'excerpt', value: 'x' } } ], { as: 'wfw_author' } ) ).result!.suggestions[ 0 ];
        const own = await seedEdit( requestUtils, shared, 'One', 'A' );
        const refused = await call( requestUtils, 'wfw_suggestions_withdraw', [ shared, [ own, theirs ] ] );
        expect( refused.error ).toEqual( { code: 'not_yours', message: `not_yours: Suggestion ${ theirs } was made by someone else.`, data: { status: 403 } } );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ own ] ) ).result.status ).toBe( 'open' );

        expect( ( await withdraw( [ mine, settled ] ) ).result ).toEqual( { withdrawn: [ mine ] } );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ mine ] ) ).result.status ).toBe( 'withdrawn' );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ settled ] ) ).result.status ).toBe( 'accepted' );
        const open = ( await call( requestUtils, 'wfw_suggestions_get', [ note, { status: 'open' } ] ) ).result;
        expect( open ).toEqual( [] );
    } );

    test( 'wfw_agent_seen is absent until a way in is used', async ( { requestUtils } ) => {
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBe( 0 );
        // Storing a suggestion is not a way in: abilities and `wp writer` touch the option, the store does not.
        const note = await createNote( requestUtils );
        await seedEdit( requestUtils, note, 'One', 'A' );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBe( 0 );
        const touched = ( await call( requestUtils, 'wfw_agent_touch' ) ).result;
        expect( touched ).toBeGreaterThan( 0 );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBe( touched );
    } );

    test( 'the style sheet is the user\'s own, saved as the appearance is', async ( { requestUtils } ) => {
        const author = await restAs( 'wfw_author' );
        expect( ( await author( 'GET', '/wp/v2/users/me?context=edit' ) ).body.meta.wfw_style_sheet ).toBe( '' );
        const saved = await author( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'British spelling.\n<b>No</b> semicolons.<script>x()</script>' } } );
        expect( saved.status ).toBe( 200 );
        expect( saved.body.meta.wfw_style_sheet ).toBe( 'British spelling.\nNo semicolons.' );
        expect( ( await call( requestUtils, 'wfw_get_style_sheet', [], 'wfw_author' ) ).result ).toBe( 'British spelling.\nNo semicolons.' );
        expect( ( await call( requestUtils, 'wfw_get_style_sheet', [] ) ).result ).toBe( '' );
        expect( ( await call( requestUtils, 'wfw_agent_app_data', [], 'wfw_author' ) ).result ).toEqual( { seen: 0, styleSheet: 'British spelling.\nNo semicolons.', styleSheetMax: 5000 } );
        // Longer than it holds: refused.
        expect( ( await author( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'x'.repeat( 5001 ) } } ) ).status ).toBe( 400 );
        // Nobody else reads it: user meta shows in the edit context only.
        const other = await restAs( 'wfw_author2' );
        expect( ( await other( 'GET', `/wp/v2/users/${ users.wfw_author }?context=edit` ) ).status ).toBe( 403 );
        expect( ( await other( 'GET', `/wp/v2/users/${ users.wfw_author }` ) ).body.meta ).toBeUndefined();
        await author.dispose();
        await other.dispose();
    } );

    test( 'uninstall removes the suggestions and the option, and leaves asks', async ( { requestUtils } ) => {
        await setAgentSeen( requestUtils, true );
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ] } );
        const ask = await createAsk( requestUtils, note, 'Mine to keep.' );
        const reply = await createAsk( requestUtils, note, 'A reply to keep.', ask );
        const open = await seedEdit( requestUtils, note, 'One', 'A' );
        const settled = await seedEdit( requestUtils, note, 'Another', 'One more' );
        await call( requestUtils, 'wfw_suggestion_set_status', [ settled, 'dismissed' ] );
        const author = await restAs( 'wfw_author' );
        await author( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'Short sentences.' } } );
        await author.dispose();

        await requestUtils.rest( { method: 'POST', path: '/wfw-test/v1/uninstall' } );

        const admin = await restAs( 'admin' );
        const left = ( await admin( 'GET', `/wp/v2/comments?post=${ note }&type=note&status=all&context=edit` ) ).body;
        expect( left.map( ( c: any ) => c.id ).sort() ).toEqual( [ ask, reply ].sort() );
        for ( const id of [ open, settled ] ) {
            expect( ( await call( requestUtils, 'wfw_test_meta', [ id ] ) ).result ).toEqual( {} );
        }
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBe( 0 );
        expect( ( await call( requestUtils, 'wfw_get_style_sheet', [], 'wfw_author' ) ).result ).toBe( '' );
        // The note is the site's.
        expect( ( await admin( 'GET', `/wp/v2/posts/${ note }?context=edit` ) ).status ).toBe( 200 );
        await admin.dispose();
    } );

    test( 'plain text keeps its "<", and what wp-admin shows of a suggestion is escaped', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ] } );
        const { result } = await seedSuggestions( requestUtils, note, [
            { kind: 'edit', place: { path: [ 0 ], quote: 'One' }, change: { replacement: '&lt;img src=x onerror=alert(1)&gt;' }, reason: 'Is 3 < 5 here?' },
            { kind: 'details', change: { field: 'titles', value: [ 'Less < more' ] } },
        ] );
        const [ edit, titles ] = result!.suggestions;
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ edit ] ) ).result.reason ).toBe( 'Is 3 < 5 here?' );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ titles ] ) ).result.change.value ).toEqual( [ 'Less < more' ] );

        // A core note's content is HTML in wp-admin's editor: nothing an agent wrote is a tag there.
        for ( const id of [ edit, titles ] ) {
            const comment = await requestUtils.rest( { path: `/wp/v2/comments/${ id }`, params: { context: 'edit' } } );
            expect( comment.content.raw ).not.toMatch( /<(?!\/?p\b|br\b)/ );
        }
        const shown = await requestUtils.rest( { path: `/wp/v2/comments/${ edit }`, params: { context: 'edit' } } );
        expect( shown.content.raw ).toContain( '&lt;img src=x onerror=alert(1)&gt;' );
        expect( shown.content.raw ).toContain( 'Is 3 &lt; 5 here?' );

        const me = await restAs( 'admin' );
        await me( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'Keep sentences < 25 words.' } } );
        expect( ( await me( 'GET', '/wp/v2/users/me?context=edit' ) ).body.meta.wfw_style_sheet ).toBe( 'Keep sentences < 25 words.' );
        await me.dispose();
    } );
} );
