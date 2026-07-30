#!/bin/bash
set -e
ZONE=/var/named/clustcoders.com.db
SERIAL=$(grep -oP '\d{10}' $ZONE | head -1)
NEW_SERIAL=$(date +%Y%m%d%H%M)

if grep -q '^dairyvyapar' $ZONE; then
    echo 'dairyvyapar A record already exists'
else
    sed -i '/^_acme-challenge/i dairyvyapar\t3600\tIN\tA\t31.97.235.218' $ZONE
    sed -i "s/$SERIAL/$NEW_SERIAL/" $ZONE
    echo 'Added dairyvyapar A record'
fi

named-checkzone clustcoders.com $ZONE 2>&1 | tail -1
rndc reload clustcoders.com 2>&1
echo 'DNS reloaded'
