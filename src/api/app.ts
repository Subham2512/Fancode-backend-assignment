import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from '../db/connection';
import { createRepository } from '../db/repository';
import { createIngest } from '../ingestion/ingest';
import { registerErrorHandling } from './errors';
import { registerMatchRoutes } from './routes/matches';
import { registerWebhookRoutes } from './routes/webhook';

type AppOptions = {
    db: Db; // opened, seeded and closed by the caller
    logger?: FastifyServerOptions['logger'];
};

export function buildApp({ db, logger = false }: AppOptions) {
    const app = Fastify({ logger });
    const repo = createRepository(db);
    const ingest = createIngest(db, repo, app.log);

    registerErrorHandling(app);
    registerWebhookRoutes(app, ingest);
    registerMatchRoutes(app, repo);

    // ingest is returned so the poller can share it
    return { app, ingest };
}