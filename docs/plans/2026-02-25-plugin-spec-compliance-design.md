# Plugin Spec Compliance & Community-Ready Design

## Goal

Bring the langfuse-observability plugin into full compliance with the Agent Zero plugin spec (AGENTS.plugins.md) and prepare it for Plugin Index submission.

## Approach

In-place migration. Convert manifest and config formats, remove committed credentials, add community files. Zero code changes.

## Decisions

- **License**: MIT
- **Tags**: observability, tracing, tools, webui
- **Optional directories** (`tools/`, `agents/`): Omitted — plugin does not need them
- **Credentials** (`config.json`): Deleted, added to `.gitignore`

## File Changes

| Action | From | To |
|--------|------|----|
| Convert | `plugin.json` | `plugin.yaml` |
| Convert | `config.default.json` | `default_config.yaml` |
| Delete | `config.json` | — |
| Create | — | `.gitignore` |
| Create | — | `README.md` |
| Create | — | `LICENSE` |

## plugin.yaml (runtime manifest)

```yaml
title: Observability
description: Langfuse tracing, trace viewer, chat forking, prompt lab, and split-screen comparison.
version: 1.0.0
settings_sections:
  - agent
per_project_config: false
per_agent_config: false
always_enabled: false
```

## default_config.yaml

```yaml
langfuse_enabled: false
langfuse_public_key: ""
langfuse_secret_key: ""
langfuse_host: "https://cloud.langfuse.com"
langfuse_sample_rate: 1.0
```

## .gitignore

```
config.json
__pycache__/
*.pyc
```

## Index Manifest (for a0-plugins repo, not committed here)

```yaml
title: Observability
description: Langfuse tracing, trace viewer, chat forking, prompt lab, and split-screen comparison.
github: https://github.com/<your-username>/langfuse-observability
tags:
  - observability
  - tracing
  - tools
  - webui
```

## Risk Assessment

- Renaming `plugin.json` to `plugin.yaml` is safe because Agent Zero's plugin discovery is directory-based, not filename-based.
- Deleting `config.json` means existing installations must re-enter credentials via settings UI or environment variables. This is the correct behavior.
- All Python, HTML, and JS files remain unchanged. No functional impact.

## Code Changes

None. All existing extensions, API handlers, helpers, prompts, and WebUI files already conform to the spec directory structure.
