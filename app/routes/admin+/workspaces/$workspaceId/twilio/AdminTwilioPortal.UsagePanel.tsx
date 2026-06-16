import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { groupTwilioUsageData } from "@/lib/twilio-usage";

import type { TwilioPageData } from "../loadTwilioData.server";

type UsagePanelProps = Pick<TwilioPageData, "twilioUsage">;

export function UsagePanel({ twilioUsage }: UsagePanelProps) {
    const { groupedUsage, totalPrice: totalUsageCost } = groupTwilioUsageData(twilioUsage);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Usage</CardTitle>
                <CardDescription>Usage statistics for the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
                {twilioUsage.length > 0 ? (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">Category</TableHead>
                                    <TableHead>Details</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(groupedUsage)
                                    .sort((a, b) => b[1].price - a[1].price)
                                    .map(([category, usage]) => (
                                        <TableRow key={category}>
                                            <TableCell className="font-medium">{category}</TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    {usage.details.map((detail, index) => (
                                                        <div key={`${detail.description}-${index}`} className="text-sm">
                                                            <span className="text-muted-foreground">{detail.description}: </span>
                                                            <span className="font-medium">
                                                                {detail.usage} {detail.usageUnit}
                                                            </span>
                                                            {parseFloat(detail.price) > 0 && (
                                                                <span className="ml-2 text-muted-foreground">
                                                                    (${parseFloat(detail.price).toFixed(2)})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                ${usage.price.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                <TableRow className="font-bold">
                                    <TableCell>Total</TableCell>
                                    <TableCell />
                                    <TableCell className="text-right">${totalUsageCost.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        <p className="mt-4 text-sm text-muted-foreground">
                            Usage data for the last 30 days.
                        </p>
                    </>
                ) : (
                    <div className="py-4 text-center text-muted-foreground">
                        No usage data available.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
