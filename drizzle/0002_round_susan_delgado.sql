CREATE TABLE "memorials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"place" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"born" integer NOT NULL,
	"died" integer NOT NULL,
	"story" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memorials_years_check" CHECK ("memorials"."born" >= 1900 AND "memorials"."born" <= "memorials"."died"),
	CONSTRAINT "memorials_place_check" CHECK ("memorials"."place" > 0),
	CONSTRAINT "memorials_name_check" CHECK (length(trim("memorials"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "memorials_story_check" CHECK (length(trim("memorials"."story")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
ALTER TABLE "memorials" ADD CONSTRAINT "memorials_owner_id_auth_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memorials" ADD CONSTRAINT "memorials_garden_id_gardens_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."gardens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memorials_garden_place_unique" ON "memorials" USING btree ("garden_id","place");--> statement-breakpoint
CREATE UNIQUE INDEX "memorials_owner_request_unique" ON "memorials" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "memorials_owner_idx" ON "memorials" USING btree ("owner_id");
--> statement-breakpoint
INSERT INTO "gardens" ("id", "slug") VALUES
  ('00000000-0000-4000-8000-000000000002', 'meadow'),
  ('00000000-0000-4000-8000-000000000003', 'lake'),
  ('00000000-0000-4000-8000-000000000004', 'grove'),
  ('00000000-0000-4000-8000-000000000005', 'hill')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
