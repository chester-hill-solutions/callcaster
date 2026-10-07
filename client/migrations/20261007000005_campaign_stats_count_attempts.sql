-- Call legs share an outreach attempt. Count and wait time must weight each attempt once.
CREATE OR REPLACE FUNCTION public.get_campaign_stats(campaign_id_param integer)
 RETURNS TABLE(disposition text, count bigint, average_call_duration interval, average_wait_time interval, expected_total numeric)
 LANGUAGE plpgsql
AS $function$DECLARE
    campaign_type TEXT;
    dial_ratio NUMERIC;
    queue_count INTEGER;
BEGIN
    -- Fetch campaign info once
    SELECT cm.type, cm.dial_ratio, COUNT(cq.id)
    INTO campaign_type, dial_ratio, queue_count
    FROM campaign cm
    LEFT JOIN campaign_queue cq ON cm.id = cq.campaign_id
    WHERE cm.id = campaign_id_param
    GROUP BY cm.id, cm.type, cm.dial_ratio;

    -- Handle case where campaign doesn't exist
    IF campaign_type IS NULL THEN
        RETURN;
    END IF;

    IF campaign_type = 'message' THEN
        RETURN QUERY
        SELECT
            COALESCE(m.status::text, 'Unknown') as disposition,
            COUNT(*) as count,
            interval '0 seconds' as average_call_duration,
            interval '0 seconds' as average_wait_time,
            (queue_count * dial_ratio)::numeric AS expected_total
        FROM message m
        WHERE m.campaign_id = campaign_id_param
          AND m.status IS NOT NULL
        GROUP BY m.status
        ORDER BY count DESC;
    ELSE
        RETURN QUERY
        WITH valid_durations AS (
            SELECT
                oa.disposition,
                c.duration::numeric as duration_seconds
            FROM outreach_attempt oa
            LEFT JOIN call c ON oa.id = c.outreach_attempt_id
            WHERE oa.campaign_id = campaign_id_param
                AND oa.disposition IS NOT NULL
                AND oa.disposition != ''
                AND c.duration IS NOT NULL
                AND c.duration != ''
                AND c.duration != '0'
                AND c.duration ~ '^[0-9]+$'
        )
        SELECT
            COALESCE(oa.disposition, 'Unknown') as disposition,
            COUNT(*) as count,
            COALESCE(
                make_interval(
                    secs => (
                        SELECT AVG(duration_seconds)
                        FROM valid_durations vd
                        WHERE vd.disposition = oa.disposition
                    )
                ),
                interval '0 seconds'
            ) as average_call_duration,
            COALESCE(
                AVG(
                    CASE
                        WHEN oa.answered_at IS NOT NULL AND oa.created_at IS NOT NULL AND oa.answered_at > oa.created_at
                        THEN oa.answered_at - oa.created_at
                        ELSE NULL::interval
                    END
                ),
                interval '0 seconds'
            ) as average_wait_time,
            (queue_count * dial_ratio)::numeric AS expected_total
        FROM outreach_attempt oa
        WHERE oa.campaign_id = campaign_id_param
          AND oa.disposition IS NOT NULL
          AND oa.disposition != ''
        GROUP BY oa.disposition
        ORDER BY count DESC;
    END IF;
END;$function$
;
