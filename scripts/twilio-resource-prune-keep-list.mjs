/* eslint-env node */
/**
 * Resources the Twilio prune tools must never touch.
 *
 * A frozen, checked-in list, in the same spirit as scripts/cull-keep-list.mjs.
 * The owner check in scripts/lib/twilio-resource-prune-policy.mjs resolves a
 * resource to a workspace by reading a database. That is the primary check,
 * and it is what holds a workspace that the report is connected to. This list
 * is the backstop for the resources that must be held even when that database
 * is not the one that owns them, or is not reachable at all.
 *
 * ## Why the Chester Hill Solutions entries are here
 *
 * #1320: sai flagged the number on the Stripe receipts and the official docs
 * as the business line, and it is being moved into the Chester Hill Solutions
 * workspace. It is the one number that must not be released by accident, and
 * the number is being moved at the same time, so the tool has to hold both
 * the old and the new location.
 *
 * The workspace is matched by id, by the 8 character owner hint its resources
 * carry, and by the resource SIDs themselves. The name is matched too, because
 * some resources were named after the workspace without carrying its hint,
 * and a name that matches a live workspace is a live owner.
 *
 * Remove an entry only when the resource is deliberately released. A stale
 * entry only costs a little money; a missing one costs the business line.
 */

export const TWILIO_PRUNE_KEEP = {
  /**
   * Workspace ids whose resources are never prunable. Matched against the
   * first 8 characters, the hint that workspace resources carry in their name.
   */
  workspaceIds: [
    // Chester Hill Solutions — the business line workspace from #1320.
    "c916b473-17b1-4c5d-86d5-df8e4326a4b6",
  ],

  /**
   * Phone numbers that are never prunable, in E.164.
   *
   * The business line reaches the customer on more than one number, and
   * which one the Stripe receipts and the public docs show is not recorded
   * anywhere the tool can read. The Stripe account carries no phone at all,
   * so the receipts take it from the workspace. All four numbers on the
   * Chester Hill Solutions workspace are therefore held.
   */
  phoneNumbers: [
    "+16478657844",
    "+19058088017",
    "+12894600186",
    "+14313409877",
  ],

  /**
   * Resource SIDs that are never prunable.
   */
  sids: [
    // Chester Hill Solutions / +12894600186 — the rented number.
    "PN3bae1811976a91002ccc4600ec68a450",
    // Chester Hill Solutions / +14313409877 — a number whose friendly name
    // carries no owner hint, so the database check cannot resolve it alone.
    "PN0f56c811eee5ce5987476c01c3319274",
  ],

  /**
   * Friendly names that name a live workspace. A resource named after a live
   * workspace has a live owner even when it carries no owner hint.
   */
  names: [
    "Chester Hill Solutions",
  ],
};

/** The owner hints of the protected workspace ids. */
export const TWILIO_PRUNE_KEEP_OWNER_PREFIXES = new Set(
  TWILIO_PRUNE_KEEP.workspaceIds.map((id) => id.slice(0, 8).toLowerCase()),
);

export const TWILIO_PRUNE_KEEP_SIDS = new Set(TWILIO_PRUNE_KEEP.sids.map((sid) => sid.toLowerCase()));

export const TWILIO_PRUNE_KEEP_NAMES = new Set(
  TWILIO_PRUNE_KEEP.names.map((name) => name.trim().toLowerCase()),
);

export const TWILIO_PRUNE_KEEP_PHONE_NUMBERS = new Set(
  TWILIO_PRUNE_KEEP.phoneNumbers.map((number) => number.replace(/[^\d+]/g, "")),
);
