import {
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Keypad } from "@/components/calls/Keypad";

type SoftphoneAudioControlsProps = {
  idPrefix: string;
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedMicId: string;
  selectedSpeakerId: string;
  micMuted: boolean;
  speakerMuted: boolean;
  callOnHold: boolean;
  onMicChange: (deviceId: string) => void;
  onSpeakerChange: (deviceId: string) => void;
  onMuteMic: () => void;
  onMuteSpeaker: () => void;
  onHold: () => void;
  onResume: () => void;
  onHangUp: () => void;
  onKeypadPress: (key: string) => void;
};

export function SoftphoneAudioControls({
  idPrefix,
  microphones,
  speakers,
  selectedMicId,
  selectedSpeakerId,
  micMuted,
  speakerMuted,
  callOnHold,
  onMicChange,
  onSpeakerChange,
  onMuteMic,
  onMuteSpeaker,
  onHold,
  onResume,
  onHangUp,
  onKeypadPress,
}: SoftphoneAudioControlsProps) {
  return (
    <div className="mt-4 rounded-lg bg-green-100 p-4 dark:bg-green-900/30">
      <p className="font-medium">Connected</p>

      <div className="mt-3 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Audio</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor={`${idPrefix}-mic-select`}
              className="text-xs text-muted-foreground"
            >
              Microphone
            </label>
            <Select
              value={selectedMicId || undefined}
              onValueChange={onMicChange}
            >
              <SelectTrigger id={`${idPrefix}-mic-select`} className="w-full">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {microphones.map((d) => (
                  <SelectItem
                    key={d.deviceId}
                    value={d.deviceId || "default"}
                  >
                    {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                  </SelectItem>
                ))}
                {microphones.length === 0 && (
                  <SelectItem value="none" disabled>
                    No microphones
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`w-full gap-1 ${micMuted ? "bg-red-100 text-red-600 dark:bg-red-900/30" : ""}`}
              onClick={onMuteMic}
            >
              {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
              {micMuted ? "Unmute mic" : "Mute mic"}
            </Button>
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`${idPrefix}-speaker-select`}
              className="text-xs text-muted-foreground"
            >
              Speaker
            </label>
            <Select
              value={selectedSpeakerId || undefined}
              onValueChange={onSpeakerChange}
            >
              <SelectTrigger
                id={`${idPrefix}-speaker-select`}
                className="w-full"
              >
                <SelectValue placeholder="Select speaker" />
              </SelectTrigger>
              <SelectContent>
                {speakers.map((d) => (
                  <SelectItem
                    key={d.deviceId}
                    value={d.deviceId || "default"}
                  >
                    {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                  </SelectItem>
                ))}
                {speakers.length === 0 && (
                  <SelectItem value="none" disabled>
                    No speakers
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`w-full gap-1 ${speakerMuted ? "bg-red-100 text-red-600 dark:bg-red-900/30" : ""}`}
              onClick={onMuteSpeaker}
            >
              {speakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {speakerMuted ? "Unmute speaker" : "Mute speaker"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {callOnHold ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onResume}
          >
            <Play size={14} />
            Resume
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onHold}
          >
            <Pause size={14} />
            Hold
          </Button>
        )}
        <Button
          onClick={onHangUp}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          <PhoneOff size={14} />
          Hang up
        </Button>
      </div>

      <Keypad onKeyPress={onKeypadPress} />
    </div>
  );
}
