import { buildApp } from './api/app';
import { loadEnv } from './config/env';
import { matches } from './config/matches';
import { openDb } from './db/connection';
import { seedMatches } from './db/seed';
import { createPoller } from './ingestion/poller';

async function main(): Promise<void> {
    const env = loadEnv();

    const db = openDb(env.DB_PATH);
    seedMatches(db, matches);

    const { app, ingest } = buildApp({ db, logger: { level: env.LOG_LEVEL } });

    const pollers = matches.map((match) =>
        createPoller({
            baseUrl: env.PROVIDER_B_URL,
            providerMatchId: match.providerMatchIds['provider-b'],
            ingest,
            logger: app.log,
            intervalMs: env.POLL_INTERVAL_MS,
        }),
    );

    // Runs after the server has closed. Pollers stop before the database closes,
    // so neither requests nor polls are still using it.
    app.addHook('onClose', async () => {
        await Promise.all(pollers.map((poller) => poller.stop()));
        db.close();
    });

    let shuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
        if (shuttingDown) return;
        shuttingDown = true;
        app.log.info({ signal }, 'shutting down');

        try {
            await app.close();
        } catch (error) {
            app.log.error({ err: error }, 'shutdown failed');
            process.exitCode = 1;
        }
    }

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    try {
        await app.listen({ host: env.HOST, port: env.PORT });
    } catch (error) {
        await app.close();
        throw error;
    }

    // Shutdown may have been requested while the server was still starting
    if (!shuttingDown) {
        for (const poller of pollers) poller.start();
    }
}

main().catch((error: unknown) => {
    console.error('failed to start:', error);
    process.exitCode = 1;
});