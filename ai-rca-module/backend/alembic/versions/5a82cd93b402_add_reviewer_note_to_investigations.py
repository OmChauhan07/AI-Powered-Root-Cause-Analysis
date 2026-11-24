"""add_reviewer_note_to_investigations

Revision ID: 5a82cd93b402
Revises: 4f72bc91e301
Create Date: 2026-11-24 19:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5a82cd93b402'
down_revision: Union[str, Sequence[str], None] = '4f72bc91e301'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add reviewer_note to investigations table."""
    op.add_column('investigations', sa.Column('reviewer_note', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema to drop reviewer_note column."""
    op.drop_column('investigations', 'reviewer_note')
