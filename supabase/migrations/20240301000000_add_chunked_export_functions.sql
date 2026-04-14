-- Set a longer statement timeout for these functions
ALTER DATABASE CURRENT SET statement_timeout = '60s';

-- Function to count total messages for a campaign
CREATE OR REPLACE FUNCTION public.get_campaign_messages_count(
    prop_campaign_id INTEGER,
    prop_workspace_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    total_count INTEGER;
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    -- Get campaign dates once to avoid repeated lookups
    WITH campaign_info AS (
        SELECT 
            id, 
            start_date, 
            end_date + INTERVAL '5 days' AS extended_end_date
        FROM public.campaign 
        WHERE id = prop_campaign_id
        LIMIT 1
    ),
    -- Get relevant contacts from campaign queue first (much smaller subset)
    campaign_contacts AS (
        SELECT DISTINCT
            REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS clean_phone,
            SUBSTR(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 2) AS clean_phone_no_country,
            CONCAT('1', REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS clean_phone_with_country
        FROM public.contact c
        JOIN public.campaign_queue cq ON c.id = cq.contact_id AND cq.campaign_id = prop_campaign_id
        WHERE c.workspace = prop_workspace_id
    ),
    -- Count matching messages
    message_count AS (
        SELECT 
            COUNT(*) as total
        FROM public.message m
        JOIN campaign_info ci ON 1=1
        WHERE 
            m.workspace = prop_workspace_id
            AND m.date_created >= ci.start_date
            AND m.date_created <= ci.extended_end_date
            AND EXISTS (
                SELECT 1 
                FROM campaign_contacts cc 
                WHERE 
                    cc.clean_phone = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
                    OR cc.clean_phone_no_country = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone_no_country = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
                    OR cc.clean_phone_with_country = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone_with_country = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
            )
    )
    SELECT total INTO total_count FROM message_count;
    
    RETURN COALESCE(total_count, 0);
END;
$$;

-- Function to get messages in chunks
CREATE OR REPLACE FUNCTION public.get_campaign_messages_chunk(
    prop_campaign_id INTEGER,
    prop_workspace_id UUID,
    prop_limit INTEGER,
    prop_offset INTEGER
)
RETURNS TABLE (
    body TEXT,
    direction TEXT,
    status TEXT,
    message_date TIMESTAMPTZ,
    id TEXT,
    firstname TEXT,
    surname TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    opt_out BOOLEAN,
    created_at TIMESTAMPTZ,
    workspace TEXT,
    external_id TEXT,
    address_id TEXT,
    postal TEXT,
    other_data JSONB,
    date_updated TIMESTAMPTZ,
    carrier TEXT,
    province TEXT,
    country TEXT,
    created_by TEXT,
    contact_phone TEXT,
    campaign_name TEXT,
    campaign_start_date TIMESTAMPTZ,
    campaign_end_date TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    RETURN QUERY
    WITH campaign_info AS (
        SELECT 
            id, 
            title, 
            start_date, 
            end_date + INTERVAL '5 days' AS extended_end_date,
            end_date
        FROM public.campaign 
        WHERE id = prop_campaign_id
        LIMIT 1
    ),
    -- Get relevant contacts from campaign queue first (much smaller subset)
    campaign_contacts AS (
        SELECT 
            c.*,
            REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS clean_phone,
            SUBSTR(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 2) AS clean_phone_no_country,
            CONCAT('1', REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS clean_phone_with_country
        FROM public.contact c
        JOIN public.campaign_queue cq ON c.id = cq.contact_id AND cq.campaign_id = prop_campaign_id
        WHERE c.workspace = prop_workspace_id
    ),
    -- Get messages with phone number patterns
    messages_with_phones AS (
        SELECT 
            m.*,
            REGEXP_REPLACE(m."from", '[^0-9]', '', 'g') AS clean_from,
            REGEXP_REPLACE(m."to", '[^0-9]', '', 'g') AS clean_to,
            COALESCE(m.date_sent, m.date_created) as message_date
        FROM public.message m, campaign_info ci
        WHERE 
            m.workspace = prop_workspace_id
            AND m.date_created >= ci.start_date
            AND m.date_created <= ci.extended_end_date
        ORDER BY COALESCE(m.date_sent, m.date_created) ASC
        LIMIT prop_limit OFFSET prop_offset
    )
    SELECT 
        m.body,
        m.direction,
        m.status,
        m.message_date,
        cc.id::TEXT,
        cc.firstname,
        cc.surname,
        cc.phone,
        cc.email,
        cc.address,
        cc.city,
        cc.opt_out,
        cc.created_at,
        cc.workspace::TEXT,
        cc.external_id,
        cc.address_id::text,
        cc.postal,
        cc.other_data,
        cc.date_updated,
        cc.carrier,
        cc.province,
        cc.country,
        cc.created_by,
        cc.clean_phone as contact_phone,
        ci.title as campaign_name,
        ci.start_date as campaign_start_date,
        ci.end_date as campaign_end_date
    FROM messages_with_phones m
    JOIN campaign_info ci ON 1=1
    JOIN campaign_contacts cc ON (
        cc.clean_phone = m.clean_from
        OR cc.clean_phone = m.clean_to
        OR cc.clean_phone_no_country = m.clean_from
        OR cc.clean_phone_no_country = m.clean_to
        OR cc.clean_phone_with_country = m.clean_from
        OR cc.clean_phone_with_country = m.clean_to
    )
    ORDER BY m.message_date ASC
    LIMIT prop_limit;
END;
$$;

-- Function to count total call attempts for a campaign
CREATE OR REPLACE FUNCTION public.get_campaign_attempts_count(
    p_campaign_id INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    total_count INTEGER;
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    SELECT 
        COUNT(*)
    INTO total_count
    FROM public.outreach_attempt oa
    WHERE oa.campaign_id = p_campaign_id;
    
    RETURN COALESCE(total_count, 0);
END;
$$;

-- Function to get call attempts in chunks
CREATE OR REPLACE FUNCTION public.get_campaign_attempts_chunk(
    p_campaign_id INTEGER,
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS TABLE (
    attempt_id TEXT,
    disposition TEXT,
    attempt_result TEXT,
    attempt_start TIMESTAMPTZ,
    call_sid TEXT,
    duration_seconds BIGINT,
    answered_by TEXT,
    call_start TIMESTAMPTZ,
    call_end TIMESTAMPTZ,
    contact_id TEXT,
    firstname TEXT,
    surname TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    opt_out BOOLEAN,
    created_at TIMESTAMPTZ,
    workspace TEXT,
    postal TEXT,
    other_data JSONB,
    province TEXT,
    country TEXT,
    campaign_name TEXT,
    campaign_start_date TIMESTAMPTZ,
    campaign_end_date TIMESTAMPTZ,
    campaign_type TEXT,
    campaign_status TEXT,
    credits_used BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    RETURN QUERY
    WITH limited_attempts AS (
        SELECT oa.*
        FROM public.outreach_attempt oa
        WHERE oa.campaign_id = p_campaign_id
        ORDER BY oa.created_at ASC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT 
        la.id::TEXT as attempt_id,
        COALESCE(la.disposition, c.status::text) as disposition,
        la.result as attempt_result,
        la.created_at as attempt_start,
        c.sid as call_sid,
        COALESCE(NULLIF(c.duration, '')::bigint, 0) as duration_seconds,
        c.answered_by::text,
        COALESCE(c.start_time, c.date_created)::timestamptz as call_start,
        COALESCE(c.end_time, c.date_updated)::timestamptz as call_end,
        con.id::TEXT as contact_id,
        con.firstname,
        con.surname,
        con.phone,
        con.email,
        con.address,
        con.city,
        con.opt_out,
        con.created_at,
        con.workspace::TEXT,
        con.postal,
        con.other_data,
        con.province,
        con.country,
        camp.title as campaign_name,
        camp.start_date as campaign_start_date,
        camp.end_date as campaign_end_date,
        camp.type::text as campaign_type,
        camp.status::text as campaign_status,
        GREATEST(1, CEIL(COALESCE(NULLIF(c.duration, '')::numeric, 0) / 60))::bigint as credits_used
    FROM limited_attempts la
    JOIN contact con ON con.id = la.contact_id
    JOIN campaign camp ON camp.id = la.campaign_id
    LEFT JOIN public.call c ON c.outreach_attempt_id = la.id
    ORDER BY attempt_start ASC;
END;
$$; 