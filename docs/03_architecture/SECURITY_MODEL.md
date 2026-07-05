# Security Model

## Data Sensitivity

Pending master prompt.

## Trust Boundaries

- User browser:
- Server runtime:
- Database:
- Third-party APIs:
- Admin surfaces:

## Required Controls

- Secrets stay outside git.
- Production mutations require explicit approval paths.
- User-visible AI output must be reviewable when high impact.
- Logs should not include secrets, credentials, or sensitive personal data.

## Open Questions

- What data is sensitive?
- Who can access admin capabilities?
- What actions are irreversible?
- What audit trail is required?

