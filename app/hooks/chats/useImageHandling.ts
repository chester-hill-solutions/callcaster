import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { logger } from "@/lib/logger.client";
import type { ImageFetcherData } from "@/lib/chats/types";

export function useImageHandling(workspaceId: string) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const imageFetcher = useFetcher({ key: "images" });

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const data = new FormData();
        data.append("workspaceId", workspaceId);
        data.append("image", file);
        data.append("fileName", file.name);
        imageFetcher.submit(data, {
          action: "/api/message_media",
          method: "POST",
          encType: "multipart/form-data",
        });
      }
    },
    [workspaceId, imageFetcher],
  );

  const handleImageRemove = useCallback((imageUrl: string) => {
    setSelectedImages((prevImages) =>
      prevImages.filter((image) => image !== imageUrl),
    );
  }, []);

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
  };
}
