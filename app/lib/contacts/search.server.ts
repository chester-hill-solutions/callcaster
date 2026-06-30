import { eq, ilike, or, type SQL } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";

const SHORT_QUERY_MAX_LENGTH = 2;
const PHONE_SUBSTRING_MIN_LENGTH = 4;

export function escapeIlikeTerm(raw: string): string {
  return raw
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll(",", " ")
    .trim();
}

/** PostgREST `.or()` filter string for legacy Supabase queries. */
export function buildContactSearchFilter(rawSearchQuery: string): string {
  const escapedQuery = escapeIlikeTerm(rawSearchQuery);
  if (!escapedQuery) {
    return "";
  }

  const isShortQuery = escapedQuery.length <= SHORT_QUERY_MAX_LENGTH;
  const textSearchPattern = isShortQuery
    ? `${escapedQuery}%`
    : `%${escapedQuery}%`;
  const normalizedDigits = rawSearchQuery.replace(/\D/g, "");
  const escapedDigits = escapeIlikeTerm(normalizedDigits);
  const filters = [
    `firstname.ilike.${textSearchPattern}`,
    `surname.ilike.${textSearchPattern}`,
    `email.ilike.${textSearchPattern}`,
    `address.ilike.${textSearchPattern}`,
    `city.ilike.${textSearchPattern}`,
  ];

  if (normalizedDigits.length >= PHONE_SUBSTRING_MIN_LENGTH && escapedDigits) {
    filters.push(
      `phone.eq.${escapedDigits}`,
      `phone.ilike.${escapedDigits}%`,
      `phone.ilike.%${escapedDigits}%`,
    );
  } else {
    filters.push(`phone.ilike.${textSearchPattern}`);
  }

  return filters.join(",");
}

/** Drizzle `where` clause matching {@link buildContactSearchFilter} semantics. */
export function buildContactSearchWhere(rawSearchQuery: string): SQL | undefined {
  const escapedQuery = escapeIlikeTerm(rawSearchQuery);
  if (!escapedQuery) {
    return undefined;
  }

  const isShortQuery = escapedQuery.length <= SHORT_QUERY_MAX_LENGTH;
  const textSearchPattern = isShortQuery
    ? `${escapedQuery}%`
    : `%${escapedQuery}%`;
  const normalizedDigits = rawSearchQuery.replace(/\D/g, "");

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
