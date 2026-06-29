/**
 * Server-side logging utility
 *
 * Delegates the shared logging behaviour to `logger-core` and supplies the
 * server-side development probe.
 *
 * Usage:
 *   import { logger } from '@/lib/logger.server';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */

import { createLogger } from './logger-core';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = createLogger(isDevelopment);
