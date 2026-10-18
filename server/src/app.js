import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createLimiters } from './middleware/rateLimits.js';
import { createTokenService } from './services/tokenService.js';
import { createAuthService } from './services/authService.js';
import { createInterviewService } from './services/interviewService.js';
import { createDashboardService } from './services/dashboardService.js';
import { buildRoutes } from './routes/index.js';

/** Dependencies (db, ai client, logger) are injected so tests can swap in PGlite and a fake AI service. */
export function createApp({ config, db, ai, logger }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const tokenService = createTokenService(config);
  const authService = createAuthService({ db, config, tokens: tokenService });
  const interviewService = createInterviewService({ db, ai, tokens: tokenService, logger });
  const dashboardService = createDashboardService({ db });

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  const limiters = createLimiters(config);
  app.use('/api', buildRoutes({ config, db, ai, authService, interviewService, dashboardService, tokenService, limiters, logger }));
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
