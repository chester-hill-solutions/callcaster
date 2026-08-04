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
  return (
    <div className="flex gap-2 overflow-x-auto">
      {selectedImages
        .filter((image): image is string => Boolean(image))
        .map((image, index) => (
          <div
            className="group relative shrink-0 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            key={`${image}-${index}`}
          >
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={`Remove attachment ${index + 1}`}
              onClick={() => onRemove(image)}
              className="absolute right-1 top-1 z-10 size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <MdClose aria-hidden="true" />
            </Button>
            <img
              src={image}
              alt={`Attachment ${index + 1}`}
              className="m-2 max-w-[200px] rounded-md transition-transform group-hover:scale-[1.02]"
            />
          </div>
        ))}
    </div>
  );
}
