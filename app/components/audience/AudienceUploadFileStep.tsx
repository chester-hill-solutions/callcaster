import { forwardRef } from "react";
import { MdUploadFile } from "react-icons/md";

export type AudienceUploadFileStepProps = {
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File) => void;
};

export const AudienceUploadFileStep = forwardRef<
  HTMLInputElement,
  AudienceUploadFileStepProps
>(function AudienceUploadFileStep({ onFileChange, onFileDrop }, ref) {
  return (
    <label
      htmlFor="contacts"
      className="flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-border hover:bg-muted/50"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) onFileDrop(file);
      }}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MdUploadFile className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <span className="block text-sm font-medium text-foreground">
          Drop or choose a CSV file
        </span>
        <span className="block text-xs text-muted-foreground">CSV</span>
      </div>
      <input
        ref={ref}
        type="file"
        name="contacts"
        id="contacts"
        accept=".csv,text/csv"
        className="block max-w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
        onChange={onFileChange}
        aria-label="Choose a CSV file to upload"
      />
    </label>
  );
});
