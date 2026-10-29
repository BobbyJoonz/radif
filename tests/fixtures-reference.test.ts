import { describe, expect, it } from "vitest";
import { DEMO_TEXTS, MOCK_FIXTURES } from "@/server/providers/fixtures";
import { FIXTURE_LABELS } from "@/server/providers/fixture-labels";

/**
 * The mock provider is deterministic, which makes it easy for the "expected
 * result" to become whatever the code does. This test is the guard: the label is
 * written from the Persian text (fixture-labels.ts), and the provider must agree
 * with it. If someone changes a fixture's primary or drops a flag, this fails.
 *
 * It also enforces the brief §16 requirement that *every* fixture carries a human
 * reference label and an expected result — a fixture without one is a demo case
 * nobody has actually read.
 */
describe("demo fixtures carry a human reference reading (brief §16)", () => {
  it("every fixture text has a label", () => {
    const missing = MOCK_FIXTURES.filter((f) => !FIXTURE_LABELS[f.text]).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it("every label belongs to a real demo message", () => {
    // Three second-shop texts are handled by the rule-based classifier rather
    // than a fixture, so the contract is "this is a demo text", not "this is a
    // fixture": a label may never describe a sentence the product never sees.
    const demoTexts = new Set(Object.values(DEMO_TEXTS));
    const orphaned = Object.keys(FIXTURE_LABELS).filter((text) => !demoTexts.has(text));
    expect(orphaned).toEqual([]);
  });

  for (const fixture of MOCK_FIXTURES) {
    it(`${fixture.id}: the provider agrees with the human reading`, () => {
      const label = FIXTURE_LABELS[fixture.text];
      expect(label, `no label for ${fixture.id}`).toBeTruthy();

      // The primary request is the one a person would name first.
      expect(fixture.primary).toBe(label.primary);

      // A message may carry more requests, but never invent one the person did
      // not read in the text, and never lose one they did.
      const providerFlags = fixture.flags.filter((f) => f.value).map((f) => f.intent).sort();
      expect(providerFlags).toEqual([...label.flags].sort());

      // Ambiguity and untrusted text must reach a human, never be auto-applied.
      if (fixture.orderStrategy === "ambiguous" || fixture.primary === "other_unknown") {
        expect(label.requiresHumanReview).toBe(true);
      }

      // Address: "missing" is the case the product exists for — the message says
      // the address changed but does not state the new one.
      if (fixture.address) {
        expect(fixture.address.stated ? "stated" : "missing").toBe(label.address);
      } else {
        expect(label.address).toBe("none");
      }
    });
  }
});
