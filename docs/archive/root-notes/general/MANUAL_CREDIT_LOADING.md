> ⛔ **DO NOT FOLLOW THESE INSTRUCTIONS — they will silently corrupt credit balances.**
> The `transaction_history_update_credits` trigger this procedure relies on was **dropped**
> (`client/migrations/20260704000005_drop_legacy_triggers.sql`, ADR-0006). A raw insert into
> `transaction_history` no longer updates `workspace.credits`, creating undetected
> ledger/balance drift. To adjust credits manually, use the
> `apply_ledger_entry_and_sync_credits` RPC (via `insertTransactionHistoryIdempotent` in
> `app/lib/transaction-history.server.ts`), which writes the ledger row and syncs the balance
> atomically.

# Manual Credit Loading Instructions (OBSOLETE)

## Overview

This document provides instructions on how to manually load or deduct credits from a workspace by directly inserting records into the `transaction_history` table.

## Important Notes

- This is an administrative procedure that should only be performed by authorized personnel.
- All transactions are automatically applied to the workspace's credit balance through a database trigger.
- Always include a descriptive note to maintain an audit trail of why the transaction was performed.

## Steps to Manually Load Credits

1. **Access the `transaction_history` table in your database management tool**

   - Connect to the Supabase database
   - Navigate to the `public.transaction_history` table

2. **Insert a new row with the following information:**

   - `workspace`: The UUID of the workspace to add/deduct credits from
   - `type`: Use `CREDIT` to load credits, `DEBIT` to deduct credits
   - `amount`:
     - For CREDIT: Enter a positive number (e.g., 100)
     - For DEBIT: Enter a negative number (e.g., -50)
   - `note`: Add a descriptive note explaining the reason for the transaction (e.g., "Manual credit adjustment - Customer service credit")

3. **Save the new record**
   - The database trigger `transaction_history_update_credits` will automatically update the workspace's credit balance

## Example SQL

```sql
-- To add 100 credits to a workspace
INSERT INTO public.transaction_history (workspace, type, amount, note)
VALUES
('workspace-uuid-here', 'CREDIT', 100, 'Manual credit adjustment - Promotional credits');

-- To deduct 50 credits from a workspace
INSERT INTO public.transaction_history (workspace, type, amount, note)
VALUES
('workspace-uuid-here', 'DEBIT', -50, 'Manual credit adjustment - Billing correction');
```

## Verification

After adding the transaction, you can verify the updated credit balance by:

1. Checking the workspace record in the `workspace` table
2. Viewing the transaction history in the admin dashboard under the workspace's billing section

## Support

If you have any questions about this process, please contact the system administrator.
