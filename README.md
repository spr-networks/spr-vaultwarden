## About

Run vaultwarden on your spr.  Vaultwarden is a lightweight Bitwarden compatible server, written in Rust.  This allows you self host your password vaults.  This plugin
should be used to configure vaultwarden.  if you enable the admin page (e.g. set the ADMIN_TOKEN), then any changes made via the admin page will supercede the spr plugin
config.

This reduces the attack surface of vaultwarden, as the admin functionality is no longer accessible over the same port as the vault api.

## Overview

This is still in alpha, and there is a high probability that things will change.  

As it exists today:

1. This installs the spr plugin code inside of the vaultwarden/server docker container (along with some additional supporting command line tools)
2. It currently listens on port 8989 by default on the IP address of the SPR, might need to revisit what form of docker networking we want to use

BUGS/TODO
1. After the first configuration change, you might not see any debugging information in the container logs. A container restart will fix that.  
2. Maybe have a reverse proxy in front
3. Probably need to not use vaultwarden/latest to avoid unintentionally breaking the plugin.
4. Maybe a preflight security review 

## HTTPS Support

The Bitwarden clients use web crypto APIs to communicate with the servers.  These APIs require the use of HTTPS, unless you are connecting to loopback.  The certificates cannot be self signed certificates.   

You can either:

1. use the spr plugin ui (recommended) to upload the cert and key file, and then enable ROCKET_TLS 
2. install a cert by logging into the spr on the command line and follow https://github.com/dani-garcia/vaultwarden/wiki/Enabling-HTTPS for ROCKET_TLS
3. ssh portforward into the spr like so: ssh -L 8989:localhost:8989 ubuntu@spr.local (web crypto APIs don't require SSL use over localhost)
4. YOLO it with socat or other form of TCP proxy

