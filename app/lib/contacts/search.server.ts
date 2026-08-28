import { eq, ilike, or, type SQL } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { stripPhoneNumber } from "@/lib/phone";

const SHORT_QUERY_MAX_LENGTH = 2;
const PHONE_SUBSTRING_MIN_LENGTH = 4;

export function escapeIlikeTerm(raw: string): string {
  return raw
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll(",", " ")
    .trim();
}

/** Drizzle `where` clause for a contact free-text search. */
export function buildContactSearchWhere(rawSearchQuery: string): SQL | undefined {
  const escapedQuery = escapeIlikeTerm(rawSearchQuery);
  if (!escapedQuery) {
    return undefined;
  }

  const isShortQuery = escapedQuery.length <= SHORT_QUERY_MAX_LENGTH;
  const textSearchPattern = isShortQuery
    ? `${escapedQuery}%`
    : `%${escapedQuery}%`;
  const normalizedDigits = stripPhoneNumber(rawSearchQuery);

  const filters: SQL[] = [
    ilike(contactTable.firstname, textSearchPattern),
    ilike(contactTable.surname, textSearchPattern),
    ilike(contactTable.email, textSearchPattern),
    ilike(contactTable.address, textSearchPattern),
    ilike(contactTable.city, textSearchPattern),
  ];

  if (normalizedDigits.length >= PHONE_SUBSTRING_MIN_LENGTH) {
    filters.push(
      eq(contactTable.phone, normalizedDigits),
      ilike(contactTable.phone, `${normalizedDigits}%`),
      ilike(contactTable.phone, `%${normalizedDigits}%`),
    );
  } else {
    filters.push(ilike(contactTable.phone, textSearchPattern));
  }

  return or(...filters);
}
