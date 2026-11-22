import { describe, expect, it } from "vitest";
import { estimate, feeFor, limitsForPlan, planNameForBps, tierForSavings, usageStatus } from "./billing";

describe("billing", () => {
  it("maps rates to plan names", () => {
    expect(planNameForBps(2500)).toBe("Starter");
    expect(planNameForBps(2000)).toBe("Growth");
    expect(planNameForBps(1500)).toBe("Scale");
    expect(planNameForBps(1234)).toBe("Custom");
  });
  it("picks tier by monthly band edges", () => {
    expect(tierForSavings(50_000_000).id).toBe("starter");
    expect(tierForSavings(50_000_001).id).toBe("growth");
    expect(tierForSavings(250_000_001).id).toBe("scale");
  });
  it("estimates fee and net", () => {
    expect(estimate(10_000_000)).toEqual({ feeMinor: 2_500_000, netMinor: 7_500_000 });
    expect(estimate(-5)).toEqual({ feeMinor: 0, netMinor: 0 });
    expect(feeFor(3, 2000)).toBe(1);
  });
  it("classifies usage against limits", () => {
    expect(usageStatus(79, 100)).toEqual({ ratio: 0.79, state: "ok" });
    expect(usageStatus(80, 100).state).toBe("near");
    expect(usageStatus(100, 100).state).toBe("near");
    expect(usageStatus(101, 100).state).toBe("over");
    expect(usageStatus(5, null).state).toBe("unlimited");
    expect(usageStatus(0, 0).state).toBe("ok");
    expect(usageStatus(1, 0).state).toBe("over");
  });
  it("uses growth limits for custom plans", () => {
    expect(limitsForPlan("Custom").invoicesPerMonth).toBe(1000);
    expect(limitsForPlan("Scale").users).toBeNull();
  });
});
