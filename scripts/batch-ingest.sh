#!/bin/bash
# Batch ingestion for Egyptian Law MCP from manshurat.org
#
# Processes laws in batches of $BATCH_SIZE with $PAUSE_BETWEEN_BATCHES
# seconds between batches. Designed to avoid server rate limiting.
#
# Usage:
#   ./scripts/batch-ingest.sh [--batch-size N] [--pause N] [--total N]
#
# The script is fully resumable -- it reads the checkpoint to determine
# which laws have already been processed.

set -uo pipefail

BATCH_SIZE=50
PAUSE_BETWEEN_BATCHES=300   # 5 minutes between batches
TOTAL_BATCHES=0              # 0 = unlimited (process all)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/data/source-manshurat/logs"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --batch-size) BATCH_SIZE="$2"; shift 2;;
    --pause) PAUSE_BETWEEN_BATCHES="$2"; shift 2;;
    --total) TOTAL_BATCHES="$2"; shift 2;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

mkdir -p "$LOG_DIR"

echo "Egyptian Law MCP -- Batch Ingestion"
echo "===================================="
echo "Batch size:    $BATCH_SIZE laws per batch"
echo "Pause:         ${PAUSE_BETWEEN_BATCHES}s between batches"
echo "Total batches: ${TOTAL_BATCHES:-unlimited}"
echo "Log dir:       $LOG_DIR"
echo ""

batch_num=0
consecutive_zero_batches=0

while true; do
  batch_num=$((batch_num + 1))

  if [[ $TOTAL_BATCHES -gt 0 && $batch_num -gt $TOTAL_BATCHES ]]; then
    echo "Reached total batch limit ($TOTAL_BATCHES). Stopping."
    break
  fi

  log_file="$LOG_DIR/batch-$(printf '%04d' $batch_num)-$(date +%Y%m%d-%H%M%S).log"
  echo "=== Batch $batch_num (limit $BATCH_SIZE) ==="

  # Run ingestion batch (ignore exit code -- some batches have 0 ingested which is OK)
  cd "$PROJECT_DIR"
  npx tsx scripts/ingest-manshurat.ts --resume --limit "$BATCH_SIZE" > "$log_file" 2>&1 || true

  # Extract summary from log (use || true to prevent pipefail issues)
  ingested=$(grep "^Ingested:" "$log_file" 2>/dev/null | awk '{print $2}' || echo "0")
  skipped=$(grep "^Skipped:" "$log_file" 2>/dev/null | awk '{print $2}' || echo "0")
  errors=$(grep "^Errors:" "$log_file" 2>/dev/null | awk '{print $2}' || echo "0")
  total_seeds=$(grep "^Total seeds" "$log_file" 2>/dev/null | awk '{print $NF}' || echo "?")

  echo "  Ingested: $ingested | Skipped: $skipped | Errors: $errors | Total seeds: $total_seeds"
  echo "  Log: $log_file"

  # Check if all laws have been processed
  remaining=$(grep "^To process:" "$log_file" 2>/dev/null | awk '{print $3}' || echo "")
  if [[ "$remaining" == "0" ]]; then
    echo ""
    echo "All laws processed. Done!"
    break
  fi

  # Track consecutive zero-ingestion batches
  if [[ "$ingested" == "0" ]]; then
    consecutive_zero_batches=$((consecutive_zero_batches + 1))
  else
    consecutive_zero_batches=0
  fi

  # If 5 consecutive batches with 0 ingested, the server is persistently blocking
  if [[ $consecutive_zero_batches -ge 5 ]]; then
    echo "  WARNING: 5 consecutive batches with 0 ingested. Server may be blocking."
    echo "  Waiting 30 minutes before retrying..."
    sleep 1800
    consecutive_zero_batches=0
  elif [[ "$ingested" == "0" && "$errors" != "0" ]]; then
    echo "  WARNING: No laws ingested, server may be blocking. Waiting 10 minutes..."
    sleep 600
  else
    echo "  Pausing ${PAUSE_BETWEEN_BATCHES}s before next batch..."
    sleep "$PAUSE_BETWEEN_BATCHES"
  fi
done

echo ""
echo "Batch ingestion complete."
echo "Run 'npx tsx scripts/build-db.ts' to rebuild the database."
