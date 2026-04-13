"""composite index on consent_records(site_id, consented_at)

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-13

The most common analytic query pattern is "consents for site X in date
range" (consent rates, trends, regional breakdowns). The single-column
indexes on ``site_id`` and ``consented_at`` each help a little, but a
composite index is materially faster for the combined filter.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_consent_records_site_consented_at",
        "consent_records",
        ["site_id", "consented_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_consent_records_site_consented_at",
        table_name="consent_records",
    )
