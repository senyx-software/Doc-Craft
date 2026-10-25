# Rebuild Caddy with patched Go and HTTP/2 dependencies. The upstream 2.11.7
# binary was built with Go 1.26.8 and fails the current release vulnerability gate.
FROM golang:1.27.3-alpine3.24@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS build
WORKDIR /build
RUN printf '%s\n' 'package main' 'import (' \
    'caddycmd "github.com/caddyserver/caddy/v2/cmd"' \
    '_ "github.com/caddyserver/caddy/v2/modules/standard"' \
    ')' 'func main() { caddycmd.Main() }' > main.go \
    && go mod init doccraft-staging-edge \
    && go get github.com/caddyserver/caddy/v2@v2.11.7 \
    && go get golang.org/x/net@v0.60.0 \
    && go mod tidy \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /caddy .

FROM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS runtime
RUN apk add --no-cache ca-certificates tzdata mailcap \
    && mkdir -p /etc/caddy /data /config
COPY --from=build /caddy /usr/bin/caddy
COPY --from=build /go/pkg/mod/github.com/caddyserver/caddy/v2@v2.11.7/LICENSE /usr/share/licenses/caddy/LICENSE
COPY --from=build /usr/local/go/LICENSE /usr/share/licenses/go/LICENSE
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
EXPOSE 80 443 8443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
