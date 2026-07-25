-- Limite d'upload de la banque (bucket "content") : 50 Mo → 100 Mo.
-- 100 Mo = 104 857 600 octets.
update storage.buckets
  set file_size_limit = 104857600
  where id = 'content';
