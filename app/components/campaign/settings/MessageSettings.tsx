import { MdAddAPhoto , MdTag } from "react-icons/md";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { estimateMessageCredits } from "@/lib/pricing";
import { useFetcherOnIdle } from "@/hooks/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert } from "@/components/ui/alert";

// Helper function to generate survey links
// const generateSurveyLink = (contactId: number, surveyId: string, baseUrl: string = window.location.origin) => {
//   const encoded = btoa(`${contactId}:${surveyId}`);
//   return `${baseUrl}/?q=${encoded}`;
// };

// Available template tags based on contact fields
const TEMPLATE_TAGS = [
    { key: '{{firstname}}', label: 'First Name', description: 'Contact\'s first name' },
    { key: '{{surname}}', label: 'Last Name', description: 'Contact\'s last name' },
    { key: '{{fullname}}', label: 'Full Name', description: 'Contact\'s full name' },
    { key: '{{phone}}', label: 'Phone', description: 'Contact\'s phone number' },
    { key: '{{email}}', label: 'Email', description: 'Contact\'s email address' },
    { key: '{{address}}', label: 'Address', description: 'Contact\'s street address' },
    { key: '{{city}}', label: 'City', description: 'Contact\'s city' },
    { key: '{{province}}', label: 'Province/State', description: 'Contact\'s province or state' },
    { key: '{{postal}}', label: 'Postal Code', description: 'Contact\'s postal code' },
    { key: '{{country}}', label: 'Country', description: 'Contact\'s country' },
    { key: '{{external_id}}', label: 'External ID', description: 'Contact\'s external ID' },
    { key: '{{contact_id}}', label: 'Contact ID', description: 'Contact\'s unique ID for survey links' },
];

// Function-style template examples

interface CampaignDetails {
  body_text?: string | null;
  workspace: string;
  campaign_id: number | null;
  message_media?: string[] | null;
}

interface Survey {
  survey_id: string;
  title: string;
}

interface MessageSettingsProps {
  mediaLinks: string[];
  details: CampaignDetails;
  onChange: (field: string, value: unknown) => void;
  surveys: Survey[];
}

type MessageMediaActionData = {
  success?: boolean;
  error?: { message?: string } | string | null;
  campaignUpdate?: Array<{ message_media?: string[] | null }>;
  uploadedFileName?: string;
  removedFileName?: string;
  url?: string;
};

function getErrorMessage(error: MessageMediaActionData["error"]) {
  if (!error) return null;
  return "Message media could not be updated";
}

export const MessageSettings = ({ mediaLinks, details, onChange, surveys }: MessageSettingsProps) => {
    const displayText = details?.body_text || '';
    const [eraseVisible, setEraseVisible] = useState<Record<string, boolean>>({});
    const [tagsMenuOpen, setTagsMenuOpen] = useState(false);
    const [resolvedMediaLinks, setResolvedMediaLinks] = useState<string[]>(mediaLinks);
    const [prevMediaLinks, setPrevMediaLinks] = useState(mediaLinks);
    if (prevMediaLinks !== mediaLinks) {
        setPrevMediaLinks(mediaLinks);
        setResolvedMediaLinks(mediaLinks);
    }
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mediaFetcher = useFetcher<MessageMediaActionData>();
    const segmentInfo = getSmsSegmentInfo(displayText);
    const hasMedia = resolvedMediaLinks.length > 0;
    const creditEstimate = estimateMessageCredits({ body: displayText, hasMedia });
    const FUNCTION_EXAMPLES = [
        {
            label: 'Base64 encode phone and external ID',
            example: 'btoa({{phone}}:{{external_id}})',
            description: 'Base64 encode a combination of tags and text.'
        },
        {
            label: 'Base64 encode email with fallback',
            example: 'btoa({{email|"support@example.com"}})',
            description: 'Encode email, or fallback if missing.'
        },
        {
            label: 'Base64 encode greeting',
            example: 'btoa(Hello {{firstname|"there"}})',
            description: 'Encode a greeting with a fallback.'
        },
        ...(Array.isArray(surveys) && surveys.length > 0
            ? surveys.map(survey => ({
                label: `Generate survey link for ${survey.title}`,
                example: `survey({{contact_id}}, "${survey.survey_id}")`,
                description: `Generate a personalized survey link for the contact. Click to insert the complete function.`,
                surveyId: survey.survey_id,
                surveyTitle: survey.title
            }))
            : []
        )
    ];


    useFetcherOnIdle(mediaFetcher, (data) => {
        if (!data?.success) return;

        const nextMedia = data.campaignUpdate?.[0]?.message_media;
        if (Array.isArray(nextMedia)) {
            onChange("message_media", nextMedia);
        }

        if (data.uploadedFileName && data.url) {
            setResolvedMediaLinks((current) => [...current, data.url as string]);
            return;
        }

        if (data.removedFileName) {
            const currentMedia = details.message_media ?? [];
            const removedIndex = currentMedia.findIndex(
                (mediaName) => mediaName === data.removedFileName,
            );
            if (removedIndex >= 0) {
                setResolvedMediaLinks((current) => current.filter((_, index) => index !== removedIndex));
            }
        }
    });
    const showErase = (imageId: string) => {
        setEraseVisible((prevState) => ({
            ...prevState,
            [imageId]: true,
        }));
    };

    const hideErase = (imageId: string) => {
        setEraseVisible((prevState) => ({
            ...prevState,
            [imageId]: false,
        }));
    };

    const removeImage = (imageId: string) => {
        const formData = new FormData();
        formData.append("fileName", imageId);
        formData.append("workspaceId", details.workspace);
        formData.append("campaignId", String(details.campaign_id ?? ""));
        mediaFetcher.submit(formData, {
            method: "DELETE",
            action: "/api/message_media",
        });
    };

    const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("image", file);
        formData.append("workspaceId", details.workspace);
        formData.append("fileName", file.name);
        formData.append("campaignId", String(details.campaign_id ?? ""));
        mediaFetcher.submit(formData, {
            method: "POST",
            encType: "multipart/form-data",
            action: "/api/message_media",
        });
    };

    const insertTemplateTag = (tag: string) => {
        if (!textareaRef.current) return;

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = displayText;

        const newText = currentText.substring(0, start) + tag + currentText.substring(end);

        // Update the parent component
        onChange("body_text", newText);

        // Set cursor position after the inserted tag
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 0);

        setTagsMenuOpen(false);
    };

    const insertFunctionExample = (example: string) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = displayText;
        const newText = currentText.substring(0, start) + example + currentText.substring(end);
        onChange("body_text", newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + example.length, start + example.length);
        }, 0);
        setTagsMenuOpen(false);
    };

    const insertSurveyFunction = (surveyId: string, _surveyTitle: string) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = displayText;
        const surveyFunction = `survey({{contact_id}}, "${surveyId}")`;
        const newText = currentText.substring(0, start) + surveyFunction + currentText.substring(end);
        onChange("body_text", newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + surveyFunction.length, start + surveyFunction.length);
        }, 0);
        setTagsMenuOpen(false);
    };

    const renderMediaContent = () => {
        if (!details.message_media || !resolvedMediaLinks.length) return null;

        return (
            <div className="flex flex-wrap justify-between">
                {resolvedMediaLinks.map((img, i) => {
                    const imageId = details.message_media?.[i];
                    return (
                        <div
                            key={imageId ?? i}
                            className="relative mb-2 rounded-lg"
                            style={{ width: "45%" }}
                            onMouseEnter={() => imageId && showErase(imageId)}
                            onMouseLeave={() => imageId && hideErase(imageId)}
                        >
                            <img
                                id={imageId ?? String(i)}
                                src={img}
                                alt={`Campaign media ${i + 1}`}
                                className="w-full rounded-lg"
                            />
                            {imageId && eraseVisible[imageId] && (
                                <button
                                    className="absolute right-2 top-2 rounded-md bg-foreground/70 px-2 py-4 text-background"
                                    onClick={() => removeImage(imageId)}
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleBodyTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange("body_text", event.target.value);
    };

    return (
        (<div className="flex flex-col items-center">
            <div className="my-1 flex flex-col gap-2 px-2">
                <div className="m-4 flex flex-1 justify-end">
                    <div className="h-[40px]"></div>
                </div>
            </div>
            <h3 className="text-2xl font-semibold">Your Campaign Message.</h3>
            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg border bg-secondary/40 p-4">
                <div className="flex flex-col">
                        {renderMediaContent()}
                        <div>
                            <div className="text-sm leading-snug text-muted-foreground">
                                <textarea
                                    ref={textareaRef}
                                    name="body_text"
                                    className="h-fit w-full cursor-text resize-none rounded-md border-none bg-background pb-2 pl-4 pr-4 pt-2 text-foreground caret-foreground outline-none"
                                    rows={5}
                                    value={displayText}
                                    onChange={handleBodyTextChange}
                                />
                            </div>
                            <div className="flex justify-end my-2">
                            </div>
                        </div>
                        {getErrorMessage(mediaFetcher.data?.error) && (
                            <Alert variant="destructive">
                                {getErrorMessage(mediaFetcher.data?.error)}
                            </Alert>
                        )}
                        {mediaFetcher.data?.success && mediaFetcher.state === "idle" && (
                            <Alert variant="success" role="status">
                                {mediaFetcher.data.uploadedFileName
                                    ? "Media uploaded."
                                    : mediaFetcher.data.removedFileName
                                        ? "Media removed."
                                        : "Media updated."}
                            </Alert>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="text-sm leading-snug text-muted-foreground">
                                <div>
                                    {segmentInfo.unitsUsedInCurrentSegment} / {segmentInfo.unitsPerSegment}{" "}
                                    {segmentInfo.encoding === "GSM-7" ? "units" : "characters"} used
                                </div>
                                <div>
                                    {segmentInfo.segmentCount} segment
                                    {segmentInfo.segmentCount !== 1 && 's'} ({segmentInfo.encoding})
                                </div>
                                <div>
                                    {segmentInfo.totalCharacters} visible character
                                    {segmentInfo.totalCharacters !== 1 && 's'}
                                </div>
                                <div className="font-medium text-foreground">
                                    ≈ {creditEstimate.credits} credit
                                    {creditEstimate.credits !== 1 && 's'} per recipient
                                    {creditEstimate.isMms ? " (MMS)" : ""}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Popover open={tagsMenuOpen} onOpenChange={setTagsMenuOpen}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
                                            title="Insert template tags"
                                        >
                                            <MdTag size={20} />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        side="top"
                                        align="end"
                                        className="w-80 max-h-96 overflow-y-auto p-0"
                                    >
                                        <div className="border-b border-border p-2">
                                            <h4 className="text-sm font-semibold text-foreground">Template Tags</h4>
                                            <p className="mb-1 text-xs text-muted-foreground">
                                                Click to insert contact field placeholders.
                                            </p>
                                            <p className="mb-1 text-xs text-muted-foreground">
                                                You can combine tags, text, and functions. Try{" "}
                                                <span className="font-mono">
                                                    btoa(&#123;&#123;phone&#125;&#125;:&#123;&#123;external_id&#125;&#125;)
                                                </span>{" "}
                                                or{" "}
                                                <span className="font-mono">
                                                    survey(&#123;&#123;contact_id&#125;&#125;, &quot;survey-name&quot;)
                                                </span>
                                                !
                                            </p>
                                        </div>
                                        <div className="p-1">
                                            {TEMPLATE_TAGS.map((tag) => (
                                                <button
                                                    key={tag.key}
                                                    type="button"
                                                    onClick={() => insertTemplateTag(tag.key)}
                                                    className="w-full rounded p-2 text-left text-sm transition-colors hover:bg-muted"
                                                >
                                                    <div className="font-mono text-primary">{tag.key}</div>
                                                    <div className="text-foreground">{tag.label}</div>
                                                    <div className="text-xs text-muted-foreground">{tag.description}</div>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="mt-2 border-t border-border px-2 pt-2">
                                            <div className="mb-1 text-xs font-semibold text-foreground">
                                                Function Examples
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {FUNCTION_EXAMPLES.map((ex) => (
                                                    <button
                                                        key={ex.example}
                                                        type="button"
                                                        onClick={() => {
                                                            if ("surveyId" in ex) {
                                                                insertSurveyFunction(
                                                                    (ex as { surveyId: string }).surveyId,
                                                                    (ex as { surveyTitle?: string }).surveyTitle || "",
                                                                );
                                                            } else {
                                                                insertFunctionExample(ex.example);
                                                            }
                                                        }}
                                                        className="mb-1 w-full rounded border border-secondary/60 p-2 text-left text-xs transition-colors hover:bg-secondary/40"
                                                    >
                                                        <div className="font-mono text-primary">{ex.example}</div>
                                                        <div className="text-foreground">{ex.label}</div>
                                                        <div className="text-muted-foreground">{ex.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-2 text-xs text-muted-foreground">
                                                <span className="font-semibold">Tip:</span> You can use{" "}
                                                <span className="font-mono">btoa(...)</span> to base64-encode any
                                                combination of tags and text, or{" "}
                                                <span className="font-mono">survey(...)</span> to generate
                                                personalized survey links.
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                <label htmlFor="add-image" className="cursor-pointer text-muted-foreground">
                                    <MdAddAPhoto size={24} />
                                </label>
                                <input
                                    type="file"
                                    name="image"
                                    id="add-image"
                                    hidden
                                    onChange={handleAddMedia}
                                    disabled={mediaFetcher.state !== "idle"}
                                />
                            </div>
                        </div>
                        {mediaFetcher.state !== "idle" && (
                            <div className="text-xs text-muted-foreground">
                                Updating media...
                            </div>
                        )}

                        {/* Template Tags Preview */}
                        {displayText && (
                            (() => {
                                // Find all template tags in the text (including fallbacks)
                                const foundTags: Array<{ key: string; label: string }> = [];

                                // Check for simple tags
                                TEMPLATE_TAGS.forEach(tag => {
                                    if (displayText.includes(tag.key)) {
                                        foundTags.push({ key: tag.key, label: tag.label });
                                    }
                                });

                                // Check for fallback patterns
                                const fallbackRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\|\s*"[^"]+"\s*\}\}/g;
                                const fallbackMatches = displayText.match(fallbackRegex);
                                if (fallbackMatches) {
                                    fallbackMatches.forEach(match => {
                                        const fieldMatch = match.match(/\{\{\s*([a-zA-Z0-9_]+)/);
                                        if (fieldMatch) {
                                            const fieldName = fieldMatch[1];
                                            const tag = TEMPLATE_TAGS.find(t => t.key === `{{${fieldName}}}`);
                                            if (tag && !foundTags.some(ft => ft.key === tag.key)) {
                                                foundTags.push({ key: match, label: `${tag.label} (with fallback)` });
                                            }
                                        }
                                    });
                                }

                                // Check for btoa function patterns
                                const btoaRegex = /btoa\([^)]+\)/g;
                                const btoaMatches = displayText.match(btoaRegex);
                                if (btoaMatches) {
                                    btoaMatches.forEach(match => {
                                        if (!foundTags.some(ft => ft.key === match)) {
                                            foundTags.push({ key: match, label: 'Base64 function' });
                                        }
                                    });
                                }

                                // Check for survey function patterns
                                const surveyRegex = /survey\([^)]+\)/g;
                                const surveyMatches = displayText.match(surveyRegex);
                                if (surveyMatches) {
                                    surveyMatches.forEach(match => {
                                        if (!foundTags.some(ft => ft.key === match)) {
                                            foundTags.push({ key: match, label: 'Survey link function' });
                                        }
                                    });
                                }

                                return foundTags.length > 0 ? (
                                    <div className="mt-3 p-2 bg-secondary/30 rounded border border-secondary/60">
                                        <div className="text-xs font-semibold text-foreground mb-1">Template Tags Found:</div>
                                        <div className="text-xs text-muted-foreground">
                                            {foundTags.map((tag, index) => (
                                                <span key={index} className="inline-block mr-2 mb-1 px-2 py-1 bg-secondary/60 rounded">
                                                    {tag.key} → {tag.label}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-xs text-success mt-2">
                                            <span className="font-semibold">💡 Tip:</span> Survey links will be automatically generated when messages are sent!
                                        </div>
                                        {/* Survey Link Preview */}
                                        {(() => {
                                            const surveyMatches = displayText.match(/survey\([^)]+\)/g);
                                            if (surveyMatches) {
                                                return (
                                                    (<div className="mt-3 p-2 bg-success/10 rounded border border-success/30">
                                                        <div className="text-xs font-semibold text-success mb-1">Survey Links Preview:</div>
                                                        <div className="text-xs text-success space-y-1">
                                                            {surveyMatches.map((match, index) => {
                                                                // Extract survey ID from the function
                                                                const surveyIdMatch = match.match(/survey\([^,]+,\s*"([^"]+)"/);
                                                                const surveyId = surveyIdMatch ? surveyIdMatch[1] : 'unknown';
                                                                const previewLink = `${window.location.origin}/?q=btoa(contact_id:${surveyId})`;
                                                                
                                                                return (
                                                                    <div key={index} className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs bg-success/20 px-1 rounded">
                                                                            {match}
                                                                        </span>
                                                                        <span>→</span>
                                                                        <span className="text-xs text-success">
                                                                            {previewLink}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>)
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                ) : null;
                            })()
                        )}
                    </div>
            </div>
        </div>)
    );
}