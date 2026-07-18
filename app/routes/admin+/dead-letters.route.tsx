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
import { AdminTableOverflow } from "@/components/admin/AdminTableOverflow";
import type { DeadLetteredJobRow } from "./admin.types";

type LoaderData = {
  jobs: DeadLetteredJobRow[];
};

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
                Jobs that exhausted all retry attempts, newest first.
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
            </AdminTableOverflow>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
