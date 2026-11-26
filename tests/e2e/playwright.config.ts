import path from 'path';
import { defineConfig, devices } from '@playwright/test';

/*
 * The end-to-end suite, in Chromium against a wp-env site. The site is not
 * started here: run `npx wp-env start` first. Its address is WP_BASE_URL, by
 * default the port .wp-env.json gives; a worktree with a site of its own sets
 * both, for example:
 *
 *   WP_ENV_PORT=8910 WP_ENV_TESTS_PORT=8911 npx wp-env start
 *   WP_BASE_URL=http://localhost:8910 npm run test:e2e
 */
process.env.WP_BASE_URL ??= 'http://localhost:8890';
process.env.WP_ARTIFACTS_PATH ??= path.join( process.cwd(), 'artifacts' );
process.env.STORAGE_STATE_PATH ??= path.join(
    process.env.WP_ARTIFACTS_PATH,
    'storage-states/admin.json'
);

export default defineConfig( {
    reporter: process.env.CI ? [ [ 'github' ], [ 'list' ] ] : [ [ 'list' ] ],
    forbidOnly: !! process.env.CI,
    // One site, so one test at a time.
    workers: 1,
    retries: process.env.CI ? 2 : 0,
    timeout: 100_000,
    reportSlowTests: null,
    testDir: '.',
    testMatch: '*.spec.ts',
    outputDir: path.join( process.env.WP_ARTIFACTS_PATH, 'test-results' ),
    globalSetup: require.resolve( './global-setup.ts' ),
    use: {
        baseURL: new URL( process.env.WP_BASE_URL ).href,
        headless: true,
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
        locale: 'en-US',
        contextOptions: {
            reducedMotion: 'reduce',
            strictSelectors: true,
        },
        storageState: process.env.STORAGE_STATE_PATH,
        actionTimeout: 10_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices[ 'Desktop Chrome' ],
                viewport: { width: 1440, height: 900 },
            },
        },
    ],
} );
