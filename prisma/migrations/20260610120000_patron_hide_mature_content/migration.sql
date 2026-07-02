-- Patron opt-out: hide 18+ (review) posts from patron surfaces when enabled.
ALTER TABLE "patron_profiles" ADD COLUMN "hide_mature_content" BOOLEAN NOT NULL DEFAULT false;
