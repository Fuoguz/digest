# Integration Smoke Tests

## Purpose

Provide a minimal executable smoke check for the post-refactor core flow contracts.

## Current script

- storage-quality.smoke.mjs: validates normalize and quality pipeline contracts from storage/api modules.

## Run

Use Node.js 18+ in workspace root:

```bash
node tests/integration/storage-quality.smoke.mjs
```

If the script prints "storage-quality smoke passed", the core contract checks pass.
