# @call-e/hermes-plugin

CALL-E plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

User documentation is in [`plugin/README.md`](./plugin/README.md). Install
instructions are in
[`docs/install/hermes-plugin.md`](../../docs/install/hermes-plugin.md).

```bash
hermes plugins install CALLE-AI/call-e-integrations/packages/hermes-plugin/plugin --enable
hermes gateway restart
```

Installs to `<hermes home>/plugins/calle`. The gateway restart is required —
tools are registered at gateway start.

## Layout

```text
plugin/                                   installed by hermes plugins install
  plugin.yaml                             manifest, read at the plugin root
  __init__.py                             register(ctx) entry point
  tools.py                                schemas, handlers, availability check
  adapter.py                              CLI adapter and goal construction
  skills/calle/SKILL.md                   documentation; does not load
  skills/calle/references/commands.md
scripts/check-plugin.mjs                  package validator
test/check-plugin.test.js
```

⚠️ **Only `plugin/` reaches a user.** `hermes plugins install` moves that
directory out of a shallow clone and discards the rest, so anything the plugin
needs at runtime has to live inside it. The validator and tests are for CI.

## How this differs from the other client packages

- **No marketplace entry.** `hermes plugins install` takes the subdirectory in
  the identifier, so there is no registry to register against and no
  `marketplace.json` to add.
- **No sparse checkout in the install docs.** One command covers it.
- **Tools, not a skill.** Hermes discovers skills from its skills directory and
  `skills.external_dirs`; a plugin's own directory is in neither. The agent
  surface is `provides_tools`. `SKILL.md` ships as documentation.
- **Python payload.** This package ships executable code rather than markdown
  alone, because the plan/run split and the local outcome store are implemented
  rather than instructed.

## Checks

```bash
npm run check
npm test
npm run pack:dry-run
```

MIT.
