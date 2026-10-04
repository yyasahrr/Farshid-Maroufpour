CREATE TABLE "course_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "course_reviews_rating_chk" CHECK ("course_reviews"."rating" >= 1 AND "course_reviews"."rating" <= 5),
CONSTRAINT "course_reviews_status_chk" CHECK ("course_reviews"."status" IN ('PENDING','APPROVED','HIDDEN'))
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"completed_lesson_ids" text DEFAULT '[]' NOT NULL,
	"grade" integer,
	"result_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "course_enrollments_status_chk" CHECK ("course_enrollments"."status" IN ('PENDING','ACTIVE','COMPLETED','CANCELLED')),
CONSTRAINT "course_enrollments_grade_chk" CHECK ("course_enrollments"."grade" IS NULL OR ("course_enrollments"."grade" >= 0 AND "course_enrollments"."grade" <= 100))
);
--> statement-breakpoint
CREATE TABLE "course_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"section_id" integer,
	"title" text NOT NULL,
	"video_url" text,
	"duration_min" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"free_preview" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"outcomes" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'BEGINNER' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"seatsTaken" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"teaser_video_url" text,
	"poster_url" text,
	"instructor_barber_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
CONSTRAINT "courses_capacity_chk" CHECK ("courses"."capacity" >= 0),
CONSTRAINT "courses_status_chk" CHECK ("courses"."status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
CONSTRAINT "courses_level_chk" CHECK ("courses"."level" IN ('BEGINNER','INTERMEDIATE','ADVANCED'))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_barber_id_barbers_id_fk" FOREIGN KEY ("instructor_barber_id") REFERENCES "public"."barbers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "course_lessons_course_idx" ON "course_lessons" USING btree ("course_id","position");
--> statement-breakpoint
CREATE INDEX "course_sections_course_idx" ON "course_sections" USING btree ("course_id","position");
--> statement-breakpoint
CREATE INDEX "course_enrollments_course_idx" ON "course_enrollments" USING btree ("course_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollment_unique" ON "course_enrollments" USING btree ("course_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "course_review_unique" ON "course_reviews" USING btree ("course_id","user_id");
