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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import {
  Phone,
  User,
  Clock,
  Info,
  Activity,
  Timer,
  Target,
  Signal,
  CheckCircle,
  XCircle,
  Voicemail,
} from "lucide-react";
import type {
  LiveCallAnalyticsProps,
  Call,
  QuestionAnswer,
  CallStatus,
  AnsweredBy,
} from "~/lib/analytics.types";
import {
  parseQuestionsAndAnswers,
  formatAnswer,
} from "~/lib/analytics.types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { DataTableWithFilters, type FilterConfig, type FilterValues } from "./DataTableFilters";
import TablePagination from "~/components/TablePagination";
import { useMemo } from "react";

export function LiveCallAnalytics({
  liveCalls,
  recentCalls,
  metrics,
  pagination,
  allQuestions: serverAllQuestions,
  onPageChange,
  onPageSizeChange,
}: LiveCallAnalyticsProps) {
  // Filter configurations for live calls
  const liveCallFilterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Search",
      type: "search",
      placeholder: "Contact, phone, campaign...",
    },
    {
      key: "status",
      label: "Status",
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
      key: "answeredBy",
      label: "Answered By",
      type: "select",
    },
    {
      key: "duration",
      label: "Duration",
      type: "duration",
    },
    {
      key: "date",
      label: "Date",
      type: "date",
    },
    {
      key: "question",
      label: "Question",
      type: "select",
    },
    {
      key: "answer",
      label: "Answer",
      type: "search",
      placeholder: "Search answers...",
    },
  ];

  // Filter configurations for recent calls
  const recentCallFilterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Search",
      type: "search",
      placeholder: "Contact, phone, campaign...",
    },
    {
      key: "status",
      label: "Status",
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
      key: "answeredBy",
      label: "Answered By",
      type: "select",
    },
    {
      key: "duration",
      label: "Duration",
      type: "duration",
    },
    {
      key: "date",
      label: "Date",
      type: "date",
    },
    {
      key: "question",
      label: "Question",
      type: "select",
    },
    {
      key: "answer",
      label: "Answer",
      type: "search",
      placeholder: "Search answers...",
    },
  ];

  const getLiveCallFilterOptions = (data: Call[]) => {
    const statuses = [...new Set(data.map(call => call.status).filter(Boolean))] as string[];
    const users = [...new Set(data.map(call => call.outreach_attempt?.user_id?.username).filter(Boolean))] as string[];
    const campaigns = [...new Set(data.map(call => call.campaign?.title).filter(Boolean))] as string[];
    const answeredBy = [...new Set(data.map(call => call.answered_by).filter(Boolean))] as string[];

    // Get all unique questions from the data
    const allQuestions = new Set<string>();
    data.forEach(call => {
      const callQuestions = parseQuestionsAndAnswers(call);
      callQuestions.forEach(q => {
        // Only add questions that have actual content and aren't just IDs
        if (q.question && !q.question.startsWith('page_') && !q.question.startsWith('block_')) {
          allQuestions.add(q.question);
        }
      });
    });

    return {
      status: statuses,
      user: users,
      campaign: campaigns,
      answeredBy: answeredBy,
      question: Array.from(allQuestions),
    };
  };

  const getRecentCallFilterOptions = (data: Call[]) => {
    const statuses = [...new Set(data.map(call => call.status).filter(Boolean))] as string[];
    const users = [...new Set(data.map(call => call.outreach_attempt?.user_id?.username).filter(Boolean))] as string[];
    const campaigns = [...new Set(data.map(call => call.campaign?.title).filter(Boolean))] as string[];
    const answeredBy = [...new Set(data.map(call => call.answered_by).filter(Boolean))] as string[];

    // Get all unique questions from the data
    const allQuestions = new Set<string>();
    data.forEach(call => {
      const callQuestions = parseQuestionsAndAnswers(call);
      callQuestions.forEach(q => {
        // Only add questions that have actual content and aren't just IDs
        if (q.question && !q.question.startsWith('page_') && !q.question.startsWith('block_')) {
          allQuestions.add(q.question);
        }
      });
    });

    return {
      status: statuses,
      user: users,
      campaign: campaigns,
      answeredBy: answeredBy,
      question: Array.from(allQuestions),
    };
  };

  const callFilterLogic = (call: Call, filters: FilterValues): boolean => {
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const contactName = `${call.contact?.firstname || ""} ${call.contact?.surname || ""}`.toLowerCase();
      const phone = call.contact?.phone?.toLowerCase() || "";
      const campaign = call.campaign?.title?.toLowerCase() || "";
      const user = call.outreach_attempt?.user_id?.username?.toLowerCase() || "";

      if (!contactName.includes(searchTerm) && 
          !phone.includes(searchTerm) && 
          !campaign.includes(searchTerm) && 
          !user.includes(searchTerm)) {
        return false;
      }
    }

    // Status filter
    if (filters.status && call.status !== filters.status) {
      return false;
    }

    // User filter
    if (filters.user && call.outreach_attempt?.user_id?.username !== filters.user) {
      return false;
    }

    // Campaign filter
    if (filters.campaign && call.campaign?.title !== filters.campaign) {
      return false;
    }

    // Answered by filter
    if (filters.answeredBy && call.answered_by !== filters.answeredBy) {
      return false;
    }

    // Duration filter
    if (filters.duration_min || filters.duration_max) {
      const duration = call.call_duration || 0;
      const min = filters.duration_min ? parseInt(filters.duration_min) : 0;
      const max = filters.duration_max ? parseInt(filters.duration_max) : Infinity;
      
      if (duration < min || duration > max) {
        return false;
      }
    }

    // Date filter
    if (filters.date) {
      const callDate = call.date_created;
      if (callDate) {
        const callDateOnly = new Date(callDate).toISOString().split('T')[0];
        if (callDateOnly !== filters.date) {
          return false;
        }
      }
    }

    // Question filter
    if (filters.question) {
      const callQuestions = parseQuestionsAndAnswers(call);
      const hasQuestion = callQuestions.some(q => q.question === filters.question);
      if (!hasQuestion) {
        return false;
      }
    }

    // Answer filter
    if (filters.answer) {
      const searchTerm = filters.answer.toLowerCase();
      const callQuestions = parseQuestionsAndAnswers(call);
      const hasMatchingAnswer = callQuestions.some(q => {
        const answerText = formatAnswer(q.answer, q.questionType).toLowerCase();
        return answerText.includes(searchTerm);
      });
      if (!hasMatchingAnswer) {
        return false;
      }
    }

    return true;
  };

  // Get all unique questions from calls
  const getAllQuestions = () => {
    // If server provided all questions, use those for consistent column headers
    if (serverAllQuestions && serverAllQuestions.length > 0) {
      return serverAllQuestions;
    }
    
    // Fallback to extracting questions from current data
    const allQuestions = new Set<string>();
    
    // For live calls, we can use all data since it's not paginated
    liveCalls.forEach(call => {
      const callQuestions = parseQuestionsAndAnswers(call);
      callQuestions.forEach(q => {
        // Only add questions that have actual content and aren't just IDs
        if (q.question && !q.question.startsWith('page_') && !q.question.startsWith('block_')) {
          allQuestions.add(q.question);
        }
      });
    });
    
    // For recent calls, we only have the current page data due to server-side pagination
    // So we'll only show questions that exist in the current page
    // Note: This means question columns may vary between pages
    recentCalls.forEach(call => {
      const callQuestions = parseQuestionsAndAnswers(call);
      callQuestions.forEach(q => {
        // Only add questions that have actual content and aren't just IDs
        if (q.question && !q.question.startsWith('page_') && !q.question.startsWith('block_')) {
          allQuestions.add(q.question);
        }
      });
    });
    
    return Array.from(allQuestions);
  };

  const questions: string[] = getAllQuestions() || [];

  // Helper function to get answer for a specific question
  const getAnswerForQuestion = (call: Call, questionKey: string) => {
    try {
      const callQuestions = parseQuestionsAndAnswers(call);
      const question = callQuestions.find(q => q.question === questionKey);
      return question ? formatAnswer(question.answer, question.questionType) : "-";
    } catch (error) {
      console.error('Error getting answer for question:', error);
      return "-";
    }
  };



  // Helper function to get status badge
  const getStatusBadge = (status: CallStatus | null | undefined) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;

    switch (status) {
      case "queued":
        return <Badge variant="secondary">Queued</Badge>;
      case "ringing":
        return <Badge variant="default">Ringing</Badge>;
      case "in-progress":
        return <Badge variant="default">In Progress</Badge>;
      case "completed":
        return <Badge variant="default">Completed</Badge>;
      case "busy":
        return <Badge variant="destructive">Busy</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "no-answer":
        return <Badge variant="destructive">No Answer</Badge>;
      case "canceled":
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Helper function to get disposition badge
  const getDispositionBadge = (disposition?: string | null) => {
    if (!disposition) return <Badge variant="secondary">Unknown</Badge>;

    // Handle case where disposition might be an object
    const dispositionStr = typeof disposition === 'string' ? disposition : String(disposition);

    switch (dispositionStr.toLowerCase()) {
      case "answered":
        return <Badge variant="default">Answered</Badge>;
      case "no-answer":
        return <Badge variant="destructive">No Answer</Badge>;
      case "busy":
        return <Badge variant="destructive">Busy</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "voicemail":
        return <Badge variant="secondary">Voicemail</Badge>;
      case "hangup":
        return <Badge variant="secondary">Hangup</Badge>;
      case "completed":
        return <Badge variant="default">Completed</Badge>;
      default:
        return <Badge variant="secondary">{dispositionStr}</Badge>;
    }
  };

  // Helper function to get answered by badge
  const getAnsweredByBadge = (answeredBy?: AnsweredBy | null) => {
    if (!answeredBy) return <Badge variant="secondary">Unknown</Badge>;

    switch (answeredBy) {
      case "human":
        return <Badge variant="default">Human</Badge>;
      case "machine":
        return <Badge variant="secondary">Machine</Badge>;
      case "unknown":
        return <Badge variant="secondary">Unknown</Badge>;
      default:
        return <Badge variant="secondary">{answeredBy}</Badge>;
    }
  };

  // Helper function to format duration
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "-";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Helper function to calculate connected time
  const calculateConnectedTime = (
    answeredAt?: string | null,
    endedAt?: string | null,
  ) => {
    if (!answeredAt || !endedAt) return 0;
    const answered = new Date(answeredAt).getTime();
    const ended = new Date(endedAt).getTime();
    return Math.floor((ended - answered) / 1000);
  };

  // Helper function to get connected time display
  const getConnectedTimeDisplay = (
    answeredAt?: string | null,
    endedAt?: string | null,
  ) => {
    const connectedTime = calculateConnectedTime(answeredAt, endedAt);
    if (connectedTime === 0) return "-";
    return formatDuration(connectedTime);
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

  // Helper function to get connected time
  const getConnectedTime = (call: Call): number => {
    if (!call.outreach_attempt?.answered_at || !call.outreach_attempt?.ended_at) {
      return 0;
    }
    const answered = new Date(call.outreach_attempt.answered_at).getTime();
    const ended = new Date(call.outreach_attempt.ended_at).getTime();
    return Math.floor((ended - answered) / 1000);
  };

  // Render function for live calls table
  const renderLiveCallsTable = (filteredData: Call[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Signal className="h-5 w-5" />
          <span>Live Calls</span>
          {filteredData.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {filteredData.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Currently active calls in your workspace
          {filteredData.length !== liveCalls.length && (
            <span className="ml-2 text-muted-foreground">
              (filtered from {liveCalls.length} total)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {filteredData.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Phone className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>
              {liveCalls.length === 0 
                ? "No active calls at the moment" 
                : "No calls match your current filters"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Call Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Answered By</TableHead>
                <TableHead>Total Duration</TableHead>
                <TableHead>Connected Time</TableHead>
                <TableHead>Started</TableHead>
                {questions.map((q, index) => (
                  <TableHead key={index} className="max-w-32">
                    <div
                      className="truncate text-xs font-medium"
                      title={q}
                    >
                      {q}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((call) => {
                const callQuestions = parseQuestionsAndAnswers(call);
                const hasQuestions = callQuestions.length > 0;

                return (
                  <TableRow key={call.sid}>
                    <TableCell>
                      <span className="font-medium">
                        {call.outreach_attempt?.user_id?.username ||
                          "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {call.contact?.firstname && call.contact?.surname
                          ? `${call.contact.firstname} ${call.contact.surname}`
                          : call.contact?.firstname ||
                            call.contact?.surname ||
                            "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {call.contact?.phone || "No phone"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {call.campaign?.title || "Unknown Campaign"}
                      </span>
                    </TableCell>
                    <TableCell>{getStatusBadge(call.status)}</TableCell>
                    <TableCell>
                      {getDispositionBadge(call.outreach_attempt?.disposition)}
                    </TableCell>
                    <TableCell>
                      {getAnsweredByBadge(call.answered_by)}
                    </TableCell>
                    <TableCell>
                      {call.call_duration ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor((call.call_duration || 0) / 60)}:
                          {(call.call_duration || 0) % 60 < 10 ? "0" : ""}
                          {(call.call_duration || 0) % 60}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {call.outreach_attempt?.answered_at &&
                      call.outreach_attempt?.ended_at ? (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {Math.floor(getConnectedTime(call) / 60)}:
                          {getConnectedTime(call) % 60 < 10 ? "0" : ""}
                          {getConnectedTime(call) % 60}
                        </span>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-muted-foreground">-</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Not connected</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell>
                      {call.date_created ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(call.date_created), {
                            addSuffix: true,
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {questions.map((question, index) => (
                      <TableCell key={`question-${index}-${question}`} className="max-w-32">
                        <div className="truncate text-xs">
                          {getAnswerForQuestion(call, question)}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  // Render function for recent calls table
  const renderRecentCallsTable = (filteredData: Call[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <span>Recent Calls</span>
          {filteredData.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {filteredData.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {pagination ? (
            <span className="text-muted-foreground">
              Showing {filteredData.length} of {pagination.totalCalls} total calls
            </span>
          ) : (
            filteredData.length !== recentCalls.length && (
              <span className="text-muted-foreground">
                (filtered from {recentCalls.length} total)
              </span>
            )
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm">
              Completed: {filteredData.filter(call => call.status === 'completed').length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm">Failed: {filteredData.filter(call => call.status === 'failed').length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Voicemail className="h-4 w-4 text-orange-500" />
            <span className="text-sm">
              Voicemail: {filteredData.filter(call => call.outreach_attempt?.disposition === 'voicemail').length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-blue-500" />
            <span className="text-sm">
              Human Answered:{" "}
              {
                filteredData.filter((call) => call.answered_by === "human")
                  .length
              }
            </span>
          </div>
        </div>

        {filteredData.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>
              {pagination && pagination.totalCalls === 0
                ? "No recent calls found" 
                : "No calls match your current filters"}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Call Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Answered By</TableHead>
                  <TableHead>Total Duration</TableHead>
                  <TableHead>Connected Time</TableHead>
                  <TableHead>Started</TableHead>
                  {questions.map((q, index) => (
                    <TableHead key={index} className="max-w-32">
                      <div
                        className="truncate text-xs font-medium"
                        title={q}
                      >
                        {q}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((call) => {
                  return (
                    <TableRow key={call.sid}>
                      <TableCell className="font-medium">
                        {call.outreach_attempt?.user_id?.username ||
                          "Unknown"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatContactName(
                          call.contact?.firstname,
                          call.contact?.surname,
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatPhoneNumber(call.contact?.phone)}
                      </TableCell>
                      <TableCell>
                        {call.campaign?.title || "Unknown"}
                      </TableCell>
                      <TableCell>{getStatusBadge(call.status)}</TableCell>
                      <TableCell>
                        {getDispositionBadge(
                          call.outreach_attempt?.disposition,
                        )}
                      </TableCell>
                      <TableCell>
                        {getAnsweredByBadge(call.answered_by)}
                      </TableCell>
                      <TableCell>
                        {call.call_duration
                          ? formatDuration(call.call_duration)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {call.outreach_attempt?.answered_at &&
                        call.outreach_attempt?.ended_at ? (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {Math.floor(getConnectedTime(call) / 60)}:
                            {getConnectedTime(call) % 60 < 10 ? "0" : ""}
                            {getConnectedTime(call) % 60}
                          </span>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-muted-foreground">-</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Not connected</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {call.date_created ? (
                          <span>
                            {formatDistanceToNow(new Date(call.date_created), {
                              addSuffix: true,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {questions.map((question, index) => (
                        <TableCell key={`question-${index}-${question}`} className="max-w-32">
                          <div className="truncate text-xs">
                            {getAnswerForQuestion(call, question)}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            {pagination && onPageChange && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">Show:</span>
                  <Select
                    value={pagination.pageSize.toString()}
                    onValueChange={(value) => onPageSizeChange?.(parseInt(value))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">per page</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">
                    Page {pagination.currentPage} of {pagination.totalPages}
                  </span>
                  <TablePagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={onPageChange}
                  />
                </div>
              </div>
            )}
          </>
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
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveCalls.length}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentCalls.length}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.completionRate.toFixed(1)}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Human Answered</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {
                recentCalls.filter((call) => call.answered_by === "human")
                  .length
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {recentCalls.length > 0
                ? (
                    (recentCalls.filter((call) => call.answered_by === "human")
                      .length /
                      recentCalls.length) *
                    100
                  ).toFixed(1)
                : "0"}% of recent calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.averageCallDuration.toFixed(1)}s
            </div>
            <p className="text-xs text-muted-foreground">
              Average call duration
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Calls with Filters */}
      <DataTableWithFilters
        data={liveCalls}
        filterConfigs={liveCallFilterConfigs}
        getFilterOptions={getLiveCallFilterOptions}
        customFilterLogic={callFilterLogic}
        title="Live Calls Filters"
        renderTable={renderLiveCallsTable}
      />

      {/* Recent Calls with Filters */}
      <DataTableWithFilters
        data={recentCalls}
        filterConfigs={recentCallFilterConfigs}
        getFilterOptions={getRecentCallFilterOptions}
        customFilterLogic={callFilterLogic}
        title="Recent Calls Filters"
        renderTable={renderRecentCallsTable}
        disableClientSideFiltering={true}
      />
    </div>
  );
}
