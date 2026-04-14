-- Add dequeued_by, dequeued_at, and dequeued_reason fields to campaign_queue table
ALTER TABLE public.campaign_queue 
ADD COLUMN dequeued_by UUID NULL,
ADD COLUMN dequeued_at TIMESTAMPTZ NULL,
ADD COLUMN dequeued_reason TEXT NULL;

-- Add foreign key constraint for dequeued_by to reference user.id
ALTER TABLE public.campaign_queue
ADD CONSTRAINT campaign_queue_dequeued_by_fkey
FOREIGN KEY (dequeued_by)
REFERENCES public.user(id);

-- Create an index on dequeued_at for better query performance
CREATE INDEX idx_campaign_queue_dequeued_at ON public.campaign_queue(dequeued_at);

-- Update the dequeue_contact function to set the new fields
CREATE OR REPLACE FUNCTION public.dequeue_contact(passed_contact_id integer, group_on_household boolean, dequeued_by_id uuid DEFAULT NULL, dequeued_reason_text text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update the campaign_queue record with the new fields
  UPDATE public.campaign_queue
  SET status = 'dequeued',
      dequeued_by = dequeued_by_id,
      dequeued_at = NOW(),
      dequeued_reason = dequeued_reason_text
  WHERE contact_id = passed_contact_id;
  
  -- If group_on_household is true, dequeue all contacts with the same address_id
  IF group_on_household THEN
    UPDATE public.campaign_queue cq
    SET status = 'dequeued',
        dequeued_by = dequeued_by_id,
        dequeued_at = NOW(),
        dequeued_reason = dequeued_reason_text
    FROM public.contact c1
    JOIN public.contact c2 ON c1.address_id = c2.address_id AND c1.address_id IS NOT NULL
    WHERE c1.id = passed_contact_id
    AND cq.contact_id = c2.id
    AND cq.status = 'queued';
  END IF;
END;
$function$;

-- Update the dequeue_household function to set the new fields
CREATE OR REPLACE FUNCTION public.dequeue_household(contact_id_variable integer, dequeued_by_id uuid DEFAULT NULL, dequeued_reason_text text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.campaign_queue cq
  SET status = 'dequeued',
      dequeued_by = dequeued_by_id,
      dequeued_at = NOW(),
      dequeued_reason = dequeued_reason_text
  FROM public.contact c1
  JOIN public.contact c2 ON c1.address_id = c2.address_id AND c1.address_id IS NOT NULL
  WHERE c1.id = contact_id_variable
  AND cq.contact_id = c2.id
  AND cq.status = 'queued';
END;
$function$;

-- Create or replace the get_campaign_queue function to handle opted-out contacts
CREATE OR REPLACE FUNCTION public.get_campaign_queue(campaign_id_pro integer)
 RETURNS TABLE(id integer, contact_id integer, phone text, workspace text, caller_id text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- First, automatically dequeue any opted-out contacts
  UPDATE public.campaign_queue
  SET status = 'dequeued',
      dequeued_at = NOW(),
      dequeued_reason = 'Contact opted out'
  FROM public.contact
  WHERE campaign_queue.contact_id = contact.id
  AND campaign_queue.campaign_id = campaign_id_pro
  AND campaign_queue.status = 'queued'
  AND contact.opt_out = true;

  -- Then return the remaining valid contacts
  RETURN QUERY
  SELECT DISTINCT ON (contact.phone)
      campaign_queue.id,
      contact.id AS contact_id,
      contact.phone,
      contact.workspace,
      campaign.caller_id
  FROM 
      campaign_queue
      JOIN contact ON campaign_queue.contact_id = contact.id
      JOIN campaign ON campaign_queue.campaign_id = campaign.id
  WHERE 
      campaign_queue.campaign_id = campaign_id_pro
      AND campaign_queue.status = 'queued'
      AND contact.phone IS NOT NULL
      AND contact.phone != ''
      AND (contact.opt_out IS NULL OR contact.opt_out = false)
  ORDER BY 
      contact.phone, campaign_queue.id
  LIMIT 5;
END;
$function$; 