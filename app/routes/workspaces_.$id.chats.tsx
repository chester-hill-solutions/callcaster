import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useOutlet,
  useOutletContext,
  useSearchParams,
  useRouteError,
} from "@remix-run/react";
import { MdAdd, MdChat } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  fetchCampaignsByType,
  fetchContactData,
  fetchConversationSummary,
  getUserRole,
} from "@/lib/database.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { verifyAuth } from "@/lib/supabase.server";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader as MobileSheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import { useInfiniteScroll } from "@/hooks";
import ChatHeader from "@/components/sms-ui/ChatHeader";
import ChatInput from "@/components/sms-ui/ChatInput";
import ChatAddContactDialog from "@/components/sms-ui/ChatAddContactDialog";
import { useContactSearch } from "@/hooks/contact/useContactSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import { logger } from "@/lib/logger.client";
import { sendMessage } from "./api.chat_sms";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";

// Define WorkspaceNumber interface here to avoid type conflicts
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
  optOutKeywords: string[];
  updateFilters: (
    updater: (params: URLSearchParams) => URLSearchParams,
  ) => void;
};

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

function ConversationList({
  chats,
  contactNumber,
  handleExistingConversationClick,
  formatDate,
}: {
  chats: ConversationSummary[];
  contactNumber?: string;
  handleExistingConversationClick: (phoneNumber: string) => void;
  formatDate: (value: string) => string;
}) {
  const shapedChats = chats.filter(
    (chat, index): chat is ConversationSummary =>
      Boolean(chat?.contact_phone) &&
      chats.findIndex((candidate) =>
        phoneNumbersMatch(candidate?.contact_phone ?? null, chat.contact_phone),
      ) === index,
  );

  if (shapedChats.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  return (
    <>
      {shapedChats
        .filter((chat): chat is ConversationSummary =>
          Boolean(chat?.contact_phone),
        )
        .map((chat) => (
          <button
            type="button"
            key={chat.contact_phone}
            className={`flex w-full items-center justify-between border-b border-border/70 p-4 text-left transition-colors hover:bg-muted/70 ${
              chat.contact_phone === contactNumber ? "bg-secondary/50" : ""
            }`}
            onClick={() => handleExistingConversationClick(chat.contact_phone)}
          >
            <div className="flex items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MdChat size={20} />
              </div>
              <div className="ml-4">
                <div className="font-medium">
                  {getConversationDisplayName(chat)}
                </div>
                <div className="line-clamp-1 text-sm text-muted-foreground">
                  {chat.contact_phone} • {chat.message_count}{" "}
                  {chat.message_count === 1 ? "message" : "messages"}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-xs text-muted-foreground">
                {formatDate(chat.conversation_last_update)}
              </div>
              {chat.unread_count > 0 && (
                <div className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                  {chat.unread_count}
                </div>
              )}
            </div>
          </button>
        ))}
    </>
  );
}

function ConversationSidebar({
  campaigns,
  chats,
  chatsError,
  contactNumber,
  formatDate,
  handleExistingConversationClick,
  onLoadMore,
  onNewChatClick,
  paginationError,
  paginationFetcherState,
  paginationState,
  searchParams,
  sortBy,
  hideStopConversations,
  optOutKeywords,
  updateFilters,
}: ConversationSidebarProps) {
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);

  const [loadMoreRef] = useInfiniteScroll({
    root: scrollRoot,
    hasMore: paginationState.hasMore,
    loading: paginationFetcherState !== "idle",
    onLoadMore,
    rootMargin: "120px",
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Button
        className="flex items-center justify-center rounded-none bg-brand-primary p-4 font-Zilla-Slab text-base font-semibold text-white hover:bg-brand-primary/90"
        asChild
      >
        <NavLink to="." onClick={onNewChatClick}>
          New Chat
          <MdAdd size={24} className="mr-2" />
        </NavLink>
      </Button>
      <div className="flex items-center border-b border-border/70 bg-background/80 p-2">
        <Select
          value={searchParams.get("campaign_id") || ""}
          onValueChange={(value) => {
            updateFilters((nextParams) => {
              nextParams.set("campaign_id", value);
              return nextParams;
            });
          }}
        >
          <SelectTrigger className="flex items-center border-border/70 bg-card/60 p-2">
            <SelectValue placeholder="Filter by Campaign" />
          </SelectTrigger>
          <SelectContent className="w-full">
            {campaigns?.map((campaign: { id: number; title: string }) => (
              <SelectItem
                value={`${campaign.id}`}
                key={campaign.id}
                className="w-full p-4"
              >
                {campaign.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="reset"
          variant={"ghost"}
          onClick={() =>
            updateFilters((nextParams) => {
              nextParams.delete("campaign_id");
              return nextParams;
            })
          }
        >
          <X />
        </Button>
      </div>
      <div className="border-b border-border/70 p-2">
        <Select
          value={sortBy}
          onValueChange={(value) => {
            updateFilters((nextParams) => {
              const nextSort = getChatSortOption(value);

              if (nextSort === "recent") {
                nextParams.delete("sort");
              } else {
                nextParams.set("sort", nextSort);
              }

              return nextParams;
            });
          }}
        >
          <SelectTrigger className="flex items-center border-border/70 bg-card/60">
            <SelectValue placeholder="Sort chats" />
          </SelectTrigger>
          <SelectContent className="w-full">
            <SelectItem value="recent">Recent activity</SelectItem>
            <SelectItem value="hasReplied">Has replied</SelectItem>
            <SelectItem value="hasUnreadReply">Has unread reply</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="text-sm font-medium">Hide STOP-only</span>
        <Switch
          checked={hideStopConversations}
          onCheckedChange={(checked) => {
            updateFilters((nextParams) => {
              if (checked) {
                nextParams.set("hide_stop", "1");
              } else {
                nextParams.delete("hide_stop");
              }
              return nextParams;
            });
          }}
          aria-label="Hide conversations whose last reply is STOP/opt-out"
        />
      </div>
      <div ref={(el) => setScrollRoot(el)} className="flex-1 overflow-y-auto">
        {chatsError ? (
          <p className="border-b px-4 py-2 text-sm text-red-500">
            {chatsError}
          </p>
        ) : null}
        <ConversationList
          chats={chats}
          contactNumber={contactNumber}
          handleExistingConversationClick={handleExistingConversationClick}
          formatDate={formatDate}
        />
        {paginationError ? (
          <p className="px-4 py-2 text-sm text-red-500">{paginationError}</p>
        ) : null}
        {paginationState.hasMore ? (
          <div
            ref={loadMoreRef}
            className="px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {paginationFetcherState === "idle"
              ? "Load more chats"
              : "Loading more chats..."}
          </div>
        ) : chats.length > 0 ? (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground">
            All chats loaded
          </div>
        ) : null}
      </div>
    </div>
  );
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
  const isInbound = message.direction === "inbound";
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
    return json(
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

  return json(
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

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params["id"];
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const contact_number = normalizePhoneNumber(
    params["contact_number"] || (data["contact_number"] as string),
  );

  const responseData = await sendMessage({
    body: data["body"] as string,
    to: contact_number as string,
    from: data["from"] as string,
    media: data["media"] as string,
    supabase: supabaseClient,
    workspace: workspaceId as string,
    contact_id: data.contact_id as string,
    user: user as unknown as BaseUser,
  });
  if (!params.contact_number) return redirect(contact_number);
  return json({ responseData });
}

export default function ChatsList() {
  const { supabase, workspace } = useOutletContext<WorkspaceContextType>();
  const {
    chats,
    chatsError,
    pagination,
    potentialContacts,
    contact,
    campaigns,
    workspaceNumbers,
    optOutKeywords,
  } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const hideStopConversations = searchParams.get("hide_stop") === "1";
  const messageFetcher = useFetcher({ key: "messages" });
  const paginationFetcher = useFetcher<LoaderData>({ key: "chat-pages" });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatActionsRef = useRef<{
    addOptimisticMessage?: (p: {
      body: string;
      from: string;
      to: string;
      media?: string;
    }) => void;
  } | null>(null);
  const requestedPageRef = useRef(pagination.page);
  const registerChatActions = useCallback(
    (actions: typeof chatActionsRef.current) => {
      chatActionsRef.current = actions;
    },
    [],
  );
  const [dialogContact, setDialog] = useState<Contact | null>(null);
  const [isMobileConversationListOpen, setIsMobileConversationListOpen] =
    useState(false);
  const outlet = useOutlet();
  const navigate = useNavigate();
  const location = useLocation();
  const contact_number = outlet ? location.pathname.split("/").pop() || "" : "";
  const formatDate = formatMessageTimestamp;
  const sortBy = getChatSortOption(searchParams.get("sort"));
  const [loadedChats, setLoadedChats] = useState<ConversationSummary[]>(chats);
  const [paginationState, setPaginationState] = useState(pagination);
  const workspacePhoneKeys = useMemo(
    () => getWorkspacePhoneKeys(workspaceNumbers),
    [workspaceNumbers],
  );
  const chatInputWorkspaceNumbers = useMemo(
    () =>
      workspaceNumbers
        .filter((workspaceNumber): workspaceNumber is RouteWorkspaceNumber =>
          Boolean(workspaceNumber.phone_number),
        )
        .map((workspaceNumber) => ({
          id: String(workspaceNumber.id),
          phone_number: workspaceNumber.phone_number ?? "",
        })),
    [workspaceNumbers],
  );
  const chatsRoutePath = `/workspaces/${workspace.id}/chats`;
  const closeMobileConversationList = useCallback(() => {
    setIsMobileConversationListOpen(false);
  }, []);

  useEffect(() => {
    setLoadedChats(chats);
    setPaginationState(pagination);
    requestedPageRef.current = pagination.page;
  }, [chats, pagination]);

  useEffect(() => {
    if (!paginationFetcher.data) {
      return;
    }

    setLoadedChats((currentChats) =>
      mergeConversationPages(currentChats, paginationFetcher.data?.chats ?? []),
    );
    setPaginationState(paginationFetcher.data.pagination);
    requestedPageRef.current = paginationFetcher.data.pagination.page;
  }, [paginationFetcher.data]);

  const displayedChats = useMemo(() => {
    let list = sortConversationSummaries(loadedChats, sortBy);
    if (hideStopConversations) {
      list = list.filter(
        (chat) =>
          !isOptOutMessage(chat.last_inbound_body ?? null, optOutKeywords),
      );
    }
    return list;
  }, [loadedChats, sortBy, hideStopConversations, optOutKeywords]);

  // Custom hooks for images
  const {
    selectedImages,
    setSelectedImages,
    handleImageSelect,
    handleImageRemove,
  } = useImageHandling(workspace.id);

  // Contact search hook with consolidated functionality
  const {
    selectedContact,
    isContactMenuOpen,
    searchError,
    contacts,
    phoneNumber,
    existingConversation,
    handleSearch: handlePhoneChange,
    toggleContactMenu,
    isValid,
  } = useContactSearch({
    supabase,
    workspace_id: workspace.id,
    contact_number,
    potentialContacts,
    dropdownRef,
    initialContact: contact,
  });

  // Navigate away if phone number is invalid
  useEffect(() => {
    if (contact_number && !phoneRegex.test(contact_number)) {
      navigate(".");
    }
  }, [contact_number, navigate]);

  useSupabaseRealtimeSubscription({
    supabase,
    table: "message",
    filter: `workspace=eq.${workspace.id}`,
    onChange: (payload) => {
      const typedPayload = payload as RealtimePostgresChangesPayload<
        Tables<"message">
      >;
      const selectedCampaignId = searchParams.get("campaign_id");
      const nextRow = typedPayload.new as Tables<"message"> | null;

      if (!nextRow) {
        return;
      }

      if (
        selectedCampaignId &&
        Number(nextRow.campaign_id) !== Number(selectedCampaignId)
      ) {
        return;
      }

      if (typedPayload.eventType === "INSERT") {
        setLoadedChats((currentChats) =>
          upsertConversationFromMessage({
            currentChats,
            message: nextRow,
            activeContactNumber: contact_number,
            workspacePhoneKeys,
          }),
        );
        return;
      }

      if (typedPayload.eventType !== "UPDATE") {
        return;
      }

      if (nextRow.status !== "delivered" && nextRow.status !== "read") {
        return;
      }

      const { contactPhone } = getConversationParticipantPhones(
        {
          from: nextRow.from,
          to: nextRow.to,
          direction: nextRow.direction,
        },
        workspacePhoneKeys,
      );

      if (!contactPhone) {
        return;
      }

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, contactPhone)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );
    },
  });

  const handleLoadMore = useCallback(() => {
    if (paginationFetcher.state !== "idle" || !paginationState.hasMore) {
      return;
    }

    const nextPage = paginationState.page + 1;
    if (requestedPageRef.current >= nextPage) {
      return;
    }

    requestedPageRef.current = nextPage;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("page", String(nextPage));
    nextSearchParams.set("pageSize", String(paginationState.pageSize));
    paginationFetcher.load(`${chatsRoutePath}?${nextSearchParams.toString()}`);
  }, [
    chatsRoutePath,
    paginationFetcher,
    paginationState.hasMore,
    paginationState.page,
    paginationState.pageSize,
    searchParams,
  ]);

  // Form submission handler
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      const toNumber = contact_number || phoneNumber;
      if (!toNumber || messageFetcher.state !== "idle") return;

      const formData = new FormData(target);
      formData.append("media", JSON.stringify(selectedImages));
      const body = (formData.get("body") as string) || "";
      const from =
        (formData.get("from") as string) ||
        workspaceNumbers?.[0]?.phone_number ||
        "";
      const media = formData.get("media") as string | undefined;
      chatActionsRef.current?.addOptimisticMessage?.({
        body,
        from,
        to: toNumber,
        media,
      });

      messageFetcher.submit(formData, { method: "POST" });

      const messageBody =
        target.querySelector<HTMLInputElement>("#body") ||
        target.querySelector<HTMLTextAreaElement>("#body");
      if (messageBody) messageBody.value = "";
      setSelectedImages([]);
    },
    [
      contact_number,
      phoneNumber,
      messageFetcher,
      selectedImages,
      setSelectedImages,
      workspaceNumbers,
    ],
  );

  // Enhanced contact selection handler with read status update
  const handleContactSelect = useCallback(
    (contact: Contact) => {
      const number = normalizePhoneNumber(contact.phone || "");
      if (number) {
        closeMobileConversationList();
        navigate(`./${number}`);
        setLoadedChats((currentChats) =>
          currentChats.map((chat) =>
            phoneNumbersMatch(chat.contact_phone, number)
              ? { ...chat, unread_count: 0 }
              : chat,
          ),
        );

        supabase
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", workspace.id)
          .eq("status", "received")
          .or(`from.eq.${number},to.eq.${number}`)
          .then(
            ({ error }) => {
              if (error) {
                logger.error("Error marking messages as read:", error);
              } else {
                window.dispatchEvent(
                  new CustomEvent("messages-read", {
                    detail: { contactNumber: number },
                  }),
                );
              }
            },
            (err: unknown) =>
              logger.error("Error marking messages as read:", err),
          );
      }
      return null;
    },
    [closeMobileConversationList, navigate, supabase, workspace.id],
  );

  const handleExistingConversationClick = useCallback(
    (phoneNumber: string) => {
      closeMobileConversationList();
      navigate(`./${phoneNumber}`);

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, phoneNumber)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );

      supabase
        .from("message")
        .update({ status: "delivered" })
        .eq("workspace", workspace.id)
        .eq("status", "received")
        .or(`from.eq.${phoneNumber},to.eq.${phoneNumber}`)
        .then(
          ({ error }) => {
            if (error) {
              logger.error("Error marking messages as read:", error);
            } else {
              window.dispatchEvent(
                new CustomEvent("messages-read", {
                  detail: { contactNumber: phoneNumber },
                }),
              );
            }
          },
          (err: unknown) =>
            logger.error("Error marking messages as read:", err),
        );
    },
    [closeMobileConversationList, navigate, supabase, workspace.id],
  );

  // Adapter functions to match ChatHeader's expected types
  // use the handler directly since it already matches the expected signature

  const toggleContactMenuAdapter = useCallback(() => {
    toggleContactMenu();
    return null;
  }, [toggleContactMenu]);

  const handleContactSelectAdapter = useCallback(
    (contact: Contact) => {
      handleContactSelect(contact);
      return null;
    },
    [handleContactSelect],
  );

  const handleExistingConversationClickAdapter = useCallback(
    (phoneNumber: string) => {
      handleExistingConversationClick(phoneNumber);
      return null;
    },
    [handleExistingConversationClick],
  );

  useEffect(() => {
    const handleMessageRead = (event: Event) => {
      const customEvent = event as CustomEvent<{ contactNumber?: string }>;
      const contactNumber = customEvent.detail?.contactNumber;

      if (!contactNumber) {
        return;
      }

      setLoadedChats((currentChats) =>
        currentChats.map((chat) =>
          phoneNumbersMatch(chat.contact_phone, contactNumber)
            ? { ...chat, unread_count: 0 }
            : chat,
        ),
      );
    };

    window.addEventListener("message-read", handleMessageRead);
    window.addEventListener("messages-read", handleMessageRead);

    return () => {
      window.removeEventListener("message-read", handleMessageRead);
      window.removeEventListener("messages-read", handleMessageRead);
    };
  }, []);

  const updateFilters = useCallback(
    (updater: (params: URLSearchParams) => URLSearchParams) => {
      setSearchParams((previousParams) => {
        const nextParams = updater(new URLSearchParams(previousParams));
        nextParams.delete("page");
        return nextParams;
      });
    },
    [setSearchParams],
  );

  const handleNewChatClick = useCallback(() => {
    closeMobileConversationList();
  }, [closeMobileConversationList]);

  return (
    <main className="flex min-h-[68vh] w-full flex-col gap-4 md:flex-row">
      <Card className="hidden min-h-[68vh] flex-col overflow-hidden border-border/80 bg-card/80 md:flex md:max-w-[40%] md:basis-2/5">
        <ConversationSidebar
          campaigns={campaigns}
          chats={displayedChats}
          chatsError={chatsError}
          contactNumber={contact_number}
          formatDate={formatDate}
          handleExistingConversationClick={handleExistingConversationClick}
          hideStopConversations={hideStopConversations}
          onLoadMore={handleLoadMore}
          onNewChatClick={handleNewChatClick}
          optOutKeywords={optOutKeywords}
          paginationError={paginationFetcher.data?.chatsError ?? null}
          paginationFetcherState={paginationFetcher.state}
          paginationState={paginationState}
          searchParams={searchParams}
          sortBy={sortBy}
          updateFilters={updateFilters}
        />
      </Card>

      <Card className="flex min-h-[68vh] w-full min-w-0 flex-1 flex-col overflow-hidden border-border/80 bg-card/80 md:basis-3/5">
        <ChatHeader
          contact={contact}
          outlet={Boolean(outlet)}
          potentialContacts={potentialContacts}
          phoneNumber={phoneNumber}
          contactNumber={contact_number}
          handlePhoneChange={handlePhoneChange}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenuAdapter}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelectAdapter}
          dropdownRef={dropdownRef}
          searchError={searchError || undefined}
          existingConversation={existingConversation as unknown as Chat}
          handleExistingConversationClick={
            handleExistingConversationClickAdapter
          }
          setDialog={(nextContact: Partial<Contact>) =>
            setDialog(nextContact as Contact)
          }
          onShowConversationList={() => setIsMobileConversationListOpen(true)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/30">
          <Outlet
            context={{
              supabase,
              workspace,
              workspaceNumbers,
              registerChatActions,
            }}
          />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace as NonNullable<Workspace>}
          workspaceNumbers={chatInputWorkspaceNumbers}
          initialFrom={chatInputWorkspaceNumbers[0]?.phone_number || ""}
          handleSubmit={handleSubmit}
          handleImageSelect={handleImageSelect}
          handleImageRemove={handleImageRemove}
          selectedImages={selectedImages}
          selectedContact={selectedContact}
          messageFetcher={messageFetcher}
        />
      </Card>
      <Sheet
        open={isMobileConversationListOpen}
        onOpenChange={setIsMobileConversationListOpen}
      >
        <SheetContent side="left" className="w-[88vw] p-0 md:hidden">
          <MobileSheetHeader className="border-b px-4 py-3">
            <SheetTitle>Chats</SheetTitle>
          </MobileSheetHeader>
          <div className="h-[calc(100%-57px)]">
            <ConversationSidebar
              campaigns={campaigns}
              chats={displayedChats}
              chatsError={chatsError}
              contactNumber={contact_number}
              formatDate={formatDate}
              handleExistingConversationClick={handleExistingConversationClick}
              hideStopConversations={hideStopConversations}
              onLoadMore={handleLoadMore}
              onNewChatClick={handleNewChatClick}
              optOutKeywords={optOutKeywords}
              paginationError={paginationFetcher.data?.chatsError ?? null}
              paginationFetcherState={paginationFetcher.state}
              paginationState={paginationState}
              searchParams={searchParams}
              sortBy={sortBy}
              updateFilters={updateFilters}
            />
          </div>
        </SheetContent>
      </Sheet>
      <ChatAddContactDialog
        existingContact={dialogContact}
        isDialogOpen={Boolean(dialogContact?.phone)}
        setDialog={(open: boolean | null) =>
          setDialog(open ? dialogContact : null)
        }
        contact_number={contact_number}
        workspace_id={workspace.id}
      />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  logger.error("Chats route error boundary caught error:", error);
  return <div className="p-4 text-sm text-red-500">Error loading chats.</div>;
}
