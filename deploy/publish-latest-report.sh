#!/usr/bin/env bash
set -euo pipefail

RUNS_DIR=/home/ubuntu/DailyReport/data/runs
PUBLIC_DIR=/var/www/portfolio-news-dashboard/data
latest_report="$(find "$RUNS_DIR" -mindepth 3 -maxdepth 3 -path '*/merged/report_input.json' -type f -print | sort | tail -n 1)"

if [[ -z "$latest_report" ]]; then
  exit 0
fi

install -d -o www-data -g www-data -m 0755 "$PUBLIC_DIR"
install -o www-data -g www-data -m 0644 "$latest_report" "$PUBLIC_DIR/latest.json.tmp"
mv "$PUBLIC_DIR/latest.json.tmp" "$PUBLIC_DIR/latest.json"
/usr/local/bin/build-portfolio-economic-calendar "$PUBLIC_DIR/monthly-calendar.json" || true
