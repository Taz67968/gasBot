#!/usr/bin/env bash
#
# GasBot Production Deployment + Daily PostGIS Backup Pipeline
# Location: scripts/gasbot-deploy-and-backup.sh
#
# Features:
#   - Runs database migrations
#   - Performs daily compressed pg_dump of core PostGIS tables
#   - Streams encrypted backup to S3-compatible offline vault (or any rclone target)
#   - Designed to be triggered by cron or CI/CD
#
# Usage:
#   chmod +x scripts/gasbot-deploy-and-backup.sh
#   ./scripts/gasbot-deploy-and-backup.sh deploy
#   ./scripts/gasbot-deploy-and-backup.sh backup
#
# Recommended cron (daily at 02:30 UTC):
#   30 2 * * * /path/to/scripts/gasbot-deploy-and-backup.sh backup >> /var/log/gasbot-backup.log 2>&1

set -euo pipefail

# =============================================================================
# CONFIGURATION - Override via environment variables or .env file
# =============================================================================
APP_NAME="gasbot"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gasbot}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/gasbot_postgis_${DATE}.sql.gz"

# Database connection (use managed DB credentials in production)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USERNAME:-gasbot}"
DB_NAME="${DB_NAME:-gasbot}"
PGPASSWORD="${DB_PASSWORD}"

# Backup destination (S3-compatible or any rclone remote)
# Examples:
#   S3_BUCKET="s3://gasbot-backups-vault"
#   RCLONE_REMOTE="b2:gasbot-vault"
BACKUP_REMOTE="${BACKUP_REMOTE:-s3://gasbot-production-backups}"

# Retention (delete backups older than N days on the remote)
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# =============================================================================
# FUNCTIONS
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

ensure_directories() {
    mkdir -p "$BACKUP_DIR"
}

run_migrations() {
    log "Running database migrations..."
    # Assumes you have a migration script or npm command
    # Adjust according to your actual migration tool (TypeORM, Prisma, etc.)
    if command -v npm &> /dev/null && [ -f package.json ]; then
        npm run migration:run || true
    else
        log "No migration runner detected. Skipping migrations."
    fi
}

perform_postgis_backup() {
    log "Starting daily PostGIS backup..."

    ensure_directories

    # Dump only the core transactional tables (adjust table list as needed)
    pg_dump \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --no-owner \
        --no-acl \
        --format=custom \
        --compress=9 \
        --file="${BACKUP_FILE%.gz}" \
        --table=orders \
        --table=payments \
        --table=customers \
        --table=agents \
        --table=zones

    # Compress the dump
    gzip -f "${BACKUP_FILE%.gz}"
    log "Backup created: $BACKUP_FILE"

    # Upload to secure offline vault
    log "Uploading backup to remote vault: $BACKUP_REMOTE"
    if command -v rclone &> /dev/null; then
        rclone copy "$BACKUP_FILE" "$BACKUP_REMOTE/gasbot-postgres/" \
            --s3-server-side-encryption AES256 \
            --s3-storage-class STANDARD_IA
    elif command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_FILE" "$BACKUP_REMOTE/gasbot-postgres/" \
            --storage-class STANDARD_IA \
            --sse AES256
    else
        log "ERROR: Neither rclone nor aws cli found. Backup file left locally at $BACKUP_FILE"
        return 1
    fi

    # Cleanup local copy after successful upload
    rm -f "$BACKUP_FILE"
    log "Local backup removed after successful upload."

    # Prune old backups on remote (retention policy)
    log "Pruning backups older than ${RETENTION_DAYS} days..."
    if command -v rclone &> /dev/null; then
        rclone delete "$BACKUP_REMOTE/gasbot-postgres/" \
            --min-age "${RETENTION_DAYS}d" \
            --dry-run=false || true
    elif command -v aws &> /dev/null; then
        aws s3 ls "$BACKUP_REMOTE/gasbot-postgres/" | while read -r line; do
            file_date=$(echo "$line" | awk '{print $1}')
            file_name=$(echo "$line" | awk '{print $4}')
            if [[ "$file_date" < "$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)" ]]; then
                aws s3 rm "$BACKUP_REMOTE/gasbot-postgres/$file_name"
            fi
        done || true
    fi

    log "Daily PostGIS backup pipeline completed successfully."
}

# =============================================================================
# MAIN
# =============================================================================

case "${1:-help}" in
    deploy)
        log "Starting GasBot production deployment..."
        run_migrations
        log "Deployment steps completed (add your docker pull / ecs deploy / railway deploy here)."
        ;;

    backup)
        perform_postgis_backup
        ;;

    *)
        echo "Usage: $0 {deploy|backup}"
        echo "  deploy   - Run migrations and trigger production deployment"
        echo "  backup   - Execute daily compressed PostGIS backup to vault"
        exit 1
        ;;
esac
