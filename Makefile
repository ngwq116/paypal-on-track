.PHONY: up down logs ps psql db-push db-seed db-reset db-fresh test-db test-int

# Build images (if any) and start containers in the background; waits until Postgres is healthy
up:
	docker compose up -d --build --wait

# Stop and remove containers; data stays in the pgdata volume
down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

psql:
	docker compose exec db psql -U ontrack ontrack

db-push:
	npm run db:push

db-seed:
	npm run db:seed

# DESTRUCTIVE: wipes the local database volume, then recreates tables and seed data
db-reset:
	docker compose down -v
	$(MAKE) up db-push db-seed

db-fresh:
	npm run db:seed:fresh

# Create (if missing) and migrate the integration-test database
test-db:
	docker compose exec -T db createdb -U ontrack ontrack_test 2>/dev/null || true
	npm run db:push:test

test-int: test-db
	npm run test:int
