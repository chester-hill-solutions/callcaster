import { forwardRef, useRef, useState, type ReactNode } from "react";
import { MdCheckCircle, MdUploadFile } from "react-icons/md";
import { cn } from "@/lib/utils";

export type FileDropzoneProps = {
  name: string;
  accept: string;
  ariaLabel: string;
  title: string;
  hint?: string;
  /** File name to show in place of `title` once a file has been chosen — for
   * flows with no next step to confirm the selection elsewhere. */
  selectedFileName?: string;
  icon?: ReactNode;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File) => void;
};

/**
 * Shared drag-and-drop upload zone. Extracted from the audience-upload
 * wizard's CSV picker (#1395) so every file-upload flow in the app shares one
 * dropzone implementation instead of hand-rolling its own.
 */
export const FileDropzone = forwardRef<HTMLInputElement, FileDropzoneProps>(
  function FileDropzone(
    {
      name,
      accept,
      ariaLabel,
      title,
      hint,
      selectedFileName,
      icon,
      onFileChange,
      onFileDrop,
    },
    ref,
  ) {
    const [isDragging, setIsDragging] = useState(false);
    // dragenter/dragleave fire per nested child; a depth counter keeps the
    // active state consistent until the cursor actually leaves the zone.
    const dragDepth = useRef(0);

    const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    };

    // dragover fires continuously while the cursor hovers, which makes it the
    // self-heal point: the OS can steal key-window mid-drag (reproduced in
    // Helium even on a bare page, #1358) and deliver an unpaired dragleave
    // that latches the depth counter off. Re-asserting the active state here
    // recovers the highlight within one event instead of staying dead until
    // the cursor physically re-enters.
    const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      if (!isDragging) {
        dragDepth.current = Math.max(dragDepth.current, 1);
        setIsDragging(true);
      }
    };

    const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) onFileDrop(file);
    };

    return (
      <label
        htmlFor={name}
        data-drag-active={isDragging}
        className={cn(
          "flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-border hover:bg-muted/50",
          isDragging && "border-primary bg-primary/10",
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {selectedFileName ? (
            <MdCheckCircle className="size-5" aria-hidden />
          ) : (
            (icon ?? <MdUploadFile className="size-5" aria-hidden />)
          )}
        </span>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-foreground">
            {selectedFileName ?? title}
          </span>
          {!selectedFileName && hint ? (
            <span className="block text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </div>
        <input
          ref={ref}
          type="file"
          name={name}
          id={name}
          accept={accept}
          className="block max-w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
          onChange={onFileChange}
          aria-label={ariaLabel}
        />
      </label>
    );
  },
);
