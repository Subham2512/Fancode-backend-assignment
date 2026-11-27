import type { Db } from '../db/connection';
import type { Repository } from '../db/repository';
import type { ProviderUpdate } from '../domain/types';

export type Logger = {
    warn(details: object, message: string): void;
};

export type IngestResult = {
    duplicate: boolean;
    scoreApplied: boolean;
    ballsApplied: number;
};

export class UnknownMatchError extends Error {
    constructor(provider: string, providerMatchId: string) {
        super(`unknown match: ${provider} ${providerMatchId}`);
        this.name = 'UnknownMatchError';
    }
}

export type Ingest = (update: ProviderUpdate) => IngestResult;

export function createIngest(db: Db, repo: Repository, logger: Logger): Ingest {
    const apply = db.transaction((update: ProviderUpdate): IngestResult => {
        const { provider, providerMatchId, snapshot, balls } = update;

        const matchId = repo.findMatchId(provider, providerMatchId);
        if (!matchId) throw new UnknownMatchError(provider, providerMatchId);

        // Recorded in the same transaction as the data: both are saved, or neither
        if (update.deliveryId !== undefined) {
            const { deliveryId } = update;
            const delivery = repo.recordDelivery(provider, deliveryId, JSON.stringify(update));

            if (delivery !== 'new') {
                if (delivery === 'conflict') {
                    logger.warn({ provider, deliveryId }, 'deliveryId reused with different data; ignored');
                }
                return { duplicate: true, scoreApplied: false, ballsApplied: 0 };
            }
        }

        // Score and balls are checked separately: a stale score can carry a useful ball
        let scoreApplied = false;
        if (snapshot) {
            scoreApplied = repo.upsertScoreIfNewer(matchId, provider, snapshot);

            if (!scoreApplied && repo.hasScoreConflict(matchId, provider, snapshot)) {
                const { sequence, revision } = snapshot;
                logger.warn(
                    { provider, matchId, sequence, revision },
                    'same score version with different data; kept the saved score',
                );
            }
        }

        let ballsApplied = 0;
        for (const ball of balls) {
            if (repo.upsertBallIfNewer(matchId, provider, ball)) {
                ballsApplied++;
            } else if (repo.hasBallConflict(matchId, provider, ball)) {
                const { ballId, revision } = ball;
                logger.warn(
                    { provider, matchId, ballId, revision },
                    'same ball revision with different text; kept the saved text',
                );
            }
        }

        return { duplicate: false, scoreApplied, ballsApplied };
    });

    // IMMEDIATE takes the write lock at the start
    return (update) => apply.immediate(update);
}
