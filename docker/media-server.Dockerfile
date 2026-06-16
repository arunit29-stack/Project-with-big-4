# syntax=docker/dockerfile:1.7
FROM livekit/livekit-server:v1.8.3
USER root
COPY livekit.yaml /etc/livekit.yaml
USER 65532:65532
EXPOSE 7880 7881 50000-50100/udp
CMD ["/livekit-server", "--config", "/etc/livekit.yaml"]
