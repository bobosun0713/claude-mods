# claude-mods

English | [繁體中文](./README.zh-TW.md)

A collection of mods for Claude Code. Each mod is a standalone Claude Code plugin that extends Claude Code's interface and behavior through a hooks module.

This repository is also a plugin marketplace, so you can install each mod individually.

## Mods

| Name | Description | Version |
| --- | --- | --- |
| [skill-cost](./skill-cost/README.md) | Token usage and cost broken down by skill and model | 0.2.0 |

See the `README.md` in each mod's directory for its features, commands, and limitations.

## Installation

Run the following at the Claude Code prompt:

```
/plugin install <mod-name> --marketplace bobosun0713/claude-mods
```

On first install, Claude Code asks `Add marketplace?`. Enter `y` to confirm, then choose an install scope. The default user scope is recommended so the mod loads in every session.

You can also run `/plugin` and pick a mod from the list.

## Updating and removing

```
claude plugin update <mod-name>      # update to the latest version in this repository
claude plugin uninstall <mod-name>   # remove
```

After updating, run `/reload-plugins` in any running session to apply the change.

## Automation

| Workflow | Schedule | Purpose |
| --- | --- | --- |
| [Update model prices](./.github/workflows/update-prices.yml) | 01:00 UTC on the 1st of each month, or on demand | Updates `skill-cost/scripts/prices.json` from the official Claude pricing page and opens a PR when prices change |

The workflow needs **Allow GitHub Actions to create and approve pull requests** enabled under the repository's **Settings → Actions → General → Workflow permissions**.

## Repository layout

```
claude-mods/
├── .github/workflows/        # GitHub Actions
├── .claude-plugin/
│   └── marketplace.json      # marketplace definition listing every mod
└── <mod-name>/
    ├── .claude-plugin/
    │   └── plugin.json       # plugin manifest (name, version, description)
    ├── hooks/
    │   ├── hooks.json        # hooks module entry point
    │   └── register.tsx      # hooks module
    ├── types/                # $.state type declarations
    ├── tests/                # tests run by claude plugin test
    ├── README.md             # English documentation
    └── README.zh-TW.md       # Traditional Chinese documentation
```

## Development

| Command | Purpose |
| --- | --- |
| `claude --plugin-dir ./<mod-name>` | Load a mod in development mode; it reloads whenever a file is saved |
| `claude plugin validate ./<mod-name>` | Validate the manifest and hooks module |
| `claude plugin validate .` | Validate the marketplace definition |
| `claude plugin test ./<mod-name>` | Run the mod's tests |
| `python3 -m unittest discover -s skill-cost/scripts` | Run the skill-cost price parsing tests |

Mods need no `package.json`, bundler, or build step: Claude Code loads `.ts` and `.tsx` files directly.

Claude Code generates `.claude-plugin/types/` when it loads a mod; the directory is not tracked in git. After loading a mod once with `--plugin-dir`, your editor gets autocompletion and `tsc -p ./<mod-name>` type-checks the mod.

### Adding a mod

1. Create a `<mod-name>/` directory containing `.claude-plugin/plugin.json`, `hooks/`, `README.md` (English), and `README.zh-TW.md` (Traditional Chinese).
2. Add an entry to the `plugins` array in `.claude-plugin/marketplace.json`:
   ```json
   { "name": "<mod-name>", "source": "./<mod-name>", "description": "<description>" }
   ```
3. Update the Mods table in both `README.md` and `README.zh-TW.md`.

### Releasing a new version

When you change a mod, bump the `version` in its `plugin.json` (following Semantic Versioning) before pushing to the repository.
