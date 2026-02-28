.PHONY: help up up-external-db up-prod up-prod-external down stop clean build rebuild logs logs-api logs-worker logs-ui shell-db backup-db restore-db doctor nuke create-topics health wait-healthy rebuild-api rebuild-worker rebuild-ui restart-api restart-worker restart-ui dev-api dev-worker dev-ui verify-link reset-link scale-worker

# Default target
.DEFAULT_GOAL := help

# Load .env if exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Detect docker compose command (v2 vs v1)
DOCKER_COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# Colors
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
NC     := \033[0m

##@ Help
help: ## Display this help
	@echo "Webhook Platform - Makefile"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Lifecycle
init: ## Initialize .env from .env.dist (if not exists)
	@if [ ! -f .env ]; then \
		echo "$(GREEN)Creating .env from .env.dist...$(NC)"; \
		cp .env.dist .env; \
		echo "$(YELLOW)  Using development defaults. CHANGE SECRETS FOR PRODUCTION!$(NC)"; \
	else \
		echo "$(GREEN).env already exists, skipping...$(NC)"; \
	fi

up: init ## Start services (embedded DB, dev mode)
	@echo "$(GREEN)Starting services in embedded DB mode...$(NC)"
	@$(MAKE) doctor
	@$(DOCKER_COMPOSE) --profile embedded-db up -d --build
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Services started successfully$(NC)"
	@$(MAKE) health

up-external-db: init ## Start services (external DB, dev mode)
	@echo "$(GREEN)Starting services in external DB mode...$(NC)"
	@$(MAKE) doctor
	@if [ -z "$(DB_HOST)" ] || [ "$(DB_HOST)" = "CHANGE_ME_DB_HOST" ]; then \
		echo "$(RED)ERROR: DB_HOST must be set for external DB mode$(NC)"; \
		exit 1; \
	fi
	@$(DOCKER_COMPOSE) up -d --build
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Services started successfully$(NC)"
	@$(MAKE) health

DOCKER_COMPOSE_PROD := $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml

up-prod: init ## Start services (embedded DB, production mode)
	@echo "$(GREEN)Starting services in PRODUCTION mode (embedded DB)...$(NC)"
	@$(MAKE) doctor
	@$(DOCKER_COMPOSE_PROD) --profile embedded-db up -d --no-build
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Production services started$(NC)"
	@$(MAKE) health

up-prod-external: init ## Start services (external DB, production mode)
	@echo "$(GREEN)Starting services in PRODUCTION mode (external DB)...$(NC)"
	@$(MAKE) doctor
	@if [ -z "$(DB_HOST)" ] || [ "$(DB_HOST)" = "CHANGE_ME_DB_HOST" ]; then \
		echo "$(RED)ERROR: DB_HOST must be set for external DB mode$(NC)"; \
		exit 1; \
	fi
	@$(DOCKER_COMPOSE_PROD) up -d --no-build
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Production services started$(NC)"
	@$(MAKE) health

down: ## Stop services (keeps data)
	@echo "$(YELLOW)Stopping services...$(NC)"
	@$(DOCKER_COMPOSE) --profile embedded-db --profile minio down 2>/dev/null || true
	@echo "$(GREEN)Services stopped$(NC)"

stop: ## Stop services (alias for down)
	@$(MAKE) down

clean: ## Stop services and remove containers (keeps volumes)
	@echo "$(YELLOW)Cleaning up containers...$(NC)"
	@$(DOCKER_COMPOSE) --profile embedded-db --profile minio down --remove-orphans 2>/dev/null || true
	@echo "$(GREEN)Cleanup complete (volumes preserved)$(NC)"

##@ Build
build: ## Build all Docker images
	@echo "$(GREEN)Building Docker images...$(NC)"
	@$(DOCKER_COMPOSE) build --no-cache

rebuild: ## Rebuild and restart services (embedded DB)
	@echo "$(GREEN)Rebuilding services...$(NC)"
	@$(DOCKER_COMPOSE) --profile embedded-db down
	@$(DOCKER_COMPOSE) build --no-cache
	@$(DOCKER_COMPOSE) --profile embedded-db up -d
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Rebuild complete$(NC)"

rebuild-external-db: ## Rebuild and restart services (external DB)
	@echo "$(GREEN)Rebuilding services (external DB mode)...$(NC)"
	@$(DOCKER_COMPOSE) down
	@$(DOCKER_COMPOSE) build --no-cache
	@$(DOCKER_COMPOSE) up -d
	@$(MAKE) wait-healthy
	@$(MAKE) create-topics
	@echo "$(GREEN)Rebuild complete$(NC)"

##@ Development (Fast Rebuilds)
rebuild-api: ## Rebuild only API service (fast)
	@echo "$(GREEN)Rebuilding API...$(NC)"
	@$(DOCKER_COMPOSE) build --no-cache api
	@$(DOCKER_COMPOSE) up -d api
	@echo "$(GREEN) API rebuilt and restarted$(NC)"

rebuild-worker: ## Rebuild only Worker service (fast)
	@echo "$(GREEN)Rebuilding Worker...$(NC)"
	@$(DOCKER_COMPOSE) build --no-cache worker
	@$(DOCKER_COMPOSE) up -d worker
	@echo "$(GREEN) Worker rebuilt and restarted$(NC)"

rebuild-ui: ## Rebuild only UI service (fast)
	@echo "$(GREEN)Rebuilding UI...$(NC)"
	@$(DOCKER_COMPOSE) build --no-cache ui
	@$(DOCKER_COMPOSE) up -d ui
	@echo "$(GREEN) UI rebuilt and restarted$(NC)"

restart-api: ## Restart API service (no rebuild)
	@echo "$(GREEN)Restarting API...$(NC)"
	@$(DOCKER_COMPOSE) restart api
	@echo "$(GREEN)API restarted$(NC)"

restart-worker: ## Restart Worker service (no rebuild)
	@echo "$(GREEN)Restarting Worker...$(NC)"
	@$(DOCKER_COMPOSE) restart worker
	@echo "$(GREEN)Worker restarted$(NC)"

restart-ui: ## Restart UI service (no rebuild)
	@echo "$(GREEN)Restarting UI...$(NC)"
	@$(DOCKER_COMPOSE) restart ui
	@echo "$(GREEN)UI restarted$(NC)"

dev-api: ## Quick dev: rebuild API with cache + restart
	@echo "$(GREEN)Quick rebuild API (with cache)...$(NC)"
	@$(DOCKER_COMPOSE) build api
	@$(DOCKER_COMPOSE) up -d api
	@echo "$(GREEN) API ready$(NC)"
	@$(MAKE) logs-api

dev-worker: ## Quick dev: rebuild Worker with cache + restart
	@echo "$(GREEN)Quick rebuild Worker (with cache)...$(NC)"
	@$(DOCKER_COMPOSE) build worker
	@$(DOCKER_COMPOSE) up -d worker
	@echo "$(GREEN) Worker ready$(NC)"
	@$(MAKE) logs-worker

dev-ui: ## Quick dev: rebuild UI with cache + restart
	@echo "$(GREEN)Quick rebuild UI (with cache)...$(NC)"
	@$(DOCKER_COMPOSE) build ui
	@$(DOCKER_COMPOSE) up -d ui
	@echo "$(GREEN) UI ready$(NC)"
	@$(MAKE) logs-ui

##@ Scaling
scale-worker: ## Scale worker instances (usage: make scale-worker N=3)
	@if [ -z "$(N)" ]; then \
		echo "$(RED)ERROR: Please specify N=<number>, e.g. make scale-worker N=3$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Scaling worker to $(N) instances...$(NC)"
	@$(DOCKER_COMPOSE) up -d --scale worker=$(N) --no-recreate
	@echo "$(GREEN)Worker scaled to $(N) instances$(NC)"

##@ Kafka
KAFKA_PARTITIONS ?= 12
create-topics: ## Create Kafka topics (idempotent)
	@echo "$(GREEN)Creating Kafka topics with $(KAFKA_PARTITIONS) partitions...$(NC)"
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.dispatch --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.1m --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.5m --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.15m --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.1h --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.6h --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.retry.24h --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@docker exec webhook-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic deliveries.dlq --partitions $(KAFKA_PARTITIONS) --replication-factor 1 2>/dev/null || true
	@echo "$(GREEN) Kafka topics created$(NC)"

##@ Monitoring
logs: ## Follow logs for all services
	@$(DOCKER_COMPOSE) logs -f

logs-api: ## Follow logs for API service
	@$(DOCKER_COMPOSE) logs -f api

logs-worker: ## Follow logs for Worker service
	@$(DOCKER_COMPOSE) logs -f worker

logs-ui: ## Follow logs for UI service
	@$(DOCKER_COMPOSE) logs -f ui

verify-link: ## Show last email verification link from API logs
	@$(DOCKER_COMPOSE) logs api 2>&1 | grep "Verify URL:" | tail -1 | sed 's/.*Verify URL: //'

reset-link: ## Show last password reset link from API logs
	@$(DOCKER_COMPOSE) logs api 2>&1 | grep "Reset URL:" | tail -1 | sed 's/.*Reset URL: //'

WAIT_TIMEOUT ?= 120
wait-healthy: ## Wait until API and Worker are healthy (max WAIT_TIMEOUT seconds)
	@echo "$(GREEN)Waiting for services to become healthy (timeout: $(WAIT_TIMEOUT)s)...$(NC)"
	@elapsed=0; \
	while [ $$elapsed -lt $(WAIT_TIMEOUT) ]; do \
		api_ok=$$(curl -sf -o /dev/null http://localhost:8080/actuator/health/liveness 2>/dev/null && echo 1 || echo 0); \
		worker_ok=$$($(DOCKER_COMPOSE) exec -T worker wget -q --spider http://localhost:8081/actuator/health/liveness 2>/dev/null && echo 1 || echo 0); \
		if [ "$$api_ok" = "1" ] && [ "$$worker_ok" = "1" ]; then \
			echo ""; \
			echo "$(GREEN)All services healthy after $${elapsed}s$(NC)"; \
			exit 0; \
		fi; \
		sleep 5; \
		elapsed=$$((elapsed + 5)); \
		printf "\r  Waiting... %ds / $(WAIT_TIMEOUT)s (API=$$api_ok Worker=$$worker_ok)" $$elapsed; \
	done; \
	echo ""; \
	echo "$(RED)ERROR: Services did not become healthy within $(WAIT_TIMEOUT)s$(NC)"; \
	exit 1

health: ## Check health of all services
	@echo "$(GREEN)Checking service health...$(NC)"
	@echo "Postgres: $$(docker exec webhook-postgres pg_isready -U webhook_user 2>/dev/null && echo 'UP' || echo 'DOWN')"
	@echo "Kafka:    $$(docker exec webhook-kafka nc -z localhost 9092 2>/dev/null && echo 'UP' || echo 'DOWN')"
	@echo "Redis:    $$(docker exec webhook-redis redis-cli -a $${REDIS_PASSWORD:-webhook_redis_pass} ping 2>/dev/null | grep -q PONG && echo 'UP' || echo 'DOWN')"
	@echo "API:      $$(curl -sf http://localhost:8080/actuator/health/liveness | jq -r .status 2>/dev/null || echo 'DOWN')"
	@echo "Worker:   $$($(DOCKER_COMPOSE) exec -T worker wget -q -O - http://localhost:8081/actuator/health/liveness 2>/dev/null | jq -r .status 2>/dev/null || echo 'DOWN')"
	@echo "UI:       $$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null || echo 'DOWN')"

##@ Database (Embedded Mode Only)
POSTGRES_USER ?= webhook_user
POSTGRES_DB   ?= webhook_platform
BACKUP_DIR    ?= ./backups

shell-db: ## Open psql shell in embedded database
	@if [ "$(DB_MODE)" != "embedded" ]; then \
		echo "$(RED)ERROR: This command only works in embedded DB mode$(NC)"; \
		exit 1; \
	fi
	@docker exec -it webhook-postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

backup-db: ## Backup embedded database to ./backups/
	@if [ "$(DB_MODE)" != "embedded" ]; then \
		echo "$(RED)ERROR: This command only works in embedded DB mode$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p $(BACKUP_DIR)
	@docker exec webhook-postgres pg_dump -U $(POSTGRES_USER) $(POSTGRES_DB) | gzip > $(BACKUP_DIR)/webhook_platform_$$(date +%Y%m%d_%H%M%S).sql.gz
	@echo "$(GREEN)Backup created in $(BACKUP_DIR)/$(NC)"
	@ls -lh $(BACKUP_DIR)/ | tail -1

restore-db: ## Restore embedded database from backup (usage: make restore-db FILE=backups/webhook_platform_20241217_120000.sql.gz)
	@if [ "$(DB_MODE)" != "embedded" ]; then \
		echo "$(RED)ERROR: This command only works in embedded DB mode$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)ERROR: Please specify FILE=path/to/backup.sql.gz$(NC)"; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "$(RED)ERROR: File $(FILE) not found$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)  WARNING: This will DROP and recreate the database$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or Enter to continue...$(NC)"
	@read confirm
	@echo "$(GREEN)Restoring database from $(FILE)...$(NC)"
	@gunzip -c $(FILE) | docker exec -i webhook-postgres psql -U $(POSTGRES_USER) $(POSTGRES_DB)
	@echo "$(GREEN)Database restored$(NC)"

##@ Diagnostics
doctor: ## Run pre-flight checks
	@echo "$(GREEN)Running diagnostics...$(NC)"
	@which docker > /dev/null || (echo "$(RED)ERROR: docker not found$(NC)" && exit 1)
	@$(DOCKER_COMPOSE) version > /dev/null || (echo "$(RED)ERROR: docker compose not found$(NC)" && exit 1)
	@[ -f .env ] || (echo "$(YELLOW)WARNING: .env file not found. Copy .env.dist to .env$(NC)" && exit 1)
	@if [ "$(APP_ENV)" = "production" ] || [ "$(APP_ENV)" = "prod" ]; then \
		echo "$(GREEN)Production mode detected — running strict checks...$(NC)"; \
		fail=0; \
		if echo "$(WEBHOOK_ENCRYPTION_KEY)" | grep -qi 'change_me\|dev_'; then \
			echo "$(RED)ERROR: WEBHOOK_ENCRYPTION_KEY contains dev/placeholder value$(NC)"; fail=1; \
		fi; \
		if echo "$(JWT_SECRET)" | grep -qi 'change_me\|dev_'; then \
			echo "$(RED)ERROR: JWT_SECRET contains dev/placeholder value$(NC)"; fail=1; \
		fi; \
		if echo "$(REDIS_PASSWORD)" | grep -qi 'webhook_redis_pass'; then \
			echo "$(RED)ERROR: REDIS_PASSWORD is using the default dev value$(NC)"; fail=1; \
		fi; \
		if echo "$(POSTGRES_PASSWORD)" | grep -qi 'webhook_dev_pass\|webhook_pass'; then \
			echo "$(RED)ERROR: POSTGRES_PASSWORD is using the default dev value$(NC)"; fail=1; \
		fi; \
		if [ "$(WEBHOOK_ALLOW_PRIVATE_IPS)" = "true" ]; then \
			echo "$(YELLOW)WARNING: WEBHOOK_ALLOW_PRIVATE_IPS=true in production (SSRF risk)$(NC)"; \
		fi; \
		if [ "$(SWAGGER_ENABLED)" = "true" ]; then \
			echo "$(YELLOW)WARNING: SWAGGER_ENABLED=true in production$(NC)"; \
		fi; \
		if [ "$(DB_SSL_MODE)" = "disable" ]; then \
			echo "$(YELLOW)WARNING: DB_SSL_MODE=disable in production$(NC)"; \
		fi; \
		if [ $$fail -ne 0 ]; then exit 1; fi; \
	fi
	@if [ "$(DB_MODE)" = "external" ]; then \
		if [ -z "$(DB_HOST)" ] || [ "$(DB_HOST)" = "CHANGE_ME_DB_HOST" ] || [ "$(DB_HOST)" = "postgres" ]; then \
			echo "$(RED)ERROR: DB_HOST must be set to a real host for external DB mode$(NC)"; \
			exit 1; \
		fi; \
		if [ -z "$(DB_PASSWORD)" ] || [ "$(DB_PASSWORD)" = "CHANGE_ME_DB_PASSWORD" ]; then \
			echo "$(RED)ERROR: DB_PASSWORD must be set for external DB mode$(NC)"; \
			exit 1; \
		fi; \
	fi
	@echo "$(GREEN)All checks passed$(NC)"

##@ Danger Zone
nuke: ## DESTROY EVERYTHING including volumes (requires CONFIRM=YES)
	@if [ "$(CONFIRM)" != "YES" ]; then \
		echo "$(RED)"; \
		echo "╔═══════════════════════════════════════════════════════════════╗"; \
		echo "║                           WARNING                             ║"; \
		echo "║                                                               ║"; \
		echo "║  This will PERMANENTLY DELETE:                                ║"; \
		echo "║    • All containers                                           ║"; \
		echo "║    • All volumes (database data will be LOST)                 ║"; \
		echo "║    • All images                                               ║"; \
		echo "║    • All networks                                             ║"; \
		echo "║                                                               ║"; \
		echo "║  THIS CANNOT BE UNDONE!                                       ║"; \
		echo "║                                                               ║"; \
		echo "║  To proceed, run:                                             ║"; \
		echo "║    make nuke CONFIRM=YES                                      ║"; \
		echo "╚═══════════════════════════════════════════════════════════════╝"; \
		echo "$(NC)"; \
		exit 1; \
	fi
	@echo "$(RED)Destroying everything...$(NC)"
	@$(DOCKER_COMPOSE) --profile embedded-db --profile minio down -v --remove-orphans --rmi local 2>/dev/null || true
	@docker volume rm webhook_pgdata kafka_data redis_data minio_data 2>/dev/null || true
	@docker network rm webhook-platform_webhook-network 2>/dev/null || true
	@echo "$(GREEN)Nuclear option complete$(NC)"
