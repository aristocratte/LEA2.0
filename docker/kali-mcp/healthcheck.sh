#!/bin/sh
set -e

curl -fsS "http://localhost:${MCP_PORT:-3002}/health" >/dev/null

for cmd in nmap dig whois curl; do
  command -v "$cmd" >/dev/null
done
