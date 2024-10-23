import { PGlite, types } from '@electric-sql/pglite'
import { Contact } from './types';

export async function createPGliteDb(workspaceId: string) {
    return new PGlite();
}

export async function createPGliteTable(db: PGlite, tableName: string, format: string) {
    await db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${format})`);
}

export async function insertContacts(db: PGlite, tableName: string, format: string, contacts: Record<string, any>[]) {
    if (contacts.length === 0) {
        console.warn('No contacts to insert');
        return;
    }
    const columns = contacts[0] 
    const placeholders = contacts.map((_, index) => 
        `(${columns.map((_, colIndex) => `$${index * columns.length + colIndex + 1}`).join(', ')})`
    ).join(', ');
    const values = contacts.flatMap(row => 
        columns.map((col, index) => {
            const value = row[col];
            if (types[col] === types.numeric && isNaN(Number(value))) {
                return null;
            }
            return value;
        })
    );
    try {
        await db.query(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`, values);
    } catch (error) {
        console.error('Error inserting contacts:', error);
        throw error;
    }
}

export async function getContacts(db: PGlite, tableName: string, workspaceId: string) {
    try {
        return await db.query(`SELECT * FROM ${tableName} WHERE workspace = $1`, [workspaceId]);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        throw error;
    }
}
