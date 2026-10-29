#!/bin/bash
# Generate OpenAPI spec from Spring Boot app
# Usage: backend/scripts/generate-openapi.sh [output-file]  (writes backend/docs/api/)

set -e

OUTPUT_FILE="${1:-openapi.json}"
SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # backend/
SPEC_DIR="docs/api"

echo "Building Spring Boot app..."
cd "$SERVER_DIR"
mvn -q clean compile -DskipTests

echo "Starting Spring Boot app for OpenAPI generation..."
# Start app in background
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dserver.port=3001" &
APP_PID=$!

# Wait for app to start
echo "Waiting for app to start..."
for i in {1..30}; do
  if curl -s "http://localhost:3001/api/v1/actuator/health" > /dev/null 2>&1; then
    echo "App started successfully"
    break
  fi
  sleep 2
done

if ! curl -s "http://localhost:3001/api/v1/actuator/health" > /dev/null 2>&1; then
  echo "ERROR: App failed to start"
  kill $APP_PID 2>/dev/null || true
  exit 1
fi

echo "Generating OpenAPI spec..."
mkdir -p "$SERVER_DIR/$SPEC_DIR"
curl -s "http://localhost:3001/v3/api-docs" | jq . > "$SERVER_DIR/$SPEC_DIR/$OUTPUT_FILE"

echo "Stopping app..."
kill $APP_PID 2>/dev/null || true
wait $APP_PID 2>/dev/null || true

echo "OpenAPI spec generated at $SPEC_DIR/$OUTPUT_FILE"

# Also generate markdown docs
if command -v npx &> /dev/null; then
  echo "Generating Markdown documentation..."
  npx @redocly/openapi-cli@latest bundle "$SERVER_DIR/$SPEC_DIR/$OUTPUT_FILE" -o "$SERVER_DIR/$SPEC_DIR/openapi-bundled.yaml" 2>/dev/null || true
  npx @redocly/openapi-cli@latest preview-docs "$SERVER_DIR/$SPEC_DIR/openapi-bundled.yaml" --port 8080 &
fi

echo "Done!"