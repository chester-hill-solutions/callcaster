import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Database } from "~/lib/database.types";

const ITEMS_PER_PAGE = 10;

type Transaction = Database["public"]["Tables"]["transaction_history"]["Row"];
type TransactionType = NonNullable<Transaction["type"]>;

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

    const workspaceId = params.workspaceId;
    
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    // Base query for transactions
    let transactionQuery = supabaseClient
        .from("transaction_history")
        .select("*", { count: "exact" })
        .eq("workspace", workspaceId)
        .order("created_at", { ascending: false });

    // Apply filters
    if (search) {
        transactionQuery = transactionQuery.ilike("note", `%${search}%`);
    }

    if (type) {
        transactionQuery = transactionQuery.eq("type", type as TransactionType);
    }

    if (startDate) {
        transactionQuery = transactionQuery.gte("created_at", startDate);
    }

    if (endDate) {
        transactionQuery = transactionQuery.lte("created_at", endDate);
    }

    // Apply pagination
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const result = await transactionQuery.range(from, to);
    const transactions = {
        data: result.data || [],
        count: result.count || 0
    };

    // Get workspace details
    const { data: workspace } = await supabaseClient
        .from("workspace")
        .select("*")
        .eq("id", workspaceId)
        .single();

    if (!workspace) {
        throw redirect("/admin?tab=workspaces");
    }

    return json({ 
        workspace,
        transactions: transactions.data,
        totalCount: transactions.count,
        currentPage: page,
        totalPages: Math.ceil(transactions.count / ITEMS_PER_PAGE),
        filters: {
            search,
            type,
            startDate,
            endDate
        }
    });
};

export default function WorkspaceTransactions() {
    const { workspace, transactions, totalCount, currentPage, totalPages, filters } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();

    const updateFilter = (key: string, value: string) => {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }
        newParams.set("page", "1"); // Reset to first page when filters change
        setSearchParams(newParams);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Financial transactions in this workspace</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4 space-y-4">
                    <div className="flex gap-4">
                        <Input
                            placeholder="Search by description..."
                            value={filters.search}
                            onChange={(e) => updateFilter("search", e.target.value)}
                            className="max-w-sm"
                        />
                        <Select
                            value={filters.type}
                            onValueChange={(value) => updateFilter("type", value)}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All Types</SelectItem>
                                <SelectItem value="CREDIT">Credit</SelectItem>
                                <SelectItem value="DEBIT">Debit</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => updateFilter("startDate", e.target.value)}
                            className="w-[180px]"
                        />
                        <Input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => updateFilter("endDate", e.target.value)}
                            className="w-[180px]"
                        />
                    </div>
                </div>

                {transactions.length > 0 ? (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Description</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((transaction) => (
                                    <TableRow key={transaction.id}>
                                        <TableCell>{new Date(transaction.created_at).toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant={
                                                    transaction.type === 'CREDIT' ? 'secondary' : 
                                                    transaction.type === 'DEBIT' ? 'destructive' : 
                                                    'outline'
                                                }
                                            >
                                                {transaction.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={transaction.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}>
                                            {transaction.type === 'CREDIT' ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}
                                        </TableCell>
                                        <TableCell>{(transaction as any).note || 'No description'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="mt-4 flex items-center justify-between">
                            <div className="text-sm text-gray-500">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} transactions
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateFilter("page", (currentPage - 1).toString())}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateFilter("page", (currentPage + 1).toString())}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="py-4 text-center text-gray-500">
                        No transactions found for this workspace
                    </div>
                )}
            </CardContent>
        </Card>
    );
} 