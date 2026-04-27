# Git Naming Conventions

本文档定义本仓库常见 Git 名称的建议格式，覆盖分支、提交、标签、PR 标题、远端、stash 等协作中最常见的命名场景。

## General Rules

- 优先使用英文、ASCII、小写字母、数字和短横线。
- 多个单词使用 kebab-case，例如 `openagent-oauth-flow`。
- 名称要描述意图，不要只写 `new`、`update`、`wip`、`temp`、`final`。
- 避免空格、下划线、大小写混用、特殊符号和个人姓名。
- 能用仓库已有包名或目录名表达范围时，优先使用现有名称，例如 `cli`、`codex-plugin`、`openclaw-plugin`、`docs`。

## Branch Names

常规分支格式：

```text
<type>/<short-kebab-summary>
```

常用 `type`：

- `feat`: 新功能
- `fix`: 缺陷修复
- `docs`: 文档变更
- `chore`: 维护性变更
- `refactor`: 不改变行为的重构
- `test`: 测试相关变更
- `ci`: GitHub Actions 或 CI 配置
- `build`: 构建、打包或依赖配置
- `release`: 发布准备分支
- `hotfix`: 紧急修复分支
- `spike`: 探索性实验分支，合并前应改成正式类型或关闭

推荐示例：

```text
feat/openagent-oauth-standardization
fix/codex-plugin-version-sync
docs/git-naming-conventions
ci/release-workflow-token-check
```

不推荐示例：

```text
feature
fix_bug
WIP-login
ray-test
update
```

## Commit Messages

提交信息使用 Conventional Commits 风格：

```text
<type>(<scope>): <summary>
```

没有明确范围时可以省略 `scope`：

```text
<type>: <summary>
```

常用 `type` 与分支类型保持一致：

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`
- `ci`
- `build`
- `perf`
- `revert`

推荐的 `scope`：

- `cli`
- `codex-plugin`
- `openclaw-plugin`
- `docs`
- `release`
- `deps`

推荐示例：

```text
feat(openclaw-plugin): add brokered oauth session exchange
fix(codex-plugin): sync manifest version during release
docs: add git naming conventions
ci(release): verify npm scope access before publish
chore: release packages
```

提交摘要规则：

- 使用现在时、祈使语气，例如 `add`、`fix`、`remove`。
- 首字母小写，末尾不加句号。
- 摘要保持简短，复杂背景写在提交正文里。
- 破坏性变更使用 `!`，并在正文写明 `BREAKING CHANGE:`。

破坏性变更示例：

```text
feat(cli)!: require explicit server url

BREAKING CHANGE: CLI calls now require --server-url when no default is configured.
```

## Pull Request Titles

PR 标题应尽量复用提交信息格式：

```text
<type>(<scope>): <summary>
```

推荐示例：

```text
docs: add git naming conventions
fix(openclaw-plugin): refresh auth after protected mcp failure
ci(release): harden package publish workflow
```

多个提交合并为一个 PR 时，PR 标题应描述用户可见或维护者关心的最终结果，而不是罗列所有中间步骤。

## Tags

发布标签应由 Changesets 和 GitHub Actions 发布流程生成或遵循该流程要求。不要手动移动、覆盖或重命名已经发布的标签。

本仓库是 monorepo，默认按包独立发版。包级发布标签使用完整 npm 包名和版本：

```text
<package-name>@<major>.<minor>.<patch>
```

预发布版本使用：

```text
<package-name>@<major>.<minor>.<patch>-<channel>.<number>
```

推荐示例：

```text
@call-e/cli@0.1.0
@call-e/codex-plugin@0.1.0
@call-e/openagent@0.1.0
@call-e/codex-plugin@0.2.0-rc.1
```

在安装命令或脚本里引用包含 `@` 和 `/` 的包级标签时，优先使用显式 `--ref` 并加引号，例如：

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@0.1.0' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

只有当整个仓库采用同一个统一版本、并且该标签代表一次仓库级发布时，才使用仓库级版本标签：

```text
v<major>.<minor>.<patch>
```

预发布版本使用：

```text
v<major>.<minor>.<patch>-<channel>.<number>
```

推荐示例：

```text
v1.2.3
v1.3.0-rc.1
v1.3.0-beta.2
```

避免把单个包发布标成通用 `v<version>`，因为同一个仓库内 tag 名称唯一，多个包各自发布 `0.1.0` 时会产生歧义或冲突。

## Remote Names

- `origin`: 当前仓库的默认远端。
- `upstream`: fork 场景下的上游仓库。

避免使用个人姓名或临时含义作为远端名。需要临时远端时，使用描述性名称并在完成后删除。

推荐示例：

```text
origin
upstream
integration-test
```

## Stash Names

stash 应带上明确说明，格式：

```text
<type>(<scope>): <summary>
```

推荐示例：

```bash
git stash push -m "docs: draft git naming conventions"
git stash push -m "fix(openclaw-plugin): inspect auth retry state"
```

避免无说明的 stash，因为后续很难判断是否还能恢复或删除。

## File And Directory Names In Git

- 文档文件使用 kebab-case，例如 `git-naming-conventions.md`。
- 包、插件、skill 等已有目录名不要随意改名。
- 修改 marketplace 入口、插件名、可见标签或安装命令前，先阅读 `docs/agent-integration-layout.md`。
