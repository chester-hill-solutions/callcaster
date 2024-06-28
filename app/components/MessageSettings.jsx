import { MdAddAPhoto } from "react-icons/md";
import { useState } from "react";
import { Form, useSubmit } from "@remix-run/react";

export const MessageSettings = ({ pageData, onPageDataChange, workspace_id, selected_id }) => {
    const [eraseVisible, setEraseVisible] = useState({});
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
            method: "POST",
        });
        onPageDataChange({
            ...pageData,
            message_media: pageData.message_media.filter(media => media !== imageId),
            campaignDetails: {
                ...pageData.campaignDetails,
                mediaLinks: pageData.campaignDetails.mediaLinks.filter((_, i) => pageData.message_media[i] !== imageId)
            }
        });
    };

    const handleAddMedia = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("image", file);
        formData.append("workspaceId", workspace_id);
        formData.append("fileName", file.name);
        formData.append("campaignId", selected_id);
        submit(formData, {
            method: "POST",
            encType: "multipart/form-data",
            action: "/api/message_media",
            navigate: false,
        });
    };

    const handleBodyTextChange = (event) => {
        onPageDataChange({
            ...pageData,
            body_text: event.target.value
        });
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
                {pageData.body_text || pageData.message_media ? (
                    <div className="flex flex-col">
                        <div className="flex flex-wrap justify-between">
                            {pageData.campaignDetails.mediaLinks?.length > 0 &&
                                pageData.campaignDetails.mediaLinks.map((img, i) => {
                                    const imageId = pageData.message_media[i];
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
                                                alt={`${imageId}`}
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
                        <div>
                            <Form >
                                <div className="text-sm leading-snug text-gray-700">
                                    <textarea
                                        name="body_text"
                                        className="h-fit w-full cursor-text resize-none border-none bg-transparent pb-2 pl-4 pr-4 pt-2 outline-none"
                                        style={{ caretColor: "black" }}
                                        rows={5}
                                        value={pageData.body_text}
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
                                    {pageData.body_text.length % 140} /{" "}
                                    {Math.max(1, Math.ceil(pageData.body_text.length / 140)) * 140}{" "}
                                    characters
                                </div>
                                <div>
                                    {Math.ceil(pageData.body_text.length / 140)} part
                                    {pageData.body_text.length > 140 ? "s" : ""}
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