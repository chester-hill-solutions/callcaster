import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminDefinitionGrid } from "@/components/admin/AdminDefinitionGrid";
import { AdminTableOverflow } from "@/components/admin/AdminTableOverflow";

import type { TwilioPageData } from "../loadTwilioData.server";

import { formatStatusLabel } from "./AdminTwilioPortal.utils";

type MessagingSignalsPanelProps = Pick<TwilioPageData["portalSnapshot"], "metrics">;

export function MessagingSignalsPanel({ metrics }: MessagingSignalsPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Observed Messaging Signals</CardTitle>
                <CardDescription>
                    Recent outbound SMS behavior from local message records and synced sender inventory.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <AdminDefinitionGrid
                    items={[
                        { term: "Recent outbound", value: metrics.recentOutboundCount },
                        { term: "Messaging Service sends", value: metrics.messagingServiceCount },
                        { term: "Raw From sends", value: metrics.rawFromCount },
                        {
                            term: "Number types",
                            value: metrics.numberTypes.length ? metrics.numberTypes.join(", ") : "None detected",
                        },
                    ]}
                />

                <AdminDefinitionGrid
                    items={[
                        {
                            term: "Legacy pipeline SMS",
                            value: `${metrics.legacyDispatcherSmsMps.toFixed(1)} MPS`,
                        },
                        {
                            term: "Configured dispatcher SMS",
                            value: `${metrics.configuredDispatcherSmsMps.toFixed(1)} MPS`,
                        },
                        {
                            term: "Twilio assumed SMS",
                            value: `${metrics.twilioAssumedSmsMps.toFixed(1)} MPS`,
                        },
                        {
                            term: "Effective SMS rate",
                            value: `${Math.min(metrics.configuredDispatcherSmsMps, metrics.twilioAssumedSmsMps).toFixed(1)} MPS`,
                        },
                    ]}
                />

                <AdminDefinitionGrid
                    items={[
                        {
                            term: "Legacy pipeline IVR",
                            value: `${metrics.legacyDispatcherVoiceCps.toFixed(1)} CPS`,
                        },
                        {
                            term: "Configured dispatcher IVR",
                            value: `${metrics.configuredDispatcherVoiceCps.toFixed(1)} CPS`,
                        },
                        { term: "IVR concurrency limit", value: metrics.voiceConcurrentCallLimit },
                        {
                            term: "Dispatch mode",
                            value: metrics.parallelDispatchEnabled ? "Parallel" : "Legacy",
                        },
                    ]}
                />

                <Alert>
                    <AlertTitle>What is auto-detected here?</AlertTitle>
                    <AlertDescription>
                        Sender type, number mix, recent send path usage, delivery status mix, and sync freshness are derived from Twilio/account data and local message history. The form above is where operators set workspace defaults and overrides.
                    </AlertDescription>
                </Alert>

                <AdminTableOverflow>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Count</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.entries(metrics.statusCounts).length > 0 ? (
                                Object.entries(metrics.statusCounts).map(([status, count]) => (
                                    <TableRow key={status}>
                                        <TableCell className="font-medium">{formatStatusLabel(status)}</TableCell>
                                        <TableCell className="text-right">{count}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                                        No recent outbound message records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </AdminTableOverflow>
            </CardContent>
        </Card>
    );
}
