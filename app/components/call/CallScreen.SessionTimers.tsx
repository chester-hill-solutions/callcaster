import { useEffect, useReducer } from "react";
import { formatTime } from "@/lib/utils";

type SessionTime = {
  startedAt: number;
  updatedAt: number;
  talkMilliseconds: number;
  isTalking: boolean;
};

type ClockUpdate = { now: number; isTalking: boolean };

function updateTime(previous: SessionTime, update: ClockUpdate): SessionTime {
  const updatedAt = Math.max(previous.updatedAt, update.now);
  return {
    ...previous,
    updatedAt,
    talkMilliseconds: previous.talkMilliseconds +
      (previous.isTalking ? updatedAt - previous.updatedAt : 0),
    isTalking: update.isTalking,
  };
}

function startTime(isTalking: boolean): SessionTime {
  const now = Date.now();
  return { startedAt: now, updatedAt: now, talkMilliseconds: 0, isTalking };
}

/** Mounted once per workspace/campaign visit by the shared calling header. */
export function CallSessionTimers({ isTalking }: { isTalking: boolean }) {
  const [time, updateClock] = useReducer(updateTime, isTalking, startTime);

  /**
   * @effect Refresh the session clocks and record each connected-state edge.
   * @effect-deps isTalking (the call screen's recipient connection state)
   * @effect-side-effects timer (setInterval) + reducer updates; clear on change/unmount
   * @effect-why-not-loader Elapsed visit time is a live client clock, not request data.
   */
  useEffect(() => {
    const tick = () => updateClock({ now: Date.now(), isTalking });
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isTalking]);

  return (
    <>
      <span role="timer" aria-label="Calling session elapsed time" aria-live="off"
        title="Elapsed time on this calling screen, including time between calls."
        className="whitespace-nowrap tabular-nums">
        Session {formatTime((time.updatedAt - time.startedAt) / 1000)}
      </span>
      <span role="timer" aria-label="Calling session talk time" aria-live="off"
        title="Total time with a connected recipient during this session."
        className="whitespace-nowrap tabular-nums">
        Talk {formatTime(time.talkMilliseconds / 1000)}
      </span>
    </>
  );
}
