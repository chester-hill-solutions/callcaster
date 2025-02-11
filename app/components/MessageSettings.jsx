import { MdAddAPhoto } from "react-icons/md";
import { Suspense, useRef, useState } from "react";
import { Await, Form, useSubmit } from "@remix-run/react";

export const MessageSettings = ({ mediaLinks, details, campaignData, onChange }) => {

    const [eraseVisible, setEraseVisible] = useState({});
    const debounceRef = useRef(null);

    const submit = useSubmit();
    const showErase = (imageId) => {
        setEraseVisible((prevState) => ({
            ...prevState,
            [imageId]: true,
        }));
    };

    const hideErase = (imageId) => {
        setEraseVisible((prevState) => ({
            ...prevState,
            [imageId]: false,
        }));
    };

    const removeImage = (imageId) => {
        const formData = new FormData();
        formData.append("fileName", imageId);
        submit(formData, {
            method: "DELETE",
            action: "/api/message_media",
            navigate: false
        });
        onChange("message_media", campaignData.message_media.filter((img) => img !== imageId));
    };

    const handleAddMedia = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("image", file);
        formData.append("workspaceId", details.workspace);
        formData.append("fileName", file.name);
        formData.append("campaignId", details.campaign_id);
        submit(formData, {
            method: "POST",
            encType: "multipart/form-data",
            action: "/api/message_media",
            navigate: false,
        });
    };
    const renderMediaContent = (resolvedMediaLinks) => {
        if (!details.message_media || !resolvedMediaLinks) return null;

        return (
            <div className="flex flex-wrap justify-between">
                {resolvedMediaLinks.map((img, i) => {
                    const imageId = details.message_media[i];
                    return (
                        <div
                            key={imageId}
                            className="relative mb-2 rounded-lg"
                            style={{ width: "45%" }}
                            onMouseEnter={() => showErase(imageId)}
                            onMouseLeave={() => hideErase(imageId)}
                        >
                            <img
                                id={imageId}
                                src={img}
                                alt={`Campaign media ${i + 1}`}
                                className="w-full rounded-lg"
                            />
                            {eraseVisible[imageId] && (
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

    const handleBodyTextChange = (() => {
        const debounceTimeout = useRef(null);
        return (event) => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }

            debounceTimeout.current = setTimeout(() => {
                onChange("body_text", event.target.value);
            }, 300); // Adjust delay as needed
        };
    })();
    return (
        <div className="flex flex-col items-center">
            <div className="my-1 flex flex-col gap-2 px-2">
                <div className="m-4 flex flex-1 justify-end">
                    <div className="h-[40px]"></div>
                </div>
            </div>
            <h3 className="font-Zilla-Slab text-2xl">Your Campaign Message.</h3>

            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
                {true ? (
                    <div className="flex flex-col">
                        <Suspense fallback={<div>Loading media...</div>}>
                            <Await
                                resolve={mediaLinks}
                                errorElement={<div>Error loading media</div>}
                            >
                                {renderMediaContent}
                            </Await>
                        </Suspense>
                        <div>
                            <Form >
                                <div className="text-sm leading-snug text-gray-700">
                                    <textarea
                                        name="body_text"
                                        className="h-fit w-full cursor-text resize-none border-none bg-transparent pb-2 pl-4 pr-4 pt-2 outline-none"
                                        style={{ caretColor: "black" }}
                                        rows={5}
                                        value={details.body_text}
                                        onChange={handleBodyTextChange}
                                    />
                                </div>
                                <div className="flex justify-end my-2">
                                </div>
                            </Form>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-sm leading-snug text-gray-700">
                                <div>
                                    {(details.body_text?.length || 0) % 140} /{" "}
                                    {Math.max(1, Math.ceil(details.body_text?.length / 140)) * 140}{" "}
                                    character{details.body_text?.length !== 1 && 's'}
                                </div>
                                <div>
                                    {Math.ceil(details.body_text?.length / 140 || 0)} part
                                    {(Math.ceil(details.body_text?.length / 140 || 0)) !== 1 && 's'}
                                </div>
                            </div>
                            <div>
                                <label htmlFor="add-image" className="text-gray-700 cursor-pointer">
                                    <MdAddAPhoto size={24} />
                                </label>
                                <input
                                    type="file"
                                    name="image"
                                    id="add-image"
                                    hidden
                                    onChange={handleAddMedia}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div></div>
                )}
            </div>
        </div>
    )
}