# Kryvola spec essentials

- Use [docs/README.md](docs/README.md) to resolve architecture authority and amendments. Read detailed sections when relevant to the change.
- Non-OpenAPI schemas: Effect 4 with TypeScript 7 in `src/`. OpenAPI: Redocly in `openapi/`. Protobuf remains a generated wire projection; native crypto layouts belong to engines.
- Node 24.18.0, pnpm 12.5.1. Setup: `pnpm install --frozen-lockfile`. Fast: `pnpm check:fast`. Full: `pnpm check`. Inspect: `pnpm inspect`.
- Before every commit, run `pnpm format`, review the diff for unrelated changes, then run `pnpm lint`. This includes Markdown and all other formatter-supported files, even when expensive checks are delegated to CI. Preserve generator-owned files and configured formatting exclusions.
- Regenerate with `pnpm generate`; never edit `generated/` directly. Review stable wire tags and projection limitations. Commit source and generated changes together.
- No runtime repository dependencies or sibling source imports. References carry no ciphertext, credentials or private keys. Digests are not authorization.
- Signed/canonical formats and cryptographic claims require their own reviewed contracts; structural previews do not establish them.
- Complete when affected checks pass, generated output is current, docs/progress matches observed evidence, and the diff is scoped to the issue.
- Follow the authorized dedicated-issue/branch/PR workflow. Preserve unrelated work. Do not merge, poll CI or revise a delivered PR without a new request.
