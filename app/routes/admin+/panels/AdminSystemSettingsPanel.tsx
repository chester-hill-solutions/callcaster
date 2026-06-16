import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";

export function AdminSystemSettingsPanel() {
    return (
        <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>System Settings</CardTitle>
                        <CardDescription>Configure global system settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium">Default Credits for New Workspaces</h3>
                            <div className="flex items-center gap-2">
                                <Input type="number" defaultValue="100" className="max-w-xs" />
                                <Button>Save</Button>
                            </div>
                        </div>

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
