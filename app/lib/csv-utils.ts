import { Contact } from './types';

type MappingOptions = {
  workspaceId: string;
  createdBy?: string;
};

export function mapCsvToContacts(csvRows: Record<string, string>[], options: MappingOptions): Partial<Contact>[] {
  return csvRows.map(row => {
    const contact: Partial<Contact> = {
      workspace: options.workspaceId,
      created_by: options.createdBy,
    };

    // Map known fields
    const fieldMapping: Record<string, keyof Contact> = {
      'First Name': 'firstname',
      'Last Name': 'surname',
      'Phone': 'phone',
      'Email': 'email',
      'Address': 'address',
      'City': 'city',
      'Postal Code': 'postal',
      'Province': 'province',
      'Country': 'country',
      'Carrier': 'carrier',
      'External ID': 'external_id',
    };

    for (const [csvHeader, value] of Object.entries(row)) {
      const contactField = fieldMapping[csvHeader];
      if (contactField) {
        contact[contactField] = value;
      } else {
        // Add unknown fields to other_data
        if (!contact.other_data) contact.other_data = {};
        contact.other_data[csvHeader] = value;
      }
    }

    return contact;
  });
}
