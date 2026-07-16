# VPS Access

## Connection

```
Host: 31.97.235.218
User: root
Password: 3?TuK0j(u-LKw'OUy;vE
```

## SSH Command (Windows - plink)

```powershell
& "C:\Program Files\PuTTY\plink.exe" -ssh -l root -pw "3?TuK0j(u-LKw'OUy;vE" -hostkey "SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8" 31.97.235.218
```

## Website

```
URL: https://dairyvyapar.clustcoders.com/
```

## Host Key Fingerprint

```
ssh-ed25519 255 SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8
```

## Git Repo

```
Repo: /tmp/billmanager-repo
Remote: https://github.com/himanshukpr/Bill-Manager.git
```

Deploy flow (run on VPS):
```bash
cd /tmp/billmanager-repo
git pull origin main
rsync -a --delete --exclude=node_modules --exclude=dist --exclude=.env server/ /home/admin/dairyvyapar-server/
cd /home/admin/dairyvyapar-server
npm install --silent
npx prisma generate
npm run build
rsync -a --delete --exclude=node_modules --exclude=.next --exclude=.env client/ /root/bill-manager-client/
cd /root/bill-manager-client
npm install --silent
npm run build
pm2 restart dairyvyapar-api dairyvyapar-frontend
```

## Database (MySQL) — Production

```
Host: 127.0.0.1 (localhost via SSH tunnel)
Port: 3306
User: admin_dairy_vyapar
Password: QN3ZFcsjCtEKxB7UdRh9
Database: admin_dairy_vyapar
```

Access via SSH:
```bash
mysql -u admin_dairy_vyapar -p'QN3ZFcsjCtEKxB7UdRh9' admin_dairy_vyapar
```

## Deployed Site

| Site | URL | PM2 Process | Server | Frontend | Database |
|------|-----|-------------|--------|----------|----------|
| **dairyvyapar** | https://dairyvyapar.clustcoders.com/ | `dairyvyapar-api` (port 5003), `dairyvyapar-frontend` | `/home/admin/dairyvyapar-server/` | `/root/bill-manager-client/` | `admin_dairy_vyapar` |

## Deployment Locations

- **Server**: `/home/admin/dairyvyapar-server/`
- **Client**: `/root/bill-manager-client/`
- **Repo (pull source)**: `/tmp/billmanager-repo/`
