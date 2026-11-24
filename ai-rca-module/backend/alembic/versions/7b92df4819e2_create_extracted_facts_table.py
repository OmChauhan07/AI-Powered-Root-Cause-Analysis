"""create_extracted_facts_table

Revision ID: 7b92df4819e2
Revises: 3a84a6efc487
Create Date: 2026-11-24 18:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b92df4819e2'
down_revision: Union[str, Sequence[str], None] = '3a84a6efc487'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create extracted_facts table."""
    op.create_table(
        'extracted_facts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('investigation_id', sa.String(length=36), nullable=False),
        sa.Column('source_document_id', sa.String(length=36), nullable=True),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('field_value', sa.JSON(), nullable=True),
        sa.Column('source_page', sa.Integer(), nullable=True),
        sa.Column('source_excerpt', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Integer(), server_default='100', nullable=False),
        sa.Column('extraction_status', sa.String(length=50), server_default='extracted', nullable=False),
        sa.Column('review_status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_document_id'], ['source_documents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_extracted_facts_id'), 'extracted_facts', ['id'], unique=False)
    op.create_index(op.f('ix_extracted_facts_investigation_id'), 'extracted_facts', ['investigation_id'], unique=False)
    op.create_index(op.f('ix_extracted_facts_source_document_id'), 'extracted_facts', ['source_document_id'], unique=False)
    op.create_index(op.f('ix_extracted_facts_field_name'), 'extracted_facts', ['field_name'], unique=False)


def downgrade() -> None:
    """Downgrade schema to drop extracted_facts table."""
    op.drop_index(op.f('ix_extracted_facts_field_name'), table_name='extracted_facts')
    op.drop_index(op.f('ix_extracted_facts_source_document_id'), table_name='extracted_facts')
    op.drop_index(op.f('ix_extracted_facts_investigation_id'), table_name='extracted_facts')
    op.drop_index(op.f('ix_extracted_facts_id'), table_name='extracted_facts')
    op.drop_table('extracted_facts')
