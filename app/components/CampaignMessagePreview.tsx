import React, { useState, useEffect, Suspense } from "react";
import { Await, useAsyncValue } from "@remix-run/react";
import { Loader2 } from "lucide-react";

export const MessagePreview = ({ details, mediaLinks }) => {
  const [selectedImage, setSelectedImage] = useState(null);

  const closePopover = () => {
    setSelectedImage(null);
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedImage]);

  const clickImage = (e) => {
    setSelectedImage(e.target.src);
  };

  return (
    <div className="flex flex-col items-center py-4">
      <h3 className="font-Zilla-Slab text-xl">Your Campaign Message.</h3>
      <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
        {details.body_text || details.message_media ? (
          <div className="flex flex-wrap justify-between">
            <Suspense
              fallback={
                <div>
                  <Loader2 />
                </div>
              }
            >
              <Await
                resolve={mediaLinks}
                errorElement={<div>Error loading media</div>}
              >
                {mediaLinks?.length > 0 &&
                  mediaLinks.map((img, i) => (
                    <img
                      onClick={clickImage}
                      id={details.message_media[i]}
                      key={details.message_media[i]}
                      src={img}
                      alt={`${details.message_media[i]}`}
                      className="mb-2 rounded-lg"
                      width={"45%"}
                    />
                  ))}
              </Await>
            </Suspense>
            <div className="text-sm leading-snug text-gray-700">
              {details.body_text}
            </div>
            {selectedImage && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="relative max-h-full max-w-full">
                  <img
                    src={selectedImage}
                    alt="Enlarged"
                    className="max-h-full max-w-full rounded-lg p-5"
                  />
                  <button
                    onClick={closePopover}
                    className="absolute right-2 top-2 rounded-full bg-white p-2 text-gray-700 hover:text-gray-900 focus:outline-none"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div>Get started on your campaign message.</div>
          </div>
        )}
      </div>
    </div>
  );
};
