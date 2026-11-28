import { buildApp } from './api/app';
import { loadEnv } from './config/env';
import { matches } from './config/matches';
import { openDb } from './db/connection';
import { seedMatches } from './db/seed';

async function main(): Promise<void> {
    const env = loadEnv();

    const db = openDb(env.DB_PATH);
    seedMatches(db, matches);

    const { app } = buildApp({ db, logger: { level: env.LOG_LEVEL } });

    // Runs after the server has closed, so no request is still using the database
    app.addHook('onClose', async () => {
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
}

main().catch((error: unknown) => {
    console.error('failed to start:', error);
    process.exitCode = 1;
});