# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainers directly or use GitHub's private vulnerability reporting
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix promptly.

## Security Best Practices

When deploying Webhook Platform:

### Secrets Management
- Use environment variables or secrets management (Vault, AWS Secrets Manager)
- Never commit secrets to the repository
- Rotate API keys and JWT secrets regularly

### Network Security
- Deploy behind a reverse proxy (nginx, Traefik)
- Use TLS/HTTPS for all external traffic
- Restrict database access to internal networks only

### Authentication
- Use strong JWT secrets (256+ bits)
- Configure appropriate token expiration times
- Enable rate limiting in production

### Database
- Use strong PostgreSQL passwords
- Enable SSL for database connections
- Regular backups with encryption

## Security Features

- **HMAC Signatures**: All webhook deliveries are signed with HMAC-SHA256
- **Rate Limiting**: Redis-based distributed rate limiting
- **API Key Authentication**: Secure API key generation and validation
- **JWT Tokens**: Short-lived access tokens with refresh token rotation
