// ABOUTME: Real-Chrome regressions for automatic overlay dismissal and verified click targeting.
// ABOUTME: Local synthetic pages record button events so unintended actions never affect an account.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserPage } from '../../src/core/page.js';
import { CdpConnection, type CdpSession } from '../../src/core/steel/cdp.js';
import { announceMissing, findChrome, HeadlessChrome, until } from '../helpers/headless-chrome.js';

const chromePath = findChrome();
announceMissing('action safety browser suite', chromePath ? [] : ['Google Chrome']);
let chrome: HeadlessChrome | undefined;
let connection: CdpConnection | undefined;
let session: CdpSession;
let page: BrowserPage;

beforeAll(async () => {
    if (!chromePath) return;
    chrome = await HeadlessChrome.launch(chromePath);
    connection = await CdpConnection.connect(chrome.debuggerUrl);
    session = await connection.attachToPage();
    page = await BrowserPage.attach(session, {
        budgets: { navigationWatchMs: 5, navigationMs: 100, mutationQuietMs: 5, mutationMaxMs: 100 },
    });
}, 150_000);

afterAll(async () => {
    await connection?.close();
    await chrome?.close();
});

async function load(body: string): Promise<void> {
    const html = `<html><head><style>button { position:absolute; left:100px; top:100px; width:180px; height:50px } [role=dialog] { position:fixed; inset:0; } #cover { z-index:100; }</style></head><body>${body}<script>window.actions=[];for(const b of document.querySelectorAll('button')) b.onclick=()=>window.actions.push(b.id);</script></body></html>`;
    await page.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await until(
        'fixture ready',
        async () =>
            (
                await session.send<{ result: { value: boolean } }>('Runtime.evaluate', {
                    expression: 'Array.isArray(window.actions)',
                    returnByValue: true,
                })
            ).result.value,
        Boolean
    );
}

async function actions(): Promise<string[]> {
    return (
        await session.send<{ result: { value: string[] } }>('Runtime.evaluate', {
            expression: 'window.actions',
            returnByValue: true,
        })
    ).result.value;
}

const CONSENT =
    '<div role="dialog" aria-label="Cookie consent"><p>Choose your cookie consent preferences.</p><button id="accept">Accept all cookies</button></div>';

describe.skipIf(!chromePath)('safe automatic dismissal', () => {
    it.each(['Continue to payment', 'Accept all cookies', 'Save'])(
        'does not click an ordinary %s control',
        async label => {
            await load(`<button id="ordinary">${label}</button>`);
            await page.act({ action: 'dismiss_overlays' });
            expect(await actions()).toEqual([]);
        }
    );

    it('dismisses a genuine consent dialog', async () => {
        await load(CONSENT);
        await page.act({ action: 'dismiss_overlays' });
        expect(await actions()).toEqual(['accept']);
    });

    it('refuses a covered consent button just like a normal click', async () => {
        await load(`${CONSENT}<button id="cover">Delete account</button>`);
        await expect(page.act({ action: 'dismiss_overlays' })).rejects.toMatchObject({ code: 'click_blocked' });
        expect(await actions()).toEqual([]);
        await expect(page.act({ action: 'click', target: '#accept' })).rejects.toMatchObject({ code: 'click_blocked' });
        expect(await actions()).toEqual([]);
    });
});
