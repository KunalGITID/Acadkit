-- The self-test (flashcards, /quiz) was removed from the app, along with
-- the sync's <pin>/quiz.json decks and send-reminders' 19:00 "cards due"
-- push. This drops its progress table from 033; the upload half of 033
-- stays.

drop policy if exists "quiz_reviews_owner" on quiz_reviews;
drop table if exists quiz_reviews;
