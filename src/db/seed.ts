import type { MatchConfig } from '../config/matches';
import type { Db } from './connection';

// Safe to run on every startup
export function seedMatches(db: Db, configs: MatchConfig[]): void {
    const upsertMatch = db.prepare(`
    INSERT INTO matches (id, primary_provider)
    VALUES (?, ?)
    ON CONFLICT (id) DO UPDATE SET primary_provider = excluded.primary_provider
  `);

    const insertMapping = db.prepare(`
    INSERT INTO provider_matches (provider, provider_match_id, match_id)
    VALUES (?, ?, ?)
    ON CONFLICT (match_id, provider) DO NOTHING
  `);

    const findMappedId = db
        .prepare<[string, string], string>(
            `SELECT provider_match_id FROM provider_matches
       WHERE match_id = ? AND provider = ?`,
        )
        .pluck();

    const seed = db.transaction(() => {
        for (const match of configs) {
            upsertMatch.run(match.id, match.primaryProvider);

            for (const [provider, providerMatchId] of Object.entries(match.providerMatchIds)) {
                insertMapping.run(provider, providerMatchId, match.id);

                // Saved data belongs to the old mapping, so don't change it silently
                const savedId = findMappedId.get(match.id, provider);
                if (savedId !== providerMatchId) {
                    throw new Error(
                        `${provider} mapping for ${match.id} changed from ${savedId} to ${providerMatchId}`,
                    );
                }
            }
        }
    });

    seed.immediate();
}