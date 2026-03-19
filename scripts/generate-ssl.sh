#!/bin/bash
#
# SSL Certificate Generation Script for LEA Backend
# Usage: ./scripts/generate-ssl.sh [environment]
#   environment: 'dev' (self-signed, default) or 'prod' (Let's Encrypt)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERTS_DIR="${PROJECT_ROOT}/backend/certs"
ENV="${1:-dev}"

echo "======================================"
echo "LEA SSL Certificate Generator"
echo "Environment: ${ENV}"
echo "======================================"
echo ""

mkdir -p "${CERTS_DIR}"

generate_dev_certs() {
    echo "Generating self-signed certificates for development..."
    echo ""
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${CERTS_DIR}/server.key" \
        -out "${CERTS_DIR}/server.crt" \
        -subj "/C=US/ST=State/L=City/O=LEA Platform/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,DNS:backend,IP:127.0.0.1,IP:::1"
    
    echo ""
    echo "✓ Self-signed certificates generated:"
    echo "  - ${CERTS_DIR}/server.key"
    echo "  - ${CERTS_DIR}/server.crt"
    echo ""
    echo "⚠️  Warning: These certificates are for development only."
    echo "   Browsers will show security warnings."
    echo ""
}

setup_prod_instructions() {
    echo "Production SSL Setup Instructions"
    echo "=================================="
    echo ""
    echo "For production, you should use valid SSL certificates from a trusted CA."
    echo ""
    echo "Option 1: Let's Encrypt (Free)"
    echo "-------------------------------"
    echo "1. Install certbot:"
    echo "   sudo apt-get install certbot"
    echo ""
    echo "2. Generate certificate:"
    echo "   sudo certbot certonly --standalone -d your-domain.com"
    echo ""
    echo "3. Update .env file:"
    echo "   SSL_ENABLED=true"
    echo "   SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem"
    echo "   SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem"
    echo ""
    echo "Option 2: Commercial Certificate"
    echo "---------------------------------"
    echo "1. Purchase certificate from provider (DigiCert, GlobalSign, etc.)"
    echo ""
    echo "2. Place certificate files:"
    echo "   - ${CERTS_DIR}/server.crt (certificate)"
    echo "   - ${CERTS_DIR}/server.key (private key)"
    echo "   - ${CERTS_DIR}/ca.crt (intermediate CA, optional)"
    echo ""
    echo "3. Update .env file:"
    echo "   SSL_ENABLED=true"
    echo "   SSL_CERT_PATH=${CERTS_DIR}/server.crt"
    echo "   SSL_KEY_PATH=${CERTS_DIR}/server.key"
    echo "   SSL_CA_PATH=${CERTS_DIR}/ca.crt"
    echo ""
}

case "${ENV}" in
    dev|development)
        generate_dev_certs
        ;;
    prod|production)
        setup_prod_instructions
        ;;
    *)
        echo "Unknown environment: ${ENV}"
        echo "Usage: $0 [dev|prod]"
        exit 1
        ;;
esac

echo "Next steps:"
echo "-----------"
echo "1. Update backend/.env file with SSL configuration"
echo "2. Restart the backend server"
echo "3. Access the API via HTTPS"
echo ""
