// Documentation only: A custom Error subclass that carries an HTTP status code
// alongside the error message. Thrown from service functions to signal specific
// HTTP error conditions (400, 401, 404, 409, etc.) without leaking HTTP concerns
// into the service layer itself. The global error handler in index.ts reads
// statusCode to set the response status, defaulting to 500 for plain Error objects.

export class AppError extends Error {
  // The HTTP status code that should be sent in the response when this error surfaces.
  readonly statusCode: number;

  // Documentation only: Constructs a new AppError with an explicit HTTP status code
  // and a human-readable error message.
  // Accepts statusCode (number) — the HTTP status to respond with — and
  // message (string) — the human-readable description of what went wrong.
  // Sets the Error prototype chain correctly so instanceof checks work at runtime.
  constructor(statusCode: number, message: string) {
    super(message);

    this.statusCode = statusCode;

    // Restore the prototype chain that is lost when extending built-in classes
    // in TypeScript compiled to ES5/ES2015 targets.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
