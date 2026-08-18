"""Initial production schema."""

import sqlalchemy as sa

from alembic import op

revision = "20260809_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("brand", sa.String(120), nullable=False),
        sa.Column("article", sa.String(120), nullable=False),
        sa.Column("category", sa.String(160), nullable=False),
        sa.Column("vehicle", sa.String(300), nullable=False, server_default=""),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("icon", sa.String(50), nullable=False, server_default="filter"),
        sa.Column("image_key", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("article", name="uq_products_article"),
    )
    op.create_index("ix_products_article", "products", ["article"])
    op.create_index("ix_products_category", "products", ["category"])

    op.create_table(
        "orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("public_code", sa.String(24), nullable=False),
        sa.Column("request_key", sa.String(80), nullable=True),
        sa.Column("customer_name", sa.String(160), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(30), nullable=False, server_default="new"),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("public_code", name="uq_orders_public_code"),
        sa.UniqueConstraint("request_key", name="uq_orders_request_key"),
    )
    op.create_index("ix_orders_public_code", "orders", ["public_code"])
    op.create_index("ix_orders_phone", "orders", ["phone"])
    op.create_index("ix_orders_status", "orders", ["status"])

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("article", sa.String(120), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
    )
    op.create_table(
        "order_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", sa.String(30), nullable=True),
        sa.Column("to_status", sa.String(30), nullable=False),
        sa.Column("actor", sa.String(160), nullable=False, server_default="system"),
        sa.Column("note", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_order_events_order_id", "order_events", ["order_id"])
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("key", name="uq_app_settings_key"),
    )
    op.create_index("ix_app_settings_key", "app_settings", ["key"])


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("order_events")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("products")
