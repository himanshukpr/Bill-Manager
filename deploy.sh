#!/bin/bash
set -e

REPO=/tmp/billmanager-repo
deploy_site() {
    local NAME=$1
    local SERVER_DIR=$2
    local FRONTEND_DIR=$3
    local DB_URL=$4

    echo "===== Deploying $NAME ====="

    # ---- Server ----
    if [ -d "$SERVER_DIR" ]; then
        echo "--- Server: rsync source files ---"
        rsync -a --delete \
            --exclude='node_modules' \
            --exclude='dist' \
            --exclude='.env' \
            "$REPO/server/" "$SERVER_DIR/"

        cd "$SERVER_DIR"
        
        echo "--- Server: npm install ---"
        npm install --silent 2>&1 | tail -2
        
        echo "--- Server: prisma generate ---"
        npx prisma generate 2>&1 | tail -2
        
        echo "--- Server: prisma migrate deploy ---"
        DATABASE_URL="$DB_URL" npx prisma migrate deploy 2>&1 | tail -5
        
        echo "--- Server: build ---"
        npm run build 2>&1 | tail -5
        
        echo "--- Server: done ---"
    else
        echo "Server dir $SERVER_DIR not found, skipping"
    fi

    # ---- Frontend ----
    if [ -d "$FRONTEND_DIR" ]; then
        echo "--- Frontend: rsync source files ---"
        rsync -a --delete \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='.env' \
            "$REPO/client/" "$FRONTEND_DIR/"

        cd "$FRONTEND_DIR"
        
        echo "--- Frontend: npm install ---"
        npm install --silent 2>&1 | tail -2
        
        echo "--- Frontend: build ---"
        npm run build 2>&1 | tail -5
        
        echo "--- Frontend: done ---"
    else
        echo "Frontend dir $FRONTEND_DIR not found, skipping"
    fi
    
    echo "===== $NAME deploy complete ====="
}

# Original billmanager
deploy_site "billmanager" \
    "/home/admin/bill-manager-server" \
    "/home/admin/domains/billmanager.com/public_html" \
    "mysql://admin_billmanager:RNhM44VeME24YSGzZqPj@localhost:3306/admin_billmanager"

# GNDairy2
deploy_site "gndairy2" \
    "/home/admin/gndairy2-server" \
    "/home/admin/domains/gndairy2/public_html" \
    "mysql://admin_gndairy2:CDygKvqpgd8mS6taTCgH@localhost:3306/admin_gndairy2"

# Doddhi
deploy_site "doddhi" \
    "/home/admin/doddhi-server" \
    "/home/admin/domains/doddhi/public_html" \
    "mysql://admin_doddhi:m87qUt7zevCLuKZVgqNL@localhost:3306/admin_doddhi"

echo "All sites deployed. Restarting PM2..."
pm2 restart all 2>&1 | tail -5
echo "PM2 restart complete"
