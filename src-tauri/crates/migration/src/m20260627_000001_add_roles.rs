use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("roles"))
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Alias::new("id"))
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Alias::new("name")).string().not_null())
                    .col(ColumnDef::new(Alias::new("description")).text().null())
                    .col(
                        ColumnDef::new(Alias::new("system_prompt"))
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Alias::new("opening_message")).text().null())
                    .col(
                        ColumnDef::new(Alias::new("opening_questions_json"))
                            .text()
                            .not_null()
                            .default("[]"),
                    )
                    .col(
                        ColumnDef::new(Alias::new("tags_json"))
                            .text()
                            .not_null()
                            .default("[]"),
                    )
                    .col(ColumnDef::new(Alias::new("avatar")).string().null())
                    .col(ColumnDef::new(Alias::new("avatar_type")).string().null())
                    .col(ColumnDef::new(Alias::new("avatar_value")).text().null())
                    .col(ColumnDef::new(Alias::new("temperature")).double().null())
                    .col(ColumnDef::new(Alias::new("top_p")).double().null())
                    .col(
                        ColumnDef::new(Alias::new("source_kind"))
                            .string()
                            .not_null()
                            .default("local"),
                    )
                    .col(ColumnDef::new(Alias::new("source_ref")).string().null())
                    .col(
                        ColumnDef::new(Alias::new("created_at"))
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("updated_at"))
                            .big_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Alias::new("roles")).to_owned())
            .await
    }
}
