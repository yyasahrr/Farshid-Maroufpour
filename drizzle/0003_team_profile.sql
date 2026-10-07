-- Forward-only Team/Profile schema additions. Existing salon tables and history remain intact.
CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_unique_idx" ON "user_roles" USING btree ("user_id", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_role_idx" ON "user_roles" USING btree ("role");
--> statement-breakpoint
-- Preserve each existing account's legacy role as its first membership.
INSERT INTO "user_roles" ("user_id", "role")
SELECT "id", COALESCE(NULLIF("role", ''), 'CLIENT') FROM "users"
ON CONFLICT ("user_id", "role") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "barber_skills"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'APPROVED';
--> statement-breakpoint
ALTER TABLE "barber_skills"
  ADD COLUMN IF NOT EXISTS "approved_by" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'barber_skills_approved_by_users_id_fk'
      AND conrelid = 'barber_skills'::regclass
  ) THEN
    ALTER TABLE "barber_skills"
      ADD CONSTRAINT "barber_skills_approved_by_users_id_fk"
      FOREIGN KEY ("approved_by") REFERENCES "users"("id");
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "barber_skills"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- A login/account owns at most one professional barber profile. Multiple NULLs remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS "barbers_user_id_unique_idx"
  ON "barbers" USING btree ("user_id") WHERE "user_id" IS NOT NULL;
