/** Stub for client bundle — postgres is server-only. */
export default function postgres() {
  throw new Error("postgres is not available in the browser bundle");
}
