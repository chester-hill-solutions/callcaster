import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Link } from "react-router";
import type { DeadLetteredJobRow } from "../admin.types";

export function AdminSystemSettingsPanel({
    deadLetteredJobs = [],
}: {
    deadLetteredJobs?: DeadLetteredJobRow[];
}) {
    return (
        <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Dead-Lettered Jobs</CardTitle>
                        <CardDescription>
                            Background jobs that exhausted their retries. Read-only — most recent {deadLetteredJobs.length} shown.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline" size="sm" asChild>
                            <Link to="/admin/dead-letters">View all dead-letter jobs</Link>
                        </Button>
                        {deadLetteredJobs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No dead-lettered jobs.</p>
                        ) : (
                            <div className="space-y-3">
                                {deadLetteredJobs.map((job) => (
                                    <div
                                        key={job.id}
                                        className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="destructive">{job.type}</Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    job #{job.id}
                                                    {job.workspace_id ? ` · workspace ${job.workspace_id}` : ""}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {job.failed_at ? new Date(job.failed_at).toLocaleString() : "unknown time"}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            attempts {job.attempt_count ?? "?"}/{job.max_attempts ?? "?"} — {job.dead_letter_reason ?? job.error_message ?? "no reason recorded"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>System Settings</CardTitle>
                        <CardDescription>Configure global system settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField htmlFor="admin-default-credits" label="Default Credits for New Workspaces">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <FormFieldControl>
                                    <Input id="admin-default-credits" type="number" defaultValue="100" className="max-w-xs" />
                                </FormFieldControl>
                                <Button>Save</Button>
                            </div>
                        </FormField>

                        <div className="space-y-2">
                            <h3 className="text-sm font-medium">System Maintenance Mode</h3>
                            <div className="flex items-center gap-2">
                                <Button variant="outline">Enable Maintenance Mode</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Audit Log</CardTitle>
                        <CardDescription>Recent system activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-start gap-4 text-sm">
                                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5"></div>
                                    <div>
                                        <p className="font-medium">System update completed</p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(Date.now() - i * 3600000).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
    );
}
