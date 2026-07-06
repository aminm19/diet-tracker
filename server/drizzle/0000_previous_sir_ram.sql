CREATE TABLE "food_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"logged_date" date NOT NULL,
	"food_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"unit" text NOT NULL,
	"calories" numeric NOT NULL,
	"protein" numeric NOT NULL,
	"carbs" numeric NOT NULL,
	"fat" numeric NOT NULL,
	"sugar" numeric,
	"sodium" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"serving_size" numeric,
	"serving_unit" text,
	"calories_per_100g" numeric NOT NULL,
	"protein_per_100g" numeric NOT NULL,
	"carbs_per_100g" numeric NOT NULL,
	"fat_per_100g" numeric NOT NULL,
	"sugar_per_100g" numeric,
	"sodium_per_100g" numeric,
	"nova_group" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_source_external_id_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"calories" numeric NOT NULL,
	"protein" numeric NOT NULL,
	"carbs" numeric NOT NULL,
	"fat" numeric NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_score_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_weight" numeric DEFAULT '0.25' NOT NULL,
	"macro_fit_enabled" boolean DEFAULT true NOT NULL,
	"macro_fit_weight" numeric DEFAULT '0.25' NOT NULL,
	"sugar_sodium_enabled" boolean DEFAULT true NOT NULL,
	"sugar_sodium_weight" numeric DEFAULT '0.25' NOT NULL,
	"variety_enabled" boolean DEFAULT true NOT NULL,
	"variety_weight" numeric DEFAULT '0.25' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;