import {
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
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

export type ENV = {
  SUPABASE_URL: string | undefined;
  SUPABASE_KEY: string | undefined;
  BASE_URL: string | undefined;
};

export type ContextType = {
  supabase: SupabaseClient;
  env: ENV;
};

export type Audience = Database["public"]["Tables"]["audience"]["Row"] | null;
export type Campaign = Database["public"]["Tables"]["campaign"]["Row"] | null;
export type Contact = Database["public"]["Tables"]["contact"]["Row"] | null;
export type Queue = Database["public"]["Tables"]["contact"]["Row"] | null;
export type Message = Database["public"]["Tables"]["message"]["Row"] | null;

export type QueueItem = Queue & {contact: Contact}

export type WorkspaceTable = Audience | Campaign | Contact | null;

export enum WorkspaceTableNames {
  Audience = "audiences",
  Campaign = "campaigns",
  Contact = "contacts",
}

export type WorkspaceData =
  | {
      created_at: string;
      id: string;
      name: string;
      owner: string | null;
      users: string[] | null;
    }[]
  | null;

  type ReactEmailComponent =
  | typeof EmailButton
  | typeof Container
  | typeof CodeBlock
  | typeof CodeInline
  | typeof Column
  | typeof Row
  | typeof Font
  | typeof Heading
  | typeof Hr
  | typeof Image
  | typeof Link
  | typeof Markdown
  | typeof Section
  | typeof Tailwind
  | typeof Text;

type EmailHead = {
  title?: string;
  meta?: Array<{
    name: string;
    content: string;
  }>;
};

export type EmailBlock = {
  component: keyof ReactEmailComponent;
  id: string;
  content: string | { src: string; alt: string } | ReactNode;
  props?: Record<string, any>;
};

export type EmailBody = {
  order: string[];
  blocks: Record<string, EmailBlock>;
};

export type Email = {
  head: EmailHead;
  preview?: string;
  body: EmailBody;
};
