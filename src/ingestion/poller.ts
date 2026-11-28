import type { z } from 'zod';
import { fromCommentary, fromScore } from '../adapters/providers';
import { commentaryResponseSchema, scoreResponseSchema } from '../domain/schemas';
import type { ProviderUpdate } from '../domain/types';
import type { Ingest, Logger } from './ingest';

type PollerOptions = {
    baseUrl: string;
    providerMatchId: string;
    ingest: Ingest;
    logger: Logger;
    intervalMs?: number;
    timeoutMs?: number;
};

// true means the response was fetched, validated and processed
export type PollResult = {
    score: boolean;
    commentary: boolean;
};

export function createPoller({
    baseUrl,
    providerMatchId,
    ingest,
    logger,
    intervalMs = 2000,
    timeoutMs = 3000,
}: PollerOptions) {
    const matchUrl = `${baseUrl.replace(/\/+$/, '')}/provider/matches/${encodeURIComponent(providerMatchId)}`;

    let stopController = new AbortController();
    let running = false;
    let timer: NodeJS.Timeout | undefined;
    let activePoll: Promise<unknown> = Promise.resolve();

    async function pollEndpoint<T extends { providerMatchId: string }>(
        endpoint: 'score' | 'commentary',
        schema: z.ZodType<T>,
        toUpdate: (response: T) => ProviderUpdate,
    ): Promise<boolean> {
        const { signal: stopSignal } = stopController;

        try {
            const response = await fetch(`${matchUrl}/${endpoint}`, {
                signal: AbortSignal.any([stopSignal, AbortSignal.timeout(timeoutMs)]),
            });

            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`HTTP ${response.status}`);
            }

            const data = schema.parse(await response.json());

            if (data.providerMatchId !== providerMatchId) {
                throw new Error(`response is for another match: ${data.providerMatchId}`);
            }

            // Nothing may be saved after stop(), because the database is about to close
            if (stopSignal.aborted) return false;

            ingest(toUpdate(data));
            return true;
        } catch (error) {
            // A failed poll writes nothing, so the last good data stays
            if (!stopSignal.aborted) {
                logger.warn({ err: error, endpoint, providerMatchId }, 'poll failed');
            }
            return false;
        }
    }

    // The two requests are independent: one can fail while the other is saved
    async function pollOnce(): Promise<PollResult> {
        const [score, commentary] = await Promise.all([
            pollEndpoint('score', scoreResponseSchema, fromScore),
            pollEndpoint('commentary', commentaryResponseSchema, fromCommentary),
        ]);
        return { score, commentary };
    }

    // The next poll is scheduled after this one ends, so polls never overlap
    async function loop(signal: AbortSignal): Promise<void> {
        await pollOnce();
        if (!signal.aborted) {
            timer = setTimeout(() => {
                activePoll = loop(signal);
            }, intervalMs);
        }
    }

    function start(): void {
        if (running) return;
        running = true;
        stopController = new AbortController();
        activePoll = loop(stopController.signal);
    }

    // Cancels requests in progress and waits for the current poll to finish
    async function stop(): Promise<void> {
        running = false;
        stopController.abort();
        clearTimeout(timer);
        await activePoll;
    }

    return { pollOnce, start, stop };
}