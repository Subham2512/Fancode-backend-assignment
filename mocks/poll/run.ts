import { z } from 'zod';
import { buildPollMock } from './server';

const HOST = '127.0.0.1';
const portSchema = z.coerce.number().int().min(1).max(65535).default(4000);

async function main(): Promise<void> {
    const port = portSchema.safeParse(process.env.MOCK_PORT);
    if (!port.success) {
        throw new Error(`MOCK_PORT is not a valid port: "${process.env.MOCK_PORT}"`);
    }

    const app = buildPollMock();
    const url = await app.listen({ host: HOST, port: port.data });

    console.log(`poll mock listening at ${url}`);
    console.log(`move to the next step with: POST ${url}/control/advance`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});