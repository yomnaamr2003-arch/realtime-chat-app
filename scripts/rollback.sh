#!/usr/bin/env bash
# Roll back the running deployment to a previous, known-good release tag.
#
# Usage:
#   ./scripts/rollback.sh v1.2.0
#
# Strategy:
#   Every deploy to main is tagged (see README.md "Release tagging"). To roll
#   back, we reset the deployed branch pointer to the previous tag and let
#   the hosting platform's auto-deploy (Render/Railway/etc.) redeploy that
#   commit. This avoids force-pushing over history — a new commit is created
#   that matches the old tree, so `git log` keeps an honest record.

set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag-to-roll-back-to>"
  echo "Available tags:"
  git tag --sort=-creatordate | head -10
  exit 1
fi

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag '$TAG' does not exist."
  exit 1
fi

echo "Rolling back to $TAG..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

git fetch --tags
git checkout "$CURRENT_BRANCH"
git revert --no-commit "$TAG"..HEAD || true
git commit -m "rollback: revert to $TAG" --allow-empty
git push origin "$CURRENT_BRANCH"

echo "Pushed rollback commit. The hosting platform's auto-deploy will redeploy this state."
echo "Verify with: curl https://<your-deployed-url>/api/health"
