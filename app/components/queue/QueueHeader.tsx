import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select";
import { FaTimes } from "react-icons/fa";
import type { Audience } from "@/lib/types";

interface QueueHeaderProps {
    totalCount: number;
    isSelectingAudience: boolean;
    selectedAudience: number | null;
    audiences: Audience[];
    selectedCampaignAudienceIds: number[];
    onSelectingAudienceChange: (value: boolean) => void;
    onSelectedAudienceChange: (value: number | null) => void;
    onAddFromAudience: (value: number) => void;
    onAddContact: () => void;
    unfilteredCount: number;
    /** True while the add-from-audience request is in flight; blocks a second submit. */
    isAddingAudience?: boolean;
}

export function QueueHeader({
    unfilteredCount,
    isSelectingAudience,
    selectedAudience,
    audiences,
    selectedCampaignAudienceIds,
    onSelectingAudienceChange,
    onSelectedAudienceChange,
    onAddFromAudience,
    onAddContact,
    isAddingAudience = false,
}: QueueHeaderProps) {
    const selectedAudienceName = audiences.find((audience) => audience?.id === selectedAudience)?.name;
    return (
        <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
                {unfilteredCount} contacts
            </div>
            <div className="flex gap-2">
                {!isSelectingAudience ? (
                    <Button variant="outline" size="sm" onClick={() => onSelectingAudienceChange(true)}>
                        Add from Audience
                    </Button>
                ) : !selectedAudience ? (
                    <Select onValueChange={(value) => onSelectedAudienceChange(Number(value))}>
                        <SelectTrigger aria-label="Select audience to add">
                            <SelectValue placeholder="Select Call list" />
                        </SelectTrigger>
                        <SelectContent>
                            {audiences.map((audience) => audience && (
                                <SelectItem
                                    key={audience.id}
                                    value={audience.id.toString()}
                                    disabled={selectedCampaignAudienceIds.includes(audience.id)}
                                >
                                    {audience.name} {selectedCampaignAudienceIds.includes(audience.id) ?
                                        <span className="text-green-500">Selected</span> : null}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <>
                    
                        <Button
                            variant="outline"
                            className="bg-green-500/20 border-green-500/60 hover:bg-green-500/30"
                            size="sm"
                            disabled={isAddingAudience}
                            onClick={() => onAddFromAudience(selectedAudience)}
                        >
                            {isAddingAudience ? `Adding ${selectedAudienceName}...` : `Add ${selectedAudienceName}`}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isAddingAudience}
                            onClick={() => {
                                onSelectedAudienceChange(null); 
                                onSelectingAudienceChange(false); 
                            }}
                        >
                            <FaTimes className="w-4 h-4" />
                        </Button>
                    </>
                )}
                <Button variant="outline" size="sm" onClick={onAddContact}>
                    Search/Add Contact
                </Button>
            </div>
        </div>
    );
} 