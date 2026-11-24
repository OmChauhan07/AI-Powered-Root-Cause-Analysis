"""create_evidence_and_gap_tables

Revision ID: 9c24ef817a31
Revises: 7b92df4819e2
Create Date: 2026-11-24 18:48:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c24ef817a31'
down_revision: Union[str, Sequence[str], None] = '7b92df4819e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create evidence_records and investigation_gaps tables."""
    op.create_table(
        'evidence_records',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('investigation_id', sa.String(length=36), nullable=False),
        sa.Column('source_document_id', sa.String(length=36), nullable=True),
        sa.Column('evidence_type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('evidence_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_page', sa.Integer(), nullable=True),
        sa.Column('source_excerpt', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='available', nullable=False),
        sa.Column('structured_payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_document_id'], ['source_documents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_evidence_records_id'), 'evidence_records', ['id'], unique=False)
    op.create_index(op.f('ix_evidence_records_investigation_id'), 'evidence_records', ['investigation_id'], unique=False)
    op.create_index(op.f('ix_evidence_records_source_document_id'), 'evidence_records', ['source_document_id'], unique=False)

    op.create_table(
        'investigation_gaps',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('investigation_id', sa.String(length=36), nullable=False),
        sa.Column('gap_type', sa.String(length=50), nullable=False),
        sa.Column('field_or_record', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('impact_rationale', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='not_provided', nullable=False),
        sa.Column('recommended_action', sa.Text(), nullable=True),
        sa.Column('importance', sa.String(length=20), server_default='high', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_investigation_gaps_id'), 'investigation_gaps', ['id'], unique=False)
    op.create_index(op.f('ix_investigation_gaps_investigation_id'), 'investigation_gaps', ['investigation_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to drop evidence_records and investigation_gaps tables."""
    op.drop_index(op.f('ix_investigation_gaps_investigation_id'), table_name='investigation_gaps')
    op.drop_index(op.f('ix_investigation_gaps_id'), table_name='investigation_gaps')
    op.drop_table('investigation_gaps')

    op.drop_index(op.f('ix_evidence_records_source_document_id'), table_name='evidence_records')
    op.drop_index(op.f('ix_evidence_records_investigation_id'), table_name='evidence_records')
    op.drop_index(op.f('ix_evidence_records_id'), table_name='evidence_records')
    op.drop_table('evidence_records')
