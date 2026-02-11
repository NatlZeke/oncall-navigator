
-- Fix 3: Add match_keywords column to provider_routing_config
ALTER TABLE public.provider_routing_config
ADD COLUMN match_keywords text[] DEFAULT NULL;

-- Backfill existing providers with keywords
UPDATE public.provider_routing_config
SET match_keywords = CASE
  WHEN lower(provider_name) LIKE '%todd%shepler%' OR lower(provider_name) LIKE '%shepler%todd%'
    THEN ARRAY['todd', 'shepler']
  WHEN lower(provider_name) LIKE '%vincent%restivo%' OR lower(provider_name) LIKE '%vin%restivo%'
    THEN ARRAY['vin', 'vincent', 'restivo']
  WHEN lower(provider_name) LIKE '%chelsea%devitt%' OR lower(provider_name) LIKE '%devitt%chelsea%'
    THEN ARRAY['chelsea', 'devitt']
  WHEN lower(provider_name) LIKE '%nathan%osterman%' OR lower(provider_name) LIKE '%nate%osterman%'
    THEN ARRAY['nate', 'nathan', 'osterman']
  ELSE string_to_array(lower(provider_name), ' ')
END
WHERE match_keywords IS NULL;
