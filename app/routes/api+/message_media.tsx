export { action } from "./message_media.action.server";

function sanitizeFilename(filename: string) {
    const decodedFilename = decodeURIComponent(filename);
    const sanitized = decodedFilename.replace(/[^a-zA-Z0-9-_.]/g, '')
        .replace(/\s+/g, '_');

    const parts = sanitized.split('.');
    const ext = parts.pop();
    const name = parts.join('_');

    return `${name}.${ext}`;
}

