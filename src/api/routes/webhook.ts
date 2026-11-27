import type { FastifyInstance } from 'fastify';
import { fromPush } from '../../adapters/providers';
import { pushEventSchema } from '../../domain/schemas';
import type { Ingest } from '../../ingestion/ingest';

export function registerWebhookRoutes(app: FastifyInstance, ingest: Ingest): void {
    app.post('/webhooks/provider-a', async (request, reply) => {
        const parsed = pushEventSchema.safeParse(request.body);

        if (!parsed.success) {
            const issues = parsed.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            request.log.warn({ issues }, 'invalid webhook payload');
            return reply.code(400).send({ error: 'invalid payload', issues });
        }

        // A 200 means the transaction has committed. It is also sent for
        // duplicate and stale updates, because retrying them would change nothing.
        return ingest(fromPush(parsed.data));
    });
}