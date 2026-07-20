# Wordflare — operator workflow.
# A thin wrapper over the real commands (npm scripts / wrangler). The underlying
# commands live in package.json; this just composes them. Run `make` for help.

DB ?= wordflare
PORT ?= 8787

.PHONY: help install setup migrate dev test typecheck health db clean distclean deploy

help: ## List these targets
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install Node dependencies (npm install)
	npm install

# One-shot bootstrap. Steps are inlined so the order is guaranteed.
setup: ## First-time bootstrap: deps, local .dev.vars, migrations
	npm install
	@[ -f .dev.vars ] || { cp .dev.vars.example .dev.vars && echo "Created .dev.vars from .dev.vars.example — edit the secret before deploying."; }
	npm run db:migrate:local
	@echo "Setup complete. Run 'make dev'."

migrate: ## Apply D1 migrations locally (wrangler d1 migrations apply --local)
	npm run db:migrate:local

dev: ## Start the local dev server (wrangler dev) on :8787
	npm run dev

test: ## Run the test suite (@cloudflare/vitest-pool-workers)
	npm test

typecheck: ## Type-check the project (tsc --noEmit)
	npm run typecheck

health: ## Probe the running dev server's /__health
	@curl -fsS "http://127.0.0.1:$(PORT)/__health"; echo

db: ## Run SQL on the local D1: make db Q="SELECT * FROM posts"
	@if [ -z "$(Q)" ]; then echo 'Usage: make db Q="SELECT * FROM posts"' >&2; exit 2; fi
	npx wrangler d1 execute $(DB) --local --command "$(Q)"

clean: ## Wipe local runtime/D1 state (.wrangler); re-run 'make migrate' after
	rm -rf .wrangler

distclean: clean ## clean + remove node_modules
	rm -rf node_modules

deploy: ## Deploy to production (needs wrangler login + a remote D1)
	npm run deploy
