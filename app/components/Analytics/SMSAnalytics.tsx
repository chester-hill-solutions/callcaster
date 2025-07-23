import { formatDistanceToNow } from "date-fns";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  MessageSquare,
  User,
  Clock,
  Activity,
  Timer,
  Target,
  CheckCircle,
  XCircle,
  Smartphone,
} from "lucide-react";
import { DataTableWithFilters, type FilterConfig, type FilterValues } from "./DataTableFilters";
import { useMemo } from "react";

// Example SMS data type - you can replace this with your actual SMS type
interface SMSMessage {
  id: string;
  contact: {
    firstname: string | null;
    surname: string | null;
    phone: string | null;
  } | null;
  campaign: {
    title: string;
  } | null;
  user: {
    username: string;
  } | null;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  direction: 'outbound' | 'inbound';
  body: string;
  date_created: string;
  date_sent?: string;
  date_delivered?: string;
}

interface SMSAnalyticsProps {
  messages: SMSMessage[];
  metrics: {
    totalMessages: number;
    deliveredMessages: number;
    failedMessages: number;
    deliveryRate: number;
    averageResponseTime: number;
  };
}

export function SMSAnalytics({
  messages,
  metrics,
}: SMSAnalyticsProps) {
  // Filter configurations for SMS messages
  const smsFilterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Search",
      type: "search",
      placeholder: "Contact, phone, message content...",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
    },
    {
      key: "direction",
      label: "Direction",
      type: "select",
    },
    {
      key: "user",
      label: "User",
      type: "select",
    },
    {
      key: "campaign",
      label: "Campaign",
      type: "select",
    },
    {
      key: "date",
      label: "Date",
      type: "date",
    },
  ];

  const getSMSFilterOptions = (data: SMSMessage[]) => {
    const statuses = [...new Set(data.map(msg => msg.status))] as string[];
    const directions = [...new Set(data.map(msg => msg.direction))] as string[];
    const users = [...new Set(data.map(msg => msg.user?.username).filter(Boolean))] as string[];
    const campaigns = [...new Set(data.map(msg => msg.campaign?.title).filter(Boolean))] as string[];

    return {
      status: statuses,
      direction: directions,
      user: users,
      campaign: campaigns,
    };
  };

  const smsFilterLogic = (message: SMSMessage, filters: FilterValues): boolean => {
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const contactName = `${message.contact?.firstname || ""} ${message.contact?.surname || ""}`.toLowerCase();
      const phone = message.contact?.phone?.toLowerCase() || "";
      const body = message.body.toLowerCase();
      const campaign = message.campaign?.title?.toLowerCase() || "";
      const user = message.user?.username?.toLowerCase() || "";

      if (!contactName.includes(searchTerm) && 
          !phone.includes(searchTerm) && 
          !body.includes(searchTerm) && 
          !campaign.includes(searchTerm) && 
          !user.includes(searchTerm)) {
        return false;
      }
    }

    // Status filter
    if (filters.status && message.status !== filters.status) {
      return false;
    }

    // Direction filter
    if (filters.direction && message.direction !== filters.direction) {
      return false;
    }

    // User filter
    if (filters.user && message.user?.username !== filters.user) {
      return false;
    }

    // Campaign filter
    if (filters.campaign && message.campaign?.title !== filters.campaign) {
      return false;
    }

    // Date filter
    if (filters.date) {
      const messageDate = message.date_created;
      if (messageDate) {
        const messageDateOnly = new Date(messageDate).toISOString().split('T')[0];
        if (messageDateOnly !== filters.date) {
          return false;
        }
      }
    }

    return true;
  };

  // Helper function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge variant="default">Sent</Badge>;
      case "delivered":
        return <Badge variant="default">Delivered</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Helper function to get direction badge
  const getDirectionBadge = (direction: string) => {
    switch (direction) {
      case "outbound":
        return <Badge variant="default">Outbound</Badge>;
      case "inbound":
        return <Badge variant="secondary">Inbound</Badge>;
      default:
        return <Badge variant="secondary">{direction}</Badge>;
    }
  };

  // Helper function to format contact name
  const formatContactName = (
    firstname?: string | null,
    surname?: string | null,
  ) => {
    if (firstname && surname) {
      return `${firstname} ${surname}`;
    }
    return firstname || surname || "Unknown";
  };

  // Helper function to format phone number
  const formatPhoneNumber = (phone?: string | null) => {
    if (!phone) return "No phone";
    return phone;
  };

  // Render function for SMS messages table
  const renderSMSTable = (filteredData: SMSMessage[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <span>SMS Messages</span>
          {filteredData.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {filteredData.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          SMS message activity
          {filteredData.length !== messages.length && (
            <span className="ml-2 text-muted-foreground">
              (filtered from {messages.length} total)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm">
              Delivered: {filteredData.filter(msg => msg.status === 'delivered').length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm">Failed: {filteredData.filter(msg => msg.status === 'failed').length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Smartphone className="h-4 w-4 text-blue-500" />
            <span className="text-sm">
              Outbound: {filteredData.filter(msg => msg.direction === 'outbound').length}
            </span>
          </div>
        </div>

        {filteredData.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>
              {messages.length === 0 
                ? "No SMS messages found" 
                : "No messages match your current filters"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 10).map((message) => (
                <TableRow key={message.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatContactName(
                          message.contact?.firstname,
                          message.contact?.surname,
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatPhoneNumber(message.contact?.phone)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {message.campaign?.title || "No Campaign"}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(message.status)}</TableCell>
                  <TableCell>{getDirectionBadge(message.direction)}</TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate text-sm">
                      {message.body}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {message.user?.username || "Unknown"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {message.date_created ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(message.date_created), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{messages.length}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.deliveredMessages}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.deliveryRate.toFixed(1)}% delivery rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.failedMessages}</div>
            <p className="text-xs text-muted-foreground">
              {(100 - metrics.deliveryRate).toFixed(1)}% failure rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.averageResponseTime.toFixed(1)}s
            </div>
            <p className="text-xs text-muted-foreground">
              Average response time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SMS Messages with Filters */}
      <DataTableWithFilters
        data={messages}
        filterConfigs={smsFilterConfigs}
        getFilterOptions={getSMSFilterOptions}
        customFilterLogic={smsFilterLogic}
        title="SMS Messages Filters"
        renderTable={renderSMSTable}
      />
    </div>
  );
} 