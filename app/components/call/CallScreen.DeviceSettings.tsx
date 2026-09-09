import React from "react";
import { Headphones, Mic, MicOff, Monitor, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AUDIO_DEVICE_UNAVAILABLE_VALUE } from "@/hooks/call/audio-device-selection";

const deviceSelectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

type DeviceChangeHandler = (event: React.ChangeEvent<HTMLSelectElement>) => void;

function toChangeEvent(value: string): React.ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as React.ChangeEvent<HTMLSelectElement>;
}

function AudioDeviceSelect({
  id,
  devices,
  selected,
  onChange,
  placeholder,
  unavailableLabel,
}: {
  id: string;
  devices: MediaDeviceInfo[];
  selected: string | null;
  onChange: DeviceChangeHandler;
  placeholder: string;
  unavailableLabel: string;
}) {
  return (
    <Select
      value={selected ?? AUDIO_DEVICE_UNAVAILABLE_VALUE}
      onValueChange={(value) => onChange(toChangeEvent(value))}
    >
      <FormFieldControl>
        <SelectTrigger id={id} className={deviceSelectClass}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormFieldControl>
      <SelectContent>
        {devices.map((device) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </SelectItem>
        ))}
        {devices.length === 0 ? (
          <SelectItem value={AUDIO_DEVICE_UNAVAILABLE_VALUE} disabled>
            {unavailableLabel}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export interface MicrophoneFieldProps {
  availableMicrophones: MediaDeviceInfo[];
  selectedMicrophone: string | null;
  handleMicrophoneChange: DeviceChangeHandler;
  handleMuteMicrophone: () => void;
  isMicrophoneMuted: boolean;
  onToggleMicMonitor?: () => void;
  micLevel?: number;
  isMicMonitoring?: boolean;
}

/**
 * Microphone select with its own controls directly beneath it: the #1339
 * test-mic toggle (and level meter while sampling) and the mute toggle.
 * The buttons say what they do, so the field carries a single label —
 * the "Microphone control" / "Test microphone" headings that used to sit
 * above each button were the redundant labels flagged in #1338.
 */
export function MicrophoneField({
  availableMicrophones,
  selectedMicrophone,
  handleMicrophoneChange,
  handleMuteMicrophone,
  isMicrophoneMuted,
  onToggleMicMonitor,
  micLevel = 0,
  isMicMonitoring = false,
}: MicrophoneFieldProps) {
  const selectId = "campaign-microphone-select";
  const meterPercent = Math.min(100, Math.round(micLevel * 100));

  return (
    <FormField
      htmlFor={selectId}
      label={
        <span className="flex items-center gap-2">
          <Mic size={16} /> Microphone
        </span>
      }
      description={
        isMicMonitoring ? "Speak — the meter reflects your input level." : undefined
      }
    >
      <AudioDeviceSelect
        id={selectId}
        devices={availableMicrophones}
        selected={selectedMicrophone}
        onChange={handleMicrophoneChange}
        placeholder="Select microphone"
        unavailableLabel="Microphone unavailable"
      />
      <div className="flex flex-wrap gap-2">
        {onToggleMicMonitor ? (
          <Button
            type="button"
            size="sm"
            variant={isMicMonitoring ? "destructive" : "outline"}
            onClick={onToggleMicMonitor}
            aria-pressed={isMicMonitoring}
            className="flex items-center gap-2"
          >
            <Mic size={16} />
            {isMicMonitoring ? "Stop test" : "Test microphone"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={isMicrophoneMuted ? "destructive" : "outline"}
          onClick={handleMuteMicrophone}
          className="flex items-center gap-2"
        >
          {isMicrophoneMuted ? <MicOff size={16} /> : <Mic size={16} />}
          {isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
        </Button>
      </div>
      {isMicMonitoring ? (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Microphone input level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={meterPercent}
        >
          <div
            data-testid="mic-level-fill"
            className="h-full rounded-full bg-success transition-[width] duration-75"
            style={{ width: `${meterPercent}%` }}
          />
        </div>
      ) : null}
    </FormField>
  );
}

export interface SpeakerFieldProps {
  availableSpeakers: MediaDeviceInfo[];
  selectedSpeaker: string | null;
  handleSpeakerChange: DeviceChangeHandler;
  onTestSpeaker?: () => void;
  isSpeakerPlaying?: boolean;
}

export function SpeakerField({
  availableSpeakers,
  selectedSpeaker,
  handleSpeakerChange,
  onTestSpeaker,
  isSpeakerPlaying = false,
}: SpeakerFieldProps) {
  const selectId = "campaign-speaker-select";

  return (
    <FormField
      htmlFor={selectId}
      label={
        <span className="flex items-center gap-2">
          <Headphones size={16} /> Speaker
        </span>
      }
      description={
        isSpeakerPlaying ? "Playing a short tone through the selected speaker." : undefined
      }
    >
      <AudioDeviceSelect
        id={selectId}
        devices={availableSpeakers}
        selected={selectedSpeaker}
        onChange={handleSpeakerChange}
        placeholder="Select speaker"
        unavailableLabel="Speaker unavailable"
      />
      {onTestSpeaker ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onTestSpeaker}
            disabled={isSpeakerPlaying}
            className="flex items-center gap-2"
          >
            <Headphones size={16} />
            {isSpeakerPlaying ? "Playing tone…" : "Test speaker"}
          </Button>
        </div>
      ) : null}
    </FormField>
  );
}

export interface CallingDeviceFieldProps {
  phoneStatus: "disconnected" | "connecting" | "connected";
  selectedDevice: string;
  onDeviceSelect: (device: string) => void;
  verifiedNumbers: string[];
  isAddingNumber: boolean;
  onAddNumberClick: () => void;
  onAddNumberCancel: () => void;
  newPhoneNumber: string;
  onNewPhoneNumberChange: (value: string) => void;
  onVerifyNewNumber: () => void;
  verificationPhoneNumber: string;
}

/**
 * Calling-device select with the Add Phone Number action on the same row
 * (stacked below it in a narrow container), followed by the inline
 * add/verify panels. Sharing the row is what keeps the button from
 * reading as a stray control with its own "Add device" heading.
 */
export function CallingDeviceField({
  phoneStatus,
  selectedDevice,
  onDeviceSelect,
  verifiedNumbers,
  isAddingNumber,
  onAddNumberClick,
  onAddNumberCancel,
  newPhoneNumber,
  onNewPhoneNumberChange,
  onVerifyNewNumber,
  verificationPhoneNumber,
}: CallingDeviceFieldProps) {
  const showAddButton = !isAddingNumber && !verificationPhoneNumber;

  return (
    <>
      <FormField
        label={
          <span className="flex items-center gap-2">
            <Phone size={16} /> Calling device
          </span>
        }
        description={phoneStatus === "connecting" ? "Connecting..." : undefined}
      >
        <div className="flex flex-col gap-2 @md:flex-row @md:items-center">
          <div className="relative min-w-0 flex-1">
            <Select value={selectedDevice} onValueChange={onDeviceSelect}>
              <SelectTrigger
                className={cn(deviceSelectClass, "w-full cursor-pointer pr-8")}
              >
                <SelectValue placeholder="Select device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="computer">Computer Audio</SelectItem>
                {verifiedNumbers.map((number) => (
                  <SelectItem key={number} value={number}>
                    {number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
              {selectedDevice === "computer" ? <Monitor size={16} /> : <Phone size={16} />}
            </div>
          </div>
          {showAddButton ? (
            <Button
              type="button"
              variant="outline"
              onClick={onAddNumberClick}
              className="flex shrink-0 items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Phone Number
            </Button>
          ) : null}
        </div>
      </FormField>

      {isAddingNumber ? (
        <div
          className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
          data-testid="add-phone-inline"
        >
          <div>
            <p className="text-sm font-medium">Add Phone Number</p>
            <p className="text-sm text-muted-foreground">
              Enter your phone number to verify it for making calls.
            </p>
          </div>
          <input
            type="tel"
            value={newPhoneNumber}
            onChange={(e) => onNewPhoneNumberChange(e.target.value)}
            placeholder="+1234567890"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onVerifyNewNumber}>
              Verify Number
            </Button>
            <Button type="button" variant="outline" onClick={onAddNumberCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {verificationPhoneNumber ? (
        <div
          className="space-y-2 rounded-md border border-border bg-muted/30 p-4"
          data-testid="verify-phone-inline"
        >
          <p className="text-sm font-medium">Verify by calling in</p>
          <p className="text-sm text-muted-foreground">
            Call {verificationPhoneNumber} from {newPhoneNumber} within 10 minutes.
            Your number will be verified when the call connects.
          </p>
        </div>
      ) : null}
    </>
  );
}

export type DeviceSettingsPanelProps = MicrophoneFieldProps &
  SpeakerFieldProps &
  CallingDeviceFieldProps & {
    audioTestError?: string | null;
  };

/**
 * The body of the call-settings sheet (and the in-page "Audio & phone
 * settings" accordion). Laid out with container queries rather than
 * viewport breakpoints: the sheet is ~36rem wide on a desktop viewport,
 * so a `md:grid-cols-3` grid keyed off the window squeezed three
 * columns into it and clipped the buttons at both edges (#1338).
 */
export function DeviceSettingsPanel({
  audioTestError = null,
  ...fields
}: DeviceSettingsPanelProps) {
  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <MicrophoneField
          availableMicrophones={fields.availableMicrophones}
          selectedMicrophone={fields.selectedMicrophone}
          handleMicrophoneChange={fields.handleMicrophoneChange}
          handleMuteMicrophone={fields.handleMuteMicrophone}
          isMicrophoneMuted={fields.isMicrophoneMuted}
          onToggleMicMonitor={fields.onToggleMicMonitor}
          micLevel={fields.micLevel}
          isMicMonitoring={fields.isMicMonitoring}
        />
        <SpeakerField
          availableSpeakers={fields.availableSpeakers}
          selectedSpeaker={fields.selectedSpeaker}
          handleSpeakerChange={fields.handleSpeakerChange}
          onTestSpeaker={fields.onTestSpeaker}
          isSpeakerPlaying={fields.isSpeakerPlaying}
        />
      </div>

      {audioTestError ? (
        <p role="alert" className="text-sm text-destructive-text" data-testid="audio-test-error">
          {audioTestError}
        </p>
      ) : null}

      <CallingDeviceField
        phoneStatus={fields.phoneStatus}
        selectedDevice={fields.selectedDevice}
        onDeviceSelect={fields.onDeviceSelect}
        verifiedNumbers={fields.verifiedNumbers}
        isAddingNumber={fields.isAddingNumber}
        onAddNumberClick={fields.onAddNumberClick}
        onAddNumberCancel={fields.onAddNumberCancel}
        newPhoneNumber={fields.newPhoneNumber}
        onNewPhoneNumberChange={fields.onNewPhoneNumberChange}
        onVerifyNewNumber={fields.onVerifyNewNumber}
        verificationPhoneNumber={fields.verificationPhoneNumber}
      />
    </div>
  );
}
