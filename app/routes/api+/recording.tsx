
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  logger.debug("Recording webhook received", { data });
  return routeData(data);
};
