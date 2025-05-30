FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
# added this line from the container template dockerfile
#RUN apt-get install -y --no-install-recommends attr nftables iproute2 netcat-traditional iputils-ping net-tools vim-tiny nano ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN apt-get install -y --no-install-recommends attr nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
#RUN setfattr -x security.capability /usr/bin/ping
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.23.3.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.23.3.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/

ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags "-s -w" -o /spr-vaultwarden /code/spr-vaultwarden.go

# build ui
FROM node:18 AS builder-ui
RUN mkdir /app
WORKDIR /app
COPY frontend ./
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && \
        mkdir /tmpfs/cache /tmpfs/node_modules && \
        ln -s /tmpfs/node_modules /app/node_modules && \
        ln -s /tmpfs/cache /usr/local/share/.cache; \
    yarn install --network-timeout 86400000 && yarn run build


#FROM ghcr.io/spr-networks/container_template:latest
FROM vaultwarden/server:latest
ENV DEBIAN_FRONTEND=noninteractive
#RUN apt-get update && apt-get install -y --no-install-recommends tcpdump && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends sudo procps psmisc attr nftables iproute2 netcat-traditional iputils-ping net-tools vim-tiny nano ca-certificates curl && rm -rf /var/lib/apt/lists/*
#RUN setfattr -x security.capability /usr/bin/ping
COPY scripts /scripts/
COPY configs/.env.template /
COPY --from=builder /spr-vaultwarden /
COPY --from=builder-ui /app/build/ /ui/
ENTRYPOINT ["/scripts/startup.sh"]
