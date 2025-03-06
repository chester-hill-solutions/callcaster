import { ActionFunctionArgs, LoaderFunctionArgs, redirect, json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const userId = params.userId;
    
    if (!userId) {
        throw redirect("/admin?tab=users");
    }

    // Get the user to edit
    const { data: targetUser } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", userId)
        .single();

    if (!targetUser) {
        throw redirect("/admin?tab=users");
    }

    return json({ 
        currentUser: userData,
        targetUser
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const userId = params.userId;
    
    if (!userId) {
        return json({ error: "User ID is required" });
    }

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "update_user") {
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;
        const username = formData.get("username") as string;
        const accessLevel = formData.get("accessLevel") as string;

        if (!username) {
            return json({ error: "Username is required" });
        }

        const { error } = await supabaseClient
            .from("user")
            .update({
                first_name: firstName || null,
                last_name: lastName || null,
                username,
                access_level: accessLevel || 'standard'
            })
            .eq("id", userId);
            
        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "User updated successfully" });
    }

    return json({ error: "Invalid action" });
};

export default function EditUser() {
    const { currentUser, targetUser } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();

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
            <Toaster position="top-right" />
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