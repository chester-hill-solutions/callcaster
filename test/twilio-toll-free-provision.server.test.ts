import { beforeEach, expect, test, vi } from "vitest";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { onboardingFixture } from "./fixtures/onboarding";
const saved=vi.hoisted(()=>({data:{} as Record<string,unknown>}));
let sdk: Twilio;
vi.mock("@/lib/merge-workspace-twilio-data.server",async(importOriginal)=>({
 ...(await importOriginal<typeof import("@/lib/merge-workspace-twilio-data.server")>()),
 loadWorkspaceTwilioData:async()=>saved.data,
}));
vi.mock("@/lib/database/workspace.server",async(importOriginal)=>({
 ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
 getWorkspacePhoneNumbers:async()=>({data:[{phone_number:"+18885551212",twilio_phone_number_sid:`PN${"2".repeat(32)}`}]}),
}));
vi.mock("@/lib/twilio-client.server",async(importOriginal)=>({
 ...(await importOriginal<typeof import("@/lib/twilio-client.server")>()),
 createWorkspaceTwilioClient:async()=>sdk,
}));
import { provisionTollFreeVerification } from "@/lib/twilio-toll-free-provision.server";
const args={workspaceId:"opt-in-fixture",actorUserId:"u1",customerProfileBundleSid:`BU${"3".repeat(32)}`};
let request: ReturnType<typeof vi.spyOn<RequestClient,"request">>;
let existing=false;
function seed(selection:unknown,workflow="We do not accept verbal consent; users select the website consent checkbox."){
 const state=onboardingFixture();saved.data={onboarding:{...state,selectedChannels:["toll_free_bulk_sms"],businessProfile:{...state.businessProfile,legalBusinessName:"Acme",websiteUrl:"https://acme.test",supportEmail:"support@acme.test",useCaseSummary:"Appointment reminders",sampleMessages:["Acme: Your appointment is tomorrow. Reply STOP to stop."],optInWorkflow:workflow,tollFreeOptInType:selection},tollFreeVerification:{optInType:selection}}};
}
beforeEach(()=>{
 vi.clearAllMocks();existing=false;
 const transport=new RequestClient();request=vi.spyOn(transport,"request").mockImplementation(async(input)=>({statusCode:input.method.toUpperCase()==="POST"?201:200,headers:{},body:JSON.stringify(input.method.toUpperCase()==="POST"||input.uri.endsWith(`HH${"4".repeat(32)}`)?{sid:`HH${"4".repeat(32)}`,tollfree_phone_number_sid:`PN${"2".repeat(32)}`,status:"TWILIO_APPROVED"}:{tollfree_verifications:existing?[{sid:`HH${"4".repeat(32)}`,tollfree_phone_number_sid:`PN${"2".repeat(32)}`,status:"TWILIO_APPROVED"}]:[],meta:{key:"tollfree_verifications",next_page_url:null}})}));
 sdk=new Twilio(`AC${"5".repeat(32)}`,"fixture-token",{httpClient:transport});
});
function creates(){return request.mock.calls.map(([input])=>input).filter(input=>input.method.toUpperCase()==="POST");}
test.each(["VERBAL","WEB_FORM","PAPER_FORM","VIA_TEXT","MOBILE_QR_CODE","IMPORT","IMPORT_PLEASE_REPLACE"])("explicit %s reaches the SDK exactly",async(selection)=>{
 seed(selection);await provisionTollFreeVerification(args);expect(creates()).toHaveLength(1);expect(creates()[0].data).toMatchObject({OptInType:selection});
});
test.each([undefined,"","verbal","NOT_VERBAL","WEB_FORM extra",123])("missing or invalid %s does not submit",async(selection)=>{
 seed(selection);const result=await provisionTollFreeVerification(args);expect(creates()).toHaveLength(0);expect(result.status).toBe("action_needed");
});
test("existing registration can be read without a new missing selection",async()=>{
 seed(undefined);existing=true;const result=await provisionTollFreeVerification(args);expect(creates()).toHaveLength(0);expect(result.status).toBe("approved");
});
test("changing prose cannot change an explicit website selection",async()=>{
 seed("WEB_FORM","Verbal consent is never accepted; text or paper are not used.");await provisionTollFreeVerification(args);expect(creates()[0].data).toMatchObject({OptInType:"WEB_FORM"});
});
