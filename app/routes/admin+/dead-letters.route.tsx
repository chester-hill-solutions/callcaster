export { loader } from "./dead-letters.loader.server";
export { action } from "./dead-letters.action.server";

import { Link, useFetcher, useLoaderData } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTableOverflow } from "@/components/admin/AdminTableOverflow";
import type { DeadLetteredJobRow } from "./admin.types";

type LoaderData = {
  jobs: DeadLetteredJobRow[];
};

/**
 * Requeue control for one row.
 *
 * A fetcher per row rather than one shared: with a single fetcher every button
 * shows the pending state while any one job is requeuing, and the result
 * message cannot be attributed to the row it came from.
 */
function RequeueButton({ jobId }: { jobId: number }) {
  const fetcher = useFetcher<{ error?: string; message?: string }>();
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? "Requeuing..." : "Requeue"}
      </Button>
      {fetcher.data?.error && (
        <span className="text-xs text-destructive">{fetcher.data.error}</span>
      )}
      {fetcher.data?.message && (
        <span className="text-xs text-muted-foreground">{fetcher.data.message}</span>
      )}
    </fetcher.Form>
  );
}

export default function AdminDeadLetters() {
  const { jobs } = useLoaderData<LoaderData>();

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Dead-Letter Jobs</CardTitle>
              <CardDescription>
                Jobs that exhausted all retry attempts, newest first. Requeue
                returns a job to the worker with a fresh set of attempts; the
                billing paths are idempotent, so a job that failed after its
                ledger write will not charge twice.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
              <Link to="/admin">Back to dashboard</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dead-letter jobs.
            </p>
          ) : (
            <AdminTableOverflow>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">{job.type}</Badge>
                          <span className="text-muted-foreground">#{job.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>{job.workspace_id ?? "—"}</TableCell>
                      <TableCell>
                        {job.attempt_count ?? "?"}/{job.max_attempts ?? "?"}
                      </TableCell>
                      <TableCell className="max-w-xl whitespace-normal">
                        {job.dead_letter_reason ??
                          job.error_message ??
                          "No reason recorded"}
                      </TableCell>
                      <TableCell>
                        {job.failed_at
                          ? new Date(job.failed_at).toLocaleString()
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RequeueButton jobId={job.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTableOverflow>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
