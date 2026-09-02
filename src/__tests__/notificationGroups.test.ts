import { groupOf, withGroupHeaders } from "../utils/notificationGroups";

// A fixed "now": 2026-08-23, early evening local time.
const NOW = new Date(2026, 7, 23, 18, 30, 0);

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m, d, h, min, 0).toISOString();

describe("groupOf", () => {
  it("bands by CALENDAR day, not by hours elapsed", () => {
    // 00:05 today is 18 hours ago — still TODAY. A naive "< 24h" rule files it
    // under TODAY too, so the case that separates them is the next one.
    expect(groupOf(at(2026, 7, 23, 0, 5), NOW)).toBe("TODAY");
    // 23:50 yesterday is under 24h ago but is NOT today.
    expect(groupOf(at(2026, 7, 22, 23, 50), NOW)).toBe("YESTERDAY");
  });

  it("puts anything older under EARLIER", () => {
    expect(groupOf(at(2026, 7, 21, 23, 59), NOW)).toBe("EARLIER");
    expect(groupOf(at(2025, 0, 1), NOW)).toBe("EARLIER");
  });

  it("treats an unparseable timestamp as EARLIER rather than throwing", () => {
    expect(groupOf("not-a-date", NOW)).toBe("EARLIER");
  });
});

describe("withGroupHeaders", () => {
  const item = (id: string, createdAt: string) => ({ id, createdAt });

  it("emits one header per band, in feed order", () => {
    const rows = withGroupHeaders(
      [
        item("a", at(2026, 7, 23, 17)),
        item("b", at(2026, 7, 23, 9)),
        item("c", at(2026, 7, 22, 10)),
        item("d", at(2026, 7, 1, 10)),
      ],
      NOW,
    );

    expect(rows.map((r) => (r.kind === "header" ? r.label : r.key))).toEqual([
      "TODAY", "a", "b",
      "YESTERDAY", "c",
      "EARLIER", "d",
    ]);
  });

  it("emits nothing for an empty feed", () => {
    expect(withGroupHeaders([], NOW)).toEqual([]);
  });

  it("does not repeat a header when a band has a single entry", () => {
    const rows = withGroupHeaders([item("a", at(2026, 7, 22, 10))], NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "header", label: "YESTERDAY" });
  });
});
