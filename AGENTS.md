# Working on this repository

This project is built by one engineer with an AI coding assistant. These are the rules
both follow. Any agent working here follows them too.

## Who decides

- The engineer decides. The assistant proposes, builds and explains; it never merges.
- The engineer reviews every pull request, runs the tests and the demo.
- The query-time access filter (user → principals → visible passages) is hand-written by the engineer, with syntax help from the assistant.
  It is the heart of "nobody may see what they shouldn't", so it is not delegated.
- When the assistant is wrong, it says so and the correction is recorded (decision records,
  their dated updates, and the contract page).

## Workflow

1. **Spec first.** A change in behaviour is written into [`SPEC.md`](SPEC.md) and, if it touches
   an input or output, into [`docs/contract.md`](docs/contract.md) before the code. These pages
   describe what the system is, in the present tense; git holds the history.
2. **Decision record** for every store and every main choice, in [`docs/decisions/`](docs/decisions/),
   dated when the choice is made and answering: why here, what if it is down or loses data,
   what if it is much bigger, what would make us move and at what cost. Later learning is added
   as a dated update, never by rewriting the original reasoning.
3. **One branch per change**, one pull request into `main`. Nothing is pushed to `main` directly.
   Branches start from `main`, not from another open branch.
4. **Tests with the change.** Access rules always get a test that tries to see what must stay hidden.

## Quality gate (before every commit that changes behaviour)

1. `npm run lint` and `npm run typecheck`: zero errors, zero warnings.
2. `npm test`: green.
3. A review of the changed code against five criteria. Each must pass:
   - **DRY, rule of three**: a pattern repeated three times is extracted; two is fine.
     Premature abstraction is worse than duplication.
   - **Single source of truth**: each piece of data has one owner; derived values are computed,
     not stored a second time.
   - **Domain complexity isolated**: rules live in typed domain modules; inputs and outputs
     (files, HTTP, the simulator) sit behind the interfaces in `src/ports.ts` and can be swapped.
   - **One responsibility per unit**: each module has one reason to change.
   - **Names that explain**: a newcomer understands a unit from its name and shape.
4. A pattern flagged twice becomes a lint rule (`eslint-plugin-gandalf/`).

Documentation-only changes skip step 3.

## Map

| Where | What |
|---|---|
| `src/cli.ts` | The judge's door: `ingest`, `status`, `ask`, `serve` |
| `src/ports.ts` | Every external input and output, as an interface |
| `src/simulator/` | Our simulator: embed, extract, limits, prices, throttling |
| `src/sources/` | Mapping layers from a data format to the ports |
| `src/ingest/` | Chunking, indexing, the initial load |
| `src/access/` | Access labels and the access filter |
| `src/store/` | The single SQLite store (decision 0002) |
| `data/sample/` | Generated sample company, scripted feed with traps, eval set |
