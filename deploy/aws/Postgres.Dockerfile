FROM golang:1.27.3-alpine3.24@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS build
WORKDIR /build
# Keep PostgreSQL's normal entrypoint and user-switching behavior; rebuild its
# gosu helper with patched Go and user/syscall dependencies.
RUN go mod init doccraft-postgres-helper \
    && go get github.com/tianon/gosu@6456aaa0f3c854d199d0f037f068eb97515b7513 \
    && go get github.com/moby/sys/user@v0.4.1 golang.org/x/sys@v0.49.0 \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /gosu github.com/tianon/gosu

FROM postgres:17-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27 AS runtime
COPY --from=build /gosu /usr/local/bin/gosu
RUN gosu --version
