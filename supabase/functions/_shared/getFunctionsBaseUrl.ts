export function getFunctionsBaseUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set");
  }
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
}

export function getFunctionUrl(name: string): string {
  return `${getFunctionsBaseUrl()}/${name}`;
}
