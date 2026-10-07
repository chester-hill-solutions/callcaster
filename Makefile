# Local development entry points (#1159).
#
#   make init                 first-time or repair: npm run setup (services, .env, schema, bucket, seed)
#   make up | down | logs     every compose service (postgres, inbucket)
#   make postgres up          one service; any subset works: make postgres logs
#   make storage up|down      object storage (the stow binary, not a container)
#   make postgres init        start that service and run only its bootstrap step
#   make app | worker | media-stream   run a process in the foreground
#   make e2e                  compose-first Playwright run
#
# The compose file is the source of truth for service names; targets here only
# wrap `docker compose -f docker-compose.dev.yml` and the npm scripts so nobody
# has to remember the flags. Object storage is deliberately NOT a compose
# service: minio/minio and quay.io/minio/minio are both 401 for anonymous
# pulls, which broke the E2E job outright (#1800, again from 2026-09-24). It is
# the pinned `stow` release binary instead, via scripts/e2e/start-stow.mjs.

COMPOSE := docker compose -f docker-compose.dev.yml
SERVICES := postgres inbucket
REQUESTED := $(filter $(SERVICES),$(MAKECMDGOALS))
TARGET_SERVICES := $(if $(REQUESTED),$(REQUESTED),$(SERVICES))
# `minio` stays as an alias so existing muscle memory and older notes keep
# working, even though the service it named no longer exists.
STORAGE_GOALS := storage minio

.PHONY: help init up down logs ps app worker media-stream e2e storage minio $(SERVICES)

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
endif

# Object storage lifecycle. `up` starts the detached stow process and waits for
# its STOW_READY banner, then ensures the bucket exists; `down` stops it by pid.
storage:
	@$(if $(filter down,$(MAKECMDGOALS)),node scripts/e2e/start-stow.mjs --stop,node scripts/e2e/start-stow.mjs --start && node scripts/e2e/ensure-bucket.mjs --keep-objects)

minio: storage

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
