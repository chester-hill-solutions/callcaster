import { Button } from "@/components/ui/button";

interface TopBarProps {
  handleQueueButton: () => void;
  state: string;
  handleNextNumber: (skipHousehold: boolean) => void;
  handleDialNext: () => void;
  handlePowerDial: () => void;
}

const TopBar = ({ handleQueueButton, state, handleNextNumber, handleDialNext, handlePowerDial }: TopBarProps) => (
    <div className="mb-8 flex gap-2 rounded-full border-[3px] border-brand-secondary p-4">
        <Button onClick={handleQueueButton}>
            {state === 'idle' ? 'Load' : 'Loading'}
        </Button>
        <div className="flex gap-2">
            <Button onClick={handlePowerDial} className="opacity-50">
                Predictive Dial
            </Button>
            <Button variant="outline" onClick={handleDialNext} className="border-primary text-primary hover:bg-primary/10 hover:text-primary">
                Dial Next
            </Button>
        </div>
        <div className="flex gap-2">
            <Button onClick={() => handleNextNumber(true)}>
                Skip Household
            </Button>
            <Button variant="outline" onClick={() => handleNextNumber(false)} className="border-primary text-primary hover:bg-primary/10 hover:text-primary">
                Skip Person
            </Button>
        </div>
    </div>
)

export { TopBar }
