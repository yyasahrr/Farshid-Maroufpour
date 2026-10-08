-- Forward-only CMS, media-library, and portfolio visibility additions.
-- Existing portfolio work remains public through the true default; no rows or files are removed.
CREATE TABLE IF NOT EXISTS "site_content_documents" (
  "id" serial PRIMARY KEY,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "draft_content" text NOT NULL DEFAULT '{}',
  "published_content" text,
  "draft_version" integer NOT NULL DEFAULT 1,
  "published_version" integer,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "published_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "published_at" timestamp with time zone,
  CONSTRAINT "site_content_documents_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  CONSTRAINT "site_content_documents_draft_version_check" CHECK ("draft_version" > 0),
  CONSTRAINT "site_content_documents_published_version_check" CHECK ("published_version" IS NULL OR "published_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_content_documents_slug_unique_idx"
  ON "site_content_documents" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" serial PRIMARY KEY,
  "storage_key" text NOT NULL,
  "original_name" text NOT NULL,
  "media_type" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "media_assets_media_type_check" CHECK ("media_type" IN ('image', 'video')),
  CONSTRAINT "media_assets_file_size_check" CHECK ("file_size" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_storage_key_unique_idx"
  ON "media_assets" USING btree ("storage_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_assets_created_at_idx"
  ON "media_assets" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "portfolio_items"
  ADD COLUMN IF NOT EXISTS "is_public" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_is_public_idx"
  ON "portfolio_items" USING btree ("is_public", "barber_id");
--> statement-breakpoint
ALTER TABLE "barbers"
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "barbers_single_featured_idx"
  ON "barbers" USING btree ("featured") WHERE "featured" = true;
