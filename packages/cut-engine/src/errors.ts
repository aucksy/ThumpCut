/**
 * The engine's errors. These are thrown, never shown — the caller maps them to the user
 * messages in the phase specs. `specs/02-cut-engine.md` §7.
 */

export class CutEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    // Keeps `instanceof` working when this is compiled down for older runtimes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** C-E1 — the caller must prevent this. There is no reel with no pictures in it. */
export class EmptyMediaError extends CutEngineError {
  constructor() {
    super("C-E1", "No media items were supplied.");
  }
}

/** C-E2 — fewer than three items. */
export class InsufficientMediaError extends CutEngineError {
  constructor(count: number) {
    super("C-E2", `Only ${count} media item(s) supplied; at least 3 are required.`);
  }
}

/** C-E3 — the beat map cannot be used: no beats, beats out of order, or a length mismatch. */
export class InvalidBeatMapError extends CutEngineError {
  constructor(reason: string) {
    super("C-E3", `Beat map is unusable: ${reason}`);
  }
}

/** C-E4 — even at the coarsest fallback this template cannot fill the window legally. */
export class TemplateIncompatibleError extends CutEngineError {
  constructor(templateId: string, reason: string) {
    super("C-E4", `Template "${templateId}" cannot fit this selection: ${reason}`);
  }
}

/** Raised when a guardrail is violated in the returned cut list. A bug, not a user error. */
export class GuardrailViolation extends CutEngineError {
  constructor(guardrail: string, detail: string) {
    super(guardrail, `Guardrail ${guardrail} violated: ${detail}`);
  }
}
