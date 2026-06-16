const SHORT_QUERY_MAX_LENGTH = 2;
const PHONE_SUBSTRING_MIN_LENGTH = 4;

export function escapeIlikeTerm(raw: string): string {
  return raw
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll(",", " ")
    .trim();
}

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
