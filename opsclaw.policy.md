# OpsClaw Default Policy

This document describes the current Phase 1 machine-readable policy in `opsclaw.rules.yaml` (version 1).

## Principles

- Low-risk diagnosis and routine operations may execute automatically.
- Dangerous operations require explicit approval.
- Protected mutation parameters must come from the user or from explicit user confirmation.

## Phase 1 Intents Covered

- `diagnostic.readonly`: low risk, no approval, no protected parameters
- `package_management`: medium risk by default; `production` override requires approval
- `user_management`: high risk, requires approval
- `permission_change`: high risk, requires approval

## Protected Parameters

- `package_name`
- `username`
- `password`
- `sudo_policy`
- `target_path`
