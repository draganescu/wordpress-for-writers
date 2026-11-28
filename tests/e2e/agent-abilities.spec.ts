/**
 * The abilities (includes/abilities.php), each run whole (schema, permission
 * and callback) through `wp writer call`: what each returns, each error, who
 * may call, and that none changes a note (spec/agent/abilities.md;
 * spec/agent/surface.md: Who may call).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import {
    askMarker,
    call,
    createAsk,
    createNote,
    paragraph,
    php,
    resetSite,
    restAs,
    seedEdit,
    seedSuggestions,
    setAgentSeen,
    wp,
} from './agent-utils';

type Called = {
    ok: boolean;
    result?: any;
    error?: { code: string; message: string };
    exit: number;
};

/**
 * Runs one ability as a user, through `wp writer call`.
 *
 * @param name  The ability, without `writer/`.
 * @param input Its input.
 * @param user  The login to run as; null for nobody.
 */
async function ability( name: string, input?: object, user: string | null = 'admin' ): Promise< Called > {
    const ran = await wp( [
        'writer',
        'call',
        name,
        ...( input === undefined ? [] : [ '--input=' + JSON.stringify( input ) ] ),
        ...( user ? [ '--user=' + user ] : [] ),
    ] );
    return { ...JSON.parse( ran.stdout ), exit: ran.code };
}

const refused = ( code: string, message: string ) => ( {
    ok: false,
    error: { code, message: `${ code }: ${ message }` },
    exit: 1,
} );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;

// A term by name, made if the site has none: terms outlive a reset.
async function term( requestUtils: RequestUtils, taxonomy: 'categories' | 'tags', name: string, parent = 0 ): Promise< number > {
    try {
        const made = await requestUtils.rest( { method: 'POST', path: `/wp/v2/${ taxonomy }`, data: parent ? { name, parent } : { name } } );
        return made.id;
    } catch ( error: any ) {
        return error.data.term_id;
    }
}

const stored = async ( requestUtils: RequestUtils, note: number ) => ( await call( requestUtils, 'wfw_suggestions_get', [ note ] ) ).result;
const open = async ( requestUtils: RequestUtils, note: number ) => ( await call( requestUtils, 'wfw_suggestions_count_open', [ note ] ) ).result;

test.describe( 'The abilities', () => {
    let users: Record< string, number >;

    test.beforeEach( async ( { requestUtils } ) => {
        users = await resetSite( requestUtils );
    } );

    test( 'the registry holds the category and the closed list', async () => {
        const { stdout } = await php( `
            $category = wp_get_ability_category( 'writer' );
            $abilities = array();
            foreach ( wp_get_abilities() as $ability ) {
                if ( 0 === strpos( $ability->get_name(), 'writer/' ) ) {
                    $abilities[ $ability->get_name() ] = array( $ability->get_category(), $ability->get_meta(), '' !== $ability->get_label(), '' !== $ability->get_description() );
                }
            }
            echo wp_json_encode( array( $category->get_label(), $category->get_description(), $abilities ) );
        ` );
        const [ label, description, abilities ] = JSON.parse( stdout );
        expect( label ).toBe( 'Writer' );
        // What an agent reads first, as abilities.md gives it: it names posts and drafts, and rules out the other ways in.
        const spec = fs.readFileSync( path.join( process.cwd(), 'spec/agent/abilities.md' ), 'utf8' );
        expect( spec ).toContain( `| \`writer\` | Writer | ${ description } |` );
        expect( description ).toMatch( /posts and drafts.*writer\/guide.*not a browser/ );

        // The MCP Adapter's default server is asked to offer each ability as a tool, and to say so (surface.md, Ways in).
        const { stdout: filtered } = await php( `
            echo wp_json_encode( apply_filters( 'mcp_adapter_default_server_config', array( 'tools' => array( 'mcp-adapter/execute-ability' ), 'server_description' => 'Default' ) ) );
        ` );
        const config = JSON.parse( filtered );
        expect( config.tools ).toEqual( [ 'mcp-adapter/execute-ability', ...Object.keys( abilities ) ] );
        expect( config.server_description ).toBe( 'Default. ' + description );
        const readonly: Record< string, boolean > = {
            'writer/guide': true,
            'writer/notes-list': true,
            'writer/note-get': true,
            'writer/library-get': true,
            'writer/suggestions-list': true,
            'writer/suggest-edits': false,
            'writer/suggest-blocks': false,
            'writer/suggest-details': false,
            'writer/comment': false,
            'writer/suggestions-withdraw': false,
        };
        expect( Object.keys( abilities ) ).toEqual( Object.keys( readonly ) );
        for ( const [ name, [ category, meta, hasLabel, hasDescription ] ] of Object.entries< any >( abilities ) ) {
            expect( category, name ).toBe( 'writer' );
            expect( meta.mcp, name ).toEqual( { public: true } );
            expect( meta.annotations.readonly, name ).toBe( readonly[ name ] );
            expect( meta.annotations.destructive, name ).toBe( false );
            // Not offered over core's REST route for abilities.
            expect( meta.show_in_rest, name ).toBe( false );
            expect( hasLabel && hasDescription, name ).toBe( true );
        }
    } );

    test( 'guide gives the guide verbatim and the caller’s style sheet', async () => {
        const spec = fs.readFileSync( path.join( process.cwd(), 'spec/agent/abilities.md' ), 'utf8' );
        const guide = spec.split( '```text\n' )[ 1 ].split( '\n```' )[ 0 ];
        expect( guide.startsWith( "# Working on a writer's notes" ) ).toBe( true );

        const author = await restAs( 'wfw_author' );
        await author( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'No semicolons.\nBritish spelling.' } } );
        await author.dispose();

        expect( await ability( 'guide', undefined, 'wfw_author' ) ).toEqual( {
            ok: true,
            result: { guide, style: 'No semicolons.\nBritish spelling.' },
            exit: 0,
        } );
        expect( ( await ability( 'guide' ) ).result ).toEqual( { guide, style: '' } );
        // It takes no input.
        expect( ( await ability( 'guide', { note: 1 } ) ).error?.code ).toBe( 'invalid_args' );
    } );

    test( 'notes-list finds the notes the user may edit', async ( { requestUtils } ) => {
        test.slow();
        const craft = await term( requestUtils, 'categories', 'Craft' );
        const process_ = await term( requestUtils, 'tags', 'process' );
        const mine = await createNote( requestUtils, { title: 'The admin’s draft', paragraphs: [ 'Four words in all.' ] } );
        const published = await createNote( requestUtils, {
            title: 'Published by the author',
            paragraphs: [ 'One two three.', 'Four <strong>five</strong>.' ],
            status: 'publish',
            author: users.wfw_author,
        } );
        const trashed = await createNote( requestUtils, { title: 'Thrown away' } );
        await requestUtils.rest( { method: 'DELETE', path: `/wp/v2/posts/${ trashed }` } );
        // The newest change: it comes first.
        const draft = await createNote( requestUtils, { title: 'A zebra draft', paragraphs: [ 'One sentence. Another sentence.' ], author: users.wfw_author } );
        await seedEdit( requestUtils, draft, 'One', 'A' );
        await createAsk( requestUtils, draft );
        // Times are kept to the second.
        await new Promise( ( resolve ) => setTimeout( resolve, 1100 ) );
        const edited = await requestUtils.rest( { method: 'POST', path: `/wp/v2/posts/${ draft }`, data: { categories: [ craft ], tags: [ process_ ] } } );

        const all = await ability( 'notes-list' );
        expect( all.exit ).toBe( 0 );
        expect( all.result.pages ).toBe( 1 );
        expect( all.result.notes.map( ( n: any ) => n.id ).sort() ).toEqual( [ mine, published, draft ].sort() );
        expect( all.result.notes[ 0 ] ).toEqual( {
            id: draft,
            title: 'A zebra draft',
            status: 'draft',
            modified: edited.modified_gmt,
            words: 4,
            suggestions: 1,
            asks: 1,
        } );
        const byId = Object.fromEntries( all.result.notes.map( ( n: any ) => [ n.id, n ] ) );
        expect( byId[ published ] ).toMatchObject( { status: 'publish', words: 5, suggestions: 0, asks: 0 } );
        // A draft never saved again still has a time.
        expect( byId[ mine ].modified ).toMatch( DATE );

        const ids = async ( input: object, user = 'admin' ) => ( await ability( 'notes-list', input, user ) ).result.notes.map( ( n: any ) => n.id );
        const [ authors, others, drafts, publishedOnly, found, byName, bySlug, byTag, second ] = await Promise.all( [
            // An Author edits their own notes, and nobody else's.
            ids( {}, 'wfw_author' ),
            ids( {}, 'wfw_author2' ),
            ids( { status: 'draft' } ),
            ids( { status: 'publish' } ),
            ids( { search: 'zebra' } ),
            ids( { category: 'Craft' } ),
            ids( { category: 'craft' } ),
            ids( { tag: 'process' } ),
            ids( { page: 2 } ),
        ] );
        expect( authors.sort() ).toEqual( [ published, draft ].sort() );
        expect( others ).toEqual( [] );
        expect( drafts.sort() ).toEqual( [ mine, draft ].sort() );
        expect( publishedOnly ).toEqual( [ published ] );
        expect( found ).toEqual( [ draft ] );
        expect( byName ).toEqual( [ draft ] );
        expect( bySlug ).toEqual( [ draft ] );
        expect( byTag ).toEqual( [ draft ] );
        expect( second ).toEqual( [] );

        const [ noCategory, noTag, badStatus, badPage, unknown ] = await Promise.all( [
            ability( 'notes-list', { category: 'No such category' } ),
            ability( 'notes-list', { tag: 'no-such-tag' } ),
            ability( 'notes-list', { status: 'trash' } ),
            ability( 'notes-list', { page: 0 } ),
            ability( 'notes-list', { author: 1 } ),
        ] );
        expect( noCategory ).toEqual( refused( 'not_found', 'Category No such category was not found.' ) );
        expect( noTag ).toEqual( refused( 'not_found', 'Tag no-such-tag was not found.' ) );
        for ( const bad of [ badStatus, badPage, unknown ] ) {
            expect( bad.error?.code ).toBe( 'invalid_args' );
            expect( bad.error?.message.startsWith( 'invalid_args: ' ) ).toBe( true );
        }
        expect( badStatus.error?.message ).toContain( 'input[status]' );

        // 20 a page.
        for ( let i = 0; i < 19; i++ ) {
            await createNote( requestUtils, { title: `Filler ${ i }` } );
        }
        const paged = await ability( 'notes-list' );
        expect( paged.result.pages ).toBe( 2 );
        expect( paged.result.notes ).toHaveLength( 20 );
        expect( ( await ability( 'notes-list', { page: 2 } ) ).result.notes ).toHaveLength( 2 );
    } );

    test( 'note-get gives one note as text, with its asks and its open suggestions', async ( { requestUtils } ) => {
        const craft = await term( requestUtils, 'categories', 'Craft' );
        const process_ = await term( requestUtils, 'tags', 'process' );
        const note = await createNote( requestUtils, { title: 'The case for writing badly first', paragraphs: [ 'Placeholder.' ] } );
        const ask = await createAsk( requestUtils, note, 'Is this metaphor doing too much?' );
        const saved = await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: {
                excerpt: 'On drafts.',
                categories: [ craft ],
                tags: [ process_ ],
                content: [
                    paragraph( 'Every draft I have <em>ever</em> finished &amp; kept.' ),
                    `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>${ askMarker( ask, 'A bad first draft is a map drawn from memory.' ) } It gets you there.</p>\n<!-- /wp:paragraph -->`,
                ].join( '\n\n' ),
            },
        } );
        const edit = await seedEdit( requestUtils, note, 'ever finished', 'finished' );
        const settled = await seedEdit( requestUtils, note, 'kept', 'saved' );
        await call( requestUtils, 'wfw_suggestion_set_status', [ settled, 'dismissed' ] );

        expect( await ability( 'note-get', { note } ) ).toEqual( {
            ok: true,
            exit: 0,
            result: {
                note: {
                    id: note,
                    title: 'The case for writing badly first',
                    status: 'draft',
                    excerpt: 'On drafts.',
                    categories: [ 'Craft' ],
                    tags: [ 'process' ],
                    modified: saved.modified_gmt,
                    words: 22,
                    from: 'note',
                },
                blocks: [
                    {
                        path: [ 0 ],
                        name: 'core/paragraph',
                        text: 'Every draft I have ever finished & kept.',
                        html: 'Every draft I have <em>ever</em> finished &amp; kept.',
                    },
                    {
                        path: [ 1 ],
                        name: 'core/paragraph',
                        text: 'A bad first draft is a map drawn from memory. It gets you there.',
                        html: 'A bad first draft is a map drawn from memory. It gets you there.',
                    },
                ],
                asks: [ { id: ask, text: 'Is this metaphor doing too much?', path: [ 1 ], quote: 'A bad first draft is a map drawn from memory.', replies: 0 } ],
                // The open ones only.
                suggestions: [
                    { id: edit, kind: 'edit', status: 'open', pass: 'Proofread', path: [ 0 ], quote: 'ever finished', replacement: 'finished', reason: 'Reads better.' },
                ],
            },
        } );

        // The user's autosave is read when it is newer than the note.
        const live = await createNote( requestUtils, { title: 'As published', paragraphs: [ 'As published.' ], status: 'publish' } );
        // Times are kept to the second.
        await new Promise( ( resolve ) => setTimeout( resolve, 1100 ) );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ live }/autosaves`,
            data: { title: 'As typed since', content: paragraph( 'As typed since.' ) },
        } );
        const [ typed, another ] = await Promise.all( [ ability( 'note-get', { note: live } ), ability( 'note-get', { note: live }, 'wfw_author' ) ] );
        expect( typed.result.note ).toMatchObject( { title: 'As typed since', status: 'publish', from: 'autosave' } );
        expect( typed.result.blocks[ 0 ].text ).toBe( 'As typed since.' );
        // Another user's autosave is theirs alone; an Author cannot read the admin's note at all.
        expect( another ).toEqual( refused( 'not_found', `Note ${ live } was not found.` ) );

        const [ missing, wrong ] = await Promise.all( [ ability( 'note-get', {} ), ability( 'note-get', { note: 'first' } ) ] );
        expect( missing.error?.code ).toBe( 'invalid_args' );
        expect( wrong.error?.code ).toBe( 'invalid_args' );
        expect( wrong.error?.message ).toContain( 'input[note]' );
    } );

    test( 'library-get lists the site’s categories and tags', async ( { requestUtils } ) => {
        const craft = await term( requestUtils, 'categories', 'Craft' );
        await term( requestUtils, 'categories', 'Revision', craft );
        await term( requestUtils, 'tags', 'process' );
        const note = await createNote( requestUtils, { status: 'publish' } );
        await requestUtils.rest( { method: 'POST', path: `/wp/v2/posts/${ note }`, data: { categories: [ craft ] } } );

        const { result, exit } = await ability( 'library-get', undefined, 'wfw_author' );
        expect( exit ).toBe( 0 );
        expect( Object.keys( result ) ).toEqual( [ 'categories', 'tags' ] );
        expect( result.categories ).toContainEqual( { name: 'Craft', slug: 'craft', count: 1, parent: '' } );
        expect( result.categories ).toContainEqual( { name: 'Revision', slug: 'revision', count: 0, parent: 'craft' } );
        expect( result.tags ).toContainEqual( { name: 'process', slug: 'process', count: 0 } );
    } );

    test( 'suggestions-list tells what became of suggestions', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ] } );
        const ask = await createAsk( requestUtils, note );
        const first = await seedEdit( requestUtils, note, 'One', 'A' );
        const second = await seedEdit( requestUtils, note, 'Another', 'One more' );
        const { result: answer } = await seedSuggestions(
            requestUtils,
            note,
            [ { kind: 'comment', place: { path: [ 0 ], quote: 'sentence', occurrence: 2 }, reason: 'Which sentence?' } ],
            { label: 'Answer', ask }
        );
        const third = answer!.suggestions[ 0 ];
        await call( requestUtils, 'wfw_suggestion_set_status', [ first, 'dismissed' ] );
        await call( requestUtils, 'wfw_suggestion_set_status', [ second, 'accepted' ] );

        const [ all, dismissed, opened, wrong ] = await Promise.all( [
            ability( 'suggestions-list', { note } ),
            ability( 'suggestions-list', { note, status: 'dismissed' } ),
            ability( 'suggestions-list', { note, status: 'open' } ),
            ability( 'suggestions-list', { note, status: 'stale' } ),
        ] );
        // Newest first; `ask` only where it answers one.
        expect( all.result.suggestions ).toEqual( [
            { id: third, kind: 'comment', status: 'open', pass: 'Answer', path: [ 0 ], quote: 'sentence', reason: 'Which sentence?', date: expect.stringMatching( DATE ), ask },
            { id: second, kind: 'edit', status: 'accepted', pass: 'Proofread', path: [ 0 ], quote: 'Another', replacement: 'One more', reason: 'Reads better.', date: expect.stringMatching( DATE ) },
            { id: first, kind: 'edit', status: 'dismissed', pass: 'Proofread', path: [ 0 ], quote: 'One', replacement: 'A', reason: 'Reads better.', date: expect.stringMatching( DATE ) },
        ] );
        expect( dismissed.result.suggestions.map( ( s: any ) => s.id ) ).toEqual( [ first ] );
        expect( opened.result.suggestions.map( ( s: any ) => s.id ) ).toEqual( [ third ] );
        expect( wrong.error?.code ).toBe( 'invalid_args' );
    } );

    test( 'suggest-edits stores one pass of text edits', async ( { requestUtils } ) => {
        test.slow();
        const note = await createNote( requestUtils, {
            paragraphs: [ 'Nobody would ever read it, and I stopped rereading anything until I reached the end.', 'The end, the end, and the end again.' ],
            author: users.wfw_author,
        } );
        const made = await ability(
            'suggest-edits',
            {
                note,
                pass: 'Tighten',
                edits: [
                    { path: [ 0 ], quote: 'rereading anything', replacement: 'rereading <em>a word</em><script>x()</script>', reason: 'Shorter.' },
                    { path: [ 1 ], quote: 'the end', occurrence: 2, replacement: '' },
                    // Beside the first, not over it.
                    { path: [ 0 ], quote: ' until', replacement: ' before' },
                ],
            },
            'wfw_author'
        );
        expect( made ).toEqual( { ok: true, exit: 0, result: { pass: expect.stringMatching( UUID ), suggestions: [ expect.any( Number ), expect.any( Number ), expect.any( Number ) ] } } );

        const [ third, second, first ] = await stored( requestUtils, note );
        expect( [ first.id, second.id, third.id ] ).toEqual( made.result.suggestions );
        expect( first ).toMatchObject( {
            note,
            kind: 'edit',
            status: 'open',
            pass: made.result.pass,
            label: 'Tighten',
            anchor: { path: [ 0 ], name: 'core/paragraph', quote: 'rereading anything', prefix: 'uld ever read it, and I stopped ', suffix: ' until I reached the end.' },
            change: { replacement: 'rereading <em>a word</em>x()' },
            reason: 'Shorter.',
            author: { id: users.wfw_author, name: 'Author' },
            ask: 0,
        } );
        expect( ( await call( requestUtils, 'wfw_test_meta', [ first.id ] ) ).result._wfw_source ).toBe( 'cli' );
        expect( second ).toMatchObject( { anchor: { path: [ 1 ], quote: 'the end', prefix: 'The end, the end, and ' }, change: { replacement: '' }, reason: '' } );

        // Each error, and nothing of a failed pass is stored: the good edit beside the bad one neither.
        const good = { path: [ 0 ], quote: 'Nobody', replacement: 'No one' };
        const edits = ( ...bad: object[] ) => ability( 'suggest-edits', { note, pass: 'Proofread', edits: [ good, ...bad ] }, 'wfw_author' );
        const failures = await Promise.all( [
            edits( { path: [ 0 ], quote: 'never written', replacement: 'x' } ),
            edits( { path: [ 7 ], quote: 'the end', replacement: 'x' } ),
            edits( { path: [ 1 ], quote: 'the end', replacement: 'x' } ),
            edits( { path: [ 1 ], quote: 'the end', occurrence: 3, replacement: 'x' } ),
            edits( { path: [ 0 ], quote: 'would ever', replacement: 'x' }, { path: [ 0 ], quote: 'ever read', replacement: 'y' } ),
            edits( { quote: 'the end', replacement: 'x' } ),
            edits( { path: [ 0 ], replacement: 'x' } ),
            edits( { path: [ 0 ], quote: 'ever', replacement: 'x' }, { path: [ 0 ], quote: 'read', replacement: 'x', reason: 'r'.repeat( 301 ) } ),
            edits( { path: [ 0 ], quote: 'ever' } ),
            edits( { path: [ 0 ], quote: 'ever', replacement: 'x', note: 'extra' } ),
            edits( { path: [ 0 ], quote: 'ever', replacement: 'x'.repeat( 4001 ) } ),
            edits( { path: [ 0 ], quote: '', replacement: 'x' } ),
            ability( 'suggest-edits', { note, pass: 'x'.repeat( 41 ), edits: [ good ] }, 'wfw_author' ),
            ability( 'suggest-edits', { note, pass: '', edits: [ good ] }, 'wfw_author' ),
            ability( 'suggest-edits', { note, pass: 'Proofread', edits: [] }, 'wfw_author' ),
            ability( 'suggest-edits', { note, pass: 'Proofread', edits: Array.from( { length: 51 }, () => good ) }, 'wfw_author' ),
            ability( 'suggest-edits', { note, edits: [ good ] }, 'wfw_author' ),
            ability( 'suggest-edits', { note, pass: 'Proofread', ask: 987654, edits: [ good ] }, 'wfw_author' ),
        ] );
        expect( failures[ 0 ] ).toEqual( refused( 'not_found', 'The quoted text was not found in block [0]. Read the note again.' ) );
        expect( failures[ 1 ] ).toEqual( refused( 'not_found', 'Block [7] was not found.' ) );
        expect( failures[ 2 ] ).toEqual( refused( 'invalid_args', 'occurrence is required: the quoted text occurs 2 times in block [1].' ) );
        expect( failures[ 3 ] ).toEqual( refused( 'invalid_args', 'occurrence is 3, but the quoted text occurs 2 times in block [1].' ) );
        expect( failures[ 4 ] ).toEqual( refused( 'invalid_args', 'edits[1] and edits[2] overlap in block [0].' ) );
        expect( failures[ 5 ] ).toEqual( refused( 'invalid_args', 'path is required with quote.' ) );
        expect( failures[ 6 ] ).toEqual( refused( 'invalid_args', 'quote is required unless ask is given.' ) );
        for ( const [ index, field ] of [
            [ 7, 'input[edits][2][reason]' ],
            [ 8, 'replacement' ],
            [ 9, 'note' ],
            [ 10, 'input[edits][1][replacement]' ],
            [ 11, 'input[edits][1][quote]' ],
            [ 12, 'input[pass]' ],
            [ 13, 'input[pass]' ],
            [ 14, 'input[edits]' ],
            [ 15, 'input[edits]' ],
            [ 16, 'pass' ],
        ] as const ) {
            expect( failures[ index ].exit, field ).toBe( 1 );
            expect( failures[ index ].error?.code, field ).toBe( 'invalid_args' );
            expect( failures[ index ].error?.message.startsWith( 'invalid_args: ' ), field ).toBe( true );
            expect( failures[ index ].error?.message, field ).toContain( field );
        }
        expect( failures[ 17 ] ).toEqual( refused( 'not_found', 'Ask 987654 was not found.' ) );
        expect( await open( requestUtils, note ) ).toBe( 3 );
    } );

    test( 'an answer to an ask is stored as a reply, on the ask’s passage when it quotes none', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'Placeholder.' ] } );
        const ask = await createAsk( requestUtils, note, 'Is this metaphor doing too much?' );
        const gone = await createAsk( requestUtils, note, 'About text since deleted.' );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: {
                content: `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>Before. ${ askMarker( ask, 'A bad first draft is a map.' ) } After it.</p>\n<!-- /wp:paragraph -->`,
            },
        } );

        const [ edit, remark ] = await Promise.all( [
            ability( 'suggest-edits', { note, ask, pass: 'Answer', edits: [ { replacement: 'A first draft is a map.' }, { path: [ 0 ], quote: 'After', replacement: 'Following' } ] } ),
            ability( 'comment', { note, ask, text: 'It is doing just enough.' } ),
        ] );
        expect( edit.exit ).toBe( 0 );
        expect( remark ).toEqual( { ok: true, exit: 0, result: { pass: expect.stringMatching( UUID ), suggestions: [ expect.any( Number ) ] } } );
        const byId = Object.fromEntries( ( await stored( requestUtils, note ) ).map( ( s: any ) => [ s.id, s ] ) );
        const passage = { path: [ 0 ], name: 'core/paragraph', quote: 'A bad first draft is a map.', prefix: 'Before. ', suffix: ' After it.' };
        expect( byId[ edit.result.suggestions[ 0 ] ] ).toMatchObject( { kind: 'edit', ask, anchor: passage, change: { replacement: 'A first draft is a map.' } } );
        expect( byId[ edit.result.suggestions[ 1 ] ] ).toMatchObject( { ask, anchor: { quote: 'After' } } );
        expect( byId[ remark.result.suggestions[ 0 ] ] ).toMatchObject( { kind: 'comment', ask, label: 'Comment', anchor: passage, reason: 'It is doing just enough.' } );
        expect( ( await ability( 'note-get', { note } ) ).result.asks[ 0 ] ).toMatchObject( { id: ask, replies: 3 } );

        const [ overlapping, twice, lost ] = await Promise.all( [
            // The ask's passage is a place like any other: an edit inside it overlaps the answer.
            ability( 'suggest-edits', { note, ask, pass: 'Answer', edits: [ { replacement: 'A map.' }, { path: [ 0 ], quote: 'first draft', replacement: 'draft' } ] } ),
            ability( 'suggest-edits', { note, ask, pass: 'Answer', edits: [ { replacement: 'A map.' }, { replacement: 'A chart.' } ] } ),
            ability( 'comment', { note, ask: gone, text: 'Where was it?' } ),
        ] );
        expect( overlapping ).toEqual( refused( 'invalid_args', 'edits[0] and edits[1] overlap in block [0].' ) );
        expect( twice ).toEqual( refused( 'invalid_args', 'edits[0] and edits[1] overlap in block [0].' ) );
        expect( lost ).toEqual( refused( 'not_found', `The passage of ask ${ gone } was not found. Read the note again.` ) );
        expect( await open( requestUtils, note ) ).toBe( 3 );
    } );

    test( 'suggest-blocks proposes whole blocks the Writer editor offers', async ( { requestUtils } ) => {
        test.slow();
        const note = await createNote( requestUtils, { paragraphs: [ 'The first paragraph.', 'The second paragraph.', 'The third paragraph.' ] } );
        const quoting = ( text: string ) => `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>${ text }</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->`;
        const quote = quoting( 'Write badly first.' );
        const made = await ability( 'suggest-blocks', {
            note,
            pass: 'Restructure',
            changes: [
                { op: 'insert', after: 1, markup: quoting( 'Write badly first.<script>x()</script>' ), reason: 'A voice from outside.' },
                { op: 'insert', after: -1, markup: paragraph( 'An opening.' ) },
                { op: 'remove', block: 2 },
                { op: 'move', block: 2, after: -1, reason: 'It reads better first.' },
            ],
        } );
        expect( made ).toEqual( { ok: true, exit: 0, result: { pass: expect.stringMatching( UUID ), suggestions: Array( 4 ).fill( expect.any( Number ) ) } } );
        const [ move, remove, opening, insert ] = await stored( requestUtils, note );
        expect( insert ).toMatchObject( {
            kind: 'blocks',
            label: 'Restructure',
            anchor: { path: [ 1 ], name: 'core/paragraph', quote: 'The second paragraph.', prefix: '', suffix: '' },
            change: { op: 'insert', after: 1, markup: quoting( 'Write badly first.x()' ) },
            reason: 'A voice from outside.',
        } );
        expect( opening ).toMatchObject( { anchor: null, change: { op: 'insert', after: -1, markup: paragraph( 'An opening.' ) } } );
        expect( remove ).toMatchObject( { anchor: { path: [ 2 ], quote: 'The third paragraph.' }, change: { op: 'remove', block: 2 }, reason: '' } );
        expect( move ).toMatchObject( { anchor: { path: [ 2 ] }, change: { op: 'move', block: 2, after: -1 }, reason: 'It reads better first.' } );

        const good = { op: 'remove', block: 0 };
        const changes = ( bad: object ) => ability( 'suggest-blocks', { note, pass: 'Restructure', changes: [ good, bad ] } );
        const group = '<!-- wp:group -->\n<div class="wp-block-group"><!-- wp:paragraph -->\n<p>Grouped.</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->';
        const failures = await Promise.all( [
            changes( { op: 'insert', after: 0, markup: group } ),
            // A block the editor does not offer, inside one it does.
            changes( { op: 'insert', after: 0, markup: quote.replace( /wp:paragraph/g, 'wp:site-title' ) } ),
            changes( { op: 'insert', after: 0, markup: '<p>No block here.</p>' } ),
            changes( { op: 'insert', after: 0 } ),
            changes( { op: 'insert', markup: paragraph( 'Where?' ) } ),
            changes( { op: 'insert', after: 9, markup: paragraph( 'Too far.' ) } ),
            changes( { op: 'remove' } ),
            changes( { op: 'remove', block: 9 } ),
            changes( { op: 'move', block: 1 } ),
            changes( { op: 'move', block: 1, after: 9 } ),
            changes( { op: 'move', block: 9, after: 0 } ),
            changes( { op: 'explode', block: 0 } ),
            changes( { op: 'remove', block: -1 } ),
            ability( 'suggest-blocks', { note, pass: 'Restructure', changes: [] } ),
            ability( 'suggest-blocks', { note, pass: 'Restructure', changes: Array.from( { length: 21 }, () => good ) } ),
            // Text between blocks would come into the note as a block the editor does not offer.
            changes( { op: 'insert', after: 0, markup: quote + '<script>x()</script>' } ),
            changes( { op: 'insert', after: 0, markup: 'Loose words.\n\n' + paragraph( 'A block.' ) } ),
            changes( { op: 'insert', after: 0, markup: paragraph( 'x'.repeat( 20000 ) ) } ),
        ] );
        expect( failures.slice( -3 ) ).toEqual( [
            refused( 'invalid_args', 'markup holds text outside a block.' ),
            refused( 'invalid_args', 'markup holds text outside a block.' ),
            expect.objectContaining( { ok: false } ),
        ] );
        expect( failures[ 0 ] ).toEqual( refused( 'not_allowed', 'The Writer editor does not offer the block core/group.' ) );
        expect( failures[ 1 ] ).toEqual( refused( 'not_allowed', 'The Writer editor does not offer the block core/site-title.' ) );
        expect( failures[ 2 ] ).toEqual( refused( 'invalid_args', 'markup holds no block.' ) );
        expect( failures[ 3 ] ).toEqual( refused( 'invalid_args', 'markup holds no block.' ) );
        expect( failures[ 4 ] ).toEqual( refused( 'invalid_args', 'after must be -1 or more.' ) );
        expect( failures[ 5 ] ).toEqual( refused( 'not_found', 'Block [9] was not found.' ) );
        expect( failures[ 6 ] ).toEqual( refused( 'invalid_args', 'block must be 0 or more.' ) );
        expect( failures[ 7 ] ).toEqual( refused( 'not_found', 'Block [9] was not found.' ) );
        expect( failures[ 8 ] ).toEqual( refused( 'invalid_args', 'after must be -1 or more.' ) );
        expect( failures[ 9 ] ).toEqual( refused( 'not_found', 'Block [9] was not found.' ) );
        expect( failures[ 10 ] ).toEqual( refused( 'not_found', 'Block [9] was not found.' ) );
        for ( const index of [ 11, 12, 13, 14 ] ) {
            expect( failures[ index ].error?.code, String( index ) ).toBe( 'invalid_args' );
        }
        expect( await open( requestUtils, note ) ).toBe( 4 );
    } );

    test( 'suggest-details stores one suggestion for each detail given', async ( { requestUtils } ) => {
        await term( requestUtils, 'categories', 'Craft' );
        const note = await createNote( requestUtils );
        const made = await ability( 'suggest-details', {
            note,
            titles: [ 'Write badly first', 'The <i>map</i> from memory' ],
            excerpt: 'Why a bad draft is the way in.',
            tags: [ 'process', 'a tag nobody made' ],
            categories: [ 'Craft' ],
            reason: 'They say what the note is about.',
        } );
        expect( made.exit ).toBe( 0 );
        expect( made.result.suggestions ).toHaveLength( 4 );
        const [ categories, tags, excerpt, titles ] = await stored( requestUtils, note );
        for ( const suggestion of [ categories, tags, excerpt, titles ] ) {
            expect( suggestion ).toMatchObject( { kind: 'details', label: 'Details', pass: made.result.pass, anchor: null, reason: 'They say what the note is about.' } );
        }
        expect( titles.change ).toEqual( { field: 'titles', value: [ 'Write badly first', 'The map from memory' ] } );
        expect( excerpt.change ).toEqual( { field: 'excerpt', value: 'Why a bad draft is the way in.' } );
        expect( tags.change ).toEqual( { field: 'tags', value: [ 'process', 'a tag nobody made' ] } );
        expect( categories.change ).toEqual( { field: 'categories', value: [ 'Craft' ] } );
        // As an agent reads them back.
        expect( ( await ability( 'note-get', { note } ) ).result.suggestions[ 3 ] ).toEqual( {
            id: titles.id,
            kind: 'details',
            status: 'open',
            pass: 'Details',
            path: null,
            quote: '',
            field: 'titles',
            value: [ 'Write badly first', 'The map from memory' ],
            reason: 'They say what the note is about.',
        } );

        const failures = await Promise.all( [
            ability( 'suggest-details', { note, titles: [ 'A title' ], categories: [ 'Craft', 'No such category' ] } ),
            ability( 'suggest-details', { note, reason: 'Nothing to say.' } ),
            ability( 'suggest-details', { note, titles: Array( 6 ).fill( 'A title' ) } ),
            ability( 'suggest-details', { note, tags: [] } ),
            ability( 'suggest-details', { note, slug: 'a-slug' } ),
        ] );
        expect( failures[ 0 ] ).toEqual( refused( 'not_found', 'Category No such category was not found.' ) );
        expect( failures[ 1 ] ).toEqual( refused( 'invalid_args', 'One of titles, excerpt, tags or categories is required.' ) );
        for ( const index of [ 2, 3, 4 ] ) {
            expect( failures[ index ].error?.code, String( index ) ).toBe( 'invalid_args' );
        }
        expect( await open( requestUtils, note ) ).toBe( 4 );
    } );

    test( 'comment leaves a remark on a passage, with no change', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'It was the year 1987, or the year 1988.' ] } );
        const made = await ability( 'comment', { note, path: [ 0 ], quote: 'the year', occurrence: 2, text: 'Which year was it?\nCheck the letters.' } );
        expect( made ).toEqual( { ok: true, exit: 0, result: { pass: expect.stringMatching( UUID ), suggestions: [ expect.any( Number ) ] } } );
        const [ remark ] = await stored( requestUtils, note );
        expect( remark ).toMatchObject( {
            id: made.result.suggestions[ 0 ],
            kind: 'comment',
            status: 'open',
            anchor: { path: [ 0 ], quote: 'the year', prefix: 'It was the year 1987, or ', suffix: ' 1988.' },
            change: [],
            reason: 'Which year was it?\nCheck the letters.',
        } );

        const failures = await Promise.all( [
            ability( 'comment', { note, path: [ 0 ], quote: 'the decade', text: 'Hm.' } ),
            ability( 'comment', { note, path: [ 0 ], quote: 'the year', text: 'Hm.' } ),
            ability( 'comment', { note, text: 'About nothing.' } ),
            ability( 'comment', { note, path: [ 0 ], quote: '1987' } ),
            ability( 'comment', { note, path: [ 0 ], quote: '1987', text: 'x'.repeat( 601 ) } ),
            ability( 'comment', { note, path: [ 0 ], quote: '1987', text: '' } ),
        ] );
        expect( failures[ 0 ] ).toEqual( refused( 'not_found', 'The quoted text was not found in block [0]. Read the note again.' ) );
        expect( failures[ 1 ] ).toEqual( refused( 'invalid_args', 'occurrence is required: the quoted text occurs 2 times in block [0].' ) );
        expect( failures[ 2 ] ).toEqual( refused( 'invalid_args', 'quote is required unless ask is given.' ) );
        for ( const index of [ 3, 4, 5 ] ) {
            expect( failures[ index ].error?.code, String( index ) ).toBe( 'invalid_args' );
        }
        expect( await open( requestUtils, note ) ).toBe( 1 );
    } );

    test( 'suggestions-withdraw takes back the caller’s own open suggestions', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ], author: users.wfw_author } );
        const other = await createNote( requestUtils, { author: users.wfw_author } );
        const { result: mine } = await ability( 'suggest-edits', { note, pass: 'Proofread', edits: [ { path: [ 0 ], quote: 'One', replacement: 'A' }, { path: [ 0 ], quote: 'Another', replacement: 'One more' } ] }, 'wfw_author' );
        const [ first, second ] = mine.suggestions;
        const theirs = await seedEdit( requestUtils, note, 'One sentence', 'A line' );
        const elsewhere = await seedEdit( requestUtils, other, 'One', 'A' );
        await call( requestUtils, 'wfw_suggestion_set_status', [ second, 'accepted' ] );
        const withdraw = ( suggestions: number[], user = 'wfw_author' ) => ability( 'suggestions-withdraw', { note, suggestions }, user );
        const status = async ( id: number ) => ( await call( requestUtils, 'wfw_suggestion_get', [ id ] ) ).result.status;

        // Someone else's, another note's, one that does not exist: nothing is withdrawn, not even one's own.
        const failures = await Promise.all( [
            withdraw( [ first, theirs ] ),
            withdraw( [ first, elsewhere ] ),
            withdraw( [ first, 987654 ] ),
            withdraw( [] ),
            ability( 'suggestions-withdraw', { note, ask: 1, suggestions: [ first ] }, 'wfw_author' ),
        ] );
        expect( failures[ 0 ] ).toEqual( refused( 'not_yours', `Suggestion ${ theirs } was made by someone else.` ) );
        expect( failures[ 1 ] ).toEqual( refused( 'not_found', `Suggestion ${ elsewhere } was not found.` ) );
        expect( failures[ 2 ] ).toEqual( refused( 'not_found', 'Suggestion 987654 was not found.' ) );
        expect( failures[ 3 ].error?.code ).toBe( 'invalid_args' );
        // It takes no `ask`.
        expect( failures[ 4 ].error?.code ).toBe( 'invalid_args' );
        expect( await status( first ) ).toBe( 'open' );

        // Only the open one is withdrawn; the accepted one stays accepted.
        expect( await withdraw( [ first, second ] ) ).toEqual( { ok: true, exit: 0, result: { withdrawn: [ first ] } } );
        expect( await status( first ) ).toBe( 'withdrawn' );
        expect( await status( second ) ).toBe( 'accepted' );
        expect( ( await withdraw( [ first ] ) ).result ).toEqual( { withdrawn: [] } );
        expect( ( await ability( 'suggestions-list', { note, status: 'withdrawn' }, 'wfw_author' ) ).result.suggestions.map( ( s: any ) => s.id ) ).toEqual( [ first ] );
    } );

    test( 'a note that is not the caller’s reads as one that does not exist', async ( { requestUtils } ) => {
        test.slow();
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ], author: users.wfw_author } );
        const suggestion = await seedEdit( requestUtils, note, 'One', 'A' );
        const trashed = await createNote( requestUtils );
        await requestUtils.rest( { method: 'DELETE', path: `/wp/v2/posts/${ trashed }` } );
        const page = ( await requestUtils.rest( { method: 'POST', path: '/wp/v2/pages', data: { title: 'A page', status: 'draft' } } ) ).id;

        const inputs: Record< string, object > = {
            'note-get': {},
            'suggestions-list': {},
            'suggest-edits': { pass: 'Proofread', edits: [ { path: [ 0 ], quote: 'Another', replacement: 'One more' } ] },
            'suggest-blocks': { pass: 'Cut', changes: [ { op: 'remove', block: 0 } ] },
            'suggest-details': { excerpt: 'An excerpt.' },
            comment: { path: [ 0 ], quote: 'Another', text: 'Why another?' },
            'suggestions-withdraw': { suggestions: [ suggestion ] },
        };
        // Every ability that names a note, as another Author, as a Subscriber and as nobody.
        for ( const user of [ 'wfw_author2', 'wfw_subscriber', null ] ) {
            const answers = await Promise.all( Object.entries( inputs ).map( ( [ name, input ] ) => ability( name, { note, ...input }, user ) ) );
            for ( const [ index, name ] of Object.keys( inputs ).entries() ) {
                expect( answers[ index ], `${ name } as ${ user }` ).toEqual( refused( 'not_found', `Note ${ note } was not found.` ) );
            }
        }
        // The same words for a note that does not exist, one in the Trash and a page, whoever asks.
        const answers = await Promise.all( [
            ability( 'note-get', { note: 987654 } ),
            ability( 'note-get', { note: 987654 }, 'wfw_subscriber' ),
            ability( 'note-get', { note: trashed } ),
            ability( 'suggest-details', { note: trashed, excerpt: 'x' } ),
            ability( 'note-get', { note: page } ),
            ability( 'comment', { note: page, path: [ 0 ], quote: 'x', text: 'x' } ),
        ] );
        for ( const [ index, id ] of [ 987654, 987654, trashed, trashed, page, page ].entries() ) {
            expect( answers[ index ], String( index ) ).toEqual( refused( 'not_found', `Note ${ id } was not found.` ) );
        }
        // An ability that names no note, called by someone who may not use Writer.
        const nameless = await Promise.all( [
            ability( 'guide', undefined, 'wfw_subscriber' ),
            ability( 'notes-list', {}, 'wfw_subscriber' ),
            ability( 'library-get', undefined, null ),
        ] );
        for ( const answer of nameless ) {
            expect( answer ).toEqual( refused( 'not_found', 'A user who may use Writer was not found.' ) );
        }

        expect( await open( requestUtils, note ) ).toBe( 1 );
        expect( ( await call( requestUtils, 'wfw_suggestion_get', [ suggestion ] ) ).result.status ).toBe( 'open' );
    } );

    test( 'no ability changes a note', async ( { requestUtils } ) => {
        test.slow();
        const craft = await term( requestUtils, 'categories', 'Craft' );
        const note = await createNote( requestUtils, { title: 'As the writer left it', paragraphs: [ 'One sentence. Another sentence.', 'A second paragraph.' ], status: 'publish' } );
        const ask = await createAsk( requestUtils, note );
        await requestUtils.rest( {
            method: 'POST',
            path: `/wp/v2/posts/${ note }`,
            data: { content: [ `<!-- wp:paragraph {"metadata":{"noteId":[${ ask }]}} -->\n<p>One sentence. Another sentence.</p>\n<!-- /wp:paragraph -->`, paragraph( 'A second paragraph.' ) ].join( '\n\n' ) },
        } );
        const snapshot = async () => {
            const post = await requestUtils.rest( { path: `/wp/v2/posts/${ note }`, params: { context: 'edit' } } );
            const revisions = await requestUtils.rest( { path: `/wp/v2/posts/${ note }/revisions`, params: { context: 'edit' } } );
            return {
                title: post.title.raw,
                content: post.content.raw,
                excerpt: post.excerpt.raw,
                status: post.status,
                date: post.date_gmt,
                modified: post.modified_gmt,
                author: post.author,
                slug: post.slug,
                categories: post.categories,
                tags: post.tags,
                revisions: revisions.length,
            };
        };
        // The site around it: every post by status, the note's lock, and the terms (a suggested tag is not made).
        const site = async () =>
            ( await php( `echo wp_json_encode( array( (array) wp_count_posts(), get_post_meta( ${ note }, '_edit_lock' ), wp_count_terms( array( 'taxonomy' => 'post_tag', 'hide_empty' => false ) ), wp_count_terms( array( 'taxonomy' => 'category', 'hide_empty' => false ) ) ) );` ) ).stdout;
        const before = await snapshot();
        const around = await site();
        expect( before.categories ).not.toContain( craft );

        const calls: [ string, object | undefined ][] = [
            [ 'guide', undefined ],
            [ 'notes-list', {} ],
            [ 'note-get', { note } ],
            [ 'library-get', undefined ],
            [ 'suggest-edits', { note, pass: 'Proofread', edits: [ { path: [ 0 ], quote: 'One sentence.', replacement: 'A sentence.' }, { path: [ 1 ], quote: 'second', replacement: '<strong>last</strong>' } ] } ],
            [ 'suggest-edits', { note, ask, pass: 'Answer', edits: [ { replacement: 'One sentence.' } ] } ],
            [ 'suggest-blocks', { note, pass: 'Restructure', changes: [ { op: 'insert', after: -1, markup: paragraph( 'An opening.' ) }, { op: 'remove', block: 1 }, { op: 'move', block: 1, after: -1 } ] } ],
            [ 'suggest-details', { note, titles: [ 'A better title' ], excerpt: 'An excerpt.', tags: [ 'a brand new tag' ], categories: [ 'Craft' ] } ],
            [ 'comment', { note, path: [ 1 ], quote: 'second', text: 'Is it the second?' } ],
            [ 'comment', { note, ask, text: 'Yes.' } ],
            [ 'suggestions-list', { note } ],
        ];
        const made: number[] = [];
        for ( const [ name, input ] of calls ) {
            const answer = await ability( name, input );
            expect( answer.ok, name + ' ' + JSON.stringify( answer.error ) ).toBe( true );
            made.push( ...( answer.result.suggestions ?? [] ).filter( Number.isInteger ) );
            expect( await snapshot(), name ).toEqual( before );
        }
        expect( made ).toHaveLength( 12 );
        expect( ( await ability( 'suggestions-withdraw', { note, suggestions: made } ) ).result.withdrawn ).toEqual( made );
        expect( await snapshot() ).toEqual( before );
        expect( await site() ).toBe( around );
        // Every suggestion waits beside the note, open as it was stored: none was accepted by an ability.
        expect( ( await stored( requestUtils, note ) ).map( ( s: any ) => s.status ) ).toEqual( Array( 12 ).fill( 'withdrawn' ) );
    } );

    test( 'a pass that would go past 200 open suggestions stores nothing', async ( { requestUtils } ) => {
        test.slow();
        const note = await createNote( requestUtils, { paragraphs: [ 'One sentence. Another sentence.' ] } );
        const many = ( n: number ) => Array.from( { length: n }, ( _, i ) => ( { kind: 'details' as const, change: { field: 'excerpt', value: `Excerpt ${ i }` } } ) );
        expect( ( await seedSuggestions( requestUtils, note, many( 199 ) ) ).result!.suggestions ).toHaveLength( 199 );

        const edits = [ { path: [ 0 ], quote: 'One', replacement: 'A' }, { path: [ 0 ], quote: 'Another', replacement: 'One more' } ];
        expect( await ability( 'suggest-edits', { note, pass: 'Proofread', edits } ) ).toEqual( refused( 'too_many', 'This note already has 199 open suggestions.' ) );
        expect( await open( requestUtils, note ) ).toBe( 199 );
        expect( ( await ability( 'suggest-edits', { note, pass: 'Proofread', edits: [ edits[ 0 ] ] } ) ).ok ).toBe( true );
        const full = await Promise.all( [
            ability( 'comment', { note, path: [ 0 ], quote: 'Another', text: 'One too many.' } ),
            ability( 'suggest-details', { note, excerpt: 'One too many.' } ),
            ability( 'suggest-blocks', { note, pass: 'Cut', changes: [ { op: 'remove', block: 0 } ] } ),
        ] );
        for ( const answer of full ) {
            expect( answer ).toEqual( refused( 'too_many', 'This note already has 200 open suggestions.' ) );
        }
        expect( await open( requestUtils, note ) ).toBe( 200 );
    } );

    test( 'every call records that a way in was used, a refused one too', async ( { requestUtils } ) => {
        const seen = async () => ( await call( requestUtils, 'wfw_agent_seen' ) ).result;
        const before = Math.floor( Date.now() / 1000 ) - 120;
        expect( await setAgentSeen( requestUtils, false ) ).toBe( 0 );
        // The ability itself, with no `wp writer` around it, called by nobody.
        const { stdout } = await php( `echo wp_get_ability( 'writer/note-get' )->execute( array( 'note' => 1 ) )->get_error_code();` );
        expect( stdout.trim() ).toBe( 'not_found' );
        expect( await seen() ).toBeGreaterThan( before );

        await setAgentSeen( requestUtils, false );
        await wp( [ 'eval', `wp_get_ability( 'writer/guide' )->execute();`, '--user=admin' ] );
        expect( await seen() ).toBeGreaterThan( before );
    } );
} );
