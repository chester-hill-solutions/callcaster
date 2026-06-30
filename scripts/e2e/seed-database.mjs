#!/usr/bin/env node
/* eslint-env node */
import "dotenv/config";
import {
  ALL_DAY_SCHEDULE,
  API_KEY,
  AUDIENCE_ID,
  CAMPAIGNS,
  CONTACT_IDS,
  E2E_PASSWORD,
  hashApiKey,
  readyTwilioData,
  SCRIPT_IDS,
  SEED_VERSION,
  SURVEY,
  USERS,
  WORKSPACE_NUMBER_ID,
  WORKSPACES,
  WORKSPACE_PERMISSIONS,
  CALLER_PERMISSIONS,
  MEMBER_PERMISSIONS,
} from "./seed-data.mjs";

function requireEnv(name, fallbackName) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""} for E2E seed`);
  }
  return value;
}

function campaignBase(id, workspaceId, title, type, extra = {}) {
  const now = new Date();
  const start = new Date(now.getTime() - 86_400_000).toISOString();
  const end = new Date(now.getTime() + 86_400_000 * 30).toISOString();
  return {
    id,
    title,
    type,
    workspace: workspaceId,
    status: extra.status ?? "draft",
    is_active: extra.is_active ?? false,
    caller_id: "+15555501001",
    start_date: start,
    end_date: end,
    schedule: ALL_DAY_SCHEDULE,
    dial_type: extra.dial_type ?? "call",
    dial_ratio: 1,
    group_household_queue: false,
    next_queue_order: 1,
    sms_send_mode: extra.sms_send_mode ?? null,
  };
}

async function ensureAuthUser(admin, user) {
  const { data: existing } = await admin.auth.admin.getUserById(user.id);
  if (existing?.user) {
    await admin.auth.admin.updateUserById(user.id, {
      email: user.email,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: user.first, last_name: user.last },
    });
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: user.first, last_name: user.last },
  });
  if (error) {
    throw new Error(`Failed to create auth user ${user.email}: ${error.message}`);
  }
}

async function upsertUserProfile(db, user, accessLevel = null) {
  const { error } = await db.from("user").upsert({
    id: user.id,
    username: user.email,
    first_name: user.first,
    last_name: user.last,
    access_level: accessLevel,
  });
  if (error) {
    throw new Error(`Failed to upsert user profile ${user.email}: ${error.message}`);
  }
}

async function seedWorkspacePermissions(db) {
  const rows = [];
  for (const permission of WORKSPACE_PERMISSIONS) {
    rows.push({ role: "owner", permission });
    rows.push({ role: "admin", permission });
  }
  for (const permission of MEMBER_PERMISSIONS) {
    rows.push({ role: "member", permission });
  }
  for (const permission of CALLER_PERMISSIONS) {
    rows.push({ role: "caller", permission });
  }
  const { error } = await db.from("workspace_permissions").upsert(rows, {
    onConflict: "role,permission",
  });
  if (error) {
    throw new Error(`Failed workspace_permissions seed: ${error.message}`);
  }
}

async function upsertMembership(db, workspaceId, userId, role) {
  const { error } = await db.from("workspace_users").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      role,
      last_accessed: new Date().toISOString(),
    },
    { onConflict: "workspace_id,user_id" },
  );
  if (error) {
    throw new Error(`Failed membership ${userId}@${workspaceId}: ${error.message}`);
  }
}

async function seed() {
  const url = requireEnv("AUTH_URL", "API_URL");
  const serviceKey = requireEnv("AUTH_SERVICE_KEY", "SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = admin;

  console.log(`[e2e-seed] version=${SEED_VERSION}`);

  await seedWorkspacePermissions(db);

  for (const user of Object.values(USERS)) {
    await ensureAuthUser(admin, user);
    const accessLevel = user.id === USERS.sudo.id ? "sudo" : null;
    await upsertUserProfile(db, user, accessLevel);
  }

  const readyId = WORKSPACES.ready.id;
  const onboardingId = WORKSPACES.onboarding.id;
  const emptyId = WORKSPACES.empty.id;

  for (const ws of Object.values(WORKSPACES)) {
    const isReady = ws.id === readyId;
    const isEmpty = ws.id === emptyId;
    const { error } = await db.from("workspace").upsert({
      id: ws.id,
      name: ws.name,
      owner: USERS.owner.id,
      credits: isEmpty ? 0 : 500,
      disabled: false,
      stripe_id: isReady ? "cus_e2e_test" : null,
      twilio_data: isReady ? readyTwilioData() : {},
      key: isReady ? "SK_e2e_test_api_key" : null,
      token: isReady ? "e2e_test_api_secret" : null,
      feature_flags: {},
    });
    if (error) {
      throw new Error(`Failed workspace ${ws.id}: ${error.message}`);
    }
  }

  await upsertMembership(db, readyId, USERS.owner.id, "owner");
  await upsertMembership(db, readyId, USERS.admin.id, "admin");
  await upsertMembership(db, readyId, USERS.member.id, "member");
  await upsertMembership(db, readyId, USERS.caller.id, "caller");
  await upsertMembership(db, readyId, USERS.authflow.id, "member");
  await upsertMembership(db, onboardingId, USERS.owner.id, "owner");
  await upsertMembership(db, onboardingId, USERS.admin.id, "admin");
  await upsertMembership(db, onboardingId, USERS.member.id, "member");
  await upsertMembership(db, emptyId, USERS.owner.id, "owner");
  await upsertMembership(db, emptyId, USERS.member.id, "member");
  await upsertMembership(db, emptyId, USERS.caller.id, "caller");

  const { error: emptyNumberError } = await db.from("workspace_number").upsert({
    id: 940002,
    workspace: emptyId,
    phone_number: "+15555501099",
    type: "rented",
    friendly_name: "E2E Empty Workspace Number",
    handset_enabled: false,
    inbound_ring_count: 3,
    capabilities: {},
  });
  if (emptyNumberError) {
    throw new Error(`Failed empty workspace_number: ${emptyNumberError.message}`);
  }

  const { error: numberError } = await db.from("workspace_number").upsert({
    id: WORKSPACE_NUMBER_ID,
    workspace: readyId,
    phone_number: "+15555501001",
    type: "rented",
    friendly_name: "E2E Primary",
    handset_enabled: true,
    inbound_ring_count: 3,
    capabilities: {},
  });
  if (numberError) {
    throw new Error(`Failed workspace_number: ${numberError.message}`);
  }

  for (const [key, scriptId] of Object.entries(SCRIPT_IDS)) {
    const { error } = await db.from("script").upsert({
      id: scriptId,
      workspace: readyId,
      name: key === "live" ? "E2E Live Script" : "E2E IVR Script",
      type: key === "live" ? "script" : "ivr",
      created_by: USERS.owner.id,
      steps: key === "live"
        ? [{ type: "textarea", title: "Intro", content: "Hello" }]
        : [
            {
              type: "synthetic",
              title: "Welcome",
              content: "Press 1 for yes",
              options: [{ digit: "1", next: "page2" }],
            },
          ],
    });
    if (error) {
      throw new Error(`Failed script ${scriptId}: ${error.message}`);
    }
  }

  const campaigns = [
    campaignBase(CAMPAIGNS.liveCall, readyId, "E2E Live Call", "live_call"),
    campaignBase(CAMPAIGNS.livePredictive, readyId, "E2E Predictive Live", "live_call", {
      dial_type: "predictive",
    }),
    campaignBase(CAMPAIGNS.message, readyId, "E2E Message Campaign", "message", {
      sms_send_mode: "from_number",
    }),
    campaignBase(CAMPAIGNS.robocall, readyId, "E2E Robocall", "robocall"),
    campaignBase(CAMPAIGNS.archived, readyId, "E2E Archived Campaign", "live_call", {
      status: "archived",
    }),
  ];

  for (const row of campaigns) {
    const { error } = await db.from("campaign").upsert(row);
    if (error) {
      throw new Error(`Failed campaign ${row.id}: ${error.message}`);
    }
  }

  const { error: liveCampaignError } = await db.from("live_campaign").upsert([
    {
      id: 970001,
      campaign_id: CAMPAIGNS.liveCall,
      workspace: readyId,
      script_id: SCRIPT_IDS.live,
      disposition_options: ["answered", "no_answer", "busy"],
      questions: {},
    },
    {
      id: 970002,
      campaign_id: CAMPAIGNS.livePredictive,
      workspace: readyId,
      script_id: SCRIPT_IDS.live,
      disposition_options: ["answered", "no_answer", "busy"],
      questions: {},
    },
    {
      id: 970003,
      campaign_id: CAMPAIGNS.archived,
      workspace: readyId,
      script_id: SCRIPT_IDS.live,
      disposition_options: ["answered"],
      questions: {},
    },
  ]);
  if (liveCampaignError) {
    throw new Error(`Failed live_campaign seed: ${liveCampaignError.message}`);
  }

  await db.from("message_campaign").upsert({
    id: 970010,
    campaign_id: CAMPAIGNS.message,
    workspace: readyId,
    body_text: "Hello from E2E message campaign",
    message_media: [],
  });

  await db.from("ivr_campaign").upsert({
    id: 970020,
    campaign_id: CAMPAIGNS.robocall,
    workspace: readyId,
    script_id: SCRIPT_IDS.ivr,
  });

  const contacts = CONTACT_IDS.map((id, index) => ({
    id,
    workspace: readyId,
    firstname: `Contact${index + 1}`,
    surname: "E2E",
    phone: `+15555501${String(index + 2).padStart(3, "0")}`,
    email: `contact${index + 1}@e2e.test`,
    created_by: USERS.owner.id,
  }));

  for (const contact of contacts) {
    const { error } = await db.from("contact").upsert(contact);
    if (error) {
      throw new Error(`Failed contact ${contact.id}: ${error.message}`);
    }
  }

  const { error: audienceError } = await db.from("audience").upsert({
    id: AUDIENCE_ID,
    workspace: readyId,
    name: "E2E Audience",
    status: "completed",
  });
  if (audienceError) {
    throw new Error(`Failed audience seed: ${audienceError.message}`);
  }

  for (const contact of contacts) {
    const { error: linkError } = await db.from("contact_audience").upsert({
      contact_id: contact.id,
      audience_id: AUDIENCE_ID,
    });
    if (linkError) {
      throw new Error(`Failed contact_audience ${contact.id}: ${linkError.message}`);
    }
  }

  await db.from("campaign_audience").upsert([
    {
      campaign_id: CAMPAIGNS.liveCall,
      audience_id: AUDIENCE_ID,
    },
    {
      campaign_id: CAMPAIGNS.livePredictive,
      audience_id: AUDIENCE_ID,
    },
  ]);

  for (let i = 0; i < contacts.length; i += 1) {
    await db.from("campaign_queue").upsert({
      id: 980001 + i,
      campaign_id: CAMPAIGNS.liveCall,
      contact_id: contacts[i].id,
      status: USERS.owner.id,
      queue_order: i + 1,
      queue_state: "assigned",
      attempts: 0,
      attempt_count: 0,
      assigned_to_user_id: USERS.owner.id,
    });
  }

  for (let i = 0; i < contacts.length; i += 1) {
    await db.from("campaign_queue").upsert({
      id: 980010 + i,
      campaign_id: CAMPAIGNS.livePredictive,
      contact_id: contacts[i].id,
      status: "queued",
      queue_order: i + 1,
      queue_state: "queued",
      attempts: 0,
      attempt_count: 0,
    });
  }

  await db.from("survey").upsert({
    id: SURVEY.id,
    survey_id: SURVEY.publicId,
    title: "E2E Public Survey",
    workspace: readyId,
    is_active: true,
  });

  await db.from("survey_page").upsert({
    id: SURVEY.pageId,
    survey_id: SURVEY.id,
    page_id: "page1",
    title: "Page 1",
    page_order: 1,
  });

  await db.from("survey_question").upsert([
    {
      id: 960201,
      page_id: SURVEY.pageId,
      question_id: "q1",
      question_text: "How are you?",
      question_type: "radio",
      is_required: true,
      question_order: 1,
    },
    {
      id: 960202,
      page_id: SURVEY.pageId,
      question_id: "q2",
      question_text: "Any comments?",
      question_type: "text",
      is_required: false,
      question_order: 2,
    },
  ]);

  await db.from("question_option").upsert({
    id: 960301,
    question_id: 960201,
    option_value: "good",
    option_label: "Good",
    option_order: 1,
  });

  await db.from("message").upsert([
    {
      sid: "SM_e2e_inbound_1",
      workspace: readyId,
      contact_id: contacts[0].id,
      body: "Hello from contact",
      direction: "inbound",
      from: contacts[0].phone,
      to: "+15555501001",
      status: "received",
      date_created: new Date().toISOString(),
    },
    {
      sid: "SM_e2e_outbound_1",
      workspace: readyId,
      contact_id: contacts[0].id,
      body: "Reply from agent",
      direction: "outbound",
      from: "+15555501001",
      to: contacts[0].phone,
      status: "delivered",
      date_created: new Date().toISOString(),
    },
  ]);

  await db.from("workspace_invite").upsert({
    id: "d1000000-0000-4000-8000-000000000001",
    workspace: readyId,
    user_id: USERS.invitee.id,
    role: "member",
    isNew: true,
  });

  await db.from("workspace_api_key").upsert({
    id: API_KEY.id,
    workspace_id: readyId,
    name: "E2E Existing Key",
    key_prefix: API_KEY.prefix,
    key_hash: hashApiKey(API_KEY.plaintext),
    created_by: USERS.owner.id,
  });

  console.log("[e2e-seed] complete");
}

seed().catch((error) => {
  console.error("[e2e-seed] failed:", error);
  process.exit(1);
});
