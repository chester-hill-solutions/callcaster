import { MdAddAPhoto , MdTag } from "react-icons/md";
import { useRef, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { getSmsSegmentInfo } from "@/lib/sms-segments";

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
  return typeof error === "string" ? error : error.message ?? "Message media could not be updated";
}

function messageSettingsInstanceKey(details: CampaignDetails) {
    return `${details.workspace}-${String(details.campaign_id ?? "")}`;
}

export const MessageSettings = (props: MessageSettingsProps) => (
    <MessageSettingsInner key={messageSettingsInstanceKey(props.details)} {...props} />
);

function MessageSettingsInner({ mediaLinks, details, onChange, surveys }: MessageSettingsProps) {
    const [displayText, setDisplayText] = useState(details?.body_text || '');
    const [eraseVisible, setEraseVisible] = useState<Record<string, boolean>>({});
    const [showTemplateTags, setShowTemplateTags] = useState(false);
    const [resolvedMediaLinks, setResolvedMediaLinks] = useState<string[]>(mediaLinks);
    const serverBodyText = details?.body_text || "";
    const [prevServerBodyText, setPrevServerBodyText] = useState(serverBodyText);
    if (serverBodyText !== prevServerBodyText) {
        setPrevServerBodyText(serverBodyText);
        setDisplayText(serverBodyText);
    }
    const mediaLinksKey = JSON.stringify(mediaLinks);
    const [prevMediaLinksKey, setPrevMediaLinksKey] = useState(mediaLinksKey);
    if (mediaLinksKey !== prevMediaLinksKey) {
        setPrevMediaLinksKey(mediaLinksKey);
        setResolvedMediaLinks(mediaLinks);
    }
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mediaFetcher = useFetcher<MessageMediaActionData>();
    const segmentInfo = getSmsSegmentInfo(displayText);
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

    useEffect(() => {
        if (mediaFetcher.state !== "idle" || !mediaFetcher.data?.success) {
            return;
        }

        const nextMedia = mediaFetcher.data.campaignUpdate?.[0]?.message_media;
        if (Array.isArray(nextMedia)) {
            onChange("message_media", nextMedia);
        }

        if (mediaFetcher.data.uploadedFileName && mediaFetcher.data.url) {
            setResolvedMediaLinks((current) => [...current, mediaFetcher.data?.url as string]);
            return;
        }

        if (mediaFetcher.data.removedFileName) {
            const currentMedia = details.message_media ?? [];
            const removedIndex = currentMedia.findIndex(
                (mediaName) => mediaName === mediaFetcher.data?.removedFileName,
            );
            if (removedIndex >= 0) {
                setResolvedMediaLinks((current) => current.filter((_, index) => index !== removedIndex));
            }
        }
    }, [details.message_media, mediaFetcher.data, mediaFetcher.state, onChange]);
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
        setDisplayText(newText);

        // Update the parent component
        onChange("body_text", newText);

        // Set cursor position after the inserted tag
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 0);

        setShowTemplateTags(false);
    };

    const insertFunctionExample = (example: string) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = displayText;
        const newText = currentText.substring(0, start) + example + currentText.substring(end);
        setDisplayText(newText);
        onChange("body_text", newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + example.length, start + example.length);
        }, 0);
        setShowTemplateTags(false);
    };

    const insertSurveyFunction = (surveyId: string, _surveyTitle: string) => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = displayText;
        const surveyFunction = `survey({{contact_id}}, "${surveyId}")`;
        const newText = currentText.substring(0, start) + surveyFunction + currentText.substring(end);
        setDisplayText(newText);
        onChange("body_text", newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + surveyFunction.length, start + surveyFunction.length);
        }, 0);
        setShowTemplateTags(false);
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
                                    className="absolute right-2 top-2 rounded-md bg-gray-500 px-2 py-4 text-white opacity-80"
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
        const newText = event.target.value;
        setDisplayText(newText);
        onChange("body_text", newText);
    };

    return (
        <div className="flex flex-col items-center">
            <div className="my-1 flex flex-col gap-2 px-2">
                <div className="m-4 flex flex-1 justify-end">
                    <div className="h-[40px]"></div>
                </div>
            </div>
            <h3 className="font-Zilla-Slab text-2xl">Your Campaign Message.</h3>

            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
                <div className="flex flex-col">
                        {renderMediaContent()}
                        <div>
                            <div className="text-sm leading-snug text-gray-700">
                                <textarea
                                    ref={textareaRef}
                                    name="body_text"
                                    className="h-fit w-full cursor-text resize-none rounded-md border-none bg-white pb-2 pl-4 pr-4 pt-2 text-gray-900 outline-none"
                                    style={{ caretColor: "black" }}
                                    rows={5}
                                    value={displayText}
                                    onChange={handleBodyTextChange}
                                />
                            </div>
                            <div className="flex justify-end my-2">
                            </div>
                        </div>
                        {getErrorMessage(mediaFetcher.data?.error) && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {getErrorMessage(mediaFetcher.data?.error)}
                            </div>
                        )}
                        {mediaFetcher.data?.success && mediaFetcher.state === "idle" && (
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
                                {mediaFetcher.data.uploadedFileName
                                    ? "Media uploaded."
                                    : mediaFetcher.data.removedFileName
                                        ? "Media removed."
                                        : "Media updated."}
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="text-sm leading-snug text-gray-700">
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
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Template Tags Button */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowTemplateTags(!showTemplateTags)}
                                        className="text-gray-700 cursor-pointer p-1 rounded hover:bg-gray-200 transition-colors"
                                        title="Insert template tags"
                                    >
                                        <MdTag size={20} />
                                    </button>

                                    {/* Template Tags Dropdown */}
                                    {showTemplateTags && (
                                        <div className="absolute bottom-full right-0 mb-2 w-80 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto z-50">
                                            <div className="p-2 border-b border-gray-200">
                                                <h4 className="text-sm font-semibold text-gray-700">Template Tags</h4>
                                                <p className="text-xs text-gray-500 mb-1">Click to insert contact field placeholders.</p>
                                                <p className="text-xs text-blue-700 mb-1">
                                                    You can combine tags, text, and functions. Try <span className="font-mono">btoa(&#123;&#123;phone&#125;&#125;:&#123;&#123;external_id&#125;&#125;)</span> or <span className="font-mono">survey(&#123;&#123;contact_id&#125;&#125;, "survey-name")</span>!
                                                </p>
                                            </div>
                                            <div className="p-1">
                                                {TEMPLATE_TAGS.map((tag) => (
                                                    <button
                                                        key={tag.key}
                                                        type="button"
                                                        onClick={() => insertTemplateTag(tag.key)}
                                                        className="w-full text-left p-2 hover:bg-gray-100 rounded text-sm transition-colors"
                                                    >
                                                        <div className="font-mono text-blue-600">{tag.key}</div>
                                                        <div className="text-gray-700">{tag.label}</div>
                                                        <div className="text-xs text-gray-500">{tag.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="border-t border-gray-200 mt-2 pt-2 px-2">
                                                <div className="text-xs font-semibold text-gray-700 mb-1">Function Examples</div>
                                                <div className="flex flex-col gap-1">
                                                    {FUNCTION_EXAMPLES.map((ex) => (
                                                        <button
                                                            key={ex.example}
                                                            type="button"
                                                            onClick={() => {
                                                                if ("surveyId" in ex) {
                                                                    insertSurveyFunction((ex as { surveyId: string }).surveyId, (ex as { surveyTitle?: string }).surveyTitle || "");
                                                                } else {
                                                                    insertFunctionExample(ex.example);
                                                                }
                                                            }}
                                                            className="w-full text-left p-2 hover:bg-blue-50 rounded text-xs transition-colors border border-blue-100 mb-1"
                                                        >
                                                            <div className="font-mono text-blue-800">{ex.example}</div>
                                                            <div className="text-gray-700">{ex.label}</div>
                                                            <div className="text-gray-500">{ex.description}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-2">
                                                    <span className="font-semibold">Tip:</span> You can use <span className="font-mono">btoa(...)</span> to base64-encode any combination of tags and text, or <span className="font-mono">survey(...)</span> to generate personalized survey links.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Media Upload Button */}
                                <label htmlFor="add-image" className="text-gray-700 cursor-pointer">
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
                                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                                        <div className="text-xs font-semibold text-blue-800 mb-1">Template Tags Found:</div>
                                        <div className="text-xs text-blue-700">
                                            {foundTags.map((tag, index) => (
                                                <span key={index} className="inline-block mr-2 mb-1 px-2 py-1 bg-blue-100 rounded">
                                                    {tag.key} → {tag.label}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-xs text-green-700 mt-2">
                                            <span className="font-semibold">💡 Tip:</span> Survey links will be automatically generated when messages are sent!
                                        </div>
                                        {/* Survey Link Preview */}
                                        {(() => {
                                            const surveyMatches = displayText.match(/survey\([^)]+\)/g);
                                            if (surveyMatches) {
                                                return (
                                                    <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                                                        <div className="text-xs font-semibold text-green-800 mb-1">Survey Links Preview:</div>
                                                        <div className="text-xs text-green-700 space-y-1">
                                                            {surveyMatches.map((match, index) => {
                                                                // Extract survey ID from the function
                                                                const surveyIdMatch = match.match(/survey\([^,]+,\s*"([^"]+)"/);
                                                                const surveyId = surveyIdMatch ? surveyIdMatch[1] : 'unknown';
                                                                const previewLink = `${window.location.origin}/?q=btoa(contact_id:${surveyId})`;
                                                                
                                                                return (
                                                                    <div key={index} className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs bg-green-100 px-1 rounded">
                                                                            {match}
                                                                        </span>
                                                                        <span>→</span>
                                                                        <span className="text-xs text-green-600">
                                                                            {previewLink}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
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
        </div>
    );
}