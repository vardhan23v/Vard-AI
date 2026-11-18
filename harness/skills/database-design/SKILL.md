---
name: database-design
description: Design schemas, write migrations and queries, and keep data consistent and fast.
version: 1.0.0
tags: [database, sql, schema, migrations, orm, prisma, drizzle, postgres, sqlite]
triggers: [database, schema, migration, table, column, index, query, sql, prisma, drizzle, typeorm, sequelize, postgres, mysql, sqlite, mongodb]
globs: ["**/schema.prisma", "**/migrations/**", "**/*.sql", "drizzle.config.*"]
roles: [database, backend]
priority: 60
---

# Database design

## Instructions
- Use the ORM or query builder already in the project and its migration tool. Never edit a migration that may already have run; add a new one.
- Every table gets a primary key; add foreign keys with an explicit `ON DELETE` behaviour; add unique constraints for natural keys (for example a user's email).
- Add indexes for columns used in joins, filters and sorting; don't index everything.
- Use the right types (timestamps with time zone, numeric for money, enums or check constraints for fixed sets).
- Migrations must be reversible where the tool supports it, and safe on existing data (add nullable column → backfill → add constraint).
- Parameterise every query; never build SQL from strings.
- Store password hashes, never passwords. Keep personal data to what the feature needs.

## Workflow
1. Read the current schema and the latest migrations.
2. Write the schema change and its migration; generate client code if the ORM needs it.
3. Run the migration against the project's local or test database if one is configured, and run the tests.
4. Explain any data-migration risk in your summary.
