#!/bin/bash

# This script runs the release date update in batches to avoid timeouts
# Usage: ./update-release-dates.sh [batch_size] [total_batches]
# Example: ./update-release-dates.sh 50 10

# Default settings
BATCH_SIZE=${1:-50}
TOTAL_BATCHES=${2:-10}

echo "Starting release date update with batch size $BATCH_SIZE for $TOTAL_BATCHES batches"
echo "========================================================================"

for ((i=1; i<=$TOTAL_BATCHES; i++))
do
  echo "Processing batch $i of $TOTAL_BATCHES"
  npx tsx server/test-date-fix.ts $BATCH_SIZE
  
  # Show current progress
  echo "Progress: $i/$TOTAL_BATCHES batches complete"
  echo "------------------------------------------------------------------------"
  
  # Sleep for 2 seconds between batches to avoid overloading the database
  if [ $i -lt $TOTAL_BATCHES ]; then
    echo "Waiting 2 seconds before next batch..."
    sleep 2
  fi
done

echo "========================================================================"
echo "Release date update complete. Processed $TOTAL_BATCHES batches with batch size $BATCH_SIZE."
echo "Total tracks processed: $((BATCH_SIZE * TOTAL_BATCHES))"