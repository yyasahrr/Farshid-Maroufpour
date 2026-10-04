CREATE TABLE "app_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"booking_group_id" text,
	"date" text NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"barber_end_min" integer NOT NULL,
	"price_snapshot" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"source" text DEFAULT 'ONLINE' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barber_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_min" integer DEFAULT 600 NOT NULL,
	"end_min" integer DEFAULT 1320 NOT NULL,
	"day_off" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barber_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"custom_price" integer,
	"custom_duration" integer,
	"custom_barber_duration" integer
);
--> statement-breakpoint
CREATE TABLE "barber_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"status" text DEFAULT 'APPROVED' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "barbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT 'آرایشگر' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"readme" text DEFAULT '' NOT NULL,
	"experience_years" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"date" text NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"reason" text DEFAULT 'BLOCKED' NOT NULL,
	"full_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" text,
	"barber_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"date" text NOT NULL,
	"start_min" integer NOT NULL,
	"duration_min" integer DEFAULT 0 NOT NULL,
	"client_phone" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_policy_acceptance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"policy_version" text DEFAULT '1.0' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"student_name" text NOT NULL,
	"student_phone" text NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"date" text NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"buffer_min" integer DEFAULT 15 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructor_barber_id" integer,
	"kind" text DEFAULT 'WORKSHOP' NOT NULL,
	"level" text DEFAULT 'BEGINNER' NOT NULL,
	"capacity" integer DEFAULT 10 NOT NULL,
	"seats_taken" integer DEFAULT 0 NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"starts_on" text NOT NULL,
	"sessions" integer DEFAULT 1 NOT NULL,
	"location" text DEFAULT 'سالن مرکزی' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"outcomes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_role" text NOT NULL,
	"user_id" integer,
	"kind" text DEFAULT 'NEW_BOOKING' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'FADE' NOT NULL,
	"image_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'استایل مو' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"barber_id" integer NOT NULL,
	"appointment_id" integer,
	"client_name" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"weekday" integer NOT NULL,
	"open_min" integer DEFAULT 600 NOT NULL,
	"close_min" integer DEFAULT 1320 NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_combination_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_a_id" integer NOT NULL,
	"service_b_id" integer NOT NULL,
	"can_combine" boolean DEFAULT true NOT NULL,
	"same_barber_required" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'اصلاح' NOT NULL,
	"required_skill_id" integer,
	"description" text DEFAULT '' NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"barber_duration_min" integer DEFAULT 30 NOT NULL,
	"buffer_min" integer DEFAULT 5 NOT NULL,
	"base_price" integer DEFAULT 0 NOT NULL,
	"payment_mode" text DEFAULT 'NO_PAYMENT' NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"allow_parallel" boolean DEFAULT false NOT NULL,
	"manager_approval_required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'CLIENT' NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_schedule" ADD CONSTRAINT "barber_schedule_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_skills" ADD CONSTRAINT "barber_skills_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_skills" ADD CONSTRAINT "barber_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barber_skills" ADD CONSTRAINT "barber_skills_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policy_acceptance" ADD CONSTRAINT "booking_policy_acceptance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_registrations" ADD CONSTRAINT "class_registrations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_instructor_barber_id_barbers_id_fk" FOREIGN KEY ("instructor_barber_id") REFERENCES "public"."barbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_combination_rules" ADD CONSTRAINT "service_combination_rules_service_a_id_services_id_fk" FOREIGN KEY ("service_a_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_combination_rules" ADD CONSTRAINT "service_combination_rules_service_b_id_services_id_fk" FOREIGN KEY ("service_b_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_required_skill_id_skills_id_fk" FOREIGN KEY ("required_skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_barber_date_idx" ON "appointments" USING btree ("barber_id","date");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_booking_group_idx" ON "appointments" USING btree ("booking_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_slot_unique" ON "appointments" USING btree ("barber_id","date","start_min") WHERE status not in ('CANCELLED_BY_CLIENT','CANCELLED_BY_STAFF');--> statement-breakpoint
CREATE UNIQUE INDEX "barber_schedule_idx" ON "barber_schedule" USING btree ("barber_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "barber_service_idx" ON "barber_services" USING btree ("barber_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "barber_skill_idx" ON "barber_skills" USING btree ("barber_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "barbers_slug_idx" ON "barbers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blocked_times_barber_date_idx" ON "blocked_times" USING btree ("barber_id","date");--> statement-breakpoint
CREATE INDEX "booking_holds_slot_idx" ON "booking_holds" USING btree ("barber_id","date","start_min");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_user_ver_idx" ON "booking_policy_acceptance" USING btree ("user_id","policy_version");--> statement-breakpoint
CREATE INDEX "class_registrations_class_idx" ON "class_registrations" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_registration_unique" ON "class_registrations" USING btree ("class_id","student_phone");--> statement-breakpoint
CREATE INDEX "class_sessions_date_idx" ON "class_sessions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_slug_idx" ON "classes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "notifications_role_idx" ON "notifications" USING btree ("target_role");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_idx" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "salon_schedule_weekday_idx" ON "salon_schedule" USING btree ("weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "combination_pair_idx" ON "service_combination_rules" USING btree ("service_a_id","service_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique_idx" ON "user_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");