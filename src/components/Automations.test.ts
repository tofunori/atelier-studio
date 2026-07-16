import { describe, expect, it } from "vitest";

import { rruleFromSchedule, scheduleFromRrule } from "../lib/automations";

describe("automation schedule mapping", () => {
  it("préserve l’intervalle heartbeat Codex par défaut", () => {
    const schedule = scheduleFromRrule("FREQ=MINUTELY;INTERVAL=30", "heartbeat");
    expect(schedule).toMatchObject({ mode: "interval", intervalMinutes: 30 });
    expect(rruleFromSchedule(schedule, "heartbeat")).toBe("FREQ=MINUTELY;INTERVAL=30");
  });

  it("convertit les jours ouvrables sans perdre l’heure", () => {
    const schedule = scheduleFromRrule("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=15", "cron");
    expect(schedule).toMatchObject({ mode: "weekdays", time: "08:15" });
    expect(rruleFromSchedule(schedule, "cron")).toBe("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=15");
  });
});
