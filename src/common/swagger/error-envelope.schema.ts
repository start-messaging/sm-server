export function errorEnvelopeSchema(status: number, code: string) {
  return {
    type: 'object' as const,
    required: ['statusCode', 'error', 'meta'],
    properties: {
      statusCode: { type: 'integer', example: status },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', example: code },
          message: { type: 'string' },
          details: {},
        },
      },
      meta: {
        type: 'object',
        required: ['requestId', 'timestamp', 'path'],
        properties: {
          requestId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
        },
      },
    },
  };
}
