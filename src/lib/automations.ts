export type AutomationRun = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  threadId: string;
  createdAt: number;
  completedAt?: number | null;
  error?: string | null;
};

export type Automation = {
  id: string;
  name: string;
  prompt: string;
  status: "ACTIVE" | "PAUSED";
  kind: "heartbeat" | "cron";
  rrule: string;
  targetThreadId?: string | null;
  projectRoot: string;
  provider: string;
  model?: string | null;
  effort?: string | null;
  permissionMode?: string | null;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  lastError?: string | null;
  runs: AutomationRun[];
  createdAt: number;
  updatedAt: number;
};

export type ScheduleMode = "interval" | "hourly" | "daily" | "weekdays" | "weekly" | "custom";
export type ScheduleDraft = {
  mode: ScheduleMode;
  intervalMinutes: number;
  time: string;
  weekday: string;
  customRrule: string;
};

function fields(rrule: string) {
  return Object.fromEntries(rrule.replace(/^RRULE:/i, "").split(";").flatMap((part) => {
    const [key, value] = part.split("=");
    return key && value ? [[key.toUpperCase(), value.toUpperCase()]] : [];
  }));
}

export function scheduleFromRrule(rrule: string, kind: Automation["kind"]): ScheduleDraft {
  const value = fields(rrule);
  const time = `${String(Number(value.BYHOUR ?? 9)).padStart(2, "0")}:${String(Number(value.BYMINUTE ?? 0)).padStart(2, "0")}`;
  if (value.FREQ === "MINUTELY") return { mode: "interval", intervalMinutes: Number(value.INTERVAL ?? 30), time, weekday: "MO", customRrule: rrule };
  if (value.FREQ === "HOURLY") return { mode: kind === "heartbeat" ? "interval" : "hourly", intervalMinutes: Number(value.INTERVAL ?? 1) * 60, time, weekday: "MO", customRrule: rrule };
  if (value.FREQ === "DAILY" && value.BYDAY === "MO,TU,WE,TH,FR") return { mode: "weekdays", intervalMinutes: 30, time, weekday: "MO", customRrule: rrule };
  if (value.FREQ === "DAILY") return { mode: "daily", intervalMinutes: 30, time, weekday: "MO", customRrule: rrule };
  if (value.FREQ === "WEEKLY") return { mode: "weekly", intervalMinutes: 30, time, weekday: value.BYDAY?.split(",")[0] ?? "MO", customRrule: rrule };
  return { mode: "custom", intervalMinutes: 30, time, weekday: "MO", customRrule: rrule };
}

export function rruleFromSchedule(schedule: ScheduleDraft, kind: Automation["kind"]) {
  const [hour, minute] = schedule.time.split(":").map(Number);
  if (schedule.mode === "interval") return `FREQ=MINUTELY;INTERVAL=${Math.max(1, schedule.intervalMinutes)}`;
  if (schedule.mode === "hourly") return "FREQ=HOURLY;INTERVAL=1;BYMINUTE=0";
  if (schedule.mode === "daily") return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`;
  if (schedule.mode === "weekdays") return `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=${hour};BYMINUTE=${minute}`;
  if (schedule.mode === "weekly") return `FREQ=WEEKLY;BYDAY=${schedule.weekday};BYHOUR=${hour};BYMINUTE=${minute}`;
  return schedule.customRrule.replace(/^RRULE:/i, "") || (kind === "heartbeat" ? "FREQ=MINUTELY;INTERVAL=30" : "FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
}
