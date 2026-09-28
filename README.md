# GHOSTLINE V1

Autonomous revenue/outbound engine for Netlify.

## Required production environment
- DATABASE_URL
- HF_TOKEN
- RESEND_API_KEY
- WORKER_SECRET_KEY

Apply `schema.sql` to the production Postgres database before enabling outbound dispatch.

The application deliberately fails closed when credentials are absent.
