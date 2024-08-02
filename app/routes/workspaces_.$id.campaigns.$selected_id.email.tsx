import { json, redirect } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useOutlet } from "@remix-run/react";
import { useMemo, useState, useEffect, ReactNode } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import {
  getSignedUrls,
  getUserRole,
  getWorkspaceEmails,
  listMedia,
} from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import {
  Html,
  Head as ReactEmailHead,
  Button as EmailButton,
  Container,
  CodeBlock,
  CodeInline,
  Column,
  Row,
  Font,
  Heading,
  Hr,
  Img as Image,
  Link,
  Markdown,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { Email, EmailBlock, ReactEmailComponent } from "~/lib/types";

const componentMap: Record<string, ReactEmailComponent> = {
  Button: EmailButton,
  Container,
  CodeBlock,
  CodeInline,
  Column,
  Row,
  Font,
  Heading,
  Hr,
  Image,
  Link,
  Markdown,
  Section,
  Tailwind,
  Text,
};

const myEmail: Email = {
  head: {
    title: "Welcome to Our Service",
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
    ],
  },
  preview: "Welcome to our amazing service!",
  body: {
    order: ["greeting", "main-content", "cta"],
    blocks: {
      greeting: {
        component: "Text",
        id: "greeting",
        content: "Hello there!",
        props: { style: { fontSize: "20px", fontWeight: "bold" } },
      },
      "main-content": {
        component: "Row",
        id: "main-content",
        content: "We're excited to have you on board.",
        props: { style: { padding: "20px" } },
      },
      cta: {
        component: "Button",
        id: "cta",
        content: "Get Started",
        props: {
          href: "https://example.com",
          style: { background: "#007bff", color: "white" },
        },
      },
    },
  },
};

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const emails = await getWorkspaceEmails({
    workspace: workspace_id,
    supabase: supabaseClient,
  });

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", selected_id)
    .single();

  if (campaignError) {
    console.error(campaignError);
    throw new Response("Error fetching campaign data", { status: 500 });
  }

  const { data: campaignDetails } = await supabaseClient
    .from("email_campaign")
    .select(`*, script(*)`)
    .eq("campaign_id", selected_id)
    .single();

  return json({
    workspace_id,
    selected_id,
    data: { ...campaignData, campaignDetails },
    userRole,
    emails,
  });
};

const renderEmailBlock = (block: EmailBlock) => {
  const Component = componentMap[block.component as keyof typeof componentMap];
  if (!Component) {
    console.error(`Component ${block.component} not found`);
    return null;
  }
  return (
    <Component key={block.id} {...block.props}>
      {block.content}
    </Component>
  );
};

const EmailRenderer: React.FC<{ email: Email }> = ({ email }) => {
  return (
    <Html lang="en">
      <ReactEmailHead>
        {email.head.title && <title>{email.head.title}</title>}
        {email.head.meta?.map((meta, index) => (
          <meta key={index} name={meta.name} content={meta.content} />
        ))}
      </ReactEmailHead>
      <div>
        {email.preview && <Preview>{email.preview}</Preview>}
        {email.body.order.map((blockId) =>
          renderEmailBlock(email.body.blocks[blockId]),
        )}
      </div>
    </Html>
  );
};

export default function ScriptPage() {
  const { workspace_id, selected_id, emails, data, userRole } = useLoaderData();
  const outlet = useOutlet();
  const [selectedImage, setSelectedImage] = useState(null);
  const clickImage = (e) => {
    setSelectedImage(e.target.src);
  };
  const closePopover = () => {
    setSelectedImage(null);
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedImage]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex flex-col gap-2">
        {!outlet && userRole !== MemberRole.Caller && (
          <div
            className="absolute m-4"
            style={{ top: "-10px", right: "0px", zIndex: "10" }}
          >
            <Button asChild>
              <NavLink to={"edit"}>Edit Script</NavLink>
            </Button>
          </div>
        )}
        <div className="h-full w-full">
          <EmailRenderer email={myEmail} />
        </div>
        <Outlet />
      </div>
    </div>
  );
}
