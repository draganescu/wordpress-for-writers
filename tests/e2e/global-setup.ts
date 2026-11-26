import { request, type FullConfig } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

// Signs the admin in once and keeps the session for every test.
export default async function globalSetup( config: FullConfig ) {
    const { storageState, baseURL } = config.projects[ 0 ].use;
    const requestContext = await request.newContext( { baseURL } );
    const requestUtils = new RequestUtils( requestContext, {
        storageStatePath:
            typeof storageState === 'string' ? storageState : undefined,
    } );
    await requestUtils.setupRest();
    await requestContext.dispose();
}
