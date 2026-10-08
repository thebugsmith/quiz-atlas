-- Rule versions carry their content hash, like item versions do, so re-importing an
-- unchanged paper reuses the rule row instead of appending an identical version.
alter table content.exam_rule_versions
  add column if not exists content_hash text
    check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');

create index if not exists exam_rule_versions_hash_idx
  on content.exam_rule_versions (paper_id, content_hash);
