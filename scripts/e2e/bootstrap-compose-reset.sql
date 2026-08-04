-- Wipe compose E2E database so baseline migrations apply cleanly on re-run.
-- Safe only for local docker-compose Postgres (callcaster dev stack).

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO callcaster;
GRANT ALL ON SCHEMA public TO public;

DROP SCHEMA IF EXISTS app_auth CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS auth_migrations CASCADE;
