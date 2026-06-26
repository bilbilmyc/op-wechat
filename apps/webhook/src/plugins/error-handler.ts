import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // WeChat is sensitive to non-200 responses — log full error but return 200
      // with a body that signals an internal failure. Phase 3 narrows this to
      // only swallow errors after the message has been persisted.
      request.log.error({ err: error }, 'webhook request failed');
      return reply.status(200).send('success');
    },
  );
}
