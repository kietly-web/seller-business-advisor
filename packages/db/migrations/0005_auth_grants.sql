-- Better Auth runs outside withContext as the connecting role, which reaches auth.* only through sa_auth; once a request switches to sa_app or sa_worker these tables are out of reach
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sa_auth') THEN
    CREATE ROLE sa_auth NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA auth TO sa_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth."user", auth.session, auth.account, auth.verification, auth.two_factor, auth.rate_limit TO sa_auth;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sa_auth;
--> statement-breakpoint
GRANT sa_auth TO CURRENT_USER;
