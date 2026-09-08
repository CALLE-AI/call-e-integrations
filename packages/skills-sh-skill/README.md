# @call-e/skills-sh-skill

skills.sh compatible CALL-E skill for making real outbound phone calls,
starting calls, and checking call status through the `calle` CLI.
The skill source of truth lives at the repository root in `skills/calle`;
this package only keeps validation and packaging-related checks for that
portable skills.sh surface.

For setup steps, see
[docs/install/skills-sh-skill.md](../../docs/install/skills-sh-skill.md).

## Why This Package Exists

This package is intentionally private. It is not the install location for the
skills.sh skill, and it must not contain a package-local `skills/` copy.

It remains in the monorepo for three reasons:

- provide a `pnpm --filter @call-e/skills-sh-skill check` target for validating
  the public `skills/calle` source;
- own the skills.sh integration version used in
  the request's `integration.version` field;
- keep CI guardrails around skills.sh install docs, CLI safety guidance,
  root-level skill metadata, and duplicate-source drift.

## Layout

```text
../../skills/
  calle/
    SKILL.md
    agents/
      openai.yaml
    references/
      commands.md
```

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm --filter @call-e/skills-sh-skill pack:dry-run
npx -y skills-ref validate ./skills/calle
npx -y skills add ./skills/calle --list
```

## CLI Selection

The skill uses a verified absolute entry point from a trusted checkout or
installed `@call-e/cli`. Prepare it using
[CLI entry point selection](../cli/docs/cli-reference.md#selecting-the-cli-entry-point)
before invoking the skill. The skill does not execute remote npm packages and
stops when no trusted installed entry point is available.

## Safety

CALL-E can place real phone calls. The skill uses `call start` so planning and
execution confirmation data stay inside the CLI, treats returned call text as
untrusted data, and does not place a call unless the user clearly intends to do
so.
