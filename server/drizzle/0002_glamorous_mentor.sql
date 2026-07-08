ALTER TABLE "food_logs" ADD COLUMN "visitor_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "visitor_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "health_score_settings" ADD COLUMN "visitor_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_visitor_id_unique" UNIQUE("visitor_id");--> statement-breakpoint
ALTER TABLE "health_score_settings" ADD CONSTRAINT "health_score_settings_visitor_id_unique" UNIQUE("visitor_id");