import type { Database, Tables } from "@/lib/database.types";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { NavLink, Outlet, useFetcher, useLoaderData, useLocation, useNavigate, useOutlet, useOutletContext, useParams, useSearchParams, useRouteError } from "react-router";
import { MdAdd, MdChat } from "react-icons/md";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { useInfiniteScroll } from "@/hooks";
import { X } from "lucide-react";
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { fetchCampaignsByType, fetchContactData, fetchConversationSummary, getUserRole } from "@/lib/database.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";

interface Campaign {
  id: number;
  title: string;
  type: string;
  status: string;
  created_at: string;
}

interface RouteWorkspaceNumber {
  id: number;
  phone_number: string | null;
}

interface Chat {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
}

type ConversationSidebarProps = {
  campaigns: Campaign[];
  chats: ConversationSummary[];
  chatsError: string | null;
  contactNumber?: string;
  formatDate: (value: string) => string;
  handleExistingConversationClick: (phoneNumber: string) => void;
  onLoadMore: () => void;
  onNewChatClick?: () => void;
  paginationError?: string | null;
  paginationState: LoaderData["pagination"];
  paginationFetcherState: "idle" | "loading" | "submitting";
  searchParams: URLSearchParams;
  sortBy: string;
  hideStopConversations: boolean;
  onHideStopChange: (checked: boolean) => void;
  optOutKeywords: string[];
  updateFilters: (
    updater: (params: URLSearchParams) => URLSearchParams,
  ) => void;
};

const ALL_CAMPAIGNS_VALUE = "all";

type LoaderData = {
  campaigns: Campaign[];
  chats: ConversationSummary[];
  chatsError: string | null;
  potentialContacts: Contact[];
  contact: Contact | null;
  error: string | null;
  optOutKeywords: string[];
  userRole: string;
  contact_number: string | undefined;
  workspaceNumbers: RouteWorkspaceNumber[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
};

type ImageFetcherData = {
  success: boolean;
  url: string;
  error?: string;
};

type WorkspaceContextType = {
  supabase: SupabaseClient<Database>;
  workspace: {
    id: string;
    name: string;
    owner: string | null;
    users: string[] | null;
    workspace_number?: RouteWorkspaceNumber[];
    created_at: string;
  };
};

function getConversationDisplayName(chat: ConversationSummary): string {
  const fullName = [chat.contact_firstname, chat.contact_surname]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();

  return fullName || chat.contact_phone;
}

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

function mergeConversationPages(
  currentChats: ConversationSummary[],
  nextChats: ConversationSummary[],
): ConversationSummary[] {
  const mergedChats = [...currentChats];

  for (const nextChat of nextChats) {
    const existingIndex = mergedChats.findIndex((chat) =>
      phoneNumbersMatch(chat.contact_phone, nextChat.contact_phone),
    );

    if (existingIndex >= 0) {
      mergedChats[existingIndex] = {
        ...mergedChats[existingIndex],
        ...nextChat,
      };
      continue;
    }

    mergedChats.push(nextChat);
  }

  return mergedChats;
}

function getWorkspacePhoneKeys(
  workspaceNumbers: RouteWorkspaceNumber[],
): Set<string> {
  return new Set(
    workspaceNumbers
      .map((workspaceNumber) => workspaceNumber.phone_number)
      .map((phoneNumber) =>
        phoneNumber ? normalizeConversationPhone(phoneNumber) : null,
      )
      .filter((phoneNumber): phoneNumber is string => Boolean(phoneNumber))
      .map((phoneNumber) => phoneNumber.replace(/\D/g, "")),
  );
}

function upsertConversationFromMessage({
  currentChats,
  message,
  activeContactNumber,
  workspacePhoneKeys,
}: {
  currentChats: ConversationSummary[];
  message: Tables<"message">;
  activeContactNumber?: string;
  workspacePhoneKeys: Set<string>;
}): ConversationSummary[] {
  const { contactPhone, userPhone } = getConversationParticipantPhones(
    {
      from: message.from,
      to: message.to,
      direction: message.direction,
    },
    workspacePhoneKeys,
  );

  if (!contactPhone) {
    return currentChats;
  }

  const nextTimestamp = message.date_created ?? new Date().toISOString();
  const isInbound = isInboundMessageDirection(message.direction);
  const isActiveConversation =
    Boolean(activeContactNumber) &&
    phoneNumbersMatch(contactPhone, activeContactNumber ?? null);
  const unreadIncrement =
    isInbound && message.status === "received" && !isActiveConversation ? 1 : 0;
  const existingConversationIndex = currentChats.findIndex((chat) =>
    phoneNumbersMatch(chat.contact_phone, contactPhone),
  );

  if (existingConversationIndex < 0) {
    return [
      ...currentChats,
      {
        contact_phone: contactPhone,
        user_phone: userPhone ?? "",
        conversation_start: nextTimestamp,
        conversation_last_update: nextTimestamp,
        message_count: 1,
        unread_count: unreadIncrement,
        contact_firstname: null,
        contact_surname: null,
        has_replied: isInbound,
      },
    ];
  }

  return currentChats.map((chat, index) => {
    if (index !== existingConversationIndex) {
      return chat;
    }

    return {
      ...chat,
      user_phone: chat.user_phone || userPhone || "",
      message_count: chat.message_count + 1,
      unread_count: chat.unread_count + unreadIncrement,
      conversation_last_update:
        new Date(chat.conversation_last_update).getTime() >
        new Date(nextTimestamp).getTime()
          ? chat.conversation_last_update
          : nextTimestamp,
      has_replied: chat.has_replied === true || isInbound,
    };
  });
}

// Custom hook for image handling

function useImageHandling(workspace_id: string) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const imageFetcher = useFetcher({ key: "images" });

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const data = new FormData();
        data.append("workspaceId", workspace_id);
        data.append("image", file);
        data.append("fileName", file.name);
        imageFetcher.submit(data, {
          action: "/api/message_media",
          method: "POST",
          encType: "multipart/form-data",
        });
      }
    },
    [workspace_id, imageFetcher],
  );

  const handleImageRemove = useCallback((imageUrl: string) => {
    setSelectedImages((prevImages) =>
      prevImages.filter((image) => image !== imageUrl),
    );
  }, []);

  // Process uploaded images
  useEffect(() => {
    if (imageFetcher.state === "idle" && imageFetcher.data) {
      const fetcherData = imageFetcher.data as ImageFetcherData;
      if (fetcherData.success && fetcherData.url) {
        setSelectedImages((prevImages) => {
          const newImagesSet = new Set([...prevImages, fetcherData.url]);
          return Array.from(newImagesSet);
        });

        const fileInput = document.querySelector<HTMLInputElement>("#image");
        if (fileInput) fileInput.value = "";
      } else if (fetcherData.error) {
        logger.error("Image upload error:", fetcherData.error);
      }
    }
  }, [imageFetcher]);

  return {
    selectedImages,
    setSelectedImages,
    handleImageSelect,
    handleImageRemove,
    imageFetcher,
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {



  const { supabaseClient, headers, user } = await verifyAuth(request);
  const { id: workspaceId } = params;
  const url = new URL(request.url);
  const contact_id = url.searchParams.get("contact_id");
  const campaign_id = url.searchParams.get("campaign_id");
  const sortBy = getChatSortOption(url.searchParams.get("sort"));
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1", 10) || 1,
  );
  const pageSize = Math.min(
    100,
    Math.max(
      10,
      Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20,
    ),
  );
  const offset = (page - 1) * pageSize;
  const contact_number = params["contact_number"];

  if (!workspaceId) {
    throw redirect("/workspaces");
  }
  const userRole = await getUserRole({
    supabaseClient: supabaseClient as SupabaseClient,
    user: user as unknown as User,
    workspaceId: workspaceId as string,
  });

  let optOutKeywords = parseOptOutKeywords(null);
  try {
    const onboarding = await getWorkspaceMessagingOnboardingState({
      supabaseClient,
      workspaceId: workspaceId as string,
    });
    optOutKeywords = parseOptOutKeywords(
      onboarding.businessProfile.optOutKeywords,
    );
  } catch {
    // use default keywords if onboarding not available
  }

  const [workspaceNumbers, contactData, smsCampaigns] = await Promise.all([
    supabaseClient
      .from("workspace_number")
      .select("*")
      .eq("workspace", workspaceId)
      .eq("type", "rented"),
    contact_number
      ? fetchContactData(
          supabaseClient,
          workspaceId,
          contact_id,
          contact_number,
        )
      : null,
    fetchCampaignsByType({
      supabaseClient,
      workspaceId,
      type: "message_campaign",
    }),
  ]);
  const { contact, potentialContacts, contactError } = contactData || {
    contact: null,
    potentialContacts: [],
    contactError: null,
  };
  if (contactError) {
    const contactErrorMessage =
      typeof contactError === "object" &&
      contactError !== null &&
      "message" in contactError &&
      typeof contactError.message === "string"
        ? contactError.message
        : "Failed to load contact";
    return routeData(
      {
        campaigns: smsCampaigns,
        chats: [],
        chatsError: null,
        contact: null,
        error: contactErrorMessage,
        optOutKeywords,
        pagination: {
          page,
          pageSize,
          hasMore: false,
        },
        potentialContacts: [],
        userRole,
        workspaceNumbers: workspaceNumbers?.data ?? [],
        contact_number,
      },
      { headers },
    );
  }

  const { chats, chatsError, hasMore } = await fetchConversationSummary(
    supabaseClient,
    workspaceId,
    campaign_id,
    {
      limit: pageSize,
      offset,
      sort: sortBy,
    },
  );

  return routeData(
    {
      campaigns: smsCampaigns,
      workspaceNumbers: workspaceNumbers?.data ?? [],
      chats: chats ?? [],
      chatsError:
        chatsError && typeof chatsError === "object" && "message" in chatsError
          ? String(chatsError.message)
          : null,
      potentialContacts,
      contact,
      error: null,
      optOutKeywords,
      userRole,
      contact_number,
      pagination: {
        page,
        pageSize,
        hasMore,
      },
    },
    { headers },
  );
}
