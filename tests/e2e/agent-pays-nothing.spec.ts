/**
 * A10 (spec/agent/surface.md, What a site pays): a site no agent has used pays
 * nothing. The editor page loads nothing of the surface and asks the server
 * nothing for it until a way in was used on the site or the note has a core
 * note; then the stub loads Review, once.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';
import {
    createAsk,
    createNote,
    openEditor,
    resetSite,
    seedEdit,
    setAgentSeen,
} from './agent-utils';

// Anything of the surface: Review's two files, the editor's routes, the test routes.
const SURFACE = /suggest\.(js|css)|wfw\/v1|wfw-test|wfw-suggest|wfw-agent/;

/**
 * Loads the editor for a note and reports what the page asked for and holds.
 */
async function load( page: Page, note: number ) {
    const requests: string[] = [];
    const listener = ( request: { url: () => string } ) =>
        requests.push( decodeURIComponent( request.url() ) );
    page.on( 'request', listener );
    await openEditor( page, note );
    // The editor never goes quiet (its heartbeat, its autosave), so give what loads on demand time to be asked for.
    await page.waitForTimeout( 3000 );
    page.off( 'request', listener );
    const held = await page.evaluate( () => ( {
        scripts: Array.from( document.scripts )
            .map( ( script ) => script.src )
            .filter( Boolean )
            .map( ( src ) => src.split( '?' )[ 0 ] ),
        styles: Array.from(
            document.querySelectorAll< HTMLLinkElement >(
                'link[rel="stylesheet"]'
            )
        ).map( ( link ) => link.href.split( '?' )[ 0 ] ),
        agent: ( window as any ).wfwEditor.agent,
        hook: typeof ( window as any ).wfwAgent,
    } ) );
    return { requests, ...held };
}

test.describe( 'A site no agent has used pays nothing', () => {
    let note: number;

    test.beforeEach( async ( { requestUtils } ) => {
        await resetSite( requestUtils );
        note = await createNote( requestUtils, {
            paragraphs: [ 'A first paragraph.', 'A second paragraph.' ],
        } );
    } );

    test( 'nothing of the surface is loaded or requested, then Review is, once', async ( {
        page,
        requestUtils,
    } ) => {
        const before = await load( page, note );

        // Not one request for the surface, no script or style of it, no hook, and a config that says why.
        expect( before.requests.filter( ( url ) => SURFACE.test( url ) ) ).toEqual( [] );
        expect( before.scripts.filter( ( url ) => SURFACE.test( url ) ) ).toEqual( [] );
        expect( before.styles.filter( ( url ) => SURFACE.test( url ) ) ).toEqual( [] );
        expect( before.hook ).toBe( 'undefined' );
        expect( Object.keys( before.agent ).sort() ).toEqual( [ 'notes', 'now', 'seen' ] );
        expect( before.agent.seen ).toBe( 0 );
        expect( before.agent.notes ).toBe( false );

        // An agent uses the site.
        const seen = await setAgentSeen( requestUtils, true );
        const after = await load( page, note );

        expect( after.agent.seen ).toBe( seen );
        expect( after.agent.notes ).toBe( false );
        expect( after.hook ).toBe( 'object' );

        // The page now holds exactly one script and one stylesheet more: Review's.
        const added = ( now: string[], then: string[] ) =>
            now.filter( ( url ) => ! then.includes( url ) );
        const scripts = added( after.scripts, before.scripts );
        const styles = added( after.styles, before.styles );
        expect( scripts ).toHaveLength( 1 );
        expect( scripts[ 0 ] ).toMatch( /\/assets\/suggest\.js$/ );
        expect( styles ).toHaveLength( 1 );
        expect( styles[ 0 ] ).toMatch( /\/assets\/suggest\.css$/ );
        expect( after.scripts.length ).toBe( before.scripts.length + 1 );
        expect( after.styles.length ).toBe( before.styles.length + 1 );

        // Each was asked for once, and the stub asked the server nothing else.
        const asked = after.requests.filter( ( url ) => SURFACE.test( url ) );
        expect( asked.filter( ( url ) => /suggest\.js/.test( url ) ) ).toHaveLength( 1 );
        expect( asked.filter( ( url ) => /suggest\.css/.test( url ) ) ).toHaveLength( 1 );
        expect( asked ).toHaveLength( 2 );
    } );

    test( 'a note with a core note loads Review on a site no agent has used', async ( {
        page,
        requestUtils,
    } ) => {
        await createAsk( requestUtils, note, 'Is this the right opening?' );
        const loaded = await load( page, note );

        expect( loaded.agent.seen ).toBe( 0 );
        expect( loaded.agent.notes ).toBe( true );
        expect( loaded.hook ).toBe( 'object' );
        expect( loaded.scripts.filter( ( url ) => /suggest\.js$/.test( url ) ) ).toHaveLength( 1 );
        expect( loaded.styles.filter( ( url ) => /suggest\.css$/.test( url ) ) ).toHaveLength( 1 );

        // Another note of the same site still pays nothing.
        const other = await createNote( requestUtils );
        const quiet = await load( page, other );
        expect( quiet.agent.notes ).toBe( false );
        expect( quiet.hook ).toBe( 'undefined' );
        expect( quiet.requests.filter( ( url ) => SURFACE.test( url ) ) ).toEqual( [] );
    } );

    test( 'the stub hands Review the editor, and renders what Review starts', async ( {
        page,
        requestUtils,
    } ) => {
        await setAgentSeen( requestUtils, true );
        await seedEdit( requestUtils, note, 'first', 'opening' );
        const canvas = await openEditor( page, note );
        await expect( canvas.locator( '.wfw-body' ) ).toContainText( 'A first paragraph.' );

        const hook = await page.evaluate( () => {
            const agent = ( window as any ).wfwAgent;
            const docs: boolean[] = [];
            const stop = agent.onCanvas( ( doc: Document | null ) => docs.push( !! doc ) );
            stop();
            return {
                keys: Object.keys( agent ).sort(),
                postId: agent.postId,
                config: Object.keys( agent.config ).sort(),
                canvasIsFrame:
                    agent.canvas.frame ===
                    document.querySelector( 'iframe[name="editor-canvas"]' ),
                canvasHasNote: !! agent.canvas.doc.querySelector( '.wfw-body' ),
                calledWithCanvas: docs,
            };
        } );
        expect( hook.keys ).toEqual( [
            'canvas',
            'config',
            'inApp',
            'onCanvas',
            'onMessage',
            'post',
            'postId',
            'start',
        ] );
        expect( hook.postId ).toBe( note );
        expect( hook.config ).toEqual( [
            'domain',
            'notes',
            'now',
            'script',
            'seen',
            'style',
            'translations',
        ] );
        expect( hook.canvasIsFrame ).toBe( true );
        expect( hook.canvasHasNote ).toBe( true );
        expect( hook.calledWithCanvas ).toEqual( [ true ] );

        // suggest.js is empty for now, so nothing of Review is on the page.
        await expect( page.locator( '[data-test-review]' ) ).toHaveCount( 0 );

        // What Review will do: start with a component, which the editor renders inside its own tree.
        await page.evaluate( () => {
            const { createElement, Fragment } = ( window as any ).wp.element;
            const { Fill } = ( window as any ).wp.components;
            const { useSelect } = ( window as any ).wp.data;
            ( window as any ).wfwAgent.start( function Review( { agent }: any ) {
                const title = useSelect(
                    ( select: any ) =>
                        select( 'core/editor' ).getEditedPostAttribute( 'title' ),
                    []
                );
                return createElement(
                    Fragment,
                    null,
                    createElement(
                        'div',
                        { 'data-test-review': agent.postId },
                        title
                    ),
                    createElement(
                        Fill,
                        { name: 'wfw-agent-actions' },
                        createElement( 'span', { 'data-test-chip': '1' }, 'chip' )
                    )
                );
            } );
        } );
        await expect( page.locator( `.wfw-ed > [data-test-review="${ note }"]` ) ).toHaveText( 'A note' );
        // The slot beside Save, before the saved state.
        await expect( page.locator( '.wfw-actions > [data-test-chip]:first-child' ) ).toHaveText( 'chip' );
    } );
} );
