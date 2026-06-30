-- Route auth.uid() through app.current_user_id for Drizzle RPC callers (ADR-0004).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
