import type { z } from 'zod';
import type {
    ballSchema,
    commentaryResponseSchema,
    matchStatusSchema,
    pushEventSchema,
    scoreResponseSchema,
    snapshotSchema,
} from './schemas';

export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Ball = z.infer<typeof ballSchema>;

export type PushEvent = z.infer<typeof pushEventSchema>;
export type ScoreResponse = z.infer<typeof scoreResponseSchema>;
export type CommentaryResponse = z.infer<typeof commentaryResponseSchema>;

export type ProviderName = PushEvent['provider'] | ScoreResponse['provider'];

type UpdateData = {
    providerMatchId: string;
    snapshot?: Snapshot;
    balls: Ball[];
};

// The common shape that ingestion works with.
// Push updates must have a deliveryId; poll updates have none.
export type ProviderUpdate = UpdateData &
    (
        | { provider: PushEvent['provider']; deliveryId: string }
        | { provider: ScoreResponse['provider']; deliveryId?: never }
    );