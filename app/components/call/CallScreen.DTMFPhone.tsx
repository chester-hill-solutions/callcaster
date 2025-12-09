import React from 'react';
import { Button } from "~/components/ui/button";

interface PhoneKeypadProps {
  onKeyPress: (key: string) => void;
  displayState: string;
  displayColor: string;
  callDuration: number;
}

export const PhoneKeypad: React.FC<PhoneKeypadProps> = ({
  onKeyPress,
  displayState,
  displayColor,
  callDuration
}) => {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`border-2 border-[${displayColor}] rounded-lg`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px",
          background: displayColor,
        }}
        className="rounded-t-lg font-Tabac-Slab text-white"
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          {displayState === "failed" && <div>Call Failed</div>}
          {displayState === "dialing" && (
            <div>Dialing... {formatTime(callDuration)}</div>
          )}
          {displayState === "connected" && (
            <div>Connected {formatTime(callDuration)}</div>
          )}
          {displayState === "no-answer" && <div>No Answer</div>}
          {displayState === "voicemail" && <div>Voicemail Left</div>}
          {displayState === "completed" && <div>Call Completed</div>}
          {displayState === "idle" && <div>Pending</div>}
        </div>
      </div>
      <div className="flex w-[130px] flex-wrap justify-between p-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"].map((item, index) => (
          <Button
            className="m-0.5 h-6 w-6 rounded-xl p-1 text-xs transition-all hover:shadow-inner active:bg-red-900"
            key={index}
            onClick={() => onKeyPress(`${item}`)}
          >
            {item}
          </Button>
        ))}
      </div>
    </div>
  );
};