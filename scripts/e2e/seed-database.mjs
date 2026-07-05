#!/usr/bin/env node
/* eslint-env node */
import "dotenv/config";
import postgres from "postgres";
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

async function seedWorkspacePermissions(sql) {
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
  for (const row of rows) {
    await sql`
      INSERT INTO workspace_permissions (role, permission)
      VALUES (${row.role}, ${row.permission})
      ON CONFLICT (role, permission) DO UPDATE SET
        role = EXCLUDED.role,
        permission = EXCLUDED.permission
    `;
  }
}

async function upsertUserProfile(sql, user, accessLevel = null) {
  await sql`
    INSERT INTO "user" (id, username, first_name, last_name, access_level)
    VALUES (${user.id}, ${user.email}, ${user.first}, ${user.last}, ${accessLevel})
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      access_level = EXCLUDED.access_level
  `;
}

async function upsertMembership(sql, workspaceId, userId, role) {
  await sql`
    INSERT INTO workspace_users (workspace_id, user_id, role, last_accessed)
    VALUES (${workspaceId}, ${userId}, ${role}, ${new Date().toISOString()})
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      last_accessed = EXCLUDED.last_accessed
  `;
}

async function seed() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const sql = postgres(databaseUrl);

  console.log(`[e2e-seed] version=${SEED_VERSION}`);

  await seedWorkspacePermissions(sql);

  for (const user of Object.values(USERS)) {
    const accessLevel = user.id === USERS.sudo.id ? "sudo" : null;
    await upsertUserProfile(sql, user, accessLevel);
  }

  const readyId = WORKSPACES.ready.id;
  const onboardingId = WORKSPACES.onboarding.id;
  const emptyId = WORKSPACES.empty.id;

  for (const ws of Object.values(WORKSPACES)) {
    const isReady = ws.id === readyId;
    const isEmpty = ws.id === emptyId;
    await sql`
      INSERT INTO workspace (id, name, owner, credits, disabled, stripe_id, twilio_data, key, token, feature_flags)
      VALUES (
        ${ws.id},
        ${ws.name},
        ${USERS.owner.id},
        ${isEmpty ? 0 : 500},
        ${false},
        ${isReady ? "cus_e2e_test" : null},
        ${isReady ? readyTwilioData() : {}},
        ${isReady ? "SK_e2e_test_api_key" : null},
        ${isReady ? "e2e_test_api_secret" : null},
        ${{}}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        owner = EXCLUDED.owner,
        credits = EXCLUDED.credits,
        disabled = EXCLUDED.disabled,
        stripe_id = EXCLUDED.stripe_id,
        twilio_data = EXCLUDED.twilio_data,
        key = EXCLUDED.key,
        token = EXCLUDED.token,
        feature_flags = EXCLUDED.feature_flags
    `;
  }

  await upsertMembership(sql, readyId, USERS.owner.id, "owner");
  await upsertMembership(sql, readyId, USERS.admin.id, "admin");
  await upsertMembership(sql, readyId, USERS.member.id, "member");
  await upsertMembership(sql, readyId, USERS.caller.id, "caller");
  await upsertMembership(sql, readyId, USERS.authflow.id, "member");
  await upsertMembership(sql, onboardingId, USERS.owner.id, "owner");
  await upsertMembership(sql, onboardingId, USERS.admin.id, "admin");
  await upsertMembership(sql, onboardingId, USERS.member.id, "member");
  await upsertMembership(sql, emptyId, USERS.owner.id, "owner");
  await upsertMembership(sql, emptyId, USERS.member.id, "member");
  await upsertMembership(sql, emptyId, USERS.caller.id, "caller");

  await sql`
    INSERT INTO workspace_number (id, workspace, phone_number, type, friendly_name, handset_enabled, inbound_ring_count, capabilities)
    VALUES (
      940002,
      ${emptyId},
      '+15555501099',
      'rented',
      'E2E Empty Workspace Number',
      ${false},
      3,
      ${{}}
    )
    ON CONFLICT (id) DO UPDATE SET
      workspace = EXCLUDED.workspace,
      phone_number = EXCLUDED.phone_number,
      type = EXCLUDED.type,
      friendly_name = EXCLUDED.friendly_name,
      handset_enabled = EXCLUDED.handset_enabled,
      inbound_ring_count = EXCLUDED.inbound_ring_count,
      capabilities = EXCLUDED.capabilities
  `;

  await sql`
    INSERT INTO workspace_number (id, workspace, phone_number, type, friendly_name, handset_enabled, inbound_ring_count, capabilities)
    VALUES (
      ${WORKSPACE_NUMBER_ID},
      ${readyId},
      '+15555501001',
      'rented',
      'E2E Primary',
      ${true},
      3,
      ${{}}
    )
    ON CONFLICT (id) DO UPDATE SET
      workspace = EXCLUDED.workspace,
      phone_number = EXCLUDED.phone_number,
      type = EXCLUDED.type,
      friendly_name = EXCLUDED.friendly_name,
      handset_enabled = EXCLUDED.handset_enabled,
      inbound_ring_count = EXCLUDED.inbound_ring_count,
      capabilities = EXCLUDED.capabilities
  `;

  for (const [key, scriptId] of Object.entries(SCRIPT_IDS)) {
    const isLive = key === "live";
    await sql`
      INSERT INTO script (id, workspace, name, type, created_by, steps)
      VALUES (
        ${scriptId},
        ${readyId},
        ${isLive ? "E2E Live Script" : "E2E IVR Script"},
        ${isLive ? "script" : "ivr"},
        ${USERS.owner.id},
        ${isLive
          ? [{ type: "textarea", title: "Intro", content: "Hello" }]
          : [{ type: "synthetic", title: "Welcome", content: "Press 1 for yes", options: [{ digit: "1", next: "page2" }] }]
        }
      )
      ON CONFLICT (id) DO UPDATE SET
        workspace = EXCLUDED.workspace,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        created_by = EXCLUDED.created_by,
        steps = EXCLUDED.steps
    `;
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
    await sql`
      INSERT INTO campaign (id, title, type, workspace, status, is_active, caller_id, start_date, end_date, schedule, dial_type, dial_ratio, group_household_queue, next_queue_order, sms_send_mode)
      VALUES (
        ${row.id},
        ${row.title},
        ${row.type},
        ${row.workspace},
        ${row.status},
        ${row.is_active},
        ${row.caller_id},
        ${row.start_date},
        ${row.end_date},
        ${row.schedule},
        ${row.dial_type},
        ${row.dial_ratio},
        ${row.group_household_queue},
        ${row.next_queue_order},
        ${row.sms_send_mode}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        workspace = EXCLUDED.workspace,
        status = EXCLUDED.status,
        is_active = EXCLUDED.is_active,
        caller_id = EXCLUDED.caller_id,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        schedule = EXCLUDED.schedule,
        dial_type = EXCLUDED.dial_type,
        dial_ratio = EXCLUDED.dial_ratio,
        group_household_queue = EXCLUDED.group_household_queue,
        next_queue_order = EXCLUDED.next_queue_order,
        sms_send_mode = EXCLUDED.sms_send_mode
    `;
  }

  const liveCampaigns = [
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
  ];
  for (const row of liveCampaigns) {
    await sql`
      INSERT INTO live_campaign (id, campaign_id, workspace, script_id, disposition_options, questions)
      VALUES (
        ${row.id},
        ${row.campaign_id},
        ${row.workspace},
        ${row.script_id},
        ${row.disposition_options},
        ${row.questions}
      )
      ON CONFLICT (id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        workspace = EXCLUDED.workspace,
        script_id = EXCLUDED.script_id,
        disposition_options = EXCLUDED.disposition_options,
        questions = EXCLUDED.questions
    `;
  }

  await sql`
    INSERT INTO message_campaign (id, campaign_id, workspace, body_text, message_media)
    VALUES (
      970010,
      ${CAMPAIGNS.message},
      ${readyId},
      'Hello from E2E message campaign',
      ${[]}
    )
    ON CONFLICT (id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      workspace = EXCLUDED.workspace,
      body_text = EXCLUDED.body_text,
      message_media = EXCLUDED.message_media
  `;

  await sql`
    INSERT INTO ivr_campaign (id, campaign_id, workspace, script_id)
    VALUES (
      970020,
      ${CAMPAIGNS.robocall},
      ${readyId},
      ${SCRIPT_IDS.ivr}
    )
    ON CONFLICT (id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      workspace = EXCLUDED.workspace,
      script_id = EXCLUDED.script_id
  `;

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
    await sql`
      INSERT INTO contact (id, workspace, firstname, surname, phone, email, created_by)
      VALUES (
        ${contact.id},
        ${contact.workspace},
        ${contact.firstname},
        ${contact.surname},
        ${contact.phone},
        ${contact.email},
        ${contact.created_by}
      )
      ON CONFLICT (id) DO UPDATE SET
        workspace = EXCLUDED.workspace,
        firstname = EXCLUDED.firstname,
        surname = EXCLUDED.surname,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        created_by = EXCLUDED.created_by
    `;
  }

  await sql`
    INSERT INTO audience (id, workspace, name, status)
    VALUES (
      ${AUDIENCE_ID},
      ${readyId},
      'E2E Audience',
      'completed'
    )
    ON CONFLICT (id) DO UPDATE SET
      workspace = EXCLUDED.workspace,
      name = EXCLUDED.name,
      status = EXCLUDED.status
  `;

  for (const contact of contacts) {
    await sql`
      INSERT INTO contact_audience (contact_id, audience_id)
      VALUES (${contact.id}, ${AUDIENCE_ID})
      ON CONFLICT (contact_id, audience_id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        audience_id = EXCLUDED.audience_id
    `;
  }

  await sql`
    INSERT INTO campaign_audience (campaign_id, audience_id)
    VALUES (${CAMPAIGNS.liveCall}, ${AUDIENCE_ID})
    ON CONFLICT (campaign_id, audience_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      audience_id = EXCLUDED.audience_id
  `;

  await sql`
    INSERT INTO campaign_audience (campaign_id, audience_id)
    VALUES (${CAMPAIGNS.livePredictive}, ${AUDIENCE_ID})
    ON CONFLICT (campaign_id, audience_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      audience_id = EXCLUDED.audience_id
  `;

  for (let i = 0; i < contacts.length; i += 1) {
    await sql`
      INSERT INTO campaign_queue (id, campaign_id, contact_id, status, queue_order, queue_state, attempts, attempt_count, assigned_to_user_id)
      VALUES (
        ${980001 + i},
        ${CAMPAIGNS.liveCall},
        ${contacts[i].id},
        ${USERS.owner.id},
        ${i + 1},
        'assigned',
        0,
        0,
        ${USERS.owner.id}
      )
      ON CONFLICT (id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        contact_id = EXCLUDED.contact_id,
        status = EXCLUDED.status,
        queue_order = EXCLUDED.queue_order,
        queue_state = EXCLUDED.queue_state,
        attempts = EXCLUDED.attempts,
        attempt_count = EXCLUDED.attempt_count,
        assigned_to_user_id = EXCLUDED.assigned_to_user_id
    `;
  }

  for (let i = 0; i < contacts.length; i += 1) {
    await sql`
      INSERT INTO campaign_queue (id, campaign_id, contact_id, status, queue_order, queue_state, attempts, attempt_count)
      VALUES (
        ${980010 + i},
        ${CAMPAIGNS.livePredictive},
        ${contacts[i].id},
        'queued',
        ${i + 1},
        'queued',
        0,
        0
      )
      ON CONFLICT (id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        contact_id = EXCLUDED.contact_id,
        status = EXCLUDED.status,
        queue_order = EXCLUDED.queue_order,
        queue_state = EXCLUDED.queue_state,
        attempts = EXCLUDED.attempts,
        attempt_count = EXCLUDED.attempt_count
    `;
  }

  await sql`
    INSERT INTO survey (id, survey_id, title, workspace, is_active)
    VALUES (
      ${SURVEY.id},
      ${SURVEY.publicId},
      'E2E Public Survey',
      ${readyId},
      ${true}
    )
    ON CONFLICT (id) DO UPDATE SET
      survey_id = EXCLUDED.survey_id,
      title = EXCLUDED.title,
      workspace = EXCLUDED.workspace,
      is_active = EXCLUDED.is_active
  `;

  await sql`
    INSERT INTO survey_page (id, survey_id, page_id, title, page_order)
    VALUES (
      ${SURVEY.pageId},
      ${SURVEY.id},
      'page1',
      'Page 1',
      1
    )
    ON CONFLICT (id) DO UPDATE SET
      survey_id = EXCLUDED.survey_id,
      page_id = EXCLUDED.page_id,
      title = EXCLUDED.title,
      page_order = EXCLUDED.page_order
  `;

  const surveyQuestions = [
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
  ];
  for (const row of surveyQuestions) {
    await sql`
      INSERT INTO survey_question (id, page_id, question_id, question_text, question_type, is_required, question_order)
      VALUES (
        ${row.id},
        ${row.page_id},
        ${row.question_id},
        ${row.question_text},
        ${row.question_type},
        ${row.is_required},
        ${row.question_order}
      )
      ON CONFLICT (id) DO UPDATE SET
        page_id = EXCLUDED.page_id,
        question_id = EXCLUDED.question_id,
        question_text = EXCLUDED.question_text,
        question_type = EXCLUDED.question_type,
        is_required = EXCLUDED.is_required,
        question_order = EXCLUDED.question_order
    `;
  }

  await sql`
    INSERT INTO question_option (id, question_id, option_value, option_label, option_order)
    VALUES (
      960301,
      960201,
      'good',
      'Good',
      1
    )
    ON CONFLICT (id) DO UPDATE SET
      question_id = EXCLUDED.question_id,
      option_value = EXCLUDED.option_value,
      option_label = EXCLUDED.option_label,
      option_order = EXCLUDED.option_order
  `;

  const messages = [
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
  ];
  for (const row of messages) {
    await sql`
      INSERT INTO message (sid, workspace, contact_id, body, direction, "from", "to", status, date_created)
      VALUES (
        ${row.sid},
        ${row.workspace},
        ${row.contact_id},
        ${row.body},
        ${row.direction},
        ${row.from},
        ${row.to},
        ${row.status},
        ${row.date_created}
      )
      ON CONFLICT (sid) DO UPDATE SET
        workspace = EXCLUDED.workspace,
        contact_id = EXCLUDED.contact_id,
        body = EXCLUDED.body,
        direction = EXCLUDED.direction,
        from = EXCLUDED.from,
        to = EXCLUDED.to,
        status = EXCLUDED.status,
        date_created = EXCLUDED.date_created
    `;
  }

  await sql`
    INSERT INTO workspace_invite (id, workspace, user_id, role, isNew)
    VALUES (
      'd1000000-0000-4000-8000-000000000001',
      ${readyId},
      ${USERS.invitee.id},
      'member',
      ${true}
    )
    ON CONFLICT (id) DO UPDATE SET
      workspace = EXCLUDED.workspace,
      user_id = EXCLUDED.user_id,
      role = EXCLUDED.role,
      isNew = EXCLUDED.isNew
  `;

  await sql`
    INSERT INTO workspace_api_key (id, workspace_id, name, key_prefix, key_hash, created_by)
    VALUES (
      ${API_KEY.id},
      ${readyId},
      'E2E Existing Key',
      ${API_KEY.prefix},
      ${hashApiKey(API_KEY.plaintext)},
      ${USERS.owner.id}
    )
    ON CONFLICT (id) DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      name = EXCLUDED.name,
      key_prefix = EXCLUDED.key_prefix,
      key_hash = EXCLUDED.key_hash,
      created_by = EXCLUDED.created_by
  `;

  await sql.end();

  console.log("[e2e-seed] complete");
}

seed().catch((error) => {
  console.error("[e2e-seed] failed:", error);
  process.exit(1);
});
