#!/usr/bin/env sh
set -eu

required_files="
AGENTS.md
README.md
MASTER_PROMPT.md
docs/START_HERE.md
docs/CURRENT_STATE.md
docs/01_strategy/PRODUCT_BRIEF.md
docs/02_requirements/REQUIREMENTS.md
docs/03_architecture/ARCHITECTURE.md
docs/04_execution/IMPLEMENTATION_PLAN.md
docs/05_quality/QA_PLAN.md
docs/06_release/RELEASE_PLAN.md
docs/07_handoff/HANDOFF.md
ops/decisions/0001-project-os-scaffold.md
prompts/implementation-agent.md
prompts/reviewer-agent.md
"

missing=0
for file in $required_files; do
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "Project OS scaffold check passed."

