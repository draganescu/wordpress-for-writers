/**
 * What the agent surface's tests share (tests/e2e/agent-*.spec.ts). The site
 * is reached three ways: the admin's REST session (`requestUtils`, a fixture
 * of @wordpress/e2e-test-utils-playwright), any user's REST session
 * (`restAs`), and WP-CLI in the container of wp-env's tests site (`wp`, `php`). The routes
 * under wfw-test/v1 are the test plugin's (tests/e2e/plugin).
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { request, type Page, type FrameLocator } from '@playwright/test';
import type { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

export type Ran = { stdout: string; stderr: string; code: number };

export type Place = { path: number[]; quote?: string; occurrence?: number };

export type Seed = {
    kind: 'edit' | 'blocks' | 'details' | 'comment';
    // Where it goes: a quoted passage, or a path alone for a whole block.
    place?: Place;
    // Or an anchor made by hand, stored as given.
    anchor?: object | null;
    change?: object;
    reason?: string;
};

export type Answer< T = any > = {
    result?: T;
    error?: { code: string; message: string; data?: any };
};

/**
 * Runs a WP-CLI command in this checkout's wp-env, on the tests site
 * (`wp-env run tests-cli wp …`).
 * Slow (a container exec each time): prefer `call` where a function will do.
 *
 * @param args The arguments after `wp`.
 */
export function wp( args: string[] ): Promise< Ran > {
    return new Promise( ( resolve ) => {
        execFile(
            path.join( process.cwd(), 'node_modules/.bin/wp-env' ),
            [ 'run', 'tests-cli', '--', 'wp', ...args ],
            { maxBuffer: 16 * 1024 * 1024 },
            ( error, stdout, stderr ) =>
                resolve( {
                    stdout,
                    stderr,
                    code: error ? Number( ( error as any ).code ) || 1 : 0,
                } )
        );
    } );
}

/**
 * Runs PHP in the test site, under WP-CLI.
 *
 * @param code The code, without the opening tag.
 */
export const php = ( code: string ) => wp( [ 'eval', code ] );

/**
 * Calls one of the plugin's PHP functions (any whose name starts with `wfw_`)
 * in a web request and gives back `{ result }`, or `{ error }` for a WP_Error.
 *
 * @param requestUtils The admin's REST session.
 * @param fn           The function's name.
 * @param args         Its arguments. A WP_Post cannot be sent: see `readNote`.
 * @param as           The user to run it as (an id or a login); the admin by default.
 */
export const call = < T = any >(
    requestUtils: RequestUtils,
    fn: string,
    args: any[] = [],
    as?: number | string
): Promise< Answer< T > > =>
    requestUtils.rest( {
        method: 'POST',
        path: '/wfw-test/v1/call',
        data: as === undefined ? { fn, args } : { fn, args, as },
    } );

/**
 * Empties the site of what tests make (every post with its core notes, the
 * `wfw_agent_seen` option, the style sheets) and makes sure the test users
 * exist: wfw_author, wfw_author2 (Authors) and wfw_subscriber, each with the
 * password "password".
 *
 * @param requestUtils The admin's REST session.
 * @return The users' ids by login.
 */
export async function resetSite(
    requestUtils: RequestUtils
): Promise< Record< string, number > > {
    const { users } = await requestUtils.rest( {
        method: 'POST',
        path: '/wfw-test/v1/reset',
    } );
    return users;
}

/**
 * Marks the site as one an agent has used, or has not: sets `wfw_agent_seen`
 * to now (true) or to a Unix time, or removes it (false).
 *
 * @param requestUtils The admin's REST session.
 * @param seen         What to set.
 * @return The option as it is now, 0 when absent.
 */
export async function setAgentSeen(
    requestUtils: RequestUtils,
    seen: boolean | number
): Promise< number > {
    const answer = await requestUtils.rest( {
        method: 'POST',
        path: '/wfw-test/v1/seen',
        data: { seen },
    } );
    return answer.seen;
}

/**
 * Makes a note (a post) through core's REST route.
 *
 * @param requestUtils The admin's REST session.
 * @param note         Its fields. `content` is block markup; `paragraphs` makes
 *                     one paragraph block per string instead. A draft by default.
 * @return The note's id.
 */
export async function createNote(
    requestUtils: RequestUtils,
    note: {
        title?: string;
        content?: string;
        paragraphs?: string[];
        status?: string;
        author?: number;
    } = {}
): Promise< number > {
    const { paragraphs, ...fields } = note;
    const post = await requestUtils.rest( {
        method: 'POST',
        path: '/wp/v2/posts',
        data: {
            title: 'A note',
            status: 'draft',
            ...fields,
            content:
                note.content ??
                ( paragraphs ?? [ 'One sentence. Another sentence.' ] )
                    .map( paragraph )
                    .join( '\n\n' ),
        },
    } );
    return post.id;
}

// The paragraph the editor's tests open with.
export const FIRST = 'I stopped rereading anything until I reached the end.';

/**
 * The note's content as the editor has it now, saved or not.
 *
 * @param page The editor's page.
 */
export const content = ( page: Page ) =>
    page.evaluate( () => ( window as any ).wp.data.select( 'core/editor' ).getEditedPostContent() as string );

// Puts the caret (or a selection) in the nth paragraph of the canvas, by offsets in its text.
export const select = ( page: Page, index: number, start: number, end = start ) =>
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

/**
 * A paragraph block's markup.
 *
 * @param html Its rich text.
 */
export const paragraph = ( html: string ) =>
    `<!-- wp:paragraph -->\n<p>${ html }</p>\n<!-- /wp:paragraph -->`;

/**
 * Stores one pass of suggestions on a note through the store's own functions
 * (wfw_suggestion_locate(), wfw_anchor_at() and wfw_suggestions_create()), as an
 * ability would.
 *
 * @param requestUtils The admin's REST session.
 * @param note         The note's id.
 * @param suggestions  The suggestions.
 * @param pass         The pass: its label ("Proofread" by default), the ask it
 *                     answers, and the user to run as.
 * @return `{ result: { pass, suggestions: ids } }`, or `{ error }`.
 */
export const seedSuggestions = (
    requestUtils: RequestUtils,
    note: number,
    suggestions: Seed[],
    pass: {
        label?: string;
        ask?: number;
        as?: number | string;
    } = {}
): Promise< Answer< { pass: string; suggestions: number[] } > > => {
    const { as, ...rest } = pass;
    return requestUtils.rest( {
        method: 'POST',
        path: '/wfw-test/v1/seed',
        data: {
            note,
            pass: { label: 'Proofread', ...rest },
            suggestions,
            ...( as === undefined ? {} : { as } ),
        },
    } );
};

/**
 * Stores one text edit on a note and gives back its id.
 *
 * @param requestUtils The admin's REST session.
 * @param note         The note's id.
 * @param quote        The passage, in the block at `path`.
 * @param replacement  What replaces it.
 * @param path         The block; the first by default.
 */
export async function seedEdit(
    requestUtils: RequestUtils,
    note: number,
    quote: string,
    replacement: string,
    path: number[] = [ 0 ]
): Promise< number > {
    const answer = await seedSuggestions( requestUtils, note, [
        {
            kind: 'edit',
            place: { path, quote },
            change: { replacement },
            reason: 'Reads better.',
        },
    ] );
    if ( ! answer.result ) {
        throw new Error( answer.error?.message ?? 'The edit was not stored.' );
    }
    return answer.result.suggestions[ 0 ];
}

/**
 * Leaves an ask on a note as core's editor does: an open core note (status
 * `hold`) through core's REST route. It writes nothing in the note's content;
 * `askMarker` and `askBlockAttribute` give what the editor would write there.
 *
 * @param requestUtils The admin's REST session.
 * @param note         The note's id.
 * @param text         The question.
 * @param parent       The core note it replies to, for a reply.
 * @return The core note's id.
 */
export async function createAsk(
    requestUtils: RequestUtils,
    note: number,
    text = 'Is this clear?',
    parent = 0
): Promise< number > {
    const comment = await requestUtils.rest( {
        method: 'POST',
        path: '/wp/v2/comments',
        data: { post: note, type: 'note', status: 'hold', content: text, parent },
    } );
    return comment.id;
}

/**
 * Core's marker of an inline core note around a passage.
 *
 * @param id   The core note's id.
 * @param text The passage.
 */
export const askMarker = ( id: number, text: string ) =>
    `<mark data-id="${ id }" class="wp-note">${ text }</mark>`;

/**
 * The note as an agent reads it: `{ from, title, excerpt, content, modified, blocks }`.
 *
 * @param requestUtils The admin's REST session.
 * @param note         The note's id.
 */
export async function readNote( requestUtils: RequestUtils, note: number ) {
    const { result } = await call( requestUtils, 'wfw_test_read', [ note ] );
    return result;
}

/**
 * A REST session of one user, signed in with the password "password". The
 * function it gives sends one request and answers with the status and the
 * body, whatever the status.
 *
 * @param login The user's login: admin, wfw_author, wfw_author2, wfw_subscriber.
 *              Null for a visitor who is not signed in.
 */
export async function restAs( login: string | null ) {
    const baseURL = process.env.WP_BASE_URL!;
    const context = await request.newContext( {
        baseURL,
        storageState: { cookies: [], origins: [] },
    } );
    let nonce = '';
    if ( login ) {
        await context.post( '/wp-login.php', {
            form: { log: login, pwd: 'password' },
        } );
        nonce = await (
            await context.get( '/wp-admin/admin-ajax.php?action=rest-nonce' )
        ).text();
    }
    const send = async (
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        route: string,
        data?: object
    ): Promise< { status: number; body: any } > => {
        const [ pathname, query ] = route.split( '?' );
        const response = await context.fetch(
            `/index.php?rest_route=${ encodeURIComponent( pathname ) }${
                query ? '&' + query : ''
            }`,
            {
                method,
                headers: nonce ? { 'X-WP-Nonce': nonce } : {},
                data,
            }
        );
        let body: any = null;
        try {
            body = await response.json();
        } catch ( e ) {}
        return { status: response.status(), body };
    };
    send.dispose = () => context.dispose();
    return send;
}

/**
 * Opens the Writer editor for a note, on its own page (outside the app's
 * frame), and waits until the canvas shows the note.
 *
 * @param page The page.
 * @param note The note's id.
 * @return The canvas iframe, for locators inside the note.
 */
export async function openEditor(
    page: Page,
    note: number
): Promise< FrameLocator > {
    await page.goto( `/wp-admin/admin.php?page=wfw-editor&post=${ note }` );
    await page.locator( '.wfw-ed' ).waitFor();
    const canvas = page.frameLocator( 'iframe[name="editor-canvas"]' );
    await canvas.locator( '.wfw-column' ).waitFor();
    return canvas;
}

/**
 * Opens the app (the three panes), where a note's editor is a frame.
 *
 * @param page The page.
 */
export async function openApp( page: Page ) {
    await page.goto( '/wp-admin/admin.php?page=wfw' );
    await page.locator( '#wfw-app' ).waitFor();
}
