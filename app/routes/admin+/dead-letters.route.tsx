export { loader } from "./dead-letters.loader.server";

import { Link, useLoaderData } from "react-router";
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
import type { DeadLetteredJobRow } from "./admin.types";

type LoaderData = {
  jobs: DeadLetteredJobRow[];
};

export default function AdminDeadLetters() {
  const { jobs } = useLoaderData<LoaderData>();

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Dead-Letter Jobs</CardTitle>
            <CardDescription>
              Jobs that exhausted all retry attempts, newest first.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Failed</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
