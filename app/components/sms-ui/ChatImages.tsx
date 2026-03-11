import { useState } from "react";
import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";

interface ChatImagesProps {
  selectedImages: (string | null)[];
  onRemove: (image: string) => void;
}

export default function ChatImages({
  selectedImages,
  onRemove,
}: ChatImagesProps) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  return (
    <div className="flex gap-2 overflow-x-scroll">
      {selectedImages
        .filter((image): image is string => Boolean(image))
        .map((image, index) => {
          const isHighlighted = highlighted === index;

          return (
            <div
              className="relative"
              key={index}
              onMouseEnter={() => setHighlighted(index)}
              onMouseLeave={() => setHighlighted(null)}
            >
              <Button
                onClick={() => onRemove(image)}
                className={`absolute right-0 z-10 ${!isHighlighted ? "hidden" : ""}`}
              >
                <MdClose />
              </Button>
              <img
                src={image}
                alt={`${index + 1}`}
                style={{
                  maxWidth: "200px",
                  margin: "10px",
                  scale: isHighlighted ? "1.05" : "1",
                }}
              />
            </div>
          );
        })}
    </div>
  );
}