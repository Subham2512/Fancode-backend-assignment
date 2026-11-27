import type { FastifyError, FastifyInstance } from 'fastify';
import { UnknownMatchError } from '../ingestion/ingest';

export function registerErrorHandling(app: FastifyInstance): void {
    app.setErrorHandler<FastifyError>((error, request, reply) => {
        if (error instanceof UnknownMatchError) {
            request.log.warn({ err: error }, 'unknown match');
            return reply.code(422).send({ error: error.message });
        }

        // Fastify's own client errors, such as broken JSON or a body that is too large
        const status = error.statusCode;
        if (error.code?.startsWith('FST_') && status && status >= 400 && status < 500) {
            request.log.warn({ err: error }, 'request rejected');
            return reply.code(status).send({ error: error.message });
        }

        // Anything else: log the details, but don't send them to the client
        request.log.error({ err: error }, 'request failed');
        return reply.code(500).send({ error: 'internal server error' });
    });

    app.setNotFoundHandler((_request, reply) => {
        return reply.code(404).send({ error: 'route not found' });
    });
}