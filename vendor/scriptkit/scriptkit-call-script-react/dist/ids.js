let counter = 0;
export function createId(prefix) {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
