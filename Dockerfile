# syntax=docker/dockerfile:1.4
# =============================================================================
# Production-hardened Multi-stage Dockerfile for GasBot NestJS API
# Base: node:20-alpine (minimal attack surface, small image size ~200MB final)
# =============================================================================
# Focus: layer caching for fast CI builds, strict production compilation,
#        minimal runtime footprint, secure non-root execution context.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Caching Dependencies Builder
# Purpose: Isolate dependency installation to maximize Docker layer cache hits.
# Only re-runs when package.json or package-lock.json changes.
# Installs full dependency tree (prod + dev) because build requires CLI/tools.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Set working directory inside container
WORKDIR /app

# Copy only lockfiles/manifests first (best practice for cache efficiency)
COPY package.json package-lock.json ./

# Clean, reproducible, cached install (no funding noise, no audit in build)
RUN npm ci --no-audit --no-fund --prefer-offline

# -----------------------------------------------------------------------------
# Stage 2: TypeScript Production Compilation
# Purpose: Perform strict type-checked build using the enterprise tsconfig.json
#          (strict: true, noImplicit*, path aliases resolved at compile time).
# After build, prune devDependencies to produce minimal node_modules for runtime.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Reuse the fully cached node_modules from previous stage (layer cache)
COPY --from=deps /app/node_modules ./node_modules

# Copy entire source tree and all config files required for compilation
# (tsconfig.json, nest-cli.json, src/, etc.)
COPY . .

# Execute production build (outputs to /app/dist with clean JS)
# Nest CLI uses tsc under the hood with our strict settings + path mappings
RUN npm run build

# Remove all development dependencies to shrink the final image
# Production node_modules now contains only runtime packages (incl. tsconfig-paths)
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 3: Optimized Minimal Runtime Engine
# Purpose: Produce the smallest possible secure production container.
# - Uses fresh alpine base (no build tools, no dev deps)
# - Runs as non-root user 'nestjs' (UID 1001) - principle of least privilege
# - Only ships: compiled dist/, pruned node_modules/, minimal tsconfig for aliases
# - Supports @/* path aliases at runtime via tsconfig-paths/register
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# -------------------------------------------------------------------------
# Security Hardening: Create dedicated non-root user and group
# Alpine busybox syntax: addgroup/adduser (no shadow utils needed)
# Prevents container escape / privilege escalation attacks
# -------------------------------------------------------------------------
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -D -u 1001 -G nodejs nestjs

# Copy ONLY the artifacts required to run the compiled application
# --chown ensures files are owned by non-root user (prevents permission issues)
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Generate a minimal, runtime-only tsconfig.json
# This overrides paths so that @/* resolves to dist/* (compiled output)
# at runtime. Keeps final image tiny; no src/ or TypeScript sources shipped.
RUN printf '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["dist/*"]}}}' > tsconfig.json && \
    chown nestjs:nodejs tsconfig.json

# Production environment variables (overridable via compose / orchestrator)
ENV NODE_ENV=production
ENV PORT=3000

# Run the entire container as the unprivileged nestjs user
USER nestjs

# Document the listening port (for orchestrators / docs)
EXPOSE 3000

# -----------------------------------------------------------------------------
# Production entrypoint
# Uses tsconfig-paths/register so that compiled code can continue using
# clean enterprise-style imports: import { Foo } from '@/modules/foo';
# This matches exactly the alias defined in tsconfig.json
# -----------------------------------------------------------------------------
CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
