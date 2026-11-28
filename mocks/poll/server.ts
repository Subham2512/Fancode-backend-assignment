import Fastify, { type FastifyReply } from 'fastify';
import { pollSteps, type PollStep } from './steps';

const MATCH_ID = 'b-match-1001';

type SuccessStep = Extract<PollStep, { score: unknown }>;
type MatchParams = { Params: { id: string } };

// Each call builds a new mock that starts at the first step
export function buildPollMock(steps: PollStep[] = pollSteps) {
    if (steps.length === 0) throw new Error('the poll mock needs at least one step');

    const app = Fastify();
    let index = 0;

    const currentStep = () => steps[index]!;
    const position = () => ({ step: index, name: currentStep().name, last: index === steps.length - 1 });

    function serve(matchId: string, reply: FastifyReply, pick: (step: SuccessStep) => object) {
        if (matchId !== MATCH_ID) return reply.code(404).send({ error: 'match not found' });

        const step = currentStep();
        if ('errorStatus' in step) {
            return reply.code(step.errorStatus).send({ error: 'temporarily unavailable' });
        }
        return pick(step);
    }

    // Reading never changes the step, so score and commentary stay in sync
    app.get<MatchParams>('/provider/matches/:id/score', async (request, reply) =>
        serve(request.params.id, reply, (step) => step.score),
    );

    app.get<MatchParams>('/provider/matches/:id/commentary', async (request, reply) =>
        serve(request.params.id, reply, (step) => step.commentary),
    );

    // Controls for demos and tests
    app.get('/control/step', async () => position());

    app.post('/control/advance', async () => {
        index = Math.min(index + 1, steps.length - 1);
        return position();
    });

    app.post('/control/reset', async () => {
        index = 0;
        return position();
    });

    return app;
}