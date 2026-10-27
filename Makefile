# Local development entry points (#1159).
#
#   make init                 first-time or repair: npm run setup (services, .env, schema, bucket, seed)
#   make all                  start the complete local stack in dependency order
#   make up | down | logs     every compose service (postgres, inbucket)
#   make postgres up          one service; any subset works: make postgres logs
#   make storage up|down      object storage (the stow binary, not a container)
#   make postgres init        start that service and run only its bootstrap step
#   make app | worker | media-stream   start a process in the background
#   make local-status                  show local process status
#   make local-logs                    follow local process logs
#   make local-stop                    stop local background processes
#   make tunnel-setup         create or verify the named Cloudflare Tunnel
#   make tunnel               start the named Cloudflare Tunnel
#   make twiml                create or update the local TwiML App
#   make calling:sync         sync one workspace to the tunnel URL
#   make calling:sync-local   sync Twilio-enabled local workspaces
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

.PHONY: help init all up down logs ps app app-down worker worker-down media-stream media-stream-down tunnel-setup tunnel tunnel-down local-status storage-status local-logs local-stop app-logs worker-logs media-stream-logs tunnel-logs twiml calling\:sync calling\:sync-local e2e storage storage-down minio minio-down postgres-down inbucket-down $(SERVICES)

help:
	@sed -n '3,13p' $(MAKEFILE_LIST) | sed 's/^#   //'

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

all:
	$(MAKE) up
	$(MAKE) storage
	$(MAKE) app
	$(MAKE) worker
	$(MAKE) media-stream
	$(MAKE) tunnel

# Object storage lifecycle. `up` starts the detached stow process and waits for
# its STOW_READY banner, then ensures the bucket exists; `down` stops it by pid.
storage:
	@$(if $(filter down,$(MAKECMDGOALS)),node scripts/e2e/start-stow.mjs --stop,node scripts/e2e/start-stow.mjs --start && node scripts/e2e/ensure-bucket.mjs --keep-objects)

storage-down:
	@node scripts/e2e/start-stow.mjs --stop

minio: storage

minio-down: storage-down

up:
	$(COMPOSE) up -d $(TARGET_SERVICES)

ifeq ($(REQUESTED),)
down: tunnel-down media-stream-down worker-down app-down storage-down inbucket-down postgres-down
	@:
else
down:
	@$(COMPOSE) stop $(REQUESTED)
endif

postgres-down:
	@$(COMPOSE) stop postgres

inbucket-down:
	@$(COMPOSE) stop inbucket

logs:
	$(COMPOSE) logs -f --tail=200 $(TARGET_SERVICES)

ps:
	@echo "Local processes:"
	@for name in app worker media-stream tunnel; do node scripts/local/run-headless.mjs status "$$name"; done
	@node scripts/e2e/start-stow.mjs --status
	@echo "Compose services:"
	@$(COMPOSE) ps --all

app:
	node scripts/local/run-headless.mjs start app -- npm run dev

app-down:
	@node scripts/local/run-headless.mjs stop app

worker:
	node scripts/local/run-headless.mjs start worker -- npm run worker

worker-down:
	@node scripts/local/run-headless.mjs stop worker

media-stream:
	node scripts/local/run-headless.mjs start media-stream -- bun run services/media-stream/index.ts

media-stream-down:
	@node scripts/local/run-headless.mjs stop media-stream

tunnel-setup:
	node scripts/local/setup-cloudflare-tunnel.mjs

tunnel:
	node scripts/local/run-headless.mjs start tunnel -- node scripts/local/start-cloudflare-tunnel.mjs

tunnel-down:
	@node scripts/local/run-headless.mjs stop tunnel

local-status:
	@for name in app worker media-stream tunnel; do node scripts/local/run-headless.mjs status "$$name"; done

storage-status:
	@node scripts/e2e/start-stow.mjs --status

local-logs:
	tail -f .local/logs/app.log .local/logs/worker.log .local/logs/media-stream.log .local/logs/tunnel.log

app-logs:
	tail -f .local/logs/app.log

worker-logs:
	tail -f .local/logs/worker.log

media-stream-logs:
	tail -f .local/logs/media-stream.log

tunnel-logs:
	tail -f .local/logs/tunnel.log

local-stop:
	@for name in app worker media-stream tunnel; do node scripts/local/run-headless.mjs stop "$$name"; done

twiml:
	bun scripts/local/provision-local-twiml-app.mjs

calling\:sync:
ifndef WORKSPACE_ID
	$(error WORKSPACE_ID is required, for example: make calling:sync WORKSPACE_ID=<workspace-id>)
endif
	npm run dev:calling:sync -- --workspace-id "$(WORKSPACE_ID)" $(if $(BASE_URL),--base-url "$(BASE_URL)",)

calling\:sync-local:
	bun scripts/local/sync-local-calling-dev.mjs

e2e:
	npm run test:e2e:compose
