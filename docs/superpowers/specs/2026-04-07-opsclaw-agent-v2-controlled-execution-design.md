# OpsClaw Agent V2 Controlled Execution Design

## Goal

Redesign OpsClaw's agent execution flow so it can keep the speed of autonomous low-risk operations while preventing the agent from inventing high-impact parameters or executing dangerous changes without explicit human involvement.

This design replaces the current "prompt-guided general agent" posture with a controlled execution model that is specific to an SSH-centered operations product.

The target outcome is:

- low-risk diagnostic and routine tasks can still run automatically
- dangerous work requires explicit confirmation
- critical parameters can never be silently invented by the agent
- the user experiences a simple conversation-first product instead of a visible internal workflow engine

## Problem

The current architecture still follows a general-agent pattern:

- user gives a task
- model decides how to interpret it
- model may fill in missing execution details on its own
- model calls `session.run_command`
- command policy only tries to catch risk late at the command layer

That is not sufficient for OpsClaw.

It creates three unacceptable behaviors:

- the agent can invent missing change parameters such as usernames, passwords, target paths, or privilege settings
- dangerous actions are controlled primarily by command-string matching, which is fragile and incomplete
- the system has no top-level distinction between diagnosis, proposal, parameter collection, approval, execution, and verification

The result is that a user intent like "create a root-permission user" can collapse directly into a completed mutation with agent-invented credentials. That is a system failure, not a prompt-tuning issue.

## Product Principles

### 1. Default To Fast Automation Where Safe

OpsClaw should not force approval for every command.

Low-risk tasks should still feel agentic:

- the agent briefly explains what it is about to do
- the agent executes automatically
- the agent summarizes what happened

### 2. Parameters That Change Outcomes Cannot Be Invented

If a parameter materially affects the result of a change, the agent must not invent it.

Examples:

- usernames
- passwords
- sudo policy such as `NOPASSWD`
- target services
- target files and directories
- delete scope
- write content
- package names when the install target is ambiguous

Such parameters must come from one of two sources only:

- directly provided by the user
- explicitly confirmed by the user after the agent proposes them

### 3. Intent Type Governs Safety Before Command Text Exists

Safety cannot depend only on command text.

OpsClaw must first classify what kind of operation the agent is attempting. Command-string matching remains necessary, but only as a fallback and guardrail.

Primary evaluation order:

1. intent type
2. parameter completeness and provenance
3. command-text rules as fallback

### 4. Internal Workflow Must Exist, But It Should Not Burden The User

The runtime must use explicit internal stages. The UI should not expose the raw state machine by default.

Default UX should remain conversation-first:

- concise explanation
- only show blocking checkpoints when the user must act
- expose deep detail only in an expandable timeline or audit view

## Scope

### In Scope

- redesign the agent execution model around explicit intent, parameter, and approval stages
- add a native OpsClaw rules system
- support global rules plus group-level overrides
- define parameter provenance and confirmation rules
- define low-risk and high-risk execution paths
- map internal stages into a conversation-first user experience

### Out Of Scope

- cloning Claude Code, Codex, or Trae rule file conventions
- making every command approval-driven
- single-node rule overrides in the first iteration
- full organization-wide policy governance
- replacing session-bound execution with a generic workflow engine

## Approaches Considered

### Approach A: Expand Prompt Rules And Dangerous Command Regexes

Pros:

- low implementation cost
- minimal code movement

Cons:

- still depends on the model obeying soft instructions
- still catches risk too late
- does not solve invented-parameter behavior
- becomes an endless patch list

Decision: reject.

### Approach B: Fully Manual Workflow For All Changes

Pros:

- safest behavior
- easiest to reason about policy

Cons:

- destroys the value of the agent for routine operations
- too much user friction for common low-risk tasks

Decision: reject.

### Approach C: Controlled Execution Model With Intent, Parameter, And Risk Gates

Pros:

- preserves automation for safe work
- blocks parameter invention
- lets safety start before shell command generation
- fits OpsClaw's SSH operations focus

Cons:

- requires real runtime redesign, not just policy patches
- needs explicit rule and state modeling

Decision: adopt.

## Recommended Design

OpsClaw Agent V2 should separate the lifecycle of agent work into explicit internal phases, governed by structured rules instead of only prompt guidance.

The core model is:

- classify intent
- validate parameter completeness and provenance
- evaluate risk
- decide whether to auto-execute, collect parameters, request approval, or refuse

## Internal Execution Phases

These phases are internal runtime states, not raw user-facing labels.

1. `diagnose`
   - read-only discovery
   - transcript reading
   - metadata gathering
   - low-risk observation commands

2. `propose`
   - summarize diagnosis
   - state intended action
   - prepare the candidate change plan

3. `parameterize`
   - collect or confirm critical parameters
   - block agent-generated defaults for protected parameters

4. `approve`
   - request approval for dangerous or policy-gated actions

5. `execute`
   - run the allowed action in the bound session

6. `verify`
   - confirm result
   - summarize outcome and residual risk

## User-Facing Interaction Mapping

The user should not see raw phase names by default.

Default conversation-first labels should be:

- `正在诊断`
- `接下来我会先做……`
- `需要你确认几个参数`
- `这一步需要你的批准`
- `正在执行`
- `执行完成，结论如下`

The detailed timeline may still expose richer state and audit data for advanced users, but it is secondary.

## Intent Model

Intent classification is the first decision surface.

Initial built-in intent families:

- `diagnostic.readonly`
- `routine.safe_change`
- `service.lifecycle_change`
- `filesystem.write`
- `filesystem.delete`
- `package_management`
- `user_management`
- `permission_change`
- `credential_change`
- `network_security_change`
- `process_termination`
- `data_destructive_change`

Each intent family carries default metadata:

- default risk level
- whether it permits automatic execution
- whether protected parameters exist
- whether approval is mandatory
- whether command-text fallback checks must be applied

Examples:

- `diagnostic.readonly`
  - can auto-execute
  - no approval by default
- `routine.safe_change`
  - may auto-execute if all protected parameters are confirmed and policy allows
- `user_management`
  - never allowed to invent usernames or password policy
  - approval required by default
- `credential_change`
  - approval required by default
  - parameter confirmation always required

## Parameter Provenance Model

OpsClaw must track not just parameter values, but where they came from.

Each parameter should have:

- `name`
- `value`
- `source`
- `confirmed`
- `sensitivity`

Parameter sources:

- `user_explicit`
- `user_confirmed`
- `system_observed`
- `agent_inferred`

Execution rules:

- `user_explicit` is always acceptable
- `user_confirmed` is acceptable after a dedicated confirmation step
- `system_observed` is acceptable only for observational context, not for protected mutation values unless policy explicitly allows it
- `agent_inferred` is never sufficient for protected mutation parameters

Protected parameters include:

- identity and account parameters
- credential material
- privilege policy
- mutation targets
- delete scope
- file contents or config contents
- package or service targets when ambiguous

This is the primary defense against the "agent invented username and password" failure mode.

## Risk Evaluation Pipeline

The execution policy should evaluate in this order:

1. classify intent
2. load effective rule set for the session
3. identify required parameters for the intent
4. validate parameter provenance
5. determine whether approval is required
6. generate or validate command text
7. apply command-text fallback rules
8. execute or block

Possible outcomes:

- `allow_auto_execute`
- `require_parameter_confirmation`
- `require_approval`
- `deny`

This means danger is not the only reason to pause. Missing or weakly-sourced parameters also pause execution.

## Rules System

OpsClaw should use native rule files, not borrowed file names from general coding agents.

### 1. `opsclaw.rules.yaml`

Machine-executable policy definition.

Responsibilities:

- intent family definitions
- risk mapping
- protected parameter definitions
- approval requirements
- command-text fallback rules
- group-level overrides

### 2. `opsclaw.policy.md`

Human-readable explanation of the policy.

Responsibilities:

- explain why a team uses certain defaults
- document sensitive operation categories
- document approval expectations
- help operators understand the behavior without reading YAML

## Rule Scope

The first iteration should support two layers:

- global rules
- group-level overrides

Resolution order:

1. global defaults
2. group override for the session's group

Single-node overrides are intentionally excluded at this stage to avoid fragmented behavior and policy drift.

## Built-In And Configurable Safety

OpsClaw should not rely only on project configuration. It needs a platform baseline.

### Built-In Baseline

Built-in rules should cover universal risk categories such as:

- user and privilege management
- password and credential changes
- sudoers and privilege escalation configuration
- file deletion and overwrite
- service lifecycle operations
- package installation and removal
- firewall and network access changes
- process killing
- disk and mount changes

### Configurable Extensions

Teams can extend or tighten behavior through `opsclaw.rules.yaml`.

Examples:

- treat a particular service group as approval-only
- require approval for package upgrades in production groups
- mark specific directories as protected write targets
- mark internal operational commands as low risk

### Command-Text Fallback

Even after intent classification, command text still needs a fallback layer to catch:

- shell scripts the agent synthesizes unexpectedly
- direct use of dangerous verbs
- operator policy edge cases

This is the final guardrail, not the primary design.

## Execution Modes

The system should support at least three runtime decisions for change work.

### Auto-Execute

Allowed when:

- intent is low risk
- all protected parameters are complete
- all protected parameters are `user_explicit` or `user_confirmed`
- no approval rule is triggered

User experience:

- the agent says what it is about to do
- the action runs automatically
- the result is summarized

### Parameter Confirmation

Triggered when:

- required protected parameters are missing
- parameters exist only as agent inference
- the change target is ambiguous

User experience:

- the agent does not execute
- the agent asks only for the missing or weakly-sourced parameters
- once confirmed, execution can continue without starting the task over

### Approval

Triggered when:

- intent family requires approval
- effective rules require approval
- command-text fallback identifies dangerous operations

User experience:

- the agent presents a concise proposal
- the user approves or rejects
- execution proceeds only after approval

## UX Rules

### Conversation-First By Default

The primary interface should remain simple:

- brief diagnosis
- concise next-step statement
- explicit ask only when needed

### Visible Only At Important Checkpoints

The default UI should explicitly stop and surface interaction only when:

- critical parameters are missing or unconfirmed
- approval is required
- execution has finished and verification is ready

### Detailed Audit As Secondary Surface

Advanced users should still be able to inspect:

- classified intent
- effective rule set
- parameter provenance
- approval reason
- generated command
- execution and verification outputs

But this should live in an expandable audit view, not the default conversation path.

## Runtime Architecture Impact

This redesign implies a broader runtime boundary change.

### Today

The agent loop can attempt `session.run_command` too early, and policy only reacts once command text exists.

### Target

The runtime should introduce an execution planner layer between agent reasoning and shell execution.

That planner should:

- classify the requested action
- normalize the proposed operation into intent + parameters
- consult effective rules
- emit a next action decision

Possible planner decisions:

- continue diagnosis
- ask for parameters
- ask for approval
- execute command
- deny action

In practice this means `session.run_command` stops being the agent's unconstrained default tool boundary. It becomes a controlled stage outcome.

## Data Model Additions

The redesign should add first-class records for:

- `intent`
- `parameter_set`
- `parameter_confirmation_request`
- `approval_request`
- `effective_rule_context`

These can later be persisted with run and gate state, but the design does not require full persistence in the first step.

The important part is that they become structured runtime data instead of being implicit in prompt text.

## Relationship To Existing HITL Gates

This design builds on the existing HITL gate direction, but broadens it.

Current gate work already supports:

- `terminal_input`
- `approval`

Agent V2 should add a higher-level gate concept for parameter collection or confirmation. Approval remains necessary, but it is no longer the only human checkpoint.

Recommended future gate kinds:

- `parameter_confirmation`
- `approval`
- `terminal_input`

This preserves the HITL model while moving the first safety checkpoint earlier in the flow.

## Rollout Plan

### Phase 1: Policy And Intent Foundation

- define intent families
- define protected parameter metadata
- define global and group-level rule loading
- keep existing command fallback policy in place

### Phase 2: Planner And Parameter Confirmation

- insert planner stage before `session.run_command`
- add parameter confirmation gate
- block protected inferred parameters

### Phase 3: Approval Rework

- move approval triggering from late command-only policy into intent-aware planning
- keep command-text rules as fallback

### Phase 4: UI Simplification

- map runtime states into conversation-first messages
- keep detailed timeline as secondary expansion

### Phase 5: Verification And Audit

- capture proposal, approval, execution, and verification as a coherent audit trail

## Success Criteria

The redesign is successful when all of the following are true:

- low-risk routine work still feels autonomous
- dangerous work always pauses before execution
- protected mutation parameters are never silently invented by the agent
- user and privilege management operations cannot complete without explicit human-provided or human-confirmed values
- the user interface feels like a simple assistant, not a workflow engine
- advanced operators can still inspect why the system paused or allowed execution

## Explicit Non-Goals

- no attempt to make OpsClaw a generic coding-agent framework
- no compatibility layer for `CLAUDE.md`, `AGENTS.md`, or Trae rule files
- no one-off regex-only safety strategy
- no requirement that every mutation needs approval

## Summary

OpsClaw should not solve this class of failures by adding more prompt rules.

It should introduce a product-native execution architecture:

- intent-aware
- parameter-aware
- risk-aware
- conversation-first
- SSH-operations-specific

That is the correct balance between freedom and safety for a vertical operations agent.
