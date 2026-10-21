#!/bin/bash
# ArchFlux Complete Check Functionality

echo "=== ARCHFLUX DEPLOYMENT CHECK ==="

echo "[1] Containers"
docker ps --format "table {{.Names}}\t{{.Status}}"

echo "[2] API Health"
curl -sf localhost:8080/api/health || echo "FAIL health"

echo "[3] API Ready"
curl -sf localhost:8080/api/ready || echo "FAIL ready"

echo "[4] Frontend"
curl -sf -o /dev/null -w "HTTP %{http_code}\n" localhost:8080 || echo "FAIL web"

echo "[5] Database"
docker exec archflux-db-1 pg_isready -U archflux || echo "FAIL db"

echo "[6] Redis"
docker exec archflux-redis-1 redis-cli ping || echo "FAIL redis"

echo "[7] Secrets Configured"
cat ~/archflux/.env | grep -E 'POSTGRES_PASSWORD|DB_APP_PASSWORD|API_TOKEN|JWT_SECRET|APP_COOKIE_SECURE' | sed 's/=.*/=SET/'

echo "=== CHECK COMPLETE ==="
