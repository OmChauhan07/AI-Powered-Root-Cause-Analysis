"""create_cause_candidates_table

Revision ID: 8d31ab2457c0
Revises: 9c24ef817a31
Create Date: 2026-11-24 18:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d31ab2457c0'
down_revision: Union[str, Sequence[str], None] = '9c24ef817a31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create cause_candidates table and add method columns to investigations."""
    op.add_column('investigations', sa.Column('investigation_method', sa.String(length=50), server_default='five_whys', nullable=True))
    op.add_column('investigations', sa.Column('rca_method_data', sa.JSON(), nullable=True))

    op.create_table(
        'cause_candidates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('investigation_id', sa.String(length=36), nullable=False),
        sa.Column('method', sa.String(length=50), server_default='five_whys', nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('candidate_text', sa.Text(), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=False),
        sa.Column('ai_status', sa.String(length=50), server_default='hypothesis', nullable=False),
        sa.Column('review_status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('reviewer_note', sa.Text(), nullable=True),
        sa.Column('supporting_evidence_ids', sa.JSON(), nullable=True),
        sa.Column('contradicting_evidence_ids', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cause_candidates_id'), 'cause_candidates', ['id'], unique=False)
    op.create_index(op.f('ix_cause_candidates_investigation_id'), 'cause_candidates', ['investigation_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to drop cause_candidates table and remove columns."""
    op.drop_index(op.f('ix_cause_candidates_investigation_id'), table_name='cause_candidates')
    op.drop_index(op.f('ix_cause_candidates_id'), table_name='cause_candidates')
    op.drop_table('cause_candidates')
    op.drop_column('investigations', 'rca_method_data')
    op.drop_column('investigations', 'investigation_method')
