export function providerIdentity(sessionId: unknown): { provider: string; subject: string } {
  if (typeof sessionId !== "string" || !/^google:[^\s:]{1,255}$/.test(sessionId)) {
    throw new Error("Please sign in again.");
  }
  return { provider: "google", subject: sessionId.slice(7) };
}

export function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error("Invalid input.");
  return value.trim();
}
