#!/bin/bash
chown -R nobody /data
/scripts/vwctl start
/spr-vaultwarden 
