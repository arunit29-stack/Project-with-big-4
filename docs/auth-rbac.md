# CBB RBAC and JWT setup

## RS256 key generation

Generate a 4096-bit RSA key pair:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out jwt-private.pem
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
```

## Environment variables

Set `JWT_PRIVATE_KEY` to the full PEM contents of `jwt-private.pem` and `JWT_PUBLIC_KEY` to the full PEM contents of `jwt-public.pem`.

If you need to store them in a single-line `.env` file or Kubernetes Secret, replace newlines with `\n` and the loader will normalize them back to PEM format.

## Token policy

- Access tokens are RS256 signed.
- Maximum lifetime is 60 minutes.
- Payload claims are `sub`, `role`, `institutionId`, `iat`, `exp`, and `jti`.
- Logout and browser-close teardown add the token `jti` to the Redis blocklist until expiration.

## Server-side enforcement

- Use `requireAuth(["teacher", "admin"])` for teacher-only routes.
- Use `requireAuth(["student"])` for student-only routes.
- Use `requireAuth(["admin", "teacher", "student"])` for any authenticated route.
- Return `401` for missing or invalid tokens.
- Return `403` for valid tokens that lack the required role.
- Never use `404` to hide a protected route.
