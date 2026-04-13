"""Edition detection for the open-core architecture.

Determines whether the application is running in community edition (CE)
or enterprise edition (EE) based on the availability of the ``ee``
package.
"""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def is_ee() -> bool:
    """Return ``True`` if enterprise extensions are available."""
    try:
        import ee  # noqa: F401

        return True
    except ImportError:
        return False


def edition_name() -> str:
    """Return a human-readable edition label (``"ee"`` or ``"ce"``)."""
    return "ee" if is_ee() else "ce"
