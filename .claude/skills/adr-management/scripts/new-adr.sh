#!/usr/bin/env bash
# Scaffold the next ADR from the template.
# Usage: ./new-adr.sh "short slug for the decision"
# Run from anywhere; paths are resolved relative to the repo's docs/adr.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 \"short slug for the decision\"" >&2
  exit 1
fi

# Resolve docs/adr relative to this script (script lives in .claude/skills/adr-management/scripts).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
adr_dir="$(cd "$script_dir/../../../../docs/adr" && pwd)"

slug="$(echo "$*" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"

# Find the highest existing NNNN and add one.
last=0
for f in "$adr_dir"/[0-9][0-9][0-9][0-9]-*.md; do
  [ -e "$f" ] || continue
  n=$(basename "$f" | cut -c1-4)
  # strip leading zeros safely
  n=$((10#$n))
  if [ "$n" -gt "$last" ]; then last=$n; fi
done
next=$(printf "%04d" $((last + 1)))

target="$adr_dir/${next}-${slug}.md"
if [ -e "$target" ]; then
  echo "Refusing to overwrite existing $target" >&2
  exit 1
fi

today="$(date +%Y-%m-%d)"
sed -e "s/^# NNNN\. .*/# ${next}. ${slug//-/ }/" \
    -e "s/\*\*Date:\*\* YYYY-MM-DD/**Date:** ${today}/" \
    "$adr_dir/template.md" > "$target"

echo "Created $target"
echo "Now: fill in the sections, set the title and status, and add a row to docs/adr/README.md"