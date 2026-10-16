import { describe, expect, it } from "vitest";
import { defaultSettings, EPOCH, type ShoppingTrip } from "@/lib/schema/data";
import { effectiveTripDates } from "./actions";

const settings = defaultSettings(EPOCH); // 每周六采购
const doneTrip = (date: string) => ({ id: `trip_${date}`, date, status: "done", items: [] }) as unknown as ShoppingTrip;

describe("effectiveTripDates", () => {
  it("adds a catch-up trip today when the last scheduled trip was not done", () => {
    const dates = effectiveTripDates({ settings, shoppingTrips: [] }, "2026-10-12", "2026-10-15");
    expect(dates).toContain("2026-10-15");
    expect(dates).toContain("2026-10-17");
  });

  it("does not add a catch-up trip once the last scheduled trip is done", () => {
    const dates = effectiveTripDates({ settings, shoppingTrips: [doneTrip("2026-10-10")] }, "2026-10-12", "2026-10-15");
    expect(dates).not.toContain("2026-10-15");
  });

  it("keeps a completed catch-up trip as a trip date", () => {
    const dates = effectiveTripDates({ settings, shoppingTrips: [doneTrip("2026-10-15")] }, "2026-10-12", "2026-10-16");
    expect(dates).toContain("2026-10-15");
    expect(dates).not.toContain("2026-10-16");
  });
});
