.PHONY: up down logs ps psql db-push db-seed db-reset

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
