// Fastify error handler enforcing the project's standard error envelope:
//   { code: string, message: string, details?: unknown }

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { WeChatError } from '@op-wechat/shared';

export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      request.log.error({ err: error }, 'request failed');

      if (error instanceof WeChatError) {
        return reply.status(400).send(error.toJSON());
      }

      if (error.validation) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.validation,
        });
      }

      const status = error.statusCode ?? 500;
      return reply.status(status).send({
        code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: error.message || 'An error occurred',
      });
    },
  );

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });
}
