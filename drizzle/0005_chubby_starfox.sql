-- Existing memorials were created before public attribution was available.
ALTER TABLE "memorials" ADD COLUMN "is_anonymous" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "memorials" ALTER COLUMN "is_anonymous" SET DEFAULT false;
