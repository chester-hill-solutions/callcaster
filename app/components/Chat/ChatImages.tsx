import { useState } from "react";
import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";

interface MessagesImagesProps {
  selectedImages: (string | null)[];
  onRemove: (image: string) => void;
}

export default function MessagesImages({ selectedImages, onRemove }: MessagesImagesProps) {
    const [highlighted, setHighlighted] = useState<number | null>(null);
    return (<div className="flex gap-2 overflow-x-scroll">
        {selectedImages.filter(Boolean).map((image, i) => {
            const isHighlighted = highlighted === i;
            return (
                <div className="relative" key={i}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseLeave={() => setHighlighted(null)}
                >
                    <Button
                        onClick={() => onRemove(image)}
                        className={`absolute z-10 right-0 ${!isHighlighted ? 'hidden' : ''}`}

                    >
                        <MdClose />
                    </Button>
                    <img

                        src={image}
                        alt={`${i + 1}`}
                        style={{ maxWidth: "200px", margin: "10px", scale: isHighlighted ? '1.05' : '1' }}

                    />
                </div>
            );
        })}
    </div>
    )
}