-- Autorise le type 'story' dans scheduled_posts.
-- Sans ça, la contrainte CHECK d'origine (posting | mass_posting) rejette
-- toute programmation de story.
alter table scheduled_posts drop constraint if exists scheduled_posts_type_check;
alter table scheduled_posts add constraint scheduled_posts_type_check
  check (type in ('posting', 'mass_posting', 'story'));
