"""Pseudonymisation helpers for consent records.

Consent records capture a hash of the visitor's IP address and
user-agent string for abuse protection and audit trail purposes.

Previously this used an unsalted truncated SHA-256, which is trivially
reversible for IPv4 addresses (only ~4 billion inputs). We now use
HMAC-SHA256 keyed with a server-side secret so the hash cannot be
recovered without access to the secret.

Public API: :func:`pseudonymise`.
"""

from __future__ import annotations

import hmac
from hashlib import sha256

from src.config.settings import get_settings

# Length of the hex-encoded digest stored in the database. 32 hex chars
# = 128 bits, which is more than enough entropy while keeping the
# column compact. (Previous code used 16 hex chars = 64 bits.)
_DIGEST_HEX_LEN = 32


def pseudonymise(value: str) -> str:
    """Return a keyed hash of *value* safe to store in an audit record.

    Uses HMAC-SHA256 with the configured ``pseudonymisation_secret``
    (falling back to ``jwt_secret_key`` if not explicitly set). The
    resulting hex digest is truncated to 32 characters (128 bits).

    An empty input always returns an empty string so callers don't
    have to branch on missing data.
    """
    if not value:
        return ""
    key = get_settings().pseudonymisation_key
    digest = hmac.new(key, value.encode("utf-8"), sha256).hexdigest()
    return digest[:_DIGEST_HEX_LEN]
