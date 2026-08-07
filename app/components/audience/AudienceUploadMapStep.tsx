import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  CONTACT_IMPORT_LABELS,
  isContactImportTarget,
  type ContactImportMappingIssue,
  type ContactImportTarget,
} from "../../../shared/contact-import-headers";
import { AudienceUploadFileSummary } from "./AudienceUploadFileSummary";
import { VALID_HEADERS } from "./audience-upload-csv";
import {
  OPT_OUT_HINT,
  PHONE_SKIP_HINT,
  PREVIEW_ROW_COUNT,
} from "./audience-upload-wizard.shared";

export type AudienceUploadMapStepProps = {
  fileName: string;
  rowCount: number;
  headers: string[];
  headerMapping: Record<string, ContactImportTarget>;
  previewRows: Record<string, string>[];
  mappingIssues: ContactImportMappingIssue[];
  hasBlockingMappingIssue: boolean;
  hasOptOutMapped: boolean;
  onHeaderMappingChange: (header: string, target: ContactImportTarget) => void;
  onContinue: () => void;
  onChooseAnotherFile: () => void;
};

export function AudienceUploadMapStep({
  fileName,
  rowCount,
  headers,
  headerMapping,
  previewRows,
  mappingIssues,
  hasBlockingMappingIssue,
  hasOptOutMapped,
  onHeaderMappingChange,
  onContinue,
  onChooseAnotherFile,
}: AudienceUploadMapStepProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>{PHONE_SKIP_HINT}</AlertDescription>
      </Alert>

      {hasOptOutMapped ? (
        <Alert>
          <AlertDescription>{OPT_OUT_HINT}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border bg-muted/40 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-foreground">Map CSV Headers</h3>
          <AudienceUploadFileSummary
            fileName={fileName}
            rowCount={rowCount}
            columnCount={headers.length}
          />
        </div>

        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>CSV Header</TableHead>
              <TableHead>Maps To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {headers.map((header) => (
              <TableRow key={header}>
                <TableCell>{header}</TableCell>
                <TableCell>
                  <select
                    className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-zinc-800"
                    value={headerMapping[header]}
                    onChange={(e) => {
                      if (!isContactImportTarget(e.target.value)) return;
                      onHeaderMappingChange(header, e.target.value);
                    }}
                    aria-label={`Map ${header} to`}
                  >
                    {VALID_HEADERS.map((validHeader) => (
                      <option key={validHeader} value={validHeader}>
                        {CONTACT_IMPORT_LABELS[validHeader]}
                      </option>
                    ))}
                    <option value="name">
                      {CONTACT_IMPORT_LABELS.name} (split into names)
                    </option>
                  </select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {mappingIssues.length > 0 ? (
          <div className="mt-4 space-y-2" aria-live="polite">
            {mappingIssues.map((issue) => (
              <Alert
                key={`${issue.code}-${issue.headers.join("-")}`}
                variant={issue.blocking ? "destructive" : "default"}
              >
                <AlertTitle>Mapping needs attention</AlertTitle>
                <AlertDescription>{issue.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-4 font-medium text-foreground">
            Data Preview (First {PREVIEW_ROW_COUNT} rows)
          </h3>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => {
                    const target = headerMapping[header];
                    return (
                      <TableHead
                        key={header}
                        className="whitespace-nowrap px-3 py-2"
                      >
                        {header}
                        <div className="text-xs text-muted-foreground">
                          → {target}
                          {target
                            ? ` (${CONTACT_IMPORT_LABELS[target]})`
                            : ""}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, idx) => (
                  <TableRow key={idx}>
                    {headers.map((header) => (
                      <TableCell
                        key={header}
                        className="whitespace-nowrap px-3 py-2"
                      >
                        {String(row[header] || "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onChooseAnotherFile}>
          Choose another file
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={hasBlockingMappingIssue}
          className="bg-brand-primary text-white hover:bg-brand-secondary"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
