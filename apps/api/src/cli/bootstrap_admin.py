"""One-shot bootstrap of an initial organisation and owner user.

Usage:
    python -m src.cli.bootstrap_admin

Reads ``INITIAL_ADMIN_EMAIL`` and ``INITIAL_ADMIN_PASSWORD`` (plus the
optional ``INITIAL_ADMIN_FULL_NAME``, ``INITIAL_ORG_NAME``, and
``INITIAL_ORG_SLUG``) from the environment. If the ``users`` table is
empty and both credentials are set, creates the org and owner user so
the operator can log in to the admin UI. Idempotent: if any user
already exists, exits 0 without touching the database.

Intended to be run as a one-shot init container *after* the database
migrations have been applied — typically via ``depends_on`` with
``service_healthy`` on the API container.
"""

from __future__ import annotations

import asyncio
import sys

from src.config.logging import setup_logging
from src.config.settings import get_settings
from src.services.bootstrap import bootstrap_initial_admin


async def _main() -> int:
    settings = get_settings()
    setup_logging(settings.log_level)
    await bootstrap_initial_admin(settings)
    return 0


def main() -> None:
    sys.exit(asyncio.run(_main()))


if __name__ == "__main__":
    main()
