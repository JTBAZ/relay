-- Option B data repair: RELAY-native posts persisted Prisma Tier.id in post_versions.tier_ids
-- and posts.required_tier_id. Canonical storage is tiers.relay_tier_id (entitlement, RLS, gallery).
-- post_tiers.junction rows stay keyed by Tier.id — do not modify them.

-- post_versions.tier_ids: replace elements that equal tiers.id for the post's creator with relay_tier_id.

UPDATE post_versions pv
SET tier_ids = sub.new_tier_ids
FROM (
  SELECT
    pv2.id,
    array_agg(
      CASE
        WHEN t.id IS NOT NULL THEN t.relay_tier_id
        ELSE elem.tier_elem
      END
      ORDER BY elem.ord
    ) AS new_tier_ids
  FROM post_versions pv2
  INNER JOIN posts p ON p.id = pv2.post_id
  CROSS JOIN LATERAL unnest(pv2.tier_ids) WITH ORDINALITY AS elem (tier_elem, ord)
  LEFT JOIN tiers t ON t.id = elem.tier_elem AND t.creator_id = p.creator_id
  WHERE p.source = 'RELAY'::"PostSource"
  GROUP BY pv2.id
) AS sub
WHERE pv.id = sub.id
  AND pv.tier_ids IS DISTINCT FROM sub.new_tier_ids;

-- posts.required_tier_id: when it still holds Tier.id for this creator, rewrite to relay_tier_id.
UPDATE posts p
SET required_tier_id = t.relay_tier_id
FROM tiers t
WHERE p.source = 'RELAY'::"PostSource"
  AND p.required_tier_id IS NOT NULL
  AND t.id = p.required_tier_id
  AND t.creator_id = p.creator_id
  AND p.required_tier_id IS DISTINCT FROM t.relay_tier_id;
