# krun branch status

The SPR plugin API uses host Unix socket -> vsock 4040 -> guest Unix socket.
Vaultwarden's client-facing HTTP service now binds inside the guest, so
clients must use the SPR DHCP address assigned to `kvaultwarden0` unless SPR
adds a deliberate host listener/proxy for the router's former port 8989.

No client-facing TCP listener is added to the host by this branch.
