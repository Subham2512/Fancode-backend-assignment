import { setTimeout as sleep } from 'node:timers/promises';
import type { PushEvent } from '../../src/domain/types';
import type { TimelineStep } from './timeline';

type SendOptions = {
    url: string;
    steps: TimelineStep[];
    maxAttempts?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    log?: (message: string) => void;
};

export type SendResult = {
    deliveryId: string;
    status: number;
    body: string;
};

type Reply = { status: number; body: string } | { status: null; problem: string };

async function post(url: string, event: PushEvent, timeoutMs: number): Promise<Reply> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(timeoutMs),
        });
        return { status: response.status, body: await response.text() };
    } catch (error) {
        // No usable reply: the app may or may not have saved the update
        return { status: null, problem: error instanceof Error ? error.message : String(error) };
    }
}

// Sends one step at a time, so the arrival order is always the timeline order.
// It stops at the first step that cannot be delivered.
export async function sendTimeline({
    url,
    steps,
    maxAttempts = 3,
    retryDelayMs = 1000,
    timeoutMs = 5000,
    log = () => { },
}: SendOptions): Promise<SendResult[]> {
    // A retry sends the same event, with the same deliveryId
    async function deliver({ name, event }: TimelineStep): Promise<SendResult> {
        const { deliveryId } = event;

        for (let attempt = 1; ; attempt++) {
            const reply = await post(url, event, timeoutMs);
            const outcome = reply.status === null ? reply.problem : `${reply.status} ${reply.body}`;
            log(`${deliveryId} (${name}), attempt ${attempt}: ${outcome}`);

            if (reply.status !== null) {
                if (reply.status >= 200 && reply.status < 300) {
                    return { deliveryId, status: reply.status, body: reply.body };
                }
                // Only server errors are retried; other statuses would fail again
                if (reply.status < 500) {
                    throw new Error(`${deliveryId} rejected with HTTP ${reply.status}`);
                }
            }

            if (attempt >= maxAttempts) {
                throw new Error(`${deliveryId} failed after ${maxAttempts} attempts`);
            }
            await sleep(retryDelayMs);
        }
    }

    const results: SendResult[] = [];
    for (const step of steps) {
        results.push(await deliver(step));
    }
    return results;
}