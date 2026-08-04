import type Stripe from "stripe";

/**
 * Shared Stripe client options.
 *
 * Stripe's Node client defaults to no timeout, so a hung socket holds a request
 * (and one of only ten DB pool slots) or, in the worker's single-threaded poll
 * loop, stalls every queued job behind it. `maxNetworkRetries` covers the
 * transient failures that previously had no retry at all on this path.
 */
export const STRIPE_CLIENT_OPTIONS: Stripe.StripeConfig = {
  apiVersion: "2024-06-20",
  timeout: 15_000,
  maxNetworkRetries: 2,
};
