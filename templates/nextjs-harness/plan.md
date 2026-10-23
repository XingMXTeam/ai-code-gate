# Plan — <feature name>

## Goal

<One paragraph: what this feature does and for whom.>

## Editable scope

Files and directories the implementing agent may change for this feature:

- `src/app/<feature>/**`
- `src/lib/<feature>.*`
- `src/components/<feature>/**`

Anything outside this list needs a human decision first (the `scope`
command enforces it).

## Functional points

Each FP must be referenced by id somewhere in code or tests — the gate's
FP-coverage check fails the logic dimension for any FP that is not.

- FP-1: <user does X> → <system validates Y> → <result Z is shown/stored>
- FP-2: <next independently testable behavior>
- FP-3: <edge case: empty state / error state / retry>
