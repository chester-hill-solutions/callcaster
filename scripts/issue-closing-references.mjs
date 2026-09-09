/** Read local closing references without treating unrelated issue mentions as fixes. */
export function closingIssueNumbers(text, repository) {
  const numbers = new Set();
  const pattern = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s*:?\s*(?:(https:\/\/github\.com\/([^\s/]+\/[^\s/]+)\/issues\/)|(\S+\/\S+)#|#)([1-9]\d*)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const target = match[2] ?? match[3] ?? repository;
    if (target.toLowerCase() === repository.toLowerCase()) numbers.add(Number(match[4]));
  }
  return [...numbers].sort((a, b) => a - b);
}
