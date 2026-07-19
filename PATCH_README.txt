Retirement Strategy Planner v1.0 release-preparation patch

Includes:
1. Dedicated same-seed path-sharing verification tests.
2. DATA_REFRESH.md.
3. MODEL_ASSUMPTIONS_AND_LIMITATIONS.md.
4. Archived obsolete root scripts/plan documents under docs/archive.
5. Updated Help page and Chinese HTML manual.
6. package version 1.0.0 and release/tag checklist.

Apply from PowerShell after extracting this ZIP:
  .\apply-v1-release-patch.ps1 -RepoPath "C:\path\to\retirement-planner"

Then run CI, commit, push main, verify production QA, and finally:
  .\create-v1-tag.ps1
