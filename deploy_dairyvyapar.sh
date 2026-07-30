#!/bin/bash
set -e

echo "===== Setting up Dairy Vyapar ====="

# Clone latest code
rm -rf /tmp/dairyvyapar-repo
cd /tmp
git clone https://github.com/himanshukpr/Bill-Manager.git dairyvyapar-repo -q
REPO=/tmp/dairyvyapar-repo
echo "Repo cloned"

# Create directories
mkdir -p /home/admin/dairyvyapar-server
mkdir -p /home/admin/dairyvyapar
echo "Directories created"

# Apply Prisma schema to new database
cd $REPO/server
export DATABASE_URL="mysql://admin_dairy_vyapar:QN3ZFcsjCtEKxB7UdRh9@localhost:3306/admin_dairy_vyapar"
npx prisma db push --skip-generate 2>&1 | tail -3
echo "Database schema applied"

# ---- SERVER SETUP ----
echo "--- Setting up server ---"
rsync -a --delete --exclude='node_modules' --exclude='dist' "$REPO/server/" "/home/admin/dairyvyapar-server/"

# Create .env for server
cat > /home/admin/dairyvyapar-server/.env << 'ENVFILE'
DATABASE_URL="mysql://admin_dairy_vyapar:QN3ZFcsjCtEKxB7UdRh9@localhost:3306/admin_dairy_vyapar"
JWT_SECRET="dairy-vyapar-jwt-secret-2026"
PORT=5003
ENVFILE

cd /home/admin/dairyvyapar-server
npm install --silent 2>&1 | tail -2
npx prisma generate 2>&1 | tail -2
npm run build 2>&1 | tail -3
echo "Server build complete"

# ---- FRONTEND SETUP ----
echo "--- Setting up frontend ---"
rsync -a --delete --exclude='node_modules' --exclude='.next' "$REPO/client/" "/home/admin/dairyvyapar/"

# Create .env for frontend
cat > /home/admin/dairyvyapar/.env << 'ENVFILE'
NEXT_PUBLIC_API_URL=http://31.97.235.218:8083/api
NEXT_PUBLIC_APP_NAME="Dairy Vyapar"
ENVFILE

cd /home/admin/dairyvyapar
npm install --silent 2>&1 | tail -2
npm run build 2>&1 | tail -5
echo "Frontend build complete"

# ---- PM2 ----
echo "--- Setting up PM2 ---"
pm2 delete dairyvyapar-api 2>/dev/null || true
pm2 delete dairyvyapar-frontend 2>/dev/null || true

pm2 start /home/admin/dairyvyapar-server/dist/main.js --name dairyvyapar-api 2>&1 | tail -2
pm2 start /home/admin/dairyvyapar/node_modules/next/dist/bin/next --name dairyvyapar-frontend -- start -p 3003 2>&1 | tail -2

pm2 save 2>&1 | tail -2
echo "PM2 processes created"

# ---- NGINX ----
echo "--- Setting up nginx ---"
cat > /etc/nginx/conf.d/dairyvyapar.conf << 'NGINX'
server {
    listen 8083;
    server_name dairyvyapar.clustcoders.com;

    location /api/ {
        proxy_pass http://127.0.0.1:5003/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
NGINX

nginx -t 2>&1 | tail -1
systemctl reload nginx 2>&1 || nginx -s reload 2>&1
echo "nginx configured"

# ---- CSF ----
echo "--- Adding port 8083 to CSF ---"
if grep -q '8083' /etc/csf/csf.conf; then
    echo "Port 8083 already in CSF"
else
    sed -i 's/^TCP_IN = "\(.*\)"/TCP_IN = "\1,8083"/' /etc/csf/csf.conf
    sed -i 's/^TCP6_IN = "\(.*\)"/TCP6_IN = "\1,8083"/' /etc/csf/csf.conf
    csf -r 2>&1 | tail -2
    echo "CSF updated"
fi

echo "===== Dairy Vyapar setup complete ====="
