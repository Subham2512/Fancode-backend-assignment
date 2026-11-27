import { z } from 'zod';

const id = z.string().min(1);
const nonNegativeInt = z.int().nonnegative();
const positiveInt = z.int().positive();
const timestamp = z.iso.datetime({ offset: true });

export const matchStatusSchema = z.enum([
    'scheduled',
    'live',
    'innings_break',
    'completed',
    'abandoned',
]);

// The provider's full current scoreboard, not a delta
export const snapshotSchema = z.object({
    sequence: nonNegativeInt,
    revision: positiveInt,
    status: matchStatusSchema,
    innings: positiveInt,
    runs: nonNegativeInt,
    wickets: nonNegativeInt,
    overs: z.string(), // opaque: stored and returned unchanged
});

export const ballSchema = z.object({
    ballId: id,
    sequence: nonNegativeInt,
    revision: positiveInt,
    innings: positiveInt,
    over: nonNegativeInt,
    ball: nonNegativeInt,
    text: z.string(), // stored as given
});

// Provider A: webhook body
export const pushEventSchema = z
    .object({
        provider: z.literal('provider-a'),
        deliveryId: id,
        occurredAt: timestamp,
        providerMatchId: id,
        snapshot: snapshotSchema.optional(),
        commentary: ballSchema.optional(),
    })
    .refine((event) => event.snapshot || event.commentary, {
        error: 'event needs a snapshot or commentary',
    });

// Provider B: poll responses
const pollEnvelope = {
    provider: z.literal('provider-b'),
    providerMatchId: id,
};

export const scoreResponseSchema = z.object({
    ...pollEnvelope,
    snapshot: snapshotSchema,
});

export const commentaryResponseSchema = z.object({
    ...pollEnvelope,
    items: z.array(ballSchema),
});