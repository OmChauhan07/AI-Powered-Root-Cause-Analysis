"""create_initial_investigation_tables

Revision ID: 3a84a6efc487
Revises: 
Create Date: 2026-11-24 18:19:34.293863

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a84a6efc487'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create investigations and source_documents tables."""
    op.create_table(
        'investigations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('reference_code', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('product_name', sa.String(length=200), nullable=True),
        sa.Column('product_code', sa.String(length=100), nullable=True),
        sa.Column('batch_number', sa.String(length=100), nullable=True),
        sa.Column('manufacturing_stage', sa.String(length=200), nullable=True),
        sa.Column('incident_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('problem_statement', sa.Text(), nullable=True),
        sa.Column('expected_result', sa.JSON(), nullable=True),
        sa.Column('observed_result', sa.JSON(), nullable=True),
        sa.Column('immediate_action', sa.Text(), nullable=True),
        sa.Column('equipment_id', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='draft', nullable=False),
        sa.Column('severity', sa.String(length=20), server_default='medium', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_investigations_id'), 'investigations', ['id'], unique=False)
    op.create_index(op.f('ix_investigations_reference_code'), 'investigations', ['reference_code'], unique=True)
    op.create_index(op.f('ix_investigations_batch_number'), 'investigations', ['batch_number'], unique=False)

    op.create_table(
        'source_documents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('investigation_id', sa.String(length=36), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=True),
        sa.Column('storage_key', sa.String(length=255), nullable=True),
        sa.Column('content_sha256', sa.String(length=64), nullable=True),
        sa.Column('mime_type', sa.String(length=100), nullable=True),
        sa.Column('page_count', sa.Integer(), server_default='1', nullable=False),
        sa.Column('parse_status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('extracted_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_source_documents_id'), 'source_documents', ['id'], unique=False)
    op.create_index(op.f('ix_source_documents_investigation_id'), 'source_documents', ['investigation_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_source_documents_investigation_id'), table_name='source_documents')
    op.drop_index(op.f('ix_source_documents_id'), table_name='source_documents')
    op.drop_table('source_documents')
    op.drop_index(op.f('ix_investigations_batch_number'), table_name='investigations')
    op.drop_index(op.f('ix_investigations_reference_code'), table_name='investigations')
    op.drop_index(op.f('ix_investigations_id'), table_name='investigations')
    op.drop_table('investigations')
