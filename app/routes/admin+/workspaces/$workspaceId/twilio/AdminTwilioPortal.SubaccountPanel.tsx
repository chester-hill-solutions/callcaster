import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { TwilioPageData } from "../loadTwilioData.server";

type SubaccountPanelProps = Pick<TwilioPageData, "twilioAccountInfo">;

export function SubaccountPanel({ twilioAccountInfo }: SubaccountPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Twilio Subaccount Information</CardTitle>
                <CardDescription>Details about the Twilio subaccount for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
                {twilioAccountInfo ? (
                    <dl className="space-y-4">
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Account SID</dt>
                            <dd className="mt-1 font-mono text-sm">{twilioAccountInfo.sid}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Friendly Name</dt>
                            <dd className="mt-1 text-sm">{twilioAccountInfo.friendlyName}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                            <dd className="mt-1 text-sm">
                                <Badge variant={twilioAccountInfo.status === "active" ? "secondary" : "outline"}>
                                    {twilioAccountInfo.status}
                                </Badge>
                            </dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Type</dt>
                            <dd className="mt-1 text-sm">{twilioAccountInfo.type}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                            <dd className="mt-1 text-sm">{new Date(twilioAccountInfo.dateCreated).toLocaleString()}</dd>
                        </div>
                    </dl>
                ) : (
                    <div className="py-4 text-center text-muted-foreground">
                        Unable to fetch Twilio account information.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
