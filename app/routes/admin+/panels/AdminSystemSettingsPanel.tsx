import { Form, Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import type { DeadLetteredJobRow, VerificationNumberRow } from "../admin.types";

export function AdminSystemSettingsPanel({
    deadLetteredJobs = [],
    verificationNumbers = [],
}: {
    deadLetteredJobs?: DeadLetteredJobRow[];
    verificationNumbers?: VerificationNumberRow[];
}) {
    const activeNumber = verificationNumbers.find((row) => row.isActive) ?? null;

    return (
        <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Call-In Verification Numbers</CardTitle>
                        <CardDescription>
                            The number an agent dials to verify a handset. One number is active at a
                            time; register several here for later region and bandwidth growth.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {verificationNumbers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No verification number is registered. Call-in verification returns a
                                feature-unavailable response until one is registered and active.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {verificationNumbers.map((row) => (
                                    <div
                                        key={row.phoneNumber}
                                        className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{row.phoneNumber}</span>
                                                {row.isActive ? (
                                                    <Badge variant="outline">Active</Badge>
                                                ) : (
                                                    <Badge variant="outline">Inactive</Badge>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {[row.label, row.region].filter(Boolean).join(" · ") ||
                                                    "No label or region recorded"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {row.isActive ? null : (
                                                <Form method="post">
                                                    <input type="hidden" name="_action" value="activate_verification_number" />
                                                    <input type="hidden" name="phoneNumber" value={row.phoneNumber} />
                                                    <Button type="submit" size="sm" variant="outline">
                                                        Set active
                                                    </Button>
                                                </Form>
                                            )}
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="remove_verification_number" />
                                                <input type="hidden" name="phoneNumber" value={row.phoneNumber} />
                                                <Button type="submit" size="sm" variant="destructive">
                                                    Remove
                                                </Button>
                                            </Form>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Form method="post" className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
                            <input type="hidden" name="_action" value="register_verification_number" />
                            <FormField htmlFor="admin-verification-number" label="Phone number (E.164)">
                                <FormFieldControl>
                                    <Input
                                        id="admin-verification-number"
                                        name="phoneNumber"
                                        placeholder="+15551234567"
                                        required
                                        className="max-w-xs"
                                    />
                                </FormFieldControl>
                            </FormField>
                            <FormField htmlFor="admin-verification-label" label="Label">
                                <FormFieldControl>
                                    <Input id="admin-verification-label" name="label" placeholder="Main" className="max-w-xs" />
                                </FormFieldControl>
                            </FormField>
                            <FormField htmlFor="admin-verification-region" label="Region">
                                <FormFieldControl>
                                    <Input id="admin-verification-region" name="region" placeholder="ca-central" className="max-w-xs" />
                                </FormFieldControl>
                            </FormField>
                            <Button type="submit">Register</Button>
                        </Form>
                        {activeNumber === null && verificationNumbers.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No number is active. Call-in verification stays unavailable until you set one active.
                            </p>
                        ) : null}
                    </CardContent>
                </Card>

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
            </div>
        </TabsContent>
    );
}
