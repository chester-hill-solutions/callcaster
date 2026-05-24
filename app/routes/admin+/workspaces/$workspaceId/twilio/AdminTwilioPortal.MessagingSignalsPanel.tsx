import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
                <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Recent outbound</div>
                        <div className="mt-1 text-2xl font-semibold">{metrics.recentOutboundCount}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Messaging Service sends</div>
                        <div className="mt-1 text-2xl font-semibold">{metrics.messagingServiceCount}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Raw From sends</div>
                        <div className="mt-1 text-2xl font-semibold">{metrics.rawFromCount}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Number types</div>
                        <div className="mt-1 font-medium">{metrics.numberTypes.length ? metrics.numberTypes.join(", ") : "None detected"}</div>
                    </div>
                </div>

                <Alert>
                    <AlertTitle>What is auto-detected here?</AlertTitle>
                    <AlertDescription>
                        Sender type, number mix, recent send path usage, delivery status mix, and sync freshness are derived from Twilio/account data and local message history. The form above is where operators set workspace defaults and overrides.
                    </AlertDescription>
                </Alert>

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
            </CardContent>
        </Card>
    );
}
