import type { LogLine, RouteCtx } from './routes/types';

export type ErrorHandlerOptions = {
  logLine: LogLine;
  showStackTrace?: boolean;
};

export const createErrorHandler = (options: ErrorHandlerOptions) => {
  const { logLine, showStackTrace = false } = options;

  const handleError = async (error: unknown, ctx?: RouteCtx) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await logLine('ERROR', `Unhandled error: ${errorMessage}`);

    if (showStackTrace && errorStack) {
      await logLine('ERROR', `Stack trace: ${errorStack}`);
    }

    if (ctx) {
      ctx.status = 500;
      ctx.body = {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? errorMessage : 'An error occurred',
      };
    }
  };

  const createErrorMiddleware = () => {
    return async (ctx: RouteCtx, next: () => Promise<unknown>) => {
      try {
        await next();
      } catch (error) {
        await handleError(error, ctx);
      }
    };
  };

  return { handleError, createErrorMiddleware };
};
