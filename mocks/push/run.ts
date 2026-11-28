import { z } from 'zod';
import { sendTimeline } from './sender';
import { timeline } from './timeline';

const DEFAULT_URL = 'http://127.0.0.1:3000/webhooks/provider-a';

async function main(): Promise<void> {
    const url = process.env.WEBHOOK_URL ?? DEFAULT_URL;

    if (!z.url({ protocol: /^https?$/ }).safeParse(url).success) {
        throw new Error(`WEBHOOK_URL is not a valid http(s) URL: "${url}"`);
    }

    console.log(`sending ${timeline.length} steps to ${url}`);
    await sendTimeline({ url, steps: timeline, log: console.log });
    console.log('all steps delivered');
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});