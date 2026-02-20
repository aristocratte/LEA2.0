FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    jq \
    tree \
    nmap \
    dnsutils \
    whois \
    whatweb \
    wafw00f \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/lea-kali /workspace/pentests /workspace/shared /workspace/logs

COPY server.py /opt/lea-kali/server.py
COPY entrypoint.sh /opt/lea-kali/entrypoint.sh
COPY healthcheck.sh /opt/lea-kali/healthcheck.sh

RUN chmod +x /opt/lea-kali/entrypoint.sh /opt/lea-kali/healthcheck.sh

EXPOSE 3002

ENTRYPOINT ["/opt/lea-kali/entrypoint.sh"]
