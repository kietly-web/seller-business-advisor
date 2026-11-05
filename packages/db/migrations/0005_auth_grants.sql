-- Better Auth runs outside withContext, so the connecting role reaches these through its sa_app membership; no RLS here, only the server touches auth.*
GRANT USAGE ON SCHEMA auth TO sa_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO sa_app;
