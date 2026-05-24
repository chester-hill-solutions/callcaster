export { loader } from "./edit.loader.server";
export { action } from "./edit.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect, useLoaderData, useActionData, Form, Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import { toast } from "sonner";





export default function EditUser() {
    const { currentUser, targetUser } = useLoaderData();
    const actionData = useActionData();

    useEffect(() => {
        if (actionData && 'success' in actionData) {
            toast.success(actionData.success);
        }
        
        if (actionData && 'error' in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Edit User</h1>
                    <p className="text-gray-500">Update user details</p>
                </div>
                <Button variant="outline" asChild>
                    <Link to="/admin?tab=users">Back to Users</Link>
                </Button>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Edit User: {targetUser.username}</CardTitle>
                    <CardDescription>
                        Update user information and access level
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form method="post" className="space-y-6">
                        <input type="hidden" name="_action" value="update_user" />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">First Name</Label>
                                <Input 
                                    id="firstName" 
                                    name="firstName" 
                                    defaultValue={targetUser.first_name || ''} 
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Last Name</Label>
                                <Input 
                                    id="lastName" 
                                    name="lastName" 
                                    defaultValue={targetUser.last_name || ''} 
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input 
                                id="username" 
                                name="username" 
                                defaultValue={targetUser.username} 
                                required 
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="accessLevel">Access Level</Label>
                            <Select name="accessLevel" defaultValue={targetUser.access_level || 'standard'}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select access level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="standard">Standard</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    {currentUser.access_level === 'sudo' && (
                                        <SelectItem value="sudo">Sudo</SelectItem>
                                    )}
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" asChild>
                                <Link to="/admin?tab=users">Cancel</Link>
                            </Button>
                            <Button type="submit">Save Changes</Button>
                        </div>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
