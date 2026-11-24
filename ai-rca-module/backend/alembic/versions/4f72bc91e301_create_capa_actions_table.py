"""create_capa_actions_table

Revision ID: 4f72bc91e301
Revises: 8d31ab2457c0
Create Date: 2026-11-24 19:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f72bc91e301'
down_revision: Union[str, Sequence[str], None] = '8d31ab2457c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create capa_actions table."""
    op.create_table(
        'capa_actions',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cause_candidate_id', sa.String(length=36), sa.ForeignKey('cause_candidates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('action_text', sa.Text(), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=False),
        sa.Column('owner_role', sa.String(length=100), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('effectiveness_check', sa.Text(), nullable=True),
        sa.Column('review_status', sa.String(length=50), server_default='pending_review', nullable=False),
        sa.Column('reviewer_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f('ix_capa_actions_id'), 'capa_actions', ['id'], unique=False)
    op.create_index(op.f('ix_capa_actions_investigation_id'), 'capa_actions', ['investigation_id'], unique=False)
    op.create_index(op.f('ix_capa_actions_cause_candidate_id'), 'capa_actions', ['cause_candidate_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to drop capa_actions table."""
    op.drop_index(op.f('ix_capa_actions_cause_candidate_id'), table_name='capa_actions')
    op.drop_index(op.f('ix_capa_actions_investigation_id'), table_name='capa_actions')
    op.drop_index(op.f('ix_capa_actions_id'), table_name='capa_actions')
    op.drop_table('capa_actions')
