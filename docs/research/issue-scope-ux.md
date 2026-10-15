# Issues in data the person did not edit: a design for Maid

Status: proposal, from Tobias's answer on 2026-10-15. Replaces the item "Which issues are checked" in [relation-handling.md](relation-handling.md), section 4.

## Where we start

- **Maid today** checks only what was changed in this session (`packages/shell/src/modules/validation.tsx`). The Issues list says so: "Features that were loaded and not touched are not checked."
- **iD** has two switches in its Issues pane. "What": my edits or everything. "Where": what is visible or everywhere. The default is my edits, everywhere. Issues in other people's data look the same as one's own once "everything" is on.
- **The problem:** with "my edits only", a mapper never learns that the bus route they are working on already had a gap. With "everything", a newcomer sees dozens of warnings they did not cause and cannot judge.

## The idea in one sentence

Maid always checks what the person looks at, but it shows issues it did not cause quietly, and it takes the person's own action as the sign that they want to see them fully.

## How it works

### 1. Checked on selection, in the background

- When a feature is selected, Maid checks it and its neighbourhood in idle time: the feature, its parent ways, its relations and, for a relation, its loaded members.
- The check runs off the click path (idle callback or worker), so selecting never waits for it. The result appears when it is ready.
- Nothing is fetched for this. Only loaded data is checked (core rule 1 holds anyway: the mock under automation).

### 2. Two kinds of issue, shown differently

| | From my edits | In data I did not edit |
| --- | --- | --- |
| Where | Inspector section "Issues", Issues list, save dialog | Inspector only, below my own issues |
| Look | As today: coloured, with fixes | One folded, grey line: "2 notes on existing data" |
| Opened | Always open | Opens on click and shows the issues with their fixes |
| Counts | Badge, save warning | Never counts and never blocks saving |

- An issue is "mine" when one of its features was changed in this session. This is the same test the validator uses today (the difference to the base).
- **Route gaps** follow the same rule. A gap that my edit made, by splitting, extending or deleting a member, is mine: a normal warning. A gap the route had already is quiet. This answers iD issue 11374 without flooding big networks.

### 3. Acting on one is the signal

- When the person opens the folded line and uses a fix, or edits the feature the issue names, Maid takes that as "I want to fix existing data too".
- From then on, for this session, issues in existing data show as regular issues: coloured and open, and in the Issues list for what is visible (iD's "everything, visible").
- A short notice says so at that place, with one button to undo it: "Showing issues in existing data too · Keep them quiet".

### 4. The switch by hand

- A small "…" menu in the inspector's Issues section, and the same in the Issues list, has one setting: **issues in existing data**:
  - **Quiet** (default): folded and grey, as above.
  - **This session**: regular until the tab closes (also set by the signal in section 3).
  - **Always**: regular, remembered in browser storage for the next visit.
- It is a person's setting and a session setting, never part of a link: no URL parameter. A link is about the map and the data, not about how strict one mapper wants to be.

### 5. What stays as it is

- Issues the person ignored stay ignored (`validation-ignored.ts`).
- The save dialog lists only the person's own issues, in every mode, as iD does with "my edits".
- iD's URL parameters for issue levels (`validationDisable`, `validationWarning`, `validationError`) change the level of a rule, not this scope. They are a separate topic, see the URL work.

## Open points for later

- How far the neighbourhood reaches for a large relation: all loaded members, or a cap with "check all" on demand. The answer comes from measuring with the dense fixture (`bun run bench-validation`).
- Whether the Issues list in "this session" mode checks the visible area on each map move, or only on request. iD checks what is loaded. Measure first.
- The words for the folded line ("notes on existing data", "already there before you") need a native reader in each language.

## Size

Medium to large, in this order:

1. The validator keeps two lists, mine and existing, and can check a set of features on demand.
2. The quiet section in the inspector with its fold and the "…" setting. This needs one store with the session and the stored value.
3. The signal from a fix or an edit.
4. The route gap rule as a validator rule that knows mine from existing.
