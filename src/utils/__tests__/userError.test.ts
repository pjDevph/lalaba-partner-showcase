// src/utils/__tests__/userError.test.ts
// Unit tests for the safe user-error mapper (RISK-H-032): technical messages
// must never surface; short human copy passes through.

import { toUserMessage, GENERIC_ERROR } from "../userError";

describe("toUserMessage", () => {
  const FALLBACK = "Couldn't save. Please try again.";

  it("returns the fallback for null/undefined/empty errors", () => {
    expect(toUserMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage({}, FALLBACK)).toBe(FALLBACK);
  });

  it("defaults to GENERIC_ERROR when no fallback is given", () => {
    expect(toUserMessage(new Error("MongoServerError: boom"))).toBe(GENERIC_ERROR);
  });

  it.each([
    "E11000 duplicate key error collection: lalaba.users",
    "MongoServerError: something broke",
    'GraphQL error: Cannot query field "foo" on type "Query"',
    'Variable "$input" got invalid value',
    "Unknown argument \"$id\"",
    "HttpException: Internal Server Error",
    "Cast to ObjectId failed for value \"abc\"",
    "INTERNAL_SERVER_ERROR",
    "Network request failed",
    "undefined is not a function",
    "jwt expired",
  ])("filters technical message %#", (msg) => {
    expect(toUserMessage(new Error(msg), FALLBACK)).toBe(FALLBACK);
  });

  it("filters messages that are too long to be user copy", () => {
    expect(toUserMessage(new Error("x".repeat(500)), FALLBACK)).toBe(FALLBACK);
  });

  it("passes through short human-written messages", () => {
    expect(toUserMessage(new Error("You still have 2 active orders."), FALLBACK))
      .toBe("You still have 2 active orders.");
    expect(toUserMessage("Phone number is already in use.", FALLBACK))
      .toBe("Phone number is already in use.");
  });

  it("reads message from plain error-like objects", () => {
    expect(toUserMessage({ message: "Branch name is required." }, FALLBACK))
      .toBe("Branch name is required.");
    expect(toUserMessage({ message: "MongoServerError: nope" }, FALLBACK)).toBe(FALLBACK);
  });
});
