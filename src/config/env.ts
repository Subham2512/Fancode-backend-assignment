import { z } from 'zod';

const envSchema = z.object({
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DB_PATH: z.string().min(1).default('matches.db'),
    PROVIDER_B_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:4000'),
    // The minimum guards against a typo that would flood the provider
    POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(2000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
    const parsed = envSchema.safeParse(source);

    if (!parsed.success) {
        throw new Error(`Invalid environment settings:\n${z.prettifyError(parsed.error)}`);
    }

    return parsed.data;
}