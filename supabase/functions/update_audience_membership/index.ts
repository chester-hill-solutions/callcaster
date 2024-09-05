import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const BATCH_SIZE = 1000;

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
};

interface Condition {
  field: string;
  operator: string;
  value: any;
}

interface Rule {
  conditions: Condition[];
  logic: "AND" | "OR";
}

const evaluateCondition = (contact: any, condition: Condition): boolean => {
  const { field, operator, value } = condition;
  const contactValue = contact[field];

  switch (operator) {
    case "equals":
      return contactValue === value;
    case "notEquals":
      return contactValue !== value;
    case "contains":
      return String(contactValue)
        .toLowerCase()
        .includes(String(value).toLowerCase());
    case "notContains":
      return !String(contactValue)
        .toLowerCase()
        .includes(String(value).toLowerCase());
    case "startsWith":
      return String(contactValue)
        .toLowerCase()
        .startsWith(String(value).toLowerCase());
    case "endsWith":
      return String(contactValue)
        .toLowerCase()
        .endsWith(String(value).toLowerCase());
    case "greaterThan":
      return contactValue > value;
    case "lessThan":
      return contactValue < value;
    case "greaterThanOrEqual":
      return contactValue >= value;
    case "lessThanOrEqual":
      return contactValue <= value;
    case "in":
      return Array.isArray(value) && value.includes(contactValue);
    case "notIn":
      return Array.isArray(value) && !value.includes(contactValue);
    case "exists":
      return contactValue !== undefined && contactValue !== null;
    case "notExists":
      return contactValue === undefined || contactValue === null;
    case "regex":
      try {
        const regex = new RegExp(value, "i");
        return regex.test(String(contactValue));
      } catch (e) {
        console.error("Invalid regex:", value);
        return false;
      }
    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
};

const evaluateRule = (contact: any, rule: Rule): boolean => {
  const { conditions, logic } = rule;

  if (logic === "AND") {
    return conditions.every((condition) =>
      evaluateCondition(contact, condition),
    );
  } else if (logic === "OR") {
    return conditions.some((condition) =>
      evaluateCondition(contact, condition),
    );
  } else {
    console.warn(`Unknown logic operator: ${logic}`);
    return false;
  }
};
const batchUpsert = async (supabase, table, rows, uniqueKeys) => {
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: uniqueKeys.join(",") })
    .select();
  if (error) throw error;
  return data;
};

const batchDelete = async (supabase, table, conditions) => {
  const { data, error } = await supabase.from(table).delete().match(conditions);
  if (error) throw error;
  return data;
};

const handleAudienceRulesChange = async (supabase, operation, changedRule) => {
  console.log(`Starting handleAudienceRulesChange for audience ${changedRule.audience_id}, operation: ${operation}`);
  
  const startTime = Date.now();
  const { data: audience, error: audienceError } = await supabase
    .from("audience")
    .select("is_conditional")
    .eq("id", changedRule.audience_id)
    .single();

  console.log(`Fetched audience info in ${Date.now() - startTime}ms`);

  if (audienceError) throw audienceError;
  if (!audience.is_conditional) {
    console.log(`Audience ${changedRule.audience_id} is not conditional. Skipping rule processing.`);
    return;
  }

  const rulesFetchStart = Date.now();
  const { data: allRules, error: rulesError } = await supabase
    .from("audience_rule")
    .select("*")
    .eq("audience_id", changedRule.audience_id);

  console.log(`Fetched ${allRules?.length || 0} rules in ${Date.now() - rulesFetchStart}ms`);

  if (rulesError) throw rulesError;

  if (operation === "DELETE" && allRules.length === 0) {
    console.log(`Deleting all contacts for audience ${changedRule.audience_id}`);
    await batchDelete(supabase, "contact_audience", { audience_id: changedRule.audience_id });
    return;
  }

  let hasMore = true;
  let lastId = 0;
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  while (hasMore) {
    const batchStartTime = Date.now();
    const { data: contacts, error } = await supabase
      .from("contact")
      .select("*")
      .order('id')
      .gt('id', lastId)
      .limit(BATCH_SIZE);

    console.log(`Fetched ${contacts?.length || 0} contacts in ${Date.now() - batchStartTime}ms`);

    if (error) throw error;

    const toAdd = [];
    const toRemove = [];

    const processingStartTime = Date.now();
    for (const contact of contacts) {
      let shouldBeInAudience = false;
      for (const rule of allRules) {
        if (evaluateRule(contact, rule)) {
          shouldBeInAudience = true;
          break;
        }
      }

      if (shouldBeInAudience) {
        toAdd.push({ contact_id: contact.id, audience_id: changedRule.audience_id });
      } else {
        toRemove.push({ contact_id: contact.id, audience_id: changedRule.audience_id });
      }

      lastId = contact.id;
    }
    console.log(`Processed ${contacts.length} contacts in ${Date.now() - processingStartTime}ms`);

    if (toAdd.length > 0) {
      const addStartTime = Date.now();
      await batchUpsert(supabase, "contact_audience", toAdd, ['contact_id', 'audience_id']);
      console.log(`Added ${toAdd.length} contacts to audience in ${Date.now() - addStartTime}ms`);
      totalAdded += toAdd.length;
    }
    if (toRemove.length > 0) {
      const removeStartTime = Date.now();
      await batchDelete(supabase, "contact_audience", toRemove);
      console.log(`Removed ${toRemove.length} contacts from audience in ${Date.now() - removeStartTime}ms`);
      totalRemoved += toRemove.length;
    }

    totalProcessed += contacts.length;
    hasMore = contacts.length === BATCH_SIZE;
    console.log(`Batch completed in ${Date.now() - batchStartTime}ms. Total processed: ${totalProcessed}`);
  }

  console.log(`handleAudienceRulesChange completed in ${Date.now() - startTime}ms. Total processed: ${totalProcessed}, Added: ${totalAdded}, Removed: ${totalRemoved}`);
};



const handleContactChange = async (supabase, operation, contact) => {
  if (operation === "DELETE") {
    await batchDelete(supabase, "contact_audience", { contact_id: contact.id });
    return;
  }

  const { data: audiences, error: audiencesError } = await supabase
    .from("audience")
    .select(`
      id, 
      is_conditional,
      audience_rule (*)
    `)
    .eq("is_conditional", true);

  if (audiencesError) throw audiencesError;

  const audiencesToAdd = [];
  const audiencesToRemove = [];

  for (const audience of audiences) {
    if (!audience.is_conditional) continue;

    let shouldBeInAudience = false;

    for (const rule of audience.audience_rule) {
      const matches = evaluateRule(contact, rule);
      if (matches) {
        shouldBeInAudience = true;
        break;
      }
    }

    if (shouldBeInAudience) {
      audiencesToAdd.push({ contact_id: contact.id, audience_id: audience.id });
    } else {
      audiencesToRemove.push({ contact_id: contact.id, audience_id: audience.id });
    }
  }

  if (audiencesToAdd.length > 0) {
    await batchUpsert(supabase, "contact_audience", audiencesToAdd, ['contact_id', 'audience_id']);
  }
  if (audiencesToRemove.length > 0) {
    await batchDelete(supabase, "contact_audience", audiencesToRemove);
  }
};

const handleEvent = async (source, type, record, old_record) => {
  const supabase = initSupabaseClient();

  try {
    if (source === "audience_rule") {
      await handleAudienceRulesChange(
        supabase,
        type,
        type === "DELETE" ? old_record : record,
      );
    } else if (source === "contact") {
      await handleContactChange(
        supabase,
        type,
        type === "DELETE" ? old_record : record,
      );
    }
  } catch (error) {
    console.error("Error in handleEvent:", error);
    throw error;
  }
};

Deno.serve(async (req) => {
  try {
    const { source, type, record, old_record } = await req.json();
    console.log(
      "Initiating audience membership update:",
      source,
      type,
      record,
      old_record,
    );
    await handleEvent(source, type, record, old_record);

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Server error:", error);
    return new Response(
      JSON.stringify({ error: error.message, status: "error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
