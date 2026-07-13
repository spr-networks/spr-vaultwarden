#!/bin/bash
chown -R nobody /data /ssl /configs
/scripts/vwctl start
/spr-vaultwarden 
