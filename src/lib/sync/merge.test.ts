import { describe, expect, it } from "vitest";
import { createEmptyData, type HealthData, type WeightLog } from "@/lib/schema/data";
import { mergeData } from "./merge";

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();
const NOW = Date.UTC(2026, 9, 2);

function log(id: string, weightKg: number, minutes: number): WeightLog {
  return { id, date: id, weightKg, updatedAt: t(minutes) };
}

function data(patch: Partial<HealthData>): HealthData {
  return { ...createEmptyData(), ...patch };
}

describe("mergeData", () => {
  it("keeps additions from both sides", () => {
    const local = data({ weightLogs: [log("2026-10-01", 60, 1)] });
    const remote = data({ weightLogs: [log("2026-10-02", 61, 2)] });
    const { data: merged, stats } = mergeData(local, remote, NOW);
    expect(merged.weightLogs.map((w) => w.id).sort()).toEqual(["2026-10-01", "2026-10-02"]);
    expect(stats.kept).toBe(2);
  });

  it("takes the newer edit of the same record", () => {
    const local = data({ weightLogs: [log("d", 60, 5)] });
    const remote = data({ weightLogs: [log("d", 62, 3)] });
    expect(mergeData(local, remote, NOW).data.weightLogs[0].weightKg).toBe(60);
    expect(mergeData(remote, local, NOW).data.weightLogs[0].weightKg).toBe(60);
  });

  it("propagates deletions via tombstones", () => {
    const local = data({ weightLogs: [] });
    local.tombstones.weightLogs = { d: t(10) };
    const remote = data({ weightLogs: [log("d", 60, 5)] });
    const { data: merged, stats } = mergeData(local, remote, NOW);
    expect(merged.weightLogs).toHaveLength(0);
    expect(stats.deleted).toBe(1);
    expect(merged.tombstones.weightLogs.d).toBe(t(10));
  });

  it("keeps a record edited after it was deleted elsewhere", () => {
    const local = data({ weightLogs: [] });
    local.tombstones.weightLogs = { d: t(5) };
    const remote = data({ weightLogs: [log("d", 60, 9)] });
    expect(mergeData(local, remote, NOW).data.weightLogs).toHaveLength(1);
  });

  it("prunes tombstones older than 30 days", () => {
    const local = data({});
    local.tombstones.weightLogs = { old: new Date(NOW - 31 * 86400_000).toISOString() };
    expect(mergeData(local, data({}), NOW).data.tombstones.weightLogs).toEqual({});
  });

  it("unions checked shopping items", () => {
    const item = { ingredientId: "a", needG: 100, buyQty: 100, buyUnit: "g" as const, buyG: 100, checked: false, freeze: false };
    const trip = { id: "t", date: "2026-10-03", coversFrom: "2026-10-03", coversTo: "2026-10-09", status: "planned" as const };
    const local = data({ shoppingTrips: [{ ...trip, updatedAt: t(1), items: [{ ...item, checked: true }, { ...item, ingredientId: "b" }] }] });
    const remote = data({ shoppingTrips: [{ ...trip, updatedAt: t(2), items: [item, { ...item, ingredientId: "b", checked: true }] }] });
    const merged = mergeData(local, remote, NOW).data.shoppingTrips[0];
    expect(merged.items.every((i) => i.checked)).toBe(true);
  });
});
