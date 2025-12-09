interface CSVParseResult {
  contacts: Record<string, string>[];
  headers: string[];
}

export function parseCSV(csvContent: string): CSVParseResult {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(header => header.trim());
  const contacts: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(value => value.trim());
    const contact: Record<string, string> = {};

    headers.forEach((header, index) => {
      contact[header] = values[index] || '';
    });

    contacts.push(contact);
  }

  return { contacts, headers };
} 