# Dairy Vyapar — Deployment Guide

## Server Info
| Item | Value |
|------|-------|
| VPS IP | `31.97.235.218` |
| VPS User | `root` |
| VPS Password | See `VPS_ACCESS.md` |
| SSH Key | Plink (SHA256: `4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8`) |
| Domain | `dairyvyapar.clustcoders.com` |

## Directory Structure
| Path | What |
|------|------|
| `D:\Project\BillManager - MultiDairy version` | Local repo (source of truth) |
| `/home/admin/dairyvyapar-server` | Server (NestJS) on VPS |
| `/home/admin/dairyvyapar` | Client (Next.js) on VPS |

## PM2 Processes
| Name | What | Port |
|------|------|------|
| `dairyvyapar-api` | NestJS server | 5003 |
| `dairyvyapar-frontend` | Next.js client | 3003 |

## Nginx
- Port 8080 → proxies to Next.js (3003) for all traffic
- Port 8083 → proxies `/api/` to NestJS (5003), everything else to Next.js (3003)

---

## Step-by-Step Deployment

### Step 1: Push code to GitHub

```powershell
cd "D:\Project\BillManager - MultiDairy version"
git add -A
git commit -m "your message"
git pull --rebase origin main    # always pull first to avoid rejection
git push origin main
```

### Step 2: Build server

```powershell
cd "D:\Project\BillManager - MultiDairy version\server"

# If schema.prisma was changed, regenerate Prisma client FIRST
npx prisma generate

# Build NestJS
npx nest build
```

### Step 3: Build client

```powershell
cd "D:\Project\BillManager - MultiDairy version\client"

# CRITICAL: Set NEXT_PUBLIC_API_URL to /api for production
# This env var is baked into the build at compile time
$env:NEXT_PUBLIC_API_URL='/api'
npm run build
```

> **IMPORTANT**: Never build with `NEXT_PUBLIC_API_URL=http://localhost:5000`. That's for local dev only. The VPS build MUST use `/api`.

### Step 4: Upload server dist to VPS

```powershell
& "C:\Program Files\PuTTY\pscp.exe" -l root -pw "PASSWORD" -hostkey "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8" -r "D:\Project\BillManager - MultiDairy version\server\dist\*" root@31.97.235.218:/home/admin/dairyvyapar-server/dist/
```

### Step 5: Upload client build to VPS (use tarball)

```powershell
# Create tarball locally
tar -czf client-next.tar.gz -C "D:\Project\BillManager - MultiDairy version\client" .next

# Upload tarball to VPS
& "C:\Program Files\PuTTY\pscp.exe" -l root -pw "PASSWORD" -hostkey "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8" client-next.tar.gz root@31.97.235.218:/tmp/client-next.tar.gz

# Clean up local tarball
Remove-Item -Path "D:\Project\BillManager - MultiDairy version\client-next.tar.gz" -Force
```

> **DO NOT use `pscp -r` for the `.next` directory** — it times out and misses chunk files, causing client-side crashes. Always use a tarball.

### Step 6: Extract on VPS and restart

```powershell
& "C:\Program Files\PuTTY\plink.exe" -ssh -batch -l root -pw "PASSWORD" -hostkey "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8" 31.97.235.218 "rm -rf /home/admin/dairyvyapar/.next && tar -xzf /tmp/client-next.tar.gz -C /home/admin/dairyvyapar/ && pm2 restart dairyvyapar-api dairyvyapar-frontend && rm /tmp/client-next.tar.gz"
```

### Step 7: If Prisma schema changed, regenerate on VPS too

```powershell
& "C:\Program Files\PuTTY\plink.exe" -ssh -batch -l root -pw "PASSWORD" -hostkey "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8" 31.97.235.218 "cd /home/admin/dairyvyapar-server && npx prisma generate && npx prisma db push && pm2 restart dairyvyapar-api"
```

---

## Quick Deploy (All-in-One)

Copy-paste this block into PowerShell for a full deploy:

```powershell
$dir = "D:\Project\BillManager - MultiDairy version"
$host_key = "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$plink = "C:\Program Files\PuTTY\plink.exe"

# 1. Push to GitHub
cd $dir
git add -A; git commit -m "deploy"; git pull --rebase origin main; git push origin main

# 2. Build server
cd "$dir\server"
npx prisma generate
npx nest build

# 3. Build client
cd "$dir\client"
$env:NEXT_PUBLIC_API_URL='/api'
npm run build

# 4. Upload server
& $pscp -l root -pw "PASSWORD" -hostkey $host_key -r "$dir\server\dist\*" root@31.97.235.218:/home/admin/dairyvyapar-server/dist/

# 5. Upload client via tarball
tar -czf client-next.tar.gz -C "$dir\client" .next
& $pscp -l root -pw "PASSWORD" -hostkey $host_key client-next.tar.gz root@31.97.235.218:/tmp/client-next.tar.gz
Remove-Item -Path "$dir\client-next.tar.gz" -Force

# 6. Extract and restart
& $plink -ssh -batch -l root -pw "PASSWORD" -hostkey $host_key 31.97.235.218 "rm -rf /home/admin/dairyvyapar/.next && tar -xzf /tmp/client-next.tar.gz -C /home/admin/dairyvyapar/ && cd /home/admin/dairyvyapar-server && npm install --silent && npx prisma generate && pm2 restart dairyvyapar-api dairyvyapar-frontend && rm /tmp/client-next.tar.gz"
```

---

## If Only Server Changed (No Client UI Changes)

Skip the `.next` tarball steps. Just:

1. Build server: `cd server; npx prisma generate; npx nest build`
2. Upload dist: `pscp -r server\dist\* root@VPS:/home/admin/dairyvyapar-server/dist/`
3. Restart API: `plink ... "cd /home/admin/dairyvyapar-server && npx prisma generate && pm2 restart dairyvyapar-api"`

## If Only Client Changed (No Server Changes)

Skip server dist upload. Just:

1. Build client: `cd client; $env:NEXT_PUBLIC_API_URL='/api'; npm run build`
2. Tarball + upload `.next`
3. Extract + restart frontend: `plink ... "rm -rf /home/admin/dairyvyapar/.next && tar -xzf /tmp/client-next.tar.gz -C /home/admin/dairyvyapar/ && pm2 restart dairyvyapar-frontend"`

---

## Troubleshooting

### Site shows "Application Error" (client-side exception)
- Cause: Missing `.next` chunks (pscp upload was incomplete)
- Fix: Re-upload via tarball method (Step 5-6)

### CORS / Mixed Content errors
- Cause: `NEXT_PUBLIC_API_URL` is set to `http://localhost:5000` instead of `/api`
- Fix: Rebuild client with `$env:NEXT_PUBLIC_API_URL='/api'` and re-upload

### 500 error on API endpoints (e.g., /api/dairies)
- Cause: Prisma client missing new models/fields
- Fix: Upload updated `schema.prisma`, run `npx prisma generate` on VPS, restart API

### "Data too long for column" errors
- Cause: DB column size too small for the data
- Fix: `npx prisma db push` on VPS to sync schema changes

### Git push rejected (non-fast-forward)
- Cause: Remote has commits you don't have locally
- Fix: `git pull --rebase origin main` before pushing

---

## Plink/PSCP Reference

```powershell
# PSCP (upload files)
& "C:\Program Files\PuTTY\pscp.exe" -l root -pw "PASSWORD" -hostkey "SHA256:..." LOCAL_FILE root@31.97.235.218:/remote/path

# PLINK (run commands)
& "C:\Program Files\PuTTY\plink.exe" -ssh -batch -l root -pw "PASSWORD" -hostkey "SHA256:..." 31.97.235.218 "remote command"
```

Replace `PASSWORD` with actual VPS password (see `VPS_ACCESS.md`).
