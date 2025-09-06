#!/bin/bash

# Cover Image Migration Script
#
# This script handles the export and import of cover images between environments.
# It can be added to your deployment pipeline to ensure cover images are synchronized.
#
# Usage:
#   ./scripts/migrate-cover-images.sh export     # Export from current environment
#   ./scripts/migrate-cover-images.sh import <manifest-path> <zip-path>  # Import to current environment

set -e

SCRIPT_DIR="$(dirname "$0")"
EXPORTS_DIR="./exports"

# Ensure exports directory exists
mkdir -p "$EXPORTS_DIR"

# Display help
function show_help {
  echo "Cover Image Migration Tool"
  echo ""
  echo "Usage:"
  echo "  $0 export                            # Export cover images from current environment"
  echo "  $0 import <manifest> <zip>           # Import cover images to current environment"
  echo ""
  echo "Examples:"
  echo "  $0 export"
  echo "  $0 import ./exports/cover-images-manifest-2025-05-21.json ./exports/cover-images-2025-05-21.zip"
}

# Export cover images
function export_images {
  echo "🖼️ Exporting cover images..."
  node "$SCRIPT_DIR/export-cover-images.js"
  
  echo ""
  echo "✅ Export complete! Files are in the $EXPORTS_DIR directory."
  echo "   Transfer these files to your target environment and run the import command there."
}

# Import cover images
function import_images {
  if [ -z "$1" ] || [ -z "$2" ]; then
    echo "❌ Error: Missing manifest or zip file path"
    show_help
    exit 1
  fi
  
  MANIFEST_PATH="$1"
  ZIP_PATH="$2"
  
  if [ ! -f "$MANIFEST_PATH" ]; then
    echo "❌ Error: Manifest file not found at $MANIFEST_PATH"
    exit 1
  fi
  
  if [ ! -f "$ZIP_PATH" ]; then
    echo "❌ Error: Zip file not found at $ZIP_PATH"
    exit 1
  fi
  
  echo "🖼️ Importing cover images..."
  node "$SCRIPT_DIR/import-cover-images.js" "$MANIFEST_PATH" "$ZIP_PATH"
  
  echo ""
  echo "✅ Import complete!"
}

# Main command handling
case "$1" in
  export)
    export_images
    ;;
  import)
    import_images "$2" "$3"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo "❌ Unknown command: $1"
    show_help
    exit 1
    ;;
esac