export { loader } from "./credits.loader.server";
export { action } from "./credits.action.server";

import { Form, useActionData, useLoaderData } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import type { AdminCreditsRecentTransaction } from "./credits.loader.server";

type LoaderData = {
  workspace: { id: string; name: string };
  balance: number;
  recentTransactions: AdminCreditsRecentTransaction[];
  nonce: string;
};

const MAX_CREDIT_LOAD = 100_000;

export default function WorkspaceCredits() {
  const { workspace, balance, recentTransactions, nonce } =
    useLoaderData<LoaderData>();
  const actionData = useActionData();

  useActionFeedback(actionData, {
    successMessage: "Credits loaded",
    errorMessage: "Manual credit load failed",
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manual credit load</CardTitle>
          <CardDescription>
            Add credits to {workspace.name} through the normal billing ledger.
            The grant shows in the workspace transaction history with your name
            and the reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="manual_credit_load" />
            <input type="hidden" name="nonce" value={nonce} />

            <FormField
              htmlFor="creditAmount"
              label="Amount"
              description={`Whole number between 1 and ${MAX_CREDIT_LOAD.toLocaleString()} credits.`}
            >
              <Input
                id="creditAmount"
                name="amount"
                type="number"
                min={1}
                max={MAX_CREDIT_LOAD}
                step={1}
                required
                placeholder="e.g. 500"
              />
            </FormField>

            <FormField
              htmlFor="creditReason"
              label="Reason"
              description="Shown in the workspace transaction history. e.g. goodwill grant, invoice payment."
            >
              <Textarea
                id="creditReason"
                name="reason"
                required
                placeholder="Why is this load being applied?"
              />
            </FormField>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Current balance</span>
                <p className="text-2xl font-bold">{balance.toLocaleString()} credits</p>
              </div>
              <Button type="submit">Load credits</Button>
            </div>
          </Form>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            Re-sending the same form cannot double-credit: each form render carries a
            one-time idempotency key.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>Last {recentTransactions.length} ledger entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">
              No transactions yet for this workspace.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      {new Date(tx.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell>
                      {tx.type === "CREDIT" ? "+" : ""}
                      {tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {tx.note ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}