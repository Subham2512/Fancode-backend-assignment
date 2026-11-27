import type { Ball, MatchStatus, ProviderName, Snapshot } from '../domain/types';
import type { Db } from './connection';

export type StoredScore = Omit<Snapshot, 'sequence' | 'revision'> & {
    scoreUpdatedAt: string;
};

export type StoredMatch = {
    id: string;
    score: StoredScore | null;
};

type MatchRow =
    | ({ id: string } & StoredScore)
    | { id: string; status: null };

export type DeliveryResult = 'new' | 'duplicate' | 'conflict';

export type Repository = ReturnType<typeof createRepository>;

export function createRepository(db: Db) {
    // Writes
    const findMapping = db
        .prepare<[string, string], string>(
            `SELECT match_id FROM provider_matches
       WHERE provider = ? AND provider_match_id = ?`,
        )
        .pluck();

    const insertDelivery = db.prepare(`
    INSERT INTO deliveries (provider, delivery_id, payload)
    VALUES (?, ?, ?)
    ON CONFLICT (provider, delivery_id) DO NOTHING
  `);

    const findDeliveryPayload = db
        .prepare<[string, string], string>(
            `SELECT payload FROM deliveries WHERE provider = ? AND delivery_id = ?`,
        )
        .pluck();

    // The version check is part of the write, so there is no gap between them
    const upsertScore = db.prepare(`
    INSERT INTO scores (
      match_id, provider, sequence, revision, status,
      innings, runs, wickets, overs, updated_at
    )
    VALUES (
      @matchId, @provider, @sequence, @revision, @status,
      @innings, @runs, @wickets, @overs, @updatedAt
    )
    ON CONFLICT (match_id, provider) DO UPDATE SET
      sequence   = excluded.sequence,
      revision   = excluded.revision,
      status     = excluded.status,
      innings    = excluded.innings,
      runs       = excluded.runs,
      wickets    = excluded.wickets,
      overs      = excluded.overs,
      updated_at = excluded.updated_at
    WHERE (excluded.sequence, excluded.revision) > (scores.sequence, scores.revision)
  `);

    // A correction replaces only the text and revision
    const upsertBall = db.prepare(`
    INSERT INTO balls (
      match_id, provider, ball_id, sequence, revision,
      innings, over_number, ball_number, text
    )
    VALUES (
      @matchId, @provider, @ballId, @sequence, @revision,
      @innings, @over, @ball, @text
    )
    ON CONFLICT (match_id, provider, ball_id) DO UPDATE SET
      revision = excluded.revision,
      text     = excluded.text
    WHERE excluded.revision > balls.revision
  `);

    // Same version but different content: the provider broke its own rules
    const findScoreConflict = db.prepare(`
    SELECT 1 FROM scores
    WHERE match_id = @matchId AND provider = @provider
      AND sequence = @sequence AND revision = @revision
      AND (status, innings, runs, wickets, overs)
          <> (@status, @innings, @runs, @wickets, @overs)
  `);

    const findBallConflict = db.prepare(`
    SELECT 1 FROM balls
    WHERE match_id = @matchId AND provider = @provider AND ball_id = @ballId
      AND revision = @revision AND text <> @text
  `);

    // Reads: only the primary provider's data
    const selectMatches = `
    SELECT m.id, s.status, s.innings, s.runs, s.wickets, s.overs,
           s.updated_at AS scoreUpdatedAt
    FROM matches m
    LEFT JOIN scores s
      ON s.match_id = m.id AND s.provider = m.primary_provider
  `;

    const selectAllMatches = db.prepare<[], MatchRow>(`${selectMatches} ORDER BY m.id`);
    const selectOneMatch = db.prepare<[string], MatchRow>(`${selectMatches} WHERE m.id = ?`);

    const selectCommentary = db.prepare<[string], Ball>(`
    SELECT b.ball_id AS ballId, b.sequence, b.revision, b.innings,
           b.over_number AS "over", b.ball_number AS ball, b.text
    FROM balls b
    JOIN matches m
      ON m.id = b.match_id AND m.primary_provider = b.provider
    WHERE m.id = ?
    ORDER BY b.sequence, b.ball_id
  `);

    function toStoredMatch(row: MatchRow): StoredMatch {
        if (row.status === null) return { id: row.id, score: null };
        const { id, ...score } = row;
        return { id, score };
    }

    return {
        findMatchId(provider: ProviderName, providerMatchId: string): string | undefined {
            return findMapping.get(provider, providerMatchId);
        },

        recordDelivery(provider: ProviderName, deliveryId: string, payload: string): DeliveryResult {
            if (insertDelivery.run(provider, deliveryId, payload).changes === 1) return 'new';
            return findDeliveryPayload.get(provider, deliveryId) === payload ? 'duplicate' : 'conflict';
        },

        /** Returns true if the snapshot was saved */
        upsertScoreIfNewer(matchId: string, provider: ProviderName, snapshot: Snapshot): boolean {
            const params = { ...snapshot, matchId, provider, updatedAt: new Date().toISOString() };
            return upsertScore.run(params).changes === 1;
        },

        /** Returns true if the ball was inserted or corrected */
        upsertBallIfNewer(matchId: string, provider: ProviderName, ball: Ball): boolean {
            return upsertBall.run({ ...ball, matchId, provider }).changes === 1;
        },

        hasScoreConflict(matchId: string, provider: ProviderName, snapshot: Snapshot): boolean {
            return findScoreConflict.get({ ...snapshot, matchId, provider }) !== undefined;
        },

        hasBallConflict(matchId: string, provider: ProviderName, ball: Ball): boolean {
            return findBallConflict.get({ ...ball, matchId, provider }) !== undefined;
        },

        listMatches(): StoredMatch[] {
            return selectAllMatches.all().map(toStoredMatch);
        },

        findMatch(matchId: string): StoredMatch | undefined {
            const row = selectOneMatch.get(matchId);
            return row && toStoredMatch(row);
        },

        listCommentary(matchId: string): Ball[] {
            return selectCommentary.all(matchId);
        },
    };
}