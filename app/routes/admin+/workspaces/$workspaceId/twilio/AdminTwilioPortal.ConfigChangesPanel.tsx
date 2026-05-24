import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { TwilioPageData } from "../loadTwilioData.server";

type ConfigChangesPanelProps = {
    auditTrail: TwilioPageData["portalSnapshot"]["config"]["auditTrail"];
};

export function ConfigChangesPanel({ auditTrail }: ConfigChangesPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Config Changes</CardTitle>
                <CardDescription>Lightweight audit trail stored with the Twilio portal settings.</CardDescription>
            </CardHeader>
            <CardContent>
                {auditTrail.length > 0 ? (
                    <div className="space-y-4">
                        {auditTrail.map((entry, index) => (
                            <div key={`${entry.changedAt}-${index}`} className="rounded-lg border p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="font-medium">{entry.summary}</div>
                                    <Badge variant="outline">{new Date(entry.changedAt).toLocaleString()}</Badge>
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {entry.actorUsername ?? entry.actorUserId ?? "Unknown operator"}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-4 text-center text-muted-foreground">
                        No portal changes have been recorded yet.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
