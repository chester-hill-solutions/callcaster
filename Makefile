# Local development entry points (#1159).
#
#   make init                 first-time or repair: npm run setup (services, .env, schema, bucket, seed)
#   make up | down | logs     every compose service (postgres, minio, inbucket)
#   make postgres up          one service; any subset works: make postgres minio logs
#   make postgres init        start that service and run only its bootstrap step
#   make app | worker | media-stream   run a process in the foreground
#   make e2e                  compose-first Playwright run
#
# The compose file is the source of truth for service names; targets here only
# wrap `docker compose -f docker-compose.dev.yml` and the npm scripts so nobody
# has to remember the flags.

COMPOSE := docker compose -f docker-compose.dev.yml
SERVICES := postgres minio inbucket
REQUESTED := $(filter $(SERVICES),$(MAKECMDGOALS))
TARGET_SERVICES := $(if $(REQUESTED),$(REQUESTED),$(SERVICES))

.PHONY: help init up down logs ps app worker media-stream e2e $(SERVICES)

help:
	@sed -n '3,9p' $(MAKEFILE_LIST) | sed 's/^#   //'

# Service names are goals only so they can prefix an action; they do nothing alone.
$(SERVICES):
	@:

init:
ifeq ($(REQUESTED),)
	npm run setup
else
	$(COMPOSE) up -d $(REQUESTED)
	@$(if $(filter postgres,$(REQUESTED)),node scripts/e2e/bootstrap-compose-db.mjs,:)
	@$(if $(filter minio,$(REQUESTED)),node scripts/e2e/ensure-minio-bucket.mjs --keep-objects,:)
endif

up:
	$(COMPOSE) up -d $(TARGET_SERVICES)

down:
ifeq ($(REQUESTED),)
	$(COMPOSE) down
else
	$(COMPOSE) stop $(REQUESTED)
endif

logs:
	$(COMPOSE) logs -f --tail=200 $(TARGET_SERVICES)

ps:
	$(COMPOSE) ps

app:
	npm run dev

worker:
	npm run worker

media-stream:
	bun run services/media-stream/index.ts

e2e:
	npm run test:e2e:compose
