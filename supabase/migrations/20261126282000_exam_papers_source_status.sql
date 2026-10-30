-- Neither hosted paper is a development fixture.
--
-- Both were imported from official paper files (CGPSC from `data/papers/cgpsc-pre-2025.json`,
-- NEET from its 2025 paper) and the CGPSC paper has been piloted end to end, but the legacy
-- importer stamped them `synthetic`, so the library labelled them "Development fixture, not a
-- previous-year paper" and the paper page repeated it. `reviewed_reconstruction` is the honest
-- status for a paper whose questions were transcribed and whose key was checked: it is not
-- `official_verified`, which needs a source URL or sha256, and it is no longer `synthetic`,
-- which the typed import path refuses to publish.

update content.papers
   set source_status = 'reviewed_reconstruction'
 where slug in ('cgpsc-pre-2025', 'neet-ug-2025')
   and source_status = 'synthetic';
