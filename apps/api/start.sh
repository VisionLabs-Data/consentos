#!/bin/sh
exec uvicorn src.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --access-log \
  --proxy-headers \
  --forwarded-allow-ips '*'
