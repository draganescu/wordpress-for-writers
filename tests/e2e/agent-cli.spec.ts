/**
 * `wp writer` (includes/abilities-cli.php): what each subcommand prints, its
 * exit code, and that each records a way in was used
 * (spec/agent/surface.md, `wp writer`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import { call, createNote, resetSite, restAs, setAgentSeen, wp } from './agent-utils';

test.describe( 'wp writer', () => {
    let users: Record< string, number >;
    const started = Math.floor( Date.now() / 1000 ) - 120;

    test.beforeEach( async ( { requestUtils } ) => {
        users = await resetSite( requestUtils );
    } );

    test( 'guide prints the guide as plain text, with the user’s style sheet', async ( { requestUtils } ) => {
        const spec = fs.readFileSync( path.join( process.cwd(), 'spec/agent/abilities.md' ), 'utf8' );
        const guide = spec.split( '```text\n' )[ 1 ].split( '\n```' )[ 0 ];
        const author = await restAs( 'wfw_author' );
        await author( 'POST', '/wp/v2/users/me', { meta: { wfw_style_sheet: 'No semicolons.\nBritish spelling.' } } );
        await author.dispose();

        expect( await setAgentSeen( requestUtils, false ) ).toBe( 0 );
        // Nobody need be named: the guide is the same for all.
        expect( await wp( [ 'writer', 'guide' ] ) ).toMatchObject( { stdout: guide + '\n', code: 0 } );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBeGreaterThan( started );
        expect( ( await wp( [ 'writer', 'guide', '--user=admin' ] ) ).stdout ).toBe( guide + '\n' );
        expect( await wp( [ 'writer', 'guide', '--user=wfw_author' ] ) ).toMatchObject( {
            stdout: guide + "\n\n# The writer's style sheet\n\nNo semicolons.\nBritish spelling.\n",
            code: 0,
        } );
    } );

    test( 'abilities prints the registry as one JSON document', async ( { requestUtils } ) => {
        expect( await setAgentSeen( requestUtils, false ) ).toBe( 0 );
        const ran = await wp( [ 'writer', 'abilities' ] );
        expect( ran.code ).toBe( 0 );
        expect( ran.stdout.trim().split( '\n' ) ).toHaveLength( 1 );
        const abilities = JSON.parse( ran.stdout );
        expect( abilities.map( ( a: any ) => a.name ) ).toEqual( [
            'writer/guide',
            'writer/notes-list',
            'writer/note-get',
            'writer/library-get',
            'writer/suggestions-list',
            'writer/suggest-edits',
            'writer/suggest-blocks',
            'writer/suggest-details',
            'writer/comment',
            'writer/suggestions-withdraw',
        ] );
        for ( const ability of abilities ) {
            expect( Object.keys( ability ), ability.name ).toEqual( [ 'name', 'description', 'input' ] );
            expect( ability.description.length, ability.name ).toBeGreaterThan( 20 );
        }
        const byName = Object.fromEntries( abilities.map( ( a: any ) => [ a.name, a.input ] ) );
        // No input is no schema.
        expect( byName[ 'writer/guide' ] ).toEqual( {} );
        expect( byName[ 'writer/library-get' ] ).toEqual( {} );
        expect( byName[ 'writer/note-get' ] ).toEqual( {
            type: 'object',
            properties: { note: { type: 'integer', description: 'The id of the note.' } },
            additionalProperties: false,
            required: [ 'note' ],
        } );
        expect( byName[ 'writer/suggest-edits' ].required ).toEqual( [ 'note', 'pass', 'edits' ] );
        expect( byName[ 'writer/suggest-edits' ].properties.edits ).toMatchObject( { minItems: 1, maxItems: 50, items: { required: [ 'replacement' ] } } );
        expect( byName[ 'writer/suggest-edits' ].properties.edits.items.properties.quote ).toMatchObject( { minLength: 1, maxLength: 2000 } );
        expect( byName[ 'writer/suggest-blocks' ].properties.changes ).toMatchObject( { minItems: 1, maxItems: 20 } );
        expect( byName[ 'writer/suggestions-withdraw' ].properties ).not.toHaveProperty( 'ask' );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBeGreaterThan( started );
    } );

    test( 'call runs one ability as the user given, and prints its result or its error', async ( { requestUtils } ) => {
        const note = await createNote( requestUtils, { title: 'Hers', paragraphs: [ 'One sentence — “quoted”, with $HOME and a\ttab.' ], author: users.wfw_author } );
        const input = '--input=' + JSON.stringify( { note } );

        // With or without the leading writer/.
        const [ short, long ] = await Promise.all( [
            wp( [ 'writer', 'call', 'note-get', input, '--user=wfw_author' ] ),
            wp( [ 'writer', 'call', 'writer/note-get', input, '--user=wfw_author' ] ),
        ] );
        expect( short.code ).toBe( 0 );
        expect( short.stdout.trim().split( '\n' ) ).toHaveLength( 1 );
        expect( long.stdout ).toBe( short.stdout );
        const answer = JSON.parse( short.stdout );
        expect( Object.keys( answer ) ).toEqual( [ 'ok', 'result' ] );
        expect( answer.ok ).toBe( true );
        expect( answer.result.note ).toMatchObject( { id: note, title: 'Hers' } );
        expect( answer.result.blocks[ 0 ].text ).toBe( 'One sentence — “quoted”, with $HOME and a\ttab.' );
        // The text as it is, for an agent to quote from.
        expect( short.stdout ).toContain( '— “quoted”' );

        const failed = async ( args: string[], code: string, message: string ) => {
            const ran = await wp( [ 'writer', 'call', ...args ] );
            expect( ran.code, args.join( ' ' ) ).toBe( 1 );
            expect( ran.stdout.trim().split( '\n' ), args.join( ' ' ) ).toHaveLength( 1 );
            expect( JSON.parse( ran.stdout ), args.join( ' ' ) ).toEqual( { ok: false, error: { code, message: `${ code }: ${ message }` } } );
        };
        expect( await setAgentSeen( requestUtils, false ) ).toBe( 0 );
        await Promise.all( [
            // Without --user it is a call by nobody.
            failed( [ 'note-get', input ], 'not_found', `Note ${ note } was not found.` ),
            failed( [ 'guide' ], 'not_found', 'A user who may use Writer was not found.' ),
            failed( [ 'note-get', input, '--user=wfw_author2' ], 'not_found', `Note ${ note } was not found.` ),
            failed( [ 'note-get', '--input={note:', '--user=wfw_author' ], 'invalid_args', 'input is not JSON.' ),
            failed( [ 'note-get', '--input=', '--user=wfw_author' ], 'invalid_args', 'input is not JSON.' ),
            failed( [ 'note-publish', input, '--user=wfw_author' ], 'not_found', 'Ability writer/note-publish was not found.' ),
            failed( [ 'core/get-site-info', '--user=admin' ], 'not_found', 'Ability writer/core/get-site-info was not found.' ),
        ] );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBeGreaterThan( started );

        // A refused call still marks the site: one that never reached an ability.
        await setAgentSeen( requestUtils, false );
        await failed( [ 'note-publish' ], 'not_found', 'Ability writer/note-publish was not found.' );
        expect( ( await call( requestUtils, 'wfw_agent_seen' ) ).result ).toBeGreaterThan( started );

        const schema = await wp( [ 'writer', 'call', 'note-get', '--user=wfw_author' ] );
        expect( schema.code ).toBe( 1 );
        expect( JSON.parse( schema.stdout ).error.code ).toBe( 'invalid_args' );
    } );
} );
