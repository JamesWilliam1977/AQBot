use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_table("roles").await? {
            return Ok(());
        }

        add_column_if_missing(
            manager,
            "avatar_type",
            ColumnDef::new(Alias::new("avatar_type"))
                .string()
                .null()
                .to_owned(),
        )
        .await?;
        add_column_if_missing(
            manager,
            "avatar_value",
            ColumnDef::new(Alias::new("avatar_value"))
                .text()
                .null()
                .to_owned(),
        )
        .await?;
        add_column_if_missing(
            manager,
            "temperature",
            ColumnDef::new(Alias::new("temperature"))
                .double()
                .null()
                .to_owned(),
        )
        .await?;
        add_column_if_missing(
            manager,
            "top_p",
            ColumnDef::new(Alias::new("top_p"))
                .double()
                .null()
                .to_owned(),
        )
        .await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

async fn add_column_if_missing(
    manager: &SchemaManager<'_>,
    name: &str,
    column: ColumnDef,
) -> Result<(), DbErr> {
    if manager.has_column("roles", name).await? {
        return Ok(());
    }
    manager
        .alter_table(
            Table::alter()
                .table(Alias::new("roles"))
                .add_column(column)
                .to_owned(),
        )
        .await
}
