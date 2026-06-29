/**
 * Client-side logging utility
 *
 * Delegates the shared logging behaviour to `logger-core` and supplies the
 * client-side development probe. Debug logs are automatically disabled in
 * production builds.
 *
 * Usage:
 *   import { logger } from '@/lib/logger.client';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */

import { createLogger } from './logger-core';

const isDevelopment = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1' ||
   process.env.NODE_ENV === 'development');

export const logger = createLogger(isDevelopment);
