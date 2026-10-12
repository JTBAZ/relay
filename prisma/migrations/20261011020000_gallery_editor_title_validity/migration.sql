BEGIN;
-- Blank legacy overrides already displayed the source title; clearing them preserves display.
UPDATE post_presentations SET relay_title = NULL WHERE title_mode <> 'custom';
ALTER TABLE post_presentations ADD CONSTRAINT post_presentations_title_mode_valid
CHECK ((title_mode = 'custom' AND relay_title IS NOT NULL AND
 btrim(relay_title, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '')
 OR (title_mode <> 'custom' AND relay_title IS NULL));
COMMIT;
