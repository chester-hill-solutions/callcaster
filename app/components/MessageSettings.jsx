import { MdAddAPhoto } from "react-icons/md";
import { useState } from "react";
import { Form } from "@remix-run/react";
export const MessageSettings = ({ pageData, submit, bodyText, setBodyText, workspace_id }) => {
    const [eraseVisible, setEraseVisible] = useState({});

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

    const removeImage = (e) => {
        const formData = new FormData();
        formData.append("fileName", e);
        submit(formData, {
            method: "POST",
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

    return (
        <div className="flex flex-col items-center">
            <div className="my-1 flex flex-col gap-2 px-2">
                <div className="m-4 flex flex-1 justify-end">
                    <div className="h-[40px]"></div>
                </div>
            </div>
            <h3 className="font-Zilla-Slab text-2xl">Your Campaign Message.</h3>

            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
                {pageData[0].body_text || pageData[0].message_media ? (
                    <div className="flex flex-col">
                        <div className="flex flex-wrap justify-between">
                            {pageData[0].campaignDetails.mediaLinks?.length > 0 &&
                                pageData[0].campaignDetails.mediaLinks.map((img, i) => {
                                    const imageId = pageData[0].message_media[i];
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
                            <Form>
                                <div className="text-sm leading-snug text-gray-700">
                                    <textarea
                                        name="body_text"
                                        className="h-fit w-full cursor-text resize-none border-none bg-transparent pb-2 pl-4 pr-4 pt-2 outline-none"
                                        style={{ caretColor: "black" }}
                                        rows={5}
                                        value={bodyText}
                                        onChange={(event) => setBodyText(event.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end my-2">
                                    <button style={{ border: "none", background: '#008800', padding: "4px 8px", borderRadius: "20px", fontSize: "small" }} type="submit">
                                        SAVE
                                    </button>
                                </div>
                            </Form>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-sm leading-snug text-gray-700">
                                <div>
                                    {bodyText.length % 140} /{" "}
                                    {Math.max(1, Math.ceil(bodyText.length / 140)) * 140}{" "}
                                    characters
                                </div>
                                <div>
                                    {Math.ceil(bodyText.length / 140)} part
                                    {bodyText.length > 140 ? "s" : ""}
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