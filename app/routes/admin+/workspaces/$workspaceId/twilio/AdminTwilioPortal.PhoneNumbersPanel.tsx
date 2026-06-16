import { FileText, Image, MessageSquare, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { TwilioPageData } from "../loadTwilioData.server";

type PhoneNumbersPanelProps = Pick<TwilioPageData, "twilioNumbers">;

export function PhoneNumbersPanel({ twilioNumbers }: PhoneNumbersPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Phone Numbers</CardTitle>
                <CardDescription>Phone numbers associated with this Twilio subaccount.</CardDescription>
            </CardHeader>
            <CardContent>
                {twilioNumbers.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Phone Number</TableHead>
                                <TableHead>Friendly Name</TableHead>
                                <TableHead>Capabilities</TableHead>
                                <TableHead>Media</TableHead>
                                <TableHead>Region</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {twilioNumbers.map((number) => (
                                <TableRow key={number.sid}>
                                    <TableCell className="font-medium">{number.phoneNumber}</TableCell>
                                    <TableCell>{number.friendlyName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {number.capabilities.voice && (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3" />
                                                    Voice
                                                </Badge>
                                            )}
                                            {number.capabilities.sms && (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                    <MessageSquare className="h-3 w-3" />
                                                    SMS
                                                </Badge>
                                            )}
                                            {number.capabilities.mms && (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                    <Image className="h-3 w-3" />
                                                    MMS
                                                </Badge>
                                            )}
                                            {number.capabilities.fax && (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                    <FileText className="h-3 w-3" />
                                                    Fax
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {number.voiceReceiveMode && (
                                                <Badge variant="secondary" className="text-xs">
                                                    Voice: {number.voiceReceiveMode}
                                                </Badge>
                                            )}
                                            {number.smsApplicationSid && (
                                                <Badge variant="secondary" className="text-xs">
                                                    SMS App Configured
                                                </Badge>
                                            )}
                                            {number.voiceApplicationSid && (
                                                <Badge variant="secondary" className="text-xs">
                                                    Voice App Configured
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{number.addressRequirements || "No address requirements"}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={number.status === "in-use" ? "secondary" : "outline"}>
                                            {number.status || "Active"}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="py-4 text-center text-muted-foreground">
                        No phone numbers found for this account.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
