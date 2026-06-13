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
URL: http://31.97.235.218:8080/
```

## Host Key Fingerprint

```
ssh-ed25519 255 SHA256:4mN0Keh6jX6d3f8fIgEfM4hWju9wypoUr9kXgqxctA8
```

## Database (MySQL)

```
Host: 127.0.0.1 (localhost via SSH tunnel)
Port: 3306
User: admin_billmanager
Password: RNhM44VeME24YSGzZqPj
Database: admin_billmanager
```

Access via SSH:
```bash
mysql -u admin_billmanager -p'RNhM44VeME24YSGzZqPj' admin_billmanager
```

## Bill Manager Locations

- **Client**: `/root/bill-manager-client`
- **Server**: `/home/admin/bill-manager-server`
- **Domain**: `/home/admin/domains/billmanager.com/public_html/`
