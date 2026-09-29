# Praxi SDK development

TypeScript SDK and CLI in packages/sdk and packages/cli.

## Commands

Run these from the repository root:

```sh
npm ci
npm run build
npm test
```

## Runtime

This is a package/CLI workspace, not a Vercel application. Do not publish npm releases as a side effect of building.

## Shared working conventions

Work inside this repository's Git boundary. Other products are independent repositories; use their public HTTP/SDK contracts. Keep provider and storage implementations replaceable. Existing npm scopes, database names and wire identifiers are compatibility contracts, even where product names changed.

Install from the committed lockfile. Keep `.env*` credentials, `.vercel/` links and generated dependencies/builds out of commits; use `.env.example` for variable names. Tests use local fixtures and do not require production access. Supabase data migration is a separate staged task; current foundation SQL is not a historical-data importer.
