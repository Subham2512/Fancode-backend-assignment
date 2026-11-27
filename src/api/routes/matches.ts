import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Repository, StoredMatch } from '../../db/repository';

type MatchParams = { Params: { id: string } };

function matchNotFound(reply: FastifyReply) {
    return reply.code(404).send({ error: 'match not found' });
}

// status is null until the primary provider has sent a score
function toMatchSummary({ id, score }: StoredMatch) {
    return {
        id,
        status: score?.status ?? null,
        score: score ? { runs: score.runs, wickets: score.wickets, overs: score.overs } : null,
    };
}

function toMatchDetail({ id, score }: StoredMatch) {
    return { id, status: score?.status ?? null, score };
}

export function registerMatchRoutes(app: FastifyInstance, repo: Repository): void {
    app.get('/matches', async () => {
        return { matches: repo.listMatches().map(toMatchSummary) };
    });

    app.get<MatchParams>('/matches/:id', async (request, reply) => {
        const match = repo.findMatch(request.params.id);
        if (!match) return matchNotFound(reply);

        return toMatchDetail(match);
    });

    app.get<MatchParams>('/matches/:id/score', async (request, reply) => {
        const match = repo.findMatch(request.params.id);
        if (!match) return matchNotFound(reply);

        return { matchId: match.id, score: match.score };
    });

    app.get<MatchParams>('/matches/:id/commentary', async (request, reply) => {
        const match = repo.findMatch(request.params.id);
        if (!match) return matchNotFound(reply);

        return { matchId: match.id, items: repo.listCommentary(match.id) };
    });
}